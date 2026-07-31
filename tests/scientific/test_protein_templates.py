from __future__ import annotations

from pathlib import Path

import pytest
from molweave_core.adapters.macromolecular import PdbAdapter
from molweave_core.editing import (
    BACKBONE_ATOMS,
    STANDARD_AMINO_ACIDS,
    InvalidProteinEditError,
    PdbfixerProteinEditor,
)
from molweave_core.molecular import Conformer, NormalizedStructureV1

FIXTURE = Path(__file__).parents[1] / "fixtures" / "formats" / "protein_editing.pdb"


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


def next_ids(structure: NormalizedStructureV1) -> tuple[int, int]:
    return (
        max(atom.id for atom in structure.atoms) + 1,
        max((bond.id for bond in structure.bonds), default=0) + 1,
    )


def test_standard_amino_acid_set_is_complete() -> None:
    assert len(STANDARD_AMINO_ACIDS) == 20
    assert STANDARD_AMINO_ACIDS == {
        "ALA",
        "ARG",
        "ASN",
        "ASP",
        "CYS",
        "GLN",
        "GLU",
        "GLY",
        "HIS",
        "ILE",
        "LEU",
        "LYS",
        "MET",
        "PHE",
        "PRO",
        "SER",
        "THR",
        "TRP",
        "TYR",
        "VAL",
    }


def test_mutation_preserves_backbone_and_allocates_stable_new_ids(
    protein: NormalizedStructureV1,
) -> None:
    editor = PdbfixerProteinEditor()
    target = residue_id(protein, "A", 1)
    original = {
        atom.name: atom
        for atom in protein.atoms
        if atom.residue_id == target and atom.name in BACKBONE_ATOMS
    }
    atom_id, bond_id = next_ids(protein)

    result = editor.mutate_residue(
        protein,
        target,
        "VAL",
        next_atom_id=atom_id,
        next_bond_id=bond_id,
    )

    mutated_residue = next(
        residue for residue in result.structure.residues if residue.id == target
    )
    mutated = {
        atom.name: atom
        for atom in result.structure.atoms
        if atom.residue_id == target
    }
    assert mutated_residue.name == "VAL"
    for name, atom in original.items():
        assert mutated[name].id == atom.id
        assert mutated[name].coordinates == atom.coordinates
    assert {"CB", "CG1", "CG2"}.issubset(mutated)
    assert result.created_atom_ids == tuple(
        range(atom_id, atom_id + len(result.created_atom_ids))
    )
    assert result.created_bond_ids == tuple(
        range(bond_id, bond_id + len(result.created_bond_ids))
    )
    assert {warning.code for warning in result.warnings} >= {
        "side_chain_not_optimized",
        "terminal_residue_mutation",
    }
    assert result.structure.inferences[-1].code == "residue_template_applied"


def test_hydrogen_round_trip_preserves_heavy_atoms(
    protein: NormalizedStructureV1,
) -> None:
    editor = PdbfixerProteinEditor()
    original_heavy = {
        atom.id: atom.coordinates for atom in protein.atoms if atom.element != "H"
    }
    atom_id, bond_id = next_ids(protein)
    added = editor.add_hydrogens(
        protein,
        next_atom_id=atom_id,
        next_bond_id=bond_id,
    )
    assert added.created_atom_ids
    assert all(
        next(atom for atom in added.structure.atoms if atom.id == created).element == "H"
        for created in added.created_atom_ids
    )
    assert {
        atom.id: atom.coordinates
        for atom in added.structure.atoms
        if atom.id in original_heavy
    } == original_heavy
    assert {warning.code for warning in added.warnings} >= {
        "hydrogen_placement_ph_dependent",
        "terminal_hydrogen_placement",
    }

    removed = editor.remove_hydrogens(
        added.structure,
        residue_ids=[
            residue.id
            for residue in protein.residues
            if residue.component_type == "polymer"
        ],
    )
    assert set(removed.deleted_atom_ids) == set(added.created_atom_ids)
    assert {
        atom.id: atom.coordinates
        for atom in removed.structure.atoms
        if atom.element != "H"
    } == original_heavy


def test_hydrogen_placement_maps_after_new_side_chain_ids(
    protein: NormalizedStructureV1,
) -> None:
    editor = PdbfixerProteinEditor()
    atom_id, bond_id = next_ids(protein)
    mutated = editor.mutate_residue(
        protein,
        residue_id(protein, "A", 1),
        "VAL",
        next_atom_id=atom_id,
        next_bond_id=bond_id,
    ).structure
    next_atom, next_bond = next_ids(mutated)
    hydrogenated = editor.add_hydrogens(
        mutated,
        next_atom_id=next_atom,
        next_bond_id=next_bond,
    )
    assert hydrogenated.created_atom_ids
    assert len(
        {
            (residue.chain_id, residue.author_number)
            for residue in hydrogenated.structure.residues
            if residue.component_type == "polymer"
        }
    ) == 4


@pytest.mark.parametrize("target", ["MSE", "", "alanine"])
def test_mutation_rejects_nonstandard_target(
    protein: NormalizedStructureV1,
    target: str,
) -> None:
    atom_id, bond_id = next_ids(protein)
    with pytest.raises(InvalidProteinEditError, match="20 standard"):
        PdbfixerProteinEditor().mutate_residue(
            protein,
            residue_id(protein, "A", 1),
            target,
            next_atom_id=atom_id,
            next_bond_id=bond_id,
        )


def test_template_operations_reject_ambiguous_models_and_altlocs(
    protein: NormalizedStructureV1,
) -> None:
    atom_id, bond_id = next_ids(protein)
    second = Conformer(
        id=2,
        name="model-2",
        coordinates=protein.conformers[0].coordinates,
    )
    with pytest.raises(InvalidProteinEditError, match="exactly one conformer"):
        PdbfixerProteinEditor().add_hydrogens(
            protein.model_copy(
                update={"conformers": [*protein.conformers, second]}
            ),
            next_atom_id=atom_id,
            next_bond_id=bond_id,
        )
    atoms = [
        atom.model_copy(update={"alternate_location": "A"})
        if atom.id == 1
        else atom
        for atom in protein.atoms
    ]
    with pytest.raises(InvalidProteinEditError, match="alternate locations"):
        PdbfixerProteinEditor().add_hydrogens(
            protein.model_copy(update={"atoms": atoms}),
            next_atom_id=atom_id,
            next_bond_id=bond_id,
        )


def test_template_operations_reject_unsupported_or_incomplete_residue(
    protein: NormalizedStructureV1,
) -> None:
    target = residue_id(protein, "A", 1)
    atom_id, bond_id = next_ids(protein)
    residues = [
        residue.model_copy(update={"name": "MSE"})
        if residue.id == target
        else residue
        for residue in protein.residues
    ]
    with pytest.raises(InvalidProteinEditError, match="not a supported"):
        PdbfixerProteinEditor().mutate_residue(
            protein.model_copy(update={"residues": residues}),
            target,
            "VAL",
            next_atom_id=atom_id,
            next_bond_id=bond_id,
        )
    missing_n = PdbfixerProteinEditor().delete_atoms(protein, [1]).structure
    with pytest.raises(InvalidProteinEditError, match="backbone anchors"):
        PdbfixerProteinEditor().mutate_residue(
            missing_n,
            target,
            "VAL",
            next_atom_id=atom_id,
            next_bond_id=bond_id,
        )
