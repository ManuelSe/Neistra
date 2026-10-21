"""Server-owned quick capture, proposal inspection and atomic coordinate publication."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime
from math import isfinite
from typing import Literal

from fastapi import APIRouter, Depends, Response
from molweave_core.jobs import PluginRegistry
from molweave_core.minimization.contracts import CalculationError, CoordinateProposal
from molweave_core.minimization.live import capture_digest, read_snapshot
from molweave_core.minimization.quick_context import candidate_entries
from molweave_core.minimization.quick_contracts import (
    QUICK_JOB,
    QUICK_MODEL,
    QuickCapture,
    QuickParameters,
    QuickReport,
    usable,
)
from molweave_core.minimization.quick_model import resolve_selection
from molweave_core.molecular import MolecularWarning
from molweave_core.selection import SelectionV1
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from molweave_api.import_export import NORMALIZED_MEDIA_TYPE
from molweave_api.job_service import (
    InvalidJobOperationError,
    JobConflictError,
    JobNotFoundError,
    JobService,
)
from molweave_api.minimization_schemas import (
    MinimizationApply,
    MinimizationLiveRead,
    MinimizationPreviewSource,
)
from molweave_api.minimization_service import MinimizationService
from molweave_api.models import Job, Project, StructureEntry
from molweave_api.project_service import InvalidProjectOperationError, ProjectService
from molweave_api.schemas import JobRead, ProjectRead
from molweave_api.settings import Settings


class QuickCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    selection: SelectionV1
    mode: Literal["automatic", "isolated", "environment"] = "automatic"
    context_entry_ids: list[str] = Field(default_factory=list, max_length=100)
    expand_hydrogens: bool = True
    allow_repair: bool = True
    max_iterations: int = Field(default=500, ge=1, le=2000)

    @model_validator(mode="after")
    def selection_and_context(self) -> QuickCreate:
        if not 1 <= len(self.selection.atoms) <= 2000:
            raise ValueError("Select between 1 and 2000 atoms before minimizing")
        if len(set(self.context_entry_ids)) != len(self.context_entry_ids):
            raise ValueError("Explicit context entries must be unique")
        if self.mode != "environment" and self.context_entry_ids:
            raise ValueError("Explicit context requires environment mode")
        return self


class QuickProposalRead(BaseModel):
    schema_version: Literal[1] = 1
    job_id: str
    proposal_sha256: str
    report: QuickReport
    entries: list[CoordinateProposal]
    applicable: bool
    unavailable_reason: str | None = None


class QuickCapabilities(BaseModel):
    model: str = QUICK_MODEL
    available: bool
    unavailable_reason: str | None = None
    prerequisites: list[str] = Field(default_factory=list)
    scientific_limits: list[str] = Field(default_factory=list)
    limits: dict[str, int] = Field(
        default_factory=lambda: {
            "movable_atoms": 2000,
            "assembly_atoms": 20000,
            "default_iterations": 500,
            "maximum_iterations": 2000,
            "discovery_radius_angstrom": 6,
            "guard_skin_angstrom": 2,
            "participating_entries": 100,
            "optimization_seconds": 15,
            "worker_seconds": 30,
        }
    )


class QuickService(MinimizationService):
    @staticmethod
    def participants(
        project: Project, selected: set[str], mode: str, explicit: list[str]
    ) -> list[StructureEntry]:
        ids = selected | (
            set(explicit)
            if mode == "environment"
            else {e.id for e in project.entries if e.visible}
            if mode == "automatic"
            else set()
        )
        available = {e.id: e for e in project.entries}
        if not ids <= available.keys():
            raise InvalidJobOperationError("A selected/context entry is missing")
        if len(ids) > 100:
            raise InvalidJobOperationError("Quick minimization includes at most 100 entries")
        return [available[i] for i in sorted(ids)]

    def submit_quick(self, project_id: str, payload: QuickCreate) -> Job:
        project = self._project(project_id, payload.expected_revision)
        selected = {a.structure_id for a in payload.selection.atoms}
        participants = self.participants(project, selected, payload.mode, payload.context_entry_ids)
        sources = {}
        captures = []
        for entry in participants:
            if entry.id in selected and entry.locked:
                raise InvalidProjectOperationError(
                    f"Unlock {entry.name} before minimizing selected atoms"
                )
            if not entry.current_artifact_id:
                raise InvalidJobOperationError("A participating entry has no current structure")
            artifact, data = self._read(entry.current_artifact_id)
            source = self._structure(data)
            sources[entry.id] = source
            captures.append(
                QuickCapture(
                    entry_id=entry.id,
                    artifact_id=artifact.id,
                    sha256=artifact.sha256,
                    conformer_id=source.active_conformer_id,
                    atom_ids=sorted(a.id for a in source.atoms),
                )
            )
        try:
            resolved = resolve_selection(sources, payload.selection, payload.expand_hydrogens)
        except CalculationError as error:
            raise InvalidJobOperationError(str(error)) from error
        parameters = QuickParameters(
            requested_selection=payload.selection,
            selection=resolved,
            captured_inputs=captures,
            mode=payload.mode,
            context_entry_ids=payload.context_entry_ids,
            expand_hydrogens=payload.expand_hydrogens,
            allow_repair=payload.allow_repair,
            max_iterations=payload.max_iterations,
        )
        return JobService(self.session, self.settings, self.registry).submit(
            project_id,
            QUICK_JOB,
            parameters.model_dump(mode="json"),
            [{"role": "calculation", "entry_id": c.entry_id} for c in captures],
            minimization_capture=True,
        )

    def _job(self, project_id: str, job_id: str) -> Job:
        self._project(project_id)
        job = JobService(self.session, self.settings, self.registry).get(job_id)
        if job.project_id != project_id or job.job_type != QUICK_JOB:
            raise JobNotFoundError(job_id)
        return job

    def _dependencies(
        self,
        project: Project,
        parameters: QuickParameters,
        report: QuickReport,
        entries: list[CoordinateProposal],
    ) -> str | None:
        selected = {a.structure_id for a in parameters.selection.atoms}
        current = {e.id: e for e in project.entries}
        try:
            participants = self.participants(
                project, selected, parameters.mode, parameters.context_entry_ids
            )
        except InvalidJobOperationError as error:
            return str(error)
        if {e.id for e in participants} != {c.entry_id for c in parameters.captured_inputs}:
            return "Participating entries changed; rerun quick minimization"
        for capture in parameters.captured_inputs:
            if capture.entry_id not in report.modeled_atoms:
                continue
            entry = current.get(capture.entry_id)
            if entry is None or entry.current_artifact_id != capture.artifact_id:
                return "Selected or fixed local context changed; rerun quick minimization"
            if entry.id in selected and entry.locked:
                return f"Unlock {entry.name} before applying quick coordinates"
            _, data = self._read(capture.artifact_id)
            source = self._structure(data)
            if source.active_conformer_id != capture.conformer_id:
                return "Active conformer changed; rerun quick minimization"
        # The worker verified final discovery against all immutable captures. Exact
        # artifact identities preserve that proof. Only changed, formerly distant
        # sources need fresh spatial discovery; modeled changes already refused above.
        captures = {c.entry_id: c for c in parameters.captured_inputs}
        changed = [e for e in participants if e.current_artifact_id != captures[e.id].artifact_id]
        if changed:
            sources = {}
            for entry in participants:
                if entry.id not in selected and entry not in changed:
                    continue
                if not entry.current_artifact_id:
                    return "A participating entry has no current molecular structure"
                _, data = self._read(entry.current_artifact_id)
                sources[entry.id] = self._structure(data)
            positions = {
                (p.entry_id, a): xyz
                for p in entries
                for a, xyz in zip(p.atom_ids, p.coordinates, strict=True)
            }
            keys = {(a.structure_id, a.atom_id) for a in parameters.selection.atoms}
            nearby = candidate_entries(sources, keys, positions, radius=6.0)
            if any(e.id in nearby for e in changed):
                return "The final local neighborhood changed; rerun quick minimization"
        return None

    def proposal_quick(self, project_id: str, job_id: str) -> QuickProposalRead:
        job = self._job(project_id, job_id)
        if job.status != "completed":
            raise JobConflictError("A completed quick report is required")
        results = [r for r in job.results if r.role == "proposal"]
        if len(results) != 1:
            raise JobConflictError("No unique quick coordinate proposal")
        _, data = self._read(results[0].artifact_id)
        digest = hashlib.sha256(data).hexdigest()
        if digest != job.result_values.get("proposal_sha256") or digest != results[
            0
        ].metadata_json.get("proposal_sha256"):
            raise JobConflictError("Quick proposal digest differs from the completed job")
        try:
            document = json.loads(data)
            if (
                set(document) != {"schema_version", "parameters", "entries", "report"}
                or document["schema_version"] != 1
            ):
                raise ValueError("Unknown quick proposal document")
            parameters = QuickParameters.model_validate(document["parameters"])
            report = QuickReport.model_validate(document["report"])
            entries = [CoordinateProposal.model_validate(p) for p in document["entries"]]
            if (
                parameters.model_dump(mode="json") != job.parameters
                or report.parameters != parameters
            ):
                raise ValueError("Quick proposal capture differs from job inputs")
            if report.outcome != job.result_values.get("outcome") or report.outcome != results[
                0
            ].metadata_json.get("outcome"):
                raise ValueError("Quick proposal outcome differs from completed job")
        except (ValueError, TypeError, KeyError) as error:
            raise JobConflictError(f"Invalid quick proposal: {error}") from error
        reason = None
        if "archive_source_job_id" in job.provenance:
            reason = "Archived quick calculations are historical and cannot Apply"
        elif "quick_minimization_application" in job.provenance:
            reason = "This proposal has already been applied; use Undo/Redo or calculate again"
        elif report.outcome in {"improved", "converged"} and not (
            report.bonded_geometry_verified and report.planar_geometry_verified
        ):
            reason = "Quick result lacks geometry validation; rerun minimization"
        elif not usable(report):
            reason = f"Quick calculation is {report.outcome}; no usable coordinate improvement"
        else:
            reason = self._dependencies(self._project(project_id), parameters, report, entries)
        return QuickProposalRead(
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
            result.unavailable_reason = (
                "Live quick coordinates are only available during calculation"
            )
            return result
        parameters = QuickParameters.model_validate(job.parameters)
        result.capture_sha256 = capture_digest(parameters)
        result.selection = parameters.selection
        moving = {a.structure_id for a in parameters.selection.atoms}
        result.sources = [
            MinimizationPreviewSource(
                entry_id=c.entry_id, artifact_id=c.artifact_id, conformer_id=c.conformer_id
            )
            for c in parameters.captured_inputs
            if c.entry_id in moving
        ]
        if (
            self._project(project_id).revision != job.provenance.get("project_revision")
            or job.cancellation_requested
        ):
            result.unavailable_reason = (
                "Project changed or calculation cancelled; live preview ended"
            )
        elif job.status == "running":
            try:
                result.frame = read_snapshot(
                    self.settings.data_dir / "work/jobs" / job.id, parameters
                )
            except (OSError, ValueError) as error:
                result.unavailable_reason = str(error)
        return result

    def apply(self, project_id: str, job_id: str, payload: MinimizationApply) -> ProjectRead:
        self._lock_apply(project_id)
        project = self._project(project_id, payload.expected_revision)
        proposal = self.proposal_quick(project_id, job_id)
        if payload.proposal_sha256 != proposal.proposal_sha256 or not proposal.applicable:
            raise JobConflictError(proposal.unavailable_reason or "Quick proposal digest changed")
        report = proposal.report
        parameters = report.parameters
        selected: dict[str, list[int]] = defaultdict(list)
        for ref in parameters.selection.atoms:
            selected[ref.structure_id].append(ref.atom_id)
        if [p.entry_id for p in proposal.entries] != sorted(selected):
            raise JobConflictError("Quick proposal entries differ from the captured movable set")
        results = {p.entry_id: p for p in proposal.entries}
        job = self._job(project_id, job_id)
        inputs = {i.entry_id: i for i in job.inputs}
        prepared = []
        for capture in parameters.captured_inputs:
            item = inputs.get(capture.entry_id)
            if item is None or (item.artifact_id, item.artifact_sha256) != (
                capture.artifact_id,
                capture.sha256,
            ):
                raise JobConflictError("Quick source input differs from immutable capture")
            if capture.entry_id not in selected:
                continue
            entry = self._entry(project, capture.entry_id)
            _, data = self._read(capture.artifact_id)
            before = self._structure(data)
            result = results[capture.entry_id]
            if (
                result.conformer_id != capture.conformer_id
                or result.atom_ids != selected[entry.id]
                or len(result.coordinates) != len(result.atom_ids)
                or any(not isfinite(v) for p in result.coordinates for v in p)
            ):
                raise JobConflictError(
                    "Quick proposal does not preserve movable atom/conformer mapping"
                )
            updates = dict(zip(result.atom_ids, result.coordinates, strict=True))
            if not any(
                max(abs(a.coordinates[j] - updates[a.id][j]) for j in range(3)) > 1e-9
                for a in before.atoms
                if a.id in updates
            ):
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
                        *before.annotations,
                        {
                            "kind": "neistra_quick_minimization",
                            "schema_version": 1,
                            "job_id": job.id,
                            "model": QUICK_MODEL,
                            "method": report.method,
                            "coverage": report.coverage,
                            "proposal_sha256": proposal.proposal_sha256,
                            "conformer_id": capture.conformer_id,
                            "atom_ids": result.atom_ids,
                        },
                    ],
                    "warnings": [
                        *before.warnings,
                        *[
                            MolecularWarning(
                                code="quick_minimization_limit", operation=QUICK_JOB, message=w
                            )
                            for w in report.warnings
                        ],
                    ],
                }
            )
            prepared.append((entry, before, after))
        if not prepared:
            raise JobConflictError("Coordinates are unchanged; no molecular command was created")
        changes = []
        for entry, before, after in prepared:
            artifact = self.artifacts.publish(
                after.to_bytes(), "quick-minimized.normalized.json", NORMALIZED_MEDIA_TYPE
            )
            ids = results[entry.id].atom_ids
            old_coordinates = {a.id: a.coordinates for a in before.atoms}
            changes.append(
                {
                    "entry_id": entry.id,
                    "before_artifact_id": entry.current_artifact_id,
                    "after_artifact_id": artifact.id,
                    "before_patch": {
                        "entry_id": entry.id,
                        "artifact_id": entry.current_artifact_id,
                        "atom_ids": ids,
                        "coordinates": [old_coordinates[i] for i in ids],
                    },
                    "after_patch": {
                        "entry_id": entry.id,
                        "artifact_id": artifact.id,
                        "atom_ids": ids,
                        "coordinates": results[entry.id].coordinates,
                    },
                    "before_warnings": entry.warnings,
                    "after_warnings": [w.model_dump(mode="json") for w in after.warnings],
                }
            )
        job.provenance = {
            **job.provenance,
            "quick_minimization_application": {
                "proposal_sha256": proposal.proposal_sha256,
                "revision": project.revision + 1,
                "applied_at": datetime.now(UTC).isoformat(),
                "entry_ids": [e.id for e, _, _ in prepared],
                "outcome": report.outcome,
                "coverage": report.coverage,
            },
        }
        return ProjectService(self.session).record_coordinate_change(
            project_id,
            payload.expected_revision,
            QUICK_JOB,
            "Quick minimize selection",
            changes,
            [r.model_dump(mode="json") for r in parameters.selection.atoms],
        )


def quick_router(
    settings: Settings, registry: PluginRegistry, session_dependency: Callable[..., object]
) -> APIRouter:
    from molweave_api.main import _call, _job_read

    router = APIRouter(prefix="/api/v1")

    @router.get("/quick-minimization-capabilities", response_model=QuickCapabilities)
    def capabilities() -> QuickCapabilities:
        try:
            registry.get(QUICK_JOB)
        except KeyError:
            return QuickCapabilities(
                available=False, unavailable_reason="Quick minimization is not enabled"
            )
        return QuickCapabilities(
            available=True,
            prerequisites=["A nonempty movable selection and finite coordinates"],
            scientific_limits=[
                "Local relaxation is not a binding pose or energy prediction",
                "Temporary chemical assumptions and incomplete coverage are reported",
            ],
        )

    @router.post(
        "/projects/{project_id}/quick-minimizations", response_model=JobRead, status_code=201
    )
    def submit(
        project_id: str, payload: QuickCreate, session: Session = Depends(session_dependency)
    ) -> JobRead:
        job = _call(
            lambda: QuickService(session, settings, registry).submit_quick(project_id, payload)
        )
        return _job_read(session, settings, job)

    @router.get(
        "/projects/{project_id}/quick-minimizations/{job_id}/proposal",
        response_model=QuickProposalRead,
    )
    def proposal(
        project_id: str, job_id: str, session: Session = Depends(session_dependency)
    ) -> QuickProposalRead:
        return _call(
            lambda: QuickService(session, settings, registry).proposal_quick(project_id, job_id)
        )

    @router.get(
        "/projects/{project_id}/quick-minimizations/{job_id}/live",
        response_model=MinimizationLiveRead,
    )
    def live(
        project_id: str,
        job_id: str,
        response: Response,
        session: Session = Depends(session_dependency),
    ) -> MinimizationLiveRead:
        response.headers["Cache-Control"] = "no-store"
        return _call(lambda: QuickService(session, settings, registry).live(project_id, job_id))

    @router.post(
        "/projects/{project_id}/quick-minimizations/{job_id}/apply", response_model=ProjectRead
    )
    def apply(
        project_id: str,
        job_id: str,
        payload: MinimizationApply,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: QuickService(session, settings, registry).apply(project_id, job_id, payload)
        )

    return router
