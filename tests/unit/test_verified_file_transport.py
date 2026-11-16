from __future__ import annotations

import hashlib
import os
import stat
from pathlib import Path
from typing import Literal

import pytest
from neistra_api import edit_execution_data as transport
from neistra_api.edit_execution_data import FileDescriptor, ImmutableEditInput

Reader = Literal["input", "output"]
PAYLOAD = b"known immutable molecular bytes"


def filename(reader: Reader) -> str:
    return "normalized.json" if reader == "input" else "response.json"


def read(
    root: Path, reader: Reader, *, size: int = len(PAYLOAD), digest: str | None = None
) -> bytes:
    sha256 = digest if digest is not None else hashlib.sha256(PAYLOAD).hexdigest()
    if reader == "input":
        return transport.read_immutable_input(
            root,
            ImmutableEditInput(
                artifact_id="artifact",
                relative_path=filename(reader),
                size=size,
                sha256=sha256,
            ),
        )
    return transport.read_verified_file(
        root,
        FileDescriptor(
            filename="response.json",
            size=size,
            sha256=sha256,
        ),
    )


@pytest.mark.parametrize("reader", ["input", "output"])
def test_verified_transport_reads_exact_bytes_and_empty_files(
    tmp_path: Path, reader: Reader
) -> None:
    path = tmp_path / filename(reader)
    path.write_bytes(PAYLOAD)
    assert read(tmp_path, reader) == PAYLOAD
    path.write_bytes(b"")
    assert read(tmp_path, reader, size=0, digest=hashlib.sha256(b"").hexdigest()) == b""


@pytest.mark.parametrize("reader", ["input", "output"])
@pytest.mark.parametrize("mutation", ["same-size-corruption", "truncation", "growth", "wrong-sha"])
def test_integrity_mismatch_never_returns_unverified_bytes(
    tmp_path: Path, reader: Reader, mutation: str
) -> None:
    data = PAYLOAD
    digest = None
    if mutation == "same-size-corruption":
        data = b"X" + PAYLOAD[1:]
    elif mutation == "truncation":
        data = PAYLOAD[:-1]
    elif mutation == "growth":
        data = PAYLOAD + b"extra"
    else:
        digest = "0" * 64
    (tmp_path / filename(reader)).write_bytes(data)
    with pytest.raises(ValueError):
        read(tmp_path, reader, digest=digest)


@pytest.mark.parametrize("reader", ["input", "output"])
def test_directory_is_refused_as_nonregular_input(tmp_path: Path, reader: Reader) -> None:
    (tmp_path / filename(reader)).mkdir()
    with pytest.raises(ValueError, match="file type"):
        read(tmp_path, reader)


def test_input_rejects_absolute_traversal_and_outside_symlink(tmp_path: Path) -> None:
    store = tmp_path / "store"
    store.mkdir()
    outside = tmp_path / "outside.json"
    outside.write_bytes(PAYLOAD)
    alias = store / "outside-alias.json"
    alias.symlink_to(outside)
    for path in [str(outside), "../outside.json", "outside-alias.json"]:
        identity = ImmutableEditInput(
            artifact_id="artifact",
            relative_path=path,
            size=len(PAYLOAD),
            sha256=hashlib.sha256(PAYLOAD).hexdigest(),
        )
        with pytest.raises(ValueError, match="outside"):
            transport.read_immutable_input(store, identity)


def test_input_preserves_verified_regular_alias_within_store(tmp_path: Path) -> None:
    target = tmp_path / "target.json"
    target.write_bytes(PAYLOAD)
    (tmp_path / "normalized.json").symlink_to(target)
    assert read(tmp_path, "input") == PAYLOAD
    target.write_bytes(b"X" + PAYLOAD[1:])
    with pytest.raises(ValueError, match="integrity"):
        read(tmp_path, "input")


@pytest.mark.parametrize("outside", [False, True], ids=["within-owned-root", "outside-owned-root"])
def test_output_final_symlink_is_refused_even_with_matching_bytes(
    tmp_path: Path, outside: bool
) -> None:
    operation = tmp_path / "operation"
    operation.mkdir()
    target = (tmp_path if outside else operation) / "target.json"
    target.write_bytes(PAYLOAD)
    (operation / "response.json").symlink_to(target)
    with pytest.raises(ValueError, match="outside"):
        read(operation, "output")


@pytest.mark.parametrize("reader", ["input", "output"])
def test_growth_after_opened_file_stat_reads_only_declared_size_plus_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, reader: Reader
) -> None:
    path = tmp_path / filename(reader)
    path.write_bytes(PAYLOAD)
    target_inode = path.stat().st_ino
    actual_stat, actual_fdopen = os.fstat, os.fdopen
    appended = False
    requested_sizes = []
    returned_sizes = []

    def stat_then_grow(descriptor: int) -> os.stat_result:
        nonlocal appended
        info = actual_stat(descriptor)
        if info.st_ino == target_inode and not appended:
            appended = True
            with path.open("ab") as stream:
                stream.write(b"G" * 65536)
        return info

    class ObservedReader:
        def __init__(self, stream: object) -> None:
            self.stream = stream

        def __enter__(self) -> ObservedReader:
            self.stream.__enter__()
            return self

        def read(self, size: int = -1) -> bytes:
            requested_sizes.append(size)
            data = self.stream.read(size)
            returned_sizes.append(len(data))
            return data

        def __exit__(self, *args: object) -> object:
            return self.stream.__exit__(*args)

    def observe_open(*args: object, **kwargs: object) -> ObservedReader:
        return ObservedReader(actual_fdopen(*args, **kwargs))

    monkeypatch.setattr(transport.os, "fstat", stat_then_grow)
    monkeypatch.setattr(transport.os, "fdopen", observe_open)
    with pytest.raises(ValueError, match="integrity"):
        read(tmp_path, reader)
    assert appended
    assert path.stat().st_size == len(PAYLOAD) + 65536
    assert requested_sizes == [len(PAYLOAD) + 1]
    assert returned_sizes == [len(PAYLOAD) + 1]


@pytest.mark.parametrize("reader", ["input", "output"])
def test_nonregular_stat_is_rejected_before_read_and_descriptor_is_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, reader: Reader
) -> None:
    # Exercise a FIFO stat safely using an opened regular fixture, so no test can
    # block waiting for a pipe writer even if an implementation regresses.
    path = tmp_path / filename(reader)
    path.write_bytes(PAYLOAD)
    actual_stat, actual_open = os.fstat, os.open
    opened = []

    def observe_open(*args: object, **kwargs: object) -> int:
        descriptor = actual_open(*args, **kwargs)
        opened.append(descriptor)
        return descriptor

    def fifo_stat(descriptor: int) -> os.stat_result:
        values = list(actual_stat(descriptor))
        values[0] = stat.S_IFIFO | 0o600
        return os.stat_result(values)

    def forbidden_read(*args: object, **kwargs: object) -> None:
        pytest.fail("A nonregular descriptor must be rejected before constructing a reader")

    monkeypatch.setattr(transport.os, "open", observe_open)
    monkeypatch.setattr(transport.os, "fstat", fifo_stat)
    monkeypatch.setattr(transport.os, "fdopen", forbidden_read)
    with pytest.raises(ValueError, match="file type"):
        read(tmp_path, reader)
    assert len(opened) == 1
    with pytest.raises(OSError):
        actual_stat(opened[0])
