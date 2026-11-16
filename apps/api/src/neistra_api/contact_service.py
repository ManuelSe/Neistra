"""Verified ephemeral contact reads with one owned, cancellable computation."""

from __future__ import annotations

import asyncio
import json
import multiprocessing
import shutil
import tempfile
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from multiprocessing.connection import Connection
from multiprocessing.process import BaseProcess
from pathlib import Path
from typing import cast
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from neistra_api.async_work import offload_owned_work, settle_owned_task
from neistra_api.contact_execution_data import (
    DEFAULT_CONTACT_POLICY,
    ContactCompletion,
    ContactPolicy,
    ContactRejection,
    ContactSnapshot,
)
from neistra_api.contact_execution_worker import CONTROL_BYTES, run_contact_child
from neistra_api.edit_execution_data import ImmutableEditInput, read_verified_file
from neistra_api.job_worker import process_tree_rss
from neistra_api.models import Artifact, Project, StructureEntry
from neistra_api.schemas import ContactQuery
from neistra_api.settings import Settings


class ContactReadError(RuntimeError):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code = status, code


@dataclass
class _Operation:
    id: str
    policy: ContactPolicy
    task: asyncio.Task[bytes] | None = None
    directory: Path | None = None
    process: BaseProcess | None = None
    receiver: Connection | None = None
    sender: Connection | None = None
    started: bool = False
    read_task: asyncio.Task[bytes] | None = None
    entered: bool = False


