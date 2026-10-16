from __future__ import annotations

from molweave_core.editing.selection import (
    InvalidSelectionEdit,
    SelectionEditResult,
    SelectionMolecularEditor,
)
from molweave_core.molecular import NormalizedStructureV1

from molweave_api.import_export import NORMALIZED_MEDIA_TYPE, safe_filename_stem
from molweave_api.ligand_edit_service import LigandEditService
from molweave_api.models import StructureEntry
from molweave_api.project_service import InvalidProjectOperationError, ProjectService
from molweave_api.schemas import (
    LigandEditReport,
    SelectionEditCreate,
    SelectionEditRead,
)


class SelectionEditService(LigandEditService):
    """Reuse immutable artifacts/history; never route through a second edit commit."""

    def selection_edit(
        self,
        project_id: str,
        entry_id: str,
        payload: SelectionEditCreate,
    ) -> SelectionEditRead:
        self._project(project_id, payload.expected_revision)
        entry = ProjectService(self.session)._entry(
            ProjectService(self.session)._project(project_id),
            entry_id,
        )
        if entry.locked:
            raise InvalidProjectOperationError(f"Unlock {entry.name} before editing.")
        if entry.current_artifact_id != payload.expected_artifact_id:
            raise InvalidProjectOperationError(
                "The molecular artifact has changed; select the target again."
            )
        if any(ref.structure_id != entry_id for ref in payload.selection.atoms):
            raise InvalidProjectOperationError("Select atoms in exactly one entry.")
        before = self._structure(entry)
        try:
            result = SelectionMolecularEditor().edit(
                before,
                [ref.atom_id for ref in payload.selection.atoms],
                payload.action,
                next_atom_id=entry.next_atom_id,
                next_bond_id=entry.next_bond_id,
            )
        except InvalidSelectionEdit as error:
            raise InvalidProjectOperationError(str(error)) from error
        return self._publish_selection(entry, before, payload, result)

    def _publish_selection(
        self,
        entry: StructureEntry,
        before: NormalizedStructureV1,
        payload: SelectionEditCreate,
        result: SelectionEditResult,
    ) -> SelectionEditRead:
        edit = result.edit
        artifact = self.artifacts.publish(
            edit.structure.to_bytes(),
            f"{safe_filename_stem(entry.name)}-edit.normalized.json",
            NORMALIZED_MEDIA_TYPE,
        )
        project = ProjectService(self.session).record_molecular_change(
            entry.project_id,
            payload.expected_revision,
            f"selection.{payload.action.operation}",
            f"Edit {entry.name}: {payload.action.operation}",
            {
                "entry_id": entry.id,
                "before_artifact_id": entry.current_artifact_id,
                "after_artifact_id": artifact.id,
                "before_values": self._summary(before),
                "after_values": self._summary(edit.structure),
                "next_atom_id": entry.next_atom_id + len(edit.created_atom_ids),
                "next_bond_id": entry.next_bond_id + len(edit.created_bond_ids),
            },
            list(edit.deleted_atom_ids),
            selection_snapshot=[ref.model_dump(mode="json") for ref in payload.selection.atoms],
        )
        return SelectionEditRead(
            project=project,
            warnings=list(edit.warnings),
            report=LigandEditReport(
                operation=payload.action.operation,
                created_atom_ids=list(edit.created_atom_ids),
                created_bond_ids=list(edit.created_bond_ids),
                deleted_atom_ids=list(edit.deleted_atom_ids),
                deleted_bond_ids=list(edit.deleted_bond_ids),
                changed_atom_ids=list(edit.changed_atom_ids),
            ),
            replacements=result.replacements,
        )
