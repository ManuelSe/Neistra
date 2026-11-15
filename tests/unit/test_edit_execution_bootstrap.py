"""The edit spawn entry point stays lightweight until its native limits are set."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize("prefix", ["neistra", "molweave"])
def test_edit_spawn_target_imports_without_database_or_scientific_initialization(
    prefix: str,
    tmp_path: Path,
) -> None:
    root = Path(__file__).parents[2]
    code = (
        "import importlib,pickle,sys\n"
        f"module=importlib.import_module('{prefix}_api.edit_execution_worker')\n"
        "assert pickle.loads(pickle.dumps(module.run_edit_child)) is module.run_edit_child\n"
        "assert not any(name in sys.modules for name in "
        "('sqlalchemy','numpy','openmm','pdbfixer','neistra_api.schemas','neistra_api.main'))\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=tmp_path,
        env={
            **os.environ,
            "PYTHONPATH": os.pathsep.join(
                str(root / path)
                for path in [
                    "apps/api/src",
                    "packages/neistra_core/src",
                    "packages/neistra_demo_plugin/src",
                ]
            ),
        },
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
