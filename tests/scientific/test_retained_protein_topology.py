from __future__ import annotations

from itertools import pairwise
from math import dist
from pathlib import Path

import pytest
from neistra_core.adapters.macromolecular import PdbAdapter
from neistra_core.editing.model import DirectMolecularEditor, ModelBondDelete, modeling_metadata
from neistra_core.editing.protein import InvalidProteinEditError, PdbfixerProteinEditor
from neistra_core.molecular import Bond, NormalizedStructureV1

FIXTURE = Path(__file__).parents[1] / "fixtures" / "formats" / "protein_editing.pdb"


@pytest.fixture
def protein() -> NormalizedStructureV1:
    return PdbAdapter().parse(FIXTURE.read_bytes(), FIXTURE.name).structures[0]


def cut(before: NormalizedStructureV1, pair: tuple[int, int]) -> NormalizedStructureV1:
    return (
        DirectMolecularEditor()
        .edit(
            before,
            list(pair),
            ModelBondDelete(operation="bond.delete"),
            next_atom_id=max(a.id for a in before.atoms) + 1,
            next_bond_id=max(b.id for b in before.bonds) + 1,
            hydrogen_policy="automatic",
        )
        .edit.structure
    )


@pytest.mark.parametrize("pair", [(6, 7), (7, 8), (3, 6), (8, 10)])
def test_mutation_preserves_authored_backbone_and_peptide_cuts(
    protein: NormalizedStructureV1,
    pair: tuple[int, int],
) -> None:
    before = cut(protein, pair)
    snapshot = before.to_bytes()
    result = PdbfixerProteinEditor().mutate_residue(
        before,
        2,
        "ALA",
        next_atom_id=100,
        next_bond_id=100,
    )
    after = result.structure
    retained_ids = {a.id for a in before.atoms} & {a.id for a in after.atoms}
    assert [b for b in after.bonds if {b.atom_1_id, b.atom_2_id} <= retained_ids] == before.bonds
    assert modeling_metadata(after).excluded_bonds == [pair]
    assert all({b.atom_1_id, b.atom_2_id} != set(pair) for b in after.bonds)
    assert [a for a in after.atoms if a.id in retained_ids] == before.atoms
    assert after.conformers[0].coordinates[: len(before.atoms)] == before.active_coordinates
    warnings = [w for w in result.warnings if w.code == "protein_retained_connectivity_unresolved"]
    assert len(warnings) == 1
    for atom_id in pair:
        assert f"atom {atom_id} (" in warnings[0].message
    assert "residue 2 (GLY 2) of chain 'A'" in warnings[0].message
    assert warnings[0] in after.warnings
    assert before.to_bytes() == snapshot
    assert NormalizedStructureV1.from_bytes(after.to_bytes()) == after


def test_unrelated_cut_and_existing_assigned_bond_records_remain_exact(
    protein: NormalizedStructureV1,
) -> None:
    before = cut(protein, (16, 17))
    before = before.model_copy(
        update={
            "bonds": [
                b.model_copy(update={"order": 2.0, "aromatic": False, "inferred": False})
                if {b.atom_1_id, b.atom_2_id} == {8, 9}
                else b
                for b in before.bonds
            ]
        }
    )
    result = PdbfixerProteinEditor().mutate_residue(
        before,
        2,
        "ALA",
        next_atom_id=100,
        next_bond_id=100,
    )
    assert all(b in result.structure.bonds for b in before.bonds)
    assert modeling_metadata(result.structure).excluded_bonds == [(16, 17)]
    assert not any(w.code == "protein_retained_connectivity_unresolved" for w in result.warnings)


def test_sparse_current_edges_are_not_recreated_without_an_exclusion_record(
    protein: NormalizedStructureV1,
) -> None:
    before = protein.model_copy(
        update={"bonds": [b for b in protein.bonds if {b.atom_1_id, b.atom_2_id} != {6, 7}]}
    )
    result = PdbfixerProteinEditor().mutate_residue(
        before,
        2,
        "ALA",
        next_atom_id=100,
        next_bond_id=100,
    )
    assert all({b.atom_1_id, b.atom_2_id} != {6, 7} for b in result.structure.bonds)
    assert any(w.code == "protein_retained_connectivity_unresolved" for w in result.warnings)


def test_legitimate_new_proline_sidechain_closes_through_new_atoms(
    protein: NormalizedStructureV1,
) -> None:
    result = PdbfixerProteinEditor().mutate_residue(
        protein,
        2,
        "PRO",
        next_atom_id=100,
        next_bond_id=100,
    )
    names = {a.name: a.id for a in result.structure.atoms if a.residue_id == 2}
    pairs = {frozenset((b.atom_1_id, b.atom_2_id)) for b in result.structure.bonds}
    expected_cycle = ["N", "CA", "CB", "CG", "CD", "N"]
    for first, second in pairwise(expected_cycle):
        assert frozenset((names[first], names[second])) in pairs
    assert names["CD"] in result.created_atom_ids


