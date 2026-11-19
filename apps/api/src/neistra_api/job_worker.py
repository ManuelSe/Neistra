from __future__ import annotations

import hashlib
import io
import multiprocessing
import os
import shutil
import signal
import time
import traceback
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass
from multiprocessing.connection import Connection
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from neistra_core.jobs import (
    InputArtifact,
    JobCancelled,
    PluginRegistry,
    ResultArtifact,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session, sessionmaker

    from neistra_api.import_export import ArtifactService
    from neistra_api.job_service import JobService
    from neistra_api.ligand_property_process import PropertyAttempt
    from neistra_api.models import Job
    from neistra_api.settings import Settings


@dataclass(frozen=True, slots=True)
class ChildInput:
    entry_id: str
    entry_name: str
    structure_type: str
    role: str
    artifact_id: str
    sha256: str
    media_type: str
    filename: str
    data: bytes


class _PipeWriter(io.TextIOBase):
    def __init__(self, connection: Connection, stream: str) -> None:
        self.connection = connection
        self.stream = stream
        self._buffer = ""

    def write(self, value: str) -> int:
        self._buffer += value
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            if line:
                self.connection.send(("log", self.stream, line))
        return len(value)

    def writable(self) -> bool:
        return True

    def flush(self) -> None:
        if self._buffer:
            self.connection.send(("log", self.stream, self._buffer))
            self._buffer = ""


class _ChildContext:
    def __init__(
        self, connection: Connection, work_directory: Path, cache_directory: Path | None = None
    ) -> None:
        self.connection = connection
        self.work_directory = work_directory
        self.cache_directory = cache_directory
        self._cancelled = False
        self.parent_lost = False

    def is_cancelled(self) -> bool:
        try:
            while self.connection.poll():
                message = self.connection.recv()
                if message == ("cancel",):
                    self._cancelled = True
        except (EOFError, OSError):
            self.parent_lost = True
            self._cancelled = True
        return self._cancelled

    def checkpoint(self) -> None:
        if self.is_cancelled():
            raise JobCancelled("Cancellation requested")

    def sleep(self, seconds: float) -> None:
        deadline = time.monotonic() + max(0.0, seconds)
        while time.monotonic() < deadline:
            self.checkpoint()
            time.sleep(min(0.05, deadline - time.monotonic()))
        self.checkpoint()

    def progress(self, value: float, message: str) -> None:
        self.checkpoint()
        self.connection.send(("progress", float(value), str(message)))

    def stdout(self, message: str) -> None:
        self.connection.send(("log", "stdout", str(message)))

    def stderr(self, message: str) -> None:
        self.connection.send(("log", "stderr", str(message)))

    def publish_artifact(
        self,
        *,
        role: str,
        filename: str,
        media_type: str,
        data: bytes,
        metadata: dict[str, Any] | None = None,
    ) -> ResultArtifact:
        self.checkpoint()
        return ResultArtifact(
            role=role,
            filename=filename,
            media_type=media_type,
            data=data,
            metadata=metadata or {},
        )


def _apply_resource_limits(cpu_time_seconds: int | None, memory_bytes: int | None) -> None:
    try:
        import resource
    except ImportError:
        return
    if cpu_time_seconds is not None:
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_time_seconds, cpu_time_seconds))
    if memory_bytes is not None:
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))


def process_tree_rss(pid: int) -> int:
    """Sample Linux resident memory, including native grandchildren, excluding zombies.

    Native minimization is Linux-qualified. This is a sampled budget, not an
    address-space ceiling or a hard cgroup allocation guarantee.
    """
    table: dict[int, tuple[int, int]] = {}
    for path in Path("/proc").glob("[0-9]*/status"):
        try:
            fields = dict(line.split(":", 1) for line in path.read_text().splitlines())
            if not fields["State"].strip().startswith("Z"):
                table[int(path.parent.name)] = (
                    int(fields["PPid"]),
                    int(fields.get("VmRSS", "0 kB").split()[0]) * 1024,
                )
        except (OSError, ValueError, KeyError):
            continue
    members = {pid}
    while True:
        expanded = members | {child for child, (parent, _) in table.items() if parent in members}
        if expanded == members:
            return sum(table[child][1] for child in members if child in table)
        members = expanded


