import pytest
from molweave_core.editing.model import (
    DirectMolecularEditor,
    InvalidModelEdit,
    ModelBondDelete,
    ModelBondSet,
    ModelCharge,
    ModelDelete,
    ModelElement,
    modeling_metadata,
)
from molweave_core.molecular import Bond

from tests.support.editing_fixture import prepared_complex
from tests.support.modeling_fixture import paracetamol


def test_unknown_chemistry_element_assignment_preserves_every_other_record() -> None:
    before = paracetamol(orphan_h=True)
    before = before.model_copy(
        update={
            "atoms": [a.model_copy(update={"formal_charge": None}) for a in before.atoms],
            "bonds": [b.model_copy(update={"order": None}) for b in before.bonds],
        }
    )
    original = before.to_bytes()
    result = (
        DirectMolecularEditor()
        .edit(
            before,
            [1],
            ModelElement(
                operation="atom.element",
                element="P",
            ),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit
    )
    assert result.structure.atoms[0].element == "P"
    assert result.structure.atoms[0].formal_charge is None
    assert result.structure.atoms[1:] == before.atoms[1:]
    assert result.structure.bonds == before.bonds
    assert result.structure.conformers == before.conformers
    assert before.to_bytes() == original
    assert any(w.code == "model_chemistry_unknown" for w in result.warnings)


def test_covalent_protein_ligand_link_and_unknown_protein_do_not_block_edit() -> None:
    before = prepared_complex()
    target = next(a.id for a in before.atoms if a.formal_charge == 0)
    link = Bond(id=10000, atom_1_id=1, atom_2_id=target, order=None)
    before = before.model_copy(update={"bonds": [*before.bonds, link]})
    result = (
        DirectMolecularEditor()
        .edit(
            before,
            [target],
            ModelCharge(
                operation="atom.charge.set",
                charge=2,
            ),
            next_atom_id=20000,
            next_bond_id=20000,
        )
        .edit.structure
    )
    assert next(a for a in result.atoms if a.id == target).formal_charge == 2
    assert result.atoms[: target - 1] == before.atoms[: target - 1]
    assert result.bonds == before.bonds
    assert result.residues == before.residues
    assert result.structure_type == "complex"


def test_hydrogen_and_last_atom_deletion_are_literal_and_reversible_snapshots() -> None:
    before = paracetamol(orphan_h=True)
    h = next(a.id for a in before.atoms if a.element == "H")
    removed = (
        DirectMolecularEditor()
        .edit(
            before,
            [h],
            ModelDelete(
                operation="atom.delete",
            ),
            next_atom_id=100,
            next_bond_id=100,
            hydrogen_policy="complete_if_possible",
        )
        .edit
    )
    assert removed.deleted_atom_ids == (h,)
    assert len(removed.structure.atoms) == len(before.atoms) - 1
    assert removed.created_atom_ids == ()
    empty = (
        DirectMolecularEditor()
        .edit(
            before,
            [a.id for a in before.atoms],
            ModelDelete(
                operation="atom.delete",
            ),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit.structure
    )
    assert empty.atoms == [] and empty.bonds == []
    assert all(c.coordinates == [] for c in empty.conformers)
    assert type(empty).from_bytes(empty.to_bytes()) == empty


def test_break_aromatic_bonds_and_edit_unbonded_h_without_sanitizing() -> None:
    before = paracetamol()
    bond = next(b for b in before.bonds if b.aromatic)
    result = (
        DirectMolecularEditor()
        .edit(
            before,
            [bond.atom_1_id, bond.atom_2_id],
            ModelBondDelete(operation="bond.delete"),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit
    )
    assert result.deleted_bond_ids == (bond.id,)
    assert (
        tuple(sorted((bond.atom_1_id, bond.atom_2_id)))
        in modeling_metadata(result.structure).excluded_bonds
    )
    assert result.structure.atoms == before.atoms
    h = next(a.id for a in before.atoms if a.element == "H")
    changed = (
        DirectMolecularEditor()
        .edit(
            result.structure,
            [h],
            ModelElement(operation="atom.element", element="C"),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit
    )
    assert next(a for a in changed.structure.atoms if a.id == h).element == "C"
    assert changed.created_atom_ids == ()


def test_bond_assignment_and_removal_cover_inferred_display_and_arbitrary_geometry() -> None:
    before = paracetamol()
    editor = DirectMolecularEditor()
    pair = [1, len(before.atoms)]
    excluded = editor.edit(
        before, pair, ModelBondDelete(operation="bond.delete"), next_atom_id=100, next_bond_id=100
    ).edit.structure
    assert (1, len(before.atoms)) in modeling_metadata(excluded).excluded_bonds
    linked = editor.edit(
        excluded,
        pair,
        ModelBondSet(operation="bond.set", order=None),
        next_atom_id=100,
        next_bond_id=100,
    ).edit.structure
    assert linked.bonds[-1].order is None
    assert linked.bonds[-1].id == 100
    assert modeling_metadata(linked).excluded_bonds == []
    assert linked.atoms == before.atoms
    with pytest.raises(InvalidModelEdit, match="already"):
        editor.edit(
            linked,
            pair,
            ModelBondSet(operation="bond.set", order=None),
            next_atom_id=101,
            next_bond_id=101,
        )


def test_failed_optional_hydrogen_completion_keeps_direct_charge_and_unknown_values() -> None:
    before = paracetamol().model_copy(update={"structure_type": "unknown"})
    before = before.model_copy(
        update={"atoms": [a.model_copy(update={"formal_charge": None}) for a in before.atoms]}
    )
    result = (
        DirectMolecularEditor()
        .edit(
            before,
            [1],
            ModelCharge(operation="atom.charge.set", charge=0),
            next_atom_id=100,
            next_bond_id=100,
            hydrogen_policy="complete_if_possible",
        )
        .edit
    )
    assert result.structure.atoms[0].formal_charge == 0
    assert result.structure.atoms[1:] == before.atoms[1:]
    assert any(w.code == "model_hydrogen_completion_skipped" for w in result.warnings)


def test_optional_completion_resource_limit_keeps_the_direct_edit() -> None:
    from tests.unit.editing.test_ligand_editor import ligand

    before = ligand("CO")
    editor = DirectMolecularEditor()
    action = ModelElement(operation="atom.element", element="N")
    arguments = {
        "next_atom_id": 100,
        "next_bond_id": 100,
        "hydrogen_policy": "complete_if_possible",
    }
    # A real successful helper result establishes the resource-limit path.
    completed = editor.edit(before, [1], action, **arguments).edit
    assert completed.created_atom_ids
    limited = editor.edit(before, [1], action, atom_limit=len(before.atoms), **arguments).edit
    assert limited.created_atom_ids == ()
    assert limited.structure.atoms[0].element == "N"
    assert limited.structure.atoms[1:] == before.atoms[1:]
    assert limited.structure.conformers == before.conformers
    assert any(w.code == "model_hydrogen_completion_skipped" for w in limited.warnings)


def test_successful_optional_h_adds_only_h_and_keeps_direct_records_exact() -> None:
    from tests.unit.editing.test_ligand_editor import ligand

    before = ligand("CO")
    editor = DirectMolecularEditor()
    action = ModelElement(operation="atom.element", element="N")
    direct = editor.edit(before, [1], action, next_atom_id=3, next_bond_id=2).edit.structure
    completed = editor.edit(
        before, [1], action, next_atom_id=3, next_bond_id=2, hydrogen_policy="complete_if_possible"
    ).edit
    assert completed.created_atom_ids
    assert completed.structure.atoms[: len(direct.atoms)] == direct.atoms
    assert completed.structure.bonds[: len(direct.bonds)] == direct.bonds
    assert (
        completed.structure.conformers[0].coordinates[: len(direct.atoms)]
        == direct.active_coordinates
    )
    new = [a for a in completed.structure.atoms if a.id in completed.created_atom_ids]
    assert all(a.element == "H" for a in new)
    parents = {a.id: a for a in direct.atoms}
    for hydrogen in new:
        bond = next(
            b for b in completed.structure.bonds if hydrogen.id in {b.atom_1_id, b.atom_2_id}
        )
        parent = parents[bond.atom_2_id if bond.atom_1_id == hydrogen.id else bond.atom_1_id]
        assert hydrogen.residue_id == parent.residue_id


@pytest.mark.parametrize(
    "metadata",
    [
        {"schema_version": 2, "excluded_bonds": []},
        {"schema_version": 1, "excluded_bonds": [[1, 1]]},
        {"schema_version": 1, "excluded_bonds": [[1, 99999]]},
        {"schema_version": 1, "excluded_bonds": [[True, 2]]},
    ],
)
def test_invalid_authored_metadata_is_not_silently_repaired(metadata: dict) -> None:
    before = paracetamol().model_copy(update={"metadata": {"neistra_modeling": metadata}})
    snapshot = before.to_bytes()
    with pytest.raises(InvalidModelEdit):
        DirectMolecularEditor().edit(
            before,
            [1],
            ModelCharge(operation="atom.charge.set", charge=1),
            next_atom_id=100,
            next_bond_id=100,
        )
    assert before.to_bytes() == snapshot


def test_authored_values_clear_inference_labels_without_rewriting_historical_provenance() -> None:
    before = paracetamol()
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(
                    update={"inferred_fields": ["formal_charge", "chemistry", "coordinates"]}
                )
                if a.id == 1
                else a
                for a in before.atoms
            ]
        }
    )
    after = (
        DirectMolecularEditor()
        .edit(
            before,
            [1],
            ModelCharge(operation="atom.charge.set", charge=2),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit.structure
    )
    assert after.atoms[0].inferred_fields == ["coordinates"]
    assert after.inferences == before.inferences
