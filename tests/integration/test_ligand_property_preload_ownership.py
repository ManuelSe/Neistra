"""Private pre-launch failures preserve ordinary work and close only their own capture."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from neistra_api import job_worker as worker_module
from neistra_api import ligand_property_cache as cache_module
from neistra_api import ligand_property_process as process_module
from neistra_api.job_service import JobService
from neistra_api.ligand_property_process import PropertyAttempt
from neistra_api.ligand_property_service import (
    MAX_TERMINAL_EXECUTIONS,
    LigandPropertyService,
)
from neistra_api.models import (
    Artifact,
    Job,
    LigandPropertyConsumer,
    LigandPropertyExecution,
    utc_now,
)
from sqlalchemy import func, select, update

from tests.integration.test_ligand_property_lifecycle import (
    allocate,
    demand,
    imported,
    read,
    source,
    worker,
)
from tests.support.api_client import ApiClient


@pytest.fixture
def no_child_or_signal(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("A pre-launch refusal must not spawn or signal a process")

    monkeypatch.setattr(worker_module.multiprocessing, "get_context", forbidden)
    monkeypatch.setattr(worker_module.os, "kill", forbidden)
    monkeypatch.setattr(worker_module.os, "killpg", forbidden)


def public_job(client: ApiClient, project: dict[str, Any]) -> str:
    reply = client.post(
        f"/api/v1/projects/{project['id']}/jobs",
        json={
            "job_type": "molweave.demo.structure_statistics",
            "parameters": {},
            "inputs": [{"role": "structure", "entry_id": source(project)["entry_id"]}],
        },
    )
    assert reply.status_code == 201, reply.text
    return str(reply.json()["id"])


def ordinary_admission(
    client: ApiClient,
    runner: worker_module.JobWorker,
    project: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    job_id = public_job(client, project)
    observed: list[str] = []

    def ready(job: Job, inputs: tuple[worker_module.ChildInput, ...]) -> None:
        assert job.id == job_id and job.purpose == "user"
        assert inputs and inputs[0].data
        observed.append(job.id)

    monkeypatch.setattr(runner, "_run_claimed", ready)
    assert runner.run_once()
    assert observed == [job_id]
    assert client.get(f"/api/v1/jobs/{job_id}").json()["status"] == "running"


def rows(client: ApiClient) -> dict[str, list[dict[str, Any]]]:
    with client.app.state.session_factory() as session:
        return {
            name: [dict(row) for row in session.execute(select(model.__table__)).mappings()]
            for name, model in (
                ("jobs", Job),
                ("executions", LigandPropertyExecution),
                ("consumers", LigandPropertyConsumer),
            )
        }


@pytest.mark.usefixtures("no_child_or_signal")
@pytest.mark.parametrize("fault", ["root_file", "constructor", "iteration", "unlink"])
def test_cache_startup_io_refusal_keeps_ordinary_admission_available(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    fault: str,
) -> None:
    project = imported(client)
    entry = project["entries"][0]
    original_url = f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original"
    original = client.get(original_url).content
    cache_root = client.app.state.settings.data_dir / "cache/ligand-properties-v1"
    cache_root.parent.mkdir(parents=True, exist_ok=True)
    if fault == "root_file":
        cache_root.write_bytes(b"A private cache path is unavailable")
    elif fault == "constructor":

        def inaccessible(*args: Any, **kwargs: Any) -> None:
            raise PermissionError("Controlled private cache mkdir refusal")

        monkeypatch.setattr(cache_module, "LocalArtifactStore", inaccessible)
    elif fault == "iteration":
        original_iterdir = Path.iterdir

        def inaccessible_iterdir(path: Path) -> Any:
            if path == cache_root / "artifacts/sha256":
                raise PermissionError("Controlled private cache iteration refusal")
            return original_iterdir(path)

        monkeypatch.setattr(Path, "iterdir", inaccessible_iterdir)
    else:
        orphan = cache_root / "artifacts/sha256/ab" / ("ab" + "0" * 62)
        orphan.parent.mkdir(parents=True, exist_ok=True)
        orphan.write_bytes(b"Unreferenced private derived content")
        original_unlink = Path.unlink

        def inaccessible_unlink(path: Path, *args: Any, **kwargs: Any) -> None:
            if path == orphan:
                raise PermissionError("Controlled private orphan unlink refusal")
            original_unlink(path, *args, **kwargs)

        monkeypatch.setattr(Path, "unlink", inaccessible_unlink)
    runner = worker(client)
    assert runner.recover_abandoned() == 0
    assert "Descriptor cache recovery unavailable" in caplog.text
    ordinary_admission(client, runner, project, monkeypatch)
    assert client.get(original_url).content == original


@pytest.mark.usefixtures("no_child_or_signal")
def test_cache_io_refusal_fails_demand_explicitly_and_repair_allows_new_admission(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    cache_root = client.app.state.settings.data_dir / "cache/ligand-properties-v1"
    cache_root.parent.mkdir(parents=True, exist_ok=True)
    # Demand's read may have created the empty cache; remove only these empty owned paths.
    if cache_root.exists():
        (cache_root / "artifacts/sha256").rmdir()
        (cache_root / "artifacts").rmdir()
        (cache_root / "work").rmdir()
        cache_root.rmdir()
    cache_root.write_bytes(b"Private descriptor storage needs repair")
    runner = worker(client)
    assert runner.recover_abandoned() == 0
    assert runner.run_once()
    assert read(client, project).json()["entries"][0]["status"] == "failed"
    ordinary_admission(client, runner, project, monkeypatch)
    cache_root.unlink()
    assert demand(client, project, consumer, 2).status_code == 200
    admitted: list[str] = []

    def ready(job: Job, inputs: tuple[worker_module.ChildInput, ...]) -> None:
        assert job.purpose == "ligand_properties" and inputs
        admitted.append(job.id)

    monkeypatch.setattr(runner, "_run_claimed", ready)
    assert runner.run_once()
    assert len(admitted) == 1


@pytest.mark.usefixtures("no_child_or_signal")
def test_positive_process_recovery_failure_is_not_hidden_by_cache_recovery(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    cleanup: list[bool] = []

    def unverified_processes(*args: Any, **kwargs: Any) -> None:
        raise OSError("Controlled positive process recovery refusal")

    def cleanup_called(*args: Any, **kwargs: Any) -> int:
        cleanup.append(True)
        return 0

    monkeypatch.setattr(process_module, "recover_property_processes", unverified_processes)
    monkeypatch.setattr(cache_module.LigandPropertyCache, "cleanup_orphans", cleanup_called)
    with pytest.raises(OSError, match="positive process recovery refusal"):
        worker(client).recover_abandoned()
    assert not cleanup


@pytest.mark.usefixtures("no_child_or_signal")
def test_shared_database_failure_is_not_classified_as_private_cache_io(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from sqlalchemy.exc import SQLAlchemyError

    def database_unavailable(*args: Any, **kwargs: Any) -> int:
        raise SQLAlchemyError("Controlled shared-store query refusal")

    monkeypatch.setattr(cache_module.LigandPropertyCache, "cleanup_orphans", database_unavailable)
    with pytest.raises(SQLAlchemyError, match="shared-store query refusal"):
        worker(client).recover_abandoned()


@pytest.mark.usefixtures("no_child_or_signal")
def test_failed_capture_read_is_terminal_and_reaped_before_next_admission(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    runner = worker(client)
    original_load = runner._load_inputs
    observed: list[PropertyAttempt] = []
    refused_reads: list[str] = []

    def unavailable(session: Any, service: Any, job: Job) -> tuple[worker_module.ChildInput, ...]:
        attempt = PropertyAttempt.capture(job, runner.worker_id)
        observed.append(attempt)
        execution = session.get(LigandPropertyExecution, attempt.execution_id)
        artifact = session.get(Artifact, execution.captures[0]["normalized"]["id"])
        normalized = runner.settings.data_dir / artifact.relative_path
        original_open = Path.open

        def missing(path: Path, *args: Any, **kwargs: Any) -> Any:
            if path == normalized:
                refused_reads.append(str(path))
                raise FileNotFoundError("Controlled captured source read refusal")
            return original_open(path, *args, **kwargs)

        with monkeypatch.context() as fault:
            fault.setattr(Path, "open", missing)
            return original_load(session, service, job)

    monkeypatch.setattr(runner, "_load_inputs", unavailable)
    assert runner.run_once() and len(observed) == 1 and refused_reads
    attempt = observed[0]
    with client.app.state.session_factory() as session:
        current = session.get(Job, attempt.job_id)
        execution = session.get(LigandPropertyExecution, attempt.execution_id)
        assert current.status == "failed" and current.error["code"] == "invalid_input_artifact"
        assert current.completed_at is not None and execution.reaped
        assert execution.child_pid is None and execution.child_start_token is None
        assert execution.group_confirmed is False
        assert session.get(LigandPropertyConsumer, consumer).failures
    assert read(client, project).json()["entries"][0]["status"] == "failed"
    assert not runner.run_once()
    monkeypatch.setattr(runner, "_load_inputs", original_load)
    ordinary_admission(client, runner, project, monkeypatch)
    assert demand(client, project, consumer, 2).status_code == 200
    with client.app.state.session_factory() as session:
        next_job = LigandPropertyService(session, runner.settings).materialize(runner.worker_id)
        assert isinstance(next_job, Job) and next_job.id != attempt.job_id


@pytest.mark.usefixtures("no_child_or_signal")
def test_configured_private_version_refusal_reaps_without_reading_inputs(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    runner = worker(client)
    original_get = runner.registry.get
    original_load = runner._load_inputs

    def configured_version(job_type: str) -> Any:
        registered = original_get(job_type)
        if job_type == "ligand.properties":
            return replace(
                registered,
                definition=replace(
                    registered.definition, implementation_version="controlled-other"
                ),
            )
        return registered

    def inputs_forbidden(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("Version refusal must precede immutable input loading")

    monkeypatch.setattr(runner.registry, "get", configured_version)
    monkeypatch.setattr(runner, "_load_inputs", inputs_forbidden)
    assert runner.run_once()
    with client.app.state.session_factory() as session:
        job = session.scalar(select(Job).where(Job.purpose == "ligand_properties"))
        execution = session.get(LigandPropertyExecution, job.parameters["execution_id"])
        assert job.status == "failed"
        assert job.error["code"] == "implementation_version_unavailable"
        assert execution.reaped and execution.child_pid is None
    assert not runner.run_once()
    monkeypatch.setattr(runner, "_load_inputs", original_load)
    ordinary_admission(client, runner, project, monkeypatch)


@pytest.mark.usefixtures("no_child_or_signal")
def test_version_refusal_keeps_the_attempt_captured_before_registry_admission(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = imported(client)
    assert demand(client, project, allocate(client, project)).status_code == 200
    runner = worker(client)
    original_get = runner.registry.get
    private_gets = 0
    expected: dict[str, list[dict[str, Any]]] = {}

    def replaced_version(job_type: str) -> Any:
        nonlocal private_gets
        registered = original_get(job_type)
        if job_type != "ligand.properties":
            return registered
        private_gets += 1
        if private_gets == 2:
            with client.app.state.session_factory() as session:
                job = session.scalar(select(Job).where(Job.purpose == "ligand_properties"))
                assert job is not None and job.status == "running"
                job.worker_id = "new-owner-before-version-refusal"
                session.commit()
            expected.update(rows(client))
        return replace(
            registered,
            definition=replace(registered.definition, implementation_version="other-version"),
        )

    monkeypatch.setattr(runner.registry, "get", replaced_version)
    assert runner.run_once() and private_gets == 2
    assert rows(client) == expected


@pytest.mark.usefixtures("no_child_or_signal")
def test_preload_refusal_releases_its_writer_before_finalizing(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = imported(client)
    assert demand(client, project, allocate(client, project)).status_code == 200
    runner = worker(client)

    def writer_then_refused(session: Any, service: Any, job: Job) -> None:
        session.execute(update(Job).where(Job.id == "").values(status=Job.status))
        raise ValueError("Controlled refusal while this input loader holds the writer")

    monkeypatch.setattr(runner, "_load_inputs", writer_then_refused)
    assert runner.run_once()
    with client.app.state.session_factory() as session:
        job = session.scalar(select(Job).where(Job.purpose == "ligand_properties"))
        assert job.status == "failed"
        assert session.get(LigandPropertyExecution, job.parameters["execution_id"]).reaped


@pytest.mark.usefixtures("no_child_or_signal")
def test_repeated_preload_refusals_obey_terminal_capture_retention(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = imported(client)
    consumer = allocate(client, project)
    runner = worker(client)
    seen: list[str] = []

    def refused(session: Any, service: Any, job: Job) -> None:
        seen.append(job.id)
        raise ValueError("Controlled never-started input refusal")

    monkeypatch.setattr(runner, "_load_inputs", refused)
    assert MAX_TERMINAL_EXECUTIONS == 32
    for sequence in range(1, MAX_TERMINAL_EXECUTIONS + 7):
        assert demand(client, project, consumer, sequence).status_code == 200
        assert runner.run_once()
    with client.app.state.session_factory() as session:
        executions = list(session.scalars(select(LigandPropertyExecution)).all())
        assert len(executions) == MAX_TERMINAL_EXECUTIONS
        assert all(
            item.reaped
            and item.child_pid is None
            and item.child_start_token is None
            and item.group_confirmed is False
            for item in executions
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(LigandPropertyExecution)
                .where(LigandPropertyExecution.reaped.is_(False))
            )
            == 0
        )
        assert session.get(Job, seen[0]) is None and session.get(Job, seen[-1]) is not None
        assert session.scalar(select(func.count()).select_from(Job)) == MAX_TERMINAL_EXECUTIONS
    # Exercise the actual downgrade guard rather than merely assuming reaped rows suffice.
    import importlib.util

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text

    user_job = public_job(client, project)
    migration_path = (
        Path(__file__).resolve().parents[2]
        / "apps/api/migrations/versions/0017_ligand_properties.py"
    )
    spec = importlib.util.spec_from_file_location("preload_downgrade_0017", migration_path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with client.app.state.engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert connection.execute(text("SELECT id FROM jobs")).scalars().all() == [user_job]


@pytest.mark.usefixtures("no_child_or_signal")
@pytest.mark.parametrize("retirement", ["consumer", "cancel_requested"])
def test_retired_preload_refusal_is_cancelled_without_failing_unrelated_demand(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, retirement: str
) -> None:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    other = imported(client)
    runner = worker(client)
    captured: list[PropertyAttempt] = []
    other_consumers: list[str] = []

    def retired(session: Any, service: Any, job: Job) -> None:
        captured.append(PropertyAttempt.capture(job, runner.worker_id))
        other_consumer = allocate(client, other)
        other_consumers.append(other_consumer)
        assert demand(client, other, other_consumer).status_code == 200
        if retirement == "consumer":
            response = client.delete(
                f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
                params={"sequence": 2},
            )
            assert response.status_code == 200
        else:
            job.cancellation_requested = True
            session.commit()
        raise ValueError("Input refusal after captured ownership retired")

    monkeypatch.setattr(runner, "_load_inputs", retired)
    assert runner.run_once() and len(captured) == 1
    with client.app.state.session_factory() as session:
        job = session.get(Job, captured[0].job_id)
        assert job.status == "cancelled" and job.error is None
        assert session.get(LigandPropertyExecution, captured[0].execution_id).reaped
        assert session.get(LigandPropertyConsumer, other_consumers[0]).failures == {}
        next_job = LigandPropertyService(session, runner.settings).materialize("next-owner")
        assert isinstance(next_job, Job) and next_job.id != job.id
    assert read(client, other).json()["entries"][0]["status"] == "pending"


@pytest.mark.usefixtures("no_child_or_signal")
@pytest.mark.parametrize("terminal", ["completed", "failed", "cancelled"])
def test_already_terminal_never_started_capture_preserves_authority_and_can_be_reaped(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, terminal: str
) -> None:
    project = imported(client)
    assert demand(client, project, allocate(client, project)).status_code == 200
    runner = worker(client)
    expected: list[dict[str, Any]] = []
    captured: list[PropertyAttempt] = []

    def authoritative_terminal(session: Any, service: Any, job: Job) -> None:
        captured.append(PropertyAttempt.capture(job, runner.worker_id))
        job.status = terminal
        job.status_message = "Preserve an already terminal authority"
        job.result_values = {"authoritative": 7}
        job.error = {"code": "preserve", "message": "Existing terminal result"}
        job.completed_at = utc_now()
        session.commit()
        expected.extend(rows(client)["jobs"])
        raise ValueError("Late input refusal cannot replace terminal state")

    monkeypatch.setattr(runner, "_load_inputs", authoritative_terminal)
    assert runner.run_once()
    assert rows(client)["jobs"] == expected
    with client.app.state.session_factory() as session:
        assert session.get(LigandPropertyExecution, captured[0].execution_id).reaped


@pytest.mark.usefixtures("no_child_or_signal")
@pytest.mark.parametrize(
    "replacement",
    ["worker", "parameters", "execution", "project", "job_absent", "execution_absent"],
)
def test_preload_refusal_does_not_mutate_replaced_foreign_or_deleted_captures(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, replacement: str
) -> None:
    project = imported(client)
    assert demand(client, project, allocate(client, project)).status_code == 200
    foreign = imported(client)
    runner = worker(client)
    expected: dict[str, list[dict[str, Any]]] = {}

    def replaced(session: Any, service: Any, job: Job) -> None:
        execution = session.get(LigandPropertyExecution, job.parameters["execution_id"])
        if replacement == "worker":
            job.worker_id = "another-worker"
        elif replacement == "parameters":
            job.parameters = {**job.parameters, "foreign": True}
        elif replacement == "execution":
            execution.id = str(uuid4())
            job.parameters = {"execution_id": execution.id}
        elif replacement == "project":
            job.project_id = foreign["id"]
        elif replacement == "job_absent":
            session.delete(job)
        else:
            session.delete(execution)
        session.commit()
        expected.update(rows(client))
        raise ValueError("Failure belongs to the prior captured attempt")

    monkeypatch.setattr(runner, "_load_inputs", replaced)
    assert runner.run_once()
    assert rows(client) == expected


@pytest.mark.usefixtures("no_child_or_signal")
@pytest.mark.parametrize("metadata", ["pid", "start_token", "group", "all"])
def test_preload_refusal_never_reaps_unexpected_process_metadata(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, metadata: str
) -> None:
    project = imported(client)
    assert demand(client, project, allocate(client, project)).status_code == 200
    runner = worker(client)
    expected: dict[str, list[dict[str, Any]]] = {}

    def process_already_recorded(session: Any, service: Any, job: Job) -> None:
        execution = session.get(LigandPropertyExecution, job.parameters["execution_id"])
        if metadata in {"pid", "all"}:
            execution.child_pid = 987654321
        if metadata in {"start_token", "all"}:
            execution.child_start_token = "requires-verified-recovery"
        if metadata in {"group", "all"}:
            execution.group_confirmed = True
        session.commit()
        expected.update(rows(client))
        raise ValueError("A missing local process object is not never-started proof")

    monkeypatch.setattr(runner, "_load_inputs", process_already_recorded)
    assert runner.run_once()
    assert rows(client) == expected
    assert all(not row["reaped"] for row in expected["executions"])


@pytest.mark.usefixtures("no_child_or_signal")
@pytest.mark.parametrize("replacement", ["worker", "execution", "process"])
def test_terminalization_commit_does_not_authorize_reaping_a_later_replacement(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, replacement: str
) -> None:
    project = imported(client)
    assert demand(client, project, allocate(client, project)).status_code == 200
    runner = worker(client)
    original = JobService.terminalize_property_attempt
    expected: dict[str, list[dict[str, Any]]] = {}

    def terminalized_then_replaced(service: Any, attempt: PropertyAttempt, *args: Any) -> Any:
        result = original(service, attempt, *args)
        with client.app.state.session_factory() as session:
            job = session.get(Job, attempt.job_id)
            execution = session.get(LigandPropertyExecution, attempt.execution_id)
            if replacement == "worker":
                job.worker_id = "replacement-after-terminalization"
            elif replacement == "execution":
                execution.id = str(uuid4())
                job.parameters = {"execution_id": execution.id}
            else:
                execution.child_pid = 987654321
            session.commit()
        expected.update(rows(client))
        return result

    def refused(*args: Any, **kwargs: Any) -> None:
        raise ValueError("Controlled pre-launch refusal")

    monkeypatch.setattr(JobService, "terminalize_property_attempt", terminalized_then_replaced)
    monkeypatch.setattr(runner, "_load_inputs", refused)
    assert runner.run_once()
    assert rows(client) == expected
    assert all(not row["reaped"] for row in expected["executions"])


@pytest.mark.usefixtures("no_child_or_signal")
def test_already_reaped_never_started_failure_does_not_become_false_cancelled(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = imported(client)
    assert demand(client, project, allocate(client, project)).status_code == 200
    runner = worker(client)

    def recovered_then_refused(session: Any, service: Any, job: Job) -> None:
        session.get(LigandPropertyExecution, job.parameters["execution_id"]).reaped = True
        session.commit()
        raise ValueError("Wanted but already recovered before input materialization")

    monkeypatch.setattr(runner, "_load_inputs", recovered_then_refused)
    assert runner.run_once()
    with client.app.state.session_factory() as session:
        job = session.scalar(select(Job).where(Job.purpose == "ligand_properties"))
        assert job.status == "failed" and job.error["code"] == "invalid_input_artifact"
        assert session.get(LigandPropertyExecution, job.parameters["execution_id"]).reaped


@pytest.mark.usefixtures("no_child_or_signal")
@pytest.mark.parametrize("refusal", ["version", "inputs"])
def test_ordinary_job_refusal_keeps_its_existing_failure_semantics(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, refusal: str
) -> None:
    project = imported(client)
    job_id = public_job(client, project)
    runner = worker(client)

    def private_finalization_forbidden(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("An ordinary job has no private capture to reap")

    monkeypatch.setattr(runner, "_fail_unstarted_property_attempt", private_finalization_forbidden)
    if refusal == "version":
        original_get = runner.registry.get

        def mismatch(job_type: str) -> Any:
            registered = original_get(job_type)
            return replace(
                registered,
                definition=replace(registered.definition, implementation_version="other-version"),
            )

        monkeypatch.setattr(runner.registry, "get", mismatch)
        expected_code = "implementation_version_unavailable"
    else:

        def refused(*args: Any, **kwargs: Any) -> None:
            raise ValueError("Controlled ordinary input refusal")

        monkeypatch.setattr(runner, "_load_inputs", refused)
        expected_code = "invalid_input_artifact"
    assert runner.run_once()
    result = client.get(f"/api/v1/jobs/{job_id}").json()
    assert result["status"] == "failed" and result["error"]["code"] == expected_code
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(LigandPropertyExecution)) == 0
