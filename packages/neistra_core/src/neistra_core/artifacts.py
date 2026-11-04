from __future__ import annotations

import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ArtifactRecord:
    sha256: str
    size: int
    relative_path: str


class ArtifactStore(Protocol):
    def put_bytes(self, data: bytes) -> ArtifactRecord: ...

    def read_bytes(self, relative_path: str) -> bytes: ...


class UnsafeArtifactPathError(ValueError):
    pass


class LocalArtifactStore:
    """Immutable content-addressed storage rooted in one managed directory."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.artifact_root = self.root / "artifacts" / "sha256"
        self.work_root = self.root / "work"
        self.artifact_root.mkdir(parents=True, exist_ok=True)
        self.work_root.mkdir(parents=True, exist_ok=True)

    def put_bytes(self, data: bytes) -> ArtifactRecord:
        digest = hashlib.sha256(data).hexdigest()
        relative_path = Path("artifacts") / "sha256" / digest[:2] / digest
        destination = self._resolve(relative_path.as_posix())
        destination.parent.mkdir(parents=True, exist_ok=True)

        if not destination.exists():
            file_descriptor, temporary_name = tempfile.mkstemp(dir=self.work_root)
            temporary_path = Path(temporary_name)
            try:
                with os.fdopen(file_descriptor, "wb") as handle:
                    handle.write(data)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary_path, destination)
            finally:
                temporary_path.unlink(missing_ok=True)

        return ArtifactRecord(
            sha256=digest,
            size=len(data),
            relative_path=relative_path.as_posix(),
        )

    def read_bytes(self, relative_path: str) -> bytes:
        return self._resolve(relative_path).read_bytes()

    def _resolve(self, relative_path: str) -> Path:
        candidate_path = Path(relative_path)
        if candidate_path.is_absolute():
            raise UnsafeArtifactPathError("Artifact paths must be relative")
        candidate = (self.root / candidate_path).resolve()
        if not candidate.is_relative_to(self.root):
            raise UnsafeArtifactPathError("Artifact path escapes the managed root")
        return candidate
