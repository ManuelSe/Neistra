from __future__ import annotations

from collections import Counter
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any

from molweave_core.artifacts import LocalArtifactStore
from molweave_core.jobs import PluginRegistry, ResultArtifact
from molweave_core.molecular import NormalizedStructureV1
from pydantic import ValidationError
from sqlalchemy import Select, select, update
from sqlalchemy.orm import Session, selectinload
from uuid6 import uuid7

from molweave_api.import_export import (
    ArtifactService,
    safe_display_filename,
)
from molweave_api.models import (
    Artifact,
    Job,
    JobEvent,
    JobInput,
    JobResultArtifact,
    Project,
    StructureEntry,
)
from molweave_api.project_service import (
    EntryNotFoundError,
    ProjectNotFoundError,
    ProjectService,
    RevisionConflictError,
)
from molweave_api.settings import Settings
from molweave_api.viewer_state import default_viewer_settings

TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})


class JobNotFoundError(LookupError):
    pass


class JobResultNotFoundError(LookupError):
    pass


class InvalidJobOperationError(ValueError):
    pass


class JobConflictError(RuntimeError):
    pass


def utc_now() -> datetime:
    return datetime.now(UTC)


class JobService:
    def __init__(
        self,
        session: Session,
        settings: Settings,
        registry: PluginRegistry,
    ) -> None:
        self.session = session
        self.settings = settings
        self.registry = registry
        self.artifacts = ArtifactService(session, LocalArtifactStore(settings.data_dir))

    def submit(
        self,
        project_id: str,
        job_type: str,
        parameters: dict[str, Any],
        inputs: list[dict[str, str]],
    ) -> Job:
        project = self.session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        try:
            registered = self.registry.get(job_type)
        except KeyError as error:
            raise InvalidJobOperationError(f"Unknown job type: {job_type}") from error
        try:
            validated = registered.definition.validate_parameters(parameters)
        except ValidationError as error:
            raise InvalidJobOperationError(str(error)) from error

        role_declarations = {role.role: role for role in registered.definition.input_roles}
        counts = Counter(str(item.get("role", "")) for item in inputs)
        unknown_roles = sorted(set(counts) - set(role_declarations))
        if unknown_roles:
            raise InvalidJobOperationError(
                f"Unknown input role(s): {', '.join(str(role) for role in unknown_roles)}"
            )
        for role_name, declaration in role_declarations.items():
            count = counts[role_name]
            if not declaration.minimum <= count <= declaration.maximum:
                raise InvalidJobOperationError(
                    f"Input role {role_name!r} requires {declaration.minimum} to "
                    f"{declaration.maximum} structures; received {count}."
                )

        snapshots: list[tuple[str, StructureEntry, Artifact]] = []
        seen: set[tuple[str, str]] = set()
        for requested in inputs:
            role_name = requested.get("role", "")
            entry_id = requested.get("entry_id", "")
            pair = (role_name, entry_id)
            if pair in seen:
                raise InvalidJobOperationError("The same entry cannot fill a role twice")
            seen.add(pair)
            entry = self.session.scalar(
                select(StructureEntry).where(
                    StructureEntry.project_id == project_id,
                    StructureEntry.id == entry_id,
                )
            )
            if entry is None:
                raise EntryNotFoundError(entry_id)
            declaration = role_declarations[role_name]
            if (
                declaration.structure_types
                and entry.structure_type not in declaration.structure_types
            ):
                raise InvalidJobOperationError(
                    f"{entry.name} has unsupported type {entry.structure_type!r} "
                    f"for role {role_name!r}."
                )
            if entry.current_artifact_id is None:
                raise InvalidJobOperationError(f"{entry.name} has no immutable current artifact")
            artifact = self.session.get(Artifact, entry.current_artifact_id)
            if artifact is None:
                raise InvalidJobOperationError(f"Current artifact for {entry.name} is missing")
            snapshots.append((role_name, entry, artifact))

        job_id = str(uuid7())
        canonical_parameters = validated.model_dump(mode="json")
        provenance = {
            "schema_version": 1,
            "job_id": job_id,
            "project_id": project_id,
            "project_revision": project.revision,
            "plugin_name": registered.plugin_name,
            "plugin_target": registered.plugin_target,
            "job_type": registered.definition.job_type,
            "implementation_version": registered.definition.implementation_version,
            "parameters": deepcopy(canonical_parameters),
            "inputs": [
                {
                    "role": role,
                    "entry_id": entry.id,
                    "artifact_id": artifact.id,
                    "sha256": artifact.sha256,
                    "size": artifact.size,
                }
                for role, entry, artifact in snapshots
            ],
        }
        job = Job(
            id=job_id,
            project_id=project_id,
            plugin_name=registered.plugin_name,
            job_type=registered.definition.job_type,
            implementation_version=registered.definition.implementation_version,
            status="queued",
            parameters=canonical_parameters,
            progress=0,
            status_message="Queued",
            provenance=provenance,
        )
        self.session.add(job)
        self.session.flush()
        for ordinal, (role, entry, artifact) in enumerate(snapshots):
            self.session.add(
                JobInput(
                    id=str(uuid7()),
                    job_id=job.id,
                    ordinal=ordinal,
                    role=role,
                    entry_id=entry.id,
                    entry_name=entry.name,
                    structure_type=entry.structure_type,
                    artifact_id=artifact.id,
                    artifact_sha256=artifact.sha256,
                    artifact_size=artifact.size,
                    media_type=artifact.media_type,
                    filename=artifact.filename,
                )
            )
            entry.job_links = [*entry.job_links, job.id]
        self.append_event(job, "state", "Job queued", {"status": "queued"})
        self.session.commit()
        return self.get(job.id)

    def list_project(self, project_id: str) -> list[Job]:
        if self.session.get(Project, project_id) is None:
            raise ProjectNotFoundError(project_id)
        return list(
            self.session.scalars(
                self._job_query()
                .where(Job.project_id == project_id)
                .order_by(Job.created_at.desc())
            ).all()
        )

    def get(self, job_id: str) -> Job:
        job = self.session.scalar(self._job_query().where(Job.id == job_id))
        if job is None:
            raise JobNotFoundError(job_id)
        return job

    def events(self, job_id: str, after_sequence: int = 0) -> list[JobEvent]:
        self._job(job_id)
        return list(
            self.session.scalars(
                select(JobEvent)
                .where(
                    JobEvent.job_id == job_id,
                    JobEvent.sequence > after_sequence,
                )
                .order_by(JobEvent.sequence)
            ).all()
        )

    def cancel(self, job_id: str) -> Job:
        job = self._job(job_id)
        if job.status in TERMINAL_STATUSES:
            raise JobConflictError(f"Job is already {job.status}")
        job.cancellation_requested = True
        if job.status == "queued":
            job.status = "cancelled"
            job.status_message = "Cancelled before execution"
            job.completed_at = utc_now()
            self.append_event(job, "state", job.status_message, {"status": "cancelled"})
        else:
            self.append_event(job, "cancellation", "Cancellation requested")
        self.session.commit()
        return self.get(job.id)

    def claim_next(self, worker_id: str) -> Job | None:
        candidate_id = self.session.scalar(
            select(Job.id).where(Job.status == "queued").order_by(Job.created_at).limit(1)
        )
        if candidate_id is None:
            return None
        now = utc_now()
        result: Any = self.session.execute(
            update(Job)
            .where(Job.id == candidate_id, Job.status == "queued")
            .values(
                status="running",
                worker_id=worker_id,
                started_at=now,
                status_message="Starting worker",
                modified_at=now,
            )
        )
        claimed = result.rowcount
        if claimed != 1:
            self.session.rollback()
            return None
        job = self._job(candidate_id)
        self.append_event(job, "state", "Job started", {"status": "running"})
        self.session.commit()
        return self.get(candidate_id)

    def recover_abandoned(self) -> int:
        jobs = list(self.session.scalars(select(Job).where(Job.status == "running")).all())
        for job in jobs:
            job.status = "failed"
            job.status_message = "Worker stopped before the job completed"
            job.error = {
                "code": "worker_lost",
                "message": job.status_message,
            }
            job.completed_at = utc_now()
            self.append_event(job, "state", job.status_message, {"status": "failed"})
        self.session.commit()
        return len(jobs)

    def progress(self, job_id: str, value: float, message: str) -> None:
        job = self._running(job_id)
        job.progress = min(100.0, max(job.progress, value))
        job.status_message = message[:500]
        self.append_event(
            job,
            "progress",
            job.status_message,
            {"progress": job.progress},
        )
        self.session.commit()

    def log(self, job_id: str, stream: str, message: str) -> None:
        job = self._running(job_id)
        self.append_event(job, "log", message[:20_000], stream=stream)
        self.session.commit()

    def complete(
        self,
        job_id: str,
        artifacts: tuple[ResultArtifact, ...],
        values: dict[str, Any],
        warnings: list[dict[str, Any]],
        message: str,
    ) -> Job:
        job = self._running(job_id)
        registered = self.registry.get(job.job_type)
        definitions = {item.role: item for item in registered.definition.result_roles}
        policy = registered.definition.resources
        if len(artifacts) > policy.max_result_artifacts:
            raise InvalidJobOperationError("Plugin returned too many result artifacts")
        if sum(len(item.data) for item in artifacts) > policy.max_result_bytes:
            raise InvalidJobOperationError("Plugin result exceeds its byte limit")
        for result in artifacts:
            definition = definitions.get(result.role)
            if definition is None or result.media_type not in definition.media_types:
                raise InvalidJobOperationError(
                    f"Plugin returned invalid artifact role/media type: {result.role}"
                )
            if definition.importable_structure:
                NormalizedStructureV1.from_bytes(result.data)
            artifact = self.artifacts.publish(
                result.data,
                safe_display_filename(result.filename),
                result.media_type,
            )
            result_record = JobResultArtifact(
                id=str(uuid7()),
                job_id=job.id,
                artifact_id=artifact.id,
                role=result.role,
                filename=result.filename,
                media_type=result.media_type,
                metadata_json=deepcopy(result.metadata),
                importable_structure=definition.importable_structure,
            )
            self.session.add(result_record)
            self.session.flush()
            for job_input in job.inputs:
                entry = self.session.get(StructureEntry, job_input.entry_id)
                if entry is not None:
                    entry.generated_results = [
                        *entry.generated_results,
                        result_record.id,
                    ]
        job.status = "completed"
        job.progress = 100
        job.status_message = message[:500]
        job.result_values = deepcopy(values)
        job.warnings = deepcopy(warnings)
        job.completed_at = utc_now()
        self.append_event(job, "state", job.status_message, {"status": "completed"})
        self.session.commit()
        return self.get(job.id)

    def fail(self, job_id: str, code: str, message: str) -> Job:
        job = self._job(job_id)
        if job.status in TERMINAL_STATUSES:
            return self.get(job.id)
        job.status = "failed"
        job.status_message = message[:500]
        job.error = {"code": code, "message": message}
        job.completed_at = utc_now()
        self.append_event(job, "state", job.status_message, {"status": "failed"})
        self.session.commit()
        return self.get(job.id)

    def cancelled(self, job_id: str, message: str = "Job cancelled") -> Job:
        job = self._job(job_id)
        if job.status in TERMINAL_STATUSES:
            return self.get(job.id)
        job.status = "cancelled"
        job.status_message = message[:500]
        job.completed_at = utc_now()
        self.append_event(job, "state", job.status_message, {"status": "cancelled"})
        self.session.commit()
        return self.get(job.id)

    def import_result(
        self,
        job_id: str,
        result_id: str,
        expected_revision: int,
        name: str | None,
    ) -> tuple[Any, str]:
        job = self.get(job_id)
        if job.status != "completed":
            raise JobConflictError("Only completed job results can be imported")
        result = next((item for item in job.results if item.id == result_id), None)
        if result is None:
            raise JobResultNotFoundError(result_id)
        if not result.importable_structure:
            raise InvalidJobOperationError("This result is not an importable structure")
        project = self.session.get(Project, job.project_id)
        if project is None:
            raise ProjectNotFoundError(job.project_id)
        if project.revision != expected_revision:
            raise RevisionConflictError(project.revision)
        _, data = self.artifacts.read(result.artifact_id)
        structure = NormalizedStructureV1.from_bytes(data)
        entry_id = str(uuid7())
        entry_state = {
            "id": entry_id,
            "group_id": None,
            "name": (name.strip() if name and name.strip() else structure.title)[:160],
            "description": f"Imported from job {job.id}",
            "structure_type": structure.structure_type,
            "original_filename": result.filename,
            "source_format": None,
            "normalized_data": {"schema_version": 1, "storage": "artifact"},
            "atom_count": len(structure.atoms),
            "atom_ids": [atom.id for atom in structure.atoms],
            "bond_count": len(structure.bonds),
            "residue_count": len(structure.residues),
            "conformer_count": len(structure.conformers),
            "warnings": [item.model_dump(mode="json") for item in structure.warnings],
            "next_atom_id": max((atom.id for atom in structure.atoms), default=0) + 1,
            "next_bond_id": max((bond.id for bond in structure.bonds), default=0) + 1,
            "viewer_settings": default_viewer_settings(structure.structure_type),
            "visible": True,
            "locked": False,
            "user_metadata": {
                "provenance": {
                    "job_id": job.id,
                    "job_result_id": result.id,
                    "input_entry_ids": [item.entry_id for item in job.inputs],
                    "input_artifact_sha256": [item.artifact_sha256 for item in job.inputs],
                    "implementation_version": job.implementation_version,
                    "parameters": deepcopy(job.parameters),
                }
            },
            "job_links": [job.id],
            "generated_results": [result.id],
            "original_artifact_id": result.artifact_id,
            "current_artifact_id": result.artifact_id,
            "created_at": utc_now().isoformat(),
        }
        result.imported_entry_ids = [*result.imported_entry_ids, entry_id]
        project_read = ProjectService(self.session).import_job_result(
            project.id, expected_revision, entry_state, job.id
        )
        return project_read, entry_id

    def append_event(
        self,
        job: Job,
        kind: str,
        message: str,
        data: dict[str, Any] | None = None,
        *,
        stream: str | None = None,
    ) -> JobEvent:
        self.session.flush()
        sequence = self.session.scalar(
            update(Job)
            .where(Job.id == job.id)
            .values(event_sequence=Job.event_sequence + 1)
            .returning(Job.event_sequence)
            .execution_options(synchronize_session=False)
        )
        if sequence is None:
            raise JobNotFoundError(job.id)
        event = JobEvent(
            job_id=job.id,
            sequence=sequence,
            kind=kind,
            stream=stream,
            message=message,
            data=data or {},
        )
        self.session.add(event)
        return event

    @staticmethod
    def _job_query() -> Select[tuple[Job]]:
        return select(Job).options(
            selectinload(Job.inputs),
            selectinload(Job.results),
        )

    def _job(self, job_id: str) -> Job:
        job = self.session.get(Job, job_id)
        if job is None:
            raise JobNotFoundError(job_id)
        return job

    def _running(self, job_id: str) -> Job:
        job = self._job(job_id)
        if job.status != "running":
            raise JobConflictError(f"Expected running job; found {job.status}")
        return job
