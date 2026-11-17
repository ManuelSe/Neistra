"""Exclusively owned, sealed descriptor reports and bounded child-qualified proofs."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from neistra_core.artifacts import LocalArtifactStore
from neistra_core.ligand_properties.models import DescriptorReport
from sqlalchemy import delete, event, func, select, update
from sqlalchemy.orm import Session

from neistra_api.models import (
    LigandPropertyBinding,
    LigandPropertyConsumer,
    LigandPropertyContent,
    LigandPropertyProof,
    utc_now,
)

MAX_CONTENT_RECORDS = 2048
MAX_CONTENT_BYTES = 16 * 1024 * 1024
MAX_REPORT_BYTES = 128 * 1024
MAX_PROOF_RECORDS = 4096
MAX_PROOFS_PER_CONTENT = 1024
MAX_RETIRED_CANDIDATES = 4096


class PropertyCacheError(ValueError):
    pass


def validate_report(report: DescriptorReport) -> DescriptorReport:
    from neistra_core.ligand_properties.registry import (
        DESCRIPTOR_REGISTRY,
        IMPLEMENTATION_VERSION,
        LIBRARY_VERSION,
        POLICY_VERSION,
        descriptor_coverage,
    )

    report = DescriptorReport.model_validate(report.model_dump())
    if (report.implementation_version, report.policy_version, report.library_version) != (
        IMPLEMENTATION_VERSION,
        POLICY_VERSION,
        LIBRARY_VERSION,
    ):
        raise PropertyCacheError("Descriptor implementation identity mismatch")
    if report.coverage != descriptor_coverage(report.coverage):
        raise PropertyCacheError("Descriptor coverage does not match the registry order")
    for outcome in report.values:
        definition = DESCRIPTOR_REGISTRY[outcome.descriptor_id]
        if outcome.status != "ready":
            continue
        if definition.value_type == "integer" and type(outcome.value) is not int:
            raise PropertyCacheError("An integer descriptor requires an exact integer")
        if outcome.descriptor_id not in {"formal_charge", "calculated_logp"} and (
            outcome.value is None or outcome.value < 0
        ):
            raise PropertyCacheError("Descriptor value violates its scientific domain")
        if (
            outcome.descriptor_id == "fraction_sp3"
            and outcome.value is not None
            and outcome.value > 1
        ):
            raise PropertyCacheError("Fraction sp3 must be between zero and one")
    return report


class LigandPropertyCache:
    def __init__(self, session: Session, data_dir: Path) -> None:
        self.session = session
        owned = data_dir / "cache" / "ligand-properties-v1"
        if owned.is_symlink():
            raise PropertyCacheError("Descriptor cache root must not be a symlink")
        self.store = LocalArtifactStore(owned)
        self._retired: set[tuple[str, str]] = set()
        # Instance-local transaction bookkeeping only; no filesystem work in hooks.
        event.listen(session, "after_rollback", self._discard_after_rollback)

    def _discard_after_rollback(self, session: Session) -> None:
        self._retired.clear()

    def _write_lock(self, input_hash: str) -> None:
        # SQLite acquires its store-wide writer lock even when this matches no row.
        self.session.execute(
            update(LigandPropertyContent)
            .where(
                LigandPropertyContent.input_hash == input_hash,
            )
            .values(used_at=LigandPropertyContent.used_at)
        )

    def _defer_retired(self, digest: str, relative_path: str) -> None:
        candidate = (digest, relative_path)
        self._path(*candidate)
        if candidate not in self._retired and len(self._retired) >= MAX_RETIRED_CANDIDATES:
            raise PropertyCacheError("Descriptor cleanup candidate capacity reached")
        self._retired.add(candidate)

    def cleanup_retired(self) -> int:
        """After successful publication commit, remove only still-unreferenced owned blobs."""
        if not self._retired:
            return 0
        if self.session.in_transaction():
            raise PropertyCacheError("Commit descriptor publication before retired blob cleanup")
        candidates = tuple(self._retired)
        self._retired.clear()
        removed = 0
        try:
            self._write_lock("0" * 64)
            for digest, relative_path in candidates:
                referenced = self.session.scalar(
                    select(func.count())
                    .select_from(LigandPropertyContent)
                    .where(LigandPropertyContent.sha256 == digest)
                )
                if not referenced:
                    self._path(digest, relative_path).unlink(missing_ok=True)
                    removed += 1
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        return removed

    def _path(self, digest: str, relative_path: str) -> Path:
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise PropertyCacheError("Invalid derived content digest")
        expected = f"artifacts/sha256/{digest[:2]}/{digest}"
        if relative_path != expected:
            raise PropertyCacheError("Invalid derived content path")
        path = self.store.root / relative_path
        if any(
            parent.is_symlink()
            for parent in [path, *path.parents]
            if parent.is_relative_to(self.store.root)
        ):
            raise PropertyCacheError("Derived content paths must not contain symlinks")
        return path

    def _envelope(self, record: LigandPropertyContent) -> tuple[DescriptorReport, tuple[str, ...]]:
        if not 0 < record.size <= MAX_REPORT_BYTES:
            raise PropertyCacheError("Invalid derived content size")
        path = self._path(record.sha256, record.relative_path)
        with path.open("rb") as stream:
            data = stream.read(MAX_REPORT_BYTES + 1)
        if len(data) != record.size or hashlib.sha256(data).hexdigest() != record.sha256:
            raise PropertyCacheError("Descriptor envelope failed integrity verification")
        payload = json.loads(data)
        if (
            not isinstance(payload, dict)
            or set(payload) != {"schema_version", "report", "semantic_fingerprints"}
            or type(payload["schema_version"]) is not int
            or payload["schema_version"] != 1
        ):
            raise PropertyCacheError("Invalid descriptor proof envelope")
        raw = payload["semantic_fingerprints"]
        if (
            not isinstance(raw, list)
            or len(raw) > MAX_PROOFS_PER_CONTENT
            or any(
                not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value)
                for value in raw
            )
            or len(set(raw)) != len(raw)
        ):
            raise PropertyCacheError("Invalid sealed source proof association")
        report = validate_report(DescriptorReport.model_validate(payload["report"]))
        if report.input_hash != record.input_hash or list(report.coverage) != record.coverage:
            raise PropertyCacheError("Descriptor content identity mismatch")
        return report, tuple(raw)

    def _read(self, input_hash: str) -> tuple[DescriptorReport, tuple[str, ...]] | None:
        record = self.session.get(LigandPropertyContent, input_hash)
        if record is None:
            return None
        try:
            return self._envelope(record)
        except (OSError, ValueError):
            # A concurrent publisher may already have repaired this path or row.
            # Serialize and reread before retiring metadata or scheduling any unlink.
            self._write_lock(input_hash)
            self.session.expire(record)
            record = self.session.get(LigandPropertyContent, input_hash)
            if record is None:
                return None
            try:
                return self._envelope(record)
            except (OSError, ValueError):
                try:
                    self._defer_retired(record.sha256, record.relative_path)
                except PropertyCacheError:
                    pass  # Unsafe paths are never deletion authority.
                self.session.delete(record)
                self.session.flush()
                return None

    def read(self, input_hash: str) -> DescriptorReport | None:
        envelope = self._read(input_hash)
        return envelope[0] if envelope is not None else None

    def read_associated(self, input_hash: str, fingerprint: str) -> DescriptorReport | None:
        """Validate retained binding authority independently of the evictable locator index."""
        if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
            raise PropertyCacheError("Invalid source proof fingerprint")
        envelope = self._read(input_hash)
        if envelope is not None and fingerprint in envelope[1]:
            return envelope[0]
        return None

    def read_proof(self, fingerprint: str) -> DescriptorReport | None:
        if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
            raise PropertyCacheError("Invalid source proof fingerprint")
        input_hash = self.session.scalar(
            select(LigandPropertyProof.input_hash).where(
                LigandPropertyProof.fingerprint == fingerprint,
            )
        )
        if input_hash is None:
            return None
        envelope = self._read(input_hash)
        if envelope is not None and fingerprint in envelope[1]:
            return envelope[0]
        # The metadata locator cannot invent a proof/report association.
        self.session.execute(
            delete(LigandPropertyProof).where(
                LigandPropertyProof.fingerprint == fingerprint,
            )
        )
        self.session.flush()
        return None

    def publish(
        self, report: DescriptorReport, *, semantic_fingerprints: tuple[str, ...] = ()
    ) -> LigandPropertyContent:
        report = validate_report(report)
        self._write_lock(report.input_hash)
        if len(semantic_fingerprints) > MAX_PROOFS_PER_CONTENT or any(
            not re.fullmatch(r"[0-9a-f]{64}", value) for value in semantic_fingerprints
        ):
            raise PropertyCacheError("Invalid bounded child source proof")
        previous = self._read(report.input_hash)
        fingerprints = list(previous[1]) if previous is not None else []
        if previous is not None:
            values = {value.descriptor_id: value for value in previous[0].values}
            values.update({value.descriptor_id: value for value in report.values})
            from neistra_core.ligand_properties.registry import descriptor_coverage

            coverage = descriptor_coverage(values)
            report = report.model_copy(
                update={"coverage": coverage, "values": tuple(values[key] for key in coverage)}
            )
        for fingerprint in semantic_fingerprints:
            indexed = self.read_proof(fingerprint)
            if indexed is not None and indexed.input_hash != report.input_hash:
                raise PropertyCacheError("A qualified source proof changed scientific identity")
            if fingerprint in fingerprints:
                fingerprints.remove(fingerprint)
            fingerprints.append(fingerprint)
        if len(fingerprints) > MAX_PROOFS_PER_CONTENT:
            raise PropertyCacheError(
                "This descriptor content has reached its source proof capacity"
            )
        payload = {
            "schema_version": 1,
            "report": report.model_dump(mode="json"),
            "semantic_fingerprints": fingerprints,
        }
        data = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        if len(data) > MAX_REPORT_BYTES:
            raise PropertyCacheError("Descriptor proof envelope exceeds its byte budget")
        self.prune(required_bytes=len(data), replacing=report.input_hash)
        digest = hashlib.sha256(data).hexdigest()
        relative_path = f"artifacts/sha256/{digest[:2]}/{digest}"
        path = self._path(digest, relative_path)
        if path.exists():
            with path.open("rb") as stream:
                previous_bytes = stream.read(MAX_REPORT_BYTES + 1)
            if previous_bytes != data:
                path.unlink()
        artifact = self.store.put_bytes(data)
        record = self.session.get(LigandPropertyContent, report.input_hash)
        old = (record.sha256, record.relative_path) if record is not None else None
        if record is None:
            record = LigandPropertyContent(input_hash=report.input_hash)
            self.session.add(record)
        record.sha256, record.size, record.relative_path = (
            artifact.sha256,
            artifact.size,
            artifact.relative_path,
        )
        record.coverage, record.used_at = list(report.coverage), utc_now()
        self.session.flush()
        # Previously sealed associations remain authoritative even when their
        # optional locator rows are evicted. Only newly produced proofs need indexing.
        for fingerprint in semantic_fingerprints:
            proof = self.session.get(LigandPropertyProof, fingerprint)
            if proof is None:
                self.session.add(
                    LigandPropertyProof(fingerprint=fingerprint, input_hash=report.input_hash)
                )
            elif proof.input_hash != report.input_hash:
                raise PropertyCacheError("Source proof index identity collision")
        self.session.flush()
        count = self.session.scalar(select(func.count()).select_from(LigandPropertyProof)) or 0
        excess = count - MAX_PROOF_RECORDS
        if excess > 0:
            oldest = self.session.scalars(
                select(LigandPropertyProof.fingerprint)
                .order_by(LigandPropertyProof.created_at, LigandPropertyProof.fingerprint)
                .limit(excess)
            ).all()
            self.session.execute(
                delete(LigandPropertyProof).where(LigandPropertyProof.fingerprint.in_(oldest))
            )
        if old is not None and old[0] != record.sha256:
            self._defer_retired(*old)
        return record

    def _pinned_inputs(self) -> set[str]:
        # This is a conservative eviction hint, never a scientific publication proof.
        owners = self.session.scalars(
            select(LigandPropertyConsumer).where(
                LigandPropertyConsumer.released.is_(False),
                LigandPropertyConsumer.expires_at > utc_now(),
            )
        ).all()
        sources: dict[str, list[dict[str, Any]]] = {}
        for owner in owners:
            for source in owner.entries_json:
                sources.setdefault(source["entry_id"], []).append(source)
        ids = list(sources)
        pinned: set[str] = set()
        for offset in range(0, len(ids), 200):
            bindings = self.session.scalars(
                select(LigandPropertyBinding).where(
                    LigandPropertyBinding.entry_id.in_(ids[offset : offset + 200]),
                )
            ).all()
            for binding in bindings:
                if binding.source in sources[binding.entry_id]:
                    pinned.add(binding.input_hash)
        return pinned

    def prune(self, *, required_bytes: int = 0, replacing: str | None = None) -> None:
        rows = list(
            self.session.scalars(
                select(LigandPropertyContent).order_by(LigandPropertyContent.used_at)
            ).all()
        )
        retained = [row for row in rows if row.input_hash != replacing]
        size = sum(row.size for row in retained)
        pinned = self._pinned_inputs()
        victims: list[LigandPropertyContent] = []
        while retained and (
            len(retained) >= MAX_CONTENT_RECORDS or size + required_bytes > MAX_CONTENT_BYTES
        ):
            record = next(
                (candidate for candidate in retained if candidate.input_hash not in pinned), None
            )
            if record is None:
                raise PropertyCacheError("Descriptor cache is full of currently requested content")
            retained.remove(record)
            victims.append(record)
            size -= record.size
        if size + required_bytes > MAX_CONTENT_BYTES:
            raise PropertyCacheError("Descriptor cache capacity unavailable")
        for record in victims:
            self._defer_retired(record.sha256, record.relative_path)
        for record in victims:
            self.session.delete(record)
        if victims:
            self.session.flush()

    def cleanup_orphans(self) -> int:
        """Startup-only cleanup after owned children are reaped, inside a DB write lock."""
        referenced = set(self.session.scalars(select(LigandPropertyContent.sha256)).all())
        removed, scanned = 0, 0
        for prefix in self.store.artifact_root.iterdir():
            if (
                prefix.is_symlink()
                or not prefix.is_dir()
                or not re.fullmatch(r"[0-9a-f]{2}", prefix.name)
            ):
                raise PropertyCacheError("Unexpected path in exclusively owned descriptor cache")
            for path in prefix.iterdir():
                scanned += 1
                if scanned > MAX_CONTENT_RECORDS * 4:
                    raise PropertyCacheError("Descriptor cache recovery exceeds its file budget")
                checked = self._path(path.name, f"artifacts/sha256/{prefix.name}/{path.name}")
                if not checked.is_file():
                    raise PropertyCacheError("Unexpected descriptor cache object")
                if path.name not in referenced:
                    checked.unlink()
                    removed += 1
        return removed
