"""Lightweight configuration aliases shared by API, workers and native tools."""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping

_LOG = logging.getLogger(__name__)


def environment_value(
    name: str,
    default: str | None = None,
    *,
    environment: Mapping[str, str] | None = None,
) -> str | None:
    values = os.environ if environment is None else environment
    canonical, legacy = f"NEISTRA_{name}", f"MOLWEAVE_{name}"
    if canonical in values:
        if legacy in values and values[canonical] != values[legacy]:
            _LOG.warning("%s overrides conflicting %s", canonical, legacy)
        return values[canonical]
    return values.get(legacy, default)


def environment_string(name: str, default: str) -> str:
    value = environment_value(name, default)
    assert value is not None
    return value


def environment_flag(name: str, default: bool) -> bool:
    value = environment_string(name, "1" if default else "0")
    if value not in {"0", "1"}:
        raise ValueError(f"NEISTRA_{name} must be 0 or 1")
    return value == "1"


def environment_integer(name: str, default: int) -> int:
    try:
        value = int(environment_string(name, str(default)))
        if value > 0:
            return value
    except ValueError:
        pass
    raise ValueError(f"NEISTRA_{name} must be a positive integer")
