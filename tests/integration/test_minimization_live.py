"""Synthetic transport frames are not physics evidence; native callback has its own test."""

from __future__ import annotations

import numpy as np
from molweave_api.job_service import JobService
from molweave_core.minimization.contracts import MinimizationParameters
from molweave_core.minimization.live import SNAPSHOT_NAME, SnapshotPublisher

from tests.integration.test_coordinate_commands import _structure
from tests.integration.test_job_lifecycle import _worker
from tests.integration.test_minimization_jobs import minclient as minclient
from tests.integration.test_minimization_jobs import submit_molecule
from tests.support.minimization import LocalContext


def test_read_only_live_endpoint_is_no_store_owned_transient_and_revision_guarded(minclient):
    project, entry, job = submit_molecule(minclient)
    path = f"/api/v1/projects/{project['id']}/minimizations/{job['id']}/live"
    before = _structure(minclient, project["id"], entry["id"])
    assert minclient.get(path).json()["frame"] is None
    with minclient.app.state.session_factory() as session:
        JobService(
            session, minclient.app.state.settings, minclient.app.state.job_registry
        ).claim_next("transport-test")
    directory = minclient.app.state.settings.data_dir / "work/jobs" / job["id"]
    directory.mkdir(parents=True)
    parameters = MinimizationParameters.model_validate(job["parameters"])
    writer = SnapshotPublisher(parameters, LocalContext(directory))
    writer.publish(1, ((entry["id"], 3),), np.asarray([[1.0, 2.0, 3.0]]))
    events = minclient.get(f"/api/v1/jobs/{job['id']}/events").json()
    response = minclient.get(path)
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    value = response.json()
    assert value["frame"]["entries"][0]["atom_ids"] == [3]
    assert "producer" not in value["frame"] and "coordinator" not in value["frame"]
    assert value["sources"] == [
        {"entry_id": entry["id"], "artifact_id": entry["current_artifact_id"], "conformer_id": 1}
    ]
    assert minclient.get(f"/api/v1/jobs/{job['id']}/events").json() == events
    assert _structure(minclient, project["id"], entry["id"]) == before
    assert minclient.get(path.removesuffix("/live") + "/proposal").status_code == 409
    other = minclient.post("/api/v1/projects", json={"name": "Other"}).json()
    assert minclient.get(path.replace(project["id"], other["id"])).status_code == 404
    changed = minclient.patch(
        f"/api/v1/projects/{project['id']}",
        json={"expected_revision": project["revision"], "name": "Changed"},
    )
    assert changed.status_code == 200
    assert minclient.get(path).json()["frame"] is None
    assert "Project changed" in minclient.get(path).json()["unavailable_reason"]
    assert (directory / SNAPSHOT_NAME).exists()  # Reads do not mutate calculation workspace.


def test_cancellation_suppresses_even_a_still_live_publisher(minclient):
    project, entry, job = submit_molecule(minclient)
    with minclient.app.state.session_factory() as session:
        JobService(
            session, minclient.app.state.settings, minclient.app.state.job_registry
        ).claim_next("transport-test")
    directory = minclient.app.state.settings.data_dir / "work/jobs" / job["id"]
    directory.mkdir(parents=True)
    writer = SnapshotPublisher(
        MinimizationParameters.model_validate(job["parameters"]), LocalContext(directory)
    )
    writer.publish(1, ((entry["id"], 3),), np.asarray([[1.0, 2.0, 3.0]]))
    assert minclient.post(f"/api/v1/jobs/{job['id']}/cancel").status_code == 200
    data = minclient.get(f"/api/v1/projects/{project['id']}/minimizations/{job['id']}/live").json()
    assert data["frame"] is None and "Cancellation requested" in data["unavailable_reason"]


def test_restart_recovery_never_serves_a_previous_workspace_frame(minclient):
    project, entry, job = submit_molecule(minclient)
    with minclient.app.state.session_factory() as session:
        JobService(
            session, minclient.app.state.settings, minclient.app.state.job_registry
        ).claim_next("lost-test")
    directory = minclient.app.state.settings.data_dir / "work/jobs" / job["id"]
    directory.mkdir(parents=True)
    SnapshotPublisher(
        MinimizationParameters.model_validate(job["parameters"]), LocalContext(directory)
    ).publish(1, ((entry["id"], 3),), np.asarray([[1.0, 2.0, 3.0]]))
    assert _worker(minclient).recover_abandoned() == 1
    data = minclient.get(f"/api/v1/projects/{project['id']}/minimizations/{job['id']}/live").json()
    assert data["status"] == "failed" and data["frame"] is None
    assert (directory / SNAPSHOT_NAME).exists()
