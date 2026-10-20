"""Disposable, bounded native preparation files; never a molecular authority."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

from molweave_core.jobs import JobContext
from molweave_core.minimization.contracts import CalculationError
from molweave_core.molecular import NormalizedStructureV1

NATIVE_FILES = frozenset(
    {
        "input.mol2",
        "charged.mol2",
        "charged.raw.mol2",
        "leap.in",
        "model.prmtop",
        "model.inpcrd",
        "antechamber.log",
        "tleap.log",
        "sqm.in",
        "sqm.out",
        "parameterization.json",
        "component.lib",
    }
)
ENTRY_LIMIT = 100 * 1024**2


class FileRecord(TypedDict):
    size: int
    sha256: str


def file_allowed(relative: Path) -> bool:
    return relative.name in NATIVE_FILES and (
        len(relative.parts) == 1
        or (
            len(relative.parts) == 2
            and re.fullmatch(r"(?:organic|protein)-[0-9]+", relative.parts[0]) is not None
        )
    )


def fingerprint(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()


def chemistry_signature(source: NormalizedStructureV1) -> dict[str, object]:
    return {
        "atoms": [
            a.model_dump(
                include={"id", "element", "formal_charge", "stereo", "residue_id", "source_index"}
            )
            for a in source.atoms
        ],
        "bonds": [b.model_dump() for b in source.bonds],
        "residues": [r.model_dump() for r in source.residues],
    }


@dataclass(frozen=True)
class Cached[T]:
    value: T
    provenance: dict[str, object]


class ParameterCache:
    """One cooperative preparation lock matches the local single-worker architecture.

    Nested component preparation reuses the lock. Job-local verified copies outlive
    eviction. Concurrent processes never read partially published/evicted entries.
    """

    def __init__(self, root: Path, budget: int = 2 * 1024**3, max_entries: int = 128):
        self.root = root
        self.budget = max(0, budget)
        self.max_entries = max(1, max_entries)
        self._mutex = threading.RLock()
        self._depth = 0

    @contextmanager
    def _locked(self, context: JobContext) -> Iterator[None]:
        import fcntl

        with self._mutex:
            if self._depth:
                yield
                return
            self.root.mkdir(parents=True, exist_ok=True)
            with (self.root / ".lock").open("a+b") as lock:
                while True:
                    context.checkpoint()
                    try:
                        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        break
                    except BlockingIOError:
                        time.sleep(0.05)
                self._depth = 1
                try:
                    # A killed publisher can leave at most one staged entry.
                    for path in self.root.glob(".stage-*"):
                        if path.is_dir() and not path.is_symlink():
                            shutil.rmtree(path)
                    self._prune()
                    yield
                finally:
                    self._depth = 0
                    fcntl.flock(lock, fcntl.LOCK_UN)

    def _restore(self, entry: Path, key: str, directory: Path) -> None:
        if entry.is_symlink() or (entry / "manifest.json").is_symlink():
            raise ValueError("Cache entry is not an ordinary managed directory")
        if (entry / "manifest.json").stat().st_size > 256 * 1024:
            raise ValueError("Cache manifest exceeds bounds")
        manifest = json.loads((entry / "manifest.json").read_bytes())
        records = manifest["files"]
        if (
            manifest["key"] != key
            or manifest["schema_version"] != 1
            or not isinstance(records, dict)
        ):
            raise ValueError("Cache manifest identity is invalid")
        if not 1 <= len(records) <= 512:
            raise ValueError("Cache file count is invalid")
        total = 0
        verified: list[tuple[Path, bytes]] = []
        for name, record in records.items():
            relative = Path(name)
            source = entry / relative
            if (
                relative.is_absolute()
                or ".." in relative.parts
                or not file_allowed(relative)
                or source.is_symlink()
                or source.parent.is_symlink()
            ):
                raise ValueError("Unsafe cache file")
            size = source.stat().st_size
            total += size
            if size > 16 * 1024**2 or total > ENTRY_LIMIT:
                raise ValueError("Cache entry exceeds bounds")
            data = source.read_bytes()
            if len(data) != record["size"] or hashlib.sha256(data).hexdigest() != record["sha256"]:
                raise ValueError("Cache file checksum mismatch")
            verified.append((relative, data))
        directory.mkdir(parents=True, exist_ok=False)
        for relative, data in verified:
            destination = directory / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)

    def _prune(self, reserve: int = 0) -> None:
        candidates = sorted(
            (
                p
                for p in self.root.iterdir()
                if p.is_dir()
                and not p.is_symlink()
                and re.fullmatch(r"[a-z]+-[0-9a-f]{64}", p.name)
            ),
            key=lambda p: p.stat().st_mtime,
        )
        sizes = {
            p: sum(f.stat().st_size for f in p.rglob("*") if f.is_file() and not f.is_symlink())
            for p in candidates
        }
        while candidates and (
            sum(sizes.values()) + reserve > self.budget
            or len(candidates) + bool(reserve) > self.max_entries
        ):
            oldest = candidates.pop(0)
            shutil.rmtree(oldest)
            sizes.pop(oldest)

    def _publish(self, entry: Path, key: str, directory: Path) -> bool:
        files = {
            p.relative_to(directory): p
            for p in directory.rglob("*")
            if p.is_file() and not p.is_symlink() and file_allowed(p.relative_to(directory))
        }
        sizes = {relative: path.stat().st_size for relative, path in files.items()}
        if (
            not files
            or len(files) > 512
            or sum(sizes.values()) > min(self.budget, ENTRY_LIMIT)
            or any(size > 16 * 1024**2 for size in sizes.values())
        ):
            return False  # Enforce bounds before hashing/reading any native output.
        records: dict[str, FileRecord] = {
            str(relative): {
                "size": sizes[relative],
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            }
            for relative, source in files.items()
        }
        manifest = json.dumps({"schema_version": 1, "key": key, "files": records}, sort_keys=True)
        size = sum(sizes.values()) + len(manifest.encode())
        if size > min(self.budget, ENTRY_LIMIT):
            return False
        self._prune(size)
        staged = Path(tempfile.mkdtemp(prefix=".stage-", dir=self.root))
        try:
            for relative, source in files.items():
                data = source.read_bytes()
                target = staged / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            (staged / "manifest.json").write_text(manifest)
            staged.rename(entry)
            return True
        finally:
            if staged.exists():
                shutil.rmtree(staged)

    def prepare[T](
        self,
        kind: str,
        key: str,
        directory: Path,
        context: JobContext,
        build: Callable[[], T],
        load: Callable[[], T],
    ) -> Cached[T]:
        if not re.fullmatch(r"[a-z]+", kind) or not re.fullmatch(r"[0-9a-f]{64}", key):
            raise ValueError("Invalid internal cache key")
        provenance: dict[str, object] = {
            "schema_version": 1,
            "kind": kind,
            "key": key,
            "hit": False,
            "stored": False,
        }
        if not self.budget:
            return Cached(build(), provenance)
        with ExitStack() as stack:
            try:
                stack.enter_context(self._locked(context))
            except OSError as error:
                context.stderr(f"Parameter cache unavailable; preparing cold: {error}")
                return Cached(build(), provenance)
            entry = self.root / f"{kind}-{key}"
            if entry.exists() or entry.is_symlink():
                try:
                    self._restore(entry, key, directory)
                    value = load()  # Native graph/mapping/settings validation, not just a digest.
                    os.utime(entry, None)
                    context.stdout(f"Parameter cache hit: {kind}/{key}")
                    return Cached(value, {**provenance, "hit": True, "stored": True})
                except (
                    OSError,
                    ValueError,
                    RuntimeError,
                    KeyError,
                    TypeError,
                    CalculationError,
                ) as error:
                    context.stderr(f"Invalid parameter cache entry; preparing cold: {error}")
                    if directory.exists():
                        shutil.rmtree(directory)
                    try:
                        if entry.is_symlink() or entry.is_file():
                            entry.unlink()
                        else:
                            shutil.rmtree(entry)
                    except OSError as cleanup_error:
                        context.stderr(
                            f"Cache cleanup unavailable; preparing cold: {cleanup_error}"
                        )
                        return Cached(build(), provenance)
            value = build()  # Native/chemistry errors must propagate, never trigger another model.
            try:
                provenance["stored"] = self._publish(entry, key, directory)
            except OSError as error:
                context.stderr(f"Validated parameters not cached: {error}")
            context.stdout(f"Parameter cache miss: {kind}/{key}")
            return Cached(value, provenance)
