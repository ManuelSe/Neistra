from __future__ import annotations

from pathlib import Path

import pytest
from neistra_api.database import Base, create_database_engine, create_session_factory
from neistra_api.ligand_property_schemas import LigandPropertyPreferencesUpdate
from neistra_api.ligand_property_service import (
    PropertyPreferenceConflict,
    read_property_preferences,
    update_property_preferences,
)
from neistra_api.settings import Settings
from neistra_core.jobs import PluginRegistry


def test_reused_session_cannot_accept_stale_preference_snapshot(tmp_path: Path) -> None:
    engine = create_database_engine(f"sqlite:///{tmp_path}/preferences.db")
    Base.metadata.create_all(engine)
    factory = create_session_factory(engine)
    with factory() as first, factory() as second:
        update_property_preferences(
            first,
            LigandPropertyPreferencesUpdate(expected_revision=0, enabled_categories=("polarity",)),
        )
        assert read_property_preferences(first).revision == 1
        update_property_preferences(
            second,
            LigandPropertyPreferencesUpdate(
                expected_revision=1, enabled_categories=("composition",)
            ),
        )
        assert read_property_preferences(first).revision == 2
        with pytest.raises(PropertyPreferenceConflict):
            update_property_preferences(
                first,
                LigandPropertyPreferencesUpdate(
                    expected_revision=1, enabled_categories=("polarity",)
                ),
            )
    engine.dispose()


def test_existing_explicit_allowlist_can_disable_new_builtin_without_startup_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("NEISTRA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("NEISTRA_DATABASE_URL", f"sqlite:///{tmp_path}/test.db")
    monkeypatch.setenv("NEISTRA_JOB_PLUGIN_ALLOWLIST", "molweave.demo,molweave.minimization")
    for key in ("NEISTRA_JOB_PLUGIN_TARGETS", "MOLWEAVE_JOB_PLUGIN_TARGETS"):
        monkeypatch.delenv(key, raising=False)
    settings = Settings.from_env()
    assert "neistra.ligand_properties" not in settings.job_plugin_allowlist
    assert "neistra_api.ligand_property_plugin:plugin" not in settings.job_plugin_targets
    registry = PluginRegistry.load(
        allowlist=settings.job_plugin_allowlist,
        configured_targets=settings.job_plugin_targets,
        discover_installed=False,
    )
    assert len(registry.definitions()) == 3
