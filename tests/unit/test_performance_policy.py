from __future__ import annotations

import pytest

from tests.support.performance import performance_budget, performance_enabled


def test_latency_is_diagnostic_without_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NEISTRA_PERFORMANCE", raising=False)
    assert not performance_enabled()
    performance_budget(2.6, 2, "slow battery example")
    monkeypatch.setenv("NEISTRA_PERFORMANCE", "0")
    performance_budget(2.6, 2, "slow battery example")


def test_original_target_is_enforced_when_requested(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NEISTRA_PERFORMANCE", "1")
    assert performance_enabled()
    performance_budget(2, 2, "boundary")
    with pytest.raises(AssertionError, match="reference target"):
        performance_budget(2.6, 2, "slow example")


def test_strict_boundary_is_preserved(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NEISTRA_PERFORMANCE", "1")
    with pytest.raises(AssertionError, match="reference target"):
        performance_budget(2, 2, "boundary", inclusive=False)


@pytest.mark.parametrize("value", ["", "true", "false", "yes"])
def test_invalid_profile_fails(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("NEISTRA_PERFORMANCE", value)
    with pytest.raises(ValueError, match="NEISTRA_PERFORMANCE"):
        performance_enabled()


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1])
def test_invalid_measurement_always_fails(monkeypatch: pytest.MonkeyPatch, value: float) -> None:
    monkeypatch.delenv("NEISTRA_PERFORMANCE", raising=False)
    with pytest.raises(AssertionError, match="invalid measurement"):
        performance_budget(value, 2, "invalid")
