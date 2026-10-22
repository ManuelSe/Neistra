from __future__ import annotations

from typing import Any

from molweave_core.editing.ligand import EditResult
from molweave_core.editing.protein import InvalidProteinEditError, PdbfixerProteinEditor
from molweave_core.editing.selection import (
    InvalidSelectionEdit,
    SelectionEditResult,
    SelectionMolecularEditor,
)
from molweave_core.molecular import NormalizedStructureV1
from molweave_core.selection import AtomReference, SelectionV1

from molweave_api.import_export import NORMALIZED_MEDIA_TYPE, safe_filename_stem
from molweave_api.ligand_edit_service import LigandEditService
from molweave_api.models import StructureEntry
from molweave_api.project_service import InvalidProjectOperationError, ProjectService
from molweave_api.schemas import (
    LigandEditReport,
    SelectionEditCreate,
    SelectionEditRead,
    SelectionResidueMutation,
)


class SelectionEditService(LigandEditService):
    """Reuse immutable artifacts/history; never route through a second edit commit."""

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
        selected = [ref.atom_id for ref in payload.selection.atoms]
        after_selection: SelectionV1 | None = None
        try:
            if isinstance(payload.action, SelectionResidueMutation):
                if entry.structure_type not in {"protein", "complex"}:
                    raise InvalidSelectionEdit("Mutation requires a protein or complex entry.")
                atom_map = {a.id: a for a in before.atoms}
                if not selected or not set(selected) <= atom_map.keys():
                    raise InvalidSelectionEdit("Select one complete current amino-acid residue.")
                residues = {atom_map[i].residue_id for i in selected}
                if len(residues) != 1 or None in residues:
                    raise InvalidSelectionEdit("Select one complete amino-acid residue.")
                residue_id = atom_map[selected[0]].residue_id
                assert residue_id is not None
                if set(selected) != {a.id for a in before.atoms if a.residue_id == residue_id}:
                    raise InvalidSelectionEdit("Select the complete residue using residue picking.")
                # Preserve peptide connectivity, but never silently discard a
                # disulfide, ligand attachment or other explicit side-chain link.
                selected_set = set(selected)
                for bond in before.bonds:
                    if (bond.atom_1_id in selected_set) == (bond.atom_2_id in selected_set):
                        continue
                    inside = atom_map[
                        bond.atom_1_id if bond.atom_1_id in selected_set else bond.atom_2_id
                    ]
                    outside = atom_map[
                        bond.atom_2_id if bond.atom_1_id in selected_set else bond.atom_1_id
                    ]
                    if {inside.name.strip(), outside.name.strip()} != {"N", "C"}:
                        raise InvalidSelectionEdit(
                            "Explicit residue crosslinks are unsupported; "
                            "resolve them before mutation."
                        )
                protein_result = PdbfixerProteinEditor().mutate_residue(
                    before,
                    residue_id,
                    payload.action.target_name,
                    next_atom_id=atom_floor,
                    next_bond_id=bond_floor,
                )
                result = SelectionEditResult(
                    EditResult(
                        structure=protein_result.structure,
                        warnings=protein_result.warnings,
                        created_atom_ids=protein_result.created_atom_ids,
                        created_bond_ids=protein_result.created_bond_ids,
                        deleted_atom_ids=protein_result.deleted_atom_ids,
                        deleted_bond_ids=protein_result.deleted_bond_ids,
                        changed_atom_ids=protein_result.changed_atom_ids,
                    ),
                    {},
                )
                after_selection = SelectionV1(
                    atoms=[
                        AtomReference(structure_id=entry.id, atom_id=a.id)
                        for a in result.edit.structure.atoms
                        if a.residue_id == residue_id
                    ],
                    granularity="residue",
                    source=payload.selection.source,
                )
            else:
                result = SelectionMolecularEditor().edit(
                    before,
                    selected,
                    payload.action,
                    next_atom_id=atom_floor,
                    next_bond_id=bond_floor,
                )
        except (InvalidSelectionEdit, InvalidProteinEditError) as error:
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
        before = self._structure(entry)
        return entry, before

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
        edit = result.edit
        atom_floor, bond_floor = ProjectService(self.session).allocation_floor(entry)
        artifact = self.artifacts.publish(
            edit.structure.to_bytes(),
            f"{safe_filename_stem(entry.name)}-edit.normalized.json",
            NORMALIZED_MEDIA_TYPE,
        )
        project = ProjectService(self.session).record_molecular_change(
            entry.project_id,
            expected_revision,
            f"{command_prefix}.{operation}",
            description,
            {
                "entry_id": entry.id,
                "before_artifact_id": entry.current_artifact_id,
                "after_artifact_id": artifact.id,
                "before_values": self._summary(before),
                "after_values": self._summary(edit.structure),
                "next_atom_id": max(atom_floor, max(edit.created_atom_ids, default=0) + 1),
                "next_bond_id": max(bond_floor, max(edit.created_bond_ids, default=0) + 1),
            },
            list(edit.deleted_atom_ids),
            selection_snapshot=[ref.model_dump(mode="json") for ref in selection.atoms],
            viewer_settings_after=viewer_settings_after,
        )
        remaining_ids = {a.id for a in edit.structure.atoms}
        if after_selection is None:
            after_selection = SelectionV1(
                atoms=[
                    AtomReference(structure_id=entry.id, atom_id=i)
                    for i in sorted(
                        {
                            result.replacements.get(ref.atom_id, ref.atom_id)
                            for ref in selection.atoms
                        }
                        & remaining_ids
                    )
                ],
                granularity=selection.granularity,
                source=selection.source,
            )
        return SelectionEditRead(
            project=project,
            warnings=list(edit.warnings),
            report=LigandEditReport(
                operation=operation,
                created_atom_ids=list(edit.created_atom_ids),
                created_bond_ids=list(edit.created_bond_ids),
                deleted_atom_ids=list(edit.deleted_atom_ids),
                deleted_bond_ids=list(edit.deleted_bond_ids),
                changed_atom_ids=list(edit.changed_atom_ids),
            ),
            replacements=result.replacements,
            selection_after=after_selection,
        )

    @staticmethod
    def _selection_description(entry: StructureEntry, payload: SelectionEditCreate) -> str:
        action = payload.action
        if isinstance(action, SelectionResidueMutation):
            label = f"Mutate selected residue to {action.target_name}"
        else:
            label = {
                "atom.element": "Replace selected atom element",
                "atom.charge": "Adjust formal charge",
                "atom.delete": "Delete selected heavy atoms",
                "hydrogens.prepare": "Prepare component hydrogens",
                "fragment.replace": "Substitute selected hydrogen with fragment",
                "bond.create": "Create selected bond",
                "bond.delete": "Break selected bond",
                "bond.order": "Change selected bond order",
            }[action.operation]
        return f"{label} in {entry.name}"
