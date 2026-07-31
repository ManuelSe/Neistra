from __future__ import annotations

from typing import Any

from molweave_core.artifacts import LocalArtifactStore
from molweave_core.editing import EditResult, InvalidLigandEditError, RdkitLigandEditor
from molweave_core.molecular import NormalizedStructureV1
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
    AtomAddEdit,
    AtomChargeEdit,
    AtomDeleteEdit,
    AtomElementEdit,
    BondAddEdit,
    BondDeleteEdit,
    BondOrderEdit,
    BondRotateEdit,
    HydrogenAddEdit,
    HydrogenRemoveEdit,
    LigandCleanupEdit,
    LigandEditCreate,
    LigandEditRead,
    LigandEditReport,
)
from molweave_api.settings import Settings


class LigandEditService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.editor = RdkitLigandEditor()
        self.artifacts = ArtifactService(
            session,
            LocalArtifactStore(settings.data_dir),
        )

    def edit(
        self,
        project_id: str,
        entry_id: str,
        payload: LigandEditCreate,
    ) -> LigandEditRead:
        self._project(project_id, payload.expected_revision)
        entry = self._entry(project_id, entry_id)
        before = self._structure(entry)
        try:
            result = self._apply(entry, before, payload)
        except InvalidLigandEditError as error:
            raise InvalidProjectOperationError(str(error)) from error
        if result.structure.to_bytes() == before.to_bytes():
            raise InvalidProjectOperationError("The ligand edit did not change the molecule")
        after_artifact = self.artifacts.publish(
            result.structure.to_bytes(),
            f"{safe_filename_stem(entry.name)}-{payload.operation}.normalized.json",
            NORMALIZED_MEDIA_TYPE,
        )
        if entry.current_artifact_id is None:
            raise StructureUnavailableError(entry.id)
        after_values = self._summary(result.structure)
        project = ProjectService(self.session).record_molecular_change(
            project_id,
            payload.expected_revision,
            payload.operation,
            self._description(entry, payload, result),
            {
                "entry_id": entry.id,
                "before_artifact_id": entry.current_artifact_id,
                "after_artifact_id": after_artifact.id,
                "before_values": self._summary(before),
                "after_values": after_values,
                "next_atom_id": entry.next_atom_id + len(result.created_atom_ids),
                "next_bond_id": entry.next_bond_id + len(result.created_bond_ids),
            },
            list(result.deleted_atom_ids),
        )
        return LigandEditRead(
            project=project,
            warnings=list(result.warnings),
            report=LigandEditReport(
                operation=payload.operation,
                created_atom_ids=list(result.created_atom_ids),
                created_bond_ids=list(result.created_bond_ids),
                deleted_atom_ids=list(result.deleted_atom_ids),
                deleted_bond_ids=list(result.deleted_bond_ids),
                changed_atom_ids=list(result.changed_atom_ids),
                force_field=(
                    result.force_field.force_field if result.force_field else None
                ),
                converged=(
                    result.force_field.converged if result.force_field else None
                ),
            ),
        )

    def _apply(
        self,
        entry: StructureEntry,
        structure: NormalizedStructureV1,
        payload: LigandEditCreate,
    ) -> EditResult:
        if isinstance(payload, AtomAddEdit):
            return self.editor.add_atom(
                structure,
                atom_id=entry.next_atom_id,
                element=payload.element,
                formal_charge=payload.formal_charge,
                coordinates=payload.coordinates,
            )
        if isinstance(payload, AtomDeleteEdit):
            return self.editor.delete_atoms(structure, payload.atom_ids)
        if isinstance(payload, BondAddEdit):
            return self.editor.add_bond(
                structure,
                bond_id=entry.next_bond_id,
                atom_1_id=payload.atom_1_id,
                atom_2_id=payload.atom_2_id,
                order=payload.order,
            )
        if isinstance(payload, BondDeleteEdit):
            return self.editor.delete_bond(structure, payload.bond_id)
        if isinstance(payload, BondOrderEdit):
            return self.editor.change_bond_order(
                structure, payload.bond_id, payload.order
            )
        if isinstance(payload, AtomElementEdit):
            return self.editor.change_element(
                structure, payload.atom_id, payload.element
            )
        if isinstance(payload, AtomChargeEdit):
            return self.editor.change_formal_charge(
                structure, payload.atom_id, payload.formal_charge
            )
        if isinstance(payload, HydrogenAddEdit):
            return self.editor.add_hydrogens(
                structure,
                next_atom_id=entry.next_atom_id,
                next_bond_id=entry.next_bond_id,
                atom_ids=payload.atom_ids,
            )
        if isinstance(payload, HydrogenRemoveEdit):
            return self.editor.remove_hydrogens(structure, payload.atom_ids)
        if isinstance(payload, BondRotateEdit):
            return self.editor.rotate_bond(
                structure,
                bond_id=payload.bond_id,
                movable_atom_ids=payload.movable_atom_ids,
                angle_degrees=payload.angle_degrees,
            )
        if isinstance(payload, LigandCleanupEdit):
            return self.editor.cleanup(
                structure,
                force_field=payload.force_field,
                max_iterations=payload.max_iterations,
                atom_ids=payload.atom_ids,
            )
        raise InvalidProjectOperationError("Unsupported ligand edit operation")

    @staticmethod
    def _summary(structure: NormalizedStructureV1) -> dict[str, Any]:
        return {
            "atom_count": len(structure.atoms),
            "atom_ids": [atom.id for atom in structure.atoms],
            "bond_count": len(structure.bonds),
            "residue_count": len(structure.residues),
            "conformer_count": len(structure.conformers),
            "warnings": [
                warning.model_dump(mode="json") for warning in structure.warnings
            ],
        }

    @staticmethod
    def _description(
        entry: StructureEntry,
        payload: LigandEditCreate,
        result: EditResult,
    ) -> str:
        descriptions = {
            "atom.add": "Add atom",
            "atom.delete": f"Delete {len(result.deleted_atom_ids)} atoms",
            "bond.add": "Add bond",
            "bond.delete": "Delete bond",
            "bond.order": "Change bond order",
            "atom.element": "Change atom element",
            "atom.charge": "Change formal charge",
            "hydrogen.add": f"Add {len(result.created_atom_ids)} hydrogens",
            "hydrogen.remove": f"Remove {len(result.deleted_atom_ids)} hydrogens",
            "bond.rotate": "Rotate bond",
            "coordinates.cleanup": (
                f"Clean coordinates with {result.force_field.force_field}"
                if result.force_field
                else "Clean coordinates"
            ),
        }
        return f"{descriptions[payload.operation]} in {entry.name}"

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
                f"Unlock {entry.name} before editing its molecule"
            )
        if entry.structure_type != "ligand":
            raise InvalidProjectOperationError(
                "Ligand editing requires an entry classified as ligand"
            )
        return entry

    def _structure(self, entry: StructureEntry) -> NormalizedStructureV1:
        if entry.current_artifact_id is None:
            raise StructureUnavailableError(entry.id)
        _, payload = self.artifacts.read(entry.current_artifact_id)
        return NormalizedStructureV1.from_bytes(payload)
