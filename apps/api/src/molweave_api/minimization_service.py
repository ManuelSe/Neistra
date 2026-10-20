from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from copy import deepcopy
from datetime import UTC, datetime
from math import isfinite
from typing import Any

from molweave_core.artifacts import LocalArtifactStore
from molweave_core.jobs import PluginRegistry
from molweave_core.minimization.capture import complete_membership
from molweave_core.minimization.contracts import (
    GRADIENT_TOLERANCE,
    JOB_TYPE,
    CalculationError,
    CapturedInput,
    CoordinateProposal,
    IdentityRecovery,
    MinimizationParameters,
    MinimizationReport,
    eligible_nonconvergence,
)
from molweave_core.minimization.discovery import ContextDiscovery, discover_context
from molweave_core.minimization.live import capture_digest, read_snapshot
from molweave_core.molecular import MolecularWarning, NormalizedStructureV1
from molweave_core.selection import SelectionV1
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from molweave_api.import_export import NORMALIZED_MEDIA_TYPE, ArtifactService
from molweave_api.job_service import (
    InvalidJobOperationError,
    JobConflictError,
    JobNotFoundError,
    JobService,
)
from molweave_api.minimization_schemas import (
    MinimizationApply,
    MinimizationCreate,
    MinimizationLiveRead,
    MinimizationPreviewSource,
    MinimizationProposalRead,
)
from molweave_api.models import Artifact, Job, Project, StructureEntry
from molweave_api.project_service import (
    EntryNotFoundError,
    InvalidProjectOperationError,
    ProjectNotFoundError,
    ProjectService,
    RevisionConflictError,
)
from molweave_api.schemas import ProjectRead
from molweave_api.settings import Settings
from molweave_api.source_identity import recover_original_identity


