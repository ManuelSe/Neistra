"""Bounded operation-specific live snapshots; never persisted molecular state."""

from __future__ import annotations

import hashlib
import json
import os
import time
from collections import defaultdict
from collections.abc import Callable
from pathlib import Path
from typing import Literal

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, Field

from molweave_core.jobs import JobContext
from molweave_core.minimization.contracts import (
    CalculationError,
    CoordinateProposal,
    MinimizationParameters,
)

SNAPSHOT_NAME = "minimization-live.json"
SNAPSHOT_LIMIT = 1024**2


def capture_digest(parameters: MinimizationParameters) -> str:
    return hashlib.sha256(
        json.dumps(
            parameters.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


class OptimizationFrame(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)
    sequence: int = Field(ge=1)
    iteration: int = Field(ge=1, le=2000)
    published_at: float = Field(gt=0)
    entries: list[CoordinateProposal] = Field(min_length=1, max_length=100)


class ProcessIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    pid: int = Field(ge=1)
    start_ticks: int = Field(ge=0)


def process_identity(pid: int) -> ProcessIdentity | None:
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(") ", 1)[1].split()
        if fields[0] == "Z":
            return None
        return ProcessIdentity(pid=pid, start_ticks=int(fields[19]))
    except (OSError, ValueError, IndexError):
        return None


class PrivateSnapshot(OptimizationFrame):
    schema_version: Literal[1] = 1
    capture_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    producer: ProcessIdentity
    coordinator: ProcessIdentity


def validate_frame(parameters: MinimizationParameters, frame: OptimizationFrame) -> None:
    if frame.iteration > parameters.max_iterations:
        raise ValueError("Snapshot iteration exceeds the captured limit")
    selected: dict[str, list[int]] = defaultdict(list)
    for ref in parameters.selection.atoms:
        selected[ref.structure_id].append(ref.atom_id)
    captures = {c.entry_id: c for c in parameters.captured_inputs}
    if [entry.entry_id for entry in frame.entries] != sorted(selected):
        raise ValueError("Snapshot entries differ from captured selection")
    for entry in frame.entries:
        if (
            entry.atom_ids != selected[entry.entry_id]
            or len(entry.coordinates) != len(entry.atom_ids)
            or entry.conformer_id != captures[entry.entry_id].conformer_id
        ):
            raise ValueError("Snapshot atom/conformer mapping differs from captured selection")


class SnapshotPublisher:
    def __init__(
        self,
        parameters: MinimizationParameters,
        context: JobContext,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.parameters = parameters
        self.context = context
        self.clock = clock
        self.capture_sha256 = capture_digest(parameters)
        self.producer = process_identity(os.getpid())
        self.coordinator = process_identity(os.getppid())
        self.sequence = 0
        self.last_published = float("-inf")
        self.warning: str | None = None

    def publish(
        self,
        iteration: int,
        references: tuple[tuple[str, int], ...],
        coordinates: NDArray[np.float64],
    ) -> None:
        self.context.checkpoint()
        now = self.clock()
        if self.warning or now - self.last_published < 0.2:
            return
        if self.producer is None or self.coordinator is None:
            self.warning = "Live preview unavailable: local process identity cannot be verified."
            self.context.stderr(self.warning)
            return
        if coordinates.shape != (len(references), 3) or len(set(references)) != len(references):
            raise CalculationError("invalid_snapshot", "Optimizer snapshot mapping is invalid")
        if set(references) != {
            (r.structure_id, r.atom_id) for r in self.parameters.selection.atoms
        }:
            raise CalculationError("invalid_snapshot", "Snapshot does not preserve exact selection")
        points = {
            ref: tuple(float(v) for v in point)
            for ref, point in zip(references, coordinates, strict=True)
        }
        entries = []
        try:
            for capture in self.parameters.captured_inputs:
                ids = sorted(i for entry, i in points if entry == capture.entry_id)
                if ids:
                    entries.append(
                        CoordinateProposal(
                            entry_id=capture.entry_id,
                            conformer_id=capture.conformer_id,
                            atom_ids=ids,
                            coordinates=[points[(capture.entry_id, i)] for i in ids],
                        )
                    )
            snapshot = PrivateSnapshot(
                sequence=self.sequence + 1,
                iteration=iteration,
                published_at=time.time(),
                entries=entries,
                capture_sha256=self.capture_sha256,
                producer=self.producer,
                coordinator=self.coordinator,
            )
            validate_frame(self.parameters, snapshot)
            data = snapshot.model_dump_json().encode()
            if len(data) > SNAPSHOT_LIMIT:
                raise ValueError("Snapshot exceeds 1 MiB")
        except ValueError as error:
            raise CalculationError("invalid_snapshot", str(error)) from error
        path = self.context.work_directory / SNAPSHOT_NAME
        temporary = path.with_suffix(".tmp")
        try:
            temporary.write_bytes(data)
            temporary.replace(path)
        except OSError as error:
            self.warning = f"Live preview unavailable; calculation continues: {error}"
            self.context.stderr(self.warning)
            return
        self.sequence += 1
        self.last_published = now


def read_snapshot(directory: Path, parameters: MinimizationParameters) -> OptimizationFrame | None:
    path = directory / SNAPSHOT_NAME
    if not path.exists():
        return None
    if path.is_symlink() or path.stat().st_size > SNAPSHOT_LIMIT:
        raise ValueError("Snapshot is invalid or exceeds bounds")
    with path.open("rb") as stream:
        data = stream.read(SNAPSHOT_LIMIT + 1)
    if len(data) > SNAPSHOT_LIMIT:
        raise ValueError("Snapshot exceeds bounds")
    snapshot = PrivateSnapshot.model_validate_json(data)
    if snapshot.capture_sha256 != capture_digest(parameters):
        raise ValueError("Snapshot belongs to a different capture")
    if (
        process_identity(snapshot.producer.pid) != snapshot.producer
        or process_identity(snapshot.coordinator.pid) != snapshot.coordinator
    ):
        raise ValueError("Calculation process interrupted; live preview ended")
    validate_frame(parameters, snapshot)
    return OptimizationFrame(
        sequence=snapshot.sequence,
        iteration=snapshot.iteration,
        published_at=snapshot.published_at,
        entries=snapshot.entries,
    )
