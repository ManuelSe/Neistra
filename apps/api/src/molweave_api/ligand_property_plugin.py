"""Compatibility alias; implementation lives in the canonical API package."""

import importlib
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from neistra_api.ligand_property_plugin import *  # noqa: F403

sys.modules[__name__] = importlib.import_module("neistra_api.ligand_property_plugin")
