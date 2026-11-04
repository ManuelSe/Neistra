"""Compatibility package; implementation lives in neistra_api."""

import importlib
import sys
from pathlib import Path
from typing import Any

_root = Path(__file__).resolve().parents[4]
for _source in ("apps/api/src", "packages/neistra_core/src", "packages/neistra_demo_plugin/src"):
    _path = str(_root / _source)
    if _path not in sys.path:
        sys.path.append(_path)

_implementation = importlib.import_module("neistra_api")
__all__ = getattr(_implementation, "__all__", [])


def __getattr__(name: str) -> Any:
    return getattr(_implementation, name)
