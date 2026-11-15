"""Pure molecular computation and publication preparation, without database capability."""

from __future__ import annotations

from dataclasses import replace
from typing import Any, Literal

from neistra_core.editing.hydrogen import HydrogenReport
from neistra_core.editing.ligand import EditResult
from neistra_core.editing.model import (
    DirectMolecularEditor,
    InvalidModelEdit,
    ModelAtomAdd,
    ModelBondDelete,
    ModelBondRotate,
    ModelBondSet,
    ModelEditResult,
    ModelFragmentAdd,
    ModelHydrogenAdd,
    ModelHydrogenComplete,
)
from neistra_core.editing.protein import InvalidProteinEditError, PdbfixerProteinEditor
from neistra_core.editing.reconciliation import ReconciliationReport
from neistra_core.editing.selection import (
    InvalidSelectionEdit,
    SelectionEditResult,
    SelectionMolecularEditor,
)
from neistra_core.hydrogen_protection import protection_facts
from neistra_core.molecular import MolecularWarning, NormalizedStructureV1
from neistra_core.selection import AtomReference, SelectionV1
from pydantic import BaseModel, ConfigDict

from neistra_api.schemas import (
    LigandEditReport,
    ModelEditCreate,
    ModelEditRead,
    ModelPreviewAtom,
    ModelPreviewBond,
    ModelPreviewMovement,
    ModelPreviewRead,
    ModelPreviewRemoval,
    ModelPreviewRotation,
    ProjectRead,
    SelectionEditCreate,
    SelectionEditRead,
    SelectionResidueMutation,
)
from neistra_api.viewer_state import inherit_added_appearance


class InvalidEditComputation(ValueError):
    """An existing scientific edit contract refused the operation."""


