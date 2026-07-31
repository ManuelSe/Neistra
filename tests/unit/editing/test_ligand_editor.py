from __future__ import annotations

from typing import Any

import pytest
from molweave_core.adapters.rdkit_common import mol_to_normalized
from molweave_core.editing import InvalidLigandEditError, RdkitLigandEditor
from molweave_core.molecular import Atom, Conformer, NormalizedStructureV1
from rdkit import Chem
from rdkit.Chem import AllChem

all_chem: Any = AllChem


def ligand(smiles: str) -> NormalizedStructureV1:
    mol = Chem.MolFromSmiles(smiles)
    assert mol is not None
    assert all_chem.EmbedMolecule(mol, randomSeed=0xC0FFEE) == 0
    return mol_to_normalized(
        mol,
        filename="fixture.smi",
        format_name="smiles",
        title=smiles,
    )


def test_atom_and_bond_crud_preserves_ids_and_accepts_gaps() -> None:
    editor = RdkitLigandEditor()
    original = ligand("CC")

    added_atom = editor.add_atom(
        original,
        atom_id=3,
        element="O",
        formal_charge=0,
        coordinates=(3.0, 0.0, 0.0),
    )
    assert added_atom.created_atom_ids == (3,)
    assert [atom.id for atom in added_atom.structure.atoms] == [1, 2, 3]

    added_bond = editor.add_bond(
        added_atom.structure,
        bond_id=2,
        atom_1_id=2,
        atom_2_id=3,
        order=1.0,
    )
    assert added_bond.created_bond_ids == (2,)
    assert [(bond.id, bond.atom_1_id, bond.atom_2_id) for bond in added_bond.structure.bonds] == [
        (1, 1, 2),
        (2, 2, 3),
    ]

    changed = editor.change_bond_order(added_bond.structure, 2, 2.0)
    assert next(bond for bond in changed.structure.bonds if bond.id == 2).order == 2.0
    charged = editor.change_formal_charge(added_atom.structure, 3, -1)
    assert next(atom for atom in charged.structure.atoms if atom.id == 3).formal_charge == -1
    element = editor.change_element(changed.structure, 3, "N")
    assert next(atom for atom in element.structure.atoms if atom.id == 3).element == "N"

    deleted_bond = editor.delete_bond(element.structure, 2)
    assert deleted_bond.deleted_bond_ids == (2,)
    deleted_atom = editor.delete_atoms(deleted_bond.structure, [2])
    assert deleted_atom.deleted_atom_ids == (2,)
    assert [atom.id for atom in deleted_atom.structure.atoms] == [1, 3]
    assert [len(item.coordinates) for item in deleted_atom.structure.conformers] == [2]


def test_invalid_valence_never_returns_a_structure() -> None:
    editor = RdkitLigandEditor()
    methane = ligand("C")
    current = methane
    next_atom = 2
    next_bond = 1
    for _ in range(4):
        current = editor.add_atom(
            current,
            atom_id=next_atom,
            element="F",
            coordinates=(float(next_atom), 0.0, 0.0),
        ).structure
        current = editor.add_bond(
            current,
            bond_id=next_bond,
            atom_1_id=1,
            atom_2_id=next_atom,
            order=1.0,
        ).structure
        next_atom += 1
        next_bond += 1

    extra = editor.add_atom(
        current,
        atom_id=next_atom,
        element="F",
        coordinates=(float(next_atom), 0.0, 0.0),
    ).structure
    with pytest.raises(InvalidLigandEditError, match="Invalid valence"):
        editor.add_bond(
            extra,
            bond_id=next_bond,
            atom_1_id=1,
            atom_2_id=next_atom,
            order=1.0,
        )


def test_hydrogen_add_remove_retains_heavy_atom_ids_and_records_inference() -> None:
    editor = RdkitLigandEditor()
    ethanol = ligand("CCO")
    result = editor.add_hydrogens(
        ethanol,
        next_atom_id=4,
        next_bond_id=3,
    )

    assert result.created_atom_ids == tuple(range(4, 10))
    assert [atom.id for atom in result.structure.atoms[:3]] == [1, 2, 3]
    assert result.structure.inferences[-1].code == "hydrogens_added"
    removed = editor.remove_hydrogens(result.structure)
    assert removed.deleted_atom_ids == result.created_atom_ids
    assert [atom.id for atom in removed.structure.atoms] == [1, 2, 3]


