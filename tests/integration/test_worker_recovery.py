from __future__ import annotations

from molweave_api.job_service import JobService
from molweave_api.job_worker import JobWorker

from tests.integration.test_job_lifecycle import _project_with_structure, _submit
from tests.support.api_client import ApiClient


def test_worker_restart_marks_abandoned_running_job_failed(client: ApiClient) -> None:
    project, entry = _project_with_structure(client)
    queued = _submit(
        client,
        project["id"],
        entry["id"],
        {"step_count": 2, "delay_ms": 0},
    ).json()
    with client.app.state.session_factory() as session:
        claimed = JobService(
            session,
            client.app.state.settings,
            client.app.state.job_registry,
        ).claim_next("lost-worker")
        assert claimed is not None
        assert claimed.status == "running"

    restarted = JobWorker(
        client.app.state.settings,
        client.app.state.session_factory,
        client.app.state.job_registry,
        "replacement-worker",
    )
    assert restarted.recover_abandoned() == 1
    recovered = client.get(f"/api/v1/jobs/{queued['id']}").json()
    assert recovered["status"] == "failed"
    assert recovered["error"] == {
        "code": "worker_lost",
        "message": "Worker stopped before the job completed",
    }
    assert recovered["completed_at"] is not None
    assert restarted.run_once() is False


def test_archive_import_converts_nonterminal_job_to_explicit_failure(
    client: ApiClient,
) -> None:
    project, entry = _project_with_structure(client)
    source = _submit(
        client,
        project["id"],
        entry["id"],
        {"step_count": 2, "delay_ms": 0},
    ).json()
    archive = client.post(
        f"/api/v1/projects/{project['id']}/archive",
        json={"operation_id": "queued-job-export"},
    ).json()
    archive_bytes = client.get(archive["artifact"]["download_url"]).content
    restored = client.post(
        "/api/v1/projects/import-archive",
        data={"operation_id": "queued-job-import"},
        files={
            "file": (
                "queued-job.molweave.zip",
                archive_bytes,
                "application/vnd.molweave.project+zip",
            )
        },
    ).json()["project"]
    restored_job = client.get(f"/api/v1/projects/{restored['id']}/jobs").json()[0]
    assert restored_job["id"] != source["id"]
    assert restored_job["status"] == "failed"
    assert restored_job["error"]["code"] == "archive_incomplete_job"
