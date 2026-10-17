from __future__ import annotations

from collections import Counter

import pytest
from molweave_core.editing.model import (
    DirectMolecularEditor,
    InvalidModelEdit,
    ModelBondDelete,
    ModelBondSet,
    ModelDelete,
)
from molweave_core.molecular import Conformer, NormalizedStructureV1

from tests.support.hydrogen_fixture import model


def apply(
    before: NormalizedStructureV1,
    action: ModelBondSet | ModelBondDelete,
    targets: list[int] | None = None,
    **kwargs,
):  # type: ignore[no-untyped-def]
    return DirectMolecularEditor().edit(
        before,
        targets or [1, 2],
        action,
        next_atom_id=1000,
        next_bond_id=1000,
        hydrogen_policy="reconcile_if_possible",
        **kwargs,
    )


def hcounts(structure: NormalizedStructureV1) -> Counter[int]:
    atoms = {a.id: a for a in structure.atoms}
    return Counter(
        i
        for b in structure.bonds
        for i, j in [(b.atom_1_id, b.atom_2_id), (b.atom_2_id, b.atom_1_id)]
        if atoms[j].element == "H"
    )


@pytest.mark.parametrize(
    "smiles,order,count,removed,added",
    [
        ("CC", 2.0, 2, 2, 0),
        ("CC", 3.0, 1, 4, 0),
        ("C=C", 1.0, 3, 0, 2),
        ("C=C", 3.0, 1, 2, 0),
        ("C#C", 1.0, 3, 0, 4),
        ("C#C", 2.0, 2, 0, 2),
    ],
)
def test_bond_orders_reconcile_local_counts(
    smiles: str, order: float, count: int, removed: int, added: int
) -> None:
    before = model(smiles + ".O")
    result = apply(before, ModelBondSet(operation="bond.set", order=order))
    report = result.hydrogen_reconciliation_report
    assert report and report.status == "complete"
    assert report.removed_hydrogen_count == removed
    assert report.added_hydrogen_count == added
    assert hcounts(result.edit.structure)[1] == hcounts(result.edit.structure)[2] == count
    for atom in before.atoms:
        if atom.element != "H" or atom.residue_id != before.atoms[0].residue_id:
            assert (
                next(a for a in result.edit.structure.atoms if a.id == atom.id).coordinates
                == atom.coordinates
            )


def test_closure_removes_highest_h_ids_and_retains_survivors_deterministically() -> None:
    before = model("CCCC")
    action = ModelBondSet(operation="bond.set", order=1.0)
    first = apply(before, action, [1, 4])
    second = apply(before, action, [4, 1])
    assert first == second
    assert hcounts(first.edit.structure)[1] == hcounts(first.edit.structure)[4] == 2
    assert first.edit.deleted_atom_ids == (7, 14)
    assert first.edit.created_atom_ids == ()
    assert first.hydrogen_reconciliation_report.removed_hydrogen_count == 2
    assert NormalizedStructureV1.from_bytes(first.edit.structure.to_bytes()) == first.edit.structure


def test_deletion_and_readdition_saturate_endpoints_once() -> None:
    before = model("CC")
    broken = apply(before, ModelBondDelete(operation="bond.delete"))
    assert hcounts(broken.edit.structure)[1] == 4
    rejoined = DirectMolecularEditor().edit(
        broken.edit.structure,
        [1, 2],
        ModelBondSet(operation="bond.set", order=1.0),
        next_atom_id=2000,
        next_bond_id=2000,
        hydrogen_policy="reconcile_if_possible",
    )
    assert hcounts(rejoined.edit.structure)[1] == hcounts(rejoined.edit.structure)[2] == 3
    assert set(rejoined.edit.deleted_atom_ids) == set(broken.edit.created_atom_ids)


def test_failure_is_atomic_across_conformers_and_other_endpoint_can_succeed() -> None:
    before = model("CC")
    points = list(before.active_coordinates)
    points[1] = points[0]
    before = before.model_copy(
        update={
            "conformers": [
                *before.conformers,
                Conformer(id=9, name="Coincident", coordinates=points),
            ]
        }
    )
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0))
    assert result.hydrogen_reconciliation_report.skipped_count == 2
    assert result.edit.structure.conformers == before.conformers
    assert {a.id for a in result.edit.structure.atoms} == {a.id for a in before.atoms}
    partial = model("CC")
    partial = partial.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": None}) if a.id == 1 else a
                for a in partial.atoms
            ]
        }
    )
    result = apply(partial, ModelBondSet(operation="bond.set", order=2.0))
    assert result.hydrogen_reconciliation_report.status == "partial"
    assert hcounts(result.edit.structure)[1] == 3 and hcounts(result.edit.structure)[2] == 2


@pytest.mark.parametrize(
    "reason,change",
    [
        ("unknown_charge", {"formal_charge": None}),
        ("unsupported_state", {"formal_charge": 7}),
    ],
)
def test_unknown_or_unsupported_parent_retains_direct_edit(reason: str, change: dict) -> None:
    before = model("CC")
    before = before.model_copy(
        update={"atoms": [a.model_copy(update=change) if a.id == 1 else a for a in before.atoms]}
    )
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0))
    assert reason in result.hydrogen_reconciliation_report.reason_counts
    assert result.edit.structure.bonds[0].order == 2


def test_protected_isotope_site_is_not_arbitrarily_deleted_or_moved() -> None:
    before = model("[2H]CC")
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0), [2, 3])
    assert "protected_identity" in result.hydrogen_reconciliation_report.reason_counts
    assert result.edit.structure.atoms[0] == before.atoms[0]
    assert hcounts(result.edit.structure)[2] == hcounts(before)[2]


def test_explicit_h_bond_deletion_is_never_reversed_and_policies_are_distinct() -> None:
    before = model("CC")
    result = apply(before, ModelBondDelete(operation="bond.delete"), [1, 3])
    assert len(result.edit.structure.atoms) == len(before.atoms)
    assert len(result.edit.structure.bonds) == len(before.bonds) - 1
    assert result.edit.structure.conformers == before.conformers
    with pytest.raises(InvalidModelEdit, match="requires a direct bond"):
        DirectMolecularEditor().edit(
            before,
            [3],
            ModelDelete(operation="atom.delete"),
            next_atom_id=1000,
            next_bond_id=1000,
            hydrogen_policy="reconcile_if_possible",
        )
