"""Small process-local receipts for uncertain Apply responses; never a retry queue."""

from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal
from uuid import uuid4

from neistra_api.schemas import EditAttemptRead, ModelEditCreate, SelectionEditCreate

ApplyKind = Literal["model", "selection"]


class EditAttemptReservationError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 409) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


def request_digest(
    kind: ApplyKind,
    project_id: str,
    entry_id: str,
    payload: ModelEditCreate | SelectionEditCreate,
) -> str:
    """Canonicalize potentially large selection data outside the event loop."""
    data = json.dumps(
        [kind, project_id, entry_id, payload.model_dump(mode="json")],
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode()
    return hashlib.sha256(data).hexdigest()


@dataclass(slots=True)
class EditAttempt:
    attempt_id: str
    project_id: str
    entry_id: str
    kind: ApplyKind
    expected_revision: int
    expected_artifact_id: str
    digest: str | None = None
    phase: Literal["pending", "finishing", "finished"] = "pending"
    outcome: Literal["saved", "not_applied", "unknown"] | None = None
    committed_revision: int | None = None
    committed_artifact_id: str | None = None
    reason: str | None = None
    publication_started: bool = False
    observer_failed: bool = False
    finished_at: float | None = None

    def saved(self, revision: int, artifact_id: str) -> None:
        self.committed_revision = revision
        self.committed_artifact_id = artifact_id
        self.outcome = "saved"
        self.phase = "finishing"
        self.reason = None


class EditAttemptRegistry:
    """Owned by one controller/event loop. Active records cannot expire or be evicted."""

    def __init__(
        self,
        *,
        capacity: int = 128,
        finished_ttl_seconds: float = 3600,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if capacity < 1 or finished_ttl_seconds <= 0:
            raise ValueError("Edit attempt bounds must be positive")
        self.capacity = capacity
        self.finished_ttl_seconds = finished_ttl_seconds
        self.clock = clock
        self.server_instance_id = str(uuid4())
        self.records: OrderedDict[str, EditAttempt] = OrderedDict()

    def _expire(self) -> None:
        now = self.clock()
        for token, record in list(self.records.items()):
            if (
                record.finished_at is not None
                and now - record.finished_at >= self.finished_ttl_seconds
            ):
                del self.records[token]

    def reserve(
        self,
        attempt_id: str,
        project_id: str,
        entry_id: str,
        kind: ApplyKind,
        payload: ModelEditCreate | SelectionEditCreate,
    ) -> tuple[EditAttempt, bool]:
        identity = (attempt_id, project_id, entry_id, payload.expected_artifact_id)
        if any(len(value) > 256 for value in identity):
            raise EditAttemptReservationError(
                "edit_attempt_invalid",
                "Edit attempt identity exceeds its tracking limit; no edit was started.",
                422,
            )
        self._expire()
        previous = self.records.get(attempt_id)
        if previous is not None:
            if (
                previous.project_id,
                previous.entry_id,
                previous.kind,
                previous.expected_revision,
                previous.expected_artifact_id,
            ) != (
                project_id,
                entry_id,
                kind,
                payload.expected_revision,
                payload.expected_artifact_id,
            ):
                raise EditAttemptReservationError(
                    "edit_attempt_token_conflict",
                    "This edit attempt token belongs to a different request. Refresh its outcome.",
                )
            return previous, False
        if len(self.records) >= self.capacity:
            settled = next(
                (key for key, value in self.records.items() if value.finished_at is not None), None
            )
            if settled is None:
                raise EditAttemptReservationError(
                    "edit_attempts_unavailable",
                    "Edit outcome tracking is busy. No edit was started; try again shortly.",
                    503,
                )
            del self.records[settled]
        record = EditAttempt(
            attempt_id,
            project_id,
            entry_id,
            kind,
            payload.expected_revision,
            payload.expected_artifact_id,
        )
        self.records[attempt_id] = record
        return record, True

    def finish(self, record: EditAttempt) -> None:
        # The operation retains this object until owned cleanup settles. Never
        # overwrite a confirmed commit with an HTTP/encoding/cleanup failure.
        if record.outcome != "saved":
            record.outcome = (
                "unknown" if record.publication_started or record.observer_failed else "not_applied"
            )
        record.phase = "finished"
        record.finished_at = self.clock()
        self.records.move_to_end(record.attempt_id)

    def lookup(self, project_id: str, attempt_id: str) -> EditAttemptRead:
        self._expire()
        record = self.records.get(attempt_id)
        if record is None or record.project_id != project_id:
            return EditAttemptRead(
                server_instance_id=self.server_instance_id,
                project_id=project_id,
                attempt_id=attempt_id,
                phase="unknown",
                outcome="unknown",
            )
        if record.finished_at is not None:
            self.records.move_to_end(attempt_id)
        return EditAttemptRead(
            server_instance_id=self.server_instance_id,
            attempt_id=record.attempt_id,
            project_id=record.project_id,
            entry_id=record.entry_id,
            kind=record.kind,
            expected_revision=record.expected_revision,
            expected_artifact_id=record.expected_artifact_id,
            phase=record.phase,
            outcome=record.outcome,
            committed_revision=record.committed_revision,
            committed_artifact_id=record.committed_artifact_id,
            reason=record.reason,
        )
