from __future__ import annotations

from molweave_core.artifacts import LocalArtifactStore
from molweave_core.components import component_atom_ids, derive_component_hierarchy
from molweave_core.molecular import NormalizedStructureV1
from sqlalchemy.orm import Session

from molweave_api.import_export import ArtifactService, StructureUnavailableError
from molweave_api.models import Project
from molweave_api.project_service import (
    EntryNotFoundError,
    InvalidProjectOperationError,
    ProjectNotFoundError,
    ProjectService,
    RevisionConflictError,
)
from molweave_api.schemas import ProjectRead, SurfaceCreate, SurfaceSource, SurfaceUpdate
from molweave_api.settings import Settings


class SurfaceService:
    """Resolve authoritative protein eligibility; commands own durable object state."""

    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.artifacts = ArtifactService(session, LocalArtifactStore(settings.data_dir))

    def create(self, project_id: str, payload: SurfaceCreate) -> ProjectRead:
        project = self._project(project_id, payload.expected_revision)
        checked: set[str] = set()
        for item in payload.surfaces:
            if item.source.kind == "pocket" and item.entry_id not in checked:
                self._validate_context(project, item.entry_id, item.source)
                checked.add(item.entry_id)
        return ProjectService(self.session).create_surface_objects(project_id, payload)

    def update(
        self, project_id: str, entry_id: str, surface_id: str, payload: SurfaceUpdate
    ) -> ProjectRead:
        project = self._project(project_id, payload.expected_revision)
        if payload.source is not None:
            self._validate_context(project, entry_id, payload.source)
        return ProjectService(self.session).update_surface_object(
            project_id, entry_id, surface_id, payload
        )

    def _project(self, project_id: str, expected_revision: int) -> Project:
        project = self.session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        if project.revision != expected_revision:
            raise RevisionConflictError(project.revision)
        return project

    def _validate_context(self, project: Project, entry_id: str, source: SurfaceSource) -> None:
        entry = next((item for item in project.entries if item.id == entry_id), None)
        if entry is None:
            raise EntryNotFoundError(entry_id)
        if source.kind != "pocket":
            return
        if entry.current_artifact_id is None:
            raise StructureUnavailableError(entry_id)
        _, data = self.artifacts.read(entry.current_artifact_id)
        structure = NormalizedStructureV1.from_bytes(data)
        hierarchy = derive_component_hierarchy(structure)
        if not any(
            component.category == "protein" and component_atom_ids(structure, component)
            for component in hierarchy.components
        ):
            raise InvalidProjectOperationError("Choose an entry containing protein context")
