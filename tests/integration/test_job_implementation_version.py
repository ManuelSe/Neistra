"""Queued work must not silently execute a different installed implementation."""

from dataclasses import replace

from tests.integration.test_job_lifecycle import (
    DEMO_JOB_TYPE,
    _project_with_structure,
    _submit,
    _worker,
)
from tests.support.api_client import ApiClient


def _replace_definition(client: ApiClient, version: str) -> None:
    registry = client.app.state.job_registry
    registered = registry.get(DEMO_JOB_TYPE)
    registry._jobs[DEMO_JOB_TYPE] = replace(
        registered,
        definition=replace(registered.definition, implementation_version=version),
    )


def test_queued_version_mismatch_refuses_before_loading_inputs(client: ApiClient, monkeypatch):
    project, entry = _project_with_structure(client)
    queued = _submit(client, project["id"], entry["id"], {"delay_ms": 0}).json()
    _replace_definition(client, "1.0.1")
    worker = _worker(client)

    def unexpected_load(*args):
        raise AssertionError("Version mismatch must refuse before loading inputs")

    monkeypatch.setattr(worker, "_load_inputs", unexpected_load)
    assert worker.run_once()
    job = client.get(f"/api/v1/jobs/{queued['id']}").json()
    assert job["status"] == "failed"
    assert job["error"]["code"] == "implementation_version_unavailable"
    assert job["results"] == []
    assert job["implementation_version"] == "1.0.0"
    assert job["provenance"] == queued["provenance"]


def test_child_rechecks_freshly_loaded_definition(client: ApiClient):
    project, entry = _project_with_structure(client)
    # Simulate an API/coordinator whose loaded definition differs from the child
    # process's fresh import. Parent-only checks cannot detect this deployment gap.
    _replace_definition(client, "1.0.1")
    queued = _submit(client, project["id"], entry["id"], {"delay_ms": 0}).json()
    assert queued["implementation_version"] == "1.0.1"
    assert _worker(client).run_once()
    job = client.get(f"/api/v1/jobs/{queued['id']}").json()
    assert job["status"] == "failed"
    assert job["error"]["code"] == "implementation_version_unavailable"
    assert job["results"] == []
    assert job["provenance"] == queued["provenance"]
