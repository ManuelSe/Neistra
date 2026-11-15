from __future__ import annotations

import asyncio
import json
import os
import threading
from dataclasses import replace
from pathlib import Path
from typing import Any, cast

import httpx
import pytest
from fastapi import Request
from neistra_api import edit_execution as execution
from neistra_api.edit_computation import PreparedPublication
from neistra_api.edit_execution import EditExecutionController, EditExecutionError
from neistra_api.edit_execution_data import EditOutput, FileDescriptor
from neistra_api.models import Artifact, StructureEntry
from neistra_api.schemas import ModelEditCreate

from tests.integration.test_model_edits import edit
from tests.integration.test_selection_edits import project_with_ligand, selection
from tests.support.api_client import ApiClient
from tests.support.edit_execution_workers import (
    acknowledged_exit_child,
    exiting_child,
    invalid_descriptor_child,
    partial_child,
    unicode_error_child,
    waiting_child,
)


class OwnedRequest:
    def __init__(self) -> None:
        self.disconnected = False

    async def is_disconnected(self) -> bool:
        return self.disconnected


def payload_for(
    project: dict[str, Any], entry_id: str, *, preview: bool = False
) -> ModelEditCreate:
    return ModelEditCreate.model_validate(
        {
            "expected_revision": project["revision"],
            "expected_artifact_id": project["entries"][0]["current_artifact_id"],
            "selection": selection(entry_id, [1, 2] if preview else [1]),
            "action": {"operation": "bond.set", "order": 2}
            if preview
            else {
                "operation": "atom.element",
                "element": "N",
            },
        }
    )


def canonical_files(controller: EditExecutionController) -> set[str]:
    root = controller.settings.data_dir / "artifacts"
    return {str(path.relative_to(root)) for path in root.rglob("*") if path.is_file()}


def test_compute_wait_releases_capture_session_and_keeps_api_serviceable(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    factory = controller.factory
    sessions = []

    def tracked_factory() -> Any:
        session = factory()
        sessions.append(session)
        return session

    monkeypatch.setattr(controller, "factory", tracked_factory)
    original = controller._run_child

    async def run() -> None:
        ready, release = asyncio.Event(), asyncio.Event()

        async def held_compute(*args: Any) -> EditOutput:
            assert sessions and not sessions[0].in_transaction()
            assert len(sessions[0].identity_map) == 0
            manifest = json.loads((Path(args[0]) / "request.json").read_text())
            assert "database_url" not in json.dumps(manifest)
            assert isinstance(manifest["normalized"]["relative_path"], str)
            ready.set()
            await release.wait()
            return await original(*args)

        monkeypatch.setattr(controller, "_run_child", held_compute)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=client.app), base_url="http://test"
        ) as api:
            task = asyncio.create_task(
                api.post(
                    f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits",
                    json=payload_for(project, entry_id).model_dump(mode="json"),
                )
            )
            await asyncio.wait_for(ready.wait(), 5)
            assert (await api.get("/api/v1/health")).status_code == 200
            assert (await api.get(f"/api/v1/projects/{project['id']}")).json()[
                "revision"
            ] == project["revision"]
            assert (
                await api.post("/api/v1/projects", json={"name": "Independent work"})
            ).status_code == 201
            release.set()
            response = await task
            assert response.status_code == 200, response.text
            assert response.json()["project"]["revision"] == project["revision"] + 1

    asyncio.run(run())
    assert not controller.active and not list(controller.work_root.iterdir())


