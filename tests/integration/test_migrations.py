from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from molweave_api.database import create_database_engine, create_session_factory
from molweave_api.models import Project, Scene, StructureEntry
from sqlalchemy import select


def legacy_viewer_settings() -> dict[str, object]:
    return {
        "representations": [
            {
                "id": "primary",
                "style": "ball-and-stick",
                "color_by": "element",
                "custom_color": "#3b82f6",
                "opacity": 1.0,
            }
        ],
        "components": {
            "hydrogens": True,
            "solvent": True,
            "ions": True,
            "ligands": True,
            "protein": True,
        },
        "labels": {
            "atoms": False,
            "residues": False,
            "chains": False,
            "structure": False,
        },
    }


def migration_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Config:
    data_dir = tmp_path / "migration-data"
    monkeypatch.setenv("MOLWEAVE_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MOLWEAVE_DATABASE_URL", f"sqlite:///{data_dir / 'molweave.db'}")
    return Config("alembic.ini")


def test_0008_migrates_live_checkpoint_and_scene_settings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config = migration_config(tmp_path, monkeypatch)
    command.upgrade(config, "0007")
    database_url = f"sqlite:///{tmp_path / 'migration-data' / 'molweave.db'}"
    engine = create_database_engine(database_url)
    factory = create_session_factory(engine)
    settings = legacy_viewer_settings()
    checkpoint_entry = {
        "id": "entry-1",
        "structure_type": "ligand",
        "viewer_settings": deepcopy(settings),
    }
    with factory() as session:
        project = Project(
            id="project-1",
            name="Legacy",
            checkpoint_state={
                "schema_version": 1,
                "name": "Legacy",
                "description": None,
                "entries": [checkpoint_entry],
                "groups": [],
                "saved_selections": [],
                "measurements": [],
                "scenes": [],
            },
        )
        session.add(project)
        session.add(
            StructureEntry(
                id="entry-1",
                project_id=project.id,
                name="Ligand",
                viewer_settings=deepcopy(settings),
            )
        )
        session.add(
            Scene(
                id="scene-1",
                project_id=project.id,
                name="Legacy scene",
                camera={
                    "mode": "perspective",
                    "position": [0, 0, 10],
                    "target": [0, 0, 0],
                    "up": [0, 1, 0],
                    "radius": 10,
                },
                entry_states=[
                    {
                        "entry_id": "entry-1",
                        "visible": True,
                        "viewer_settings": deepcopy(settings),
                    }
                ],
                selection={
                    "schema_version": 1,
                    "atoms": [],
                    "granularity": "atom",
                    "source": "inspector",
                },
            )
        )
        session.commit()

    command.upgrade(config, "head")
    with factory() as session:
        entry = session.get(StructureEntry, "entry-1")
        project = session.get(Project, "project-1")
        scene = session.get(Scene, "scene-1")
        assert entry is not None and project is not None and scene is not None
        assert entry.viewer_settings["selection_representations"] == []
        assert (
            project.checkpoint_state["entries"][0]["viewer_settings"]["selection_representations"]
            == []
        )
        assert scene.entry_states[0]["viewer_settings"]["selection_representations"] == []

    command.downgrade(config, "0007")
    command.upgrade(config, "head")
    with factory() as session:
        entry = session.scalar(select(StructureEntry).where(StructureEntry.id == "entry-1"))
        assert entry is not None
        entry.viewer_settings = {
            **entry.viewer_settings,
            "selection_representations": [{"style": "line", "atom_ids": [1]}],
        }
        session.commit()
    with pytest.raises(RuntimeError, match="reset all selection representations"):
        command.downgrade(config, "0007")
    engine.dispose()
