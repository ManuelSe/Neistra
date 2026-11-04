"""Legacy entry points must share one implementation with canonical imports."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def run_isolated(code: str, paths: list[str], cwd: Path) -> None:
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=cwd,
        env={**os.environ, "PYTHONPATH": os.pathsep.join(str(ROOT / p) for p in paths)},
        capture_output=True,
        text=True,
        timeout=45,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize("legacy_first", [True, False])
def test_all_legacy_leaf_modules_share_identity(legacy_first: bool, tmp_path: Path) -> None:
    pairs = []
    for path, old, new in [
        (ROOT / "apps/api/src/neistra_api", "molweave_api", "neistra_api"),
        (ROOT / "packages/neistra_core/src/neistra_core", "molweave_core", "neistra_core"),
        (ROOT / "packages/neistra_demo_plugin/src/neistra_demo_plugin",
         "molweave_demo_plugin", "neistra_demo_plugin"),
    ]:
        for file in path.rglob("*.py"):
            if file.name != "__init__.py":
                suffix = "." + ".".join(file.relative_to(path).with_suffix("").parts)
                pairs.append((old + suffix, new + suffix))
    run_isolated(
        "import importlib\n"
        f"pairs = {pairs!r}\n"
        "for old, new in pairs:\n"
        f"    first, second = (old, new) if {legacy_first!r} else (new, old)\n"
        "    a = importlib.import_module(first)\n"
        "    b = importlib.import_module(second)\n"
        "    assert a is b, (old, new)\n"
        "from molweave_core import NormalizedStructureV1 as old_type\n"
        "from neistra_core import NormalizedStructureV1\n"
        "assert old_type is NormalizedStructureV1\n"
        "from molweave_core.jobs import PluginRegistry as old_registry\n"
        "from neistra_core.jobs import PluginRegistry\n"
        "assert old_registry is PluginRegistry\n"
        "from molweave_api.database import Base as old_base\n"
        "from neistra_api.database import Base\n"
        "assert old_base is Base and old_base.metadata is Base.metadata\n"
        "from molweave_demo_plugin import plugin as old_plugin\n"
        "from neistra_demo_plugin import plugin\n"
        "assert old_plugin is plugin\n",
        ["apps/api/src", "packages/neistra_core/src", "packages/neistra_demo_plugin/src"],
        tmp_path,
    )


@pytest.mark.parametrize("entry", ["molweave_api.worker", "molweave_core.jobs",
                                  "molweave_demo_plugin.plugin"])
def test_historical_source_roots_bootstrap_canonical_code(entry: str, tmp_path: Path) -> None:
    run_isolated(
        "import importlib\n"
        f"importlib.import_module({entry!r})\n"
        "from molweave_core.jobs import PluginRegistry\n"
        "registry = PluginRegistry.load(allowlist=('molweave.demo',), "
        "configured_targets=('molweave_demo_plugin.plugin:plugin',), "
        "discover_installed=False)\n"
        "assert len(registry.definitions()) == 1\n"
        "from molweave_demo_plugin import plugin as old_plugin\n"
        "from neistra_demo_plugin import plugin\n"
        "assert old_plugin is plugin\n",
        ["apps/api/src", "packages/molweave_core/src", "packages/molweave_demo_plugin/src"],
        tmp_path,
    )


@pytest.mark.parametrize("prefix", ["neistra", "molweave"])
def test_worker_alias_retains_lightweight_spawn_bootstrap(prefix: str, tmp_path: Path) -> None:
    run_isolated(
        "import importlib, sys, pickle\n"
        f"worker = importlib.import_module('{prefix}_api.worker')\n"
        f"child = importlib.import_module('{prefix}_api.job_worker')\n"
        "assert callable(child._execute_child)\n"
        "assert pickle.loads(pickle.dumps(child.ChildInput)) is child.ChildInput\n"
        "assert not any(x in sys.modules for x in "
        "('sqlalchemy', 'neistra_api.schemas', 'neistra_api.import_export', "
        "'openmm', 'pdbfixer'))\n",
        ["apps/api/src", "packages/neistra_core/src", "packages/neistra_demo_plugin/src"],
        tmp_path,
    )


def test_legacy_worker_module_execution(tmp_path: Path) -> None:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    environment = {
        **{k: v for k, v in os.environ.items()
           if not k.startswith(("NEISTRA_", "MOLWEAVE_"))},
        "PYTHONPATH": os.pathsep.join(str(ROOT / p) for p in [
            "apps/api/src", "packages/molweave_core/src", "packages/molweave_demo_plugin/src",
        ]),
        "MOLWEAVE_DATA_DIR": str(tmp_path),
        "MOLWEAVE_JOB_WORKER_HEALTH_PORT": str(port),
    }
    migration = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT,
        env=environment, capture_output=True, timeout=30, check=False,
    )
    assert migration.returncode == 0, migration.stderr.decode()
    worker = subprocess.Popen(
        [sys.executable, "-m", "molweave_api.worker"], cwd=ROOT, env=environment,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            assert worker.poll() is None, worker.communicate()[1].decode()
            try:
                url = f"http://127.0.0.1:{port}/health"
                with urllib.request.urlopen(url, timeout=1) as response:
                    assert response.read() == b'{"status":"ok"}\n'
                    break
            except urllib.error.URLError:
                time.sleep(0.05)
        else:
            pytest.fail("Legacy -m worker did not become healthy")
    finally:
        worker.terminate()
        worker.communicate(timeout=10)
