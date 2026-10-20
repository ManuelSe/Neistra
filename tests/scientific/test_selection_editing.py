from __future__ import annotations

import pytest
from molweave_core.editing.ligand import StructureValidator
from molweave_core.editing.selection import (
    AtomDelete,
    ChargeChange,
    ElementChange,
    HydrogenPrepare,
    InvalidSelectionEdit,
    SelectionMolecularEditor,
)

from tests.support.editing_fixture import prepared_complex
from tests.unit.editing.test_ligand_editor import ligand


def apply(structure, action, selected):  # type: ignore[no-untyped-def]
    return SelectionMolecularEditor().edit(
        structure,
        selected,
        action,
        next_atom_id=max(a.id for a in structure.atoms) + 1,
        next_bond_id=max((b.id for b in structure.bonds), default=0) + 1,
    )


def test_h_substitution_generates_methyl_and_keeps_other_atoms_exact() -> None:
    original = ligand("CO")
    prepared = apply(original, HydrogenPrepare(operation="hydrogens.prepare"), [1]).edit.structure
    h = next(
        a.id
        for a in prepared.atoms
        if a.element == "H" and any({b.atom_1_id, b.atom_2_id} == {a.id, 1} for b in prepared.bonds)
    )
    result = apply(prepared, ElementChange(operation="atom.element", element="C"), [h])
    after = result.edit.structure
    from molweave_core.hydrogen_protection import protection_facts

    facts = protection_facts(after)
    assert all(facts[a.id].matches(a) and facts[a.id].ordinary for a in after.atoms)
    assert sorted(a.element for a in after.atoms) == sorted("CCO" + "H" * 6)
    assert h not in {a.id for a in after.atoms}
    carbon = result.replacements[h]
    assert (
        sum(
            a.element == "H"
            and any({b.atom_1_id, b.atom_2_id} == {a.id, carbon} for b in after.bonds)
            for a in after.atoms
        )
        == 3
    )
    assert all(
        next(a for a in after.atoms if a.id == old.id) == old
        for old in prepared.atoms
        if old.id != h
    )


def test_element_charge_and_deletion_reconcile_h_atomically() -> None:
    prepared = apply(
        ligand("CCO"), HydrogenPrepare(operation="hydrogens.prepare"), [1]
    ).edit.structure
    changed = apply(
        prepared, ElementChange(operation="atom.element", element="N"), [3]
    ).edit.structure
    assert sum(a.element == "H" for a in changed.atoms) == 7
    charged = apply(changed, ChargeChange(operation="atom.charge", delta=1), [3]).edit.structure
    assert sum(a.element == "H" for a in charged.atoms) == 8
    deleted = apply(charged, AtomDelete(operation="atom.delete"), [3]).edit.structure
    assert sorted(a.element for a in deleted.atoms) == sorted("CC" + "H" * 6)


def test_uncertain_chemistry_and_noop_reject() -> None:
    original = ligand("CC")
    unknown = original.model_copy(
        update={"bonds": [b.model_copy(update={"order": None}) for b in original.bonds]}
    )
    with pytest.raises(InvalidSelectionEdit, match="Known formal"):
        apply(unknown, HydrogenPrepare(operation="hydrogens.prepare"), [1])
    with pytest.raises(InvalidSelectionEdit, match="already"):
        apply(original, ElementChange(operation="atom.element", element="C"), [1])
    prepared = apply(original, HydrogenPrepare(operation="hydrogens.prepare"), [1]).edit.structure
    with pytest.raises(InvalidSelectionEdit, match="did not change"):
        apply(prepared, HydrogenPrepare(operation="hydrogens.prepare"), [1])


def test_supplied_chirality_survives_hydrogen_reconciliation() -> None:
    original = ligand("N[C@@H](C)C(=O)O")
    expected = StructureValidator.stereochemistry(original)
    prepared = apply(original, HydrogenPrepare(operation="hydrogens.prepare"), [1]).edit.structure
    assert expected
    assert StructureValidator.stereochemistry(prepared) == expected
    assert all(
        next(a for a in prepared.atoms if a.id == old.id).coordinates == old.coordinates
        for old in original.atoms
    )