class EditTarget(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    entry_id: str
    artifact_id: str
    name: str
    structure_type: str
    viewer_settings: dict[str, Any]
    atom_floor: int
    bond_floor: int
    atom_limit: int


class PreparedPublication(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: Literal["model", "selection"]
    entry_id: str
    source_artifact_id: str
    operation: str
    description: str
    command_prefix: str
    before_values: dict[str, Any]
    after_values: dict[str, Any]
    next_atom_id: int
    next_bond_id: int
    selection_snapshot: list[dict[str, Any]]
    viewer_settings_after: dict[str, Any] | None
    warnings: list[MolecularWarning]
    report: LigandEditReport
    replacements: dict[int, int]
    selection_after: SelectionV1
    applied: bool = True
    hydrogen_report: HydrogenReport | None = None
    hydrogen_reconciliation_report: ReconciliationReport | None = None

    def response(self, project: ProjectRead) -> ModelEditRead | SelectionEditRead:
        values: dict[str, Any] = {
            "project": project,
            "warnings": self.warnings,
            "report": self.report,
            "replacements": self.replacements,
            "selection_after": self.selection_after,
        }
        if self.kind == "model":
            return ModelEditRead(
                **values,
                applied=self.applied,
                hydrogen_report=self.hydrogen_report,
                hydrogen_reconciliation_report=self.hydrogen_reconciliation_report,
            )
        return SelectionEditRead(**values)


def molecular_summary(structure: NormalizedStructureV1) -> dict[str, Any]:
    return {
        "atom_count": len(structure.atoms),
        "atom_ids": [atom.id for atom in structure.atoms],
        "bond_count": len(structure.bonds),
        "residue_count": len(structure.residues),
        "conformer_count": len(structure.conformers),
        "warnings": [warning.model_dump(mode="json") for warning in structure.warnings],
    }


def needs_original_protection(before: NormalizedStructureV1, payload: ModelEditCreate) -> bool:
    if isinstance(payload.action, ModelBondRotate):
        return False
    if (
        payload.hydrogen_policy not in {"reconcile_if_possible", "automatic"}
        and payload.action.operation != "hydrogens.add_one"
    ):
        return False
    targets = {ref.atom_id for ref in payload.selection.atoms}
    atoms = {a.id: a for a in before.atoms}
    if payload.hydrogen_policy == "automatic" or payload.action.operation == "hydrogens.add_one":
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
    facts = protection_facts(before)
    return not all(i in facts and facts[i].matches(atoms[i]) for i in needed if i in atoms)


def compute_model_result(
    target: EditTarget,
    before: NormalizedStructureV1,
    payload: ModelEditCreate,
) -> ModelEditResult:
    try:
        return DirectMolecularEditor().edit(
            before,
            [ref.atom_id for ref in payload.selection.atoms],
            payload.action,
            next_atom_id=target.atom_floor,
            next_bond_id=target.bond_floor,
            hydrogen_policy=payload.hydrogen_policy,
            atom_limit=target.atom_limit,
        )
    except InvalidModelEdit as error:
        raise InvalidEditComputation(str(error)) from error


def compute_selection_result(
    target: EditTarget,
    before: NormalizedStructureV1,
    payload: SelectionEditCreate,
) -> tuple[SelectionEditResult, SelectionV1 | None]:
    selected = [ref.atom_id for ref in payload.selection.atoms]
    after_selection: SelectionV1 | None = None
    try:
        if isinstance(payload.action, SelectionResidueMutation):
            if target.structure_type not in {"protein", "complex"}:
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
                        "Explicit residue crosslinks are unsupported; resolve them before mutation."
                    )
            protein_result = PdbfixerProteinEditor().mutate_residue(
                before,
                residue_id,
                payload.action.target_name,
                next_atom_id=target.atom_floor,
                next_bond_id=target.bond_floor,
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
                    AtomReference(structure_id=target.entry_id, atom_id=a.id)
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
                next_atom_id=target.atom_floor,
                next_bond_id=target.bond_floor,
            )
    except (InvalidSelectionEdit, InvalidProteinEditError) as error:
        raise InvalidEditComputation(str(error)) from error
    return result, after_selection


def selection_after_edit(
    entry_id: str,
    selection: SelectionV1,
    result: SelectionEditResult,
) -> SelectionV1:
    remaining_ids = {a.id for a in result.edit.structure.atoms}
    return SelectionV1(
        atoms=[
            AtomReference(structure_id=entry_id, atom_id=i)
            for i in sorted(
                {result.replacements.get(ref.atom_id, ref.atom_id) for ref in selection.atoms}
                & remaining_ids
            )
        ],
        granularity=selection.granularity,
        source=selection.source,
    )


def prepare_publication(
    target: EditTarget,
    before: NormalizedStructureV1,
    selection: SelectionV1,
    operation: str,
    description: str,
    result: SelectionEditResult,
    after_selection: SelectionV1 | None = None,
    *,
    kind: Literal["model", "selection"] = "selection",
    command_prefix: str = "selection",
    viewer_settings_after: dict[str, Any] | None = None,
    applied: bool = True,
    hydrogen_report: HydrogenReport | None = None,
    hydrogen_reconciliation_report: ReconciliationReport | None = None,
) -> PreparedPublication:
    edit = result.edit
    return PreparedPublication(
        kind=kind,
        entry_id=target.entry_id,
        source_artifact_id=target.artifact_id,
        operation=operation,
        description=description,
        command_prefix=command_prefix,
        before_values=molecular_summary(before),
        after_values=molecular_summary(edit.structure),
        next_atom_id=max(target.atom_floor, max(edit.created_atom_ids, default=0) + 1),
        next_bond_id=max(target.bond_floor, max(edit.created_bond_ids, default=0) + 1),
        selection_snapshot=[ref.model_dump(mode="json") for ref in selection.atoms],
        viewer_settings_after=viewer_settings_after,
        warnings=list(edit.warnings),
        report=LigandEditReport(
            operation=operation,
            created_atom_ids=list(edit.created_atom_ids),
            created_bond_ids=list(edit.created_bond_ids),
            deleted_atom_ids=list(edit.deleted_atom_ids),
            deleted_bond_ids=list(edit.deleted_bond_ids),
            changed_atom_ids=list(edit.changed_atom_ids),
        )
        if applied
        else LigandEditReport(operation=operation),
        replacements=result.replacements if applied else {},
        selection_after=after_selection or selection_after_edit(target.entry_id, selection, result),
        applied=applied,
        hydrogen_report=hydrogen_report,
        hydrogen_reconciliation_report=hydrogen_reconciliation_report,
    )


def model_description(name: str, operation: str) -> str:
    label = {
        "hydrogens.complete": "Complete hydrogens",
        "hydrogens.add": "Add explicit hydrogens",
        "hydrogens.add_one": "Add one hydrogen",
        "atom.element": "Change atom element",
        "atom.charge.set": "Set formal charge",
        "atom.delete": "Delete selected atoms",
        "atom.add": "Add atom",
        "bond.set": "Assign bond order",
        "bond.delete": "Break selected bond",
        "bond.rotate": "Rotate selected bond",
        "fragment.attach": "Attach fragment",
    }[operation]
    return f"{label} in {name}"


def selection_description(name: str, payload: SelectionEditCreate) -> str:
    if isinstance(payload.action, SelectionResidueMutation):
        label = f"Mutate selected residue to {payload.action.target_name}"
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
        }[payload.action.operation]
    return f"{label} in {name}"


