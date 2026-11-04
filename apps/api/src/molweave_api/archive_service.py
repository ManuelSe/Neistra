"""Compatibility alias for neistra_api.archive_service; no second implementation."""

import importlib
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from neistra_api.archive_service import *  # noqa: F403

sys.modules[__name__] = importlib.import_module("neistra_api.archive_service")
