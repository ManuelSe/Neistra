"""Independent supplied-chemistry and frozen-coordinate expectations for issue #55."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

import numpy as np
import pytest
from molweave_core.adapters.base import ImportOptions
from molweave_core.adapters.defaults import create_default_registry
from molweave_core.interactions import InteractionType, analyze_interactions
from molweave_core.molecular import NormalizedStructureV1

from tests.unit.test_interactions import source

FIXTURES = Path(__file__).parents[1] / "fixtures" / "interactions"


def load(name: str) -> NormalizedStructureV1:
    return (
        create_default_registry()
        .for_filename(name)
        .parse((FIXTURES / name).read_bytes(), name, ImportOptions())
        .structures[0]
    )


def test_frozen_reference_and_supplied_fixture_checksums() -> None:
    manifest = json.loads((FIXTURES / "qualification.json").read_text())
    for name, expected in manifest["sha256"].items():
        assert hashlib.sha256((FIXTURES / name).read_bytes()).hexdigest() == expected


@pytest.mark.parametrize(
    "kind,groups,endpoints",
    [
        ("hydrogen_bond", [[2, 1], [3]], [(1, 0, 0), (2.8, 0, 0)]),
        ("hydrophobic", [[5], [7]], [(10, 0, 0), (14, 0, 0)]),
        ("pi_pi", [list(range(9, 15)), list(range(15, 21))], [(0, 12, 0), (0, 12, 3.5)]),
        ("cation_pi", [[27], list(range(21, 27))], [(12, 12, 4), (12, 12, 0)]),
        ("salt_bridge", [[32], [37, 39]], [(24, 0, 0), (27.4, 0.6, 0)]),
        ("clash", [[41], [42]], [(24, 12, 0), (26.8, 12, 0)]),
    ],
)
def test_six_types_have_independent_participants_and_endpoints(
    kind: InteractionType, groups: list[list[int]], endpoints: list[tuple[float, float, float]]
) -> None:
    structure = load("six_types.mol")
    before = structure.to_bytes()
    records = analyze_interactions([source(structure)]).records
    record = next(
        r
        for r in records
        if r.kind == kind and [[ref.atom_id for ref in group] for group in r.participants] == groups
    )
    assert record.scope == "inter"
    np.testing.assert_allclose(record.endpoints, endpoints, atol=1e-6, rtol=0)
    assert structure.to_bytes() == before


def test_independent_combined_counts_and_overlap_without_category_precedence() -> None:
    structure = load("six_types.mol")
    result = analyze_interactions([source(structure)])
    # Two six-member rings contribute 6 aligned and 12 adjacent hydrophobic
    # carbon pairs at <=4 Å; the independent ethane pair contributes one.
    assert Counter((r.kind, r.scope) for r in result.records) == {
        ("hydrogen_bond", "inter"): 2,
        ("hydrophobic", "inter"): 19,
        ("pi_pi", "inter"): 1,
        ("cation_pi", "inter"): 1,
        ("salt_bridge", "inter"): 1,
        ("clash", "inter"): 1,
        ("clash", "intra"): 3,
        ("hydrophobic", "intra"): 3,
    }
    # Methylammonium N32-H34 to acetate O37 qualifies independently as H bond
    # and as ionic group contact; it must not be spuriously called a clash.
    assert any(
        r.kind == "hydrogen_bond" and r.participants[0][0].atom_id == 34 for r in result.records
    )
    assert not any(
        r.kind == "clash"
        and {32, 34, 37}.issuperset(ref.atom_id for group in r.participants for ref in group)
        for r in result.records
    )
    assert result == analyze_interactions([source(structure)])


def test_neutral_tertiary_amine_does_not_acquire_quaternary_charge() -> None:
    structure = load("six_types.mol")
    keep = [i for i, atom in enumerate(structure.atoms) if atom.id != 31]
    neutral = structure.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"formal_charge": 0}) if atom.id == 27 else atom
                for atom in structure.atoms
                if atom.id != 31
            ],
            "bonds": [
                bond for bond in structure.bonds if 31 not in (bond.atom_1_id, bond.atom_2_id)
            ],
            "conformers": [
                c.model_copy(update={"coordinates": [c.coordinates[i] for i in keep]})
                for c in structure.conformers
            ],
        }
    )
    result = analyze_interactions([source(neutral)])
    assert not any(r.kind == "cation_pi" for r in result.records)
    assert not any(w.code == "invalid_chemistry" for w in result.warnings)


def test_neutral_carboxylic_acid_is_not_a_salt_bridge() -> None:
    structure = load("six_types.mol")
    neutral = structure.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"formal_charge": 0}) if atom.id == 39 else atom
                for atom in structure.atoms
            ]
        }
    )
    result = analyze_interactions([source(neutral)])
    assert not any(r.kind == "salt_bridge" for r in result.records)
    assert not any(w.code == "invalid_chemistry" for w in result.warnings)


def test_2reg_reference_matches_independent_ring_geometry_and_fixed_cutoff() -> None:
    receptor, choline = load("2reg-receptor.pdb"), load("2reg-choline.mol")
    before = (receptor.to_bytes(), choline.to_bytes())
    result = analyze_interactions([source(receptor, "receptor"), source(choline, "choline")])
    contacts = [r for r in result.records if r.kind == "cation_pi"]
    assert len(contacts) == 7  # Separate complete five/six-member Trp rings.
    atoms = {atom.id: atom for atom in receptor.atoms}
    residues = {residue.id: residue for residue in receptor.residues}
    partners = set()
    charge = np.asarray(choline.active_coordinates[6])
    for record in contacts:
        assert [(ref.structure_id, ref.atom_id) for ref in record.participants[0]] == [
            ("choline", 7)
        ]
        ring = [atoms[ref.atom_id] for ref in record.participants[1]]
        partners.add(residues[ring[0].residue_id].author_number)  # type: ignore[index]
        points = np.asarray([atom.coordinates for atom in ring])
        center = points.mean(axis=0)
        # Independent least-squares normal: smallest eigenvector of covariance.
        _, vectors = np.linalg.eigh((points - center).T @ (points - center))
        normal = vectors[:, 0]
        vector = charge - center
        distance = float(np.linalg.norm(vector))
        offset = float(np.linalg.norm(np.cross(vector, normal)))
        normal_angle = float(np.degrees(np.arccos(abs(vector @ normal) / distance)))
        assert record.geometry["distance"] == pytest.approx(distance)
        assert record.geometry["offset"] == pytest.approx(offset)
        assert record.geometry["normal_angle"] == pytest.approx(normal_angle)
        np.testing.assert_allclose(record.endpoints, [charge, center], rtol=0, atol=1e-12)
    assert partners == {43, 90, 119, 205}
    acid_sites = [
        np.asarray(atom.coordinates) for atom in receptor.atoms if atom.name in {"OD1", "OD2"}
    ]
    assert min(np.linalg.norm(charge - point) for point in acid_sites) == pytest.approx(
        4.716, abs=0.001
    )
    assert not any(r.kind == "salt_bridge" for r in result.records)
    assert any(w.code == "explicit_hydrogens_required" for w in result.warnings)
    assert any(w.code == "conventional_sidechain_charge" for w in result.warnings)
    assert (receptor.to_bytes(), choline.to_bytes()) == before
    assert result == analyze_interactions(
        [source(choline, "choline"), source(receptor, "receptor")]
    )


@pytest.mark.parametrize("height,expected", [(6.0, 1), (6.0001, 0)])
def test_quaternary_charge_center_distance_boundary(height: float, expected: int) -> None:
    structure = load("six_types.mol")
    points = [
        (x, y, z + height - 4 if 27 <= atom.id <= 31 else z)
        for atom, (x, y, z) in zip(structure.atoms, structure.active_coordinates, strict=True)
    ]
    moved = structure.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"coordinates": point})
                for atom, point in zip(structure.atoms, points, strict=True)
            ],
            "conformers": [structure.conformers[0].model_copy(update={"coordinates": points})],
        }
    )
    assert (
        sum(r.kind == "cation_pi" for r in analyze_interactions([source(moved)]).records)
        == expected
    )


def test_reference_derivatives_preserve_observed_coordinates_and_explicit_choline_graph() -> None:
    lines = (FIXTURES / "2reg-original.pdb").read_text().splitlines()
    original = {
        (int(line[22:26]), line[12:16].strip()): tuple(
            float(line[start : start + 8]) for start in (30, 38, 46)
        )
        for line in lines
        if line.startswith(("ATOM  ", "HETATM")) and line[21] == "A"
    }
    receptor = load("2reg-receptor.pdb")
    residues = {r.id: r for r in receptor.residues}
    for atom in receptor.atoms:
        assert atom.residue_id is not None
        assert atom.coordinates == original[(residues[atom.residue_id].author_number, atom.name)]
    choline = load("2reg-choline.mol")
    names = ["C4", "C5", "C6", "C7", "C8", "O6", "N1"]
    assert [atom.coordinates for atom in choline.atoms] == [original[(1, name)] for name in names]
    assert [atom.formal_charge for atom in choline.atoms] == [0, 0, 0, 0, 0, 0, 1]
    assert {frozenset((b.atom_1_id, b.atom_2_id)) for b in choline.bonds} == {
        frozenset(pair) for pair in [(1, 2), (1, 6), (2, 7), (3, 7), (4, 7), (5, 7)]
    }
    assert all(b.order == 1 for b in choline.bonds)
