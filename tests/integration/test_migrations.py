from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from molweave_api.database import create_database_engine, create_session_factory
from molweave_api.models import CommandRecord, Project, Scene, StructureEntry
from sqlalchemy import select


def legacy_viewer_settings() -> dict[str, Any]:
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


@pytest.mark.parametrize(
    "location", ["live", "checkpoint", "checkpoint_scene", "scene", "forward", "inverse", "empty"]
)
@pytest.mark.parametrize(
    "field, assignment",
    [
        ("selection_colors", {"color": "#112233", "atom_ids": [1]}),
        ("selection_nonpolar_hydrogens", {"show": False, "atom_ids": [2]}),
    ],
)
def test_0010_preserves_all_settings_and_refuses_lossy_history_downgrade(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    location: str,
    field: str,
    assignment: dict[str, Any],
) -> None:
    config = migration_config(tmp_path, monkeypatch)
    command.upgrade(config, "0009")
    engine = create_database_engine(f"sqlite:///{tmp_path / 'migration-data' / 'molweave.db'}")
    factory = create_session_factory(engine)

    def settings(where: str) -> dict[str, Any]:
        return {
            **legacy_viewer_settings(),
            **({field: [assignment]} if where == location else {}),
        }

    with factory() as session:
        session.add(
            Project(
                id="p",
                name="Legacy",
                checkpoint_state={
                    "entries": [{"viewer_settings": settings("checkpoint")}],
                    "scenes": [
                        {"entry_states": [{"viewer_settings": settings("checkpoint_scene")}]}
                    ],
                },
            )
        )
        session.flush()
        session.add(
            StructureEntry(
                id="e",
                project_id="p",
                name="Entry",
                viewer_settings=settings("live"),
                user_metadata={"viewer_settings": {"sentinel": True}},
            )
        )
        session.add(
            Scene(
                id="s",
                project_id="p",
                name="Scene",
                camera={},
                selection={},
                entry_states=[{"entry_id": "e", "viewer_settings": settings("scene")}],
            )
        )
        session.add(
            CommandRecord(
                id="c",
                project_id="p",
                position=1,
                command_type="entry.viewer_settings",
                description="Legacy",
                affected_entry_ids=["e"],
                forward_actions=[
                    {
                        "kind": "entry.update",
                        "entry_id": "e",
                        "values": {"viewer_settings": settings("forward")},
                    }
                ],
                inverse_actions=[
                    {
                        "kind": "scene.create",
                        "scene": {"entry_states": [{"viewer_settings": settings("inverse")}]},
                    }
                ],
            )
        )
        session.commit()
    command.upgrade(config, "head")
    with factory() as session:
        entry = session.get(StructureEntry, "e")
        project = session.get(Project, "p")
        scene = session.get(Scene, "s")
        history = session.get(CommandRecord, "c")
        assert entry and project and scene and history
        assert entry.user_metadata == {"viewer_settings": {"sentinel": True}}
        locations = {
            "live": entry.viewer_settings,
            "checkpoint": project.checkpoint_state["entries"][0]["viewer_settings"],
            "checkpoint_scene": project.checkpoint_state["scenes"][0]["entry_states"][0][
                "viewer_settings"
            ],
            "scene": scene.entry_states[0]["viewer_settings"],
            "forward": history.forward_actions[0]["values"]["viewer_settings"],
            "inverse": history.inverse_actions[0]["scene"]["entry_states"][0]["viewer_settings"],
        }
        for key, value in locations.items():
            assert value[field] == ([assignment] if key == location else [])
    if location == "empty":
        command.downgrade(config, "0009")
        command.upgrade(config, "head")
    else:
        with pytest.raises(RuntimeError, match="retains selection appearance"):
            command.downgrade(config, "0009")
    engine.dispose()


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


def test_0009_migrates_live_checkpoint_and_scene_settings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config = migration_config(tmp_path, monkeypatch)
    command.upgrade(config, "0008")
    database_url = f"sqlite:///{tmp_path / 'migration-data' / 'molweave.db'}"
    engine = create_database_engine(database_url)
    factory = create_session_factory(engine)
    settings = {**legacy_viewer_settings(), "selection_representations": []}
    with factory() as session:
        project = Project(
            id="project-1",
            name="Legacy",
            checkpoint_state={
                "schema_version": 1,
                "name": "Legacy",
                "description": None,
                "entries": [
                    {
                        "id": "entry-1",
                        "structure_type": "ligand",
                        "viewer_settings": deepcopy(settings),
                    }
                ],
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
        assert entry.viewer_settings["components"]["nonpolar_hydrogens"] is True
        checkpoint_settings = project.checkpoint_state["entries"][0]["viewer_settings"]
        assert checkpoint_settings["components"]["nonpolar_hydrogens"] is True
        scene_settings = scene.entry_states[0]["viewer_settings"]
        assert scene_settings["components"]["nonpolar_hydrogens"] is True

    command.downgrade(config, "0008")
    with factory() as session:
        entry = session.get(StructureEntry, "entry-1")
        project = session.get(Project, "project-1")
        scene = session.get(Scene, "scene-1")
        assert entry is not None and project is not None and scene is not None
        assert "nonpolar_hydrogens" not in entry.viewer_settings["components"]
        assert (
            "nonpolar_hydrogens"
            not in project.checkpoint_state["entries"][0]["viewer_settings"]["components"]
        )
        assert "nonpolar_hydrogens" not in scene.entry_states[0]["viewer_settings"]["components"]
    command.upgrade(config, "head")
    engine.dispose()


@pytest.mark.parametrize("location", ["live", "checkpoint", "scene"])
def test_0009_refuses_downgrade_when_polar_only_state_would_be_lost(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, location: str
) -> None:
    config = migration_config(tmp_path, monkeypatch)
    command.upgrade(config, "head")
    database_url = f"sqlite:///{tmp_path / 'migration-data' / 'molweave.db'}"
    engine = create_database_engine(database_url)
    factory = create_session_factory(engine)
    settings = {**legacy_viewer_settings(), "selection_representations": []}
    polar_only = deepcopy(settings)
    polar_only["components"]["nonpolar_hydrogens"] = False
    live_settings = polar_only if location == "live" else settings
    checkpoint_settings = polar_only if location == "checkpoint" else settings
    scene_settings = polar_only if location == "scene" else settings
    with factory() as session:
        project = Project(
            id="project-1",
            name="Polar-only",
            checkpoint_state={
                "schema_version": 1,
                "entries": [{"id": "entry-1", "viewer_settings": deepcopy(checkpoint_settings)}],
            },
        )
        session.add(project)
        session.add(
            StructureEntry(
                id="entry-1",
                project_id=project.id,
                name="Ligand",
                viewer_settings=deepcopy(live_settings),
            )
        )
        session.add(
            Scene(
                id="scene-1",
                project_id=project.id,
                name="Polar-only scene",
                camera={},
                entry_states=[
                    {
                        "entry_id": "entry-1",
                        "viewer_settings": deepcopy(scene_settings),
                    }
                ],
                selection={},
            )
        )
        session.commit()

    with pytest.raises(RuntimeError, match="Cannot downgrade"):
        command.downgrade(config, "0008")
    engine.dispose()
