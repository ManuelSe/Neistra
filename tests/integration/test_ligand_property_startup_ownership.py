"""Private startup refusal terminates its own durable attempt and owned child only."""

from __future__ import annotations

from collections import deque
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest
from neistra_api import job_worker as worker_module
from neistra_api import ligand_property_process as process_module
from neistra_api.ligand_property_process import PropertyAttempt, process_identity
from neistra_api.ligand_property_service import LigandPropertyService
from neistra_api.models import Job, LigandPropertyConsumer, LigandPropertyExecution
from sqlalchemy import select

from tests.integration.test_ligand_property_lifecycle import (
    allocate,
    demand,
    imported,
    read,
    worker,
)
from tests.support.api_client import ApiClient


def claimed(client: ApiClient) -> tuple[dict[str, Any], str, Job, tuple[Any, ...]]:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    with client.app.state.session_factory() as session:
        service = LigandPropertyService(session, client.app.state.settings)
        job = service.materialize("property-test-worker")
        assert isinstance(job, Job)
        inputs = service.execution_inputs(job)
    return project, consumer, job, inputs


def release(client: ApiClient, project: dict[str, Any], consumer: str) -> None:
    reply = client.delete(
        f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
        params={"sequence": 2},
    )
    assert reply.status_code == 200, reply.text


class StartupProcess:
    pid = 987654321  # Deliberately not a real /proc identity.
    exitcode = None

    def __init__(self, started: Any = None) -> None:
        self.alive = False
        self.started = started
        self.joins = 0
        self.terminated = 0
        self.on_terminate: Any = None

    def start(self) -> None:
        self.alive = True
        if self.started is not None:
            self.started()

    def is_alive(self) -> bool:
        return self.alive

    def terminate(self) -> None:
        if self.on_terminate is not None:
            callback, self.on_terminate = self.on_terminate, None
            callback()
        self.terminated += 1
        self.alive = False
        self.exitcode = -15

    def join(self, timeout: float) -> None:
        assert timeout <= 2
        self.joins += 1


class StartupPipe:
    def __init__(self, process: StartupProcess, sent: Any = None) -> None:
        self.messages: deque[tuple[Any, ...]] = deque([("process_group", process.pid)])
        self.controls: list[tuple[Any, ...]] = []
        self.sent = sent
        self.on_poll: Any = None

    def poll(self, timeout: float = 0) -> bool:
        if self.on_poll is not None:
            callback, self.on_poll = self.on_poll, None
            callback()
        return bool(self.messages)

    def recv(self) -> tuple[Any, ...]:
        return self.messages.popleft()

    def send(self, message: tuple[Any, ...]) -> None:
        self.controls.append(message)
        if self.sent is not None:
            self.sent(message, self)

    def close(self) -> None:
        pass


def fake_startup(
    monkeypatch: pytest.MonkeyPatch, *, started: Any = None, sent: Any = None
) -> tuple[StartupProcess, StartupPipe, list[int]]:
    process = StartupProcess(started)
    pipe = StartupPipe(process, sent)
    context = SimpleNamespace(
        Pipe=lambda **kwargs: (pipe, SimpleNamespace(close=lambda: None)),
        Process=lambda **kwargs: process,
    )
    monkeypatch.setattr(worker_module.multiprocessing, "get_context", lambda method: context)
    signals: list[int] = []

    def group_signal(pid: int, signal: int) -> None:
        signals.append(pid)
        process.alive = False
        process.exitcode = -signal

    monkeypatch.setattr(worker_module.os, "killpg", group_signal)
    return process, pipe, signals


