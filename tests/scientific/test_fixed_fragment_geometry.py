from __future__ import annotations

from collections import Counter
from functools import lru_cache
from itertools import combinations
from typing import Any

import numpy as np
import pytest
from neistra_core.adapters.rdkit_common import normalized_to_mol
from neistra_core.editing.fragments import FragmentName, fragment_template
from neistra_core.editing.model import DirectMolecularEditor, InvalidModelEdit, ModelFragmentAdd
from neistra_core.editing.placement import place_fragment
from neistra_core.molecular import Conformer, NormalizedStructureV1
from pydantic import ValidationError
from rdkit import Chem
from rdkit.Chem.rdMolDescriptors import CalcMolFormula

from tests.support.hydrogen_fixture import model

PROFILES: dict[FragmentName, tuple[int, int, str, str]] = {
    "cyclopropyl": (3, 5, "CC1CC1.O", "C4H10O"),
    "cyclobutyl": (4, 7, "CC1CCC1.O", "C5H12O"),
    "cyclopentyl": (5, 9, "CC1CCCC1.O", "C6H14O"),
    "cyclohexyl": (6, 11, "CC1CCCCC1.O", "C7H16O"),
    "methoxy": (1, 3, "COC.O", "C2H8O2"),
}


@lru_cache(maxsize=1)
def parent() -> NormalizedStructureV1:
    before = model("C.O")
    oxygen_members = {2} | {
        i
        for b in before.bonds
        if 2 in {b.atom_1_id, b.atom_2_id}
        for i in (b.atom_1_id, b.atom_2_id)
    }
    points = np.asarray(before.active_coordinates)
    for index, atom in enumerate(before.atoms):
        if atom.id in oxygen_members:
            points[index] += [12, 0, 0]
    transforms = [
        (1, np.eye(3), np.zeros(3)),
        (7, np.asarray([[0, -1, 0], [1, 0, 0], [0, 0, 1]]), np.asarray([7, -4, 3])),
        (19, np.asarray([[0, 0, 1], [0, 1, 0], [-1, 0, 0]]), np.asarray([-4, 8, 2])),
    ]
    frames = [
        Conformer(id=i, name=f"Frame {i}", coordinates=[tuple(row) for row in points @ r.T + t])
        for i, r, t in transforms
    ]
    return before.model_copy(
        update={
            "conformers": frames,
            "active_conformer_id": 7,
            "atoms": [
                a.model_copy(update={"coordinates": frames[1].coordinates[n]})
                for n, a in enumerate(before.atoms)
            ],
        }
    )


@lru_cache(maxsize=5)
def template_invariants(fragment: FragmentName) -> tuple[Any, tuple[int, ...], float]:
    template = fragment_template(fragment)
    cap = template.GetAtomWithIdx(0)
    removed = {0, *[a.GetIdx() for a in cap.GetNeighbors() if a.GetSymbol() == "H"]}
    points = np.asarray(
        [
            tuple(template.GetConformer().GetAtomPosition(a.GetIdx()))
            for a in template.GetAtoms()
            if a.GetIdx() not in removed
        ]
    )
    distances = np.linalg.norm(points[:, None, :] - points[None, :, :], axis=2)
    quad = max(
        combinations(range(len(points)), 4),
        key=lambda q: abs(
            float(
                np.linalg.det(
                    points[list(q)[1:]] - points[q[0]],
                )
            )
        ),
    )
    volume = float(np.linalg.det(points[list(quad)[1:]] - points[quad[0]]))
    assert abs(volume) > 1e-3
    return distances, quad, volume


