"""Compatibility alias for neistra_core.configuration."""

import importlib
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from neistra_core.configuration import *  # noqa: F403

sys.modules[__name__] = importlib.import_module("neistra_core.configuration")
