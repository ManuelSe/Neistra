from __future__ import annotations

import pytest
from molweave_core.minimization.contracts import (
    MinimizationParameters,
    MinimizationReport,
    eligible_nonconvergence,
)

from tests.support.minimization import capture, molecule


def report():
    params, _ = capture(molecule(), max_iterations=1)
    params = params.model_copy(update={"schema_version": 2, "acceptance_policy": "interactive"})
    return MinimizationReport(
        schema_version=2,
        parameters=params,
        outcome="non_converged",
        reason="Iteration limit",
        termination_kind="iteration_limit",
        nonconverged_eligible=True,
        new_severe_overlaps=False,
        initial_energy=100,
        final_energy=99,
        maximum_gradient=1000,
    )


@pytest.mark.parametrize(
    "change",
    [
        {"schema_version": 1},
        {"outcome": "failed"},
        {"outcome": "blocked"},
        {"termination_kind": "abnormal"},
        {"nonconverged_eligible": False},
        {"new_severe_overlaps": True},
        {"new_severe_overlaps": None},
        {"initial_energy": None},
        {"final_energy": None},
        {"maximum_gradient": None},
        {"final_energy": 100},
        {"final_energy": 100 - 1e-8},
    ],
)
def test_warned_acceptance_refuses_insufficient_or_historical_evidence(change):
    value = report()
    assert eligible_nonconvergence(value)
    assert not eligible_nonconvergence(value.model_copy(update=change))


def test_strict_policy_and_old_serialization_remain_exact():
    value = report()
    strict = value.parameters.model_copy(update={"acceptance_policy": "strict"})
    assert not eligible_nonconvergence(value.model_copy(update={"parameters": strict}))
    old, _ = capture(molecule())
    old_json = old.model_dump(mode="json")
    assert "acceptance_policy" not in old_json
    assert MinimizationParameters.model_validate(old_json).model_dump(mode="json") == old_json
    # Already persisted C2 schema2 jobs do not acquire an extra default field.
    old_json.update(schema_version=2, context_policy="automatic")
    assert MinimizationParameters.model_validate(old_json).model_dump(mode="json") == old_json
    old_report = value.model_copy(update={"schema_version": 1}).model_dump(mode="json")
    assert "nonconverged_eligible" not in old_report
    assert not eligible_nonconvergence(MinimizationReport.model_validate(old_report))


def test_overlap_guard_detects_new_pairs_without_rejecting_existing_or_bonded_pairs():
    import numpy as np
    from molweave_core.minimization.optimize import introduces_severe_overlap

    original = np.asarray([[0.0, 0.0, 0.0], [3.0, 0.0, 0.0], [0.0, 0.3, 0.0]])
    final = original.copy()
    final[0] = [3.0, 0.2, 0.0]
    movable = np.asarray([0], dtype=np.int64)
    assert introduces_severe_overlap(original, final, movable, set(), lambda: None)
    assert not introduces_severe_overlap(
        original, final, movable, {frozenset((0, 1))}, lambda: None
    )
    assert not introduces_severe_overlap(original, original, movable, set(), lambda: None)
