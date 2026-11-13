"""Every edit path retains deliberate current-connectivity deletions."""

from itertools import combinations

import pytest
from neistra_core.editing.ligand import InvalidLigandEditError, RdkitLigandEditor
from neistra_core.editing.model import (
    DirectMolecularEditor,
    InvalidModelEdit,
    ModelBondDelete,
    ModelBondSet,
)
from neistra_core.editing.protein import InvalidProteinEditError, PdbfixerProteinEditor
from neistra_core.editing.selection import (
    BondDelete,
    InvalidSelectionEdit,
    SelectionMolecularEditor,
    component_projection,
)
from neistra_core.modeling_metadata import (
    MODELING_METADATA,
    InvalidModelingMetadata,
    ModelingMetadata,
    modeling_metadata,
    project_modeling_metadata,
    update_bond_exclusions,
)

from tests.support.editing_fixture import prepared_complex
from tests.support.minimization import molecule


def test_legacy_ligand_delete_and_readd_retain_exact_current_intent():
    before = molecule(explicit_h=False)
    original = before.to_bytes()
    editor = RdkitLigandEditor()
    deleted = editor.delete_bond(before, before.bonds[0].id).structure
    assert modeling_metadata(deleted).excluded_bonds == [(1, 2)]
    assert before.to_bytes() == original
    restored = editor.add_bond(
        deleted, bond_id=100, atom_1_id=1, atom_2_id=2, order=1.0
    ).structure
    assert modeling_metadata(restored).excluded_bonds == []
    assert restored.source == before.source
    assert restored.conformers == before.conformers
    assert type(before).from_bytes(deleted.to_bytes()) == deleted


def test_direct_inferred_edge_exclusion_and_explicit_restore():
    before = molecule(explicit_h=False)
    before = before.model_copy(update={"bonds": before.bonds[1:]})
    editor = DirectMolecularEditor()
    deleted = editor.edit(
        before, [1, 2], ModelBondDelete(operation="bond.delete"),
        next_atom_id=100, next_bond_id=100,
    ).edit.structure
    assert modeling_metadata(deleted).excluded_bonds == [(1, 2)]
    restored = editor.edit(
        deleted, [1, 2], ModelBondSet(operation="bond.set", order=1.0),
        next_atom_id=100, next_bond_id=100,
    ).edit.structure
    assert modeling_metadata(restored).excluded_bonds == []


def test_selection_delete_records_retained_endpoint_pair():
    before = molecule(explicit_h=False)
    result = SelectionMolecularEditor().edit(
        before, [1, 2], BondDelete(operation="bond.delete"),
        next_atom_id=100, next_bond_id=100,
    ).edit.structure
    assert modeling_metadata(result).excluded_bonds == [(1, 2)]
    assert not any({b.atom_1_id, b.atom_2_id} == {1, 2} for b in result.bonds)


def test_removed_atoms_prune_exclusions_without_reusing_atom_identity():
    before = molecule("CCCO", explicit_h=False)
    before = before.model_copy(update={
        "metadata": {MODELING_METADATA: {"schema_version": 1, "excluded_bonds": [[1, 4]]}}
    })
    result = RdkitLigandEditor().delete_atoms(before, [4]).structure
    assert modeling_metadata(result).excluded_bonds == []
    assert [a.id for a in result.atoms] == [1, 2, 3]


@pytest.mark.parametrize("payload", [
    {"schema_version": 2, "excluded_bonds": []},
    {"schema_version": 1, "excluded_bonds": [[1, 100]]},
    {"schema_version": 1, "excluded_bonds": [[1, 1]]},
    {"schema_version": 1, "excluded_bonds": [[True, 3]]},
    {"schema_version": 1, "excluded_bonds": [[1, 2]]},
])
def test_invalid_or_contradictory_metadata_refuses_all_edit_paths(payload):
    source = molecule(explicit_h=False)
    source = source.model_copy(update={"metadata": {MODELING_METADATA: payload}})
    original = source.to_bytes()
    with pytest.raises(InvalidModelingMetadata):
        modeling_metadata(source)
    with pytest.raises(InvalidLigandEditError):
        RdkitLigandEditor().delete_bond(source, source.bonds[0].id)
    with pytest.raises(InvalidSelectionEdit):
        component_projection(source, [1])
    with pytest.raises(InvalidModelEdit):
        DirectMolecularEditor().edit(
            source, [1, 2], ModelBondDelete(operation="bond.delete"),
            next_atom_id=100, next_bond_id=100,
        )
    assert source.to_bytes() == original


