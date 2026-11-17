"""Bounded ephemeral edits: immutable capture, pure child, fresh locked publication."""

from __future__ import annotations

import asyncio
import json
import multiprocessing
import os
import shutil
import signal
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

from fastapi import Request
from neistra_core.molecular import NormalizedStructureV1
from sqlalchemy import event
from sqlalchemy.orm import Session, sessionmaker

from neistra_api.async_work import offload_owned_work as _off_loop
from neistra_api.async_work import settle_owned_task as _settle
from neistra_api.edit_artifacts import StagedArtifact
from neistra_api.edit_attempts import (
    ApplyKind,
    EditAttempt,
    EditAttemptRegistry,
    EditAttemptReservationError,
    request_digest,
)
from neistra_api.edit_computation import PreparedPublication
from neistra_api.edit_execution_data import (
    EditOutput,
    EditSnapshot,
    FileDescriptor,
    ImmutableEditInput,
    read_verified_file,
    stage_file,
)
from neistra_api.edit_execution_worker import run_edit_child
from neistra_api.job_worker import process_tree_rss
from neistra_api.models import Artifact, Project, StructureEntry
from neistra_api.project_publication import lock_project_publication
from neistra_api.project_service import InvalidProjectOperationError, ProjectService
from neistra_api.schemas import ModelEditCreate, ModelPreviewRead, ProjectRead, SelectionEditCreate
from neistra_api.selection_edit_service import SelectionEditService
from neistra_api.settings import Settings

EditKind = Literal["preview", "model", "selection"]


class EditExecutionError(RuntimeError):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


@dataclass(frozen=True, slots=True)
class LoadedEdit:
    publication: PreparedPublication | None
    staged: StagedArtifact | None
    preview_json: bytes | None


