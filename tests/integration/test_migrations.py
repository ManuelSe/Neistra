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
        ("selection_colors", {"color": "element", "atom_ids": [1]}),
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
    command.upgrade(config, "0010")
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
        command.upgrade(config, "0010")
    else:
        with pytest.raises(RuntimeError, match="retains selection appearance"):
            command.downgrade(config, "0009")
    engine.dispose()


@pytest.mark.parametrize(
    "retained_path",
    [
        "live",
        "checkpoint",
        "checkpoint_scene",
        "scene",
        *[
            f"{direction}:{kind}"
            for direction in ("forward", "inverse")
            for kind in (
                "entry.create",
                "entry.update",
                "entry.molecule",
                "entries.viewer_state",
                "scene.create",
                "scene.update",
            )
        ],
        "empty",
    ],
)
@pytest.mark.parametrize("surface_kind", ["entry", "fragment", "pocket"])
def test_0014_converts_every_retained_path_and_refuses_loss_without_partial_writes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    retained_path: str,
    surface_kind: str,
) -> None:
    config = migration_config(tmp_path, monkeypatch)
    command.upgrade(config, "0013")
    engine = create_database_engine(f"sqlite:///{tmp_path / 'migration-data' / 'molweave.db'}")
    factory = create_session_factory(engine)
    sentinel = {"viewer_settings": {"selection_surface": {"user": "not display state"}}}

    def settings(path: str) -> dict[str, Any]:
        result = {
            **legacy_viewer_settings(),
            "selection_surface": None,
            "selection_pocket_surface": None,
        }
        if path == retained_path:
            if surface_kind == "entry":
                result["representations"].append(
                    {
                        "id": "native",
                        "style": "surface",
                        "color_by": "custom",
                        "custom_color": "#123456",
                        "opacity": 0.3,
                    }
                )
            elif surface_kind == "fragment":
                result["selection_surface"] = {"profile": "molecular-v1", "atom_ids": [1, 2]}
            else:
                result["selection_pocket_surface"] = {
                    "profile": "pocket-v1",
                    "radius": 5,
                    "seed_atom_references": [{"structure_id": "e", "atom_id": 1}],
                }
        return result

    def states(path: str) -> list[dict[str, Any]]:
        return [{"entry_id": "e", "viewer_settings": settings(path)}]

    def actions(direction: str) -> list[dict[str, Any]]:
        return [
            {
                "kind": "entry.create",
                "entry": {"id": "e", "viewer_settings": settings(f"{direction}:entry.create")},
            },
            {
                "kind": "entry.update",
                "entry_id": "e",
                "values": {"viewer_settings": settings(f"{direction}:entry.update")},
            },
            {
                "kind": "entry.molecule",
                "entry_id": "e",
                "values": {"viewer_settings": settings(f"{direction}:entry.molecule")},
            },
            {"kind": "entries.viewer_state", "values": states(f"{direction}:entries.viewer_state")},
            {
                "kind": "scene.create",
                "scene": {"entry_states": states(f"{direction}:scene.create")},
            },
            {
                "kind": "scene.update",
                "values": {"entry_states": states(f"{direction}:scene.update")},
            },
        ]

    with factory() as session:
        session.add(
            Project(
                id="p",
                name="Surfaces",
                revision=9,
                checkpoint_revision=5,
                checkpoint_state={
                    "schema_version": 1,
                    "entries": [
                        {
                            "id": "e",
                            "viewer_settings": settings("checkpoint"),
                            "user_metadata": sentinel,
                        }
                    ],
                    "scenes": [{"entry_states": states("checkpoint_scene")}],
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
                user_metadata=sentinel,
                normalized_data={"sentinel": "scientific"},
            )
        )
        session.add(
            Scene(
                id="s",
                project_id="p",
                name="Scene",
                camera={},
                selection={},
                entry_states=states("scene"),
            )
        )
        session.add(
            CommandRecord(
                id="c",
                project_id="p",
                position=7,
                is_applied=False,
                command_type="fixture",
                description="Retained redo",
                affected_entry_ids=["e"],
                forward_actions=actions("forward"),
                inverse_actions=actions("inverse"),
            )
        )
        session.commit()

    def snapshot():
        with factory() as session:
            entry = session.get(StructureEntry, "e")
            project = session.get(Project, "p")
            scene = session.get(Scene, "s")
            history = session.get(CommandRecord, "c")
            assert entry and project and scene and history
            return deepcopy(
                {
                    "live": entry.viewer_settings,
                    "checkpoint": project.checkpoint_state,
                    "scene": scene.entry_states,
                    "forward": history.forward_actions,
                    "inverse": history.inverse_actions,
                    "metadata": entry.user_metadata,
                    "normalized": entry.normalized_data,
                    "revision": project.revision,
                    "checkpoint_revision": project.checkpoint_revision,
                    "position": history.position,
                    "applied": history.is_applied,
                    "timestamps": [
                        entry.created_at,
                        entry.modified_at,
                        project.created_at,
                        project.modified_at,
                    ],
                }
            )

    original = snapshot()
    command.upgrade(config, "0014")
    migrated = snapshot()
    locations = {
        "live": migrated["live"],
        "checkpoint": migrated["checkpoint"]["entries"][0]["viewer_settings"],
        "checkpoint_scene": migrated["checkpoint"]["scenes"][0]["entry_states"][0][
            "viewer_settings"
        ],
        "scene": migrated["scene"][0]["viewer_settings"],
    }
    for direction in ("forward", "inverse"):
        items = migrated[direction]
        locations.update(
            {
                f"{direction}:entry.create": items[0]["entry"]["viewer_settings"],
                f"{direction}:entry.update": items[1]["values"]["viewer_settings"],
                f"{direction}:entry.molecule": items[2]["values"]["viewer_settings"],
                f"{direction}:entries.viewer_state": items[3]["values"][0]["viewer_settings"],
                f"{direction}:scene.create": items[4]["scene"]["entry_states"][0][
                    "viewer_settings"
                ],
                f"{direction}:scene.update": items[5]["values"]["entry_states"][0][
                    "viewer_settings"
                ],
            }
        )
    for path, value in locations.items():
        assert value["schema_version"] == 2
        assert "selection_surface" not in value and "selection_pocket_surface" not in value
        assert len(value["surface_objects"]) == (1 if path == retained_path else 0)
        if value["surface_objects"]:
            surface = value["surface_objects"][0]
            assert surface["source"]["kind"] == surface_kind
            assert surface["appearance"]["inherit_atom_colors"] is True
            assert surface["appearance"]["opacity"] == (0.3 if surface_kind == "entry" else 0.45)
    for field in (
        "metadata",
        "normalized",
        "revision",
        "checkpoint_revision",
        "position",
        "applied",
        "timestamps",
    ):
        assert migrated[field] == original[field]
    assert migrated["checkpoint"]["schema_version"] == 2
    assert migrated["checkpoint"]["entries"][0]["user_metadata"] == sentinel
    if retained_path == "empty":
        command.downgrade(config, "0013")
        assert snapshot() == original
        command.upgrade(config, "0014")
        assert snapshot() == migrated
    else:
        with pytest.raises(RuntimeError, match="Cannot downgrade 0014"):
            command.downgrade(config, "0013")
        assert snapshot() == migrated
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

    command.upgrade(config, "0008")
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
    command.upgrade(config, "0008")
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

    command.upgrade(config, "0009")
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
    command.upgrade(config, "0009")
    engine.dispose()


@pytest.mark.parametrize("location", ["live", "checkpoint", "scene"])
def test_0009_refuses_downgrade_when_polar_only_state_would_be_lost(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, location: str
) -> None:
    config = migration_config(tmp_path, monkeypatch)
    command.upgrade(config, "0009")
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


_SURFACE_PATHS = ["live", "checkpoint", "checkpoint_scene", "scene"] + [
    f"{direction}:{kind}"
    for direction in ("forward", "inverse")
    for kind in (
        "entry.create",
        "entry.update",
        "entry.molecule",
        "entries.viewer_state",
        "scene.create",
        "scene.update",
    )
]


@pytest.mark.parametrize("retained_path", [*_SURFACE_PATHS, "empty"])
@pytest.mark.parametrize(
    "revision, previous, field, membership, empty",
    [
        (
            "0011",
            "0010",
            "selection_surface",
            {"profile": "molecular-v1", "atom_ids": [3, 9]},
            None,
        ),
        ("0012", "0011", "selection_hidden_atoms", [3, 9], []),
        (
            "0013",
            "0012",
            "selection_pocket_surface",
            {
                "profile": "pocket-v1",
                "seed_atom_references": [{"structure_id": "e", "atom_id": 3}],
                "radius": 5,
            },
            None,
        ),
    ],
)
def test_display_migrations_cover_every_retained_path_and_refuse_loss_atomically(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    retained_path: str,
    revision: str,
    previous: str,
    field: str,
    membership: Any,
    empty: Any,
) -> None:
    config = migration_config(tmp_path, monkeypatch)
    command.upgrade(config, previous)
    engine = create_database_engine(f"sqlite:///{tmp_path / 'migration-data' / 'molweave.db'}")
    factory = create_session_factory(engine)
    sentinel = {field: {"metadata": "not viewer settings"}}

    def settings(path: str) -> dict[str, Any]:
        value = {
            **legacy_viewer_settings(),
            "selection_colors": [],
            "selection_nonpolar_hydrogens": [],
        }
        if path == retained_path:
            value[field] = deepcopy(membership)
        return value

    def actions(direction: str) -> list[dict[str, Any]]:
        return [
            {
                "kind": "entry.create",
                "entry": {"viewer_settings": settings(f"{direction}:entry.create")},
            },
            {
                "kind": "entry.update",
                "values": {"viewer_settings": settings(f"{direction}:entry.update")},
            },
            {
                "kind": "entry.molecule",
                "values": {"viewer_settings": settings(f"{direction}:entry.molecule")},
            },
            {
                "kind": "entries.viewer_state",
                "values": [{"viewer_settings": settings(f"{direction}:entries.viewer_state")}],
            },
            {
                "kind": "scene.create",
                "scene": {
                    "entry_states": [{"viewer_settings": settings(f"{direction}:scene.create")}]
                },
            },
            {
                "kind": "scene.update",
                "values": {
                    "entry_states": [{"viewer_settings": settings(f"{direction}:scene.update")}]
                },
            },
        ]

    with factory() as session:
        session.add(
            Project(
                id="p",
                name="Retained surfaces",
                checkpoint_state={
                    "entries": [
                        {"viewer_settings": settings("checkpoint"), "user_metadata": sentinel}
                    ],
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
                user_metadata=sentinel,
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
                command_type="fixture",
                description="Every retained path",
                affected_entry_ids=["e"],
                forward_actions=actions("forward"),
                inverse_actions=actions("inverse"),
            )
        )
        session.commit()
    command.upgrade(config, revision)

    def snapshot() -> dict[str, Any]:
        with factory() as session:
            entry = session.get(StructureEntry, "e")
            project = session.get(Project, "p")
            scene = session.get(Scene, "s")
            history = session.get(CommandRecord, "c")
            assert entry and project and scene and history
            return deepcopy(
                {
                    "live": entry.viewer_settings,
                    "checkpoint": project.checkpoint_state,
                    "scene": scene.entry_states,
                    "forward": history.forward_actions,
                    "inverse": history.inverse_actions,
                    "metadata": entry.user_metadata,
                }
            )

    before = snapshot()
    locations = {
        "live": before["live"],
        "checkpoint": before["checkpoint"]["entries"][0]["viewer_settings"],
        "checkpoint_scene": before["checkpoint"]["scenes"][0]["entry_states"][0]["viewer_settings"],
        "scene": before["scene"][0]["viewer_settings"],
    }
    for direction in ("forward", "inverse"):
        items = before[direction]
        locations.update(
            {
                f"{direction}:entry.create": items[0]["entry"]["viewer_settings"],
                f"{direction}:entry.update": items[1]["values"]["viewer_settings"],
                f"{direction}:entry.molecule": items[2]["values"]["viewer_settings"],
                f"{direction}:entries.viewer_state": items[3]["values"][0]["viewer_settings"],
                f"{direction}:scene.create": items[4]["scene"]["entry_states"][0][
                    "viewer_settings"
                ],
                f"{direction}:scene.update": items[5]["values"]["entry_states"][0][
                    "viewer_settings"
                ],
            }
        )
    for path, value in locations.items():
        assert value[field] == (membership if path == retained_path else empty)
    assert before["metadata"] == sentinel
    assert before["checkpoint"]["entries"][0]["user_metadata"] == sentinel
    if retained_path == "empty":
        command.downgrade(config, previous)
        assert field not in snapshot()["live"]
        command.upgrade(config, revision)
        assert snapshot() == before
    else:
        with pytest.raises(RuntimeError, match=r"retains .* state"):
            command.downgrade(config, previous)
        assert snapshot() == before
    engine.dispose()


def test_0014_legacy_identity_is_stable_across_changed_historical_snapshots() -> None:
    from molweave_api.surface_upgrade import upgrade_surface_settings

    old = {
        **legacy_viewer_settings(),
        "selection_surface": {"profile": "molecular-v1", "atom_ids": [1]},
    }
    changed = {**old, "selection_surface": {"profile": "molecular-v1", "atom_ids": [2, 3]}}
    first = upgrade_surface_settings(old, "owner")["surface_objects"][0]
    second = upgrade_surface_settings(changed, "owner")["surface_objects"][0]
    other_owner = upgrade_surface_settings(old, "another-owner")["surface_objects"][0]
    assert first["id"] == second["id"] != other_owner["id"]
    assert first["source"] != second["source"]
    assert old["selection_surface"]["atom_ids"] == [1]


@pytest.mark.parametrize("failure", ["invalid-late-snapshot", "empty-ordinary-downgrade"])
def test_0014_refusals_prevalidate_before_any_row_changes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    config = migration_config(tmp_path, monkeypatch)
    command.upgrade(config, "0013")
    engine = create_database_engine(f"sqlite:///{tmp_path / 'migration-data' / 'molweave.db'}")
    factory = create_session_factory(engine)
    legacy = {
        **legacy_viewer_settings(),
        "selection_surface": None,
        "selection_pocket_surface": None,
    }
    with factory() as session:
        session.add(Project(id="p", name="Atomic migration"))
        session.flush()
        session.add(StructureEntry(id="e", project_id="p", name="Entry", viewer_settings=legacy))
        if failure == "invalid-late-snapshot":
            session.add(
                CommandRecord(
                    id="c",
                    project_id="p",
                    position=1,
                    command_type="entry.viewer_settings",
                    description="Invalid retained input",
                    affected_entry_ids=["e"],
                    forward_actions=[],
                    inverse_actions=[
                        {
                            "kind": "entry.update",
                            "entry_id": "e",
                            "values": {
                                "viewer_settings": {
                                    **legacy,
                                    "selection_surface": {"profile": "unknown", "atom_ids": [1]},
                                }
                            },
                        }
                    ],
                )
            )
        session.commit()
    if failure == "invalid-late-snapshot":
        with pytest.raises(ValueError):
            command.upgrade(config, "0014")
        with factory() as session:
            entry = session.get(StructureEntry, "e")
            assert entry and entry.viewer_settings == legacy
    else:
        command.upgrade(config, "0014")
        with factory() as session:
            entry = session.get(StructureEntry, "e")
            assert entry
            current = {**entry.viewer_settings, "representations": []}
            entry.viewer_settings = current
            session.commit()
        with pytest.raises(RuntimeError, match="empty representation set"):
            command.downgrade(config, "0013")
        with factory() as session:
            entry = session.get(StructureEntry, "e")
            assert entry and entry.viewer_settings == current
    engine.dispose()
