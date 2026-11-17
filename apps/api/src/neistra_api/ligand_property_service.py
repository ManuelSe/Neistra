"""Bounded current-input descriptor demand and privately owned worker captures."""

from __future__ import annotations

import hashlib
import json
import math
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from neistra_core.artifacts import LocalArtifactStore
from neistra_core.ligand_properties.models import DescriptorReport
from neistra_core.ligand_properties.registry import (
    DESCRIPTOR_DEFINITIONS,
    IMPLEMENTATION_VERSION,
    LIBRARY_VERSION,
    POLICY_VERSION,
    descriptor_coverage,
)
from neistra_core.ligands.models import LigandDesignationV1
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from uuid6 import uuid7

from neistra_api.artifact_errors import ArtifactIntegrityError, ArtifactNotFoundError
from neistra_api.import_export import ArtifactService, StructureArtifactConflictError
from neistra_api.ligand_property_cache import LigandPropertyCache, PropertyCacheError
from neistra_api.ligand_property_identity import (
    MAX_CAPTURE_ENVELOPE_BYTES,
)
from neistra_api.ligand_property_schemas import (
    DEFAULT_CATEGORIES,
    LigandPropertyAggregateRead,
    LigandPropertyConsumerUpdate,
    LigandPropertyCurrentRead,
    LigandPropertyPreferencesRead,
    LigandPropertyPreferencesUpdate,
    LigandPropertyReadRequest,
    LigandPropertySource,
)
from neistra_api.ligand_property_verification import (
    PropertySourceFailure,
    PropertySourceVerification,
)
from neistra_api.models import (
    Artifact,
    Job,
    LigandPropertyBinding,
    LigandPropertyConsumer,
    LigandPropertyExecution,
    LigandPropertyPreferences,
    Project,
    StructureEntry,
    utc_now,
)
from neistra_api.project_publication import lock_project_publication
from neistra_api.project_service import (
    EntryNotFoundError,
    InvalidProjectOperationError,
    ProjectNotFoundError,
)
from neistra_api.settings import Settings

PROPERTY_JOB_TYPE = "ligand.properties"
PROPERTY_PURPOSE = "ligand_properties"
CONSUMER_LEASE_SECONDS = 60
MAX_CONSUMERS = 64
MAX_CONSUMER_RECORDS = 256
MAX_DEMAND_ENTRIES = 4096
MAX_BATCH_SIZE = 8
MAX_CAPTURE_BYTES = 64 * 1024 * 1024
MAX_TERMINAL_EXECUTIONS = 32


class PropertyPreferenceConflict(RuntimeError):
    def __init__(self, revision: int) -> None:
        self.current_revision = revision
        super().__init__(f"Property preferences changed; current revision is {revision}")


class PropertyConsumerConflict(RuntimeError):
    pass


class PropertyConsumerExpired(PropertyConsumerConflict):
    pass