def prepare_model_publication(
    target: EditTarget,
    before: NormalizedStructureV1,
    payload: ModelEditCreate,
    result: ModelEditResult,
) -> tuple[PreparedPublication, NormalizedStructureV1]:
    applied = not result.no_op and not (
        isinstance(payload.action, (ModelHydrogenComplete, ModelHydrogenAdd))
        and not result.edit.created_atom_ids
    )
    settings_after: dict[str, Any] | None = None
    if applied:
        settings_after, appearance_warnings = inherit_added_appearance(
            target.viewer_settings,
            before,
            result.edit.structure,
            result.appearance_sources,
        )
        if appearance_warnings:
            result = replace(
                result,
                edit=replace(
                    result.edit,
                    structure=result.edit.structure.model_copy(
                        update={
                            "warnings": [*result.edit.structure.warnings, *appearance_warnings],
                        }
                    ),
                    warnings=(*result.edit.warnings, *appearance_warnings),
                ),
            )
    after_selection = (
        payload.selection
        if not applied
        else (
            SelectionV1(
                atoms=[
                    AtomReference(
                        structure_id=target.entry_id,
                        atom_id=result.edit.created_atom_ids[0],
                    )
                ],
                source=payload.selection.source,
            )
            if isinstance(payload.action, (ModelAtomAdd, ModelFragmentAdd))
            else None
        )
    )
    prepared = prepare_publication(
        target,
        before,
        payload.selection,
        payload.action.operation,
        model_description(target.name, payload.action.operation),
        result,
        after_selection,
        kind="model",
        command_prefix="model",
        applied=applied,
        viewer_settings_after=settings_after if settings_after != target.viewer_settings else None,
        hydrogen_report=result.hydrogen_report,
        hydrogen_reconciliation_report=result.hydrogen_reconciliation_report if applied else None,
    )
    return prepared, result.edit.structure


def validate_preview_action(payload: ModelEditCreate) -> None:
    if not isinstance(
        payload.action,
        (
            ModelAtomAdd,
            ModelFragmentAdd,
            ModelHydrogenComplete,
            ModelHydrogenAdd,
            ModelBondSet,
            ModelBondDelete,
            ModelBondRotate,
        ),
    ):
        raise InvalidEditComputation("Preview requires atom, fragment or hydrogen placement.")


def build_model_preview(
    entry_id: str,
    before: NormalizedStructureV1,
    payload: ModelEditCreate,
    outcome: ModelEditResult,
) -> ModelPreviewRead:
    result = outcome.edit
    created = set(result.created_atom_ids)
    atoms = {a.id: a for a in result.structure.atoms}
    old_atoms = {a.id: a for a in before.atoms}
    changed = {
        a.id
        for a in result.structure.atoms
        if a.id in old_atoms and a.coordinates != old_atoms[a.id].coordinates
    }
    plan = outcome.rotation
    return ModelPreviewRead(
        rotation=(
            ModelPreviewRotation(
                axis_atom_ids=plan.axis_atom_ids,
                moving_endpoint_id=plan.moving_endpoint_id,
                angle_degrees=plan.angle_degrees,
                rotating_atom_count=len(plan.rotating_atom_ids),
                fixed_atom_count=len(plan.fixed_atom_ids),
                no_op=outcome.no_op,
            )
            if plan is not None
            else None
        ),
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
