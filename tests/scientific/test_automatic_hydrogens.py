from itertools import combinations

import numpy as np
import pytest
from molweave_core.editing import reconciliation
from molweave_core.editing.model import ModelAtomAdd, ModelBondSet
from molweave_core.molecular import Conformer

from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_automatic_hydrogens import automatic, hcounts


@pytest.mark.parametrize(
    "order,expected_h,cosine", [(1.0, 3, -1 / 3), (2.0, 2, -0.5), (3.0, 1, -1.0)]
)
def test_automatic_hydrogen_independent_count_and_coordination(
    order: float, expected_h: int, cosine: float
) -> None:
    # Independent ideal heavy geometry isolates the expected H coordination.
    before = model("CC" if order != 1 else "C=C")
    points = list(before.active_coordinates)
    points[0], points[1] = (0.0, 0.0, 0.0), (1.5, 0.0, 0.0)
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": points[n]}) for n, a in enumerate(before.atoms)
            ],
            "conformers": [before.conformers[0].model_copy(update={"coordinates": points})],
        }
    )
    result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=order))
    after = result.edit.structure
    assert hcounts(after)[1] == hcounts(after)[2] == expected_h
    atoms = {a.id: a for a in after.atoms}
    vectors = np.asarray(
        [
            atoms[b.atom_2_id if b.atom_1_id == 1 else b.atom_1_id].coordinates
            for b in after.bonds
            if 1 in {b.atom_1_id, b.atom_2_id}
        ]
    ) - np.asarray(atoms[1].coordinates)
    vectors /= np.linalg.norm(vectors, axis=1)[:, None]
    for a, b in combinations(vectors, 2):
        assert float(a @ b) == pytest.approx(cosine, abs=1e-6)
    assert after.atoms[0].coordinates == before.atoms[0].coordinates
    assert after.atoms[1].coordinates == before.atoms[1].coordinates


def test_automatic_hydrogen_work_caps_do_not_partly_materialize_conformers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = model("C")
    before = before.model_copy(
        update={
            "conformers": [
                *before.conformers,
                Conformer(id=8, name="Other", coordinates=before.active_coordinates),
            ]
        }
    )
    monkeypatch.setattr(reconciliation, "MAX_COORDINATES", 1)
    result = automatic(before, [1], ModelAtomAdd(operation="atom.add", element="N"))
    assert len(result.edit.structure.atoms) == len(before.atoms) + 1
    assert result.hydrogen_reconciliation_report.unprocessed_count == 2
    assert all(
        len(c.coordinates) == len(before.atoms) + 1 for c in result.edit.structure.conformers
    )


def test_automatic_hydrogen_site_cap_reports_full_totals(monkeypatch: pytest.MonkeyPatch) -> None:
    before = model("CC")
    monkeypatch.setattr(reconciliation, "MAX_SITES", 1)
    result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=2.0))
    report = result.hydrogen_reconciliation_report
    assert report.target_count == 2
    assert report.completed_count == 1
    assert report.unprocessed_count == 1
    assert len(report.sites) == 1
    assert report.reason_counts["target_budget"] == 1
    assert hcounts(result.edit.structure)[2] == 3
