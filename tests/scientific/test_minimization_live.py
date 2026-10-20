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


@pytest.mark.skipif(
    not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"), reason="Locked native qualification required"
)
@pytest.mark.parametrize("termination", ["iteration", "line_search", "evaluation_limit"])
def test_improving_native_partial_is_eligible_only_for_ordinary_iteration_limit(
    tmp_path, monkeypatch, termination
):
    from molweave_core.minimization.contracts import eligible_nonconvergence

    parameters, inputs = capture(molecule(), max_iterations=1)
    parameters = parameters.model_copy(
        update={"schema_version": 2, "acceptance_policy": "interactive"}
    )
    value = isolated_preflight(parameters, inputs)
    context = LocalContext(tmp_path)
    model = parameterize_isolated(value, AmberTools.discover(), tmp_path / "model", context)
    original_solver = optimize.minimize

    def solver(*args, **kwargs):
        # Genuine native finite coordinates/energy, with controlled termination flags
        # to qualify the acceptance guard, not to claim these failures occurred.
        result = original_solver(*args, **kwargs)
        if termination == "line_search":
            result.status, result.message = 2, "ABNORMAL: "
        elif termination == "evaluation_limit":
            result.status, result.nfev = 1, 20000
            result.message = "STOP: TOTAL NO. OF F,G EVALUATIONS EXCEEDS LIMIT"
        return result

    monkeypatch.setattr(optimize, "minimize", solver)
    report, _ = optimize.optimize_isolated(value, model, parameters, context)
    assert report.outcome == "non_converged" and report.final_energy < report.initial_energy
    assert eligible_nonconvergence(report) is (termination == "iteration")
