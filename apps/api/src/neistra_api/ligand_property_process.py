"""Positive process identity for privately captured descriptor executions."""

from __future__ import annotations

import os
import signal
import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from neistra_api.ligand_property_service import private_execution
from neistra_api.models import Job, LigandPropertyExecution


def process_identity(pid: int) -> tuple[str, int, str] | None:
    try:
        stat = Path(f"/proc/{pid}/stat").read_text()
        fields = stat[stat.rindex(")") + 2 :].split()
        return fields[19], int(fields[2]), fields[0]
    except (OSError, ValueError, IndexError):
        return None


def record_process(session: Session, job_id: str, pid: int) -> None:
    job = session.get(Job, job_id)
    identity = process_identity(pid)
    execution = private_execution(session, job) if job is not None else None
    if (
        job is None
        or execution is None
        or identity is None
        or identity[1] != pid
        or job.status != "running"
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