@pytest.mark.parametrize("fragment", PROFILES)
@pytest.mark.parametrize("replace_h", [False, True])
@pytest.mark.parametrize("direction", range(6))
@pytest.mark.parametrize("rotation", range(6))
def test_final_automatic_fragment_graph_hydrogens_and_rigid_geometry(
    fragment: FragmentName,
    replace_h: bool,
    direction: int,
    rotation: int,
) -> None:
    before = parent()
    snapshot = before.to_bytes()
    atom_map = {a.id: a for a in before.atoms}
    parent_hydrogens = sorted(
        i
        for b in before.bonds
        if 1 in {b.atom_1_id, b.atom_2_id}
        for i in (b.atom_1_id, b.atom_2_id)
        if atom_map[i].element == "H"
    )
    selected = parent_hydrogens[0] if replace_h else 1
    result = DirectMolecularEditor().edit(
        before,
        [selected],
        ModelFragmentAdd(
            operation="fragment.attach", fragment=fragment, direction=direction, rotation=rotation
        ),
        next_atom_id=1000,
        next_bond_id=1000,
        hydrogen_policy="automatic",
    )
    after = result.edit.structure
    created = set(result.edit.created_atom_ids)
    carbons, hydrogens, expected_smiles, formula = PROFILES[fragment]
    expected_elements = Counter({"C": carbons, "H": hydrogens})
    if fragment == "methoxy":
        expected_elements["O"] = 1
    assert Counter(a.element for a in after.atoms if a.id in created) == expected_elements
    links = [b for b in after.bonds if len({b.atom_1_id, b.atom_2_id} & created) == 1]
    assert len(links) == 1
    link = links[0]
    assert link.order == 1 and not link.aromatic
    root_id = next(i for i in (link.atom_1_id, link.atom_2_id) if i in created)
    assert {link.atom_1_id, link.atom_2_id} == {1, root_id}
    new_map = {a.id: a for a in after.atoms}
    root_h = [
        i
        for b in after.bonds
        if root_id in {b.atom_1_id, b.atom_2_id}
        for i in (b.atom_1_id, b.atom_2_id)
        if new_map[i].element == "H"
    ]
    assert len(root_h) == (0 if fragment == "methoxy" else 1)
    parent_h = [
        i
        for b in after.bonds
        if 1 in {b.atom_1_id, b.atom_2_id}
        for i in (b.atom_1_id, b.atom_2_id)
        if new_map[i].element == "H"
    ]
    assert len(parent_h) == 3
    if fragment != "methoxy":
        carbon_ids = {a.id for a in after.atoms if a.id in created and a.element == "C"}
        ring_bonds = [b for b in after.bonds if {b.atom_1_id, b.atom_2_id} <= carbon_ids]
        assert len(ring_bonds) == carbons
        for carbon_id in carbon_ids:
            assert sum(carbon_id in {b.atom_1_id, b.atom_2_id} for b in ring_bonds) == 2
            assert all(b.order == 1 and not b.aromatic for b in ring_bonds)
    molecule = normalized_to_mol(after)
    Chem.SanitizeMol(molecule)
    assert Chem.MolToSmiles(Chem.RemoveHs(molecule)) == Chem.MolToSmiles(
        Chem.MolFromSmiles(expected_smiles)
    )
    assert CalcMolFormula(molecule) == formula
    assert all(a.GetNumImplicitHs() == 0 for a in molecule.GetAtoms())
    distances, quad, volume = template_invariants(fragment)
    for old, new in zip(before.conformers, after.conformers, strict=True):
        points = np.asarray(
            [new.coordinates[n] for n, a in enumerate(after.atoms) if a.id in created]
        )
        assert np.isfinite(points).all()
        actual_distances = np.linalg.norm(points[:, None, :] - points[None, :, :], axis=2)
        np.testing.assert_allclose(actual_distances, distances, rtol=0, atol=1e-10)
        assert np.linalg.det(points[list(quad)[1:]] - points[quad[0]]) == pytest.approx(
            volume, abs=1e-10
        )
        for index, atom in enumerate(before.atoms):
            if atom.element != "H":
                current_index = next(n for n, a in enumerate(after.atoms) if a.id == atom.id)
                assert new.coordinates[current_index] == old.coordinates[index]
    assert result.hydrogen_reconciliation_report is not None
    for site in result.hydrogen_reconciliation_report.sites:
        if site.atom_id in created:
            assert site.status == "unchanged" and site.geometry is None
            assert not (
                site.added_hydrogen_ids or site.removed_hydrogen_ids or site.moved_hydrogen_ids
            )
    assert all(a == atom_map[a.id] for a in after.atoms if a.id in atom_map and a.element != "H")
    assert before.to_bytes() == snapshot
    assert NormalizedStructureV1.from_bytes(after.to_bytes()) == after


def test_fragment_action_has_no_client_geometry_trust_flag() -> None:
    with pytest.raises(ValidationError, match="Extra inputs"):
        ModelFragmentAdd.model_validate(
            {
                "operation": "fragment.attach",
                "fragment": "cyclopropyl",
                "qualified_fragment_atom_ids": [1000],
            }
        )


@pytest.mark.parametrize("fragment", ["amino", "hydroxyl"])
def test_existing_conjugated_heteroatom_templates_keep_ordinary_planar_hydrogen_maintenance(
    fragment: FragmentName,
) -> None:
    before = model("CC=O")
    result = DirectMolecularEditor().edit(
        before,
        [2],
        ModelFragmentAdd(operation="fragment.attach", fragment=fragment),
        next_atom_id=1000,
        next_bond_id=1000,
        hydrogen_policy="automatic",
    )
    assert result.hydrogen_reconciliation_report is not None
    site = next(s for s in result.hydrogen_reconciliation_report.sites if s.atom_id == 1000)
    assert site.status == "complete" and site.geometry == "trigonal_planar"
    assert site.moved_hydrogen_ids
    if fragment == "amino":
        after = result.edit.structure
        indices = {a.id: n for n, a in enumerate(after.atoms)}
        root = np.asarray(after.active_coordinates[indices[1000]])
        neighbor_ids = [
            i
            for b in after.bonds
            if 1000 in {b.atom_1_id, b.atom_2_id}
            for i in (b.atom_1_id, b.atom_2_id)
            if i != 1000
        ]
        vectors = np.asarray([after.active_coordinates[indices[i]] for i in neighbor_ids]) - root
        assert abs(float(np.linalg.det(vectors))) < 1e-10