class MinimizationService:
    def __init__(self, session: Session, settings: Settings, registry: PluginRegistry) -> None:
        self.session = session
        self.settings = settings
        self.registry = registry
        self.artifacts = ArtifactService(session, LocalArtifactStore(settings.data_dir))

    def _project(self, project_id: str, expected_revision: int | None = None) -> Project:
        project = self.session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        if expected_revision is not None and project.revision != expected_revision:
            raise RevisionConflictError(project.revision)
        return project

    @staticmethod
    def _entry(project: Project, entry_id: str) -> StructureEntry:
        entry = next((e for e in project.entries if e.id == entry_id), None)
        if entry is None:
            raise EntryNotFoundError(entry_id)
        return entry

    def _read(self, artifact_id: str) -> tuple[Artifact, bytes]:
        artifact, data = self.artifacts.read(artifact_id)
        if len(data) != artifact.size or hashlib.sha256(data).hexdigest() != artifact.sha256:
            raise JobConflictError(
                "Stored calculation data failed integrity checks; rerun from verified sources"
            )
        return artifact, data

    @staticmethod
    def _structure(data: bytes) -> NormalizedStructureV1:
        try:
            return NormalizedStructureV1.from_bytes(data)
        except ValueError as error:
            raise JobConflictError(
                "Canonical source data is invalid; repair or reimport it before minimization"
            ) from error

    def submit(self, project_id: str, payload: MinimizationCreate) -> Job:
        project = self._project(project_id, payload.expected_revision)
        seeds: dict[str, set[int]] = defaultdict(set)
        for ref in payload.selection.atoms:
            seeds[ref.structure_id].add(ref.atom_id)
        moving = set(seeds)
        automatic = payload.mode == "automatic"
        mode = payload.mode
        if automatic:
            try:
                discovery = self._discover(project, payload.selection)
            except CalculationError as error:
                raise InvalidJobOperationError(f"{error.entry_id or 'Context'}: {error}") from error
            seeds = discovery.membership
            mode = "isolated" if discovery.component_count == 1 else "environment"
        else:
            for context in payload.context:
                seeds[context.entry_id].update(context.atom_ids)
        if not automatic and set(payload.conformers) != set(seeds):
            raise InvalidJobOperationError(
                "Confirm the active conformer for every selected/context entry"
            )
        captures: list[CapturedInput] = []
        for entry_id, members in sorted(seeds.items()):
            entry = self._entry(project, entry_id)
            if entry_id in moving and entry.locked:
                raise InvalidProjectOperationError(
                    f"Unlock {entry.name} before selecting movable atoms"
                )
            if entry.current_artifact_id is None:
                raise InvalidJobOperationError(
                    "Every calculation entry needs an immutable current artifact"
                )
            artifact, data = self._read(entry.current_artifact_id)
            structure = self._structure(data)
            if not automatic and payload.conformers[entry_id] != structure.active_conformer_id:
                raise JobConflictError(
                    "Active conformer changed; review the calculation and submit again"
                )
            try:
                members = complete_membership(structure, members)
            except CalculationError as error:
                raise InvalidJobOperationError(str(error)) from error
            if sum(len(c.atom_ids) for c in captures) + len(members) > 20_000:
                raise InvalidJobOperationError("Calculation exceeds 20000 atoms including H")
            recovered = recover_original_identity(
                entry, structure, self.artifacts, self.settings, atom_ids=members
            )
            captures.append(
                CapturedInput(
                    entry_id=entry_id,
                    artifact_id=artifact.id,
                    sha256=artifact.sha256,
                    conformer_id=structure.active_conformer_id,
                    atom_ids=sorted(members),
                    identity_recovery=IdentityRecovery(
                        original_artifact_id=recovered.original_artifact_id,
                        original_sha256=recovered.sha256,
                        atoms=list(recovered.atoms),
                    )
                    if recovered
                    else None,
                )
            )
        try:
            parameters = MinimizationParameters(
                schema_version=2
                if automatic
                or payload.acceptance_policy == "interactive"
                or any(c.identity_recovery is not None for c in captures)
                else 1,
                context_policy="automatic" if automatic else "manual",
                acceptance_policy=payload.acceptance_policy,
                mode=mode,
                selection=payload.selection,
                captured_inputs=captures,
                max_iterations=payload.max_iterations,
            )
        except ValidationError as error:
            raise InvalidJobOperationError(str(error)) from error
        # Capture and submission occur in the same request transaction. No client
        # artifact/hash or parameter-model JSON is accepted as source authority.
        return JobService(self.session, self.settings, self.registry).submit(
            project_id,
            JOB_TYPE,
            parameters.model_dump(mode="json"),
            [{"role": "calculation", "entry_id": c.entry_id} for c in captures],
            minimization_capture=True,
        )

    def _discover(
        self,
        project: Project,
        selection: SelectionV1,
        updates: dict[tuple[str, int], tuple[float, float, float]] | None = None,
    ) -> ContextDiscovery:
        def load(entry: StructureEntry) -> NormalizedStructureV1:
            if not entry.current_artifact_id:
                raise CalculationError(
                    "context_unavailable", "Entry has no canonical source", entry_id=entry.id
                )
            _, data = self._read(entry.current_artifact_id)
            return self._structure(data)

        selected = {ref.structure_id for ref in selection.atoms}
        sources = {entry_id: load(self._entry(project, entry_id)) for entry_id in selected}
        return discover_context(
            sources,
            (
                (entry.id, sources[entry.id] if entry.id in sources else load(entry))
                for entry in project.entries
            ),
            selection,
            updates,
        )

    def _automatic_context_reason(
        self,
        project: Project,
        parameters: MinimizationParameters,
        entries: list[CoordinateProposal],
    ) -> str | None:
        if parameters.context_policy != "automatic":
            return None
        try:
            updates = {
                (p.entry_id, atom_id): point
                for p in entries
                for atom_id, point in zip(p.atom_ids, p.coordinates, strict=True)
            }
            actual = self._discover(project, parameters.selection, updates).membership
            captured = {c.entry_id: set(c.atom_ids) for c in parameters.captured_inputs}
            # Supersets remain the captured physical model; newly relevant omitted
            # components require rerun. Moving away does not remove fixed context.
            if any(not ids <= captured.get(entry_id, set()) for entry_id, ids in actual.items()):
                return (
                    "Automatic context changed or final geometry reaches omitted context; "
                    "review context and rerun minimization"
                )
        except (CalculationError, ValueError) as error:
            return f"Automatic context cannot be verified; rerun minimization: {error}"
        return None

    def _job(self, project_id: str, job_id: str) -> Job:
        self._project(project_id)
        job = JobService(self.session, self.settings, self.registry).get(job_id)
        if job.project_id != project_id or job.job_type != JOB_TYPE:
            raise JobNotFoundError(job_id)
        return job

    def proposal(self, project_id: str, job_id: str) -> MinimizationProposalRead:
        job = self._job(project_id, job_id)
        if job.status != "completed":
            raise JobConflictError("A completed calculation report is required")
        result = [r for r in job.results if r.role == "proposal"]
        if len(result) != 1:
            raise JobConflictError("Calculation has no unique coordinate proposal")
        _, data = self._read(result[0].artifact_id)
        digest = hashlib.sha256(data).hexdigest()
        if digest != job.result_values.get("proposal_sha256") or digest != result[
            0
        ].metadata_json.get("proposal_sha256"):
            raise JobConflictError("Proposal digest does not match the completed job")
        try:
            document = json.loads(data)
            if (
                set(document) != {"schema_version", "parameters", "entries", "report"}
                or document["schema_version"] != 1
            ):
                raise ValueError("Unknown proposal document")
            parameters = MinimizationParameters.model_validate(document["parameters"])
            report = MinimizationReport.model_validate(document["report"])
            entries = [CoordinateProposal.model_validate(p) for p in document["entries"]]
            if (
                parameters.model_dump(mode="json") != job.parameters
                or report.parameters != parameters
            ):
                raise ValueError("Proposal capture differs from job capture")
            if report.outcome != job.result_values.get("outcome") or report.outcome != result[
                0
            ].metadata_json.get("outcome"):
                raise ValueError("Proposal outcome differs from job outcome")
        except (ValueError, TypeError, KeyError) as error:
            raise JobConflictError(f"Invalid calculation proposal: {error}") from error
        reason = None
        if "archive_source_job_id" in job.provenance:
            reason = "Archived calculation is historical and cannot Apply to remapped entries"
        elif "minimization_application" in job.provenance:
            reason = (
                "This proposal has already been applied; use Undo/Redo or run a new calculation"
            )
        elif report.outcome != "converged" and not eligible_nonconvergence(report):
            reason = (
                f"Calculation is {report.outcome}; it does not meet the captured acceptance policy"
            )
        if reason is None:
            current = {e.id: e for e in self._project(project_id).entries}
            moving = {ref.structure_id for ref in parameters.selection.atoms}
            for capture in parameters.captured_inputs:
                entry = current.get(capture.entry_id)
                if entry is None or entry.current_artifact_id != capture.artifact_id:
                    reason = "Selected or fixed context changed; rerun minimization"
                    break
                if entry.id in moving and entry.locked:
                    reason = f"Unlock {entry.name} before applying movable coordinates"
                    break
                if capture.identity_recovery:
                    proof = capture.identity_recovery
                    if entry.original_artifact_id != proof.original_artifact_id:
                        reason = "Verified original identity source changed; rerun minimization"
                        break
                    try:
                        original, _ = self._read(proof.original_artifact_id)
                    except (OSError, JobConflictError, LookupError):
                        reason = "Verified original identity source failed integrity checks"
                        break
                    if original.sha256 != proof.original_sha256:
                        reason = "Verified original identity source changed; rerun minimization"
                        break
            if reason is None:
                reason = self._automatic_context_reason(
                    self._project(project_id), parameters, entries
                )
        return MinimizationProposalRead(
            job_id=job.id,
            proposal_sha256=digest,
            report=report,
            entries=entries,
            applicable=reason is None,
            unavailable_reason=reason,
        )

    def live(self, project_id: str, job_id: str) -> MinimizationLiveRead:
        job = self._job(project_id, job_id)
        result = MinimizationLiveRead(job_id=job.id, status=job.status)
        if job.status not in {"queued", "running"} or "archive_source_job_id" in job.provenance:
            result.unavailable_reason = "Live preview is only available for active calculations"
            return result
        try:
            parameters = MinimizationParameters.model_validate(job.parameters)
        except ValueError as error:
            raise JobConflictError(
                "Calculation capture is invalid; live preview unavailable"
            ) from error
        result.capture_sha256 = capture_digest(parameters)
        result.selection = parameters.selection
        moving = {r.structure_id for r in parameters.selection.atoms}
        result.sources = [
            MinimizationPreviewSource(
                entry_id=c.entry_id, artifact_id=c.artifact_id, conformer_id=c.conformer_id
            )
            for c in parameters.captured_inputs
            if c.entry_id in moving
        ]
        project = self._project(project_id)
        if project.revision != job.provenance.get("project_revision"):
            result.unavailable_reason = (
                "Project changed; live preview ended. Inspect the final report."
            )
            return result
        if job.cancellation_requested:
            result.unavailable_reason = "Cancellation requested; live preview ended"
            return result
        if job.status == "running":
            try:
                result.frame = read_snapshot(
                    self.settings.data_dir / "work/jobs" / job.id, parameters
                )
            except (OSError, ValueError) as error:
                result.unavailable_reason = str(error)
        return result

    def _lock_apply(self, project_id: str) -> None:
        # SQLite is the supported persisted runtime. Acquire its writer lock before
        # any dependency/retry read so separate API processes cannot publish twice.
        connection = self.session.connection()
        if connection.dialect.name == "sqlite":
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            self.session.execute(
                select(Project.id).where(Project.id == project_id).with_for_update()
            )

    def apply(self, project_id: str, job_id: str, payload: MinimizationApply) -> ProjectRead:
        self._lock_apply(project_id)
        project = self._project(project_id, payload.expected_revision)
        proposal = self.proposal(project_id, job_id)
        if payload.proposal_sha256 != proposal.proposal_sha256:
            raise JobConflictError("Proposal changed; inspect the current report before applying")
        if not proposal.applicable:
            raise JobConflictError(str(proposal.unavailable_reason))
        report = proposal.report
        nonconverged = eligible_nonconvergence(report)
        if nonconverged and not payload.acknowledge_nonconvergence:
            raise JobConflictError(
                "Explicit acknowledgement is required to accept unconverged coordinates"
            )
        if (
            report.maximum_gradient is None
            or (not nonconverged and report.maximum_gradient > GRADIENT_TOLERANCE)
            or (
                report.gradient_tolerance != GRADIENT_TOLERANCE
                or report.initial_energy is None
                or report.final_energy is None
                or report.final_energy
                > report.initial_energy + max(1e-6, abs(report.initial_energy) * 1e-10)
            )
        ):
            raise JobConflictError(
                "Proposal does not meet the qualified convergence/objective checks"
            )
        params = report.parameters
        job = self._job(project_id, job_id)
        inputs = {i.entry_id: i for i in job.inputs}
        selected: dict[str, list[int]] = defaultdict(list)
        for ref in params.selection.atoms:
            selected[ref.structure_id].append(ref.atom_id)
        if [p.entry_id for p in proposal.entries] != sorted(selected):
            raise JobConflictError("Proposal entries do not match captured movable atoms")
        results = {p.entry_id: p for p in proposal.entries}
        prepared: list[tuple[StructureEntry, NormalizedStructureV1, NormalizedStructureV1]] = []
        for capture in params.captured_inputs:
            entry = self._entry(project, capture.entry_id)
            item = inputs.get(entry.id)
            if item is None or (item.artifact_id, item.artifact_sha256) != (
                capture.artifact_id,
                capture.sha256,
            ):
                raise JobConflictError("Immutable job inputs differ from captured dependencies")
            if entry.current_artifact_id != capture.artifact_id:
                raise JobConflictError("Selected or fixed context changed; rerun minimization")
            artifact, data = self._read(capture.artifact_id)
            if artifact.sha256 != capture.sha256:
                raise JobConflictError("Captured source changed; rerun minimization")
            before = self._structure(data)
            if before.active_conformer_id != capture.conformer_id or not set(capture.atom_ids) <= {
                a.id for a in before.atoms
            }:
                raise JobConflictError(
                    "Captured atom/conformer identity changed; rerun minimization"
                )
            if entry.id not in selected:
                continue
            if entry.locked:
                raise InvalidProjectOperationError(
                    f"Unlock {entry.name} before applying movable coordinates"
                )
            result = results[entry.id]
            if (
                result.conformer_id != capture.conformer_id
                or result.atom_ids != selected[entry.id]
                or (
                    len(result.coordinates) != len(result.atom_ids)
                    or any(not isfinite(v) for p in result.coordinates for v in p)
                )
            ):
                raise JobConflictError(
                    "Coordinate proposal does not preserve the captured selection/conformer"
                )
            updates = dict(zip(result.atom_ids, result.coordinates, strict=True))
            changed = any(
                max(abs(a.coordinates[j] - updates[a.id][j]) for j in range(3)) > 1e-9
                for a in before.atoms
                if a.id in updates
            )
            if not changed:
                continue
            coordinates = [updates.get(a.id, a.coordinates) for a in before.atoms]
            after = before.model_copy(
                update={
                    "atoms": [
                        a.model_copy(update={"coordinates": p}) if a.id in updates else a
                        for a, p in zip(before.atoms, coordinates, strict=True)
                    ],
                    "conformers": [
                        c.model_copy(update={"coordinates": coordinates})
                        if c.id == capture.conformer_id
                        else c
                        for c in before.conformers
                    ],
                    "annotations": [
                        *deepcopy(before.annotations),
                        {
                            "kind": "neistra_minimization",
                            "schema_version": 1,
                            "job_id": job.id,
                            "model": params.model,
                            "proposal_sha256": proposal.proposal_sha256,
                            "conformer_id": capture.conformer_id,
                            "atom_ids": result.atom_ids,
                            "inputs": [
                                c.model_dump(mode="json", exclude={"atom_ids", "identity_recovery"})
                                for c in params.captured_inputs
                            ],
                        },
                    ],
                    "warnings": [
                        *before.warnings,
                        *[
                            MolecularWarning(
                                code="local_minimization_limit", operation=JOB_TYPE, message=message
                            )
                            for message in report.warnings
                        ],
                    ],
                }
            )
            prepared.append((entry, before, after))
        if not prepared:
            raise JobConflictError("Coordinates are unchanged; no molecular command was created")
        # All validation finishes before publishing any after-artifact or history.
        changes = []
        for entry, before, after in prepared:
            artifact = self.artifacts.publish(
                after.to_bytes(), "minimized.normalized.json", NORMALIZED_MEDIA_TYPE
            )
            atom_floor, bond_floor = ProjectService(self.session).allocation_floor(entry)
            changes.append(
                {
                    "entry_id": entry.id,
                    "before_artifact_id": entry.current_artifact_id,
                    "after_artifact_id": artifact.id,
                    "before_values": self._summary(before),
                    "after_values": self._summary(after),
                    "next_atom_id": atom_floor,
                    "next_bond_id": bond_floor,
                }
            )
        job.provenance = {
            **job.provenance,
            "minimization_application": {
                "proposal_sha256": proposal.proposal_sha256,
                "revision": project.revision + 1,
                "applied_at": datetime.now(UTC).isoformat(),
                "entry_ids": [c["entry_id"] for c in changes],
                "outcome": report.outcome,
                "acceptance_policy": params.acceptance_policy,
                "acknowledged_nonconvergence": nonconverged and payload.acknowledge_nonconvergence,
            },
        }
        return ProjectService(self.session).record_molecular_changes(
            project_id,
            payload.expected_revision,
            JOB_TYPE,
            "Apply selection minimization",
            changes,
            {},
            [r.model_dump(mode="json") for r in params.selection.atoms],
        )

    @staticmethod
    def _summary(structure: NormalizedStructureV1) -> dict[str, Any]:
        return {
            "atom_count": len(structure.atoms),
            "atom_ids": [a.id for a in structure.atoms],
            "bond_count": len(structure.bonds),
            "residue_count": len(structure.residues),
            "conformer_count": len(structure.conformers),
            "warnings": [w.model_dump(mode="json") for w in structure.warnings],
        }
