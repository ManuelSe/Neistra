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
from typing import TYPE_CHECKING, Any

from molweave_core.jobs import (
    InputArtifact,
    JobCancelled,
    PluginRegistry,
    ResultArtifact,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session, sessionmaker

    from molweave_api.import_export import ArtifactService
    from molweave_api.job_service import JobService
    from molweave_api.models import Job
    from molweave_api.settings import Settings


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


def _execute_child(
    connection: Connection,
    allowlist: tuple[str, ...],
    targets: tuple[str, ...],
    job_type: str,
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
                    "code": "memory_allocation_failed"
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

    def recover_abandoned(self) -> int:
        from molweave_api.job_service import JobService

        with self.session_factory() as session:
            return JobService(session, self.settings, self.registry).recover_abandoned()

    def run_once(self) -> bool:
        from molweave_api.job_service import JobService

        with self.session_factory() as session:
            service = JobService(session, self.settings, self.registry)
            job = service.claim_next(self.worker_id)
            if job is None:
                return False
            try:
                child_inputs = self._load_inputs(session, service, job)
            except Exception as error:
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

    def _run_claimed(self, job: Job, child_inputs: tuple[ChildInput, ...]) -> None:
        from molweave_api.job_service import JobService

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
                        if message[1] == process.pid:
                            process_group = int(message[1])
                        continue
                    terminal_received = self._handle_message(job.id, message)
                    if terminal_received:
                        break
                if terminal_received:
                    break
                if policy.resident_memory_bytes is not None:
                    peak_rss = max(peak_rss, process_tree_rss(process_id))
                    if peak_rss > policy.resident_memory_bytes:
                        stop_tree()
                        process.join(timeout=2)
                        with self.session_factory() as session:
                            JobService(session, self.settings, self.registry).fail(
                                job.id,
                                "resident_memory_exceeded",
                                f"Job process tree used {peak_rss} resident bytes; "
                                f"budget {policy.resident_memory_bytes} bytes",
                            )
                        terminal_received = True
                        break
                with self.session_factory() as session:
                    persisted = JobService(session, self.settings, self.registry).get(job.id)
                    cancel_requested = persisted.cancellation_requested
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
                    with self.session_factory() as session:
                        JobService(session, self.settings, self.registry).cancelled(
                            job.id, "Job cancelled after termination grace period"
                        )
                    terminal_received = True
                    break
                if time.monotonic() - started > policy.wall_time_seconds:
                    stop_tree()
                    process.join(timeout=2)
                    with self.session_factory() as session:
                        JobService(session, self.settings, self.registry).fail(
                            job.id,
                            "wall_time_exceeded",
                            f"Job exceeded {policy.wall_time_seconds:g} seconds",
                        )
                    terminal_received = True
                    break
                time.sleep(0.02)
            process.join(timeout=2)
            if not terminal_received:
                with self.session_factory() as session:
                    JobService(session, self.settings, self.registry).fail(
                        job.id,
                        "child_process_lost",
                        f"Plugin process exited with code {process.exitcode}",
                    )
        finally:
            stop_tree()
            process.join(timeout=2)
            parent.close()
            shutil.rmtree(work_directory, ignore_errors=True)

    def _handle_message(self, job_id: str, message: tuple[Any, ...]) -> bool:
        from molweave_api.job_service import JobService

        kind = message[0]
        with self.session_factory() as session:
            service = JobService(session, self.settings, self.registry)
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
                    )
                except Exception as error:
                    session.rollback()
                    service.fail(job_id, "invalid_plugin_result", str(error))
                return True
            if kind == "cancelled":
                service.cancelled(job_id, str(message[1]) or "Job cancelled")
                return True
            if kind == "error":
                service.fail(job_id, str(message[1]["code"]), str(message[1]["message"]))
                return True
        return False
