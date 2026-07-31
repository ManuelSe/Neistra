from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any

from molweave_api.job_worker import JobWorker

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"
DEMO_JOB_TYPE = "molweave.demo.structure_statistics"


def _project_with_structure(client: ApiClient) -> tuple[dict[str, Any], dict[str, Any]]:
    project = client.post("/api/v1/projects", json={"name": "Job lifecycle"}).json()
    imported = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={
            "expected_revision": 0,
            "generate_3d": "true",
            "infer_bonds": "true",
        },
        files=[
            (
                "files",
                (
                    "ethanol.mol",
                    (FIXTURES / "ethanol.mol").read_bytes(),
                    "chemical/x-mdl-molfile",
                ),
            )
        ],
    ).json()
    return imported["project"], imported["project"]["entries"][0]


def _submit(
    client: ApiClient,
    project_id: str,
    entry_id: str,
    parameters: dict[str, Any],
) -> Any:
    return client.post(
        f"/api/v1/projects/{project_id}/jobs",
        json={
            "job_type": DEMO_JOB_TYPE,
            "parameters": parameters,
            "inputs": [{"role": "structure", "entry_id": entry_id}],
        },
    )


def _worker(client: ApiClient, worker_id: str = "integration-worker") -> JobWorker:
    return JobWorker(
        client.app.state.settings,
        client.app.state.session_factory,
        client.app.state.job_registry,
        worker_id,
    )


def test_job_completes_persists_provenance_and_imports_with_undo(
    client: ApiClient,
) -> None:
    project, entry = _project_with_structure(client)
    definitions = client.get("/api/v1/jobs/definitions")
    assert definitions.status_code == 200
    assert definitions.json()[0]["job_type"] == DEMO_JOB_TYPE

    submitted = _submit(
        client,
        project["id"],
        entry["id"],
        {"step_count": 2, "delay_ms": 0, "translation": [1, 2, 3]},
    )
    assert submitted.status_code == 201
    queued = submitted.json()
    assert queued["status"] == "queued"
    assert queued["started_at"] is None
    assert queued["inputs"][0]["artifact_sha256"]
    assert queued["provenance"]["parameters"]["translation"] == [1.0, 2.0, 3.0]
    assert queued["provenance"]["implementation_version"] == "1.0.0"

    assert _worker(client).run_once() is True
    completed = client.get(f"/api/v1/jobs/{queued['id']}").json()
    assert completed["status"] == "completed"
    assert completed["progress"] == 100
    assert completed["started_at"] is not None
    assert completed["completed_at"] is not None
    assert completed["result_values"]["atom_count"] == 3
    assert {result["role"] for result in completed["results"]} == {
        "statistics",
        "structure",
    }
    events = client.get(f"/api/v1/jobs/{queued['id']}/events").json()
    assert [event["sequence"] for event in events] == list(
        range(1, len(events) + 1)
    )
    assert any(event["kind"] == "log" for event in events)
    assert any(event["kind"] == "progress" for event in events)

    statistics = next(
        result for result in completed["results"] if result["role"] == "statistics"
    )
    assert client.get(statistics["artifact"]["download_url"]).json()["atom_count"] == 3
    structure = next(
        result for result in completed["results"] if result["role"] == "structure"
    )
    imported = client.post(
        f"/api/v1/jobs/{queued['id']}/results/{structure['id']}/import",
        json={"expected_revision": project["revision"], "name": "Translated ethanol"},
    )
    assert imported.status_code == 200
    imported_payload = imported.json()
    result_entry = next(
        item
        for item in imported_payload["project"]["entries"]
        if item["id"] == imported_payload["imported_entry_id"]
    )
    assert result_entry["job_links"] == [queued["id"]]
    provenance = result_entry["user_metadata"]["provenance"]
    assert provenance["job_result_id"] == structure["id"]
    assert provenance["input_entry_ids"] == [entry["id"]]
    undone = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": imported_payload["project"]["revision"]},
    ).json()
    assert imported_payload["imported_entry_id"] not in {
        item["id"] for item in undone["entries"]
    }


def test_invalid_submission_failure_and_queued_cancellation(client: ApiClient) -> None:
    project, entry = _project_with_structure(client)
    invalid = _submit(
        client,
        project["id"],
        entry["id"],
        {"step_count": 0},
    )
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["code"] == "invalid_job_operation"

    failed = _submit(
        client,
        project["id"],
        entry["id"],
        {"step_count": 3, "delay_ms": 0, "fail_at_step": 2},
    ).json()
    _worker(client).run_once()
    failure = client.get(f"/api/v1/jobs/{failed['id']}").json()
    assert failure["status"] == "failed"
    assert failure["error"]["code"] == "plugin_execution_failed"
    assert "Demonstration failure at step 2" in failure["error"]["message"]

    queued = _submit(
        client,
        project["id"],
        entry["id"],
        {"step_count": 2, "delay_ms": 0},
    ).json()
    cancelled = client.post(f"/api/v1/jobs/{queued['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert _worker(client).run_once() is False


def test_running_job_cancels_cooperatively(client: ApiClient) -> None:
    project, entry = _project_with_structure(client)
    job = _submit(
        client,
        project["id"],
        entry["id"],
        {"step_count": 100, "delay_ms": 40},
    ).json()
    worker = _worker(client, "cancellation-worker")
    thread = threading.Thread(target=worker.run_once)
    thread.start()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if client.get(f"/api/v1/jobs/{job['id']}").json()["status"] == "running":
            break
        time.sleep(0.02)
    response = client.post(f"/api/v1/jobs/{job['id']}/cancel")
    assert response.status_code == 200
    assert response.json()["cancellation_requested"] is True
    thread.join(timeout=10)
    assert not thread.is_alive()
    cancelled = client.get(f"/api/v1/jobs/{job['id']}").json()
    assert cancelled["status"] == "cancelled"
    assert cancelled["progress"] < 100
