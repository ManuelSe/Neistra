"""Spawned native jobs must not rebuild the API coordinator's import graph."""

from __future__ import annotations

import os
import subprocess
import sys


def test_spawn_bootstrap_does_not_import_api_or_prepared_engine_dependencies() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; import molweave_api.worker; "
            "from molweave_api.job_worker import ChildInput, _execute_child; "
            "assert callable(_execute_child); "
            "assert ChildInput.__module__ == 'molweave_api.job_worker'; "
            "assert not any(name in sys.modules for name in "
            "('sqlalchemy', 'molweave_api.schemas', 'molweave_api.import_export', "
            "'openmm', 'pdbfixer'))",
        ],
        env={**os.environ, "PYTHONPATH": os.pathsep.join(sys.path)},
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 0, result.stderr