class PropertyCapacityError(RuntimeError):
    pass


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def source_key(source: LigandPropertySource, original_artifact_id: str | None) -> str:
    return hashlib.sha256(
        json.dumps(
            [
                source.model_dump(mode="json"),
                original_artifact_id,
                IMPLEMENTATION_VERSION,
                POLICY_VERSION,
                LIBRARY_VERSION,
            ],
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()


def private_execution(session: Session, job: Job) -> LigandPropertyExecution | None:
    if job.purpose != PROPERTY_PURPOSE or job.job_type != PROPERTY_JOB_TYPE:
        return None
    execution = session.scalar(
        select(LigandPropertyExecution).where(LigandPropertyExecution.job_id == job.id)
    )
    if (
        execution is None
        or execution.project_id != job.project_id
        or job.parameters
        != {
            "execution_id": execution.id,
        }
    ):
        return None
    return execution


def is_owned_property_job(session: Session, job: Job) -> bool:
    return private_execution(session, job) is not None


def read_property_preferences(session: Session) -> LigandPropertyPreferencesRead:
    table = LigandPropertyPreferences.__table__
    row = session.execute(select(table).where(table.c.id == 1)).mappings().one_or_none()
    if row is None:
        return LigandPropertyPreferencesRead(revision=0, enabled_categories=DEFAULT_CATEGORIES)
    return LigandPropertyPreferencesRead(
        revision=row["revision"],
        enabled_categories=tuple(row["enabled_categories"]),
        updated_at=utc(row["updated_at"]),
    )


def update_property_preferences(
    session: Session,
    payload: LigandPropertyPreferencesUpdate,
) -> LigandPropertyPreferencesRead:
    current = read_property_preferences(session)
    if current.revision != payload.expected_revision:
        raise PropertyPreferenceConflict(current.revision)
    if current.enabled_categories == payload.enabled_categories:
        return current
    now = utc_now()
    if current.revision == 0:
        session.add(
            LigandPropertyPreferences(
                id=1,
                revision=1,
                enabled_categories=list(payload.enabled_categories),
                updated_at=now,
            )
        )
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            raise PropertyPreferenceConflict(read_property_preferences(session).revision) from None
    else:
        changed: Any = session.execute(
            update(LigandPropertyPreferences)
            .where(
                LigandPropertyPreferences.id == 1,
                LigandPropertyPreferences.revision == payload.expected_revision,
            )
            .values(
                revision=payload.expected_revision + 1,
                enabled_categories=list(payload.enabled_categories),
                updated_at=now,
            )
        )
        if changed.rowcount != 1:
            session.rollback()
            raise PropertyPreferenceConflict(read_property_preferences(session).revision)
        session.commit()
        session.expire_all()
    return read_property_preferences(session)


@dataclass(frozen=True)
class PropertyBindingStamp:
    """An observed installation, independent of source identity and wall clock."""

    entry_id: str
    source_key: str
    input_hash: str
    incarnation: str


class LigandPropertyService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.artifacts = ArtifactService(session, LocalArtifactStore(settings.data_dir))
        self._cache: LigandPropertyCache | None = None
        self.last_metrics: dict[str, Any] = {}
        self._retired_source = False

    @property
    def cache(self) -> LigandPropertyCache:
        if self._cache is None:
            try:
                self._cache = LigandPropertyCache(self.session, self.settings.data_dir)
            except OSError as error:
                raise PropertyCacheError("The descriptor cache is inaccessible") from error
        return self._cache

    def _commit_derived(self) -> None:
        self.session.commit()
        if self._cache is not None:
            try:
                self._cache.cleanup_retired()
            except (OSError, PropertyCacheError, SQLAlchemyError):
                # Publication succeeded. Retained owned orphans are recoverable;
                # housekeeping must not turn a valid result into a failed demand.
                import logging

                logging.getLogger(__name__).warning(
                    "Descriptor cache cleanup deferred", exc_info=True
                )

    def _project(self, project_id: str) -> Project:
        project = self.session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        return project

    def verify(self, project_id: str, source: LigandPropertySource) -> StructureEntry:
        entry = self.session.get(StructureEntry, source.entry_id)
        if entry is None or entry.project_id != project_id:
            raise EntryNotFoundError(source.entry_id)
        designation = LigandDesignationV1.model_validate(entry.ligand_designation)
        if (
            entry.current_artifact_id != source.source_artifact_id
            or designation.status != "resolved"
            or designation.instance_id != source.instance_id
            or tuple(designation.atom_ids) != source.atom_ids
        ):
            raise StructureArtifactConflictError("The exact current ligand input changed")
        return entry

    def _effective(self, requested: tuple[str, ...]) -> tuple[str, ...]:
        categories = read_property_preferences(self.session).enabled_categories
        return descriptor_coverage(
            set(requested)
            | {
                definition.id
                for definition in DESCRIPTOR_DEFINITIONS
                if definition.category in categories
            }
        )

    def _live_consumers(self) -> list[LigandPropertyConsumer]:
        return list(
            self.session.scalars(
                select(LigandPropertyConsumer).where(
                    LigandPropertyConsumer.released.is_(False),
                    LigandPropertyConsumer.expires_at > utc_now(),
                )
            ).all()
        )

    def _binding_stamp(self, entry_id: str) -> PropertyBindingStamp | None:
        table = LigandPropertyBinding.__table__
        row = self.session.execute(
            select(table).where(table.c.entry_id == entry_id)
        ).mappings().one_or_none()
        return (
            PropertyBindingStamp(
                row["entry_id"], row["source_key"], row["input_hash"], row["incarnation"]
            )
            if row is not None
            else None
        )

    def _drop_binding(self, observed: PropertyBindingStamp | None) -> bool:
        if observed is None:
            return False
        changed: Any = self.session.execute(
            delete(LigandPropertyBinding)
            .where(
                LigandPropertyBinding.entry_id == observed.entry_id,
                LigandPropertyBinding.source_key == observed.source_key,
                LigandPropertyBinding.input_hash == observed.input_hash,
                LigandPropertyBinding.incarnation == observed.incarnation,
            )
            .execution_options(synchronize_session="fetch")
        )
        if changed.rowcount == 1:
            self._retired_source = True
            return True
        return False

    def _lock_retirement(self, project_id: str) -> None:
        # A cache integrity check may already own SQLite's writer transaction.
        # A no-op private-table write serializes without nested BEGIN or a commit.
        if self.session.connection().dialect.name == "sqlite":
            self.session.execute(
                update(LigandPropertyBinding)
                .where(LigandPropertyBinding.entry_id == "")
                .values(incarnation=LigandPropertyBinding.incarnation)
            )
        else:
            self.session.execute(
                select(Project.id).where(Project.id == project_id).with_for_update()
            )
        self.session.expire_all()

    def _read_target(
        self,
        project_id: str,
        source: LigandPropertySource,
        key: str,
        consumers: list[LigandPropertyConsumer],
    ) -> dict[str, Any]:
        raw = source.model_dump(mode="json")
        return {
            "project_id": project_id,
            "source": raw,
            "source_key": key,
            "consumers": [
                {
                    "id": owner.id,
                    "generation": owner.generation,
                    "descriptor_ids": list(self._effective(tuple(owner.descriptor_ids))),
                }
                for owner in consumers
                if owner.project_id == project_id and raw in owner.entries_json
            ],
        }

    def _retire_source(
        self,
        target: dict[str, Any],
        observed: PropertyBindingStamp | None,
        reason: str,
    ) -> bool:
        """Caller holds publication authority; stale observations grant no mutation."""
        source = LigandPropertySource.model_validate(target["source"])
        try:
            entry = self.verify(target["project_id"], source)
        except (EntryNotFoundError, StructureArtifactConflictError):
            return False
        if (
            source_key(source, entry.original_artifact_id) != target["source_key"]
            or self._binding_stamp(source.entry_id) != observed
            or (target["consumers"] and not self._target_live(target))
        ):
            return False
        if observed is not None and not self._drop_binding(observed):
            return False
        self._fail_target(target, reason)
        self._retired_source = True
        return True

    def _recheck_failure(
        self,
        target: dict[str, Any],
        observed: PropertyBindingStamp | None,
        verification: PropertySourceVerification,
    ) -> bool:
        source = LigandPropertySource.model_validate(target["source"])
        try:
            entry = self.verify(target["project_id"], source)
            if (
                source_key(source, entry.original_artifact_id) != target["source_key"]
                or self._binding_stamp(source.entry_id) != observed
                or (target["consumers"] and not self._target_live(target))
            ):
                return False
            verification.fingerprint(entry, source)
        except (EntryNotFoundError, StructureArtifactConflictError):
            return False
        except PropertySourceFailure as failure:
            if not failure.capacity:
                return self._retire_source(target, observed, failure.reason)
        return False

    def _retire_invalid_binding(
        self,
        target: dict[str, Any],
        observed: PropertyBindingStamp | None,
        verification: PropertySourceVerification,
    ) -> None:
        self._lock_retirement(target["project_id"])
        source = LigandPropertySource.model_validate(target["source"])
        try:
            entry = self.verify(target["project_id"], source)
            if (
                source_key(source, entry.original_artifact_id) != target["source_key"]
                or self._binding_stamp(source.entry_id) != observed
                or (target["consumers"] and not self._target_live(target))
            ):
                return
            verified = verification.fingerprint(entry, source)
        except (EntryNotFoundError, StructureArtifactConflictError):
            return
        except PropertySourceFailure as failure:
            if not failure.capacity:
                self._retire_source(target, observed, failure.reason)
            return
        binding = self.session.get(LigandPropertyBinding, source.entry_id)
        if binding is not None and (
            binding.source_key != target["source_key"]
            or binding.source != target["source"]
            or self.cache.read_associated(binding.input_hash, verified.fingerprint) is None
        ):
            self._drop_binding(observed)

    def _current(
        self,
        project_id: str,
        source: LigandPropertySource,
        coverage: tuple[str, ...],
        consumers: list[LigandPropertyConsumer],
        verification: PropertySourceVerification,
        retirement_verification: PropertySourceVerification,
    ) -> LigandPropertyCurrentRead:
        entry = self.verify(project_id, source)
        key = source_key(source, entry.original_artifact_id)
        observed = self._binding_stamp(source.entry_id)
        target = self._read_target(project_id, source, key, consumers)
        partial_report = None
        if not coverage:
            return LigandPropertyCurrentRead(
                source=source,
                binding_key=key,
                status="unavailable",
                reason="no_properties_requested",
            )
        try:
            verified = verification.fingerprint(entry, source)
        except PropertySourceFailure as failure:
            if not failure.capacity:
                self._lock_retirement(project_id)
                self._recheck_failure(target, observed, retirement_verification)
            return LigandPropertyCurrentRead(
                source=source, binding_key=key, status=failure.status, reason=failure.reason
            )
        binding = self.session.get(LigandPropertyBinding, source.entry_id)
        if binding is not None:
            if binding.source_key == key and binding.source == source.model_dump(mode="json"):
                report = self.cache.read_associated(binding.input_hash, verified.fingerprint)
                partial_report = report
                if report is not None and set(coverage).issubset(report.coverage):
                    return LigandPropertyCurrentRead(
                        source=source, binding_key=key, status="ready", report=report, progress=100
                    )
                if report is None:
                    self._retire_invalid_binding(target, observed, retirement_verification)
            elif binding.source_key == key:
                self._retire_invalid_binding(target, observed, retirement_verification)
        requested = [
            consumer
            for consumer in consumers
            if consumer.project_id == project_id
            and source.model_dump(mode="json") in consumer.entries_json
        ]
        if requested and all(key in consumer.failures for consumer in requested):
            return LigandPropertyCurrentRead(
                source=source, binding_key=key, status="failed", reason=requested[0].failures[key]
            )
        progress = 0.0
        running = self.session.scalars(
            select(Job).where(
                Job.project_id == project_id,
                Job.purpose == PROPERTY_PURPOSE,
                Job.status == "running",
            )
        ).all()
        for job in running:
            execution = private_execution(self.session, job)
            if execution is not None and any(
                target["source_key"] == key
                for capture in execution.captures
                for target in capture["targets"]
            ):
                progress = max(progress, job.progress)
        return LigandPropertyCurrentRead(
            source=source,
            binding_key=key,
            status="pending",
            report=partial_report,
            progress=progress,
        )

    def read(
        self, project_id: str, payload: LigandPropertyReadRequest
    ) -> LigandPropertyAggregateRead:
        self._project(project_id)
        consumers = self._live_consumers()
        coverage = self._effective(payload.descriptor_ids)
        verification = PropertySourceVerification(self)
        retirement_verification = PropertySourceVerification(self, budget=verification)
        result = LigandPropertyAggregateRead(
            project_id=project_id,
            entries=tuple(
                self._current(
                    project_id, source, coverage, consumers, verification, retirement_verification
                )
                for source in payload.entries
            ),
        )
        # Integrity retirement concerns derived data only, never the project command stream.
        if self.session.deleted or self.session.dirty or self._retired_source:
            self._commit_derived()
        return result

    def allocate_consumer(self, project_id: str) -> LigandPropertyAggregateRead:
        lock_project_publication(self.session, project_id)
        self._project(project_id)
        self._prune_consumers()
        all_rows = list(self.session.scalars(select(LigandPropertyConsumer)).all())
        active = [
            value for value in all_rows if not value.released and utc(value.expires_at) > utc_now()
        ]
        if len(all_rows) >= MAX_CONSUMER_RECORDS or len(active) >= MAX_CONSUMERS:
            raise PropertyCapacityError("Property consumer capacity is currently full")
        row = LigandPropertyConsumer(
            id=str(uuid7()),
            project_id=project_id,
            sequence=0,
            generation=0,
            entries_json=[],
            descriptor_ids=[],
            active_entry_id=None,
            expires_at=utc_now() + timedelta(seconds=CONSUMER_LEASE_SECONDS),
            released=False,
            failures={},
        )
        self.session.add(row)
        self._commit_derived()
        return LigandPropertyAggregateRead(
            project_id=project_id,
            entries=(),
            consumer_id=row.id,
            sequence=0,
            expires_at=utc(row.expires_at),
        )

    def update_consumer(
        self, project_id: str, consumer_id: str, payload: LigandPropertyConsumerUpdate
    ) -> LigandPropertyAggregateRead:
        try:
            UUID(consumer_id)
        except ValueError as error:
            raise InvalidProjectOperationError(
                "A valid issued property owner is required"
            ) from error
        lock_project_publication(self.session, project_id)
        self.session.expire_all()
        self._project(project_id)
        for source in payload.entries:
            self.verify(project_id, source)
        row = self.session.get(LigandPropertyConsumer, consumer_id)
        entries = sorted(
            (source.model_dump(mode="json") for source in payload.entries),
            key=lambda source: source["entry_id"],
        )
        if row is not None:
            if row.project_id != project_id or payload.sequence < row.sequence:
                raise PropertyConsumerConflict("The property consumer request was superseded")
            if payload.sequence == row.sequence and (
                row.released
                or row.entries_json != entries
                or row.descriptor_ids != list(payload.descriptor_ids)
                or row.active_entry_id != payload.active_entry_id
            ):
                raise PropertyConsumerConflict("A request sequence cannot describe different input")
        else:
            raise PropertyConsumerExpired(
                "Property consumer ownership expired; allocate a new owner"
            )
        if utc(row.expires_at) <= utc_now():
            raise PropertyConsumerExpired(
                "Property consumer ownership expired; allocate a new owner"
            )
        others = [value for value in self._live_consumers() if value.id != consumer_id]
        if len(others) >= MAX_CONSUMERS:
            raise PropertyCapacityError("Property consumer capacity is currently full")
        if sum(len(value.entries_json) for value in others) + len(entries) > MAX_DEMAND_ENTRIES:
            raise PropertyCapacityError("Property entry demand exceeds the supported capacity")
        if payload.sequence > row.sequence:
            priority_only = (
                not row.released
                and row.entries_json == entries
                and row.descriptor_ids == list(payload.descriptor_ids)
                and row.active_entry_id != payload.active_entry_id
            )
            if not priority_only:
                # A higher otherwise-identical sequence is an explicit Retry.
                row.generation += 1
                row.failures = {}
                row.updated_at = utc_now()
        row.sequence = payload.sequence
        row.entries_json = entries
        row.descriptor_ids = list(payload.descriptor_ids)
        row.active_entry_id = payload.active_entry_id
        row.expires_at = utc_now() + timedelta(seconds=CONSUMER_LEASE_SECONDS)
        row.released = False
        self._commit_derived()
        result = self.read(project_id, payload)
        return result.model_copy(
            update={
                "consumer_id": consumer_id,
                "sequence": row.sequence,
                "expires_at": utc(row.expires_at),
            }
        )

    def release_consumer(self, project_id: str, consumer_id: str, sequence: int) -> dict[str, Any]:
        try:
            UUID(consumer_id)
        except ValueError as error:
            raise InvalidProjectOperationError(
                "A valid issued property owner is required"
            ) from error
        lock_project_publication(self.session, project_id)
        self._project(project_id)
        row = self.session.get(LigandPropertyConsumer, consumer_id)
        if row is None:
            self.session.rollback()
            return {"consumer_id": consumer_id, "sequence": sequence, "released": True}
        elif row.project_id != project_id or sequence < row.sequence:
            raise PropertyConsumerConflict("The property consumer release was superseded")
        elif sequence == row.sequence and not row.released:
            raise PropertyConsumerConflict("Release must advance the active request sequence")
        if sequence > row.sequence or not row.released:
            row.generation += 1
            row.updated_at = utc_now()
        row.sequence = sequence
        row.released = True
        self._commit_derived()
        return {"consumer_id": consumer_id, "sequence": sequence, "released": True}

    def _prune_consumers(self) -> None:
        self.session.execute(
            delete(LigandPropertyConsumer).where(
                LigandPropertyConsumer.expires_at < utc_now(),
            )
        )

    def _snapshot(self, artifact_id: str) -> dict[str, Any]:
        artifact = self.session.get(Artifact, artifact_id)
        if artifact is None:
            raise ValueError("A captured ligand artifact is missing")
        return {
            "id": artifact.id,
            "sha256": artifact.sha256,
            "size": artifact.size,
            "media_type": artifact.media_type,
            "filename": artifact.filename,
        }

    def _capture_bytes(self, snapshot: dict[str, Any]) -> bytes:
        data = self.artifacts.read_bounded_verified_bytes(
            snapshot["id"], min(MAX_CAPTURE_BYTES, max(1, snapshot["size"]))
        )
        if len(data) != snapshot["size"] or hashlib.sha256(data).hexdigest() != snapshot["sha256"]:
            raise ValueError("Captured ligand artifact no longer matches its immutable source")
        return data

    def _owner_live(self, target: dict[str, Any], owner: dict[str, Any]) -> bool:
        consumer = self.session.get(LigandPropertyConsumer, owner["id"])
        return (
            consumer is not None
            and consumer.project_id == target["project_id"]
            and not consumer.released
            and utc(consumer.expires_at) > utc_now()
            and consumer.generation == owner["generation"]
            and target["source_key"] not in consumer.failures
            and target["source"] in consumer.entries_json
            and bool(
                set(owner["descriptor_ids"])
                & set(self._effective(tuple(consumer.descriptor_ids)))
            )
        )

    def _target_live(self, target: dict[str, Any], *, coverage: tuple[str, ...] = ()) -> bool:
        source = LigandPropertySource.model_validate(target["source"])
        try:
            entry = self.verify(target["project_id"], source)
        except (EntryNotFoundError, StructureArtifactConflictError):
            return False
        if source_key(source, entry.original_artifact_id) != target["source_key"]:
            return False
        return any(
            self._owner_live(target, owner)
            and (not coverage or bool(set(coverage) & set(owner["descriptor_ids"])))
            for owner in target["consumers"]
        )

    def _bind(self, target: dict[str, Any], input_hash: str) -> None:
        source = LigandPropertySource.model_validate(target["source"])
        binding = self.session.get(LigandPropertyBinding, source.entry_id)
        if binding is None:
            binding = LigandPropertyBinding(entry_id=source.entry_id)
            self.session.add(binding)
        binding.source_key = target["source_key"]
        binding.source = target["source"]
        binding.input_hash = input_hash
        binding.incarnation = str(uuid7())
        binding.created_at = utc_now()

    def _fail_target(self, target: dict[str, Any], reason: str) -> None:
        if not self._target_live(target):
            return
        for owner in target["consumers"]:
            row = self.session.get(LigandPropertyConsumer, owner["id"])
            if row is not None and self._owner_live(target, owner):
                self.session.execute(
                    update(LigandPropertyConsumer)
                    .where(
                        LigandPropertyConsumer.id == row.id,
                        LigandPropertyConsumer.generation == owner["generation"],
                    )
                    .values(failures={**row.failures, target["source_key"]: reason[:500]})
                    .execution_options(synchronize_session="fetch")
                )

    def materialize(
        self, worker_id: str, *, prefer_bulk: bool = False, implementation_enabled: bool = True
    ) -> Job | bool | None:
        """Verify bounded raw sources; native qualification belongs exclusively to children."""
        started = time.perf_counter()
        self.last_metrics = {
            "source_proofs": 0,
            "verified_bytes": 0,
            "raw_proof_seconds": 0.0,
            "warm_bindings": 0,
            "child_reports": 0,
            "coordinator_native_preparations": 0,
        }
        consumers = self._live_consumers()
        pending: dict[str, dict[str, Any]] = {}
        for consumer in consumers:
            coverage = self._effective(tuple(consumer.descriptor_ids))
            if not coverage:
                continue
            for raw in consumer.entries_json:
                source = LigandPropertySource.model_validate(raw)
                try:
                    entry = self.verify(consumer.project_id, source)
                except (EntryNotFoundError, StructureArtifactConflictError):
                    continue
                key = source_key(source, entry.original_artifact_id)
                if key in consumer.failures:
                    continue
                bound = self.session.get(LigandPropertyBinding, entry.id)
                covered_hint = False
                if bound is not None and bound.source_key == key and bound.source == raw:
                    report = self.cache.read(bound.input_hash)
                    covered_hint = report is not None and set(coverage).issubset(report.coverage)
                    if covered_hint and consumer.active_entry_id != source.entry_id:
                        continue
                target = pending.setdefault(
                    key,
                    {
                        "source": raw,
                        "source_key": key,
                        "project_id": consumer.project_id,
                        "coverage": set(),
                        "consumers": [],
                        "active": False,
                        "covered_hint": covered_hint,
                        "updated_at": utc(consumer.updated_at),
                    },
                )
                target["coverage"].update(coverage)
                target["covered_hint"] &= covered_hint
                target["consumers"].append(
                    {
                        "id": consumer.id,
                        "generation": consumer.generation,
                        "descriptor_ids": list(coverage),
                    }
                )
                target["active"] |= consumer.active_entry_id == source.entry_id
        if not pending:
            self._commit_derived()
            self.last_metrics["coordinator_seconds"] = time.perf_counter() - started
            return None
        if not implementation_enabled:
            for target in pending.values():
                self._lock_retirement(target["project_id"])
                self._fail_target(
                    target, "The descriptor implementation is disabled in this worker"
                )
            self._commit_derived()
            self.last_metrics["coordinator_seconds"] = time.perf_counter() - started
            return True
        ordered = sorted(
            pending.values(),
            key=lambda target: (
                (target["active"] if prefer_bulk else not target["active"]),
                target["covered_hint"],
                target["updated_at"],
                target["source_key"],
            ),
        )
        project_id = ordered[0]["project_id"]
        prepared: dict[str, dict[str, Any]] = {}
        immediate: list[tuple[dict[str, Any], str, str, PropertyBindingStamp | None]] = []
        failures: list[tuple[dict[str, Any], PropertyBindingStamp | None]] = []
        captured_bytes, considered = 0, 0
        verification = PropertySourceVerification(self)
        for target in ordered:
            if target["project_id"] != project_id:
                continue
            if considered >= MAX_BATCH_SIZE:
                break
            considered += 1
            source = LigandPropertySource.model_validate(target["source"])
            observed = self._binding_stamp(source.entry_id)
            try:
                entry = self.verify(project_id, source)
                before_proof = time.perf_counter()
                verified = verification.fingerprint(entry, source)
                normalized, original, fingerprint = (
                    verified.normalized,
                    verified.original,
                    verified.fingerprint,
                )
                size = normalized["size"] + (original["size"] if original else 0)
                if captured_bytes + size > MAX_CAPTURE_BYTES:
                    continue
                self.last_metrics["verified_bytes"] = verification.verified_bytes
                self.last_metrics["source_proofs"] += 1
                self.last_metrics["raw_proof_computations"] = verification.proof_computations
                self.last_metrics["raw_proof_seconds"] += time.perf_counter() - before_proof
                bound = self.session.get(LigandPropertyBinding, source.entry_id)
                existing = (
                    self.cache.read_associated(bound.input_hash, fingerprint)
                    if bound is not None
                    else None
                )
                if existing is None:
                    existing = self.cache.read_proof(fingerprint)
                required = descriptor_coverage(target["coverage"])
                missing = tuple(
                    key for key in required if existing is None or key not in existing.coverage
                )
                if not missing:
                    assert existing is not None
                    immediate.append((target, fingerprint, existing.input_hash, observed))
                    captured_bytes += size
                    continue
                capture = prepared.setdefault(
                    fingerprint,
                    {
                        "source": source.model_dump(mode="json"),
                        "normalized": normalized,
                        "original": original,
                        "semantic_fingerprint": fingerprint,
                        "expected_input_hash": existing.input_hash
                        if existing is not None
                        else None,
                        "descriptor_ids": [],
                        "targets": [],
                    },
                )
                capture["descriptor_ids"] = list(
                    descriptor_coverage(set(capture["descriptor_ids"]) | set(missing))
                )
                capture["targets"].append(
                    {
                        key: target[key]
                        for key in ("source", "source_key", "project_id", "consumers", "active")
                    }
                )
                captured_bytes += size
            except PropertySourceFailure as failure:
                if not failure.capacity:
                    failures.append((target, observed))
            except PropertyCacheError:
                # Cache failures are latched by the worker, separately from source failures.
                raise
            except (ValueError, OSError, ArtifactIntegrityError, ArtifactNotFoundError):
                failures.append((target, observed))
        self.last_metrics["verified_bytes"] = verification.verified_bytes
        self.last_metrics["source_read_calls"] = verification.read_calls
        self.last_metrics["source_read_byte_cap"] = verification.read_byte_cap
        self._commit_derived()
        lock_project_publication(self.session, project_id)
        self.session.expire_all()
        publication_verification = PropertySourceVerification(self)
        for target, fingerprint, input_hash, observed in immediate:
            if not self._target_live(target):
                continue
            source = LigandPropertySource.model_validate(target["source"])
            try:
                entry = self.verify(project_id, source)
                current_proof = publication_verification.fingerprint(entry, source)
            except PropertySourceFailure as failure:
                if not failure.capacity:
                    self._retire_source(target, observed, failure.reason)
                continue
            if current_proof.fingerprint != fingerprint:
                self._retire_source(
                    target, observed, "Current source proof changed; retry the current input."
                )
                continue
            reusable = self.cache.read_associated(input_hash, fingerprint)
            if reusable is not None and set(target["coverage"]).issubset(reusable.coverage):
                bound = self.session.get(LigandPropertyBinding, source.entry_id)
                if (
                    bound is None
                    or bound.source_key != target["source_key"]
                    or bound.source != target["source"]
                    or bound.input_hash != reusable.input_hash
                ):
                    self._bind(target, reusable.input_hash)
                    self.last_metrics["warm_bindings"] += 1
        for target, observed in failures:
            self._recheck_failure(target, observed, publication_verification)
        self.last_metrics["publication_verified_bytes"] = publication_verification.verified_bytes
        self.last_metrics["publication_source_reads"] = publication_verification.read_calls
        self.last_metrics["publication_read_byte_cap"] = publication_verification.read_byte_cap
        captures = []
        for capture in prepared.values():
            capture["targets"] = [
                target for target in capture["targets"] if self._target_live(target)
            ]
            if capture["targets"]:
                captures.append(capture)
        self.last_metrics["coordinator_seconds"] = time.perf_counter() - started
        self.last_metrics["child_reports"] = len(captures)
        if not captures:
            self._commit_derived()
            return bool(self.last_metrics["warm_bindings"] or failures)
        if self.session.scalar(
            select(Job.id).where(Job.status == "running", Job.purpose == PROPERTY_PURPOSE)
        ):
            self._commit_derived()
            return bool(self.last_metrics["warm_bindings"] or failures)
        execution_id, job_id = str(uuid7()), str(uuid7())
        job = Job(
            id=job_id,
            project_id=project_id,
            purpose=PROPERTY_PURPOSE,
            plugin_name="neistra.ligand_properties",
            job_type=PROPERTY_JOB_TYPE,
            implementation_version=IMPLEMENTATION_VERSION,
            status="running",
            progress=0,
            parameters={"execution_id": execution_id},
            provenance={"schema_version": 1, "source_capture": dict(self.last_metrics)},
            worker_id=worker_id,
            started_at=utc_now(),
            status_message="Calculating ligand properties",
        )
        self.session.add(job)
        self.session.flush()
        self.session.add(
            LigandPropertyExecution(
                id=execution_id,
                job_id=job_id,
                project_id=project_id,
                captures=captures,
                reaped=False,
            )
        )
        self._commit_derived()
        return job

    def execution_inputs(self, job: Job) -> tuple[Any, ...]:
        from neistra_api.job_worker import ChildInput

        execution = private_execution(self.session, job)
        if (
            execution is None
            or execution.reaped
            or not any(
                self._target_live(target)
                for capture in execution.captures
                for target in capture["targets"]
            )
        ):
            raise ValueError("Derived execution has no current private capture ownership")
        inputs: list[ChildInput] = []
        started = time.perf_counter()
        verified_bytes = 0
        for capture in execution.captures:
            source = LigandPropertySource.model_validate(capture["source"])
            normalized = self._capture_bytes(capture["normalized"])
            original = self._capture_bytes(capture["original"]) if capture["original"] else None
            verified_bytes += len(normalized) + len(original or b"")
            import base64

            envelope = json.dumps(
                {
                    "structure": json.loads(normalized),
                    "original_base64": base64.b64encode(original).decode()
                    if original is not None
                    else None,
                    "atom_ids": list(source.atom_ids),
                    "descriptor_ids": capture["descriptor_ids"],
                    "semantic_fingerprint": capture["semantic_fingerprint"],
                    "original_identity": capture["original"],
                    "expected_input_hash": capture["expected_input_hash"],
                },
                separators=(",", ":"),
            ).encode()
            if len(envelope) + sum(len(item.data) for item in inputs) > MAX_CAPTURE_ENVELOPE_BYTES:
                raise ValueError("Descriptor capture envelopes exceed the supported byte budget")
            inputs.append(
                ChildInput(
                    entry_id=source.entry_id,
                    entry_name="Ligand properties",
                    structure_type="ligand",
                    role="ligand",
                    artifact_id=source.source_artifact_id,
                    sha256=hashlib.sha256(envelope).hexdigest(),
                    media_type="application/json",
                    filename="ligand-property-capture.json",
                    data=envelope,
                )
            )
        self.last_metrics = {
            "verified_bytes": verified_bytes,
            "envelope_bytes": sum(len(item.data) for item in inputs),
            "source_count": len(inputs),
            "seconds": time.perf_counter() - started,
        }
        job.provenance = {**job.provenance, "input_materialization": dict(self.last_metrics)}
        self._commit_derived()
        return tuple(inputs)

    def execution_live(self, job: Job) -> bool:
        execution = private_execution(self.session, job)
        if execution is None or execution.reaped:
            return False
        return any(
            self._target_live(target)
            for capture in execution.captures
            for target in capture["targets"]
        )

    def complete(self, job: Job, values: dict[str, Any]) -> None:
        execution = private_execution(self.session, job)
        if execution is None or execution.reaped:
            raise ValueError("Unowned derived execution cannot publish descriptor content")
        raw_reports, timings = values.get("reports"), values.get("stage_timings")
        expected = {capture["semantic_fingerprint"]: capture for capture in execution.captures}
        if (
            not isinstance(raw_reports, list)
            or len(raw_reports) != len(expected)
            or not isinstance(timings, list)
            or len(timings) != len(expected)
        ):
            raise ValueError("Derived report does not match bounded captured input")
        reports: dict[str, DescriptorReport] = {}
        for raw in raw_reports:
            if not isinstance(raw, dict) or set(raw) != {"semantic_fingerprint", "report"}:
                raise ValueError("Invalid derived report proof wrapper")
            fingerprint = raw["semantic_fingerprint"]
            if fingerprint not in expected or fingerprint in reports:
                raise ValueError("Derived report proof identity mismatch")
            report = DescriptorReport.model_validate(raw["report"])
            capture = expected[fingerprint]
            if (
                tuple(report.coverage) != tuple(capture["descriptor_ids"])
                or (report.implementation_version, report.policy_version, report.library_version)
                != (IMPLEMENTATION_VERSION, POLICY_VERSION, LIBRARY_VERSION)
                or (
                    capture["expected_input_hash"] is not None
                    and report.input_hash != capture["expected_input_hash"]
                )
            ):
                raise ValueError("Derived report implementation/coverage mismatch")
            reports[fingerprint] = report
        timing_keys = {
            "semantic_fingerprint",
            "raw_proof_seconds",
            "prepare_seconds",
            "calculate_seconds",
            "capture_bytes",
        }
        seen = set()
        for timing in timings:
            if not isinstance(timing, dict) or set(timing) != timing_keys:
                raise ValueError("Invalid bounded descriptor stage evidence")
            fingerprint = timing["semantic_fingerprint"]
            if fingerprint not in expected or fingerprint in seen:
                raise ValueError("Descriptor stage evidence identity mismatch")
            seen.add(fingerprint)
            if (
                type(timing["capture_bytes"]) is not int
                or not 0 < timing["capture_bytes"] <= MAX_CAPTURE_ENVELOPE_BYTES
            ):
                raise ValueError("Invalid descriptor stage byte count")
            for field in ("raw_proof_seconds", "prepare_seconds", "calculate_seconds"):
                number = timing[field]
                if type(number) not in {int, float} or not math.isfinite(number) or number < 0:
                    raise ValueError("Descriptor stage durations must be finite and nonnegative")
        self._commit_derived()
        lock_project_publication(self.session, execution.project_id)
        self.session.expire_all()
        current = self.session.get(Job, job.id)
        if current is None or current.status != "running":
            self.session.rollback()
            return
        execution = private_execution(self.session, current)
        if execution is None:
            raise ValueError("Derived execution ownership changed")
        publication_started = time.perf_counter()
        publication_verification = PropertySourceVerification(self)
        if not current.cancellation_requested:
            for fingerprint, report in reports.items():
                self.cache.publish(report, semantic_fingerprints=(fingerprint,))
                associated = self.cache.read_associated(report.input_hash, fingerprint)
                if associated is None:
                    raise ValueError("The published descriptor source proof failed verification")
                for target in expected[fingerprint]["targets"]:
                    if not self._target_live(target):
                        continue
                    source = LigandPropertySource.model_validate(target["source"])
                    observed = self._binding_stamp(source.entry_id)
                    try:
                        entry = self.verify(target["project_id"], source)
                        verified = publication_verification.fingerprint(entry, source)
                    except PropertySourceFailure as failure:
                        if not failure.capacity:
                            self._retire_source(target, observed, failure.reason)
                        continue
                    if verified.fingerprint != fingerprint:
                        self._retire_source(
                            target,
                            observed,
                            "Current source proof changed; retry the current input.",
                        )
                        continue
                    self._bind(target, report.input_hash)
        current.provenance = {
            **current.provenance,
            "publication_verification": {
                "verified_bytes": publication_verification.verified_bytes,
                "source_reads": publication_verification.read_calls,
                "raw_proof_computations": publication_verification.proof_computations,
                "read_byte_cap": publication_verification.read_byte_cap,
                "seconds": time.perf_counter() - publication_started,
            },
        }
        current.status = "cancelled" if current.cancellation_requested else "completed"
        current.progress = 100
        current.completed_at = utc_now()
        current.status_message = (
            "Property request retired"
            if current.cancellation_requested
            else "Ligand properties ready"
        )
        current.result_values = {"stage_timings": timings}
        self._commit_derived()

    def fail_live_demands(self, reason: str) -> None:
        targets = []
        for consumer in self._live_consumers():
            for raw in consumer.entries_json:
                source = LigandPropertySource.model_validate(raw)
                try:
                    entry = self.verify(consumer.project_id, source)
                except (EntryNotFoundError, StructureArtifactConflictError):
                    continue
                targets.append(
                    self._read_target(
                        consumer.project_id,
                        source,
                        source_key(source, entry.original_artifact_id),
                        [consumer],
                    )
                )
        for target in targets:
            self._lock_retirement(target["project_id"])
            self._fail_target(target, reason)
        self._commit_derived()

    def fail_execution(self, job: Job, reason: str) -> None:
        execution = private_execution(self.session, job)
        if execution is not None:
            self._lock_retirement(execution.project_id)
            execution = private_execution(self.session, job)
            if execution is not None:
                for capture in execution.captures:
                    for target in capture["targets"]:
                        self._fail_target(target, reason)

    def reaped(self, job_id: str) -> None:
        execution = self.session.scalar(
            select(LigandPropertyExecution).where(
                LigandPropertyExecution.job_id == job_id,
            )
        )
        if execution is not None:
            execution.reaped = True
            self.prune_executions()
            self._commit_derived()

    def prune_executions(self) -> None:
        rows = list(
            self.session.scalars(
                select(LigandPropertyExecution)
                .where(LigandPropertyExecution.reaped.is_(True))
                .order_by(LigandPropertyExecution.created_at.desc())
            ).all()
        )
        retained = 0
        for execution in rows:
            job = self.session.get(Job, execution.job_id)
            if job is None:
                self.session.delete(execution)
                continue
            if private_execution(self.session, job) is None:
                continue
            retained += 1
            if retained > MAX_TERMINAL_EXECUTIONS and job.status in {
                "completed",
                "failed",
                "cancelled",
            }:
                self.session.delete(execution)
                self.session.delete(job)
