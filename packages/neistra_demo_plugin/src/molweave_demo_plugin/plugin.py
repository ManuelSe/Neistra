"""Compatibility alias for neistra_demo_plugin.plugin; no second implementation."""

import importlib
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from neistra_demo_plugin.plugin import *  # noqa: F403

sys.modules[__name__] = importlib.import_module("neistra_demo_plugin.plugin")