def test_covaly_attached_component_and_mixed_selection_reject() -> None:
    from molweave_core.molecular import Bond

    original = prepared_complex()
    ligand_id = next(a.id for a in original.atoms if a.formal_charge == 0)
    with pytest.raises(InvalidSelectionEdit, match="prepared small-molecule"):
        apply(original, HydrogenPrepare(operation="hydrogens.prepare"), [1, ligand_id])
    linked = original.model_copy(
        update={
            "bonds": [
                *original.bonds,
                Bond(
                    id=max(b.id for b in original.bonds) + 1,
                    atom_1_id=1,
                    atom_2_id=ligand_id,
                    order=1,
                ),
            ]
        }
    )
    with pytest.raises(InvalidSelectionEdit, match="cross this component"):
        apply(linked, HydrogenPrepare(operation="hydrogens.prepare"), [ligand_id])


def test_degenerate_input_geometry_is_not_silently_reembedded() -> None:
    from pathlib import Path

    from molweave_core.adapters.ligand import MolAdapter

    path = Path(__file__).parents[1] / "fixtures" / "formats" / "ethanol.mol"
    original = MolAdapter().parse(path.read_bytes(), path.name).structures[0]
    before = original.to_bytes()
    with pytest.raises(InvalidSelectionEdit, match="Generated bond geometry"):
        apply(original, HydrogenPrepare(operation="hydrogens.prepare"), [1])
    assert original.to_bytes() == before


def test_invalid_valence_and_unknown_adapter_orders_never_publish() -> None:
    original = ligand("CCO")
    before = original.to_bytes()
    with pytest.raises(InvalidSelectionEdit, match="Invalid valence"):
        apply(original, ElementChange(operation="atom.element", element="F"), [2])
    odd_order = original.model_copy(
        update={
            "bonds": [
                original.bonds[0].model_copy(update={"order": 1.7}),
                *original.bonds[1:],
            ]
        }
    )
    with pytest.raises(InvalidSelectionEdit, match="bond order"):
        apply(odd_order, HydrogenPrepare(operation="hydrogens.prepare"), [1])
    assert original.to_bytes() == before


def test_unspecified_and_conflicting_stereo_refuse_before_changes() -> None:
    for smiles in ["CC(O)C(=O)O", "CC=CC"]:
        source = ligand(smiles)
        original = source.to_bytes()
        with pytest.raises(InvalidSelectionEdit, match="Unspecified stereochemistry"):
            apply(source, HydrogenPrepare(operation="hydrogens.prepare"), [1])
        assert source.to_bytes() == original
    source = ligand("N[C@@H](C)C(=O)O")
    source = source.model_copy(
        update={
            "atoms": [
                a.model_copy(
                    update={
                        "stereo": "TETRAHEDRAL_CW"
                        if a.stereo == "TETRAHEDRAL_CCW"
                        else "TETRAHEDRAL_CCW",
                    }
                )
                if a.stereo
                else a
                for a in source.atoms
            ]
        }
    )
    with pytest.raises(InvalidSelectionEdit, match="conflicts with 3D"):
        apply(source, HydrogenPrepare(operation="hydrogens.prepare"), [1])


