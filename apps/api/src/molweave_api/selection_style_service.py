from __future__ import annotations

from collections import defaultdict

from molweave_core.artifacts import LocalArtifactStore
from molweave_core.molecular import NormalizedStructureV1
from sqlalchemy.orm import Session

from molweave_api.import_export import ArtifactService, StructureUnavailableError
from molweave_api.models import Project, StructureEntry
from molweave_api.project_service import (
    EntryNotFoundError,
    InvalidProjectOperationError,
    ProjectNotFoundError,
    ProjectService,
    RevisionConflictError,
)
from molweave_api.schemas import (
    ProjectRead,
    SelectionAppearanceUpdate,
    SelectionRepresentationUpdate,
)
from molweave_api.settings import Settings
from molweave_api.viewer_state import POLYMER_SELECTION_STYLES, validate_polymer_selection


class SelectionStyleService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.artifacts = ArtifactService(session, LocalArtifactStore(settings.data_dir))

    def update(self, project_id: str, payload: SelectionRepresentationUpdate) -> ProjectRead:
        project = self._project(project_id, payload.expected_revision)
        references = [item.model_dump(mode="json") for item in payload.selection.atoms]
        if payload.action == "apply" and payload.style in POLYMER_SELECTION_STYLES:
            selected_by_entry: dict[str, set[int]] = defaultdict(set)
            for reference in payload.selection.atoms:
                selected_by_entry[reference.structure_id].add(reference.atom_id)
            for entry_id, atom_ids in selected_by_entry.items():
                self._validate_polymer_target(self._entry(project, entry_id), atom_ids)
        return ProjectService(self.session).update_selection_representations(
            project_id,
            payload.expected_revision,
            references,
            action=payload.action,
            style=payload.style,
        )

    def update_appearance(self, project_id: str, payload: SelectionAppearanceUpdate) -> ProjectRead:
        targets: dict[str, set[int]] | None = None
        if payload.property == "nonpolar_hydrogens" or payload.color_mode == "carbon":
            element = "H" if payload.property == "nonpolar_hydrogens" else "C"
            project = self._project(project_id, payload.expected_revision)
            selected: dict[str, set[int]] = defaultdict(set)
            for reference in payload.selection.atoms:
                selected[reference.structure_id].add(reference.atom_id)
            targets = {}
            for entry_id, atom_ids in selected.items():
                entry = self._entry(project, entry_id)
                if entry.current_artifact_id is None:
                    raise StructureUnavailableError(entry_id)
                _, data = self.artifacts.read(entry.current_artifact_id)
                structure = NormalizedStructureV1.from_bytes(data)
                targets[entry_id] = {
                    atom.id
                    for atom in structure.atoms
                    if atom.id in atom_ids and atom.element.strip().upper() == element
                }
        return ProjectService(self.session).update_selection_appearance(
            project_id, payload, targets
        )

    def _validate_polymer_target(self, entry: StructureEntry, selected: set[int]) -> None:
        if entry.current_artifact_id is None:
            raise StructureUnavailableError(entry.id)
        _, data = self.artifacts.read(entry.current_artifact_id)
        structure = NormalizedStructureV1.from_bytes(data)
        try:
            validate_polymer_selection(structure, selected)
        except ValueError as error:
            raise InvalidProjectOperationError(str(error)) from error

    def _project(self, project_id: str, expected_revision: int) -> Project:
        project = self.session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        if project.revision != expected_revision:
            raise RevisionConflictError(project.revision)
        return project

    @staticmethod
    def _entry(project: Project, entry_id: str) -> StructureEntry:
        for entry in project.entries:
            if entry.id == entry_id:
                return entry
        raise EntryNotFoundError(entry_id)
