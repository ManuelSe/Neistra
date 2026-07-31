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
