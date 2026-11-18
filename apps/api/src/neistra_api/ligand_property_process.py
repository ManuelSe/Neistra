"""Positive process identity for privately captured descriptor executions."""

from __future__ import annotations

import os
import signal
import time
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from neistra_api.ligand_property_service import private_execution
from neistra_api.models import Job, LigandPropertyExecution, Project


def process_identity(pid: int) -> tuple[str, int, str] | None:
    try:
        stat = Path(f"/proc/{pid}/stat").read_text()
        fields = stat[stat.rindex(")") + 2 :].split()
        return fields[19], int(fields[2]), fields[0]
    except (OSError, ValueError, IndexError):
        return None


@dataclass(frozen=True)
class PropertyAttempt:
    """The private claim observed by one coordinator, never a later replacement."""

    job_id: str
    project_id: str
    worker_id: str | None
    execution_id: str

    @classmethod
    def capture(cls, job: Job, worker_id: str | None) -> PropertyAttempt:
        execution_id = job.parameters.get("execution_id")
        if not isinstance(execution_id, str) or job.parameters != {"execution_id": execution_id}:
            raise ValueError("Descriptor startup has no exact captured execution parameters")
        return cls(job.id, job.project_id, worker_id, execution_id)

    def locked_job(self, session: Session) -> Job | None:
        # A private no-op write also works if this session already owns SQLite's
        # writer. Never commit/rollback another operation simply to acquire it.
        if session.connection().dialect.name == "sqlite":
            session.execute(update(Job).where(Job.id == "").values(status=Job.status))
        else:
            session.execute(
                select(Project.id).where(Project.id == self.project_id).with_for_update()
            )
        return self.current_job(session)

    def current_job(self, session: Session) -> Job | None:
        session.expire_all()
        job = session.get(Job, self.job_id)
        execution = private_execution(session, job) if job is not None else None
        return job if job is not None and self.matches(job, execution) else None

    def matches(self, job: Job, execution: LigandPropertyExecution | None) -> bool:
        return (
            job.id == self.job_id
            and job.project_id == self.project_id
            and job.worker_id == self.worker_id
            and job.parameters == {"execution_id": self.execution_id}
            and execution is not None
            and execution.id == self.execution_id
        )


def record_process(
    session: Session,
    job_id: str,
    pid: int,
    *,
    attempt: PropertyAttempt | None = None,
) -> None:
    if attempt is None:
        observed = session.get(Job, job_id)
        if observed is None:
            raise ValueError("Descriptor process ownership could not be confirmed")
        attempt = PropertyAttempt.capture(observed, observed.worker_id)
    job = attempt.locked_job(session)
    identity = process_identity(pid)
    execution = private_execution(session, job) if job is not None else None
    if (
        attempt.job_id != job_id
        or job is None
        or execution is None
        or execution.reaped
        or identity is None
        or identity[1] != pid
        or identity[2] == "Z"
        or job.status != "running"
        or job.cancellation_requested
    ):
        raise ValueError("Descriptor process ownership could not be confirmed")
    execution.child_pid = pid
    execution.child_start_token = identity[0]
    execution.group_confirmed = True
    session.commit()


def recover_property_processes(session: Session) -> None:
    for execution in session.scalars(
        select(LigandPropertyExecution).where(LigandPropertyExecution.reaped.is_(False))
    ).all():
        # Private capture ownership survives user project/job deletion until reaping.
        pid = execution.child_pid
        if pid is None or not execution.group_confirmed:
            # The child handshake prevents calculation before durable ownership.
            execution.reaped = True
            continue
        identity = process_identity(pid)
        if identity is None:
            living = [
                path.parent.name
                for path in Path("/proc").glob("[0-9]*/stat")
                if (candidate := process_identity(int(path.parent.name))) is not None
                and candidate[1] == pid
                and candidate[2] != "Z"
            ]
            if living:
                raise ValueError("Descriptor descendants remain without a verifiable group leader")
            execution.reaped = True
            continue
        if identity is not None and identity[0] != execution.child_start_token:
            # This PID belongs to a later unrelated process; never signal it.
            execution.reaped = True
            continue
        if identity is not None and identity[1] != pid:
            raise ValueError("Captured descriptor process group identity changed")
        try:
            os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            members = []
            for path in Path("/proc").glob("[0-9]*/stat"):
                current = process_identity(int(path.parent.name))
                if current is not None and current[1] == pid and current[2] != "Z":
                    members.append(path.parent.name)
            if not members:
                break
            time.sleep(0.01)
        else:
            raise ValueError("A captured descriptor process group could not be reaped")
        execution.reaped = True
    session.commit()
