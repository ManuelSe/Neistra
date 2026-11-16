from __future__ import annotations

import asyncio
import json
import os
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from neistra_api import contact_service as execution
from neistra_api import edit_execution_data as transport
from neistra_api.contact_execution_data import ContactPolicy
from neistra_api.contact_service import ContactReadCoordinator, ContactReadError
from neistra_api.models import Artifact, StructureEntry
from neistra_api.schemas import ContactQuery

from tests.integration.test_viewer_state import import_ligand
from tests.support.api_client import ApiClient
from tests.support.contact_execution_workers import (
    boolean_count_child,
    excessive_bytes_child,
    excessive_count_child,
    exiting_contact_child,
    oversized_contact_control,
    partial_contact_child,
    reporting_contact_child,
    waiting_contact_child,
    wrong_filename_child,
    wrong_hash_child,
    wrong_owner_child,
)


async def connected() -> bool:
    return False


def coordinator(client: ApiClient, **overrides: Any) -> ContactReadCoordinator:
    service = ContactReadCoordinator(
        client.app.state.session_factory,
        client.app.state.settings,
        ContactPolicy(**overrides),
    )
    client.app.state.contact_reads = service
    return service


def query_for(project: dict[str, Any], *, expected: bool = True) -> ContactQuery:
    entry = project["entries"][0]
    return ContactQuery(
        entry_id=entry["id"],
        cutoff=3.0,
        expected_artifact_id=entry["current_artifact_id"] if expected else None,
    )


def canonical_files(service: ContactReadCoordinator) -> dict[str, bytes]:
    root = service.settings.data_dir / "artifacts"
    return {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}


async def wait_ready(service: ContactReadCoordinator) -> int:
    marker = service.settings.data_dir / "contact-worker-ready"
    for _ in range(600):
        if marker.exists():
            return int(marker.read_text())
        await asyncio.sleep(0.01)
    raise AssertionError("Owned contact worker did not reach the held fixture")


async def finish_analysis(service: ContactReadCoordinator, task: asyncio.Task[bytes]) -> None:
    if not task.done():
        task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    await service.close()


def assert_reaped(pid: int) -> None:
    if os.name == "posix":
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)
    else:
        import multiprocessing

        assert pid not in {child.pid for child in multiprocessing.active_children()}


def test_owned_capture_closes_session_health_and_busy_remain_available(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    before = canonical_files(service)
    persisted_before = client.get(f"/api/v1/projects/{project['id']}").json()
    sessions = []
    factory = service.factory

    def tracked_factory() -> Any:
        session = factory()
        sessions.append(session)
        return session

    monkeypatch.setattr(service, "factory", tracked_factory)
    monkeypatch.setattr(execution, "run_contact_child", waiting_contact_child)

    async def run() -> None:
        task = asyncio.create_task(service.analyze(project["id"], query_for(project), connected))
        try:
            await wait_ready(service)
            assert sessions and not sessions[0].in_transaction()
            assert len(sessions[0].identity_map) == 0
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=client.app), base_url="http://test"
            ) as api:
                assert (await asyncio.wait_for(api.get("/api/v1/health"), 5)).status_code == 200
                busy = await api.post(
                    f"/api/v1/projects/{project['id']}/contacts",
                    json=query_for(project).model_dump(),
                )
                assert busy.status_code == 429
            (service.settings.data_dir / "contact-worker-release").touch()
            rows = json.loads(await task)
            assert len(rows) == 1 and rows[0]["distance"] == pytest.approx(2.4)
            assert rows[0]["atom_1"]["structure_id"] == project["entries"][0]["id"]
        finally:
            await service.close()

    asyncio.run(run())
    assert canonical_files(service) == before
    assert not list(service.settings.data_dir.glob("contact-read-*"))
    assert client.get(f"/api/v1/projects/{project['id']}").json() == persisted_before


