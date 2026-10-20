from __future__ import annotations

import os

import numpy as np
import pytest
from molweave_core.minimization import optimize
from molweave_core.minimization.live import SnapshotPublisher, read_snapshot
from molweave_core.minimization.parameterization import parameterize_isolated
from molweave_core.minimization.preflight import isolated_preflight
from molweave_core.minimization.toolchain import AmberTools

from tests.support.minimization import LocalContext, capture, molecule


@pytest.mark.skipif(
    not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"),
    reason="Locked native callback qualification required",
)
def test_live_coordinates_come_from_accepted_iterates_not_last_trial(tmp_path, monkeypatch):
    source = molecule()
    before = source.to_bytes()
    parameters, inputs = capture(source, [3])
    value = isolated_preflight(parameters, inputs)
    context = LocalContext(tmp_path)
    model = parameterize_isolated(value, AmberTools.discover(), tmp_path / "model", context)
    publisher = SnapshotPublisher(parameters, context)
    accepted = []
    original = optimize.minimize

    def solver(function, initial, **options):
        callback = options.pop("callback")

        def iteration(point):
            accepted.append(point.copy())
            function(point + 0.003)  # Deliberately leave the mutable engine at another trial.
            callback(point)

        return original(function, initial, callback=iteration, **options)

    monkeypatch.setattr(optimize, "minimize", solver)
    report, proposal = optimize.optimize_isolated(
        value, model, parameters, context, publisher.publish
    )
    frame = read_snapshot(tmp_path, parameters)
    assert report.outcome == "converged" and report.final_energy < report.initial_energy
    assert accepted and frame is not None
    np.testing.assert_allclose(
        frame.entries[0].coordinates,
        accepted[frame.iteration - 1].reshape((-1, 3)) * 10,
        rtol=0,
        atol=0,
    )
    assert frame.entries[0].atom_ids == [3] and proposal.atom_ids == [3]
    assert len(context.values) <= int(report.elapsed_seconds) + 2
    assert source.to_bytes() == before and inputs[0].data == before
