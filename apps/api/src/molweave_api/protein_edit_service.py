from __future__ import annotations

from typing import Any

from molweave_core.artifacts import LocalArtifactStore
from molweave_core.editing import (
    InvalidProteinEditError,
    PdbfixerProteinEditor,
    ProteinEditResult,
)
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
    ProteinAtomDeleteEdit,
    ProteinChainDeleteEdit,
    ProteinChainRenameEdit,
    ProteinEditCreate,
    ProteinEditRead,
    ProteinEditReport,
    ProteinHydrogenAddEdit,
    ProteinHydrogenRemoveEdit,
    ProteinIonDeleteEdit,
    ProteinResidueDeleteEdit,
    ProteinResidueMutateEdit,
    ProteinResidueRenumberEdit,
    ProteinWaterDeleteEdit,
)
from molweave_api.settings import Settings


class ProteinEditService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.editor = PdbfixerProteinEditor()
        self.artifacts = ArtifactService(
            session,
            LocalArtifactStore(settings.data_dir),
        )

    def edit(
        self,
        project_id: str,
        entry_id: str,
        payload: ProteinEditCreate,
    ) -> ProteinEditRead:
        self._project(project_id, payload.expected_revision)
        entry = self._entry(project_id, entry_id)
        before = self._structure(entry)
        try:
            result = self._apply(entry, before, payload)
        except InvalidProteinEditError as error:
            raise InvalidProjectOperationError(str(error)) from error
        if result.structure.to_bytes() == before.to_bytes():
            raise InvalidProjectOperationError(
                "The protein edit did not change the molecule"
            )
        after_artifact = self.artifacts.publish(
            result.structure.to_bytes(),
            f"{safe_filename_stem(entry.name)}-{payload.operation}.normalized.json",
            NORMALIZED_MEDIA_TYPE,
        )
        if entry.current_artifact_id is None:
            raise StructureUnavailableError(entry.id)
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
                "after_values": self._summary(result.structure),
                "next_atom_id": entry.next_atom_id + len(result.created_atom_ids),
                "next_bond_id": entry.next_bond_id + len(result.created_bond_ids),
            },
            list(result.deleted_atom_ids),
        )
        return ProteinEditRead(
            project=project,
            warnings=list(result.warnings),
            report=ProteinEditReport(
                operation=payload.operation,
                created_atom_ids=list(result.created_atom_ids),
                created_bond_ids=list(result.created_bond_ids),
                deleted_atom_ids=list(result.deleted_atom_ids),
                deleted_bond_ids=list(result.deleted_bond_ids),
                changed_atom_ids=list(result.changed_atom_ids),
                changed_residue_ids=list(result.changed_residue_ids),
                deleted_residue_ids=list(result.deleted_residue_ids),
                changed_chain_ids=list(result.changed_chain_ids),
                deleted_chain_ids=list(result.deleted_chain_ids),
            ),
        )

    def _apply(
        self,
        entry: StructureEntry,
        structure: NormalizedStructureV1,
        payload: ProteinEditCreate,
    ) -> ProteinEditResult:
        if isinstance(payload, ProteinAtomDeleteEdit):
            return self.editor.delete_atoms(structure, payload.atom_ids)
        if isinstance(payload, ProteinResidueDeleteEdit):
            return self.editor.delete_residues(structure, payload.residue_ids)
        if isinstance(payload, ProteinChainDeleteEdit):
            return self.editor.delete_chains(structure, payload.chain_ids)
        if isinstance(payload, ProteinWaterDeleteEdit):
            return self.editor.delete_components(structure, "water")
        if isinstance(payload, ProteinIonDeleteEdit):
            return self.editor.delete_components(structure, "ion")
        if isinstance(payload, ProteinChainRenameEdit):
            return self.editor.rename_chain(structure, payload.chain_id, payload.name)
        if isinstance(payload, ProteinResidueRenumberEdit):
            return self.editor.renumber_residues(
                structure,
                payload.chain_id,
                start=payload.start,
                step=payload.step,
            )
        if isinstance(payload, ProteinResidueMutateEdit):
            return self.editor.mutate_residue(
                structure,
                payload.residue_id,
                payload.target_name,
                next_atom_id=entry.next_atom_id,
                next_bond_id=entry.next_bond_id,
            )
        if isinstance(payload, ProteinHydrogenAddEdit):
            return self.editor.add_hydrogens(
                structure,
                next_atom_id=entry.next_atom_id,
                next_bond_id=entry.next_bond_id,
                residue_ids=payload.residue_ids,
                ph=payload.ph,
            )
        if isinstance(payload, ProteinHydrogenRemoveEdit):
            return self.editor.remove_hydrogens(
                structure,
                residue_ids=payload.residue_ids,
            )
        raise InvalidProjectOperationError("Unsupported protein edit operation")

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
        payload: ProteinEditCreate,
        result: ProteinEditResult,
    ) -> str:
        descriptions = {
            "protein.atom.delete": f"Delete {len(result.deleted_atom_ids)} atoms",
            "protein.residue.delete": (
                f"Delete {len(result.deleted_residue_ids)} residues"
            ),
            "protein.chain.delete": f"Delete {len(result.deleted_chain_ids)} chains",
            "protein.water.delete": (
                f"Remove {len(result.deleted_residue_ids)} water residues"
            ),
            "protein.ion.delete": (
                f"Remove {len(result.deleted_residue_ids)} ion residues"
            ),
            "protein.chain.rename": "Rename chain",
            "protein.residue.renumber": "Renumber residues",
            "protein.residue.mutate": "Mutate residue",
            "protein.hydrogen.add": (
                f"Add {len(result.created_atom_ids)} hydrogens"
            ),
            "protein.hydrogen.remove": (
                f"Remove {len(result.deleted_atom_ids)} hydrogens"
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
                f"Unlock {entry.name} before editing its protein"
            )
        if entry.structure_type not in {"protein", "complex"}:
            raise InvalidProjectOperationError(
                "Protein editing requires an entry classified as protein or complex"
            )
        return entry

    def _structure(self, entry: StructureEntry) -> NormalizedStructureV1:
        if entry.current_artifact_id is None:
            raise StructureUnavailableError(entry.id)
        _, payload = self.artifacts.read(entry.current_artifact_id)
        return NormalizedStructureV1.from_bytes(payload)