def test_active_registration_refusal_is_durable_and_unblocks_next_real_admission(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, consumer, job, inputs = claimed(client)
    next_project = imported(client)
    next_consumer = allocate(client, next_project)
    assert demand(client, next_project, next_consumer).status_code == 200
    process, pipe, signals = fake_startup(monkeypatch)
    worker(client)._run_claimed(job, inputs)  # Actual record_process refuses the missing /proc PID.
    assert process.terminated and process.joins and not process.alive
    assert not signals and not pipe.controls  # An unconfirmed candidate is never group authority.
    with client.app.state.session_factory() as session:
        current = session.get(Job, job.id)
        execution = session.get(LigandPropertyExecution, job.parameters["execution_id"])
        assert current.status == "failed" and current.completed_at is not None
        assert current.error["code"] == "descriptor_startup_ownership_failed"
        assert execution.reaped and execution.child_pid is None and not execution.group_confirmed
        assert session.get(LigandPropertyConsumer, consumer).failures
    assert read(client, project).json()["entries"][0]["status"] == "failed"
    assert read(client, next_project).json()["entries"][0]["status"] == "pending"
    with client.app.state.session_factory() as session:
        assert session.get(LigandPropertyConsumer, next_consumer).failures == {}
        next_job = LigandPropertyService(session, client.app.state.settings).materialize("next")
        assert isinstance(next_job, Job) and next_job.id != job.id


@pytest.mark.parametrize("stage", ["before_spawn", "before_group", "after_registration"])
def test_retired_startup_never_receives_calculation_permission(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, stage: str
) -> None:
    project, consumer, job, inputs = claimed(client)
    process, pipe, signals = fake_startup(
        monkeypatch,
        started=(lambda: release(client, project, consumer)) if stage == "before_group" else None,
    )
    if stage == "before_spawn":
        release(client, project, consumer)
    if stage == "after_registration":
        monkeypatch.setattr(
            process_module, "process_identity", lambda pid: ("owned-start", pid, "S")
        )
        original = process_module.record_process

        def registered_then_retired(*args: Any, **kwargs: Any) -> None:
            original(*args, **kwargs)
            release(client, project, consumer)

        monkeypatch.setattr(process_module, "record_process", registered_then_retired)
    worker(client)._run_claimed(job, inputs)
    assert not pipe.controls  # Neither ACK nor a pre-ACK cancel can grant startup permission.
    assert not process.alive
    if stage != "after_registration":
        assert not signals
    else:
        assert signals and all(pid == process.pid for pid in signals)
    with client.app.state.session_factory() as session:
        assert session.get(Job, job.id).status == "cancelled"
        assert session.get(LigandPropertyExecution, job.parameters["execution_id"]).reaped


def test_ack_precedes_later_cancel_and_delayed_ack_cannot_reset_wall_budget(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, consumer, job, inputs = claimed(client)

    def control(message: tuple[Any, ...], pipe: StartupPipe) -> None:
        if message == ("coordinator_ready",):
            pipe.on_poll = lambda: release(client, project, consumer)
        elif message == ("cancel",):
            pipe.messages.append(("cancelled", "Stopped after ACK"))

    process, pipe, signals = fake_startup(monkeypatch, sent=control)
    monkeypatch.setattr(process_module, "process_identity", lambda pid: ("owned-start", pid, "S"))
    worker(client)._run_claimed(job, inputs)
    assert pipe.controls == [("coordinator_ready",), ("cancel",)]
    assert signals and not process.alive
    with client.app.state.session_factory() as session:
        assert session.get(Job, job.id).status == "cancelled"


def test_expired_original_wall_deadline_refuses_ack(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, _, job, inputs = claimed(client)
    _, pipe, _ = fake_startup(monkeypatch)
    monkeypatch.setattr(process_module, "process_identity", lambda pid: ("owned-start", pid, "S"))
    clock = [0.0]
    monkeypatch.setattr(worker_module, "time", SimpleNamespace(monotonic=lambda: clock[0]))
    original = process_module.record_process

    def delayed_registration(*args: Any, **kwargs: Any) -> None:
        original(*args, **kwargs)
        clock[0] = 31.0  # Existing descriptor wall budget remains30s.

    monkeypatch.setattr(process_module, "record_process", delayed_registration)
    worker(client)._run_claimed(job, inputs)
    assert not pipe.controls
    with client.app.state.session_factory() as session:
        current = session.get(Job, job.id)
        assert current.status == "failed" and current.error["code"] == "wall_time_exceeded"


@pytest.mark.parametrize(
    "replacement",
    [
        "completed",
        "failed",
        "cancelled",
        "worker",
        "parameters",
        "execution",
        "job_absent",
        "execution_absent",
    ],
)
def test_refusal_and_late_frames_cannot_mutate_a_replaced_attempt(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, replacement: str
) -> None:
    _, _, job, inputs = claimed(client)
    attempt = PropertyAttempt.capture(job, job.worker_id)
    process, pipe, signals = fake_startup(monkeypatch)
    expected: dict[str, Any] = {}

    def authoritative_change_after_refusal() -> None:
        with client.app.state.session_factory() as session:
            current = session.get(Job, job.id)
            execution = session.get(LigandPropertyExecution, attempt.execution_id)
            if replacement in {"completed", "failed", "cancelled"}:
                current.status = replacement
                current.status_message = "New authoritative state"
                current.result_values = {"preserve": 7}
            elif replacement == "worker":
                current.worker_id = "replacement-worker"
            elif replacement == "parameters":
                current.parameters = {"execution_id": attempt.execution_id, "unexpected": True}
            elif replacement == "execution":
                new_id = str(uuid4())
                execution.id = new_id
                current.parameters = {"execution_id": new_id}
            elif replacement == "job_absent":
                session.delete(current)
            elif replacement == "execution_absent":
                session.delete(execution)
            session.commit()
            expected["jobs"] = list(session.execute(select(Job.__table__)).mappings())
            expected["executions"] = list(
                session.execute(select(LigandPropertyExecution.__table__)).mappings()
            )
            expected["consumers"] = list(
                session.execute(select(LigandPropertyConsumer.__table__)).mappings()
            )

    def refused(*args: Any, **kwargs: Any) -> None:
        raise ValueError("Held registration refusal")

    process.on_terminate = authoritative_change_after_refusal
    monkeypatch.setattr(process_module, "record_process", refused)
    runner = worker(client)
    runner._run_claimed(job, inputs)
    assert not signals and not pipe.controls
    for _ in range(2):
        assert runner._handle_message(
            job.id, ("error", {"code": "late", "message": "late"}), attempt=attempt
        )
        runner._terminalize_property_attempt(attempt, "late", "late")
        runner._reap_property_attempt(attempt)
    with client.app.state.session_factory() as session:
        assert list(session.execute(select(Job.__table__)).mappings()) == expected["jobs"]
        actual = list(session.execute(select(LigandPropertyExecution.__table__)).mappings())
        wanted = [dict(row) for row in expected["executions"]]
        if replacement in {"completed", "failed", "cancelled"}:
            for row in wanted:
                row["reaped"] = True  # Same captured terminal execution may be reaped.
        assert actual == wanted
        assert (
            list(session.execute(select(LigandPropertyConsumer.__table__)).mappings())
            == expected["consumers"]
        )


def _permission_observed_child(marker: str, *args: Any) -> None:
    from neistra_api import job_worker as module

    def denied(*args: Any) -> None:
        Path(marker).write_text("calculation permission reached")
        raise AssertionError("A retired/refused startup must not enter resource/plugin startup")

    module._apply_resource_limits = denied
    module._execute_child(*args)


@pytest.mark.parametrize("refusal", ["active_identity", "retired_after_registration"])
def test_real_spawn_refusal_reaps_positive_pid_without_entering_plugin_startup(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, refusal: str
) -> None:
    project, consumer, job, inputs = claimed(client)
    original_context = worker_module.multiprocessing.get_context("spawn")
    marker = tmp_path / "permission.txt"
    spawned: list[Any] = []

    def process(**kwargs: Any) -> Any:
        kwargs["target"] = _permission_observed_child
        kwargs["args"] = (str(marker), *kwargs["args"])
        child = original_context.Process(**kwargs)
        spawned.append(child)
        return child

    monkeypatch.setattr(
        worker_module.multiprocessing,
        "get_context",
        lambda method: SimpleNamespace(Pipe=original_context.Pipe, Process=process),
    )
    original = process_module.record_process
    original_signal = worker_module.os.killpg

    def confirmed_group_only(pid: int, signal: int) -> None:
        assert refusal == "retired_after_registration"
        with client.app.state.session_factory() as session:
            owned = session.get(LigandPropertyExecution, job.parameters["execution_id"])
            assert owned.group_confirmed and owned.child_pid == pid
        original_signal(pid, signal)

    monkeypatch.setattr(worker_module.os, "killpg", confirmed_group_only)

    def registration(*args: Any, **kwargs: Any) -> None:
        if refusal == "active_identity":
            raise ValueError("Independent startup identity refusal")
        original(*args, **kwargs)
        release(client, project, consumer)

    monkeypatch.setattr(process_module, "record_process", registration)
    runner = worker(client)
    runner._run_claimed(job, inputs)
    assert len(spawned) == 1
    assert spawned[0].exitcode is not None and not spawned[0].is_alive()
    assert process_identity(spawned[0].pid) is None
    assert not marker.exists()
    assert not (client.app.state.settings.data_dir / "work/jobs" / job.id).exists()
    with client.app.state.session_factory() as session:
        assert session.get(Job, job.id).status == (
            "failed" if refusal == "active_identity" else "cancelled"
        )
        assert session.get(LigandPropertyExecution, job.parameters["execution_id"]).reaped
    monkeypatch.undo()
    assert runner.recover_abandoned() == 0
    next_project = imported(client)
    next_consumer = allocate(client, next_project)
    assert demand(client, next_project, next_consumer).status_code == 200
    assert runner.run_once()  # Actual next scientific child, after refused startup cleanup.
    assert read(client, next_project).json()["entries"][0]["status"] == "ready"


@pytest.mark.parametrize("frames", [[("cancel",)], [("coordinator_ready",), ("cancel",)]])
def test_child_early_stop_never_enters_resource_or_registry_startup(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, frames: list[tuple[str]]
) -> None:
    pending = deque(frames)
    outputs: list[Any] = []
    entered: list[bool] = []
    connection = SimpleNamespace(
        poll=lambda *args: bool(pending),
        recv=lambda: pending.popleft(),
        send=outputs.append,
        close=lambda: None,
    )
    monkeypatch.setattr(
        worker_module, "os", SimpleNamespace(name="posix", setsid=lambda: None, getpid=lambda: 123)
    )
    monkeypatch.setattr(worker_module, "_apply_resource_limits", lambda *args: entered.append(True))
    worker_module._execute_child(
        connection, (), (), "ligand.properties", "irrelevant", {}, (), str(tmp_path), 1, 1
    )
    assert not entered
    assert outputs[0] == ("process_group", 123)
    assert any(frame[0] == "cancelled" for frame in outputs)


@pytest.mark.parametrize("replacement", ["active", "worker", "parameters", "execution", "terminal"])
def test_actual_result_validation_gap_preserves_replacement_attempt(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, replacement: str
) -> None:
    from neistra_api.models import LigandPropertyBinding, LigandPropertyContent

    from tests.integration.test_ligand_property_lifecycle import captured_result

    _, _, job, inputs = claimed(client)
    attempt = PropertyAttempt.capture(job, job.worker_id)
    values = captured_result(job.parameters, inputs)
    original_commit = LigandPropertyService._commit_derived
    expected: dict[str, Any] = {}
    held = False

    def validation_finished(self: LigandPropertyService) -> None:
        nonlocal held
        original_commit(self)
        if held:
            return
        held = True
        # This independent writer must succeed: report validation cannot hold a writer lock.
        with client.app.state.session_factory() as session:
            current = session.get(Job, job.id)
            if replacement == "worker":
                current.worker_id = "new-result-owner"
            elif replacement == "parameters":
                current.parameters = {"execution_id": attempt.execution_id, "new": True}
            elif replacement == "execution":
                execution = session.get(LigandPropertyExecution, attempt.execution_id)
                execution.id = str(uuid4())
                current.parameters = {"execution_id": execution.id}
            elif replacement == "terminal":
                current.status = "completed"
                current.status_message = "New terminal authority"
                current.result_values = {"new": 23}
            session.commit()
            expected["job"] = dict(session.execute(select(Job.__table__)).mappings().one())
            expected["consumers"] = list(
                session.execute(select(LigandPropertyConsumer.__table__)).mappings()
            )

    monkeypatch.setattr(LigandPropertyService, "_commit_derived", validation_finished)
    result = SimpleNamespace(artifacts=(), values=values, warnings=(), message="Actual ready")
    assert worker(client)._handle_message(job.id, ("result", result), attempt=attempt)
    assert held
    with client.app.state.session_factory() as session:
        current = dict(session.execute(select(Job.__table__)).mappings().one())
        if replacement == "active":
            assert current["status"] == "completed"
            assert session.scalar(select(LigandPropertyBinding)) is not None
            assert session.scalar(select(LigandPropertyContent)) is not None
        else:
            assert current == expected["job"]
            assert session.scalar(select(LigandPropertyBinding)) is None
            assert session.scalar(select(LigandPropertyContent)) is None
        assert (
            list(session.execute(select(LigandPropertyConsumer.__table__)).mappings())
            == expected["consumers"]
        )


def test_invalid_result_failure_fallback_preserves_reassigned_worker(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from copy import deepcopy

    from neistra_api.ligand_property_service import DescriptorReport

    from tests.integration.test_ligand_property_lifecycle import captured_result

    _, _, job, inputs = claimed(client)
    attempt = PropertyAttempt.capture(job, job.worker_id)
    values = deepcopy(captured_result(job.parameters, inputs))
    values["reports"][0]["report"]["input_hash"] = "invalid-digest"
    original_validate = DescriptorReport.model_validate
    expected: dict[str, Any] = {}

    def rejected_after_reassignment(cls: Any, value: Any, *args: Any, **kwargs: Any) -> Any:
        try:
            return original_validate(value, *args, **kwargs)
        except ValueError:
            with client.app.state.session_factory() as session:
                current = session.get(Job, job.id)
                current.worker_id = "new-owner-after-invalid-report"
                session.commit()
                expected["job"] = dict(session.execute(select(Job.__table__)).mappings().one())
                expected["consumers"] = list(
                    session.execute(select(LigandPropertyConsumer.__table__)).mappings()
                )
            raise

    monkeypatch.setattr(
        DescriptorReport, "model_validate", classmethod(rejected_after_reassignment)
    )
    result = SimpleNamespace(artifacts=(), values=values, warnings=(), message="Invalid report")
    assert worker(client)._handle_message(job.id, ("result", result), attempt=attempt)
    assert expected
    with client.app.state.session_factory() as session:
        assert dict(session.execute(select(Job.__table__)).mappings().one()) == expected["job"]
        assert (
            list(session.execute(select(LigandPropertyConsumer.__table__)).mappings())
            == expected["consumers"]
        )


def test_wanted_already_reaped_startup_is_failed_instead_of_false_cancelled(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, _, job, inputs = claimed(client)
    with client.app.state.session_factory() as session:
        session.get(LigandPropertyExecution, job.parameters["execution_id"]).reaped = True
        session.commit()
    process, pipe, signals = fake_startup(monkeypatch)
    worker(client)._run_claimed(job, inputs)
    assert not process.alive and not process.joins  # No child was started.
    assert not signals and not pipe.controls
    with client.app.state.session_factory() as session:
        current = session.get(Job, job.id)
        assert current.status == "failed"
        assert current.error["code"] == "descriptor_startup_ownership_failed"


@pytest.mark.parametrize("stage", ["before_frame", "before_direct_complete", "validation_gap"])
@pytest.mark.parametrize("wanted", [True, False])
def test_actual_recovery_refuses_reaped_result_and_admits_next_demand(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, stage: str, wanted: bool
) -> None:
    from neistra_api.job_service import JobService
    from neistra_api.ligand_property_process import recover_property_processes
    from neistra_api.models import LigandPropertyBinding, LigandPropertyContent

    from tests.integration.test_ligand_property_lifecycle import captured_result

    project, consumer, job, inputs = claimed(client)
    attempt = PropertyAttempt.capture(job, job.worker_id)
    values = captured_result(job.parameters, inputs)
    original_commit = LigandPropertyService._commit_derived
    recovered = False

    def recover_while_job_is_running() -> None:
        nonlocal recovered
        assert not recovered
        with client.app.state.session_factory() as session:
            recover_property_processes(session)  # Real recovery stage, no synthetic reaped SQL.
            assert session.get(LigandPropertyExecution, attempt.execution_id).reaped
            assert session.get(Job, job.id).status == "running"
        recovered = True
        if not wanted:
            release(client, project, consumer)

    def validation_finished(service: LigandPropertyService) -> None:
        original_commit(service)
        if not recovered:
            recover_while_job_is_running()

    if stage == "validation_gap":
        monkeypatch.setattr(LigandPropertyService, "_commit_derived", validation_finished)
    else:
        recover_while_job_is_running()
    result = SimpleNamespace(artifacts=(), values=values, warnings=(), message="Reaped result")
    if stage == "before_direct_complete":
        with client.app.state.session_factory() as session:
            JobService(session, client.app.state.settings, client.app.state.job_registry).complete(
                job.id, (), values, [], "Reaped result", property_attempt=attempt
            )
    else:
        assert worker(client)._handle_message(job.id, ("result", result), attempt=attempt)
    assert recovered
    with client.app.state.session_factory() as session:
        current = session.get(Job, job.id)
        assert current.status == ("failed" if wanted else "cancelled")
        assert current.completed_at is not None
        if wanted:
            assert current.error["code"] == "descriptor_execution_reaped"
        else:
            assert current.error is None
        assert session.get(LigandPropertyExecution, attempt.execution_id).reaped
        assert session.scalar(select(LigandPropertyContent)) is None
        assert session.scalar(select(LigandPropertyBinding)) is None
    monkeypatch.undo()
    next_project = imported(client)
    next_consumer = allocate(client, next_project)
    assert demand(client, next_project, next_consumer).status_code == 200
    assert worker(client).run_once()  # A real subsequent child is admitted and finishes.
    assert read(client, next_project).json()["entries"][0]["status"] == "ready"


@pytest.mark.parametrize(
    "replacement",
    ["worker", "parameters", "execution", "terminal", "job_absent", "execution_absent"],
)
def test_actual_recovery_in_validation_gap_preserves_replacement_or_deleted_attempt(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, replacement: str
) -> None:
    from neistra_api.ligand_property_process import recover_property_processes
    from neistra_api.models import LigandPropertyBinding, LigandPropertyContent

    from tests.integration.test_ligand_property_lifecycle import captured_result

    _, _, job, inputs = claimed(client)
    attempt = PropertyAttempt.capture(job, job.worker_id)
    values = captured_result(job.parameters, inputs)
    original_commit = LigandPropertyService._commit_derived
    expected: dict[str, Any] = {}

    def validation_finished(service: LigandPropertyService) -> None:
        original_commit(service)
        if expected:
            return
        with client.app.state.session_factory() as session:
            recover_property_processes(session)
            current = session.get(Job, job.id)
            execution = session.get(LigandPropertyExecution, attempt.execution_id)
            assert current.status == "running" and execution.reaped
            if replacement == "worker":
                current.worker_id = "owner-after-real-recovery"
            elif replacement == "parameters":
                current.parameters = {"execution_id": attempt.execution_id, "new": True}
            elif replacement == "execution":
                execution.id = str(uuid4())
                current.parameters = {"execution_id": execution.id}
            elif replacement == "terminal":
                current.status = "completed"
                current.result_values = {"authoritative": 47}
            elif replacement == "job_absent":
                session.delete(current)
            elif replacement == "execution_absent":
                session.delete(execution)
            session.commit()
            for name, model in (
                ("jobs", Job),
                ("executions", LigandPropertyExecution),
                ("consumers", LigandPropertyConsumer),
            ):
                expected[name] = list(session.execute(select(model.__table__)).mappings())

    monkeypatch.setattr(LigandPropertyService, "_commit_derived", validation_finished)
    result = SimpleNamespace(
        artifacts=(), values=values, warnings=(), message="Old recovered result"
    )
    assert worker(client)._handle_message(job.id, ("result", result), attempt=attempt)
    assert expected
    with client.app.state.session_factory() as session:
        for name, model in (
            ("jobs", Job),
            ("executions", LigandPropertyExecution),
            ("consumers", LigandPropertyConsumer),
        ):
            assert list(session.execute(select(model.__table__)).mappings()) == expected[name]
        assert session.scalar(select(LigandPropertyContent)) is None
        assert session.scalar(select(LigandPropertyBinding)) is None
