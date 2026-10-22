from collections import Counter

import pytest
from molweave_core.editing.model import (
    DirectMolecularEditor,
    ModelAtomAdd,
    ModelBondDelete,
    ModelBondSet,
    ModelCharge,
    ModelDelete,
    ModelElement,
    ModelFragmentAdd,
)
from molweave_core.molecular import Conformer, NormalizedStructureV1

from tests.support.hydrogen_fixture import model


def automatic(before, selected, action, **options):  # type: ignore[no-untyped-def]
    return DirectMolecularEditor().edit(
        before,
        selected,
        action,
        next_atom_id=1000,
        next_bond_id=1000,
        hydrogen_policy="automatic",
        **options,
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
    "action,expected",
    [
        (ModelAtomAdd(operation="atom.add", element="N"), {1: 3, 1000: 2}),
        (ModelFragmentAdd(operation="fragment.attach", fragment="ethyl"), {1: 3, 1000: 2, 1001: 3}),
        (ModelElement(operation="atom.element", element="N"), {1: 3}),
        (ModelCharge(operation="atom.charge.set", charge=1), {1: 0}),
    ],
)
def test_automatic_hydrogen_local_edits(action, expected):  # type: ignore[no-untyped-def]
    before = model("C.O")
    result = automatic(before, [1], action)
    after = result.edit.structure
    for parent, count in expected.items():
        # Unsupported C+ remains a literal draft, rather than inventing a charge rule.
        if isinstance(action, ModelCharge):
            assert hcounts(after)[parent] == 4
            assert result.hydrogen_reconciliation_report.skipped_count == 1
        else:
            assert hcounts(after)[parent] == count
    original = {a.id: a for a in before.atoms}
    for atom in after.atoms:
        if atom.id in original and atom.element != "H":
            assert atom.coordinates == original[atom.id].coordinates
    oxygen = next(a.id for a in before.atoms if a.element == "O")
    assert hcounts(after)[oxygen] == 2
    assert after.source == before.source
    assert NormalizedStructureV1.from_bytes(after.to_bytes()) == after


def test_automatic_hydrogen_delete_cascades_but_legacy_is_literal() -> None:
    before = model("CC.O")
    attached = {b.atom_2_id for b in before.bonds if b.atom_1_id == 1 and b.atom_2_id > 3}
    deleted = automatic(before, [1], ModelDelete(operation="atom.delete"))
    assert set(deleted.edit.deleted_atom_ids) == {1, *attached}
    assert hcounts(deleted.edit.structure)[2] == 4
    literal = DirectMolecularEditor().edit(
        before,
        [1],
        ModelDelete(operation="atom.delete"),
        next_atom_id=1000,
        next_bond_id=1000,
    )
    assert literal.edit.deleted_atom_ids == (1,)


def test_automatic_hydrogen_explicit_deletion_and_break_are_not_reversed() -> None:
    before = model("C")
    hydrogen = next(a.id for a in before.atoms if a.element == "H")
    deleted = automatic(before, [hydrogen], ModelDelete(operation="atom.delete"))
    assert deleted.edit.created_atom_ids == ()
    assert hcounts(deleted.edit.structure)[1] == 3
    broken = automatic(before, [1, hydrogen], ModelBondDelete(operation="bond.delete"))
    assert broken.edit.created_atom_ids == ()
    assert broken.edit.deleted_atom_ids == ()
    assert hcounts(broken.edit.structure)[1] == 3


@pytest.mark.parametrize(
    "smiles,charge,count", [("N", 1, 4), ("[NH4+]", 0, 3), ("O", 1, 3), ("[SH3+]", 0, 2)]
)
def test_automatic_hydrogen_explicit_charge_assignments(
    smiles: str, charge: int, count: int
) -> None:
    before = model(smiles)
    after = automatic(before, [1], ModelCharge(operation="atom.charge.set", charge=charge))
    assert hcounts(after.edit.structure)[1] == count
    assert after.edit.structure.atoms[0].formal_charge == charge


def test_automatic_hydrogen_new_conformers_and_empty_entry() -> None:
    before = model("C")
    before = before.model_copy(
        update={
            "conformers": [
                *before.conformers,
                Conformer(
                    id=7,
                    name="Shifted",
                    coordinates=[(x + 9, y - 4, z + 3) for x, y, z in before.active_coordinates],
                ),
            ]
        }
    )
    after = automatic(before, [1], ModelAtomAdd(operation="atom.add", element="O"))
    assert hcounts(after.edit.structure)[1] == 3
    assert hcounts(after.edit.structure)[1000] == 1
    assert len({len(c.coordinates) for c in after.edit.structure.conformers}) == 1
    emptied = before.model_copy(
        update={
            "atoms": [],
            "bonds": [],
            "conformers": [c.model_copy(update={"coordinates": []}) for c in before.conformers],
        }
    )
    rebuilt = automatic(emptied, [], ModelAtomAdd(operation="atom.add", element="C"))
    assert len(rebuilt.edit.structure.atoms) == 5


def test_automatic_hydrogen_independent_unknown_and_protected_sites() -> None:
    before = model("[2H]CC")
    result = automatic(before, [2, 3], ModelBondSet(operation="bond.set", order=2.0))
    assert result.hydrogen_reconciliation_report.status == "partial"
    assert "protected_identity" in result.hydrogen_reconciliation_report.reason_counts
    assert result.edit.structure.atoms[0] == before.atoms[0]
    unknown = model("CC")
    unknown = unknown.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": None}) if a.id == 1 else a
                for a in unknown.atoms
            ]
        }
    )
    result = automatic(unknown, [1, 2], ModelBondSet(operation="bond.set", order=2.0))
    assert result.hydrogen_reconciliation_report.status == "partial"
    assert hcounts(result.edit.structure)[1] == 3
    assert hcounts(result.edit.structure)[2] == 2


def test_automatic_hydrogen_labelled_terminal_cascades_on_explicit_parent_delete() -> None:
    before = model("[2H]C")
    result = automatic(before, [2], ModelDelete(operation="atom.delete"))
    assert result.edit.structure.atoms == []
    assert set(result.edit.deleted_atom_ids) == {a.id for a in before.atoms}


def test_automatic_hydrogen_failed_conformer_keeps_site_and_direct_edit() -> None:
    before = model("CC")
    points = list(before.active_coordinates)
    points[1] = points[0]
    before = before.model_copy(
        update={"conformers": [*before.conformers, Conformer(id=7, name="Bad", coordinates=points)]}
    )
    result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=2.0))
    assert result.edit.structure.conformers == before.conformers
    assert result.edit.structure.bonds[0].order == 2.0
    assert result.hydrogen_reconciliation_report.skipped_count == 2