class ContactReadCoordinator:
    def __init__(
        self,
        factory: sessionmaker[Session],
        settings: Settings,
        policy: ContactPolicy = DEFAULT_CONTACT_POLICY,
    ) -> None:
        self.factory = factory
        self.settings = settings
        self.policy = ContactPolicy.model_validate(
            {
                **policy.model_dump(),
                "max_source_bytes": min(policy.max_source_bytes, settings.max_structure_file_bytes),
            }
        )
        self._active: _Operation | None = None
        self._closing = False

    async def analyze(
        self,
        project_id: str,
        query: ContactQuery,
        is_disconnected: Callable[[], Awaitable[bool]],
    ) -> bytes:
        if self._closing:
            raise ContactReadError(
                503, "contacts_unavailable", "Contact analysis is shutting down."
            )
        if self._active is not None:
            raise ContactReadError(
                429, "contacts_busy", "Another contact search is finishing. Try again shortly."
            )
        operation = _Operation(str(uuid4()), self.policy)
        self._active = operation  # No await between admission and ownership.
        operation.task = asyncio.create_task(
            self._execute(operation, project_id, query, is_disconnected)
        )
        try:
            return await asyncio.shield(operation.task)
        except asyncio.CancelledError:
            operation.task.cancel()
            try:
                await settle_owned_task(operation.task)
            except (asyncio.CancelledError, Exception):
                pass
            if not operation.entered:
                await settle_owned_task(asyncio.create_task(self._cleanup(operation)))
            raise

    async def close(self) -> None:
        self._closing = True
        operation = self._active
        if operation is not None and operation.task is not None:
            operation.task.cancel()
            try:
                await settle_owned_task(operation.task)
            except (asyncio.CancelledError, ContactReadError):
                pass
            if not operation.entered:
                await settle_owned_task(asyncio.create_task(self._cleanup(operation)))

    def _capture(
        self, operation: _Operation, project_id: str, query: ContactQuery
    ) -> ContactSnapshot:
        with self.factory() as session:
            if session.scalar(select(Project.id).where(Project.id == project_id)) is None:
                raise ContactReadError(404, "project_not_found", "Project not found.")
            entry = session.execute(
                select(StructureEntry.current_artifact_id, StructureEntry.atom_count).where(
                    StructureEntry.id == query.entry_id, StructureEntry.project_id == project_id
                )
            ).one_or_none()
            if entry is None:
                raise ContactReadError(
                    404, "entry_not_found", "Contact entry not found in this project."
                )
            artifact_id, atom_count = entry
            if query.expected_artifact_id is not None and artifact_id != query.expected_artifact_id:
                raise self._stale()
            if artifact_id is None:
                raise ContactReadError(
                    422, "contacts_input_unavailable", "A current structure is required."
                )
            artifact = session.execute(
                select(Artifact.relative_path, Artifact.size, Artifact.sha256).where(
                    Artifact.id == artifact_id
                )
            ).one_or_none()
            if artifact is None:
                raise ContactReadError(
                    422, "contacts_input_unavailable", "The current structure is unavailable."
                )
            relative_path, size, digest = artifact
            if (
                atom_count > operation.policy.max_input_atoms
                or size > operation.policy.max_source_bytes
            ):
                raise ContactReadError(
                    413,
                    "contacts_capacity",
                    "The structure exceeds the contact search input budget.",
                )
            try:
                return ContactSnapshot(
                    operation_id=operation.id,
                    project_id=project_id,
                    entry_id=query.entry_id,
                    declared_atom_count=atom_count,
                    source=ImmutableEditInput(
                        artifact_id=artifact_id,
                        relative_path=relative_path,
                        size=size,
                        sha256=digest,
                    ),
                    data_root=str(self.settings.data_dir.resolve()),
                    cutoff=query.cutoff,
                    minimum_distance=query.minimum_distance,
                    policy=operation.policy,
                )
            except ValueError as error:
                raise ContactReadError(
                    422, "contacts_input_unavailable", "The current structure identity is invalid."
                ) from error

    @staticmethod
    def _stale() -> ContactReadError:
        return ContactReadError(
            409, "contacts_stale", "The structure changed. Analyze its current coordinates."
        )

    def _recheck(
        self, operation: _Operation, query: ContactQuery, snapshot: ContactSnapshot
    ) -> None:
        expected = query.model_copy(update={"expected_artifact_id": snapshot.source.artifact_id})
        try:
            current = self._capture(operation, snapshot.project_id, expected)
        except ContactReadError as error:
            if error.status in {404, 422}:
                raise self._stale() from error
            raise
        if (
            current.source != snapshot.source
            or current.declared_atom_count != snapshot.declared_atom_count
        ):
            raise self._stale()

    def _make_directory(self, operation: _Operation) -> None:
        # Assignment happens inside owned work, including when its await is cancelled.
        operation.directory = Path(
            tempfile.mkdtemp(prefix="contact-read-", dir=self.settings.data_dir)
        )

    @staticmethod
    async def _check_request(
        deadline: float, is_disconnected: Callable[[], Awaitable[bool]]
    ) -> None:
        if await is_disconnected():
            raise ContactReadError(499, "contacts_cancelled", "Contact search was cancelled.")
        if time.monotonic() >= deadline:
            raise ContactReadError(
                504, "contacts_timeout", "Contact search exceeded its computation deadline."
            )

    async def _execute(
        self,
        operation: _Operation,
        project_id: str,
        query: ContactQuery,
        is_disconnected: Callable[[], Awaitable[bool]],
    ) -> bytes:
        operation.entered = True
        deadline = time.monotonic() + operation.policy.timeout_seconds
        try:
            snapshot = await offload_owned_work(self._capture, operation, project_id, query)
            await self._check_request(deadline, is_disconnected)
            await offload_owned_work(self._make_directory, operation)
            assert operation.directory is not None
            context = multiprocessing.get_context("spawn")
            receiver, sender = context.Pipe(duplex=False)
            operation.receiver, operation.sender = receiver, sender
            process = context.Process(
                target=run_contact_child,
                args=(sender, str(operation.directory), snapshot.model_dump_json().encode()),
                daemon=True,
            )
            operation.process = process
            try:
                process.start()
            except (OSError, RuntimeError) as error:
                raise ContactReadError(
                    503, "contacts_worker_start", "Contact analysis could not start. Try again."
                ) from error
            operation.started = True
            sender.close()
            while True:
                await self._check_request(deadline, is_disconnected)
                rss = await offload_owned_work(process_tree_rss, cast(int, process.pid))
                if rss > operation.policy.max_worker_rss_bytes:
                    raise ContactReadError(
                        413,
                        "contacts_capacity",
                        "Contact analysis exceeded its resident-memory budget.",
                    )
                if operation.read_task is None and receiver.poll():
                    operation.read_task = asyncio.create_task(
                        asyncio.to_thread(receiver.recv_bytes, CONTROL_BYTES)
                    )
                if operation.read_task is not None and operation.read_task.done():
                    try:
                        message = operation.read_task.result()
                        operation.read_task = None
                        kind = json.loads(message).get("kind")
                        if kind == "result":
                            completion = ContactCompletion.model_validate_json(message)
                            completion.check_owner(snapshot)
                            break
                        rejected = ContactRejection.model_validate_json(message)
                    except (EOFError, OSError, ValueError, AttributeError) as error:
                        raise ContactReadError(
                            500,
                            "contacts_output_invalid",
                            "Contact analysis returned an invalid result receipt.",
                        ) from error
                    statuses = {
                        "query": 422,
                        "geometry": 422,
                        "capacity": 413,
                        "input": 422,
                        "failed": 500,
                    }
                    raise ContactReadError(
                        statuses[rejected.kind], f"contacts_{rejected.kind}", rejected.message
                    )
                if not process.is_alive() and operation.read_task is None and not receiver.poll():
                    raise ContactReadError(
                        500,
                        "contacts_worker_failed",
                        "Contact analysis exited without a complete result.",
                    )
                await asyncio.sleep(0.025)
            try:
                data = await offload_owned_work(
                    read_verified_file, operation.directory, completion.response.file_descriptor()
                )
            except (OSError, ValueError) as error:
                raise ContactReadError(
                    500,
                    "contacts_output_invalid",
                    "The complete contact response could not be verified.",
                ) from error
            await self._check_request(deadline, is_disconnected)
            await offload_owned_work(self._recheck, operation, query, snapshot)
            await self._check_request(deadline, is_disconnected)
            # Opaque verified bytes from the fixed typed child producer; no parent
            # claim of JSON/schema validation follows merely from their SHA.
            return data
        finally:
            await settle_owned_task(asyncio.create_task(self._cleanup(operation)))

    async def _cleanup(self, operation: _Operation) -> None:
        try:
            process = operation.process
            if process is not None:
                if operation.started:
                    if process.is_alive():
                        process.terminate()
                    await asyncio.to_thread(process.join, operation.policy.cleanup_grace_seconds)
                    if process.is_alive():
                        process.kill()
                    await asyncio.to_thread(process.join)
                if operation.read_task is not None:
                    try:
                        await settle_owned_task(operation.read_task)
                    except (EOFError, OSError):
                        pass
                process.close()
            if operation.receiver is not None:
                operation.receiver.close()
            if operation.sender is not None:
                operation.sender.close()
            if operation.directory is not None and operation.directory.exists():
                await asyncio.to_thread(shutil.rmtree, operation.directory)
        except BaseException:
            # Failed cleanup cannot admit more work while retaining owned files.
            self._closing = True
            raise
        else:
            if self._active is operation:
                self._active = None