class ImplementationVersionUnavailable(RuntimeError):
    """The recorded calculation cannot run under a different implementation."""


def _execute_child(
    connection: Connection,
    allowlist: tuple[str, ...],
    targets: tuple[str, ...],
    job_type: str,
    implementation_version: str,
    parameters: dict[str, Any],
    child_inputs: tuple[ChildInput, ...],
    work_directory: str,
    cpu_time_seconds: int | None,
    memory_bytes: int | None,
    cache_directory: str | None = None,
) -> None:
    # Descendants of allowlisted native tools share the owned job process group.
    # Establish it before plugin loading; the parent only signals a confirmed group.
    grouped = os.name == "posix"
    if grouped:
        os.setsid()
    connection.send(("process_group", os.getpid() if grouped else None))
    stdout = _PipeWriter(connection, "stdout")
    stderr = _PipeWriter(connection, "stderr")
    context = _ChildContext(
        connection, Path(work_directory), Path(cache_directory) if cache_directory else None
    )
    try:
        if job_type == "ligand.properties":
            # No private calculation starts before its exact process group is durably owned.
            if not connection.poll(5) or connection.recv() != ("coordinator_ready",):
                raise JobCancelled("Descriptor coordinator ownership was not confirmed")
            context.checkpoint()
        # Bound native thread pools before registry imports initialize NumPy/BLAS.
        os.environ["OPENBLAS_NUM_THREADS"] = "1"
        os.environ["OMP_NUM_THREADS"] = "1"
        _apply_resource_limits(cpu_time_seconds, memory_bytes)
        registry = PluginRegistry.load(
            allowlist=allowlist,
            configured_targets=targets,
            discover_installed=True,
        )
        registered = registry.get(job_type)
        if registered.definition.implementation_version != implementation_version:
            raise ImplementationVersionUnavailable(
                "The recorded implementation is unavailable; resubmit the calculation."
            )
        validated = registered.definition.validate_parameters(parameters)
        inputs = tuple(
            InputArtifact(
                entry_id=item.entry_id,
                entry_name=item.entry_name,
                structure_type=item.structure_type,
                role=item.role,
                artifact_id=item.artifact_id,
                sha256=item.sha256,
                media_type=item.media_type,
                filename=item.filename,
                data=item.data,
            )
            for item in child_inputs
        )
        with redirect_stdout(stdout), redirect_stderr(stderr):
            result = registered.plugin.execute(job_type, validated, inputs, context)
            if job_type == "ligand.properties":
                import json

                if (
                    result.artifacts
                    or len(json.dumps(result.values, allow_nan=False).encode()) > 1024 * 1024
                ):
                    raise ValueError("Descriptor result exceeds its bounded content contract")
        stdout.flush()
        stderr.flush()
        connection.send(("result", result))
    except JobCancelled as error:
        stdout.flush()
        stderr.flush()
        connection.send(("cancelled", str(error)))
    except BaseException as error:
        stdout.flush()
        stderr.flush()
        connection.send(("log", "stderr", traceback.format_exc()))
        connection.send(
            (
                "error",
                {
                    "code": "implementation_version_unavailable"
                    if isinstance(error, ImplementationVersionUnavailable)
                    else "memory_allocation_failed"
                    if isinstance(error, MemoryError)
                    else "plugin_execution_failed",
                    "message": f"{type(error).__name__}: {error}",
                },
            )
        )
    finally:
        context.is_cancelled()  # Detect a lost coordinator even during error reporting.
        connection.close()
        if grouped and context.parent_lost:
            # Worker disappearance must not strand antechamber/sqm descendants.
            os.killpg(os.getpid(), signal.SIGKILL)