def translated_parent(offset: float, *, count: int | None = None) -> NormalizedStructureV1:
    before = parent()
    source_frames = before.conformers if count is None else [before.conformers[1]] * count
    offset_vector = np.asarray([offset, -offset, offset])
    frames = [
        Conformer(
            id=c.id if count is None else n + 1,
            name=f"Translated {n}",
            coordinates=[
                tuple(np.asarray(row) + offset_vector) for row in c.coordinates
            ],
        )
        for n, c in enumerate(source_frames)
    ]
    active = next(c for c in frames if c.id == 7)
    return before.model_copy(
        update={
            "conformers": frames,
            "atoms": [
                a.model_copy(update={"coordinates": active.coordinates[n]})
                for n, a in enumerate(before.atoms)
            ],
        }
    )


@pytest.mark.parametrize("offset", [1e9, 1e15])
def test_large_world_coordinates_warn_about_precision_without_refitting_template_h(
    offset: float,
) -> None:
    before = translated_parent(offset)
    selected = next(a.id for a in before.atoms if a.element == "H")
    construction = place_fragment(
        before,
        [selected],
        fragment="cyclopropyl",
        direction=0,
        rotation=0,
        next_atom_id=1000,
        next_bond_id=1000,
    )
    result = DirectMolecularEditor().edit(
        before,
        [selected],
        ModelFragmentAdd(operation="fragment.attach", fragment="cyclopropyl"),
        next_atom_id=1000,
        next_bond_id=1000,
        hydrogen_policy="automatic",
    )
    actual = result.edit.structure
    for built, final in zip(construction.structure.conformers, actual.conformers, strict=True):
        assert [
            built.coordinates[n] for n, a in enumerate(construction.structure.atoms) if a.id >= 1000
        ] == [final.coordinates[n] for n, a in enumerate(actual.atoms) if a.id >= 1000]
    assert any(w.code == "model_fragment_precision_limited" for w in result.edit.warnings)
    assert any("precision-limited and unoptimized" in w.message for w in result.edit.warnings)
    assert result.hydrogen_reconciliation_report is not None
    assert all(
        s.status == "unchanged" and s.geometry is None
        for s in result.hydrogen_reconciliation_report.sites
        if s.atom_id >= 1000
    )


def test_precision_details_are_bounded_with_all_frame_counts() -> None:
    before = translated_parent(1e9, count=101)
    selected = next(a.id for a in before.atoms if a.element == "H")
    result = DirectMolecularEditor().edit(
        before,
        [selected],
        ModelFragmentAdd(operation="fragment.attach", fragment="cyclopropyl"),
        next_atom_id=1000,
        next_bond_id=1000,
        hydrogen_policy="automatic",
    )
    details = [w for w in result.edit.warnings if w.code == "model_fragment_precision_limited"]
    summary = next(w for w in result.edit.warnings if w.code == "model_fragment_precision_summary")
    assert len(details) == 100
    assert "all 101 conformers: 101 precision-limited frames" in summary.message
    assert "Showing 100 details; 1 details omitted" in summary.message


def test_unrepresentable_precision_collapse_is_an_atomic_refusal() -> None:
    before = translated_parent(1e17)
    snapshot = before.to_bytes()
    selected = next(a.id for a in before.atoms if a.element == "H")
    with pytest.raises(InvalidModelEdit, match="precision collapsed"):
        DirectMolecularEditor().edit(
            before,
            [selected],
            ModelFragmentAdd(operation="fragment.attach", fragment="cyclopropyl"),
            next_atom_id=1000,
            next_bond_id=1000,
            hydrogen_policy="automatic",
        )
    assert before.to_bytes() == snapshot


def test_parent_attachment_still_adds_missing_hydrogens_independently_of_template_ownership() -> (
    None
):
    before = model("C", remove_h_on={1})
    result = DirectMolecularEditor().edit(
        before,
        [1],
        ModelFragmentAdd(operation="fragment.attach", fragment="cyclopropyl"),
        next_atom_id=1000,
        next_bond_id=1000,
        hydrogen_policy="automatic",
    )
    assert result.hydrogen_reconciliation_report is not None
    parent_site = next(s for s in result.hydrogen_reconciliation_report.sites if s.atom_id == 1)
    assert len(parent_site.added_hydrogen_ids) == 3 and parent_site.status == "complete"
    assert all(i > 1007 for i in parent_site.added_hydrogen_ids)
    molecule = normalized_to_mol(result.edit.structure)
    Chem.SanitizeMol(molecule)
    assert CalcMolFormula(molecule) == "C4H8"
    assert Chem.MolToSmiles(Chem.RemoveHs(molecule)) == "CC1CC1"
