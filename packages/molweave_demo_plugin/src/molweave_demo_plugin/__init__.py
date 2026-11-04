"""Compatibility package; implementation lives in neistra_demo_plugin."""

import importlib
import sys
from pathlib import Path
from typing import Any

_root = Path(__file__).resolve().parents[4]
for _source in ("apps/api/src", "packages/neistra_core/src", "packages/neistra_demo_plugin/src"):
    _path = str(_root / _source)
    if _path not in sys.path:
        sys.path.append(_path)

__path__ = [str(_root / "packages/neistra_demo_plugin/src/molweave_demo_plugin")]

# Bind the legacy leaf before exporting the singleton, just like the original
# package initializer. Later cached leaf imports must not replace this export.
_legacy_leaf = importlib.import_module("molweave_demo_plugin.plugin")
_implementation = importlib.import_module("neistra_demo_plugin")
DemoJobParameters = _legacy_leaf.DemoJobParameters
DemoPlugin = _legacy_leaf.DemoPlugin
plugin = _legacy_leaf.plugin
__all__ = getattr(_implementation, "__all__", [])


def __getattr__(name: str) -> Any:
    return getattr(_implementation, name)
