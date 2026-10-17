import pytest
from molweave_core.editing.hydrogen import HydrogenBuilder, apply_hydrogen_proposal
from molweave_core.editing.model import DirectMolecularEditor, ModelCharge
from molweave_core.molecular import Conformer

from tests.support.hydrogen_fixture import model


def materialize(before, proposal):  # type: ignore[no-untyped-def]
    return apply_hydrogen_proposal(
        before, proposal, next_atom_id=1000, next_bond_id=1000, operation="hydrogens.complete"
    )[0]


@pytest.mark.parametrize(
    ("smiles", "target", "count"),
    [
        ("CC", 1, 3),
        ("C=C", 1, 2),
        ("C#C", 1, 1),
        ("CN", 2, 2),
        ("C[NH3+]", 2, 3),
        ("CO", 2, 1),
        ("C[O-]", 2, 0),
        ("CS", 2, 1),
        ("c1ccccc1", 1, 1),
        ("c1ccncc1", 4, 0),
        ("CC(=O)N", 4, 2),
    ],
)
def test_local_profile_counts(smiles: str, target: int, count: int) -> None:
    before = model(smiles, remove_h_on={target})
    proposal = HydrogenBuilder(before).propose([target])
    assert proposal.report.added_hydrogen_count == count, proposal.report
    after = materialize(before, proposal)
    assert [a.coordinates for a in after.atoms[: len(before.atoms)]] == [
        a.coordinates for a in before.atoms
    ]
    assert after.source == before.source
    assert after.bonds[: len(before.bonds)] == before.bonds


def test_remote_unknown_does_not_block_local_count_and_partial_has_precise_reason() -> None:
    before = model("CC.CO", remove_h_on={1, 4})
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": None}) if a.id == 4 else a
                for a in before.atoms
            ]
        }
    )
    proposal = HydrogenBuilder(before).propose([1, 4])
    assert proposal.report.status == "partial"
    assert proposal.report.added_hydrogen_count == 3
    assert proposal.report.reason_counts["unknown_charge"] == 1
    assert proposal.report.diagnostics[-1].atom_id == 4


def test_optional_completion_targets_neighbors_and_retains_old_conformer_coordinates() -> None:
    before = model("CC", remove_h_on={1})
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": None}) if a.id == 2 else a
                for a in before.atoms
            ]
        }
    )
    second = Conformer(
        id=9,
        name="Translated",
        coordinates=[(x + 10, y - 5, z + 2) for x, y, z in before.active_coordinates],
    )
    before = before.model_copy(update={"conformers": [*before.conformers, second]})
    result = DirectMolecularEditor().edit(
        before,
        [2],
        ModelCharge(operation="atom.charge.set", charge=0),
        next_atom_id=1000,
        next_bond_id=1000,
        hydrogen_policy="complete_if_possible",
    )
    assert result.hydrogen_report is not None
    assert result.hydrogen_report.added_hydrogen_count == 3
    for old, new in zip(before.conformers, result.edit.structure.conformers, strict=True):
        assert new.coordinates[: len(before.atoms)] == old.coordinates
    for first, second_point in zip(
        result.edit.structure.conformers[0].coordinates[-3:],
        result.edit.structure.conformers[1].coordinates[-3:],
        strict=True,
    ):
        assert second_point == pytest.approx((first[0] + 10, first[1] - 5, first[2] + 2))


def test_site_failure_in_one_conformer_skips_every_conformer() -> None:
    before = model("CC", remove_h_on={1})
    points = list(before.active_coordinates)
    points[1] = points[0]
    before = before.model_copy(
        update={
            "conformers": [
                *before.conformers,
                Conformer(id=2, name="Degenerate", coordinates=points),
            ]
        }
    )
    proposal = HydrogenBuilder(before).propose([1])
    assert not proposal.sites
    assert proposal.report.reason_counts == {"degenerate_geometry": 1}
    assert materialize(before, proposal) is before
