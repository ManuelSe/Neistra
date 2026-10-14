"""Run actual tagged schema-1 production, schema-2 upgrade, old-reader refusal, and backup checks.

Use separate processes with explicit candidate/tagged PYTHONPATH roots. Data directories
must be disposable and migrated by the selected source before invoking this script.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from copy import deepcopy
from pathlib import Path
from typing import Any

import molweave_api.main
from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.support.api_client import ApiClient


def check(response: Any, status: int = 200) -> Any:
    assert response.status_code == status, response.text
    return response.json()


def database_snapshot(path: Path) -> dict[str, Any]:
    with sqlite3.connect(path) as connection:
        connection.row_factory = sqlite3.Row
        names = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
            if row[0] != "alembic_version"
        ]

        def decoded(value: Any) -> Any:
            if isinstance(value, str) and value.startswith(("{", "[")):
                try:
                    return json.loads(value)
                except ValueError:
                    pass
            return value

        return {
            name: [
                {key: decoded(value) for key, value in dict(row).items()}
                for row in connection.execute(f'SELECT * FROM "{name}" ORDER BY rowid')
            ]
            for name in sorted(names)
        }


def artifacts(path: Path) -> dict[str, str]:
    return {
        str(file.relative_to(path)): hashlib.sha256(file.read_bytes()).hexdigest()
        for file in sorted((path / "artifacts").rglob("*"))
        if file.is_file()
    }


def produce(client: ApiClient, data: Path, bundle: Path) -> dict[str, Any]:
    from tests.integration.test_archive_roundtrip import build_rich_project, export_archive
    from tests.integration.test_job_lifecycle import _submit, _worker

    assert APPLICATION_VERSION == "0.13.2"
    expectations: list[dict[str, Any]] = []
    for dirty in [False, True]:
        project = build_rich_project(client)
        path = f"/api/v1/projects/{project['id']}"
        receptor = next(entry for entry in project["entries"] if entry["source_format"] == "pdb")
        ligand = next(entry for entry in project["entries"] if entry["source_format"] == "mol")
        settings = deepcopy(receptor["viewer_settings"])
        settings["representations"] = [
            {
                "id": f"legacy-surface-{i}",
                "style": "surface",
                "color_by": "custom",
                "custom_color": "#3388aa",
                "opacity": 0.15 + i * 0.02,
            }
            for i in range(12)
        ]
        project = check(
            client.request(
                "PUT",
                f"{path}/entries/{receptor['id']}/viewer-settings",
                json={"expected_revision": project["revision"], "settings": settings},
            )
        )
        selection = {
            "schema_version": 1,
            "atoms": [{"structure_id": receptor["id"], "atom_id": i} for i in [1, 2, 3]],
            "granularity": "atom",
            "source": "inspector",
        }
        project = check(
            client.post(
                f"{path}/selection-surface",
                json={
                    "expected_revision": project["revision"],
                    "selection": selection,
                    "action": "add",
                },
            )
        )
        pocket = {
            "profile": "pocket-v1",
            "radius": 5,
            "seed_atom_references": sorted(
                [
                    {"structure_id": ligand["id"], "atom_id": 1},
                    {"structure_id": receptor["id"], "atom_id": 2},
                ],
                key=lambda ref: (ref["structure_id"], ref["atom_id"]),
            ),
        }
        project = check(
            client.post(
                f"{path}/selection-pocket-surface",
                json={
                    "expected_revision": project["revision"],
                    "receptor_entry_id": receptor["id"],
                    "action": "apply",
                    "pocket": pocket,
                },
            )
        )
        project = check(
            client.post(
                f"{path}/selection-appearance",
                json={
                    "expected_revision": project["revision"],
                    "selection": selection,
                    "property": "color",
                    "action": "set",
                    "color": "#ff00ff",
                },
            )
        )
        project = check(
            client.post(
                f"{path}/entries/{ligand['id']}/visibility",
                json={"expected_revision": project["revision"], "value": False},
            )
        )
        project = check(
            client.post(
                f"{path}/scenes",
                json={
                    "expected_revision": project["revision"],
                    "name": "All legacy surfaces",
                    "selection": selection,
                    "camera": {
                        "mode": "perspective",
                        "position": [0, 0, 30],
                        "target": [0, 0, 0],
                        "up": [0, 1, 0],
                        "radius": 30,
                    },
                },
            ),
            201,
        )
        submitted = check(
            _submit(client, project["id"], ligand["id"], {"step_count": 1, "delay_ms": 0}), 201
        )
        assert _worker(client, "surface-legacy-producer").run_once()
        assert check(client.get(f"/api/v1/jobs/{submitted['id']}"))["status"] == "completed"
        project = check(
            client.post(f"{path}/save", json={"expected_revision": project["revision"]})
        )
        if dirty:
            project = check(
                client.post(
                    f"{path}/selection-surface",
                    json={
                        "expected_revision": project["revision"],
                        "selection": {**selection, "atoms": selection["atoms"][2:]},
                        "action": "remove",
                    },
                )
            )
            project = check(
                client.post(
                    f"{path}/selection-pocket-surface",
                    json={
                        "expected_revision": project["revision"],
                        "receptor_entry_id": receptor["id"],
                        "action": "apply",
                        "pocket": {**pocket, "radius": 7.5},
                    },
                )
            )
            project = check(
                client.post(f"{path}/history/undo", json={"expected_revision": project["revision"]})
            )
        project = check(client.get(path))
        assert project["has_uncheckpointed_changes"] is dirty
        exported = export_archive(client, project["id"], f"legacy-surface-{dirty}")
        archive = client.get(exported["artifact"]["download_url"]).content
        (bundle / f"legacy-{dirty}.molweave.zip").write_bytes(archive)
        structures = {
            entry["id"]: check(client.get(f"{path}/entries/{entry['id']}/structure"))
            for entry in project["entries"]
        }
        originals = {
            entry["id"]: hashlib.sha256(
                client.get(f"{path}/entries/{entry['id']}/original").content
            ).hexdigest()
            for entry in project["entries"]
        }
        expectations.append(
            {
                "project": project,
                "receptor": receptor["id"],
                "ligand": ligand["id"],
                "dirty": dirty,
                "structures": structures,
                "originals": originals,
                "jobs": check(client.get(f"{path}/jobs")),
            }
        )
    snapshot = database_snapshot(data / "molweave.db")
    state = {"projects": expectations, "database": snapshot, "artifacts": artifacts(data)}
    (bundle / "expectations.json").write_text(json.dumps(state))
    return {
        "actual_producer": APPLICATION_VERSION,
        "producer_module": molweave_api.main.__file__,
        "projects": 2,
        "legacy_objects_per_receptor": 14,
        "clean_and_dirty_checkpoints": True,
        "retained_redo": True,
        "jobs_and_archives": True,
    }


def verify_state(client: ApiClient, expected: dict[str, Any], *, upgraded: bool) -> None:
    old = expected["project"]
    path = f"/api/v1/projects/{old['id']}"
    project = check(client.get(path))
    assert project["schema_version"] == (2 if upgraded else 1)
    for field in [
        "revision",
        "checkpoint_revision",
        "has_uncheckpointed_changes",
        "created_at",
        "modified_at",
        "history",
    ]:
        assert project[field] == old[field], field
    for entry in project["entries"]:
        original = next(item for item in old["entries"] if item["id"] == entry["id"])
        assert {key: value for key, value in entry.items() if key != "viewer_settings"} == {
            key: value for key, value in original.items() if key != "viewer_settings"
        }
        assert (
            check(client.get(f"{path}/entries/{entry['id']}/structure"))
            == expected["structures"][entry["id"]]
        )
        assert (
            hashlib.sha256(client.get(f"{path}/entries/{entry['id']}/original").content).hexdigest()
            == expected["originals"][entry["id"]]
        )
    assert check(client.get(f"{path}/jobs")) == expected["jobs"]


def upgrade(client: ApiClient, data: Path, bundle: Path) -> dict[str, Any]:
    from molweave_api.surface_upgrade import upgrade_surface_settings

    from tests.integration.test_archive_roundtrip import export_archive, import_archive

    expected = json.loads((bundle / "expectations.json").read_text())
    assert artifacts(data) == expected["artifacts"]
    before = deepcopy(expected["database"])

    # Restrict conversion to documented paths; all other columns must stay identical.
    def entries(states: list[dict[str, Any]]) -> None:
        for state in states:
            if "viewer_settings" in state:
                state["viewer_settings"] = upgrade_surface_settings(
                    state["viewer_settings"], state.get("entry_id", state.get("id"))
                )

    for entry in before["structure_entries"]:
        entry["viewer_settings"] = upgrade_surface_settings(entry["viewer_settings"], entry["id"])
    for project in before["projects"]:
        project["checkpoint_state"]["schema_version"] = 2
        entries(project["checkpoint_state"]["entries"])
        for scene in project["checkpoint_state"]["scenes"]:
            entries(scene["entry_states"])
    for scene in before["scenes"]:
        entries(scene["entry_states"])
    for command in before["command_records"]:
        for direction in ["forward_actions", "inverse_actions"]:
            for action in command[direction]:
                if action["kind"] == "entry.create":
                    entries([action["entry"]])
                elif (
                    action["kind"] in ["entry.update", "entry.molecule"]
                    and "viewer_settings" in action["values"]
                ):
                    action["values"]["viewer_settings"] = upgrade_surface_settings(
                        action["values"]["viewer_settings"], action["entry_id"]
                    )
                elif action["kind"] == "entries.viewer_state":
                    entries(action["values"])
                elif action["kind"] == "scene.create":
                    entries(action["scene"]["entry_states"])
                elif action["kind"] == "scene.update" and "entry_states" in action["values"]:
                    entries(action["values"]["entry_states"])
    assert database_snapshot(data / "molweave.db") == before
    for item in expected["projects"]:
        verify_state(client, item, upgraded=True)
        path = f"/api/v1/projects/{item['project']['id']}"
        project = check(client.get(path))
        owner = next(entry for entry in project["entries"] if entry["id"] == item["receptor"])
        objects = owner["viewer_settings"]["surface_objects"]
        assert len(objects) == 14 and owner["viewer_settings"]["representations"] == []
        assert all(obj["appearance"]["inherit_atom_colors"] for obj in objects)
        original_settings = next(
            entry for entry in item["project"]["entries"] if entry["id"] == owner["id"]
        )["viewer_settings"]
        for index, obj in enumerate(objects[:12]):
            assert {
                key: obj["appearance"][key] for key in ["color_by", "custom_color", "opacity"]
            } == {
                key: original_settings["representations"][index][key]
                for key in ["color_by", "custom_color", "opacity"]
            }
        if item["dirty"]:
            project = check(
                client.post(f"{path}/history/redo", json={"expected_revision": project["revision"]})
            )
            pocket = next(entry for entry in project["entries"] if entry["id"] == owner["id"])[
                "viewer_settings"
            ]["surface_objects"][-1]
            assert pocket["source"]["radius"] == 7.5 and pocket["id"] == objects[-1]["id"]
            for _ in range(2):
                project = check(
                    client.post(
                        f"{path}/history/undo", json={"expected_revision": project["revision"]}
                    )
                )
            assert not project["has_uncheckpointed_changes"]
        restored = import_archive(
            client, (bundle / f"legacy-{item['dirty']}.molweave.zip").read_bytes()
        )["project"]
        imported_owner = next(
            entry for entry in restored["entries"] if entry["source_format"] == "pdb"
        )
        assert [obj["id"] for obj in imported_owner["viewer_settings"]["surface_objects"]] == [
            obj["id"] for obj in objects
        ]
        imported_pocket = imported_owner["viewer_settings"]["surface_objects"][-1]
        assert {
            ref["structure_id"] for ref in imported_pocket["source"]["seed_atom_references"]
        } == {entry["id"] for entry in restored["entries"]}
        assert not restored["has_uncheckpointed_changes"]
        exported = export_archive(client, project["id"], f"new-surface-{item['dirty']}")
        (bundle / f"schema2-{item['dirty']}.molweave.zip").write_bytes(
            client.get(exported["artifact"]["download_url"]).content
        )
    return {
        "candidate": APPLICATION_VERSION,
        "candidate_module": molweave_api.main.__file__,
        "actual_tagged_producer_upgrade": True,
        "all_database_columns_except_documented_conversion_exact": True,
        "all_artifact_bytes_exact": True,
        "appearance_and_identity_preserved": True,
        "clean_dirty_and_retained_redo_preserved": True,
        "undo_restores_clean_checkpoint": True,
        "actual_schema1_archive_import_and_seed_remapping": True,
        "schema2_exports": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "upgrade", "reject-new", "backup-read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    data, bundle = args.data_dir.resolve(), args.bundle.resolve()
    bundle.mkdir(parents=True, exist_ok=True)
    client = ApiClient(
        create_app(Settings(data_dir=data, database_url=f"sqlite:///{data / 'molweave.db'}"))
    )
    try:
        if args.mode == "produce":
            result = produce(client, data, bundle)
        elif args.mode == "upgrade":
            result = upgrade(client, data, bundle)
        elif args.mode == "reject-new":
            assert APPLICATION_VERSION == "0.13.2"
            original = check(client.get("/api/v1/projects"))
            for dirty in [False, True]:
                response = client.post(
                    "/api/v1/projects/import-archive",
                    data={"operation_id": f"reject-schema2-{dirty}"},
                    files={
                        "file": (
                            "new.molweave.zip",
                            (bundle / f"schema2-{dirty}.molweave.zip").read_bytes(),
                            "application/zip",
                        )
                    },
                )
                assert response.status_code == 422, response.text
                assert response.json()["detail"]["code"] == "unsupported_archive_schema"
                assert check(client.get("/api/v1/projects")) == original
            result = {
                "actual_reader": APPLICATION_VERSION,
                "reader_module": molweave_api.main.__file__,
                "schema2_archives_cleanly_rejected": 2,
                "no_projects_created": True,
            }
        else:
            assert APPLICATION_VERSION == "0.13.2"
            expected = json.loads((bundle / "expectations.json").read_text())
            assert database_snapshot(data / "molweave.db") == expected["database"]
            assert artifacts(data) == expected["artifacts"]
            for item in expected["projects"]:
                verify_state(client, item, upgraded=False)
            result = {
                "actual_reader": APPLICATION_VERSION,
                "reader_module": molweave_api.main.__file__,
                "complete_preupgrade_backup_restored": True,
                "database_artifacts_projects_history_jobs_exact": True,
            }
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        client.app.state.engine.dispose()


if __name__ == "__main__":
    main()
