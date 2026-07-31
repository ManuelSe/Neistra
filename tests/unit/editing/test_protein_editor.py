from __future__ import annotations

from pathlib import Path

import pytest
from molweave_core.adapters.macromolecular import PdbAdapter
from molweave_core.editing import (
    InvalidProteinEditError,
    PdbfixerProteinEditor,
    ProteinStructureValidator,
)
from molweave_core.molecular import NormalizedStructureV1

FIXTURE = (
    Path(__file__).parents[2] / "fixtures" / "formats" / "protein_editing.pdb"
)


@pytest.fixture
def protein() -> NormalizedStructureV1:
    return PdbAdapter().parse(FIXTURE.read_bytes(), FIXTURE.name).structures[0]


def residue_id(
    structure: NormalizedStructureV1,
    chain: str,
    number: int,
) -> int:
    chain_id = next(item.id for item in structure.chains if item.name == chain)
    return next(
        item.id
        for item in structure.residues
        if item.chain_id == chain_id and item.author_number == number
    )


def test_atom_residue_and_chain_deletion_cascade_without_renumbering(
    protein: NormalizedStructureV1,
) -> None:
    editor = PdbfixerProteinEditor()
    atom_result = editor.delete_atoms(protein, [5])
    assert atom_result.deleted_atom_ids == (5,)
    assert 5 not in {atom.id for atom in atom_result.structure.atoms}
    assert [atom.id for atom in atom_result.structure.atoms][:5] == [1, 2, 3, 4, 6]

    glycine = residue_id(protein, "A", 2)
    residue_result = editor.delete_residues(protein, [glycine])
    assert residue_result.deleted_residue_ids == (glycine,)
    assert {6, 7, 8, 9}.issubset(residue_result.deleted_atom_ids)
    assert all(
        bond.atom_1_id not in residue_result.deleted_atom_ids
        and bond.atom_2_id not in residue_result.deleted_atom_ids
        for bond in residue_result.structure.bonds
    )

    chain_b = next(chain.id for chain in protein.chains if chain.name == "B")
    chain_result = editor.delete_chains(protein, [chain_b])
    assert chain_result.deleted_chain_ids == (chain_b,)
    assert all(chain.name != "B" for chain in chain_result.structure.chains)


def test_water_and_ion_removal_are_component_aware(
    protein: NormalizedStructureV1,
) -> None:
    editor = PdbfixerProteinEditor()
    without_water = editor.delete_components(protein, "water")
    assert 21 in without_water.deleted_atom_ids
    assert all(
        residue.component_type != "water"
        for residue in without_water.structure.residues
    )
    without_ion = editor.delete_components(protein, "ion")
    assert 22 in without_ion.deleted_atom_ids
    assert all(
        residue.component_type != "ion"
        for residue in without_ion.structure.residues
    )


def test_deletion_rejects_missing_duplicate_and_every_atom(
    protein: NormalizedStructureV1,
) -> None:
    editor = PdbfixerProteinEditor()
    with pytest.raises(InvalidProteinEditError, match="must not be empty"):
        editor.delete_atoms(protein, [])
    with pytest.raises(InvalidProteinEditError, match="must not contain duplicates"):
        editor.delete_atoms(protein, [1, 1])
    with pytest.raises(InvalidProteinEditError, match="missing from the protein"):
        editor.delete_atoms(protein, [999])
    with pytest.raises(InvalidProteinEditError, match="cannot delete every atom"):
        editor.delete_atoms(protein, [atom.id for atom in protein.atoms])


def test_chain_rename_and_author_residue_renumbering(
    protein: NormalizedStructureV1,
) -> None:
    editor = PdbfixerProteinEditor()
    chain_a = next(chain.id for chain in protein.chains if chain.name == "A")
    original_label_numbers = [
        residue.label_number
        for residue in protein.residues
        if residue.chain_id == chain_a
    ]
    renamed = editor.rename_chain(protein, chain_a, "Alpha")
    assert next(
        chain.name for chain in renamed.structure.chains if chain.id == chain_a
    ) == "Alpha"
    assert {warning.code for warning in renamed.warnings} >= {
        "chain_name_not_pdb_compatible"
    }

    renumbered = editor.renumber_residues(protein, chain_a, start=10, step=5)
    chain_residues = [
        residue
        for residue in renumbered.structure.residues
        if residue.chain_id == chain_a
    ]
    assert [residue.author_number for residue in chain_residues] == [10, 15, 20]
    assert [residue.label_number for residue in chain_residues] == original_label_numbers

    with pytest.raises(InvalidProteinEditError, match="unique"):
        editor.rename_chain(protein, chain_a, "B")
    with pytest.raises(InvalidProteinEditError, match="must not be zero"):
        editor.renumber_residues(protein, chain_a, start=1, step=0)


def test_validator_surfaces_unsupported_residues_and_severe_clashes(
    protein: NormalizedStructureV1,
) -> None:
    first_polymer = next(
        residue for residue in protein.residues if residue.component_type == "polymer"
    )
    residues = [
        residue.model_copy(update={"name": "MSE"})
        if residue.id == first_polymer.id
        else residue
        for residue in protein.residues
    ]
    conformer = protein.conformers[0].model_copy(
        update={
            "coordinates": [
                protein.conformers[0].coordinates[0],
                protein.conformers[0].coordinates[0],
                *protein.conformers[0].coordinates[2:],
            ]
        }
    )
    atoms = [
        atom.model_copy(update={"coordinates": conformer.coordinates[index]})
        for index, atom in enumerate(protein.atoms)
    ]
    warnings = ProteinStructureValidator().validate(
        protein.model_copy(
            update={"residues": residues, "atoms": atoms, "conformers": [conformer]}
        ),
        "protein.test",
    )
    assert {warning.code for warning in warnings} >= {
        "unsupported_protein_residues",
        "severe_atomic_clash",
    }
