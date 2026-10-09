"""Manual two-process qualification against an actual preceding release checkout.

Run `produce` with the candidate PYTHONPATH, then `read` with the preceding
release's API/core/plugin PYTHONPATH. The shared pinned environment is unchanged.
The data directory must be freshly migrated by the candidate, not a user project.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import molweave_api.main
from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.support.api_client import ApiClient


def structure(client: ApiClient, project_id: str, entry_id: str) -> dict[str, Any]:
    response = client.get(f"/api/v1/projects/{project_id}/entries/{entry_id}/structure")
    assert response.status_code == 200, response.text
    return response.json()["structure"]


def original_hash(client: ApiClient, project_id: str, entry_id: str) -> str:
    response = client.get(f"/api/v1/projects/{project_id}/entries/{entry_id}/original")
    assert response.status_code == 200
    return hashlib.sha256(response.content).hexdigest()


def produce(client: ApiClient, data_dir: Path) -> dict[str, Any]:
    from tests.integration.test_archive_roundtrip import build_rich_project, export_archive
    from tests.integration.test_coordinate_commands import _selection_payload
    from tests.integration.test_job_lifecycle import _submit, _worker

    project = build_rich_project(client)
    project_id = project["id"]
    ligand = next(entry for entry in project["entries"] if entry["source_format"] == "mol")
    unlocked = client.post(
        f"/api/v1/projects/{project_id}/entries/{ligand['id']}/lock",
        json={"expected_revision": project["revision"], "value": False},
    )
    assert unlocked.status_code == 200, unlocked.text
    project = unlocked.json()
    submitted = _submit(client, project_id, ligand["id"], {"step_count": 1, "delay_ms": 0})
    assert submitted.status_code == 201, submitted.text
    assert _worker(client, "reader-qualification").run_once()
    jobs = client.get(f"/api/v1/projects/{project_id}/jobs").json()
    assert jobs[0]["status"] == "completed"
    before = {entry["id"]: structure(client, project_id, entry["id"])
              for entry in project["entries"]}
    response = client.post(
        f"/api/v1/projects/{project_id}/selection-transform",
        json=_selection_payload(
            project["revision"], [(entry_id, atom_id) for entry_id in before for atom_id in [1, 2]],
            rotation=[[0, -1, 0], [1, 0, 0], [0, 0, 1]], translation=[2.5, -1, 0.25],
        ),
    )
    assert response.status_code == 200, response.text
    moved = response.json()
    after = {entry_id: structure(client, project_id, entry_id) for entry_id in before}
    assert all(after[entry_id] != before[entry_id] for entry_id in before)
    assert client.get(f"/api/v1/projects/{project_id}/jobs").json() == jobs
    archive = export_archive(client, project_id, "preceding-reader-archive")
    archive_bytes = client.get(archive["artifact"]["download_url"]).content
    (data_dir / "moved.molweave.zip").write_bytes(archive_bytes)
    state = {"project": moved, "before": before, "after": after, "jobs": jobs,
             "producer": APPLICATION_VERSION,
             "originals": {entry_id: original_hash(client, project_id, entry_id)
                           for entry_id in before}}
    (data_dir / "reader-expectations.json").write_text(json.dumps(state))
    return {"producer": APPLICATION_VERSION, "entries": len(before), "atomic_batch": True,
            "jobs_unchanged": True, "archive_sha256": hashlib.sha256(archive_bytes).hexdigest()}


def read(client: ApiClient, data_dir: Path, expected_reader: str) -> dict[str, Any]:
    from tests.integration.test_archive_roundtrip import export_archive, import_archive

    assert APPLICATION_VERSION == expected_reader
    expected = json.loads((data_dir / "reader-expectations.json").read_text())
    project_id = expected["project"]["id"]
    project = client.get(f"/api/v1/projects/{project_id}").json()
    assert project["revision"] == expected["project"]["revision"]
    for entry_id, after in expected["after"].items():
        assert structure(client, project_id, entry_id) == after
        assert original_hash(client, project_id, entry_id) == expected["originals"][entry_id]
    assert client.get(f"/api/v1/projects/{project_id}/jobs").json() == expected["jobs"]
    undone = client.post(f"/api/v1/projects/{project_id}/history/undo",
                         json={"expected_revision": project["revision"]})
    assert undone.status_code == 200, undone.text
    for entry_id, before in expected["before"].items():
        assert structure(client, project_id, entry_id) == before
    redone = client.post(f"/api/v1/projects/{project_id}/history/redo",
                         json={"expected_revision": undone.json()["revision"]})
    assert redone.status_code == 200, redone.text
    for entry_id, after in expected["after"].items():
        assert structure(client, project_id, entry_id) == after
        assert original_hash(client, project_id, entry_id) == expected["originals"][entry_id]
    saved = client.post(f"/api/v1/projects/{project_id}/save",
                        json={"expected_revision": redone.json()["revision"]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["has_uncheckpointed_changes"] is False
    old_export = export_archive(client, project_id, "old-reader-export")
    assert old_export["source_revision"] == redone.json()["revision"]
    restored = import_archive(client, (data_dir / "moved.molweave.zip").read_bytes())["project"]
    assert restored["history"]["retained_commands"] == 0
    by_name = {entry["name"]: entry["id"] for entry in project["entries"]}
    for entry in restored["entries"]:
        source_id = by_name[entry["name"]]
        assert structure(client, restored["id"], entry["id"]) == expected["after"][source_id]
        assert original_hash(client, restored["id"], entry["id"]) == (
            expected["originals"][source_id]
        )
    assert client.get(f"/api/v1/projects/{project_id}/jobs").json() == expected["jobs"]
    return {"reader": APPLICATION_VERSION, "reader_module": molweave_api.main.__file__,
            "producer": expected["producer"], "entries": len(by_name),
            "exact_coordinates_and_originals": True, "retained_batch_undo_redo": True,
            "save_and_reexport": True, "archive_import": True, "archive_omits_history": True,
            "original_jobs_unchanged": True}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--expected-reader", default="0.10.0")
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    data_dir = args.data_dir.resolve()
    client = ApiClient(create_app(Settings(
        data_dir=data_dir, database_url=f"sqlite:///{data_dir / 'molweave.db'}",
    )))
    try:
        result = (produce(client, data_dir) if args.mode == "produce"
                  else read(client, data_dir, args.expected_reader))
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        client.app.state.engine.dispose()


if __name__ == "__main__":
    main()
