from __future__ import annotations

from typing import Any

from molweave_core.artifacts import LocalArtifactStore
from molweave_core.molecular import NormalizedStructureV1
from molweave_core.selection import SelectionV1
from molweave_core.superposition import (
    InvalidSuperpositionError,
    SuperpositionResult,
    superpose_backbone,
    superpose_selected,
)
from molweave_core.transforms import (
    InvalidTransformError,
    centroid,
    transform_structure,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from molweave_api.import_export import (
    NORMALIZED_MEDIA_TYPE,
    ArtifactService,
    StructureUnavailableError,
    safe_filename_stem,
)
from molweave_api.models import Project, StructureEntry
from molweave_api.project_service import (
    EntryNotFoundError,
    InvalidProjectOperationError,
    ProjectNotFoundError,
    ProjectService,
    RevisionConflictError,
)
from molweave_api.schemas import (
    CoordinatePatch,
    CoordinateTransformCreate,
    ProjectRead,
    SuperpositionCreate,
    SuperpositionRead,
    SuperpositionReport,
)
from molweave_api.settings import Settings


class CoordinateService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.artifacts = ArtifactService(
            session,
            LocalArtifactStore(settings.data_dir),
        )

    def transform(
        self,
        project_id: str,
        payload: CoordinateTransformCreate,
    ) -> ProjectRead:
        project = self._project(project_id, payload.expected_revision)
        entry = self._entry(project.id, payload.entry_id)
        structure = self._structure(entry)
        selected_ids = sorted(
            reference.atom_id
            for reference in payload.selection.atoms
            if reference.structure_id == entry.id
        )
        atom_ids = (
            [atom.id for atom in structure.atoms]
            if payload.scope == "structure"
            else selected_ids
        )
        if payload.pivot_mode == "custom":
            if payload.pivot is None:
                raise InvalidProjectOperationError("Custom pivot is required")
            pivot = payload.pivot
        elif payload.pivot_mode == "selection_centroid":
            pivot = centroid(structure, atom_ids)
        else:
            pivot = centroid(structure)
        try:
            transformed = transform_structure(
                structure,
                atom_ids,
                translation=payload.translation,
                rotation_degrees=payload.rotation_degrees,
                pivot=pivot,
            )
        except InvalidTransformError as error:
            raise InvalidProjectOperationError(str(error)) from error
        if transformed.to_bytes() == structure.to_bytes():
            raise InvalidProjectOperationError(
                "Transform does not move the requested atoms"
            )
        after_artifact_id = self._publish(entry, transformed)
        change = self._change(
            entry,
            structure,
            transformed,
            atom_ids,
            after_artifact_id,
        )
        action = self._transform_action(payload)
        scope = "structure" if payload.scope == "structure" else f"{len(atom_ids)} selected atoms"
        return ProjectService(self.session).record_coordinate_change(
            project.id,
            payload.expected_revision,
            "coordinates.transform",
            f"{action} {scope} in {entry.name}",
            [change],
            self._selection_snapshot(payload.selection),
        )

    def superpose(
        self,
        project_id: str,
        payload: SuperpositionCreate,
    ) -> SuperpositionRead:
        project = self._project(project_id, payload.expected_revision)
        moving_entry = self._entry(project.id, payload.moving_entry_id)
        reference_entry = self._entry(project.id, payload.reference_entry_id)
        moving = self._structure(moving_entry)
        reference = self._structure(reference_entry)
        try:
            result = self._superposition_result(payload, moving, reference)
        except InvalidSuperpositionError as error:
            raise InvalidProjectOperationError(str(error)) from error
        if result.structure.to_bytes() == moving.to_bytes():
            raise InvalidProjectOperationError(
                f"{moving_entry.name} is already aligned to {reference_entry.name}"
            )
        atom_ids = [atom.id for atom in moving.atoms]
        after_artifact_id = self._publish(moving_entry, result.structure)
        change = self._change(
            moving_entry,
            moving,
            result.structure,
            atom_ids,
            after_artifact_id,
        )
        project_read = ProjectService(self.session).record_coordinate_change(
            project.id,
            payload.expected_revision,
            "coordinates.superpose",
            (
                f"Superpose {moving_entry.name} onto {reference_entry.name} "
                f"using {result.fit.atom_count} {payload.mode} atoms"
            ),
            [change],
            self._selection_snapshot(payload.selection),
        )
        return SuperpositionRead(
            project=project_read,
            report=SuperpositionReport(
                moving_entry_id=moving_entry.id,
                reference_entry_id=reference_entry.id,
                mode=payload.mode,
                atom_count=result.fit.atom_count,
                rmsd=result.fit.rmsd,
            ),
        )

    def _superposition_result(
        self,
        payload: SuperpositionCreate,
        moving: NormalizedStructureV1,
        reference: NormalizedStructureV1,
    ) -> SuperpositionResult:
        if payload.mode == "backbone":
            return superpose_backbone(moving, reference)
        moving_ids = [
            item.atom_id
            for item in payload.selection.atoms
            if item.structure_id == payload.moving_entry_id
        ]
        reference_ids = [
            item.atom_id
            for item in payload.selection.atoms
            if item.structure_id == payload.reference_entry_id
        ]
        return superpose_selected(moving, reference, moving_ids, reference_ids)

    def _project(self, project_id: str, expected_revision: int) -> Project:
        project = self.session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        if project.revision != expected_revision:
            raise RevisionConflictError(project.revision)
        return project

    def _entry(self, project_id: str, entry_id: str) -> StructureEntry:
        entry = self.session.scalar(
            select(StructureEntry).where(
                StructureEntry.project_id == project_id,
                StructureEntry.id == entry_id,
            )
        )
        if entry is None:
            raise EntryNotFoundError(entry_id)
        if entry.locked:
            raise InvalidProjectOperationError(
                f"Unlock {entry.name} before changing coordinates"
            )
        return entry

    def _structure(self, entry: StructureEntry) -> NormalizedStructureV1:
        if entry.current_artifact_id is None:
            raise StructureUnavailableError(entry.id)
        _, payload = self.artifacts.read(entry.current_artifact_id)
        return NormalizedStructureV1.from_bytes(payload)

    def _publish(
        self,
        entry: StructureEntry,
        structure: NormalizedStructureV1,
    ) -> str:
        artifact = self.artifacts.publish(
            structure.to_bytes(),
            f"{safe_filename_stem(entry.name)}-coordinates.normalized.json",
            NORMALIZED_MEDIA_TYPE,
        )
        return artifact.id

    @staticmethod
    def _change(
        entry: StructureEntry,
        before: NormalizedStructureV1,
        after: NormalizedStructureV1,
        atom_ids: list[int],
        after_artifact_id: str,
    ) -> dict[str, Any]:
        if entry.current_artifact_id is None:
            raise StructureUnavailableError(entry.id)
        return {
            "entry_id": entry.id,
            "before_artifact_id": entry.current_artifact_id,
            "after_artifact_id": after_artifact_id,
            "before_patch": CoordinateService._patch(
                entry.id, entry.current_artifact_id, before, atom_ids
            ).model_dump(mode="json"),
            "after_patch": CoordinateService._patch(
                entry.id, after_artifact_id, after, atom_ids
            ).model_dump(mode="json"),
        }

    @staticmethod
    def _patch(
        entry_id: str,
        artifact_id: str,
        structure: NormalizedStructureV1,
        atom_ids: list[int],
    ) -> CoordinatePatch:
        coordinates = {atom.id: atom.coordinates for atom in structure.atoms}
        return CoordinatePatch(
            entry_id=entry_id,
            artifact_id=artifact_id,
            atom_ids=atom_ids,
            coordinates=[coordinates[atom_id] for atom_id in atom_ids],
        )

    @staticmethod
    def _selection_snapshot(selection: SelectionV1) -> list[dict[str, Any]]:
        return [item.model_dump(mode="json") for item in selection.atoms]

    @staticmethod
    def _transform_action(payload: CoordinateTransformCreate) -> str:
        has_translation = any(value != 0 for value in payload.translation)
        has_rotation = any(value % 360 != 0 for value in payload.rotation_degrees)
        if has_translation and has_rotation:
            return "Transform"
        return "Translate" if has_translation else "Rotate"
