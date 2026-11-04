from __future__ import annotations

import logging
from pathlib import Path

import pytest
from neistra_api.settings import Settings
from neistra_core.configuration import environment_flag, environment_integer, environment_value


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import os

    for key in os.environ:
        if key.startswith(("NEISTRA_", "MOLWEAVE_")):
            monkeypatch.delenv(key)
    monkeypatch.chdir(tmp_path)


def test_precedence_diagnostics_do_not_disclose_values(caplog: pytest.LogCaptureFixture) -> None:
    environment = {"NEISTRA_DATABASE_URL": "secret-new", "MOLWEAVE_DATABASE_URL": "secret-old"}
    with caplog.at_level(logging.WARNING):
        assert environment_value("DATABASE_URL", environment=environment) == "secret-new"
    assert "NEISTRA_DATABASE_URL overrides conflicting MOLWEAVE_DATABASE_URL" in caplog.text
    assert "secret" not in caplog.text
    caplog.clear()
    assert (
        environment_value(
            "DATA_DIR",
            environment={
                "NEISTRA_DATA_DIR": "same",
                "MOLWEAVE_DATA_DIR": "same",
            },
        )
        == "same"
    )
    assert not caplog.records
    assert environment_value("DATABASE_URL", environment={"MOLWEAVE_DATABASE_URL": "old"}) == "old"
    assert environment_value("DATABASE_URL", environment={}) is None
    assert environment_value("DATABASE_URL", environment={"NEISTRA_DATABASE_URL": ""}) == ""


@pytest.mark.parametrize(
    "name,attribute,value,expected",
    [
        ("AUTO_CREATE_SCHEMA", "auto_create_schema", "1", True),
        ("ENABLE_TEST_ROUTES", "enable_test_routes", "0", False),
        ("MAX_STRUCTURE_FILE_BYTES", "max_structure_file_bytes", "1234", 1234),
        ("MAX_UPLOAD_REQUEST_BYTES", "max_upload_request_bytes", "1234", 1234),
        ("MAX_ARCHIVE_UPLOAD_BYTES", "max_archive_upload_bytes", "1234", 1234),
        ("MAX_ARCHIVE_UNCOMPRESSED_BYTES", "max_archive_uncompressed_bytes", "1234", 1234),
        ("MAX_ARCHIVE_MEMBERS", "max_archive_members", "1234", 1234),
        ("MAX_ARCHIVE_COMPRESSION_RATIO", "max_archive_compression_ratio", "12.5", 12.5),
        ("ATOM_WARNING_LIMIT", "atom_warning_limit", "1234", 1234),
        ("ATOM_HARD_LIMIT", "atom_hard_limit", "1234", 1234),
        ("JOB_PLUGIN_ALLOWLIST", "job_plugin_allowlist", "molweave.demo", ("molweave.demo",)),
        (
            "JOB_PLUGIN_TARGETS",
            "job_plugin_targets",
            "molweave_demo_plugin.plugin:plugin",
            ("molweave_demo_plugin.plugin:plugin",),
        ),
        ("JOB_WORKER_POLL_SECONDS", "job_worker_poll_seconds", "0.25", 0.25),
        ("JOB_WORKER_HEALTH_PORT", "job_worker_health_port", "19001", 19001),
    ],
)
@pytest.mark.parametrize("prefix", ["NEISTRA", "MOLWEAVE"])
def test_all_settings_accept_both_names(
    monkeypatch: pytest.MonkeyPatch,
    name: str,
    attribute: str,
    value: str,
    expected: object,
    prefix: str,
) -> None:
    monkeypatch.setenv(f"{prefix}_{name}", value)
    assert getattr(Settings.from_env(), attribute) == expected


@pytest.mark.parametrize(
    "name,value",
    [
        ("AUTO_CREATE_SCHEMA", "yes"),
        ("ENABLE_TEST_ROUTES", ""),
        ("JOB_WORKER_POLL_SECONDS", "nan"),
        ("MAX_ARCHIVE_COMPRESSION_RATIO", "inf"),
        ("MAX_ARCHIVE_MEMBERS", "0"),
        ("ATOM_HARD_LIMIT", "-1"),
        ("JOB_WORKER_HEALTH_PORT", "65536"),
        ("JOB_WORKER_HEALTH_PORT", ""),
    ],
)
def test_invalid_canonical_does_not_fall_back(
    monkeypatch: pytest.MonkeyPatch,
    name: str,
    value: str,
) -> None:
    monkeypatch.setenv(f"NEISTRA_{name}", value)
    monkeypatch.setenv(f"MOLWEAVE_{name}", "1")
    with pytest.raises(ValueError, match="NEISTRA_"):
        Settings.from_env()


def test_native_resource_and_cache_aliases(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOLWEAVE_MINIMIZATION_CACHE", "0")
    assert not environment_flag("MINIMIZATION_CACHE", True)
    monkeypatch.setenv("NEISTRA_MINIMIZATION_CACHE", "1")
    assert environment_flag("MINIMIZATION_CACHE", False)
    monkeypatch.setenv("NEISTRA_MINIMIZATION_CACHE", "invalid")
    with pytest.raises(ValueError):
        environment_flag("MINIMIZATION_CACHE", True)
    monkeypatch.setenv("NEISTRA_MINIMIZATION_MAX_RSS_BYTES", "-1")
    with pytest.raises(ValueError):
        environment_integer("MINIMIZATION_MAX_RSS_BYTES", 4 * 1024**3)
    monkeypatch.setenv("MOLWEAVE_AMBERTOOLS_PREFIX", "old")
    monkeypatch.setenv("NEISTRA_AMBERTOOLS_PREFIX", "new")
    assert environment_value("AMBERTOOLS_PREFIX") == "new"