@pytest.mark.parametrize(
    "change",
    [
        "rename",
        "lock",
        "delete",
        "undo",
        "floor_direct",
        "lock_direct",
        "artifact_direct",
    ],
)
def test_fresh_publication_rejects_changes_after_computation_without_artifacts(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    original = controller._run_child

    async def run() -> None:
        ready, release = asyncio.Event(), asyncio.Event()

        async def held_result(*args: Any) -> EditOutput:
            result = await original(*args)
            ready.set()
            await release.wait()
            return result

        monkeypatch.setattr(controller, "_run_child", held_result)
        path = f"/api/v1/projects/{project['id']}"
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=client.app), base_url="http://test"
        ) as api:
            task = asyncio.create_task(
                api.post(
                    f"{path}/entries/{entry_id}/model-edits",
                    json=payload_for(project, entry_id).model_dump(mode="json"),
                )
            )
            await asyncio.wait_for(ready.wait(), 10)
            if change == "rename":
                changed = await api.patch(
                    f"{path}/entries/{entry_id}",
                    json={
                        "expected_revision": project["revision"],
                        "name": "Changed target",
                    },
                )
            elif change == "lock":
                changed = await api.post(
                    f"{path}/entries/{entry_id}/lock",
                    json={
                        "expected_revision": project["revision"],
                        "value": True,
                    },
                )
            elif change == "delete":
                changed = await api.delete(
                    f"{path}/entries/{entry_id}",
                    params={
                        "expected_revision": project["revision"],
                    },
                )
            elif change == "undo":
                changed = await api.post(
                    f"{path}/history/undo", json={"expected_revision": project["revision"]}
                )
            else:
                with controller.factory() as session:
                    entry = session.get(StructureEntry, entry_id)
                    assert entry is not None
                    if change == "floor_direct":
                        entry.next_atom_id += 100
                    elif change == "lock_direct":
                        entry.locked = True
                    else:
                        entry.current_artifact_id = entry.original_artifact_id
                    session.commit()
                changed = await api.get(path)
            assert changed.status_code == 200, changed.text
            baseline = (await api.get(path)).json()
            files = canonical_files(controller)
            release.set()
            response = await task
            assert response.status_code == (422 if change.endswith("_direct") else 409), (
                response.text
            )
            assert (await api.get(path)).json() == baseline
            assert canonical_files(controller) == files

    asyncio.run(run())
    assert not controller.active and not list(controller.work_root.iterdir())


@pytest.mark.parametrize("phase", ["capture", "load"])
def test_task_cancellation_drains_owned_thread_before_stage_and_admission_cleanup(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    phase: str,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)
    ready, release = threading.Event(), threading.Event()
    method = "_capture" if phase == "capture" else "_load"
    original = getattr(controller, method)

    def held_thread(*args: Any) -> Any:
        value = original(*args)
        ready.set()
        assert release.wait(10)
        return value

    monkeypatch.setattr(controller, method, held_thread)

    async def run() -> None:
        task = asyncio.create_task(
            controller.execute(
                "model",
                project["id"],
                entry_id,
                payload_for(project, entry_id),
                cast(Request, OwnedRequest()),
            )
        )
        try:
            assert await asyncio.to_thread(ready.wait, 10)
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=client.app), base_url="http://test"
            ) as api:
                assert (await api.get("/api/v1/health")).status_code == 200
                observed = (await api.get(f"/api/v1/projects/{project['id']}")).json()
                assert observed == baseline
            task.cancel()
            await asyncio.sleep(0.025)
            assert controller.active
            assert not task.done()
            assert list(controller.work_root.iterdir())
        finally:
            release.set()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run())
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert canonical_files(controller) == files
    assert not controller.active and not list(controller.work_root.iterdir())


@pytest.mark.parametrize(
    "failure", ["timeout", "partial", "memory", "exit", "descriptor", "unicode"]
)
def test_process_failures_have_typed_errors_no_publication_and_complete_cleanup(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    controller.settings = replace(
        controller.settings,
        edit_compute_timeout_seconds=0.3,
        edit_cleanup_grace_seconds=0.05,
        edit_worker_max_rss_bytes=1 if failure == "memory" else 4 * 1024**3,
    )
    child = (
        exiting_child
        if failure == "exit"
        else invalid_descriptor_child
        if failure == "descriptor"
        else unicode_error_child
        if failure == "unicode"
        else partial_child
        if failure == "partial"
        else waiting_child
    )
    monkeypatch.setattr(execution, "run_edit_child", child)
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)
    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits",
        json=payload_for(project, entry_id).model_dump(mode="json"),
    )
    expected = (
        413
        if failure == "memory"
        else 504
        if failure in {"timeout", "partial"}
        else 422
        if failure == "unicode"
        else 500
    )
    assert response.status_code == expected, response.text
    if failure == "unicode":
        assert response.json()["detail"]["code"] == "invalid_project_operation"
        assert "details truncated" in response.json()["detail"]["message"]
    else:
        assert response.json()["detail"]["code"].startswith("edit_")
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert canonical_files(controller) == files
    assert not controller.active and not list(controller.work_root.iterdir())