def test_enantiotopic_h_substitution_records_opposite_stereo_in_saved_order() -> None:
    from molweave_core.adapters.rdkit_common import normalized_to_mol
    from molweave_core.editing.selection import FragmentReplace
    from molweave_core.molecular import NormalizedStructureV1
    from rdkit import Chem

    source = apply(
        ligand("CCO"), HydrogenPrepare(operation="hydrogens.prepare"), [1]
    ).edit.structure
    hydrogens = [
        a.id
        for a in source.atoms
        if a.element == "H" and any({b.atom_1_id, b.atom_2_id} == {a.id, 2} for b in source.bonds)
    ]
    assert len(hydrogens) == 2
    cips = []
    for hydrogen in hydrogens:
        result = apply(
            source,
            FragmentReplace(operation="fragment.replace", fragment="carboxylic_acid"),
            [hydrogen],
        )
        saved = NormalizedStructureV1.model_validate_json(result.edit.structure.to_bytes())
        cips.append(StructureValidator.stereochemistry(saved)[2])
        geometry = normalized_to_mol(saved)
        Chem.SanitizeMol(geometry)
        Chem.AssignStereochemistryFrom3D(geometry, replaceExistingTags=True)
        assert next(a for a in saved.atoms if a.id == 2).stereo == str(
            geometry.GetAtomWithIdx(1).GetChiralTag()
        ).removeprefix("CHI_")
        assert "stereochemistry_review" in {w.code for w in result.edit.warnings}
        assert all(
            next(a for a in saved.atoms if a.id == old.id).coordinates == old.coordinates
            for old in source.atoms
            if old.id != hydrogen
        )
    assert set(cips) == {"R", "S"}


def test_nonfinite_surrounding_context_refuses_clash_validation() -> None:
    original = prepared_complex()
    target = next(a.id for a in original.atoms if a.formal_charge == 0)
    invalid = original.model_copy(
        update={
            "atoms": [
                original.atoms[0].model_copy(update={"coordinates": (float("nan"), 0, 0)}),
                *original.atoms[1:],
            ]
        }
    )
    with pytest.raises(InvalidSelectionEdit, match="Surrounding coordinates"):
        apply(invalid, HydrogenPrepare(operation="hydrogens.prepare"), [target])


def test_large_context_is_never_projected_into_ligand_chemistry(monkeypatch) -> None:
    from molweave_core.editing import selection as module
    from molweave_core.molecular import Conformer

    source = prepared_complex()
    first_new = max(a.id for a in source.atoms) + 1
    atoms = [
        *source.atoms,
        *[
            source.atoms[0].model_copy(
                update={
                    "id": first_new + i,
                    "source_index": len(source.atoms) + i,
                    "coordinates": (100.0 + i, 100.0, 100.0),
                }
            )
            for i in range(25_000)
        ],
    ]
    large = source.model_copy(
        update={
            "atoms": atoms,
            "conformers": [
                Conformer(
                    id=1, name="Synthetic context scale", coordinates=[a.coordinates for a in atoms]
                )
            ],
        }
    )
    convert = module.normalized_to_mol
    chemistry_sizes = []

    def capture(structure):  # type: ignore[no-untyped-def]
        chemistry_sizes.append(len(structure.atoms))
        return convert(structure)

    monkeypatch.setattr(module, "normalized_to_mol", capture)
    target = next(a.id for a in large.atoms if a.formal_charge == 0)
    after = apply(large, HydrogenPrepare(operation="hydrogens.prepare"), [target]).edit.structure
    assert chemistry_sizes == [3, 9]
    assert after.atoms[: len(source.atoms)] == source.atoms
    assert all(a in after.atoms for a in atoms[-5:])


def test_cip_priority_change_is_not_a_geometric_inversion() -> None:
    import numpy as np

    source = apply(
        ligand("N[C@@H](C)C(=O)O"), HydrogenPrepare(operation="hydrogens.prepare"), [1]
    ).edit.structure
    hydrogen = next(
        a.id
        for a in source.atoms
        if a.element == "H" and any({b.atom_1_id, b.atom_2_id} == {a.id, 2} for b in source.bonds)
    )
    result = apply(source, ElementChange(operation="atom.element", element="F"), [hydrogen])
    after = result.edit.structure

    def orientation(structure, fourth):  # type: ignore[no-untyped-def]
        xyz = {a.id: np.array(a.coordinates) for a in structure.atoms}
        return float(np.linalg.det([xyz[i] - xyz[fourth] for i in [1, 3, 4]]))

    assert orientation(source, hydrogen) * orientation(after, result.replacements[hydrogen]) > 0
    assert StructureValidator.stereochemistry(source)[2] == "S"
    assert StructureValidator.stereochemistry(after)[2] == "R"
    assert "stereochemistry_review" in {w.code for w in result.edit.warnings}