def test_rotatable_bond_requires_exact_nonterminal_component() -> None:
    editor = RdkitLigandEditor()
    butane = ligand("CCCC")
    central = next(
        bond
        for bond in butane.bonds
        if {bond.atom_1_id, bond.atom_2_id} == {2, 3}
    )
    before = list(butane.active_coordinates)
    rotated = editor.rotate_bond(
        butane,
        bond_id=central.id,
        movable_atom_ids=[3, 4],
        angle_degrees=60,
    )
    assert rotated.changed_atom_ids == (3, 4)
    assert rotated.structure.active_coordinates[3] != pytest.approx(before[3])

    terminal = next(bond for bond in butane.bonds if 1 in {bond.atom_1_id, bond.atom_2_id})
    with pytest.raises(InvalidLigandEditError, match="Terminal"):
        editor.rotate_bond(
            butane,
            bond_id=terminal.id,
            movable_atom_ids=[1],
            angle_degrees=30,
        )
    with pytest.raises(InvalidLigandEditError, match="exactly one side"):
        editor.rotate_bond(
            butane,
            bond_id=central.id,
            movable_atom_ids=[4],
            angle_degrees=30,
        )

    ring = ligand("C1CCCCC1")
    with pytest.raises(InvalidLigandEditError, match="Ring"):
        editor.rotate_bond(
            ring,
            bond_id=ring.bonds[0].id,
            movable_atom_ids=[1, 2, 3],
            angle_degrees=30,
        )


def test_stereo_change_is_reported_with_before_after_identity() -> None:
    editor = RdkitLigandEditor()
    chiral = ligand("F[C@](Cl)(Br)I")
    chlorine = next(atom for atom in chiral.atoms if atom.element == "Cl")
    result = editor.change_element(chiral, chlorine.id, "F")
    assert any(warning.code == "stereochemistry_changed" for warning in result.warnings)


def test_coordinate_cleanup_reports_force_field_and_parameter_failure() -> None:
    editor = RdkitLigandEditor()
    result = editor.cleanup(
        ligand("CCO"),
        force_field="auto",
        max_iterations=200,
    )
    assert result.force_field is not None
    assert result.force_field.force_field in {"MMFF", "UFF"}
    assert result.changed_atom_ids == (1, 2, 3)

    unsupported = ligand("[U]")
    with pytest.raises(InvalidLigandEditError, match="parameters are unavailable"):
        editor.cleanup(
            unsupported,
            force_field="mmff",
            max_iterations=20,
        )


def test_addition_validates_elements_coordinates_and_monotonic_ids() -> None:
    editor = RdkitLigandEditor()
    structure = ligand("CC")
    with pytest.raises(InvalidLigandEditError, match="new and positive"):
        editor.add_atom(
            structure,
            atom_id=1,
            element="O",
            coordinates=(0.0, 0.0, 0.0),
        )
    with pytest.raises(InvalidLigandEditError, match="Unknown chemical element"):
        editor.add_atom(
            structure,
            atom_id=3,
            element="NotAnElement",
            coordinates=(0.0, 0.0, 0.0),
        )
    with pytest.raises(InvalidLigandEditError, match="finite"):
        editor.add_atom(
            structure,
            atom_id=3,
            element="O",
            coordinates=(float("nan"), 0.0, 0.0),
        )


def test_normalized_structure_coordinates_follow_list_order_not_id_minus_one() -> None:
    structure = ligand("CC")
    atoms = [
        structure.atoms[0],
        Atom(
            id=7,
            name="C7",
            element="C",
            coordinates=structure.atoms[1].coordinates,
            source_index=1,
        ),
    ]
    gapped = structure.model_copy(
        update={
            "atoms": atoms,
            "bonds": [
                structure.bonds[0].model_copy(
                    update={"atom_1_id": 1, "atom_2_id": 7}
                )
            ],
            "conformers": [
                Conformer(
                    id=1,
                    name="Active",
                    coordinates=[atom.coordinates for atom in atoms],
                )
            ],
        }
    )
    assert [atom.id for atom in gapped.atoms] == [1, 7]
