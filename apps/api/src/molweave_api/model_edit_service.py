from molweave_core.editing.model import DirectMolecularEditor, InvalidModelEdit
from sqlalchemy.orm import Session

from molweave_api.project_service import InvalidProjectOperationError
from molweave_api.schemas import ModelEditCreate, SelectionEditRead
from molweave_api.selection_edit_service import SelectionEditService
from molweave_api.settings import Settings


class ModelEditService(SelectionEditService):
    """Direct normalized edits share legacy publication, never legacy chemistry gates."""

    def __init__(self, session: Session, settings: Settings) -> None:
        super().__init__(session, settings)
        self.atom_limit = settings.atom_hard_limit

    def model_edit(
        self,
        project_id: str,
        entry_id: str,
        payload: ModelEditCreate,
    ) -> SelectionEditRead:
        entry, before = self._selection_target(
            project_id,
            entry_id,
            payload.expected_revision,
            payload.expected_artifact_id,
            payload.selection,
        )
        try:
            result = DirectMolecularEditor().edit(
                before,
                [ref.atom_id for ref in payload.selection.atoms],
                payload.action,
                next_atom_id=entry.next_atom_id,
                next_bond_id=entry.next_bond_id,
                hydrogen_policy=payload.hydrogen_policy,
                atom_limit=self.atom_limit,
            )
        except InvalidModelEdit as error:
            raise InvalidProjectOperationError(str(error)) from error
        return self._publish_molecular_result(
            entry,
            before,
            payload.expected_revision,
            payload.selection,
            payload.action.operation,
            f"Direct {payload.action.operation} in {entry.name}",
            result,
            command_prefix="model",
        )
