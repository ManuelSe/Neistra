"""Typed, database-free manifests and verified file transport for ordinary edits."""

from __future__ import annotations

import hashlib
import os
import stat
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from neistra_api.edit_computation import EditTarget


class ImmutableEditInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    artifact_id: str
    relative_path: str
    size: int = Field(ge=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class EditSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: Literal["preview", "model", "selection"]
    project_id: str
    expected_revision: int
    target: EditTarget
    payload: dict[str, Any]
    normalized: ImmutableEditInput
    original: ImmutableEditInput | None
    data_root: str
    max_structure_file_bytes: int


class FileDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    filename: Literal["request.json", "response.json", "normalized.json"]
    size: int = Field(ge=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class EditOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    envelope: FileDescriptor
    normalized: FileDescriptor | None = None


def read_verified_file(root: Path, descriptor: FileDescriptor) -> bytes:
    path = root / descriptor.filename
    if path.is_symlink() or path.resolve().parent != root.resolve():
        raise ValueError("Editing output is outside its owned operation directory")
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_size != descriptor.size:
        raise ValueError("Editing output size or file type does not match its descriptor")
    data = path.read_bytes()
    if len(data) != descriptor.size or hashlib.sha256(data).hexdigest() != descriptor.sha256:
        raise ValueError("Editing output failed integrity checks")
    return data


def read_immutable_input(root: Path, identity: ImmutableEditInput) -> bytes:
    path = (root / identity.relative_path).resolve()
    if Path(identity.relative_path).is_absolute() or not path.is_relative_to(root.resolve()):
        raise ValueError("Editing input is outside the managed artifact store")
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_size != identity.size:
        raise ValueError("Editing source size or file type changed")
    data = path.read_bytes()
    if len(data) != identity.size or hashlib.sha256(data).hexdigest() != identity.sha256:
        raise ValueError("Editing source failed integrity checks")
    return data


def stage_file(
    root: Path, filename: Literal["request.json", "response.json", "normalized.json"], data: bytes
) -> FileDescriptor:
    path = root / filename
    with path.open("xb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    return FileDescriptor(
        filename=filename, size=len(data), sha256=hashlib.sha256(data).hexdigest()
    )
