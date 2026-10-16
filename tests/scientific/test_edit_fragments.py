from __future__ import annotations

import pytest
from molweave_core.adapters.rdkit_common import normalized_to_mol
from molweave_core.editing.selection import (
    BondCreate,
    BondDelete,
    BondOrder,
    FragmentReplace,
    HydrogenPrepare,
    InvalidSelectionEdit,
)
from rdkit import Chem
from rdkit.Chem.rdMolDescriptors import CalcMolFormula

from tests.scientific.test_selection_editing import apply
from tests.unit.editing.test_ligand_editor import ligand


@pytest.mark.parametrize(
    "fragment,expected_smiles,formula",
    [
        ("methyl", "CC", "C2H6"),
        ("ethyl", "CCC", "C3H8"),
        ("hydroxyl", "CO", "CH4O"),
        ("amino", "CN", "CH5N"),
        ("carboxylic_acid", "CC(=O)O", "C2H4O2"),
        ("phenyl", "Cc1ccccc1", "C7H8"),
    ],
)
def test_six_fragments_have_independent_expected_graphs_and_formula(
    fragment, expected_smiles, formula
):  # type: ignore[no-untyped-def]
    original = apply(
        ligand("C"), HydrogenPrepare(operation="hydrogens.prepare"), [1]
    ).edit.structure
    h = next(a.id for a in original.atoms if a.element == "H")
    action = FragmentReplace(operation="fragment.replace", fragment=fragment)
    result = apply(original, action, [h])
    mol = normalized_to_mol(result.edit.structure)
    Chem.SanitizeMol(mol)
    assert Chem.MolToSmiles(Chem.RemoveHs(mol)) == Chem.MolToSmiles(
        Chem.MolFromSmiles(expected_smiles)
    )
    assert CalcMolFormula(mol) == formula
    assert all(a.GetNumImplicitHs() == 0 for a in mol.GetAtoms())
    assert (
        result.edit.structure.to_bytes() == apply(original, action, [h]).edit.structure.to_bytes()
    )
    assert all(
        next(a for a in result.edit.structure.atoms if a.id == old.id) == old
        for old in original.atoms
        if old.id != h
    )
    assert "seed=690" in result.edit.structure.inferences[-1].message
    assert (
        len(result.edit.created_atom_ids)
        == len(result.edit.structure.atoms) - len(original.atoms) + 1
    )


def test_bond_order_and_break_reconcile_endpoint_hydrogens() -> None:
    original = apply(
        ligand("CC"), HydrogenPrepare(operation="hydrogens.prepare"), [1]
    ).edit.structure
    double = apply(original, BondOrder(operation="bond.order", order=2), [1, 2]).edit.structure
    assert sum(a.element == "H" for a in double.atoms) == 4
    triple = apply(double, BondOrder(operation="bond.order", order=3), [1, 2]).edit.structure
    assert sum(a.element == "H" for a in triple.atoms) == 2
    broken = apply(original, BondDelete(operation="bond.delete"), [1, 2]).edit.structure
    assert sum(a.element == "H" for a in broken.atoms) == 8


def test_aromatic_and_ez_decisions_are_not_guessed() -> None:
    with pytest.raises(InvalidSelectionEdit, match="aromatic"):
        apply(ligand("c1ccccc1"), BondOrder(operation="bond.order", order=2), [1, 2])
    with pytest.raises(InvalidSelectionEdit, match="E/Z"):
        apply(ligand("CCCC"), BondOrder(operation="bond.order", order=2), [2, 3])


def test_bond_creation_closes_nearby_endpoints_and_rejects_distant_ones() -> None:
    ring = ligand("C1CCCCC1")
    # Independently supplied ring coordinates with its closing bond absent.
    # Only the two edited endpoints acquire explicit local H.
    open_chain = ring.model_copy(
        update={"bonds": [b for b in ring.bonds if {b.atom_1_id, b.atom_2_id} != {1, 6}]}
    )
    result = apply(open_chain, BondCreate(operation="bond.create"), [1, 6]).edit.structure
    mol = normalized_to_mol(result)
    Chem.SanitizeMol(mol)
    assert CalcMolFormula(mol) == "C6H12"
    assert any({b.atom_1_id, b.atom_2_id} == {1, 6} for b in result.bonds)
    assert sum(a.element == "H" for a in result.atoms) == 4
    with pytest.raises(InvalidSelectionEdit, match="too far"):
        apply(ligand("CCCCCC"), BondCreate(operation="bond.create"), [1, 6])