class JobWorker:
    def __init__(
        self,
        settings: Settings,
        session_factory: sessionmaker[Session],
        registry: PluginRegistry,
        worker_id: str,
    ) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self.registry = registry
        self.worker_id = worker_id
        self.property_metrics: dict[str, Any] = {}
        self._property_streak = 0
        self._active_property_streak = 0

    def recover_abandoned(self) -> int:
        from neistra_api.job_service import JobService

        with self.session_factory() as session:
            from neistra_api.ligand_property_process import recover_property_processes

            recover_property_processes(session)
            count = JobService(session, self.settings, self.registry).recover_abandoned()
            from neistra_api.ligand_property_service import LigandPropertyService

            LigandPropertyService(session, self.settings).prune_executions()
            session.commit()
            from neistra_api.ligand_property_cache import LigandPropertyCache, PropertyCacheError

            if session.bind is not None and session.bind.dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            try:
                LigandPropertyCache(session, self.settings.data_dir).cleanup_orphans()
                session.commit()
            except (PropertyCacheError, OSError) as error:
                import logging

                session.rollback()
                logging.getLogger(__name__).warning(
                    "Descriptor cache recovery unavailable: %s", error
                )
            return count

    def run_once(self) -> bool:
        from neistra_api.job_service import JobService
        from neistra_api.ligand_property_process import PropertyAttempt

        with self.session_factory() as session:
            service = JobService(session, self.settings, self.registry)
            from neistra_api.ligand_property_cache import PropertyCacheError
            from neistra_api.ligand_property_service import LigandPropertyService

            try:
                properties = LigandPropertyService(session, self.settings)
            except PropertyCacheError:
                properties = None
            job = None
            if self._property_streak >= 4:
                job = service.claim_next(self.worker_id)
                if job is not None:
                    self._property_streak = 0
            if job is None and properties is not None:
                try:
                    self.registry.get("ligand.properties")
                    implementation_enabled = True
                except KeyError:
                    implementation_enabled = False
                try:
                    derived = properties.materialize(
                        self.worker_id,
                        prefer_bulk=self._active_property_streak >= 4,
                        implementation_enabled=implementation_enabled,
                    )
                except PropertyCacheError as error:
                    session.rollback()
                    properties.fail_live_demands(str(error))
                    derived = True
                self.property_metrics = dict(properties.last_metrics)
                if derived is True or (derived is not None and derived is not False):
                    self._property_streak += 1
                    self._active_property_streak = (
                        0 if self._active_property_streak >= 4 else self._active_property_streak + 1
                    )
                    if derived is True:
                        return True
                    job = derived
            if job is None:
                job = service.claim_next(self.worker_id)
                self._property_streak = 0
            if job is None:
                return False
            attempt = (
                PropertyAttempt.capture(job, self.worker_id)
                if job.purpose == "ligand_properties"
                else None
            )
            if (
                self.registry.get(job.job_type).definition.implementation_version
                != job.implementation_version
            ):
                code = "implementation_version_unavailable"
                message = "The recorded implementation is unavailable; resubmit the calculation."
                if attempt is not None:
                    session.rollback()
                    self._fail_unstarted_property_attempt(attempt, code, message)
                else:
                    service.fail(job.id, code, message)
                return True
            try:
                child_inputs = self._load_inputs(session, service, job)
            except Exception as error:
                if attempt is not None:
                    session.rollback()
                    self._fail_unstarted_property_attempt(
                        attempt, "invalid_input_artifact", str(error)
                    )
                else:
                    service.fail(job.id, "invalid_input_artifact", str(error))
                return True
        self._run_claimed(job, child_inputs)
        return True

    def run_forever(self) -> None:
        self.recover_abandoned()
        while True:
            if not self.run_once():
                time.sleep(self.settings.job_worker_poll_seconds)

    def _load_inputs(
        self,
        session: Session,
        service: JobService,
        job: Job,
    ) -> tuple[ChildInput, ...]:
        from neistra_api.ligand_property_service import LigandPropertyService, private_execution

        if job.purpose == "ligand_properties":
            if private_execution(session, job) is None:
                raise ValueError("Derived execution has no private ownership")
            properties = LigandPropertyService(session, self.settings)
            inputs = properties.execution_inputs(job)
            self.property_metrics["input_materialization"] = dict(properties.last_metrics)
            return inputs
        artifact_service: ArtifactService = service.artifacts
        loaded: list[ChildInput] = []
        for item in sorted(job.inputs, key=lambda value: value.ordinal):
            _, data = artifact_service.read(item.artifact_id)
            digest = hashlib.sha256(data).hexdigest()
            if digest != item.artifact_sha256 or len(data) != item.artifact_size:
                raise ValueError(
                    f"Input artifact {item.artifact_id} no longer matches its snapshot"
                )
            loaded.append(
                ChildInput(
                    entry_id=item.entry_id,
                    entry_name=item.entry_name,
                    structure_type=item.structure_type,
                    role=item.role,
                    artifact_id=item.artifact_id,
                    sha256=item.artifact_sha256,
                    media_type=item.media_type,
                    filename=item.filename,
                    data=data,
                )
            )
        return tuple(loaded)

    def _property_attempt_state(
        self, session: Session, attempt: PropertyAttempt, *, serialized: bool = True
    ) -> Literal["active", "retired", "refused", "superseded"]:
        from neistra_api.ligand_property_service import LigandPropertyService, private_execution

        current = (attempt.locked_job if serialized else attempt.current_job)(session)
        if current is None or current.status != "running":
            return "superseded"
        execution = private_execution(session, current)
        if execution is None or execution.reaped:
            return "refused"
        if current.cancellation_requested or not LigandPropertyService(
            session, self.settings
        ).execution_live(current):
            return "retired"
        return "active"

    def _terminalize_property_attempt(
        self, attempt: PropertyAttempt, code: str, message: str
    ) -> None:
        from neistra_api.job_service import JobService

        with self.session_factory() as session:
            JobService(session, self.settings, self.registry).terminalize_property_attempt(
                attempt, code, message
            )

    def _reap_property_attempt(self, attempt: PropertyAttempt) -> None:
        from neistra_api.ligand_property_service import LigandPropertyService, private_execution

        with self.session_factory() as session:
            current = attempt.locked_job(session)
            if current is None:
                return
            execution = private_execution(session, current)
            if execution is not None and execution.id == attempt.execution_id:
                execution.reaped = True
                LigandPropertyService(session, self.settings).prune_executions()
                session.commit()

    def _fail_unstarted_property_attempt(
        self, attempt: PropertyAttempt, code: str, message: str
    ) -> None:
        """Close this never-started capture without replacing newer job authority."""
        from neistra_api.job_service import JobService
        from neistra_api.ligand_property_service import LigandPropertyService, private_execution

        with self.session_factory() as session:
            current = attempt.locked_job(session)
            if current is None:
                return
            execution = private_execution(session, current)
            if (
                execution is None
                or execution.child_pid is not None
                or execution.child_start_token is not None
                or execution.group_confirmed is not False
            ):
                return
            JobService(session, self.settings, self.registry).terminalize_property_attempt(
                attempt, code, message
            )
            # Terminalization commits. Reacquire the writer and refresh ownership
            # before pruning; a later replacement never inherits this refusal.
            session.rollback()  # Close any read opened while returning the terminal job.
            current = attempt.locked_job(session)
            if current is None or current.status not in {"completed", "failed", "cancelled"}:
                return
            execution = private_execution(session, current)
            if (
                execution is None
                or execution.child_pid is not None
                or execution.child_start_token is not None
                or execution.group_confirmed is not False
            ):
                return
            execution.reaped = True
            LigandPropertyService(session, self.settings).prune_executions()
            session.commit()

    def _run_claimed(self, job: Job, child_inputs: tuple[ChildInput, ...]) -> None:
        from neistra_api.job_service import JobService
        from neistra_api.ligand_property_process import PropertyAttempt

        attempt = (
            PropertyAttempt.capture(job, self.worker_id)
            if job.purpose == "ligand_properties"
            else None
        )
        if attempt is not None:
            with self.session_factory() as session:
                state = self._property_attempt_state(session, attempt)
            if state != "active":
                self._terminalize_property_attempt(
                    attempt,
                    "descriptor_startup_ownership_failed",
                    "Descriptor startup attempt is no longer available",
                )
                self._reap_property_attempt(attempt)
                return
        registered = self.registry.get(job.job_type)
        policy = registered.definition.resources
        work_directory = self.settings.data_dir / "work" / "jobs" / job.id
        shutil.rmtree(work_directory, ignore_errors=True)
        work_directory.mkdir(parents=True, exist_ok=False)
        parent, child = multiprocessing.get_context("spawn").Pipe(duplex=True)
        process = multiprocessing.get_context("spawn").Process(
            target=_execute_child,
            args=(
                child,
                self.settings.job_plugin_allowlist,
                self.settings.job_plugin_targets,
                job.job_type,
                job.implementation_version,
                job.parameters,
                child_inputs,
                str(work_directory),
                policy.cpu_time_seconds,
                policy.memory_bytes,
                str(self.settings.data_dir / "cache"),
            ),
            daemon=False,
        )
        process.start()
        process_id = process.pid
        assert process_id is not None
        child.close()
        started = time.monotonic()
        cancel_sent_at: float | None = None
        terminal_received = False
        process_group: int | None = None
        pipe_closed = False
        peak_rss = 0

        def finish(code: str, message: str, *, cancelled: bool = False) -> None:
            if attempt is not None:
                self._terminalize_property_attempt(attempt, code, message)
            else:
                with self.session_factory() as session:
                    service = JobService(session, self.settings, self.registry)
                    if cancelled:
                        service.cancelled(job.id, message)
                    else:
                        service.fail(job.id, code, message)

        def stop_tree() -> None:
            if process_group is not None:
                try:
                    os.killpg(process_group, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            elif process.is_alive():
                process.terminate()

        try:
            while process.is_alive() or (not pipe_closed and parent.poll()):
                while not pipe_closed and parent.poll(0.02):
                    try:
                        message = parent.recv()
                    except EOFError:
                        pipe_closed = True
                        break
                    if message[0] == "process_group":
                        candidate = message[1]
                        if attempt is not None:
                            from neistra_api.ligand_property_process import record_process

                            try:
                                if candidate != process_id:
                                    raise ValueError(
                                        "Descriptor child group did not match its process"
                                    )
                                with self.session_factory() as session:
                                    state = self._property_attempt_state(session, attempt)
                                    if state != "active":
                                        raise ValueError("Descriptor startup attempt was retired")
                                    record_process(session, job.id, process_id, attempt=attempt)
                                # Signal authority follows positive registration.
                                process_group = process_id
                                with self.session_factory() as session:
                                    state = self._property_attempt_state(session, attempt)
                                    if state != "active":
                                        raise ValueError("Descriptor startup attempt was retired")
                                    if time.monotonic() - started > policy.wall_time_seconds:
                                        raise TimeoutError(
                                            "Descriptor startup exceeded its wall budget"
                                        )
                                    # Serialize ACK ahead of any subsequent cancellation controls.
                                    parent.send(("coordinator_ready",))
                            except (ValueError, TimeoutError, BrokenPipeError, EOFError) as error:
                                stop_tree()
                                process.join(timeout=2)
                                finish(
                                    "wall_time_exceeded"
                                    if isinstance(error, TimeoutError)
                                    else "descriptor_startup_ownership_failed",
                                    str(error),
                                )
                                terminal_received = True
                                break
                        elif candidate == process_id:
                            process_group = process_id
                        continue
                    terminal_received = self._handle_message(job.id, message, attempt=attempt)
                    if terminal_received:
                        break
                if terminal_received:
                    break
                if policy.resident_memory_bytes is not None:
                    peak_rss = max(peak_rss, process_tree_rss(process_id))
                    if peak_rss > policy.resident_memory_bytes:
                        stop_tree()
                        process.join(timeout=2)
                        finish(
                            "resident_memory_exceeded",
                            f"Job process tree used {peak_rss} resident bytes; "
                            f"budget {policy.resident_memory_bytes} bytes",
                        )
                        terminal_received = True
                        break
                if attempt is not None:
                    with self.session_factory() as session:
                        state = self._property_attempt_state(session, attempt, serialized=False)
                    if state in {"superseded", "refused"}:
                        stop_tree()
                        process.join(timeout=2)
                        finish("descriptor_startup_ownership_failed", "Descriptor attempt changed")
                        terminal_received = True
                        break
                    cancel_requested = state == "retired"
                else:
                    with self.session_factory() as session:
                        from neistra_api.job_service import JobNotFoundError

                        try:
                            persisted = JobService(session, self.settings, self.registry).get(
                                job.id, include_derived=True
                            )
                        except JobNotFoundError:
                            stop_tree()
                            process.join(timeout=2)
                            terminal_received = True
                            break
                        cancel_requested = persisted.cancellation_requested
                if cancel_requested and attempt is not None and process_group is None:
                    stop_tree()
                    process.join(timeout=2)
                    finish("descriptor_startup_ownership_failed", "Descriptor startup was retired")
                    terminal_received = True
                    break
                if cancel_requested and cancel_sent_at is None:
                    try:
                        parent.send(("cancel",))
                    except (BrokenPipeError, EOFError):
                        pipe_closed = True
                    cancel_sent_at = time.monotonic()
                if (
                    cancel_sent_at is not None
                    and time.monotonic() - cancel_sent_at > policy.cancellation_grace_seconds
                ):
                    stop_tree()
                    process.join(timeout=2)
                    finish(
                        "job_cancelled",
                        "Job cancelled after termination grace period",
                        cancelled=True,
                    )
                    terminal_received = True
                    break
                if time.monotonic() - started > policy.wall_time_seconds:
                    stop_tree()
                    process.join(timeout=2)
                    finish(
                        "wall_time_exceeded", f"Job exceeded {policy.wall_time_seconds:g} seconds"
                    )
                    terminal_received = True
                    break
                time.sleep(0.02)
            process.join(timeout=2)
            if not terminal_received:
                finish("child_process_lost", f"Plugin process exited with code {process.exitcode}")
        finally:
            stop_tree()
            process.join(timeout=2)
            parent.close()
            shutil.rmtree(work_directory, ignore_errors=True)
            if attempt is not None:
                self._reap_property_attempt(attempt)

    def _handle_message(
        self,
        job_id: str,
        message: tuple[Any, ...],
        *,
        attempt: PropertyAttempt | None = None,
    ) -> bool:
        from neistra_api.job_service import JobService

        kind = message[0]
        with self.session_factory() as session:
            service = JobService(session, self.settings, self.registry)
            if attempt is not None:
                current = (
                    attempt.current_job(session)
                    if kind == "result"
                    else attempt.locked_job(session)
                )
                if current is None or current.status != "running":
                    return True
                from neistra_api.ligand_property_service import (
                    LigandPropertyService,
                    private_execution,
                )

                execution = private_execution(session, current)
                if execution is not None and execution.reaped:
                    service.terminalize_property_attempt(
                        attempt,
                        "descriptor_execution_reaped",
                        "Descriptor execution was reaped before publication",
                    )
                    return True
                if current.cancellation_requested or not LigandPropertyService(
                    session, self.settings
                ).execution_live(current):
                    service.terminalize_property_attempt(
                        attempt,
                        "descriptor_result_retired",
                        "Property request retired before execution finished",
                    )
                    return True
            from neistra_api.job_service import JobNotFoundError

            try:
                persisted = service.get(job_id, include_derived=True)
            except JobNotFoundError:
                return True
            if persisted.status != "running":
                return True
            if kind == "progress":
                service.progress(job_id, float(message[1]), str(message[2]))
                return False
            if kind == "log":
                service.log(job_id, str(message[1]), str(message[2]))
                return False
            if kind == "result":
                result = message[1]
                try:
                    service.complete(
                        job_id,
                        result.artifacts,
                        result.values,
                        [warning.model_dump(mode="json") for warning in result.warnings],
                        result.message,
                        property_attempt=attempt,
                    )
                except Exception as error:
                    session.rollback()
                    if attempt is not None:
                        self._terminalize_property_attempt(
                            attempt, "invalid_plugin_result", str(error)
                        )
                    else:
                        service.fail(job_id, "invalid_plugin_result", str(error))
                return True
            if kind == "cancelled":
                service.cancelled(job_id, str(message[1]) or "Job cancelled")
                return True
            if kind == "error":
                service.fail(job_id, str(message[1]["code"]), str(message[1]["message"]))
                return True
        return False
