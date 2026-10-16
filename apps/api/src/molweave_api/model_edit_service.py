from datetime import UTC, datetime

from molweave_core.editing.model import (
    DirectMolecularEditor,
    InvalidModelEdit,
    ModelAtomAdd,
    ModelFragmentAdd,
)
from molweave_core.molecular import Chain, Conformer, NormalizedStructureV1, Residue, SourceFacts
from molweave_core.selection import AtomReference, SelectionV1
from sqlalchemy.orm import Session
from uuid6 import uuid7

from molweave_api.import_export import NORMALIZED_MEDIA_TYPE, safe_filename_stem
from molweave_api.project_service import InvalidProjectOperationError, ProjectService
from molweave_api.schemas import (
    LigandEditReport,
    ModelEditCreate,
    ModelPreviewAtom,
    ModelPreviewBond,
    ModelPreviewRead,
    MoleculeCreate,
    MoleculeCreateRead,
    SelectionEditRead,
)
from molweave_api.selection_edit_service import SelectionEditService
from molweave_api.settings import Settings
from molweave_api.viewer_state import default_viewer_settings


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
        description = {
            "atom.element": "Change atom element",
            "atom.charge.set": "Set formal charge",
            "atom.delete": "Delete selected atoms",
            "atom.add": "Add atom",
            "bond.set": "Assign bond order",
            "bond.delete": "Break selected bond",
            "fragment.attach": "Attach fragment",
        }[payload.action.operation]
        return self._publish_molecular_result(
            entry,
            before,
            payload.expected_revision,
            payload.selection,
            payload.action.operation,
            f"{description} in {entry.name}",
            result,
            after_selection=SelectionV1(
                atoms=[
                    AtomReference(structure_id=entry.id, atom_id=result.edit.created_atom_ids[0])
                ],
                source=payload.selection.source,
            )
            if isinstance(payload.action, (ModelAtomAdd, ModelFragmentAdd))
            else None,
            command_prefix="model",
        )

    def preview(self, project_id: str, entry_id: str, payload: ModelEditCreate) -> ModelPreviewRead:
        if not isinstance(payload.action, (ModelAtomAdd, ModelFragmentAdd)):
            raise InvalidProjectOperationError(
                "Placement preview requires Add atom or fragment attachment."
            )
        entry, before = self._selection_target(
            project_id,
            entry_id,
            payload.expected_revision,
            payload.expected_artifact_id,
            payload.selection,
        )
        try:
            result = (
                DirectMolecularEditor()
                .edit(
                    before,
                    [ref.atom_id for ref in payload.selection.atoms],
                    payload.action,
                    next_atom_id=entry.next_atom_id,
                    next_bond_id=entry.next_bond_id,
                    hydrogen_policy=payload.hydrogen_policy,
                    atom_limit=self.atom_limit,
                )
                .edit
            )
        except InvalidModelEdit as error:
            raise InvalidProjectOperationError(str(error)) from error
        created = set(result.created_atom_ids)
        atoms = {a.id: a for a in result.structure.atoms}
        return ModelPreviewRead(
            entry_id=entry_id,
            expected_revision=payload.expected_revision,
            expected_artifact_id=payload.expected_artifact_id,
            atoms=[
                ModelPreviewAtom(
                    preview_id=f"preview-{i}",
                    element=atoms[atom_id].element,
                    coordinates=atoms[atom_id].coordinates,
                )
                for i, atom_id in enumerate(result.created_atom_ids)
            ],
            bonds=[
                ModelPreviewBond(
                    start=atoms[b.atom_1_id].coordinates,
                    end=atoms[b.atom_2_id].coordinates,
                    order=b.order,
                    aromatic=b.aromatic,
                )
                for b in result.structure.bonds
                if created & {b.atom_1_id, b.atom_2_id}
            ],
            removed_atom_ids=list(result.deleted_atom_ids),
            warnings=list(result.warnings),
        )

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
