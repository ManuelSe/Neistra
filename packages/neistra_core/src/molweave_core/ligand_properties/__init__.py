"""Compatibility package; implementation lives in neistra_core.ligand_properties."""

import importlib
from typing import Any

_implementation = importlib.import_module("neistra_core.ligand_properties")
__all__ = getattr(_implementation, "__all__", [])


def __getattr__(name: str) -> Any:
    return getattr(_implementation, name)
