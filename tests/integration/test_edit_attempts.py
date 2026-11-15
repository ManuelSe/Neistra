"""Apply receipts distinguish proven commits from unresolved transport outcomes."""

from __future__ import annotations

import asyncio
import json
import shutil
import threading
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import pytest
from neistra_api import edit_execution as execution
from neistra_api import project_service
from neistra_api.edit_attempts import EditAttempt, EditAttemptRegistry
from neistra_api.edit_computation import PreparedPublication
from neistra_api.edit_execution import EditExecutionController, EditExecutionError
from neistra_api.selection_edit_service import SelectionEditService

from tests.integration.test_edit_execution import OwnedRequest, canonical_files, payload_for
from tests.integration.test_model_edits import edit
from tests.integration.test_selection_edits import project_with_ligand
from tests.support.api_client import ApiClient


def paths(project_id: str, entry_id: str, token: str) -> tuple[str, str]:
    root = f"/api/v1/projects/{project_id}"
    return f"{root}/entries/{entry_id}/model-edits", f"{root}/edit-attempts/{token}"


def lookup(client: ApiClient, project_id: str, token: str) -> dict[str, Any]:
    response = client.get(f"/api/v1/projects/{project_id}/edit-attempts/{token}")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()  # type: ignore[no-any-return]


@pytest.mark.parametrize("kind", ["model", "selection"])
def test_tagged_apply_receipt_and_duplicate_conflict(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    project, entry_id = project_with_ligand(client)
    token = str(uuid4())
    path, _ = paths(project["id"], entry_id, token)
    path = path.replace("model-edits", f"{kind}-edits")
    payload = payload_for(project, entry_id).model_dump(mode="json")
    if kind == "selection":
        payload.pop("hydrogen_policy")
    header = {"X-Neistra-Edit-Attempt": token}
    response = client.post(path, json=payload, headers=header)
    assert response.status_code == 200, response.text
    after = response.json()["project"]
    committed_baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    receipt = lookup(client, project["id"], token)
    assert receipt == {
        "server_instance_id": client.app.state.edit_execution.attempts.server_instance_id,
        "attempt_id": token,
        "project_id": project["id"],
        "entry_id": entry_id,
        "kind": kind,
        "expected_revision": project["revision"],
        "expected_artifact_id": project["entries"][0]["current_artifact_id"],
        "phase": "finished",
        "outcome": "saved",
        "committed_revision": after["revision"],
        "committed_artifact_id": after["entries"][0]["current_artifact_id"],
        "reason": None,
    }
    controller: EditExecutionController = client.app.state.edit_execution
    files = canonical_files(controller)

    def forbidden(*args: Any) -> Any:
        pytest.fail("Duplicate must never dispatch computation")

    monkeypatch.setattr(controller, "_capture", forbidden)
    for changed, code in [(False, "already_submitted"), (True, "token_conflict")]:
        if changed:
            payload["action"] = {"operation": "atom.element", "element": "O"}
        duplicate = client.post(path, json=payload, headers=header)
        assert duplicate.status_code == 409, duplicate.text
        assert duplicate.json()["detail"]["code"] == f"edit_attempt_{code}"
        assert lookup(client, project["id"], token) == receipt
    assert canonical_files(controller) == files
    assert client.get(f"/api/v1/projects/{project['id']}").json() == committed_baseline


def test_pending_lookup_does_not_treat_old_revision_as_outcome(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    path, outcome_path = paths(project["id"], entry_id, token)
    payload = payload_for(project, entry_id).model_dump(mode="json")
    original = controller._run_child
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()

    async def run() -> None:
        ready, release = asyncio.Event(), asyncio.Event()

        async def held(*args: Any) -> Any:
            ready.set()
            await release.wait()
            return await original(*args)

        monkeypatch.setattr(controller, "_run_child", held)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=client.app), base_url="http://test"
        ) as api:
            task = asyncio.create_task(api.post(
                path, json=payload, headers={"X-Neistra-Edit-Attempt": token}
            ))
            await asyncio.wait_for(ready.wait(), 5)
            pending = (await api.get(outcome_path)).json()
            assert pending["phase"] == "pending" and pending["outcome"] is None
            assert pending["expected_revision"] == project["revision"]
            assert (await api.get(f"/api/v1/projects/{project['id']}")).json() == baseline
            duplicate = await api.post(
                path, json=payload, headers={"X-Neistra-Edit-Attempt": token}
            )
            assert duplicate.status_code == 409
            assert (await api.get(outcome_path)).json() == pending
            release.set()
            assert (await task).status_code == 200
            assert (await api.get(outcome_path)).json()["outcome"] == "saved"

    asyncio.run(run())


