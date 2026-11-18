from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from neistra_api.database import create_database_engine, create_session_factory
from neistra_core.ligands.models import LigandDesignationV1
from sqlalchemy import MetaData, Table, inspect, select
from sqlalchemy.exc import OperationalError

from tests.support.legacy_project_models import CommandRecord, Project, StructureEntry


def store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Config, Any]:
    directory = tmp_path / "ligand-migration"
    monkeypatch.setenv("NEISTRA_DATA_DIR", str(directory))
    monkeypatch.setenv("NEISTRA_DATABASE_URL", f"sqlite:///{directory / 'neistra.db'}")
    monkeypatch.delenv("MOLWEAVE_DATA_DIR", raising=False)
    monkeypatch.delenv("MOLWEAVE_DATABASE_URL", raising=False)
    config = Config("alembic.ini")
    command.upgrade(config, "0015")
    engine = create_database_engine(f"sqlite:///{directory / 'neistra.db'}")
    factory = create_session_factory(engine)
    with factory() as session:
        session.add(Project(
            id="p", name="Preserved", checkpoint_state={
                "schema_version": 2,
                "entries": [{"id": "e", "user_metadata": {"ligand_designation": "user value"}}],
            },
        ))
        session.flush()
        session.add(StructureEntry(
            id="e", project_id="p", name="Entry", user_metadata={"untouched": [1, 2, 3]},
        ))
        session.add(CommandRecord(
            id="c", project_id="p", position=1, command_type="entry.import", description="Import",
            affected_entry_ids=["e"],
            forward_actions=[{"kind": "entry.create", "entry": {"id": "e"}}],
            inverse_actions=[{"kind": "entry.delete", "entry_id": "e"}],
        ))
        session.commit()
    return config, engine


def snapshot(engine: Any) -> dict[str, list[Any]]:
    metadata = MetaData()
    with engine.connect() as connection:
        return {
            name: list(connection.execute(select(Table(name, metadata, autoload_with=connection))))
            for name in sorted(inspect(connection).get_table_names())
        }


def test_ligand_schema_fences_the_old_mapper_and_roundtrips_only_default_state(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    config, engine = store(tmp_path, monkeypatch)
    before = snapshot(engine)
    command.upgrade(config, "0016")
    assert "projects" not in inspect(engine).get_table_names()
    assert "project_documents_v3" in inspect(engine).get_table_names()
    with create_session_factory(engine)() as session:
        # The actual pre-designation mapping cannot observe a project and later
        # silently reconstruct a checkpoint/archive that omits designation.
        with pytest.raises(OperationalError, match="no such table: projects"):
            session.get(Project, "p")
    from neistra_api.models import Project as CurrentProject
    from neistra_api.models import StructureEntry as CurrentEntry

    with create_session_factory(engine)() as session:
        current = session.get(CurrentProject, "p")
        entry = session.get(CurrentEntry, "e")
        assert current and entry
        assert current.checkpoint_state["schema_version"] == 3
        assert current.checkpoint_state["entries"][0]["user_metadata"] == {
            "ligand_designation": "user value"
        }
        assert LigandDesignationV1.model_validate(entry.ligand_designation).status == "unresolved"
        assert entry.user_metadata == {"untouched": [1, 2, 3]}
    command.downgrade(config, "0015")
    assert snapshot(engine) == before
    command.upgrade(config, "0016")
    with engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    engine.dispose()


@pytest.mark.parametrize("location", ["live", "checkpoint", "forward", "inverse", "values"])
def test_ligand_downgrade_refuses_retained_clear_before_any_row_or_schema_change(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, location: str,
) -> None:
    config, engine = store(tmp_path, monkeypatch)
    command.upgrade(config, "0016")
    from neistra_api.models import CommandRecord as CurrentCommand
    from neistra_api.models import Project as CurrentProject
    from neistra_api.models import StructureEntry as CurrentEntry

    cleared = LigandDesignationV1(status="cleared").model_dump(mode="json")
    with create_session_factory(engine)() as session:
        entry = session.get(CurrentEntry, "e")
        project = session.get(CurrentProject, "p")
        history = session.get(CurrentCommand, "c")
        assert entry and project and history
        if location == "live":
            entry.ligand_designation = cleared
        elif location == "checkpoint":
            state = deepcopy(project.checkpoint_state)
            state["entries"][0]["ligand_designation"] = cleared
            project.checkpoint_state = state
        elif location == "values":
            history.inverse_actions = [{
                "kind": "entry.update", "entry_id": "e", "values": {"ligand_designation": cleared},
            }]
        else:
            field = "forward_actions" if location == "forward" else "inverse_actions"
            setattr(history, field, [{
                "kind": "entry.create", "entry": {"id": "e", "ligand_designation": cleared},
            }])
        session.commit()
    before = snapshot(engine)
    with pytest.raises(RuntimeError, match="retained ligand designation"):
        command.downgrade(config, "0015")
    assert snapshot(engine) == before
    engine.dispose()


@pytest.mark.parametrize("field", ["forward_actions", "inverse_actions"])
@pytest.mark.parametrize("kind", ["entry.coordinates", "entry.molecule"])
@pytest.mark.parametrize("status", ["cleared", "resolved", "stale"])
def test_ligand_downgrade_refuses_top_level_molecular_intent_atomically(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, field: str, kind: str, status: str,
) -> None:
    from datetime import UTC, datetime
    from uuid import uuid4

    from neistra_api.models import CommandRecord as CurrentCommand

    config, engine = store(tmp_path, monkeypatch)
    command.upgrade(config, "0016")
    designation = LigandDesignationV1(status="cleared")
    if status != "cleared":
        designation = LigandDesignationV1(
            status=status, source_artifact_id="artifact", instance_id=str(uuid4()), atom_ids=[1, 2],
            origin="manual", selected_at=datetime.now(UTC),
            reason_code="lost_anchors" if status == "stale" else None,
        )
    with create_session_factory(engine)() as session:
        history = session.get(CurrentCommand, "c")
        assert history is not None
        setattr(history, field, [{
            "kind": kind, "entry_id": "e", "artifact_id": "artifact", "values": {},
            "ligand_designation": designation.model_dump(mode="json"),
        }])
        session.commit()
    before = snapshot(engine)
    with pytest.raises(RuntimeError, match="retained ligand designation"):
        command.downgrade(config, "0015")
    assert snapshot(engine) == before
    engine.dispose()


@pytest.mark.parametrize("field", ["forward_actions", "inverse_actions"])
@pytest.mark.parametrize("kind", ["entry.coordinates", "entry.molecule"])
def test_ligand_default_molecular_intent_is_stripped_on_lossless_downgrade(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, field: str, kind: str,
) -> None:
    config, engine = store(tmp_path, monkeypatch)
    original = {"kind": kind, "entry_id": "e", "artifact_id": "artifact", "values": {}}
    with create_session_factory(engine)() as session:
        history = session.get(CommandRecord, "c")
        assert history is not None
        setattr(history, field, [original])
        session.commit()
    before = snapshot(engine)
    command.upgrade(config, "0016")
    from neistra_api.models import CommandRecord as CurrentCommand

    with create_session_factory(engine)() as session:
        history = session.get(CurrentCommand, "c")
        assert history is not None
        setattr(history, field, [{
            **original, "ligand_designation": LigandDesignationV1().model_dump(mode="json"),
        }])
        session.commit()
    command.downgrade(config, "0015")
    assert snapshot(engine) == before
    engine.dispose()
