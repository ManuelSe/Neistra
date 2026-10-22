import pytest
from molweave_core.editing.model import DirectMolecularEditor, InvalidModelEdit, ModelHydrogenAddOne
from molweave_core.molecular import Conformer, NormalizedStructureV1

from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_automatic_hydrogens import hcounts


def single(before: NormalizedStructureV1, parent: int = 1, **options):  # type: ignore[no-untyped-def]
    return DirectMolecularEditor().edit(
        before,
        [parent],
        ModelHydrogenAddOne(operation="hydrogens.add_one"),
        next_atom_id=max(1000, max(a.id for a in before.atoms) + 1),
        next_bond_id=max(1000, max((b.id for b in before.bonds), default=0) + 1),
        **options,
    )


@pytest.mark.parametrize(
    "smiles,parent,charge",
    [
        ("N", 1, 1),
        ("O", 1, 1),
        ("[OH-]", 1, 0),
        ("S", 1, 1),
        ("[SH-]", 1, 0),
        ("CSC", 2, 1),
        ("CS", 2, 1),
    ],
)
def test_single_hydrogen_supported_charge_changes(smiles: str, parent: int, charge: int) -> None:
    before = model(smiles)
    result = single(before, parent)
    after = result.edit.structure
    assert len(after.atoms) == len(before.atoms) + 1
    assert hcounts(after)[parent] == hcounts(before)[parent] + 1
    assert next(a.formal_charge for a in after.atoms if a.id == parent) == charge
    assert result.edit.created_atom_ids == (1000,)
    for old, new in zip(before.atoms, after.atoms, strict=False):
        assert old.coordinates == new.coordinates
        if old.id != parent:
            assert old == new
    assert after.source == before.source
    assert after.inferences[-1].code == "model_single_hydrogen"


@pytest.mark.parametrize(
    "element,maximum,charge", [("C", 4, 0), ("N", 4, 1), ("O", 3, 1), ("S", 3, 1)]
)
def test_single_hydrogen_repeated_deficit_filling_stops(
    element: str, maximum: int, charge: int
) -> None:
    before = model(element, remove_h_on={1})
    for count in range(1, maximum + 1):
        result = single(before)
        assert hcounts(result.edit.structure)[1] == count
        assert len(result.edit.created_atom_ids) == 1
        before = result.edit.structure
    assert before.atoms[0].formal_charge == charge
    with pytest.raises(InvalidModelEdit, match="No further"):
        single(before)


@pytest.mark.parametrize(
    "smiles,parent",
    [
        ("C", 1),
        ("[NH4+]", 1),
        ("[OH3+]", 1),
        ("[SH3+]", 1),
        ("CC(=O)N", 4),
        ("O=C", 1),
        ("CSCC", 2),
        ("CS(=O)C", 2),
        ("c1ccncc1", 4),
        ("P", 1),
        ("[2H]N", 2),
        ("[CH3]", 1),
    ],
)
def test_single_hydrogen_refuses_unqualified_states(smiles: str, parent: int) -> None:
    before = model(smiles)
    original = before.to_bytes()
    with pytest.raises(InvalidModelEdit):
        single(before, parent)
    assert before.to_bytes() == original


def test_single_hydrogen_unknowns_and_all_conformer_failure_are_atomic() -> None:
    before = model("N")
    unknown = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": None}) if a.id == 1 else a
                for a in before.atoms
            ]
        }
    )
    with pytest.raises(InvalidModelEdit, match="assigned"):
        single(unknown)
    bad = list(before.active_coordinates)
    bad[1] = bad[0]
    multi = before.model_copy(
        update={"conformers": [*before.conformers, Conformer(id=7, name="Bad", coordinates=bad)]}
    )
    with pytest.raises(InvalidModelEdit, match="no change"):
        single(multi)
    assert multi.atoms[0].formal_charge == 0
    with pytest.raises(InvalidModelEdit, match="budget"):
        single(before, atom_limit=len(before.atoms))


def test_single_hydrogen_retains_legacy_configurable_draft_addition() -> None:
    from molweave_core.editing.model import ModelHydrogenAdd

    before = model("C")
    result = DirectMolecularEditor().edit(
        before,
        [1],
        ModelHydrogenAdd(operation="hydrogens.add", count=1, geometry="tetrahedral"),
        next_atom_id=1000,
        next_bond_id=1000,
    )
    assert len(result.edit.created_atom_ids) == 0  # No free geometric slot, not a new valence gate.


@pytest.mark.parametrize("smiles", ["N", "O", "S"])
def test_single_hydrogen_later_explicit_charge_edit_can_reconcile_added_h(smiles: str) -> None:
    from molweave_core.editing.model import ModelCharge

    before = model(smiles)
    added = single(before).edit.structure
    result = DirectMolecularEditor().edit(
        added,
        [1],
        ModelCharge(operation="atom.charge.set", charge=0),
        next_atom_id=2000,
        next_bond_id=2000,
        hydrogen_policy="automatic",
    )
    assert result.edit.deleted_atom_ids == (1000,)
    assert hcounts(result.edit.structure)[1] == hcounts(before)[1]


def test_single_hydrogen_unknown_neighbor_bonds_cannot_certify_nonconjugation() -> None:
    before = model("NCC")
    before = before.model_copy(
        update={
            "bonds": [
                b.model_copy(update={"order": None}) if {b.atom_1_id, b.atom_2_id} == {2, 3} else b
                for b in before.bonds
            ]
        }
    )
    with pytest.raises(InvalidModelEdit, match="conjugated"):
        single(before)