@pytest.mark.parametrize("corruption", ["hash", "size", "symlink", "wrong_file"])
def test_staged_result_validation_refuses_before_publication(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    corruption: str,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    original = controller._run_child
    external = tmp_path / "external.json"
    external.write_text("{}")

    async def corrupt_result(*args: Any) -> EditOutput:
        result = await original(*args)
        directory = Path(args[0])
        envelope = directory / result.envelope.filename
        if corruption == "hash":
            data = envelope.read_bytes()
            envelope.write_bytes(data.replace(b'"kind":"model"', b'"kind":"xxxxx"'))
        elif corruption == "size":
            envelope.write_bytes(envelope.read_bytes()[:-1])
        elif corruption == "symlink":
            envelope.unlink()
            envelope.symlink_to(external)
        else:
            result = result.model_copy(
                update={
                    "envelope": FileDescriptor(
                        filename="request.json",
                        size=result.envelope.size,
                        sha256=result.envelope.sha256,
                    )
                }
            )
        return result

    monkeypatch.setattr(controller, "_run_child", corrupt_result)
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)
    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits",
        json=payload_for(project, entry_id).model_dump(mode="json"),
    )
    assert response.status_code == 500, response.text
    assert response.json()["detail"]["code"] == "edit_output_invalid"
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert canonical_files(controller) == files
    assert not controller.active and not list(controller.work_root.iterdir())


def test_response_keeps_committed_revision_while_encoding_and_a_later_command_runs(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    ready, release = threading.Event(), threading.Event()
    original = PreparedPublication.response

    def held_response(self: PreparedPublication, captured: Any) -> Any:
        ready.set()
        assert release.wait(10)
        return original(self, captured)

    monkeypatch.setattr(PreparedPublication, "response", held_response)

    async def run() -> None:
        path = f"/api/v1/projects/{project['id']}"
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=client.app), base_url="http://test"
        ) as api:
            task = asyncio.create_task(
                api.post(
                    f"{path}/entries/{entry_id}/model-edits",
                    json=payload_for(project, entry_id).model_dump(mode="json"),
                )
            )
            try:
                assert await asyncio.to_thread(ready.wait, 10)
                assert (await api.get("/api/v1/health")).status_code == 200
                current = (await api.get(path)).json()
                assert current["revision"] == project["revision"] + 1
                changed = await api.patch(
                    f"{path}/entries/{entry_id}",
                    json={
                        "expected_revision": current["revision"],
                        "name": "Later rename",
                    },
                )
                assert changed.status_code == 200
            finally:
                release.set()
            response = await task
            assert response.status_code == 200, response.text
            assert response.json()["project"]["revision"] == project["revision"] + 1
            assert response.json()["project"]["entries"][0]["name"] == project["entries"][0]["name"]
            assert (await api.get(path)).json()["revision"] == project["revision"] + 2

    asyncio.run(run())
    assert not controller.active and not list(controller.work_root.iterdir())


