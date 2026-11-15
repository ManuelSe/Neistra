"""Direct rotation admission uses canonical chemistry before toolkit projection."""

import numpy as np
import pytest
from neistra_core.editing.model import DirectMolecularEditor, InvalidModelEdit, ModelBondRotate
from neistra_core.molecular import NormalizedStructureV1

from tests.scientific.test_conformer_bond_rotation import conformer_ligand

ADMISSION_MESSAGE = "Choose a nonaromatic single bond with known order."


def axis_model(order: float | None, aromatic: bool = False) -> NormalizedStructureV1:
    before = conformer_ligand()
    return before.model_copy(
        update={
            "bonds": [
                b.model_copy(update={"order": order, "aromatic": aromatic}) if b.id == 71 else b
                for b in before.bonds
            ]
        }
    )


@pytest.mark.parametrize("angle", [0.0, 60.0])
@pytest.mark.parametrize(
    "order,aromatic",
    [(None, False), (2.0, False), (3.0, False), (1.5, True), (1.0, True), (1.5, False)],
)
def test_direct_rotation_refuses_unknown_multiple_and_aromatic_canonical_axis(
    order: float | None, aromatic: bool, angle: float
) -> None:
    before = axis_model(order, aromatic)
    snapshot = before.to_bytes()
    with pytest.raises(InvalidModelEdit) as rejected:
        DirectMolecularEditor().edit(
            before,
            [20, 30],
            ModelBondRotate(operation="bond.rotate", moving_endpoint_id=30, angle_degrees=angle),
            next_atom_id=200,
            next_bond_id=200,
        )
    if order is None:
        assert str(rejected.value) == ADMISSION_MESSAGE
    assert before.to_bytes() == snapshot


@pytest.mark.parametrize("angle", [0.0, 60.0])
def test_known_single_axis_preserves_zero_setup_and_analytic_rotation(angle: float) -> None:
    before = axis_model(1.0)
    result = DirectMolecularEditor().edit(
        before,
        [20, 30],
        ModelBondRotate(operation="bond.rotate", moving_endpoint_id=30, angle_degrees=angle),
        next_atom_id=200,
        next_bond_id=200,
    )
    after = result.edit.structure
    if angle == 0:
        assert result.no_op and after == before
    else:
        assert not result.no_op
        # Analytic +60 degrees in each fixture frame; atom 40 alone moves.
        expected = [
            (1.5, 0.5, 3**0.5 / 2),
            (6.5, -1.5, 4 + 3**0.5 / 2),
            (-8 + 3**0.5 / 2, 5.5, 0.5),
        ]
        for old, frame, point in zip(before.conformers, after.conformers, expected, strict=True):
            np.testing.assert_allclose(frame.coordinates[3], point, rtol=0, atol=1e-12)
            for index in [0, 1, 2, 4]:
                assert frame.coordinates[index] == old.coordinates[index]
    assert after.bonds == before.bonds
    assert after.source == before.source
    assert after.metadata == before.metadata
    assert after.annotations == before.annotations
