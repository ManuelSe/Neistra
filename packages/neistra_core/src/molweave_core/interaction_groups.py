"""Compatibility alias for neistra_core.interaction_groups; no second implementation."""

import importlib
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from neistra_core.interaction_groups import *  # noqa: F403

sys.modules[__name__] = importlib.import_module("neistra_core.interaction_groups")
