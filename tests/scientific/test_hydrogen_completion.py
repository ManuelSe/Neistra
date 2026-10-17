from molweave_core.editing.hydrogen import HydrogenBuilder

from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_hydrogen_completion import materialize


def test_mixed_hydrogen_equivalent_branches_do_not_create_false_stereo_gate() -> None:
    before = model("CC(C)C(=O)Nc1ccc(O)cc1", remove_h_on={1})
    original = before.to_bytes()
    proposal = HydrogenBuilder(before).propose([1])
    assert proposal.report.added_hydrogen_count == 3
    after = materialize(before, proposal)
    assert next(a for a in after.atoms if a.id == 2).stereo is None
    assert before.to_bytes() == original
    assert after.source == before.source


def test_tetrahedral_completion_uses_geometry_without_requiring_current_annotation() -> None:
    before = model("C[C@H](O)F", remove_h_on={2})
    before = before.model_copy(
        update={"atoms": [a.model_copy(update={"stereo": None}) for a in before.atoms]}
    )
    proposal = HydrogenBuilder(before).propose([2])
    assert proposal.report.added_hydrogen_count == 1
    after = materialize(before, proposal)
    assert next(a for a in after.atoms if a.id == 2).stereo in {"TETRAHEDRAL_CW", "TETRAHEDRAL_CCW"}
    assert after.source == before.source


def test_double_bond_completion_retains_3d_geometry_and_reconciles_current_annotation() -> None:
    before = model("C/C=C/C", remove_h_on={2, 3})
    proposal = HydrogenBuilder(before).propose([2, 3])
    assert proposal.report.added_hydrogen_count == 2
    after = materialize(before, proposal)
    assert [a.coordinates for a in after.atoms[: len(before.atoms)]] == [
        a.coordinates for a in before.atoms
    ]
    assert next(b for b in after.bonds if b.order == 2).stereo in {"E", "TRANS"}
