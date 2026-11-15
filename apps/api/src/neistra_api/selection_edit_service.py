from __future__ import annotations

from typing import Any

from neistra_core.editing.selection import (
    SelectionEditResult,
)
from neistra_core.molecular import NormalizedStructureV1
from neistra_core.selection import SelectionV1
from sqlalchemy.orm import Session

from neistra_api.edit_artifacts import StagedArtifact, publish_staged_artifact
from neistra_api.edit_computation import (
    EditTarget,
    InvalidEditComputation,
    PreparedPublication,
    compute_selection_result,
    prepare_publication,
    selection_description,
)
from neistra_api.import_export import NORMALIZED_MEDIA_TYPE, safe_filename_stem
from neistra_api.ligand_edit_service import LigandEditService
from neistra_api.models import StructureEntry
from neistra_api.project_service import InvalidProjectOperationError, ProjectService
from neistra_api.schemas import (
    ProjectRead,
    SelectionEditCreate,
    SelectionEditRead,
)
from neistra_api.settings import Settings


class SelectionEditService(LigandEditService):
    """Reuse immutable artifacts/history; never route through a second edit commit."""

    def __init__(self, session: Session, settings: Settings) -> None:
        super().__init__(session, settings)
        self.settings = settings

    def selection_edit(
        self,
        project_id: str,
        entry_id: str,
        payload: SelectionEditCreate,
    ) -> SelectionEditRead:
        entry, before = self._selection_target(
            project_id,
            entry_id,
            payload.expected_revision,
            payload.expected_artifact_id,
            payload.selection,
        )
        atom_floor, bond_floor = ProjectService(self.session).allocation_floor(entry)
        target = self._edit_target(entry, atom_floor, bond_floor)
        try:
            result, after_selection = compute_selection_result(target, before, payload)
        except InvalidEditComputation as error:
            raise InvalidProjectOperationError(str(error)) from error
        return self._publish_molecular_result(
            entry,
            before,
            payload.expected_revision,
            payload.selection,
            payload.action.operation,
            self._selection_description(entry, payload),
            result,
            after_selection,
        )

    def _selection_target(
        self,
        project_id: str,
        entry_id: str,
        expected_revision: int,
        expected_artifact_id: str,
        selection: SelectionV1,
    ) -> tuple[StructureEntry, NormalizedStructureV1]:
        entry = self._selection_entry(
            project_id,
            entry_id,
            expected_revision,
            expected_artifact_id,
            selection,
        )
        return entry, self._structure(entry)

    def _selection_entry(
        self,
        project_id: str,
        entry_id: str,
        expected_revision: int,
        expected_artifact_id: str,
        selection: SelectionV1,
    ) -> StructureEntry:
        self._project(project_id, expected_revision)
        entry = ProjectService(self.session)._entry(
            ProjectService(self.session)._project(project_id),
            entry_id,
        )
        if entry.locked:
            raise InvalidProjectOperationError(f"Unlock {entry.name} before editing.")
        if entry.current_artifact_id != expected_artifact_id:
            raise InvalidProjectOperationError(
                "The molecular artifact has changed; select the target again."
            )
        if any(ref.structure_id != entry_id for ref in selection.atoms):
            raise InvalidProjectOperationError("Select atoms in exactly one entry.")
        return entry

    def _publish_molecular_result(
        self,
        entry: StructureEntry,
        before: NormalizedStructureV1,
        expected_revision: int,
        selection: SelectionV1,
        operation: str,
        description: str,
        result: SelectionEditResult,
        after_selection: SelectionV1 | None = None,
        *,
        command_prefix: str = "selection",
        viewer_settings_after: dict[str, Any] | None = None,
    ) -> SelectionEditRead:
        atom_floor, bond_floor = ProjectService(self.session).allocation_floor(entry)
        prepared = prepare_publication(
            self._edit_target(entry, atom_floor, bond_floor),
            before,
            selection,
            operation,
            description,
            result,
            after_selection,
            command_prefix=command_prefix,
            viewer_settings_after=viewer_settings_after,
        )
        project = self._publish_prepared_project(
            entry,
            expected_revision,
            prepared,
            normalized_data=result.edit.structure.to_bytes(),
        )
        return prepared.response(project)

    def _edit_target(self, entry: StructureEntry, atom_floor: int, bond_floor: int) -> EditTarget:
        assert entry.current_artifact_id is not None
        return EditTarget(
            entry_id=entry.id,
            artifact_id=entry.current_artifact_id,
            name=entry.name,
            structure_type=entry.structure_type,
            viewer_settings=entry.viewer_settings,
            atom_floor=atom_floor,
            bond_floor=bond_floor,
            atom_limit=self.settings.atom_hard_limit,
        )

    def _publish_prepared_project(
        self,
        entry: StructureEntry,
        expected_revision: int,
        prepared: PreparedPublication,
        *,
        normalized_data: bytes | None = None,
        staged: StagedArtifact | None = None,
    ) -> ProjectRead:
        if not prepared.applied:
            return ProjectService(self.session).get_project(entry.project_id)
        filename = f"{safe_filename_stem(entry.name)}-edit.normalized.json"
        if staged is not None:
            artifact = publish_staged_artifact(self.session, staged, filename)
        else:
            if normalized_data is None:
                raise ValueError("Prepared edit is missing its normalized payload")
            artifact = self.artifacts.publish(normalized_data, filename, NORMALIZED_MEDIA_TYPE)
        return ProjectService(self.session).record_molecular_change(
            entry.project_id,
            expected_revision,
            f"{prepared.command_prefix}.{prepared.operation}",
            prepared.description,
            {
                "entry_id": entry.id,
                "before_artifact_id": entry.current_artifact_id,
                "after_artifact_id": artifact.id,
                "before_values": prepared.before_values,
                "after_values": prepared.after_values,
                "next_atom_id": prepared.next_atom_id,
                "next_bond_id": prepared.next_bond_id,
            },
            prepared.report.deleted_atom_ids,
            selection_snapshot=prepared.selection_snapshot,
            viewer_settings_after=prepared.viewer_settings_after,
        )

    @staticmethod
    def _selection_description(entry: StructureEntry, payload: SelectionEditCreate) -> str:
        return selection_description(entry.name, payload)
