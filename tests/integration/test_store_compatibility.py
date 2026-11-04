from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from neistra_api.main import create_app
from neistra_api.settings import Settings

from tests.support.api_client import ApiClient

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def clean_store_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    for key in os.environ:
        if key.startswith(("NEISTRA_", "MOLWEAVE_")):
            monkeypatch.delenv(key)
    monkeypatch.chdir(tmp_path)


def sqlite_file(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.execute("create table marker (value text)")
        connection.execute("insert into marker values ('preserved')")


def test_fresh_store_is_new_name_without_writing(tmp_path: Path) -> None:
    settings = Settings.from_env()
    assert settings.data_dir == tmp_path / ".neistra"
    assert settings.database_url == f"sqlite:///{tmp_path}/.neistra/neistra.db"
    assert not settings.data_dir.exists()


@pytest.mark.parametrize(
    "root,name",
    [(".molweave", "molweave.db"), (".neistra", "neistra.db"), ("custom root", "molweave.db")],
)
def test_existing_store_is_reused_exactly(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    root: str,
    name: str,
) -> None:
    file = tmp_path / root / name
    sqlite_file(file)
    before = file.read_bytes()
    if root == "custom root":
        monkeypatch.setenv("NEISTRA_DATA_DIR", str(file.parent))
    settings = Settings.from_env()
    assert settings.database_url == f"sqlite:///{file}"
    assert file.read_bytes() == before
    assert list(file.parent.iterdir()) == [file]


def test_competing_roots_and_databases_need_explicit_selection(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    sqlite_file(tmp_path / ".molweave/molweave.db")
    sqlite_file(tmp_path / ".neistra/neistra.db")
    with pytest.raises(ValueError, match="Both default stores"):
        Settings.from_env()
    monkeypatch.setenv("NEISTRA_DATA_DIR", str(tmp_path / ".molweave"))
    sqlite_file(tmp_path / ".molweave/neistra.db")
    with pytest.raises(ValueError, match="Both database names"):
        Settings.from_env()
    url = f"sqlite:///{tmp_path}/.molweave/molweave.db"
    monkeypatch.setenv("NEISTRA_DATABASE_URL", url)
    assert Settings.from_env().database_url == url


@pytest.mark.parametrize("kind", ["invalid-db", "missing-db", "not-directory", "broken-link"])
def test_invalid_store_never_creates_replacement(tmp_path: Path, kind: str) -> None:
    root = tmp_path / ".molweave"
    if kind == "not-directory":
        root.write_text("data")
    elif kind == "broken-link":
        root.symlink_to(tmp_path / "missing")
    else:
        root.mkdir()
        (root / ("molweave.db" if kind == "invalid-db" else "original-upload")).write_bytes(b"data")
    with pytest.raises(ValueError):
        Settings.from_env()
    assert not (tmp_path / ".neistra").exists()
    assert not (root / "neistra.db").exists()


def test_unreadable_default_fails_without_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    original = Path.stat

    def denied(path: Path, *args: object, **kwargs: object) -> os.stat_result:
        if path.name == ".molweave":
            raise PermissionError("denied")
        return original(path, *args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(Path, "stat", denied)
    with pytest.raises(PermissionError):
        Settings.from_env()


@pytest.mark.parametrize("name", ["DATA_DIR", "DATABASE_URL"])
def test_empty_canonical_path_does_not_fall_back(
    monkeypatch: pytest.MonkeyPatch, name: str
) -> None:
    monkeypatch.setenv(f"MOLWEAVE_{name}", "valid-legacy")
    monkeypatch.setenv(f"NEISTRA_{name}", "")
    with pytest.raises(ValueError, match="must not be empty"):
        Settings.from_env()


def test_migration_api_and_reopen_share_legacy_store(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    root = tmp_path / "legacy with spaces"
    monkeypatch.setenv("MOLWEAVE_DATA_DIR", str(root))
    monkeypatch.setenv("MOLWEAVE_DATABASE_URL", f"sqlite:///{root}/molweave.db")
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "apps/api/migrations"))
    command.upgrade(config, "head")
    first = Settings.from_env()
    app = create_app(first)
    client = ApiClient(app)
    project = client.post("/api/v1/projects", json={"name": "Preserved project"}).json()
    app.state.engine.dispose()
    monkeypatch.delenv("MOLWEAVE_DATABASE_URL")
    monkeypatch.delenv("MOLWEAVE_DATA_DIR")
    monkeypatch.setenv("NEISTRA_DATA_DIR", str(root))
    second = Settings.from_env()
    assert first.database_url == second.database_url
    app = create_app(second)
    client = ApiClient(app)
    assert client.get(f"/api/v1/projects/{project['id']}").json()["name"] == "Preserved project"
    app.state.engine.dispose()
    assert not (root / "neistra.db").exists()


def test_explicit_broken_root_is_not_resolved_into_a_fresh_store(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    link = tmp_path / "chosen-root"
    missing = tmp_path / "missing-target"
    link.symlink_to(missing)
    monkeypatch.setenv("NEISTRA_DATA_DIR", str(link))
    with pytest.raises(ValueError, match="broken symlink"):
        Settings.from_env()
    assert not missing.exists()


def test_migration_keeps_application_diagnostics_enabled(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    import logging

    logger = logging.getLogger("neistra_core.configuration")
    logger.disabled = False
    monkeypatch.setenv("NEISTRA_DATA_DIR", str(tmp_path / "migration-logging"))
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "apps/api/migrations"))
    command.upgrade(config, "head")
    assert not logger.disabled, "Migration logging must preserve application diagnostics"
