from __future__ import annotations

import numpy as np
import pytest
from molweave_core.editing.model import ModelBondSet
from molweave_core.molecular import Conformer

from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_hydrogen_reconciliation import apply


@pytest.mark.parametrize(
    "smiles,order,expected_cos", [("CC", 2.0, -0.5), ("C=C", 1.0, -1 / 3), ("CC", 3.0, -1.0)]
)
def test_independent_coordination_geometry_and_exact_unrelated_rows(
    smiles: str, order: float, expected_cos: float
) -> None:
    before = model(smiles + ".O")
    before = before.model_copy(
        update={
            "conformers": [
                *before.conformers,
                Conformer(
                    id=7,
                    name="Translated",
                    coordinates=[(x + 7, y - 3, z + 1) for x, y, z in before.active_coordinates],
                ),
            ]
        }
    )
    result = apply(before, ModelBondSet(operation="bond.set", order=order))
    after = result.edit.structure
    ids = {a.id: n for n, a in enumerate(after.atoms)}
    for c in after.conformers:
        center = np.array(c.coordinates[ids[1]])
        vectors = [
            np.array(c.coordinates[ids[b.atom_2_id if b.atom_1_id == 1 else b.atom_1_id]]) - center
            for b in after.bonds
            if 1 in {b.atom_1_id, b.atom_2_id}
        ]
        directions = np.array([v / np.linalg.norm(v) for v in vectors])
        cosines = directions @ directions.T
        assert cosines[np.triu_indices(len(vectors), 1)] == pytest.approx(expected_cos, abs=1e-6)
        original = next(k for k in before.conformers if k.id == c.id)
        for n, atom in enumerate(before.atoms):
            if atom.element != "H" or atom.id == 3:
                assert c.coordinates[ids[atom.id]] == original.coordinates[n]
    assert after.source == before.source


def test_new_stereocentre_does_not_get_arbitrary_h_choice() -> None:
    before = model("CCC.C")
    result = apply(before, ModelBondSet(operation="bond.set", order=1.0), [2, 4])
    assert result.hydrogen_reconciliation_report.status == "complete"
    before = model("CCCl.CN")
    result = apply(before, ModelBondSet(operation="bond.set", order=1.0), [2, 4])
    assert "undetermined_configuration" in result.hydrogen_reconciliation_report.reason_counts