@pytest.mark.parametrize("name,wrong", [("N", "C"), ("CA", "P"), ("C", "N"), ("O", "S")])
def test_template_element_contradiction_is_precise_and_refuses_before_compute(
    protein: NormalizedStructureV1,
    name: str,
    wrong: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = next(a for a in protein.atoms if a.residue_id == 2 and a.name == name)
    before = protein.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"element": wrong}) if a.id == target.id else a
                for a in protein.atoms
            ]
        }
    )
    snapshot = before.to_bytes()

    def unexpected_fixer(*args: object) -> None:
        pytest.fail("Contradictory template identity reached expensive computation")

    monkeypatch.setattr(PdbfixerProteinEditor, "_fixer", unexpected_fixer)
    with pytest.raises(InvalidProteinEditError) as refusal:
        PdbfixerProteinEditor().mutate_residue(
            before,
            2,
            "ALA",
            next_atom_id=100,
            next_bond_id=100,
        )
    message = str(refusal.value)
    assert f"atom {target.id} ({name})" in message
    assert "residue 2 (GLY 2)" in message and "chain 'A'" in message
    assert f"current element is {wrong}" in message
    assert before.to_bytes() == snapshot


def test_missing_oxygen_still_uses_the_historical_template_addition(
    protein: NormalizedStructureV1,
) -> None:
    before = PdbfixerProteinEditor().delete_atoms(protein, [9]).structure
    result = PdbfixerProteinEditor().mutate_residue(
        before,
        2,
        "ALA",
        next_atom_id=100,
        next_bond_id=100,
    )
    oxygen = next(a for a in result.structure.atoms if a.residue_id == 2 and a.name == "O")
    assert oxygen.id in result.created_atom_ids and oxygen.element == "O"
    assert any({b.atom_1_id, b.atom_2_id} == {8, oxygen.id} for b in result.structure.bonds)
    assert any(w.code == "missing_template_atoms_added" for w in result.warnings)


@pytest.mark.parametrize("source", ["ARG", "GLN", "GLU", "LYS"])
@pytest.mark.parametrize("condition", ["ordinary", "excluded", "existing"])
def test_retained_proline_closure_distinguishes_new_target_edge_from_authored_intent(
    protein: NormalizedStructureV1,
    source: str,
    condition: str,
) -> None:
    editor = PdbfixerProteinEditor()
    before = editor.mutate_residue(
        protein,
        2,
        source,
        next_atom_id=100,
        next_bond_id=100,
    ).structure
    named = {a.name: a for a in before.atoms if a.residue_id == 2}
    pair = tuple(sorted((named["N"].id, named["CD"].id)))
    existing = Bond(
        id=1000,
        atom_1_id=pair[0],
        atom_2_id=pair[1],
        order=1.0,
        inferred=False,
    )
    if condition == "excluded":
        before = cut(before, (pair[0], pair[1]))
    elif condition == "existing":
        before = before.model_copy(update={"bonds": [*before.bonds, existing]})
    snapshot = before.to_bytes()
    result = editor.mutate_residue(
        before,
        2,
        "PRO",
        next_atom_id=2000,
        next_bond_id=2000,
    )
    after = result.structure
    matching = [b for b in after.bonds if {b.atom_1_id, b.atom_2_id} == set(pair)]
    retained = {a.id: a for a in before.atoms}
    assert all(a == retained[a.id] for a in after.atoms if a.id in retained)
    assert not result.created_atom_ids
    if condition == "excluded":
        assert not matching
        assert pair in modeling_metadata(after).excluded_bonds
        assert any(w.code == "protein_retained_connectivity_unresolved" for w in result.warnings)
    elif condition == "existing":
        assert matching == [existing]
        assert not result.created_bond_ids
    else:
        assert len(matching) == 1
        assert matching[0].id == 2000 and matching[0].inferred and matching[0].order is None
        assert matching[0].id in after.inferences[-1].bond_ids
        warning = next(w for w in result.warnings if w.code == "protein_retained_proline_closure")
        assert (
            f"{dist(named['N'].coordinates, named['CD'].coordinates):.3f} angstrom"
            in warning.message
        )
        assert "Retained coordinates were not moved" in warning.message
        assert "chain 'A'" in warning.message
    assert before.to_bytes() == snapshot

    inverse = editor.mutate_residue(
        after,
        2,
        source,
        next_atom_id=3000,
        next_bond_id=3000,
    )
    inverse_matching = [
        b for b in inverse.structure.bonds if {b.atom_1_id, b.atom_2_id} == set(pair)
    ]
    assert inverse_matching == matching
    conflicts = [w for w in inverse.warnings if w.code == "protein_target_topology_conflict"]
    assert bool(conflicts) == (condition != "excluded")
    if conflicts:
        assert f"not a standard {source} topology" in conflicts[0].message
    for name in ["N", "CA", "C", "O", "CB", "CG", "CD"]:
        atom = next(a for a in inverse.structure.atoms if a.residue_id == 2 and a.name == name)
        assert atom.id == named[name].id and atom.coordinates == named[name].coordinates
