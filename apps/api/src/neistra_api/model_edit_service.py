from datetime import UTC, datetime
from typing import cast

from neistra_core.editing.model import (
    DirectMolecularEditor,
    InvalidModelEdit,
    ModelAtomAdd,
)
from neistra_core.molecular import Chain, Conformer, NormalizedStructureV1, Residue, SourceFacts
from neistra_core.selection import AtomReference, SelectionV1
from sqlalchemy.orm import Session
from uuid6 import uuid7

from neistra_api.edit_computation import (
    InvalidEditComputation,
    build_model_preview,
    compute_model_result,
    needs_original_protection,
    prepare_model_publication,
    validate_preview_action,
)
from neistra_api.import_export import NORMALIZED_MEDIA_TYPE, safe_filename_stem
from neistra_api.models import StructureEntry
from neistra_api.project_service import InvalidProjectOperationError, ProjectService
from neistra_api.schemas import (
    LigandEditReport,
    ModelEditCreate,
    ModelEditRead,
    ModelPreviewRead,
    MoleculeCreate,
    MoleculeCreateRead,
)
from neistra_api.selection_edit_service import SelectionEditService
from neistra_api.settings import Settings
from neistra_api.source_identity import recover_original_identity
from neistra_api.viewer_state import default_viewer_settings


class ModelEditService(SelectionEditService):
    """Direct normalized edits share legacy publication, never legacy chemistry gates."""

    def __init__(self, session: Session, settings: Settings) -> None:
        super().__init__(session, settings)
        self.atom_limit = settings.atom_hard_limit
        self.settings = settings

    def _with_protection(
        self, entry: StructureEntry, before: NormalizedStructureV1, payload: ModelEditCreate
    ) -> NormalizedStructureV1:
        try:
            if not needs_original_protection(before, payload):
                return before
            recovered = recover_original_identity(entry, before, self.artifacts, self.settings)
            return recovered.structure if recovered is not None else before
        except (ValueError, RuntimeError, OverflowError, OSError):
            return before

    def model_edit(
        self,
        project_id: str,
        entry_id: str,
        payload: ModelEditCreate,
    ) -> ModelEditRead:
        entry, before = self._selection_target(
            project_id,
            entry_id,
            payload.expected_revision,
            payload.expected_artifact_id,
            payload.selection,
        )
        before = self._with_protection(entry, before, payload)
        atom_floor, bond_floor = ProjectService(self.session).allocation_floor(entry)
        target = self._edit_target(entry, atom_floor, bond_floor)
        try:
            result = compute_model_result(target, before, payload)
        except InvalidEditComputation as error:
            raise InvalidProjectOperationError(str(error)) from error
        prepared, after = prepare_model_publication(target, before, payload, result)
        project = self._publish_prepared_project(
            entry,
            payload.expected_revision,
            prepared,
            normalized_data=after.to_bytes() if prepared.applied else None,
        )
        return cast(ModelEditRead, prepared.response(project))

    def preview(self, project_id: str, entry_id: str, payload: ModelEditCreate) -> ModelPreviewRead:
        try:
            validate_preview_action(payload)
            entry, before = self._selection_target(
                project_id,
                entry_id,
                payload.expected_revision,
                payload.expected_artifact_id,
                payload.selection,
            )
            before = self._with_protection(entry, before, payload)
            atom_floor, bond_floor = ProjectService(self.session).allocation_floor(entry)
            outcome = compute_model_result(
                self._edit_target(entry, atom_floor, bond_floor), before, payload
            )
            return build_model_preview(entry_id, before, payload, outcome)
        except InvalidEditComputation as error:
            raise InvalidProjectOperationError(str(error)) from error

    def create_molecule(self, project_id: str, payload: MoleculeCreate) -> MoleculeCreateRead:
        self._project(project_id, payload.expected_revision)
        before = NormalizedStructureV1(
            title=payload.name,
            structure_type="ligand",
            source=SourceFacts(
                filename=payload.name,
                format="generated",
                facts={"origin": "generated", "creation": "single_atom_origin_v1"},
            ),
            atoms=[],
            conformers=[Conformer(id=1, name="Model", coordinates=[])],
            chains=[Chain(id=1, name="")],
            residues=[Residue(id=1, chain_id=1, name="LIG", component_type="ligand")],
        )
        try:
            result = (
                DirectMolecularEditor()
                .edit(
                    before,
                    [],
                    ModelAtomAdd(
                        operation="atom.add", element=payload.element, charge=payload.charge
                    ),
                    next_atom_id=1,
                    next_bond_id=1,
                    atom_limit=self.atom_limit,
                )
                .edit
            )
        except InvalidModelEdit as error:
            raise InvalidProjectOperationError(str(error)) from error
        artifact = self.artifacts.publish(
            result.structure.to_bytes(),
            f"{safe_filename_stem(payload.name)}.normalized.json",
            NORMALIZED_MEDIA_TYPE,
        )
        entry_id = str(uuid7())
        state = {
            "id": entry_id,
            "group_id": None,
            "name": payload.name,
            "description": None,
            "structure_type": "ligand",
            "original_filename": None,
            "source_format": None,
            "normalized_data": {"schema_version": 1, "storage": "artifact"},
            "atom_count": 1,
            "atom_ids": [1],
            "bond_count": 0,
            "residue_count": 1,
            "conformer_count": 1,
            "warnings": [w.model_dump(mode="json") for w in result.warnings],
            "next_atom_id": 2,
            "next_bond_id": 1,
            "viewer_settings": default_viewer_settings("ligand"),
            "visible": True,
            "locked": False,
            "user_metadata": {"origin": "generated"},
            "job_links": [],
            "generated_results": [],
            "original_artifact_id": None,
            "current_artifact_id": artifact.id,
            "created_at": datetime.now(UTC).isoformat(),
        }
        project = ProjectService(self.session).create_molecule(
            project_id, payload.expected_revision, state
        )
        return MoleculeCreateRead(
            project=project,
            entry_id=entry_id,
            selection_after=SelectionV1(
                atoms=[AtomReference(structure_id=entry_id, atom_id=1)], source="project"
            ),
            report=LigandEditReport(operation="molecule.create", created_atom_ids=[1]),
            warnings=list(result.warnings),
            replacements={},
        )