@pytest.mark.parametrize("change", ["delete", "replace"])
def test_current_input_rechecked_before_success(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, change: str
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    monkeypatch.setattr(execution, "run_contact_child", waiting_contact_child)

    async def run() -> None:
        task = asyncio.create_task(service.analyze(project["id"], query_for(project), connected))
        try:
            await wait_ready(service)
            with service.factory() as session:
                entry = session.get(StructureEntry, project["entries"][0]["id"])
                assert entry is not None
                if change == "delete":
                    session.delete(entry)
                else:
                    entry.current_artifact_id = entry.original_artifact_id
                session.commit()
            (service.settings.data_dir / "contact-worker-release").touch()
            with pytest.raises(ContactReadError) as caught:
                await task
            assert caught.value.status == 409
        finally:
            await service.close()

    asyncio.run(run())
    assert not list(service.settings.data_dir.glob("contact-read-*"))


def test_repeated_cancel_retains_admission_until_reaping(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    original_worker = execution.run_contact_child
    monkeypatch.setattr(execution, "run_contact_child", waiting_contact_child)
    original_cleanup = service._cleanup

    async def run() -> None:
        cleanup_started, release_cleanup = asyncio.Event(), asyncio.Event()

        async def held_cleanup(operation: Any) -> None:
            cleanup_started.set()
            await release_cleanup.wait()
            await original_cleanup(operation)

        monkeypatch.setattr(service, "_cleanup", held_cleanup)
        task = asyncio.create_task(service.analyze(project["id"], query_for(project), connected))
        try:
            pid = await wait_ready(service)
            task.cancel()
            await asyncio.wait_for(cleanup_started.wait(), 5)
            task.cancel()
            cancellation_delivered = asyncio.Event()
            asyncio.get_running_loop().call_soon(cancellation_delivered.set)
            # Deliver the second cancellation before checking retained admission.
            await cancellation_delivered.wait()
            with pytest.raises(ContactReadError) as caught:
                await service.analyze(project["id"], query_for(project), connected)
            assert caught.value.status == 429
            assert not task.done()
            release_cleanup.set()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert_reaped(pid)
            monkeypatch.setattr(service, "_cleanup", original_cleanup)
            monkeypatch.setattr(execution, "run_contact_child", original_worker)
            assert (
                len(json.loads(await service.analyze(project["id"], query_for(project), connected)))
                == 1
            )
        finally:
            # An assertion must never strand this test's cleanup lease.
            release_cleanup.set()
            await finish_analysis(service, task)

    asyncio.run(run())
    assert not list(service.settings.data_dir.glob("contact-read-*"))


def test_cancel_during_owned_capture_settles_thread_before_reusing_admission(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    before = canonical_files(service)
    original_capture, original_settle = service._capture, execution.settle_owned_task
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()

    def held_capture(*args: Any) -> Any:
        try:
            captured = original_capture(*args)
            entered.set()
            release.wait()
            return captured
        finally:
            finished.set()

    monkeypatch.setattr(service, "_capture", held_capture)

    async def run() -> None:
        cancellation_seen = asyncio.Event()

        async def observed_settle(owned: asyncio.Task[Any]) -> Any:
            if asyncio.current_task() is task:
                cancellation_seen.set()
            return await original_settle(owned)

        monkeypatch.setattr(execution, "settle_owned_task", observed_settle)
        task = asyncio.create_task(service.analyze(project["id"], query_for(project), connected))
        try:
            assert await asyncio.to_thread(entered.wait, 5)
            task.cancel()
            await asyncio.wait_for(cancellation_seen.wait(), 5)
            with pytest.raises(ContactReadError) as caught:
                await service.analyze(project["id"], query_for(project), connected)
            assert caught.value.status == 429
            assert not task.done() and not finished.is_set()
            assert not list(service.settings.data_dir.glob("contact-read-*"))
            release.set()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert finished.is_set()
            monkeypatch.setattr(service, "_capture", original_capture)
            monkeypatch.setattr(execution, "settle_owned_task", original_settle)
            assert (
                len(json.loads(await service.analyze(project["id"], query_for(project), connected)))
                == 1
            )
        finally:
            release.set()
            await finish_analysis(service, task)
            assert finished.is_set()

    asyncio.run(run())
    assert canonical_files(service) == before
    assert not list(service.settings.data_dir.glob("contact-read-*"))


def test_cancel_during_open_verified_response_read_waits_for_owned_descriptor(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    before = canonical_files(service)
    original_read, original_stat = execution.read_verified_file, os.fstat
    original_settle = execution.settle_owned_task
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()
    target: dict[str, Any] = {}
    reads: list[bytes] = []
    monkeypatch.setattr(execution, "run_contact_child", reporting_contact_child)

    def held_stat(descriptor: int) -> os.stat_result:
        info = original_stat(descriptor)
        if target.get("thread") == threading.get_ident() and info.st_ino == target.get("inode"):
            entered.set()
            release.wait()
        return info

    def observed_read(directory: Path, descriptor: Any) -> bytes:
        target.update(
            {
                "thread": threading.get_ident(),
                "inode": (directory / descriptor.filename).stat().st_ino,
                "directory": directory,
            }
        )
        try:
            data = original_read(directory, descriptor)
            reads.append(data)
            return data
        finally:
            finished.set()

    monkeypatch.setattr(transport.os, "fstat", held_stat)
    monkeypatch.setattr(execution, "read_verified_file", observed_read)

    async def run() -> None:
        cancellation_seen = asyncio.Event()

        async def observed_settle(owned: asyncio.Task[Any]) -> Any:
            if asyncio.current_task() is task:
                cancellation_seen.set()
            return await original_settle(owned)

        monkeypatch.setattr(execution, "settle_owned_task", observed_settle)
        task = asyncio.create_task(service.analyze(project["id"], query_for(project), connected))
        try:
            assert await asyncio.to_thread(entered.wait, 5)
            pid = await wait_ready(service)
            assert (target["directory"] / "response.json").exists()
            task.cancel()
            await asyncio.wait_for(cancellation_seen.wait(), 5)
            with pytest.raises(ContactReadError) as caught:
                await service.analyze(project["id"], query_for(project), connected)
            assert caught.value.status == 429
            assert not task.done() and not finished.is_set()
            assert target["directory"].exists()
            release.set()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert finished.is_set() and len(reads) == 1
            assert len(json.loads(reads[0])) == 1
            assert_reaped(pid)
            monkeypatch.setattr(execution, "read_verified_file", original_read)
            monkeypatch.setattr(execution, "settle_owned_task", original_settle)
            monkeypatch.setattr(transport.os, "fstat", original_stat)
            assert (
                len(json.loads(await service.analyze(project["id"], query_for(project), connected)))
                == 1
            )
        finally:
            release.set()
            await finish_analysis(service, task)

    asyncio.run(run())
    assert canonical_files(service) == before
    assert not list(service.settings.data_dir.glob("contact-read-*"))


@pytest.mark.parametrize("failure", [OSError, RuntimeError])
def test_process_start_failure_closes_unstarted_resources_and_reuses_admission(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, failure: type[Exception]
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    before = canonical_files(service)
    original_context = execution.multiprocessing.get_context
    context = original_context("spawn")
    connections = []
    closed = []

    class StartFailureContext:
        @staticmethod
        def Pipe(*args: Any, **kwargs: Any) -> Any:
            ends = context.Pipe(*args, **kwargs)
            connections.extend(ends)
            return ends

        @staticmethod
        def Process(*args: Any, **kwargs: Any) -> Any:
            process = context.Process(*args, **kwargs)
            original_close = process.close

            def fail_start() -> None:
                raise failure("Injected contact process start failure")

            def observe_close() -> None:
                original_close()
                closed.append(True)

            monkeypatch.setattr(process, "start", fail_start)
            monkeypatch.setattr(process, "close", observe_close)
            return process

    monkeypatch.setattr(
        execution.multiprocessing, "get_context", lambda *args: StartFailureContext()
    )

    async def run() -> None:
        try:
            with pytest.raises(ContactReadError) as caught:
                await service.analyze(project["id"], query_for(project), connected)
            assert caught.value.status == 503 and caught.value.code == "contacts_worker_start"
            assert closed == [True]
            assert len(connections) == 2 and all(connection.closed for connection in connections)
            assert not list(service.settings.data_dir.glob("contact-read-*"))
            monkeypatch.setattr(execution.multiprocessing, "get_context", original_context)
            assert (
                len(json.loads(await service.analyze(project["id"], query_for(project), connected)))
                == 1
            )
        finally:
            await service.close()

    asyncio.run(run())
    assert canonical_files(service) == before


def test_cleanup_failure_keeps_admission_closed_and_retained_directory_explicit(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    before = canonical_files(service)
    original_remove = execution.shutil.rmtree
    monkeypatch.setattr(execution, "run_contact_child", reporting_contact_child)

    def refuse_owned_directory(directory: Path, *args: Any, **kwargs: Any) -> Any:
        if Path(directory).name.startswith("contact-read-"):
            raise OSError("Injected owned contact-directory cleanup failure")
        return original_remove(directory, *args, **kwargs)

    monkeypatch.setattr(execution.shutil, "rmtree", refuse_owned_directory)

    async def run() -> None:
        try:
            with pytest.raises(OSError, match="cleanup failure"):
                await service.analyze(project["id"], query_for(project), connected)
            assert_reaped(await wait_ready(service))
            retained = list(service.settings.data_dir.glob("contact-read-*"))
            assert len(retained) == 1 and (retained[0] / "response.json").exists()
            with pytest.raises(ContactReadError) as caught:
                await service.analyze(project["id"], query_for(project), connected)
            assert caught.value.status == 503
            assert caught.value.code == "contacts_unavailable"
        finally:
            monkeypatch.setattr(execution.shutil, "rmtree", original_remove)
            # This is explicit teardown of the injected retained-file failure;
            # it does not pretend that production admission recovered.
            for directory in service.settings.data_dir.glob("contact-read-*"):
                original_remove(directory)
            try:
                await service.close()
            except OSError as error:
                assert "cleanup failure" in str(error)

    asyncio.run(run())
    assert canonical_files(service) == before
    assert not list(service.settings.data_dir.glob("contact-read-*"))


def test_disconnect_reaps_owned_child_before_admitting_another_read(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    before = canonical_files(service)
    original_worker = execution.run_contact_child
    monkeypatch.setattr(execution, "run_contact_child", waiting_contact_child)

    async def run() -> None:
        disconnected = asyncio.Event()

        async def request_disconnected() -> bool:
            return disconnected.is_set()

        task = asyncio.create_task(
            service.analyze(project["id"], query_for(project), request_disconnected)
        )
        try:
            pid = await wait_ready(service)
            disconnected.set()
            with pytest.raises(ContactReadError) as caught:
                await task
            assert caught.value.status == 499 and caught.value.code == "contacts_cancelled"
            assert_reaped(pid)
            monkeypatch.setattr(execution, "run_contact_child", original_worker)
            assert (
                len(json.loads(await service.analyze(project["id"], query_for(project), connected)))
                == 1
            )
        finally:
            (service.settings.data_dir / "contact-worker-release").touch()
            await finish_analysis(service, task)

    asyncio.run(run())
    assert canonical_files(service) == before
    assert not list(service.settings.data_dir.glob("contact-read-*"))


@pytest.mark.parametrize("invalid", ["sha", "size"])
def test_invalid_canonical_artifact_metadata_refuses_before_child_or_directory(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    before = canonical_files(service)
    with service.factory() as session:
        artifact = session.get(Artifact, project["entries"][0]["current_artifact_id"])
        assert artifact is not None
        if invalid == "sha":
            artifact.sha256 = "not-a-sha256"
        else:
            artifact.size = -1
        session.commit()
    before_response = client.get(f"/api/v1/projects/{project['id']}")
    assert before_response.status_code == 200
    persisted_before = before_response.json()
    original_directory, original_context = (
        service._make_directory,
        execution.multiprocessing.get_context,
    )
    allocations = []

    def observe_directory(*args: Any) -> Any:
        allocations.append("directory")
        return original_directory(*args)

    def observe_context(*args: Any, **kwargs: Any) -> Any:
        allocations.append("process-context")
        return original_context(*args, **kwargs)

    monkeypatch.setattr(service, "_make_directory", observe_directory)
    monkeypatch.setattr(execution.multiprocessing, "get_context", observe_context)
    response = client.post(
        f"/api/v1/projects/{project['id']}/contacts", json=query_for(project).model_dump()
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "contacts_input_unavailable"
    assert allocations == []
    assert canonical_files(service) == before
    after_response = client.get(f"/api/v1/projects/{project['id']}")
    assert after_response.status_code == 200
    assert after_response.json() == persisted_before
    assert not list(service.settings.data_dir.glob("contact-read-*"))


def test_cancellation_before_owned_execution_releases_admission(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    original = service._execute

    async def run() -> None:
        entered = asyncio.Event()

        async def before_execution(*args: Any) -> bytes:
            entered.set()
            await asyncio.Event().wait()
            raise AssertionError("Cancelled admission must not start computation")

        monkeypatch.setattr(service, "_execute", before_execution)
        task = asyncio.create_task(service.analyze(project["id"], query_for(project), connected))
        await asyncio.wait_for(entered.wait(), 5)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        monkeypatch.setattr(service, "_execute", original)
        assert (
            len(json.loads(await service.analyze(project["id"], query_for(project), connected)))
            == 1
        )
        await service.close()

    asyncio.run(run())
    assert not list(service.settings.data_dir.glob("contact-read-*"))


def test_shutdown_reaps_owned_worker_and_rejects_new_admission(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    monkeypatch.setattr(execution, "run_contact_child", waiting_contact_child)

    async def run() -> None:
        task = asyncio.create_task(service.analyze(project["id"], query_for(project), connected))
        pid = await wait_ready(service)
        await service.close()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert_reaped(pid)
        with pytest.raises(ContactReadError) as caught:
            await service.analyze(project["id"], query_for(project), connected)
        assert caught.value.status == 503

    asyncio.run(run())
    assert not list(service.settings.data_dir.glob("contact-read-*"))


@pytest.mark.parametrize(
    "worker",
    [
        wrong_owner_child,
        boolean_count_child,
        excessive_count_child,
        wrong_filename_child,
        wrong_hash_child,
        excessive_bytes_child,
        partial_contact_child,
        oversized_contact_control,
        exiting_contact_child,
    ],
)
def test_bad_worker_result_never_publishes_success(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, worker: Callable[..., None]
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    before = canonical_files(service)
    monkeypatch.setattr(execution, "run_contact_child", worker)
    response = client.post(
        f"/api/v1/projects/{project['id']}/contacts", json=query_for(project).model_dump()
    )
    assert response.status_code == 500
    assert canonical_files(service) == before
    assert not list(service.settings.data_dir.glob("contact-read-*"))


@pytest.mark.parametrize("failure", ["timeout", "memory", "source", "stale"])
def test_operational_refusal_is_explicit_and_does_not_edit_project(
    client: ApiClient, failure: str
) -> None:
    project = import_ligand(client)
    service = coordinator(
        client,
        **({"timeout_seconds": 0.001} if failure == "timeout" else {}),
        **({"max_worker_rss_bytes": 1} if failure == "memory" else {}),
    )
    persisted_before = client.get(f"/api/v1/projects/{project['id']}").json()
    query = query_for(project)
    if failure == "stale":
        query = query.model_copy(update={"expected_artifact_id": "retired-artifact"})
    if failure == "source":
        with service.factory() as session:
            artifact = session.get(Artifact, project["entries"][0]["current_artifact_id"])
            assert artifact is not None
            path = service.settings.data_dir / artifact.relative_path
            data = path.read_bytes()
            path.write_bytes(b"x" + data[1:])
    response = client.post(f"/api/v1/projects/{project['id']}/contacts", json=query.model_dump())
    assert (
        response.status_code
        == {"timeout": 504, "memory": 413, "source": 422, "stale": 409}[failure]
    )
    assert client.get(f"/api/v1/projects/{project['id']}").json() == persisted_before
    assert not list(service.settings.data_dir.glob("contact-read-*"))