class EditExecutionController:
    def __init__(self, factory: sessionmaker[Session], settings: Settings) -> None:
        self.factory = factory
        self.settings = settings
        self.work_root = settings.data_dir / "work" / "edits"
        self.active = False
        self.preview_waiter: object | None = None
        self.last_metrics: dict[str, float | str | int] = {}
        self.attempts = EditAttemptRegistry()
        self.attempt_fingerprinting = False

    async def _check_disconnect(self, request: Request) -> None:
        if await request.is_disconnected():
            raise EditExecutionError(
                499, "edit_cancelled", "Editing request disconnected before publication."
            )

    async def _admit(self, kind: EditKind, request: Request) -> None:
        if not self.active:
            self.active = True
            return
        if kind != "preview" or self.preview_waiter is not None:
            raise EditExecutionError(
                429, "editing_busy", "Another molecular edit is running. Try again shortly."
            )
        token = object()
        self.preview_waiter = token
        deadline = time.monotonic() + self.settings.edit_cleanup_grace_seconds + 1
        try:
            while self.active:
                await self._check_disconnect(request)
                if time.monotonic() >= deadline:
                    raise EditExecutionError(
                        429, "editing_busy", "Another molecular edit is running. Try again shortly."
                    )
                await asyncio.sleep(0.025)
            self.active = True
        finally:
            if self.preview_waiter is token:
                self.preview_waiter = None

    def _capture(
        self,
        directory: Path,
        kind: EditKind,
        project_id: str,
        entry_id: str,
        payload: ModelEditCreate | SelectionEditCreate,
    ) -> tuple[EditSnapshot, FileDescriptor]:
        with self.factory() as session:
            service = SelectionEditService(session, self.settings)
            entry = service._selection_entry(
                project_id,
                entry_id,
                payload.expected_revision,
                payload.expected_artifact_id,
                payload.selection,
            )
            atom_floor, bond_floor = ProjectService(session).allocation_floor(entry)
            artifact = service.artifacts.get(payload.expected_artifact_id)
            try:
                normalized = ImmutableEditInput(
                    artifact_id=artifact.id,
                    relative_path=artifact.relative_path,
                    size=artifact.size,
                    sha256=artifact.sha256,
                )
            except ValueError as error:
                raise InvalidProjectOperationError(
                    "Stored structure artifact metadata is invalid; "
                    "restore or reimport the structure."
                ) from error
            original = (
                session.get(Artifact, entry.original_artifact_id)
                if entry.original_artifact_id
                else None
            )
            try:
                original_input = (
                    (
                        ImmutableEditInput(
                            artifact_id=original.id,
                            relative_path=original.relative_path,
                            size=original.size,
                            sha256=original.sha256,
                        )
                    )
                    if original is not None
                    else None
                )
            except ValueError:
                original_input = None
            snapshot = EditSnapshot(
                kind=kind,
                project_id=project_id,
                expected_revision=payload.expected_revision,
                target=service._edit_target(entry, atom_floor, bond_floor),
                payload=payload.model_dump(mode="json"),
                normalized=normalized,
                original=original_input,
                data_root=str(self.settings.data_dir.resolve()),
                max_structure_file_bytes=self.settings.max_structure_file_bytes,
            )
            data = snapshot.model_dump_json().encode()
        # The session is closed before any child or request cancellation wait.
        return snapshot, stage_file(directory, "request.json", data)

    def _load(self, directory: Path, snapshot: EditSnapshot, output: EditOutput) -> LoadedEdit:
        if output.envelope.filename != "response.json":
            raise ValueError("Invalid edit response filename")
        data = read_verified_file(directory, output.envelope)
        if snapshot.kind == "preview":
            if output.normalized is not None:
                raise ValueError("A preview cannot publish a molecular artifact")
            preview = ModelPreviewRead.model_validate_json(data)
            if (
                preview.entry_id != snapshot.target.entry_id
                or preview.expected_revision != snapshot.expected_revision
                or preview.expected_artifact_id != snapshot.target.artifact_id
            ):
                raise ValueError("Preview output does not match the captured input")
            return LoadedEdit(None, None, preview.model_dump_json().encode())
        publication = PreparedPublication.model_validate_json(data)
        if (
            publication.kind != snapshot.kind
            or publication.command_prefix != snapshot.kind
            or publication.entry_id != snapshot.target.entry_id
            or publication.source_artifact_id != snapshot.target.artifact_id
            or publication.operation != snapshot.payload["action"]["operation"]
            or publication.next_atom_id < snapshot.target.atom_floor
            or publication.next_bond_id < snapshot.target.bond_floor
        ):
            raise ValueError("Edit output does not match the captured input")
        staged = None
        if publication.applied:
            descriptor = output.normalized
            if descriptor is None or descriptor.filename != "normalized.json":
                raise ValueError("An applied edit requires its staged molecular artifact")
            normalized_data = read_verified_file(directory, descriptor)
            structure = NormalizedStructureV1.from_bytes(normalized_data)
            if (
                len(structure.atoms) > self.settings.atom_hard_limit
                or publication.after_values["atom_ids"] != [a.id for a in structure.atoms]
                or publication.after_values["atom_count"] != len(structure.atoms)
                or publication.after_values["bond_count"] != len(structure.bonds)
            ):
                raise ValueError("Staged molecular data does not match its publication summary")
            relative = Path("artifacts") / "sha256" / descriptor.sha256[:2] / descriptor.sha256
            destination = (self.settings.data_dir / relative).resolve()
            if not destination.is_relative_to(self.settings.data_dir.resolve()):
                raise ValueError("Staged publication destination is outside the managed store")
            staged = StagedArtifact(
                directory / descriptor.filename,
                destination,
                relative.as_posix(),
                descriptor.size,
                descriptor.sha256,
            )
        elif output.normalized is not None:
            raise ValueError("A no-change edit must not stage a canonical artifact")
        return LoadedEdit(publication, staged, None)

    def _current_entry(
        self,
        session: Session,
        snapshot: EditSnapshot,
    ) -> tuple[SelectionEditService, StructureEntry]:
        service = SelectionEditService(session, self.settings)
        payload = (
            SelectionEditCreate.model_validate(snapshot.payload)
            if snapshot.kind == "selection"
            else ModelEditCreate.model_validate(snapshot.payload)
        )
        entry = service._selection_entry(
            snapshot.project_id,
            snapshot.target.entry_id,
            snapshot.expected_revision,
            snapshot.target.artifact_id,
            payload.selection,
        )
        if ProjectService(session).allocation_floor(entry) != (
            snapshot.target.atom_floor,
            snapshot.target.bond_floor,
        ):
            raise InvalidProjectOperationError(
                "Molecular allocation identities changed; refresh the target."
            )
        return service, entry

    def _observe_commit(
        self, session: Session, attempt: EditAttempt, project: Project, entry: StructureEntry
    ) -> None:
        receipt: tuple[int, str] | None = None

        def before_commit(_: Session) -> None:
            nonlocal receipt
            try:
                # Never invoke an ORM descriptor or query from a commit observer.
                revision = project.__dict__.get("revision")
                artifact_id = entry.__dict__.get("current_artifact_id")
                if revision != attempt.expected_revision + 1 or not isinstance(artifact_id, str):
                    raise ValueError("Committed edit identity was unavailable")
                receipt = (revision, artifact_id)
            except Exception:
                attempt.observer_failed = True
                attempt.outcome = "unknown"

        def after_commit(_: Session) -> None:
            try:
                if receipt is not None and not attempt.observer_failed:
                    attempt.saved(*receipt)
                else:
                    attempt.observer_failed = True
                    attempt.outcome = "unknown"
            except Exception:
                # Commit observers must not turn a durable commit into a failed
                # transaction or a false claim that no change was made.
                attempt.observer_failed = True
                if attempt.outcome != "saved":
                    attempt.outcome = "unknown"

        event.listen(session, "before_commit", before_commit)
        event.listen(session, "after_commit", after_commit)

    def _publish(
        self, snapshot: EditSnapshot, loaded: LoadedEdit, attempt: EditAttempt | None = None
    ) -> ProjectRead:
        # This section deliberately has no await: existing project writers share
        # main-loop serialization. The lock precedes every fresh authoritative read.
        with self.factory() as session:
            lock_project_publication(session, snapshot.project_id)
            service, entry = self._current_entry(session, snapshot)
            assert loaded.publication is not None
            if attempt is not None and loaded.publication.applied:
                project = session.get(Project, snapshot.project_id)
                assert project is not None
                self._observe_commit(session, attempt, project, entry)
                attempt.publication_started = True
                attempt.phase = "finishing"
            return service._publish_prepared_project(
                entry,
                snapshot.expected_revision,
                loaded.publication,
                staged=loaded.staged,
            )

    async def _run_child(
        self,
        directory: Path,
        manifest: FileDescriptor,
        request: Request,
        kind: EditKind,
        metrics: dict[str, float | str | int],
    ) -> EditOutput:
        context = multiprocessing.get_context("spawn")
        receiver, sender = context.Pipe(duplex=False)
        process = context.Process(
            target=run_edit_child,
            args=(sender, str(directory), manifest.model_dump_json().encode()),
            daemon=True,
        )
        started = False
        read_task: asyncio.Task[bytes] | None = None
        owned_group: int | None = None
        timeout = (
            self.settings.edit_preview_timeout_seconds
            if kind == "preview"
            else self.settings.edit_compute_timeout_seconds
        )
        deadline = time.monotonic() + timeout
        try:
            try:
                process.start()
            except (OSError, RuntimeError) as error:
                raise EditExecutionError(
                    503,
                    "edit_worker_start_failed",
                    "The editing worker could not start. Try again.",
                ) from error
            started = True
            sender.close()
            while True:
                await self._check_disconnect(request)
                if time.monotonic() >= deadline:
                    raise EditExecutionError(
                        504,
                        "edit_timeout",
                        f"Molecular computation exceeded its {timeout:g}-second deadline.",
                    )
                rss = await _off_loop(process_tree_rss, cast(int, process.pid))
                metrics["peak_child_rss_bytes"] = max(
                    int(metrics.get("peak_child_rss_bytes", 0)), rss
                )
                if rss > self.settings.edit_worker_max_rss_bytes:
                    raise EditExecutionError(
                        413,
                        "edit_memory_limit",
                        "Molecular computation exceeded its resident-memory budget.",
                    )
                if read_task is None and receiver.poll():
                    read_task = asyncio.create_task(asyncio.to_thread(receiver.recv_bytes, 4096))
                if read_task is not None and read_task.done():
                    try:
                        message = json.loads(read_task.result())
                        if not isinstance(message, dict):
                            raise ValueError("Invalid edit worker control message")
                    except (EOFError, OSError, ValueError) as error:
                        raise EditExecutionError(
                            500,
                            "edit_worker_failed",
                            "Molecular computation exited without a valid result.",
                        ) from error
                    read_task = None
                    if message.get("kind") == "started":
                        if message.get("pid") != process.pid:
                            raise EditExecutionError(
                                500, "edit_worker_failed", "Editing worker identity is invalid."
                            )
                        if os.name == "posix":
                            if message.get("process_group") != process.pid:
                                raise EditExecutionError(
                                    500,
                                    "edit_worker_failed",
                                    "Editing worker group ownership is invalid.",
                                )
                            # The owned entry point acknowledges only after setsid,
                            # before native imports. Retain this proof even if the
                            # root exits before a later getpgid could inspect it.
                            owned_group = process.pid
                    elif message.get("kind") == "result":
                        try:
                            return EditOutput.model_validate(message["output"])
                        except (KeyError, ValueError) as error:
                            raise EditExecutionError(
                                500, "edit_output_invalid", "Editing output descriptor is invalid."
                            ) from error
                    elif message.get("kind") == "invalid":
                        raise InvalidProjectOperationError(
                            str(message.get("message", "Invalid edit"))
                        )
                    else:
                        raise EditExecutionError(
                            500,
                            "edit_worker_failed",
                            "Molecular computation failed; no edit was published.",
                        )
                if not process.is_alive() and read_task is None and not receiver.poll():
                    raise EditExecutionError(
                        500, "edit_worker_failed", "Molecular computation exited without a result."
                    )
                await asyncio.sleep(0.025)
        finally:

            async def cleanup() -> None:
                try:
                    if started:
                        if os.name == "posix" and owned_group is None:
                            try:
                                if os.getpgid(cast(int, process.pid)) == process.pid:
                                    group = process.pid
                                else:
                                    group = None
                            except ProcessLookupError:
                                group = None
                        else:
                            group = owned_group
                        if group is not None:
                            try:
                                os.killpg(group, signal.SIGTERM)
                            except ProcessLookupError:
                                pass
                        elif process.is_alive():
                            process.terminate()
                        await asyncio.to_thread(
                            process.join, self.settings.edit_cleanup_grace_seconds
                        )
                        if group is not None:
                            try:
                                os.killpg(group, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                        if process.is_alive():
                            process.kill()
                        await asyncio.to_thread(process.join)
                        if read_task is not None:
                            try:
                                await _settle(read_task)
                            except (EOFError, OSError):
                                pass
                        process.close()
                    else:
                        process.close()
                finally:
                    receiver.close()
                    sender.close()

            await _settle(asyncio.create_task(cleanup()))

    async def _register_attempt(
        self,
        attempt_id: str,
        kind: ApplyKind,
        project_id: str,
        entry_id: str,
        payload: ModelEditCreate | SelectionEditCreate,
    ) -> EditAttempt:
        try:
            record, created = self.attempts.reserve(attempt_id, project_id, entry_id, kind, payload)
        except EditAttemptReservationError as error:
            raise EditExecutionError(error.status, error.code, str(error)) from error
        if not created and (record.digest is None or self.attempt_fingerprinting):
            raise EditExecutionError(
                409, "edit_attempt_already_submitted", "This edit attempt was already submitted."
            )
        if self.attempt_fingerprinting:
            record.reason = "tracking_busy"
            self.attempts.finish(record)
            raise EditExecutionError(
                503,
                "edit_attempts_unavailable",
                "Edit outcome tracking is busy; no edit was started.",
            )
        self.attempt_fingerprinting = True
        try:
            digest = await _off_loop(request_digest, kind, project_id, entry_id, payload)
        except BaseException:
            if created:
                record.reason = "tracking_failed"
                self.attempts.finish(record)
            raise
        finally:
            self.attempt_fingerprinting = False
        if not created:
            conflict = record.digest != digest
            raise EditExecutionError(
                409,
                "edit_attempt_token_conflict" if conflict else "edit_attempt_already_submitted",
                "This token belongs to a different request."
                if conflict
                else "This edit attempt was already submitted. Check its outcome.",
            )
        record.digest = digest
        return record

    async def execute(
        self,
        kind: EditKind,
        project_id: str,
        entry_id: str,
        payload: ModelEditCreate | SelectionEditCreate,
        request: Request,
        attempt_id: str | None = None,
    ) -> bytes:
        attempt = (
            await self._register_attempt(attempt_id, kind, project_id, entry_id, payload)
            if attempt_id is not None and kind != "preview"
            else None
        )
        admitted = False
        directory: Path | None = None
        metrics: dict[str, float | str | int] = {"kind": kind}
        try:
            await self._admit(kind, request)
            admitted = True
            try:
                self.work_root.mkdir(parents=True, exist_ok=True)
                directory = Path(tempfile.mkdtemp(prefix="edit-", dir=self.work_root))
                started = time.monotonic()
                snapshot, manifest = await _off_loop(
                    self._capture, directory, kind, project_id, entry_id, payload
                )
            except OSError as error:
                raise EditExecutionError(
                    503,
                    "edit_staging_failed",
                    "Editing work files could not be prepared; no edit was published.",
                ) from error
            metrics["capture_seconds"] = time.monotonic() - started
            await self._check_disconnect(request)
            started = time.monotonic()
            output = await self._run_child(directory, manifest, request, kind, metrics)
            metrics["compute_seconds"] = time.monotonic() - started
            started = time.monotonic()
            try:
                loaded = await _off_loop(self._load, directory, snapshot, output)
            except (ValueError, OSError) as error:
                raise EditExecutionError(
                    500,
                    "edit_output_invalid",
                    "Editing output failed validation; no edit was published.",
                ) from error
            metrics["load_seconds"] = time.monotonic() - started
            # Final cancellation point. There is no await from this fresh check
            # through the synchronous locked publication and captured result.
            await self._check_disconnect(request)
            if kind == "preview":
                with self.factory() as session:
                    self._current_entry(session, snapshot)
                assert loaded.preview_json is not None
                return loaded.preview_json
            started = time.monotonic()
            project = (
                self._publish(snapshot, loaded, attempt)
                if attempt is not None
                else self._publish(snapshot, loaded)
            )
            metrics["publication_seconds"] = time.monotonic() - started
            publication = loaded.publication
            assert publication is not None
            if attempt is not None and not publication.applied:
                attempt.reason = "no_change"
                attempt.phase = "finishing"
            started = time.monotonic()
            try:
                response = await _off_loop(
                    lambda: publication.response(project).model_dump_json().encode()
                )
            except Exception as error:
                status = "The edit was saved" if publication.applied else "Editing finished"
                raise EditExecutionError(
                    500,
                    "edit_response_failed",
                    f"{status}, but its response could not be encoded. "
                    "Refresh the project before retrying.",
                ) from error
            metrics["response_seconds"] = time.monotonic() - started
            return response
        finally:
            if attempt is not None and attempt.publication_started and attempt.outcome != "saved":
                attempt.outcome = "unknown"
            try:
                if directory is not None:
                    await _settle(asyncio.create_task(asyncio.to_thread(shutil.rmtree, directory)))
            finally:
                if admitted:
                    self.last_metrics = metrics
                    self.active = False
                if attempt is not None:
                    self.attempts.finish(attempt)
