"""Compatibility alias for neistra_api.schemas; no second implementation."""

import importlib
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from neistra_api.schemas import *  # noqa: F403

sys.modules[__name__] = importlib.import_module("neistra_api.schemas")
