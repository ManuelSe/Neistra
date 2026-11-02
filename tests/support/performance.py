"""Portable workflow checks with explicit reference-host timing qualification."""

from __future__ import annotations

import math
import os


def performance_enabled() -> bool:
    value = os.environ.get("NEISTRA_PERFORMANCE")
    if value not in (None, "0", "1"):
        raise ValueError("NEISTRA_PERFORMANCE must be unset, 0, or 1")
    return value == "1"


def performance_budget(actual: float, limit: float, label: str, *, inclusive: bool = True) -> None:
    assert math.isfinite(actual) and actual >= 0, f"{label}: invalid measurement {actual}"
    assert math.isfinite(limit) and limit > 0, f"{label}: invalid limit {limit}"
    if performance_enabled():
        within_target = actual <= limit if inclusive else actual < limit
        assert within_target, f"{label}: {actual} exceeds reference target {limit}"
