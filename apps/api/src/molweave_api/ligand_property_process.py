"""Compatibility alias for privately owned descriptor process recovery."""
import importlib
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from neistra_api.ligand_property_process import *  # noqa: F403
sys.modules[__name__] = importlib.import_module("neistra_api.ligand_property_process")