def test_no_change_hydrogens_does_not_publish_artifacts_or_history(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    completed = edit(
        client, project, entry_id, [1], {"operation": "hydrogens.complete", "scope": "entry"}
    )
    assert completed.status_code == 200, completed.text
    project = completed.json()["project"]
    controller: EditExecutionController = client.app.state.edit_execution
    path = f"/api/v1/projects/{project['id']}"
    baseline, files = client.get(path).json(), canonical_files(controller)
    response = edit(
        client, project, entry_id, [1], {"operation": "hydrogens.complete", "scope": "entry"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["applied"] is False
    assert client.get(path).json() == baseline
    assert canonical_files(controller) == files
    assert not controller.active and not list(controller.work_root.iterdir())


def test_independent_computations_from_one_revision_publish_exactly_once(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    first: EditExecutionController = client.app.state.edit_execution
    second = EditExecutionController(first.factory, first.settings)

    async def run() -> None:
        results = await asyncio.gather(
            first.execute(
                "model",
                project["id"],
                entry_id,
                payload_for(project, entry_id),
                cast(Request, OwnedRequest()),
            ),
            second.execute(
                "model",
                project["id"],
                entry_id,
                payload_for(project, entry_id),
                cast(Request, OwnedRequest()),
            ),
            return_exceptions=True,
        )
        successes = [result for result in results if isinstance(result, bytes)]
        assert len(successes) == 1
        assert json.loads(successes[0])["project"]["revision"] == project["revision"] + 1
        failures = [result for result in results if isinstance(result, Exception)]
        assert len(failures) == 1
        assert type(failures[0]).__name__ == "RevisionConflictError"

    asyncio.run(run())
    assert (
        client.get(f"/api/v1/projects/{project['id']}").json()["revision"]
        == project["revision"] + 1
    )
    assert not first.active and not second.active
    assert not list(first.work_root.iterdir())


def test_admission_waiter_cancellation_does_not_retire_another_live_request(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    original = controller._run_child
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()

    async def run() -> None:
        ready, release = asyncio.Event(), asyncio.Event()

        async def held_child(*args: Any) -> EditOutput:
            ready.set()
            await release.wait()
            return await original(*args)

        monkeypatch.setattr(controller, "_run_child", held_child)
        owner = OwnedRequest()
        first = asyncio.create_task(
            controller.execute(
                "preview",
                project["id"],
                entry_id,
                payload_for(project, entry_id, preview=True),
                cast(Request, owner),
            )
        )
        await asyncio.wait_for(ready.wait(), 5)
        waiter_owner = OwnedRequest()
        waiter = asyncio.create_task(
            controller.execute(
                "preview",
                project["id"],
                entry_id,
                payload_for(project, entry_id, preview=True),
                cast(Request, waiter_owner),
            )
        )
        await asyncio.sleep(0.025)
        with pytest.raises(EditExecutionError) as busy:
            await controller.execute(
                "preview",
                project["id"],
                entry_id,
                payload_for(project, entry_id, preview=True),
                cast(Request, OwnedRequest()),
            )
        assert busy.value.code == "editing_busy"
        assert controller.active and not first.done()
        waiter_owner.disconnected = True
        with pytest.raises(EditExecutionError) as cancelled:
            await waiter
        assert cancelled.value.code == "edit_cancelled"
        assert controller.preview_waiter is None
        assert controller.active and not first.done() and not owner.disconnected
        release.set()
        assert json.loads(await first)["entry_id"] == entry_id

    asyncio.run(run())
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert not controller.active and not list(controller.work_root.iterdir())


def test_disconnect_reaps_uncooperative_child_before_publication(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    controller.settings = replace(controller.settings, edit_cleanup_grace_seconds=0.05)
    monkeypatch.setattr(execution, "run_edit_child", waiting_child)
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)

    async def run() -> None:
        owner = OwnedRequest()
        task = asyncio.create_task(
            controller.execute(
                "model",
                project["id"],
                entry_id,
                payload_for(project, entry_id),
                cast(Request, owner),
            )
        )
        pid = None
        for _ in range(200):
            markers = list(controller.work_root.glob("*/child.pid"))
            if markers:
                pid = int(markers[0].read_text())
                break
            await asyncio.sleep(0.025)
        assert pid is not None
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=client.app), base_url="http://test"
        ) as api:
            assert (await api.get("/api/v1/health")).status_code == 200
            assert (await api.get(f"/api/v1/projects/{project['id']}")).json() == baseline
            assert not task.done()
        owner.disconnected = True
        with pytest.raises(EditExecutionError) as cancelled:
            await task
        assert cancelled.value.status == 499
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)

    asyncio.run(run())
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert canonical_files(controller) == files
    assert not controller.active and not list(controller.work_root.iterdir())


@pytest.mark.parametrize("after_commit", [False, True])
def test_disconnect_boundary_distinguishes_no_publication_from_committed_edit(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    after_commit: bool,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    owner = OwnedRequest()
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    original_load = controller._load
    original_response = PreparedPublication.response

    def disconnect_after_load(*args: Any) -> Any:
        result = original_load(*args)
        owner.disconnected = True
        return result

    def disconnect_after_publication(self: PreparedPublication, captured: Any) -> Any:
        owner.disconnected = True
        return original_response(self, captured)

    monkeypatch.setattr(
        PreparedPublication if after_commit else controller,
        "response" if after_commit else "_load",
        disconnect_after_publication if after_commit else disconnect_after_load,
    )

    async def run() -> None:
        operation = controller.execute(
            "model",
            project["id"],
            entry_id,
            payload_for(project, entry_id),
            cast(Request, owner),
        )
        if after_commit:
            response = json.loads(await operation)
            assert response["project"]["revision"] == project["revision"] + 1
        else:
            with pytest.raises(EditExecutionError) as cancelled:
                await operation
            assert cancelled.value.code == "edit_cancelled"

    asyncio.run(run())
    current = client.get(f"/api/v1/projects/{project['id']}").json()
    if after_commit:
        assert current["revision"] == project["revision"] + 1
    else:
        assert current == baseline
    assert not controller.active and not list(controller.work_root.iterdir())


def test_existing_over_limit_entry_can_be_reduced_below_its_configured_limit(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    controller.settings = replace(controller.settings, atom_hard_limit=2)
    response = edit(client, project, entry_id, [3], {"operation": "atom.delete"})
    assert response.status_code == 200, response.text
    assert response.json()["project"]["entries"][0]["atom_count"] == 2
    assert not controller.active and not list(controller.work_root.iterdir())


def test_worker_start_failure_releases_admission_and_staging(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from multiprocessing.process import BaseProcess

    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)

    def unavailable(self: Any) -> None:
        raise OSError("Injected unavailable process resource")

    monkeypatch.setattr(BaseProcess, "start", unavailable)
    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits",
        json=payload_for(project, entry_id).model_dump(mode="json"),
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "edit_worker_start_failed"
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert canonical_files(controller) == files
    assert not controller.active and not list(controller.work_root.iterdir())


@pytest.mark.parametrize("original", [False, True])
def test_invalid_artifact_metadata_distinguishes_canonical_input_from_optional_original(
    client: ApiClient,
    original: bool,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    with controller.factory() as session:
        entry = session.get(StructureEntry, entry_id)
        assert entry is not None
        artifact = session.get(
            Artifact, entry.original_artifact_id if original else entry.current_artifact_id
        )
        assert artifact is not None
        artifact.sha256 = "not-a-content-hash"
        session.commit()
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    files = canonical_files(controller)
    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits",
        json=payload_for(project, entry_id).model_dump(mode="json"),
    )
    if original:
        assert response.status_code == 200, response.text
        assert response.json()["project"]["revision"] == project["revision"] + 1
    else:
        assert response.status_code == 422
        assert "restore or reimport" in response.json()["detail"]["message"]
        assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
        assert canonical_files(controller) == files
    assert not controller.active and not list(controller.work_root.iterdir())


def test_staging_failure_is_typed_and_does_not_publish(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()

    def unavailable(*args: Any) -> Any:
        raise OSError("Injected unavailable staging storage")

    monkeypatch.setattr(controller, "_capture", unavailable)
    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits",
        json=payload_for(project, entry_id).model_dump(mode="json"),
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "edit_staging_failed"
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert not controller.active and not list(controller.work_root.iterdir())


def test_response_failure_explicitly_reports_the_already_committed_edit(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution

    def unavailable(*args: Any) -> Any:
        raise ValueError("Injected response encoding failure")

    monkeypatch.setattr(PreparedPublication, "response", unavailable)
    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits",
        json=payload_for(project, entry_id).model_dump(mode="json"),
    )
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "edit_response_failed"
    assert "was saved" in response.json()["detail"]["message"]
    assert "Refresh" in response.json()["detail"]["message"]
    current = client.get(f"/api/v1/projects/{project['id']}").json()
    assert current["revision"] == project["revision"] + 1
    assert (
        current["entries"][0]["current_artifact_id"] != project["entries"][0]["current_artifact_id"]
    )
    assert not controller.active and not list(controller.work_root.iterdir())


def test_group_cleanup_keeps_acknowledged_ownership_after_root_exit(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project, entry_id = project_with_ligand(client)
    controller: EditExecutionController = client.app.state.edit_execution
    monkeypatch.setattr(execution, "run_edit_child", acknowledged_exit_child)
    signals: list[tuple[int, int]] = []

    if os.name == "posix":
        original_signal = os.killpg

        def already_exited(pid: int) -> int:
            raise ProcessLookupError(pid)

        def record_signal(pid: int, signal: int) -> None:
            signals.append((pid, signal))
            original_signal(pid, signal)

        monkeypatch.setattr(os, "getpgid", already_exited)
        monkeypatch.setattr(os, "killpg", record_signal)
    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits",
        json=payload_for(project, entry_id).model_dump(mode="json"),
    )
    assert response.status_code == 500
    if os.name == "posix":
        assert signals and all(pid != os.getpid() for pid, _ in signals)
    else:
        assert not signals
    assert not controller.active and not list(controller.work_root.iterdir())
