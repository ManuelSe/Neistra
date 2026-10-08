from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from molweave_api.database import Base
from molweave_api.main import create_app
from molweave_api.models import CommandRecord
from molweave_api.settings import Settings
from sqlalchemy import select

from tests.integration.test_archive_roundtrip import (
    build_rich_project,
    export_archive,
    import_archive,
)
from tests.integration.test_job_lifecycle import _submit
from tests.support.api_client import ApiClient
from tests.unit.test_commands import create_project, seed_entry


def membership(client: ApiClient, project: dict[str, Any], ids: list[str], group_id, **extra):
    return client.post(
        f"/api/v1/projects/{project['id']}/group-membership",
        json={
            "expected_revision": project["revision"],
            "entry_ids": ids,
            "group_id": group_id,
            **extra,
        },
    )


def groups(project: dict[str, Any]) -> dict[str, str | None]:
    return {entry["id"]: entry["group_id"] for entry in project["entries"]}


def history(client: ApiClient, project: dict[str, Any], action: str) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/projects/{project['id']}/history/{action}",
        json={"expected_revision": project["revision"]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_batch_membership_history_noops_and_complete_state_invariance(client: ApiClient) -> None:
    project = build_rich_project(client)
    path = f"/api/v1/projects/{project['id']}"
    entries = deepcopy(project["entries"])
    ids = [entry["id"] for entry in entries]
    source = project["groups"][0]["id"]
    selection = {
        "schema_version": 1,
        "atoms": [{"structure_id": ids[0], "atom_id": entries[0]["atom_ids"][0]}],
        "granularity": "atom",
        "source": "project",
    }
    structure_bytes = {
        entry_id: client.get(f"{path}/entries/{entry_id}/structure").content for entry_id in ids
    }
    original_bytes = {
        entry_id: client.get(f"{path}/entries/{entry_id}/original").content for entry_id in ids
    }
    job = _submit(client, project["id"], ids[0], {"step_count": 1, "delay_ms": 0}).json()
    job = client.get(f"/api/v1/jobs/{job['id']}").json()
    project = client.get(path).json()
    entries = deepcopy(project["entries"])
    response = membership(client, project, ids, None, selection=selection)
    assert response.status_code == 200, response.text
    changed = response.json()
    assert changed["revision"] == project["revision"] + 1
    assert changed["history"]["retained_commands"] == project["history"]["retained_commands"] + 1
    assert set(groups(changed).values()) == {None}
    assert changed["groups"] == project["groups"]  # Final members do not delete the group.
    assert changed["saved_selections"] == project["saved_selections"]
    assert changed["measurements"] == project["measurements"]
    assert changed["scenes"] == project["scenes"]
    assert changed["structure_patches"] == changed["topology_patches"] == []
    for entry in changed["entries"]:
        before = next(item for item in entries if item["id"] == entry["id"])
        assert {k: v for k, v in entry.items() if k not in {"group_id", "dirty"}} == {
            k: v for k, v in before.items() if k not in {"group_id", "dirty"}
        }
        assert client.get(f"{path}/entries/{entry['id']}/structure").content == structure_bytes[
            entry["id"]
        ]
        assert client.get(f"{path}/entries/{entry['id']}/original").content == original_bytes[
            entry["id"]
        ]
    assert client.get(f"/api/v1/jobs/{job['id']}").json() == job
    with client.app.state.session_factory() as session:
        command = session.scalar(
            select(CommandRecord).where(CommandRecord.command_type == "group.membership")
        )
        assert command is not None
        assert command.affected_entry_ids == sorted(ids)
        assert command.selection_snapshot == selection["atoms"]
        assert command.forward_actions == [
            {"kind": "entries.group", "values": dict.fromkeys(sorted(ids), None)}
        ]
        assert command.inverse_actions == [
            {"kind": "entries.group", "values": dict.fromkeys(sorted(ids), source)}
        ]
    undone = history(client, changed, "undo")
    assert groups(undone) == groups(project)
    assert membership(client, undone, ids, source).json() == client.get(path).json()
    assert undone["history"]["can_redo"]
    redone = history(client, undone, "redo")
    assert groups(redone) == groups(changed)
    assert membership(client, redone, ids, None).json() == client.get(path).json()
    assert membership(client, project, ids, None).status_code == 409


def test_mixed_batches_record_only_changes_and_retain_groups_after_delete(
    client: ApiClient,
) -> None:
    project = create_project(client)
    path = f"/api/v1/projects/{project['id']}"
    ids = [seed_entry(client, str(project["id"]), name) for name in ("A", "B", "C")]
    project = client.post(
        f"{path}/groups", json={"expected_revision": 0, "name": "First", "entry_ids": ids[:1]}
    ).json()
    source = project["groups"][0]["id"]
    project = client.post(
        f"{path}/groups", json={"expected_revision": 1, "name": "Second", "entry_ids": ids[1:2]}
    ).json()
    target = next(group["id"] for group in project["groups"] if group["name"] == "Second")
    before = groups(project)
    project = membership(client, project, ids, target).json()
    assert set(groups(project).values()) == {target}
    with client.app.state.session_factory() as session:
        command = session.scalar(
            select(CommandRecord).where(CommandRecord.command_type == "group.membership")
        )
        assert command is not None
        assert command.affected_entry_ids == sorted([ids[0], ids[2]])
    project = history(client, project, "undo")
    assert groups(project) == before
    project = membership(client, project, [ids[0]], None).json()
    assert source in {group["id"] for group in project["groups"]}
    project = client.delete(
        f"{path}/entries/{ids[1]}", params={"expected_revision": project["revision"]}
    ).json()
    assert target in {group["id"] for group in project["groups"]}
    project = history(client, project, "undo")
    assert groups(project)[ids[1]] == target


@pytest.mark.parametrize(
    "invalid", ["empty", "duplicate", "missing", "foreign", "group", "selection"]
)
def test_invalid_batches_reject_before_any_write(client: ApiClient, invalid: str) -> None:
    project = build_rich_project(client)
    path = f"/api/v1/projects/{project['id']}"
    ids = [entry["id"] for entry in project["entries"]]
    other = create_project(client, "Other")
    foreign_id = seed_entry(client, str(other["id"]), "Foreign")
    foreign_group = client.post(
        f"/api/v1/projects/{other['id']}/groups",
        json={"expected_revision": 0, "name": "Foreign", "entry_ids": [foreign_id]},
    ).json()["groups"][0]["id"]
    target = None
    extra = {}
    if invalid == "empty":
        ids = []
    elif invalid == "duplicate":
        ids += ids[:1]
    elif invalid == "missing":
        ids += ["missing"]
    elif invalid == "foreign":
        ids += [foreign_id]
    elif invalid == "group":
        target = foreign_group
    else:
        extra = {
            "selection": {
                "schema_version": 1,
                "atoms": [{"structure_id": ids[0], "atom_id": 999999}],
                "granularity": "atom",
                "source": "project",
            }
        }
    before = client.get(path).json()
    assert membership(client, project, ids, target, **extra).status_code == 422
    assert client.get(path).json() == before


def test_membership_checkpoint_restart_archive_and_legacy_history(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, database_url=f"sqlite:///{tmp_path / 'durable.db'}")
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    client = ApiClient(app)
    project = build_rich_project(client)
    path = f"/api/v1/projects/{project['id']}"
    ids = [entry["id"] for entry in project["entries"]]
    source_group = project["groups"][0]["id"]
    project = membership(client, project, ids, None).json()
    project = client.post(
        f"{path}/groups",
        json={"expected_revision": project["revision"], "name": "New", "entry_ids": ids[:1]},
    ).json()
    assert project["has_uncheckpointed_changes"]
    app.state.engine.dispose()
    app = create_app(settings)
    client = ApiClient(app)
    assert groups(client.get(path).json()) == groups(project)
    saved = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    assert not saved["has_uncheckpointed_changes"]
    archive = export_archive(client, project["id"], "groups")
    restored = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    restored_groups = {group["name"]: group["id"] for group in restored["groups"]}
    assert "Inputs" in restored_groups  # The empty group survives the portable snapshot.
    assert source_group not in restored_groups.values()
    by_name = {entry["name"]: entry for entry in restored["entries"]}
    for entry in project["entries"]:
        restored_entry = by_name[entry["name"]]
        assert restored_entry["group_id"] == (
            restored_groups["New"] if entry["id"] == ids[0] else None
        )
        assert restored_entry["id"] != entry["id"]
        assert client.get(
            f"/api/v1/projects/{restored['id']}/entries/{restored_entry['id']}/original"
        ).content == client.get(f"{path}/entries/{entry['id']}/original").content
    assert restored["history"]["retained_commands"] == 0
    assert not restored["has_uncheckpointed_changes"]
    project = history(client, project, "undo")  # Existing group.create history still works.
    project = history(client, project, "undo")  # New command uses the legacy entries.group action.
    assert set(groups(project).values()) == {source_group}
    assert membership(client, project, ids, source_group).json()["history"]["can_redo"]
    app.state.engine.dispose()