@pytest.mark.parametrize("failure", ["project_read", "encoding", "cleanup", "observer"])
def test_commit_proof_survives_downstream_failures(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    payload = payload_for(project, entry_id)
    original_read = project_service.project_read
    original_cleanup = shutil.rmtree

    def broken(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError(f"Injected {failure} failure")

    if failure == "project_read":
        monkeypatch.setattr(project_service, "project_read", broken)
    elif failure == "encoding":
        monkeypatch.setattr(PreparedPublication, "response", broken)
    elif failure == "cleanup":
        def cleanup(directory: Path) -> None:
            broken()
        monkeypatch.setattr(execution.shutil, "rmtree", cleanup)
    else:
        monkeypatch.setattr(EditAttempt, "saved", broken)

    async def run() -> None:
        if failure == "observer":
            result = await controller.execute("model", project["id"], entry_id, payload,
                                              OwnedRequest(), token)  # type: ignore[arg-type]
            assert json.loads(result)["project"]["revision"] == project["revision"] + 1
        else:
            with pytest.raises((RuntimeError, EditExecutionError)):
                await controller.execute("model", project["id"], entry_id, payload,
                                         OwnedRequest(), token)  # type: ignore[arg-type]

    asyncio.run(run())
    monkeypatch.setattr(project_service, "project_read", original_read)
    receipt = lookup(client, project["id"], token)
    assert receipt["phase"] == "finished"
    assert receipt["outcome"] == ("unknown" if failure == "observer" else "saved")
    after = client.get(f"/api/v1/projects/{project['id']}").json()
    assert after["revision"] == project["revision"] + 1
    assert after["entries"][0]["current_artifact_id"] != payload.expected_artifact_id
    if failure != "observer":
        assert receipt["committed_revision"] == after["revision"]
        assert receipt["committed_artifact_id"] == after["entries"][0]["current_artifact_id"]
    if failure == "cleanup":
        # A real removal refusal can leave private work files, but must never
        # erase the commit receipt. Restore storage and remove our test residue.
        assert list(controller.work_root.iterdir())
        for directory in controller.work_root.iterdir():
            original_cleanup(directory)
    assert not controller.active and not list(controller.work_root.iterdir())


def test_publication_exception_without_commit_proof_is_unknown(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)

    def broken(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("Ambiguous publisher failure")

    monkeypatch.setattr(SelectionEditService, "_publish_prepared_project", broken)
    async def run() -> None:
        with pytest.raises(RuntimeError, match="Ambiguous"):
            await controller.execute("model", project["id"], entry_id,
                                     payload_for(project, entry_id), OwnedRequest(),
                                     token)  # type: ignore[arg-type]
    asyncio.run(run())
    assert lookup(client, project["id"], token)["outcome"] == "unknown"
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert canonical_files(controller) == files


@pytest.mark.parametrize("when", ["capture", "compute", "load", "after_commit"])
def test_cancelled_attempt_settles_after_owned_work_and_keeps_commit_truth(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, when: str
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    payload = payload_for(project, entry_id)
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)

    async def run() -> None:
        ready, release = threading.Event(), threading.Event()
        compute_ready, compute_release = asyncio.Event(), asyncio.Event()
        if when == "compute":
            original = controller._run_child
            async def held_compute(*args: Any) -> Any:
                compute_ready.set()
                await compute_release.wait()
                return await original(*args)
            monkeypatch.setattr(controller, "_run_child", held_compute)
        else:
            target: Any = controller if when != "after_commit" else PreparedPublication
            method = {"capture": "_capture", "load": "_load", "after_commit": "response"}[when]
            original_method = getattr(target, method)
            def held(*args: Any, **kwargs: Any) -> Any:
                result = original_method(*args, **kwargs)
                ready.set()
                assert release.wait(10)
                return result
            monkeypatch.setattr(target, method, held)
        task = asyncio.create_task(controller.execute(
            "model", project["id"], entry_id, payload, OwnedRequest(),
            token,  # type: ignore[arg-type]
        ))
        if when == "compute":
            await asyncio.wait_for(compute_ready.wait(), 5)
        else:
            assert await asyncio.to_thread(ready.wait, 10)
        task.cancel()
        await asyncio.sleep(0.05)
        receipt = controller.attempts.lookup(project["id"], token)
        if when == "after_commit":
            assert receipt.phase == "finishing" and receipt.outcome == "saved"
            assert receipt.committed_revision == project["revision"] + 1
        elif when != "compute":
            assert not task.done() and receipt.phase == "pending" and receipt.outcome is None
        release.set()
        compute_release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        settled = controller.attempts.lookup(project["id"], token)
        assert settled.phase == "finished"
        assert settled.outcome == ("saved" if when == "after_commit" else "not_applied")
        assert not controller.active and not list(controller.work_root.iterdir())

    asyncio.run(run())
    current = client.get(f"/api/v1/projects/{project['id']}").json()
    if when == "after_commit":
        assert current["revision"] == baseline["revision"] + 1
    else:
        assert current == baseline and canonical_files(controller) == files


@pytest.mark.parametrize("failure", ["busy", "stale", "staging", "no_change"])
def test_known_nonpublication_is_not_applied(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    payload = payload_for(project, entry_id).model_dump(mode="json")
    token = str(uuid4())
    path, _ = paths(project["id"], entry_id, token)
    if failure == "no_change":
        action = {"operation": "hydrogens.complete", "scope": "entry"}
        response = edit(client, project, entry_id, [1], action)
        assert response.status_code == 200, response.text
        project = response.json()["project"]
        payload = payload_for(project, entry_id).model_dump(mode="json")
        payload["action"] = action
    elif failure == "stale":
        payload["expected_revision"] -= 1
    elif failure == "staging":
        def broken(*args: Any) -> Any:
            raise OSError("Injected staging refusal")
        monkeypatch.setattr(controller, "_capture", broken)
    elif failure == "busy":
        controller.active = True
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)
    response = client.post(path, json=payload, headers={"X-Neistra-Edit-Attempt": token})
    assert response.status_code == {"busy": 429, "stale": 409, "staging": 503,
                                    "no_change": 200}[failure], response.text
    receipt = lookup(client, project["id"], token)
    assert receipt["phase"] == "finished" and receipt["outcome"] == "not_applied"
    assert receipt["committed_revision"] is None and receipt["committed_artifact_id"] is None
    if failure == "no_change":
        assert receipt["reason"] == "no_change" and response.json()["applied"] is False
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert canonical_files(controller) == files
    assert controller.active is (failure == "busy")
    controller.active = False


def test_fingerprint_reservation_is_bounded_and_duplicate_cannot_reset_owner(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token, other_token = str(uuid4()), str(uuid4())
    payload = payload_for(project, entry_id)
    original = execution.request_digest
    ready, release = threading.Event(), threading.Event()

    def held(*args: Any) -> str:
        ready.set()
        assert release.wait(10)
        return original(*args)

    monkeypatch.setattr(execution, "request_digest", held)
    async def run() -> None:
        task = asyncio.create_task(controller.execute(
            "model", project["id"], entry_id, payload, OwnedRequest(), token
        ))  # type: ignore[arg-type]
        assert await asyncio.to_thread(ready.wait, 5)
        record = controller.attempts.records[token]
        assert record.digest is None and record.phase == "pending"
        for current_token, expected in [(token, "edit_attempt_already_submitted"),
                                        (other_token, "edit_attempts_unavailable")]:
            with pytest.raises(EditExecutionError) as error:
                await controller.execute("model", project["id"], entry_id, payload,
                                         OwnedRequest(), current_token)  # type: ignore[arg-type]
            assert error.value.code == expected
        assert controller.attempts.records[token] is record and record.phase == "pending"
        assert controller.attempts.records[other_token].outcome == "not_applied"
        task.cancel()
        await asyncio.sleep(0.05)
        assert not task.done() and record.phase == "pending"
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert record.phase == "finished" and record.outcome == "not_applied"
        assert not controller.attempt_fingerprinting and not controller.active
        assert not controller.work_root.exists()
    asyncio.run(run())


def test_registry_exhaustion_expiry_lru_restart_and_context_isolation(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    payload = payload_for(project, entry_id)
    now = [0.0]
    registry = EditAttemptRegistry(capacity=2, finished_ttl_seconds=10, clock=lambda: now[0])
    controller: EditExecutionController = client.app.state.edit_execution
    controller.attempts = registry
    token_a, token_b, token_c = (str(uuid4()) for _ in range(3))
    first, created = registry.reserve(token_a, project["id"], entry_id, "model", payload)
    assert created
    first.phase = "finishing"
    first.saved(project["revision"] + 1, "committed-artifact")
    second, _ = registry.reserve(token_b, project["id"], entry_id, "model", payload)
    now[0] = 100
    assert lookup(client, project["id"], token_a)["outcome"] == "saved"
    assert lookup(client, project["id"], token_b)["phase"] == "pending"
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    path, _ = paths(project["id"], entry_id, token_c)
    response = client.post(path, json=payload.model_dump(mode="json"),
                           headers={"X-Neistra-Edit-Attempt": token_c})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "edit_attempts_unavailable"
    assert token_c not in registry.records
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    registry.finish(second)
    third, _ = registry.reserve(token_c, project["id"], entry_id, "model", payload)
    assert registry.lookup(project["id"], token_b).outcome == "unknown"
    assert registry.lookup("different-project", token_a).entry_id is None
    assert registry.lookup("different-project", token_a).outcome == "unknown"
    registry.finish(first)
    registry.finish(third)
    now[0] = 111
    assert registry.lookup(project["id"], token_a).outcome == "unknown"
    assert not registry.records
    restarted = EditAttemptRegistry()
    assert restarted.server_instance_id != registry.server_instance_id
    assert restarted.lookup(project["id"], token_a).phase == "unknown"
    assert restarted.lookup(project["id"], str(uuid4())).outcome == "unknown"


def test_finished_lru_eviction_retains_recently_queried_receipt(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    payload = payload_for(project, entry_id)
    registry = EditAttemptRegistry(capacity=2)
    tokens = [str(uuid4()) for _ in range(3)]
    for token in tokens[:2]:
        record, _ = registry.reserve(token, project["id"], entry_id, "model", payload)
        registry.finish(record)
    registry.lookup(project["id"], tokens[0])
    registry.reserve(tokens[2], project["id"], entry_id, "model", payload)
    assert registry.lookup(project["id"], tokens[1]).outcome == "unknown"
    assert registry.lookup(project["id"], tokens[0]).outcome == "not_applied"


def test_preview_is_untracked_and_invalid_header_cannot_dispatch(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    path, _ = paths(project["id"], entry_id, token)
    preview = payload_for(project, entry_id, preview=True).model_dump(mode="json")
    response = client.post(path + "/preview", json=preview,
                           headers={"X-Neistra-Edit-Attempt": token})
    assert response.status_code == 200, response.text
    assert not controller.attempts.records
    response = client.post(path, json=payload_for(project, entry_id).model_dump(mode="json"),
                           headers={"X-Neistra-Edit-Attempt": "invalid"})
    assert response.status_code == 422
    assert not controller.attempts.records


def test_disconnect_before_publication_finishes_not_applied(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    request = OwnedRequest()
    original = controller._run_child
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)

    async def compute_then_disconnect(*args: Any) -> Any:
        output = await original(*args)
        request.disconnected = True
        return output

    monkeypatch.setattr(controller, "_run_child", compute_then_disconnect)
    async def run() -> None:
        with pytest.raises(EditExecutionError) as error:
            await controller.execute("model", project["id"], entry_id,
                                     payload_for(project, entry_id), request,
                                     token)  # type: ignore[arg-type]
        assert error.value.code == "edit_cancelled"
    asyncio.run(run())
    assert lookup(client, project["id"], token)["outcome"] == "not_applied"
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert canonical_files(controller) == files
    assert not controller.active and not list(controller.work_root.iterdir())


def test_fresh_publication_refusal_is_proven_not_applied(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    payload = payload_for(project, entry_id)
    original = controller._run_child
    files = canonical_files(controller)

    async def compute_then_rename(*args: Any) -> Any:
        output = await original(*args)
        with controller.factory() as session:
            project_service.ProjectService(session).update_project(
                project["id"], project["revision"], "New name", None
            )
        return output

    monkeypatch.setattr(controller, "_run_child", compute_then_rename)
    async def run() -> None:
        with pytest.raises(project_service.RevisionConflictError):
            await controller.execute("model", project["id"], entry_id, payload, OwnedRequest(),
                                     token)  # type: ignore[arg-type]
    asyncio.run(run())
    assert lookup(client, project["id"], token)["outcome"] == "not_applied"
    current = client.get(f"/api/v1/projects/{project['id']}").json()
    assert current["revision"] == project["revision"] + 1
    assert current["entries"][0]["current_artifact_id"] == payload.expected_artifact_id
    assert current["history"]["retained_commands"] == (
        project["history"]["retained_commands"] + 1
    )
    assert canonical_files(controller) == files


def test_commit_observers_read_only_loaded_fields_without_queries(client: ApiClient) -> None:
    from neistra_api.models import Project, StructureEntry

    project_data, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    payload = payload_for(project_data, entry_id)
    for missing_state in (False, True):
        record, _ = controller.attempts.reserve(
            str(uuid4()), project_data["id"], entry_id, "model", payload
        )
        record.publication_started = True
        project = Project(id=project_data["id"], revision=payload.expected_revision + 1)
        entry = StructureEntry(id=entry_id, current_artifact_id="committed-id")
        if missing_state:
            project.__dict__.pop("revision")
        with controller.factory() as session:
            controller._observe_commit(session, record, project, entry)
            # No project/entry was attached. A descriptor read or database query
            # cannot recover missing state; the callback must retain uncertainty.
            session.dispatch.before_commit(session)
            session.dispatch.after_commit(session)
            assert not session.in_transaction() and not session.identity_map
        controller.attempts.finish(record)
        assert record.outcome == ("unknown" if missing_state else "saved")
        assert record.observer_failed is missing_state


def test_receipt_remains_finishing_saved_until_cleanup_settles(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    original_cleanup = shutil.rmtree
    ready, release = threading.Event(), threading.Event()

    def held_cleanup(directory: Path) -> None:
        ready.set()
        assert release.wait(10)
        original_cleanup(directory)

    monkeypatch.setattr(execution.shutil, "rmtree", held_cleanup)
    async def run() -> None:
        task = asyncio.create_task(controller.execute(
            "model", project["id"], entry_id, payload_for(project, entry_id), OwnedRequest(),
            token,  # type: ignore[arg-type]
        ))
        assert await asyncio.to_thread(ready.wait, 10)
        assert controller.active
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=client.app), base_url="http://test"
        ) as api:
            outcome_path = paths(project["id"], entry_id, token)[1]
            receipt = (await api.get(outcome_path)).json()
            assert receipt["phase"] == "finishing" and receipt["outcome"] == "saved"
            assert receipt["committed_revision"] == project["revision"] + 1
            assert (await api.get("/api/v1/health")).status_code == 200
            task.cancel()
            await asyncio.sleep(0.05)
            assert not task.done()
            assert (await api.get(outcome_path)).json() == receipt
            release.set()
            await task
            settled = (await api.get(outcome_path)).json()
            assert settled["phase"] == "finished" and settled["outcome"] == "saved"
            assert not controller.active and not list(controller.work_root.iterdir())
    asyncio.run(run())


def test_lookup_unknown_does_not_expose_other_project_context(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    controller.attempts.reserve(token, project["id"], entry_id, "model",
                                payload_for(project, entry_id))
    for requested_project, requested_token in [
        ("another-project", token), (project["id"], str(uuid4())),
    ]:
        receipt = lookup(client, requested_project, requested_token)
        assert receipt["phase"] == "unknown" and receipt["outcome"] == "unknown"
        assert receipt["attempt_id"] == requested_token
        assert receipt["project_id"] == requested_project
        assert receipt["server_instance_id"] == controller.attempts.server_instance_id
        for field in ("entry_id", "kind", "expected_revision", "expected_artifact_id",
                      "committed_revision", "committed_artifact_id", "reason"):
            assert receipt[field] is None


def test_tracking_identity_bound_refuses_before_dispatch(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    path, _ = paths(project["id"], entry_id, token)
    payload = payload_for(project, entry_id).model_dump(mode="json")
    payload["expected_artifact_id"] = "x" * 257
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)
    response = client.post(path, json=payload, headers={"X-Neistra-Edit-Attempt": token})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "edit_attempt_invalid"
    assert not controller.attempts.records and not controller.work_root.exists()
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert canonical_files(controller) == files


def test_cancelled_duplicate_digest_cannot_settle_or_reset_original_attempt(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    token = str(uuid4())
    payload = payload_for(project, entry_id)
    original_digest = execution.request_digest
    original_compute = controller._run_child
    digest_ready, digest_release = threading.Event(), threading.Event()
    calls = 0

    def held_duplicate_digest(*args: Any) -> str:
        nonlocal calls
        calls += 1
        if calls == 2:
            digest_ready.set()
            assert digest_release.wait(10)
        return original_digest(*args)

    monkeypatch.setattr(execution, "request_digest", held_duplicate_digest)
    async def run() -> None:
        compute_ready, compute_release = asyncio.Event(), asyncio.Event()
        async def held_compute(*args: Any) -> Any:
            compute_ready.set()
            await compute_release.wait()
            return await original_compute(*args)
        monkeypatch.setattr(controller, "_run_child", held_compute)
        task = asyncio.create_task(controller.execute(
            "model", project["id"], entry_id, payload, OwnedRequest(), token
        ))  # type: ignore[arg-type]
        await asyncio.wait_for(compute_ready.wait(), 5)
        original_record = controller.attempts.records[token]
        duplicate = asyncio.create_task(controller.execute(
            "model", project["id"], entry_id, payload, OwnedRequest(), token
        ))  # type: ignore[arg-type]
        assert await asyncio.to_thread(digest_ready.wait, 5)
        duplicate.cancel()
        await asyncio.sleep(0.05)
        assert not duplicate.done() and original_record.phase == "pending"
        compute_release.set()
        assert json.loads(await task)["project"]["revision"] == project["revision"] + 1
        saved = controller.attempts.lookup(project["id"], token)
        assert saved.phase == "finished" and saved.outcome == "saved"
        digest_release.set()
        with pytest.raises(asyncio.CancelledError):
            await duplicate
        assert controller.attempts.records[token] is original_record
        assert controller.attempts.lookup(project["id"], token) == saved
        assert not controller.active and not controller.attempt_fingerprinting
        assert not list(controller.work_root.iterdir())
    asyncio.run(run())