def test_projection_validates_full_source_then_prunes_only_disposable_metadata():
    source = molecule("CCCO", explicit_h=False)
    source = source.model_copy(update={"metadata": {
        "custom": {"keep": True},
        MODELING_METADATA: {"schema_version": 1, "excluded_bonds": [[1, 4]]},
    }})
    original = source.to_bytes()
    assert project_modeling_metadata(source, [1, 2])[MODELING_METADATA] == {
        "schema_version": 1, "excluded_bonds": []
    }
    assert source.to_bytes() == original
    assert modeling_metadata(source).excluded_bonds == [(1, 4)]


def test_no_topology_change_preserves_absent_metadata_and_pair_canonicalization():
    before = molecule(explicit_h=False)
    assert update_bond_exclusions(before, before) is before
    assert ModelingMetadata(excluded_bonds=[(4, 1), (1, 4)]).excluded_bonds == [(1, 4)]


def test_selection_projection_keeps_valid_full_entry_exclusion_outside_component():
    source = prepared_complex()
    polymer_residues = {r.id for r in source.residues if r.component_type == "polymer"}
    protein_ids = [a.id for a in source.atoms if a.residue_id in polymer_residues]
    ligand_residues = {r.id for r in source.residues if r.component_type == "ligand"}
    ligand_id = next(a.id for a in source.atoms if a.residue_id in ligand_residues)
    pair = (protein_ids[0], protein_ids[-1])
    assert not any({b.atom_1_id, b.atom_2_id} == set(pair) for b in source.bonds)
    source = source.model_copy(update={"metadata": {
        MODELING_METADATA: ModelingMetadata(excluded_bonds=[pair]).model_dump(mode="json")
    }})
    original = source.to_bytes()
    projected = component_projection(source, [ligand_id])
    assert modeling_metadata(projected).excluded_bonds == []
    assert source.to_bytes() == original
    assert modeling_metadata(source).excluded_bonds == [pair]


@pytest.mark.parametrize("scope", ["atom", "residue", "chain"])
def test_protein_deletions_prune_only_exclusions_with_removed_endpoints(scope):
    source = prepared_complex()
    target_atom = source.atoms[0]
    target_residue = next(r for r in source.residues if r.id == target_atom.residue_id)
    if scope == "atom":
        removed_ids = {target_atom.id}
    elif scope == "residue":
        removed_ids = {a.id for a in source.atoms if a.residue_id == target_residue.id}
    else:
        residue_ids = {r.id for r in source.residues if r.chain_id == target_residue.chain_id}
        removed_ids = {a.id for a in source.atoms if a.residue_id in residue_ids}
    pairs = {tuple(sorted((b.atom_1_id, b.atom_2_id))) for b in source.bonds}
    absent_pairs = [p for p in combinations([a.id for a in source.atoms], 2) if p not in pairs]
    deleted_pair = next(p for p in absent_pairs if set(p) & removed_ids)
    retained_pair = next(p for p in absent_pairs if not set(p) & removed_ids)
    source = source.model_copy(update={"metadata": {
        MODELING_METADATA: ModelingMetadata(
            excluded_bonds=[deleted_pair, retained_pair]
        ).model_dump(mode="json")
    }})
    original = source.to_bytes()
    editor = PdbfixerProteinEditor()
    if scope == "atom":
        result = editor.delete_atoms(source, [target_atom.id]).structure
    elif scope == "residue":
        result = editor.delete_residues(source, [target_residue.id]).structure
    else:
        result = editor.delete_chains(source, [target_residue.chain_id]).structure
    assert modeling_metadata(result).excluded_bonds == [retained_pair]
    assert source.to_bytes() == original
    assert {a.id for a in result.atoms} == {a.id for a in source.atoms} - removed_ids


def test_protein_editor_rejects_present_edge_contradicting_exclusion():
    source = prepared_complex()
    bond = source.bonds[0]
    source = source.model_copy(update={"metadata": {MODELING_METADATA: {
        "schema_version": 1,
        "excluded_bonds": [[bond.atom_1_id, bond.atom_2_id]],
    }}})
    original = source.to_bytes()
    with pytest.raises(InvalidProteinEditError, match="contradict"):
        PdbfixerProteinEditor().delete_atoms(source, [source.atoms[-1].id])
    assert source.to_bytes() == original
