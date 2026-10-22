from datetime import UTC, datetime

from molweave_core.editing.model import (
    DirectMolecularEditor,
    InvalidModelEdit,
    ModelAtomAdd,
    ModelBondDelete,
    ModelBondSet,
    ModelFragmentAdd,
    ModelHydrogenAdd,
    ModelHydrogenComplete,
)
from molweave_core.hydrogen_protection import protection_facts
from molweave_core.molecular import Chain, Conformer, NormalizedStructureV1, Residue, SourceFacts
from molweave_core.selection import AtomReference, SelectionV1
from sqlalchemy.orm import Session
from uuid6 import uuid7

from molweave_api.import_export import NORMALIZED_MEDIA_TYPE, safe_filename_stem
from molweave_api.models import StructureEntry
from molweave_api.project_service import InvalidProjectOperationError, ProjectService
from molweave_api.schemas import (
    LigandEditReport,
    ModelEditCreate,
    ModelEditRead,
    ModelPreviewAtom,
    ModelPreviewBond,
    ModelPreviewMovement,
    ModelPreviewRead,
    ModelPreviewRemoval,
    MoleculeCreate,
    MoleculeCreateRead,
)
from molweave_api.selection_edit_service import SelectionEditService
from molweave_api.settings import Settings
from molweave_api.source_identity import recover_original_identity
from molweave_api.viewer_state import default_viewer_settings


class ModelEditService(SelectionEditService):
    """Direct normalized edits share legacy publication, never legacy chemistry gates."""

    def __init__(self, session: Session, settings: Settings) -> None:
        super().__init__(session, settings)
        self.atom_limit = settings.atom_hard_limit
        self.settings = settings

    def _with_protection(
        self, entry: StructureEntry, before: NormalizedStructureV1, payload: ModelEditCreate
    ) -> NormalizedStructureV1:
        if (
            payload.hydrogen_policy not in {"reconcile_if_possible", "automatic"}
            and payload.action.operation != "hydrogens.add_one"
        ):
            return before
        targets = {ref.atom_id for ref in payload.selection.atoms}
        atoms = {a.id: a for a in before.atoms}
        if (
            payload.hydrogen_policy == "automatic"
            or payload.action.operation == "hydrogens.add_one"
        ):
            targets |= {
                i
                for b in before.bonds
                for i, j in [(b.atom_1_id, b.atom_2_id), (b.atom_2_id, b.atom_1_id)]
                if j in targets
            }
        needed = targets | {
            i
            for b in before.bonds
            for i, j in [(b.atom_1_id, b.atom_2_id), (b.atom_2_id, b.atom_1_id)]
            if j in targets and atoms[i].element in {"H", "D", "T"}
        }
        try:
            facts = protection_facts(before)
            if all(i in facts and facts[i].matches(atoms[i]) for i in needed if i in atoms):
                return before
            recovered = recover_original_identity(entry, before, self.artifacts, self.settings)
            if recovered:
                return recovered.structure
        except (ValueError, RuntimeError, OverflowError, OSError):
            # Missing/unsupported evidence cannot turn the draft edit into a gate.
            return before
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
        try:
            result = DirectMolecularEditor().edit(
                before,
                [ref.atom_id for ref in payload.selection.atoms],
                payload.action,
                next_atom_id=atom_floor,
                next_bond_id=bond_floor,
                hydrogen_policy=payload.hydrogen_policy,
                atom_limit=self.atom_limit,
            )
        except InvalidModelEdit as error:
            raise InvalidProjectOperationError(str(error)) from error
        if (
            isinstance(payload.action, (ModelHydrogenComplete, ModelHydrogenAdd))
            and not result.edit.created_atom_ids
        ):
            return ModelEditRead(
                project=ProjectService(self.session).get_project(project_id),
                warnings=list(result.edit.warnings),
                report=LigandEditReport(operation=payload.action.operation),
                selection_after=payload.selection,
                applied=False,
                hydrogen_report=result.hydrogen_report,
            )
        description = {
            "hydrogens.complete": "Complete hydrogens",
            "hydrogens.add": "Add explicit hydrogens",
            "hydrogens.add_one": "Add one hydrogen",
            "atom.element": "Change atom element",
            "atom.charge.set": "Set formal charge",
            "atom.delete": "Delete selected atoms",
            "atom.add": "Add atom",
            "bond.set": "Assign bond order",
            "bond.delete": "Break selected bond",
            "fragment.attach": "Attach fragment",
        }[payload.action.operation]
        published = self._publish_molecular_result(
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
        return ModelEditRead(
            **published.model_dump(),
            hydrogen_report=result.hydrogen_report,
            hydrogen_reconciliation_report=result.hydrogen_reconciliation_report,
        )

    def preview(self, project_id: str, entry_id: str, payload: ModelEditCreate) -> ModelPreviewRead:
        if not isinstance(
            payload.action,
            (
                ModelAtomAdd,
                ModelFragmentAdd,
                ModelHydrogenComplete,
                ModelHydrogenAdd,
                ModelBondSet,
                ModelBondDelete,
            ),
        ):
            raise InvalidProjectOperationError(
                "Preview requires atom, fragment or hydrogen placement."
            )
        entry, before = self._selection_target(
            project_id,
            entry_id,
            payload.expected_revision,
            payload.expected_artifact_id,
            payload.selection,
        )
        before = self._with_protection(entry, before, payload)
        atom_floor, bond_floor = ProjectService(self.session).allocation_floor(entry)
        try:
            outcome = DirectMolecularEditor().edit(
                before,
                [ref.atom_id for ref in payload.selection.atoms],
                payload.action,
                next_atom_id=atom_floor,
                next_bond_id=bond_floor,
                hydrogen_policy=payload.hydrogen_policy,
                atom_limit=self.atom_limit,
            )
            result = outcome.edit
        except InvalidModelEdit as error:
            raise InvalidProjectOperationError(str(error)) from error
        created = set(result.created_atom_ids)
        atoms = {a.id: a for a in result.structure.atoms}
        old_atoms = {a.id: a for a in before.atoms}
        changed = {
            a.id
            for a in result.structure.atoms
            if a.id in old_atoms and a.coordinates != old_atoms[a.id].coordinates
        }
        return ModelPreviewRead(
            removed_atoms=[
                ModelPreviewRemoval(atom_id=i, coordinates=old_atoms[i].coordinates)
                for i in result.deleted_atom_ids
            ],
            moved_atoms=[
                ModelPreviewMovement(
                    atom_id=i, before=old_atoms[i].coordinates, after=atoms[i].coordinates
                )
                for i in sorted(changed)
            ],
            hydrogen_reconciliation_report=outcome.hydrogen_reconciliation_report,
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
                if (created | changed) & {b.atom_1_id, b.atom_2_id}
                or (
                    isinstance(payload.action, ModelBondSet)
                    and {b.atom_1_id, b.atom_2_id} == {r.atom_id for r in payload.selection.atoms}
                )
            ],
            hydrogen_report=outcome.hydrogen_report,
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
