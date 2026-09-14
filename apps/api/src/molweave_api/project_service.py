from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import Any

from molweave_core.selection import SelectionV1
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from uuid6 import uuid7

from molweave_api.models import (
    CommandRecord,
    EntryGroup,
    Measurement,
    Project,
    SavedSelection,
    Scene,
    StructureEntry,
)
from molweave_api.schemas import (
    CoordinatePatch,
    EntryRead,
    GroupRead,
    HistoryRead,
    MeasurementKind,
    MeasurementRead,
    ProjectListItem,
    ProjectRead,
    SavedSelectionRead,
    SceneRead,
    SelectionAppearanceUpdate,
    SelectionAtomVisibilityUpdate,
    SelectionPocketSurfaceUpdate,
    SelectionSurfaceUpdate,
    TopologyPatch,
    ViewerSettings,
)
from molweave_api.viewer_state import (
    ATOMIC_SELECTION_STYLES,
    default_viewer_settings,
    prune_pocket_seeds,
    prune_selection_representations,
    remap_pocket_seeds,
    update_selection_colors,
    update_selection_hydrogens,
    update_selection_representations,
)

HISTORY_LIMIT = 200
PROJECT_STATE_SCHEMA_VERSION = 1


class ProjectNotFoundError(LookupError):
    pass


class EntryNotFoundError(LookupError):
    pass


class RevisionConflictError(RuntimeError):
    def __init__(self, current_revision: int) -> None:
        super().__init__("Project revision is stale")
        self.current_revision = current_revision


class HistoryUnavailableError(RuntimeError):
    pass


class InvalidProjectOperationError(ValueError):
    pass


def _uuid() -> str:
    return str(uuid7())


def _entry_state(entry: StructureEntry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "group_id": entry.group_id,
        "name": entry.name,
        "description": entry.description,
        "structure_type": entry.structure_type,
        "original_filename": entry.original_filename,
        "source_format": entry.source_format,
        "normalized_data": deepcopy(entry.normalized_data),
        "atom_count": entry.atom_count,
        "atom_ids": deepcopy(entry.atom_ids),
        "bond_count": entry.bond_count,
        "residue_count": entry.residue_count,
        "conformer_count": entry.conformer_count,
        "warnings": deepcopy(entry.warnings),
        "next_atom_id": entry.next_atom_id,
        "next_bond_id": entry.next_bond_id,
        "viewer_settings": deepcopy(entry.viewer_settings),
        "visible": entry.visible,
        "locked": entry.locked,
        "user_metadata": deepcopy(entry.user_metadata),
        "job_links": deepcopy(entry.job_links),
        "generated_results": deepcopy(entry.generated_results),
        "original_artifact_id": entry.original_artifact_id,
        "current_artifact_id": entry.current_artifact_id,
        "created_at": entry.created_at.isoformat(),
    }


def _group_state(group: EntryGroup) -> dict[str, Any]:
    return {
        "id": group.id,
        "parent_id": group.parent_id,
        "name": group.name,
        "created_at": group.created_at.isoformat(),
    }


def _saved_selection_state(saved_selection: SavedSelection) -> dict[str, Any]:
    return {
        "id": saved_selection.id,
        "name": saved_selection.name,
        "atom_references": deepcopy(saved_selection.atom_references),
        "granularity": saved_selection.granularity,
        "warnings": deepcopy(saved_selection.warnings),
        "created_at": saved_selection.created_at.isoformat(),
    }


def _measurement_state(measurement: Measurement) -> dict[str, Any]:
    return {
        "id": measurement.id,
        "name": measurement.name,
        "kind": measurement.kind,
        "atom_references": deepcopy(measurement.atom_references),
        "visible": measurement.visible,
        "warnings": deepcopy(measurement.warnings),
        "created_at": measurement.created_at.isoformat(),
    }


def _scene_state(scene: Scene) -> dict[str, Any]:
    return {
        "id": scene.id,
        "name": scene.name,
        "camera": deepcopy(scene.camera),
        "entry_states": deepcopy(scene.entry_states),
        "selection": deepcopy(scene.selection),
        "created_at": scene.created_at.isoformat(),
    }


def _project_state(project: Project) -> dict[str, Any]:
    return {
        "schema_version": PROJECT_STATE_SCHEMA_VERSION,
        "name": project.name,
        "description": project.description,
        "entries": sorted(
            (_entry_state(entry) for entry in project.entries),
            key=lambda item: item["id"],
        ),
        "groups": sorted(
            (_group_state(group) for group in project.groups),
            key=lambda item: item["id"],
        ),
        "saved_selections": sorted(
            (
                _saved_selection_state(saved_selection)
                for saved_selection in project.saved_selections
            ),
            key=lambda item: item["id"],
        ),
        "measurements": sorted(
            (_measurement_state(measurement) for measurement in project.measurements),
            key=lambda item: item["id"],
        ),
        "scenes": sorted(
            (_scene_state(scene) for scene in project.scenes),
            key=lambda item: item["id"],
        ),
    }


def project_state(project: Project) -> dict[str, Any]:
    """Return the canonical checkpoint state for persistence transports."""
    return _project_state(project)


def _history(session: Session, project_id: str) -> HistoryRead:
    applied = session.scalar(
        select(CommandRecord)
        .where(CommandRecord.project_id == project_id, CommandRecord.is_applied.is_(True))
        .order_by(CommandRecord.position.desc())
        .limit(1)
    )
    redo = session.scalar(
        select(CommandRecord)
        .where(CommandRecord.project_id == project_id, CommandRecord.is_applied.is_(False))
        .order_by(CommandRecord.position.asc())
        .limit(1)
    )
    retained = session.scalar(
        select(func.count())
        .select_from(CommandRecord)
        .where(CommandRecord.project_id == project_id)
    )
    return HistoryRead(
        can_undo=applied is not None,
        can_redo=redo is not None,
        undo_description=applied.description if applied else None,
        redo_description=redo.description if redo else None,
        retained_commands=retained or 0,
        limit=HISTORY_LIMIT,
    )


def _is_dirty(project: Project) -> bool:
    return _project_state(project) != project.checkpoint_state


def project_read(
    session: Session,
    project: Project,
    structure_patches: list[CoordinatePatch] | None = None,
    topology_patches: list[TopologyPatch] | None = None,
) -> ProjectRead:
    session.refresh(
        project,
        attribute_names=["entries", "groups", "saved_selections", "measurements", "scenes"],
    )
    current_state = _project_state(project)
    checkpoint_entries = {item["id"]: item for item in project.checkpoint_state.get("entries", [])}
    for entry in project.entries:
        entry.dirty = _entry_state(entry) != checkpoint_entries.get(entry.id)
    return ProjectRead(
        id=project.id,
        name=project.name,
        description=project.description,
        revision=project.revision,
        checkpoint_revision=project.checkpoint_revision,
        has_uncheckpointed_changes=current_state != project.checkpoint_state,
        created_at=project.created_at,
        modified_at=project.modified_at,
        entries=[
            EntryRead.model_validate(entry)
            for entry in sorted(project.entries, key=lambda item: item.name)
        ],
        groups=[
            GroupRead.model_validate(group)
            for group in sorted(project.groups, key=lambda item: item.name)
        ],
        saved_selections=[
            SavedSelectionRead.model_validate(saved_selection)
            for saved_selection in sorted(
                project.saved_selections, key=lambda item: item.name.casefold()
            )
        ],
        measurements=[
            MeasurementRead.model_validate(measurement)
            for measurement in sorted(project.measurements, key=lambda item: item.created_at)
        ],
        scenes=[
            SceneRead.model_validate(scene)
            for scene in sorted(project.scenes, key=lambda item: item.name.casefold())
        ],
        history=_history(session, project.id),
        structure_patches=structure_patches or [],
        topology_patches=topology_patches or [],
    )


class ProjectService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_projects(self) -> list[ProjectListItem]:
        projects = self.session.scalars(select(Project).order_by(Project.modified_at.desc())).all()
        return [
            ProjectListItem(
                id=project.id,
                name=project.name,
                description=project.description,
                revision=project.revision,
                checkpoint_revision=project.checkpoint_revision,
                has_uncheckpointed_changes=_is_dirty(project),
                entry_count=len(project.entries),
                created_at=project.created_at,
                modified_at=project.modified_at,
            )
            for project in projects
        ]

    def create_project(self, name: str, description: str | None) -> ProjectRead:
        project = Project(id=_uuid(), name=name, description=description)
        self.session.add(project)
        self.session.flush()
        project.checkpoint_state = _project_state(project)
        self.session.commit()
        return project_read(self.session, project)

    def get_project(self, project_id: str) -> ProjectRead:
        return project_read(self.session, self._project(project_id))

    def save(self, project_id: str, expected_revision: int) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        project.checkpoint_state = _project_state(project)
        project.checkpoint_revision = project.revision
        for entry in project.entries:
            entry.dirty = False
        self.session.commit()
        return project_read(self.session, project)

    def update_project(
        self, project_id: str, expected_revision: int, name: str, description: str | None
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        forward = [{"kind": "project.update", "values": {"name": name, "description": description}}]
        inverse = [
            {
                "kind": "project.update",
                "values": {"name": project.name, "description": project.description},
            }
        ]
        return self._record(
            project,
            "project.update",
            f"Update project details for {name}",
            forward,
            inverse,
            [],
        )

    def update_entry(
        self,
        project_id: str,
        entry_id: str,
        expected_revision: int,
        values: dict[str, Any],
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        entry = self._entry(project, entry_id)
        inverse_values = {key: deepcopy(getattr(entry, key)) for key in values}
        return self._record(
            project,
            "entry.update",
            f"Rename {entry.name} to {values['name']}",
            [{"kind": "entry.update", "entry_id": entry.id, "values": values}],
            [{"kind": "entry.update", "entry_id": entry.id, "values": inverse_values}],
            [entry.id],
        )

    def duplicate_entry(
        self, project_id: str, entry_id: str, expected_revision: int
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        entry = self._entry(project, entry_id)
        duplicate = _entry_state(entry)
        duplicate["id"] = _uuid()
        duplicate["viewer_settings"] = remap_pocket_seeds(
            duplicate["viewer_settings"], {entry.id: duplicate["id"]}
        )
        duplicate["name"] = self._copy_name(project, entry.name)
        duplicate["created_at"] = datetime.now(UTC).isoformat()
        return self._record(
            project,
            "entry.duplicate",
            f"Duplicate {entry.name}",
            [{"kind": "entry.create", "entry": duplicate}],
            [{"kind": "entry.delete", "entry_id": duplicate["id"]}],
            [entry.id, duplicate["id"]],
        )

    def import_entries(
        self,
        project_id: str,
        expected_revision: int,
        entry_states: list[dict[str, Any]],
        file_count: int,
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        if not entry_states:
            raise InvalidProjectOperationError("An import must contain at least one structure")
        entry_ids = [str(state["id"]) for state in entry_states]
        return self._record(
            project,
            "entry.import",
            f"Import {len(entry_states)} structures from {file_count} files",
            [{"kind": "entry.create", "entry": state} for state in entry_states],
            [{"kind": "entry.delete", "entry_id": entry_id} for entry_id in reversed(entry_ids)],
            entry_ids,
        )

    def import_job_result(
        self,
        project_id: str,
        expected_revision: int,
        entry_state: dict[str, Any],
        job_id: str,
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        entry_id = str(entry_state["id"])
        return self._record(
            project,
            "job.result.import",
            f"Import result from job {job_id[:8]}",
            [{"kind": "entry.create", "entry": entry_state}],
            [{"kind": "entry.delete", "entry_id": entry_id}],
            [entry_id],
        )

    def set_entry_value(
        self,
        project_id: str,
        entry_id: str,
        expected_revision: int,
        field: str,
        value: bool,
    ) -> ProjectRead:
        if field not in {"visible", "locked"}:
            raise InvalidProjectOperationError(f"Unsupported entry field: {field}")
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        entry = self._entry(project, entry_id)
        verb = (
            "Show"
            if value and field == "visible"
            else "Hide"
            if field == "visible"
            else "Lock"
            if value
            else "Unlock"
        )
        return self._record(
            project,
            f"entry.{field}",
            f"{verb} {entry.name}",
            [{"kind": "entry.update", "entry_id": entry.id, "values": {field: value}}],
            [
                {
                    "kind": "entry.update",
                    "entry_id": entry.id,
                    "values": {field: getattr(entry, field)},
                }
            ],
            [entry.id],
        )

    def update_viewer_settings(
        self,
        project_id: str,
        entry_id: str,
        expected_revision: int,
        settings: ViewerSettings,
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        entry = self._entry(project, entry_id)
        values = settings.model_dump(mode="json")
        for field in ("selection_colors", "selection_nonpolar_hydrogens"):
            current = entry.viewer_settings.get(field, [])
            if field not in settings.model_fields_set:
                values[field] = deepcopy(current)
            elif values[field] != current:
                raise InvalidProjectOperationError("Use the selection appearance action")
        current_pocket = entry.viewer_settings.get("selection_pocket_surface")
        if "selection_pocket_surface" not in settings.model_fields_set:
            values["selection_pocket_surface"] = deepcopy(current_pocket)
        elif values["selection_pocket_surface"] != current_pocket:
            raise InvalidProjectOperationError("Use the selection pocket surface action")
        current_hidden = entry.viewer_settings.get("selection_hidden_atoms", [])
        if "selection_hidden_atoms" not in settings.model_fields_set:
            values["selection_hidden_atoms"] = deepcopy(current_hidden)
        elif values["selection_hidden_atoms"] != current_hidden:
            raise InvalidProjectOperationError("Use the selection atom visibility action")
        current_surface = entry.viewer_settings.get("selection_surface")
        if "selection_surface" not in settings.model_fields_set:
            values["selection_surface"] = deepcopy(current_surface)
        elif values["selection_surface"] != current_surface:
            raise InvalidProjectOperationError("Use the selection surface action")
        current_assignments = entry.viewer_settings.get("selection_representations", [])
        if values["selection_representations"] != current_assignments:
            raise InvalidProjectOperationError(
                "Use the selection representation action to change selected-atom styles"
            )
        return self._record(
            project,
            "entry.viewer_settings",
            f"Update viewer settings for {entry.name}",
            [
                {
                    "kind": "entry.update",
                    "entry_id": entry.id,
                    "values": {"viewer_settings": values},
                }
            ],
            [
                {
                    "kind": "entry.update",
                    "entry_id": entry.id,
                    "values": {"viewer_settings": deepcopy(entry.viewer_settings)},
                }
            ],
            [entry.id],
        )

    def update_selection_representations(
        self,
        project_id: str,
        expected_revision: int,
        atom_references: list[dict[str, Any]],
        *,
        action: str,
        style: str | None,
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        if not atom_references:
            raise InvalidProjectOperationError(
                "Select at least one atom to change its representation"
            )
        self._validate_atom_references(project, atom_references)
        selected_by_entry: dict[str, set[int]] = {}
        for reference in atom_references:
            selected_by_entry.setdefault(str(reference["structure_id"]), set()).add(
                int(reference["atom_id"])
            )
        forward: list[dict[str, Any]] = []
        inverse: list[dict[str, Any]] = []
        for entry_id in sorted(selected_by_entry):
            entry = self._entry(project, entry_id)
            before = deepcopy(entry.viewer_settings)
            after = {
                **before,
                "selection_representations": update_selection_representations(
                    before.get("selection_representations", []),
                    selected_by_entry[entry_id],
                    action=action,
                    style=style,
                ),
            }
            if action == "reset" or style in ATOMIC_SELECTION_STYLES:
                after["selection_hidden_atoms"] = sorted(
                    set(before.get("selection_hidden_atoms", [])) - selected_by_entry[entry_id]
                )
            forward.append(
                {
                    "kind": "entry.update",
                    "entry_id": entry.id,
                    "values": {"viewer_settings": after},
                }
            )
            inverse.insert(
                0,
                {
                    "kind": "entry.update",
                    "entry_id": entry.id,
                    "values": {"viewer_settings": before},
                },
            )
        atom_count = len(atom_references)
        entry_count = len(selected_by_entry)
        if action == "reset":
            description = (
                f"Reset selected representations for {atom_count} atom"
                f"{'s' if atom_count != 1 else ''} in {entry_count} entr"
                f"{'ies' if entry_count != 1 else 'y'}"
            )
        else:
            shown_style = (style or "").replace("-", " ").title()
            description = (
                f"Apply {shown_style} to {atom_count} atom"
                f"{'s' if atom_count != 1 else ''} in {entry_count} entr"
                f"{'ies' if entry_count != 1 else 'y'}"
            )
        return self._record(
            project,
            "selection.representation",
            description,
            forward,
            inverse,
            sorted(selected_by_entry),
            selection_snapshot=deepcopy(atom_references),
        )

    def update_selection_surface(
        self, project_id: str, payload: SelectionSurfaceUpdate
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, payload.expected_revision)
        references = [item.model_dump(mode="json") for item in payload.selection.atoms]
        self._validate_atom_references(project, references)
        targets: dict[str, set[int]] = {}
        for item in payload.selection.atoms:
            targets.setdefault(item.structure_id, set()).add(item.atom_id)
        forward: list[dict[str, Any]] = []
        inverse: list[dict[str, Any]] = []
        affected: list[str] = []
        for entry_id, ids in sorted(targets.items()):
            entry = self._entry(project, entry_id)
            before = deepcopy(entry.viewer_settings)
            surface = before.get("selection_surface")
            current = set(surface["atom_ids"]) if surface else set()
            result = current | ids if payload.action == "add" else current - ids
            if result == current:
                continue
            after = {
                **before,
                "selection_surface": (
                    {"profile": "molecular-v1", "atom_ids": sorted(result)} if result else None
                ),
            }
            forward.append(
                {"kind": "entry.update", "entry_id": entry_id, "values": {"viewer_settings": after}}
            )
            inverse.insert(
                0,
                {
                    "kind": "entry.update",
                    "entry_id": entry_id,
                    "values": {"viewer_settings": before},
                },
            )
            affected.append(entry_id)
        if not affected:
            return self.get_project(project_id)
        return self._record(
            project,
            "selection.surface",
            f"{payload.action.title()} selection surface membership for {len(references)} atoms",
            forward,
            inverse,
            affected,
            selection_snapshot=references,
        )

    def update_selection_pocket_surface(
        self, project_id: str, payload: SelectionPocketSurfaceUpdate
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, payload.expected_revision)
        receptor = self._entry(project, payload.receptor_entry_id)
        definition = payload.pocket.model_dump(mode="json") if payload.pocket else None
        references = definition["seed_atom_references"] if definition else []
        self._validate_atom_references(project, references)
        before = deepcopy(receptor.viewer_settings)
        if before.get("selection_pocket_surface") == definition:
            return self.get_project(project_id)
        after = {**before, "selection_pocket_surface": definition}
        return self._record(
            project,
            "selection.pocket_surface",
            f"{payload.action.title()} protein pocket for {receptor.name}",
            [
                {
                    "kind": "entry.update",
                    "entry_id": receptor.id,
                    "values": {"viewer_settings": after},
                }
            ],
            [
                {
                    "kind": "entry.update",
                    "entry_id": receptor.id,
                    "values": {"viewer_settings": before},
                }
            ],
            [receptor.id],
            selection_snapshot=references,
        )

    def update_selection_atom_visibility(
        self, project_id: str, payload: SelectionAtomVisibilityUpdate
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, payload.expected_revision)
        references = [item.model_dump(mode="json") for item in payload.selection.atoms]
        self._validate_atom_references(project, references)
        targets: dict[str, set[int]] = {}
        for item in payload.selection.atoms:
            targets.setdefault(item.structure_id, set()).add(item.atom_id)
        forward: list[dict[str, Any]] = []
        inverse: list[dict[str, Any]] = []
        affected: list[str] = []
        for entry_id, ids in sorted(targets.items()):
            entry = self._entry(project, entry_id)
            before = deepcopy(entry.viewer_settings)
            current = set(before.get("selection_hidden_atoms", []))
            result = current | ids if payload.action == "hide" else current - ids
            if result == current:
                continue
            after = {
                **before,
                "selection_hidden_atoms": sorted(result),
            }
            forward.append(
                {"kind": "entry.update", "entry_id": entry_id, "values": {"viewer_settings": after}}
            )
            inverse.insert(
                0,
                {
                    "kind": "entry.update",
                    "entry_id": entry_id,
                    "values": {"viewer_settings": before},
                },
            )
            affected.append(entry_id)
        if not affected:
            return self.get_project(project_id)
        return self._record(
            project,
            "selection.atom_visibility",
            f"{payload.action.title()} selection atom detail for {len(references)} atoms",
            forward,
            inverse,
            affected,
            selection_snapshot=references,
        )

    def update_selection_appearance(
        self,
        project_id: str,
        payload: SelectionAppearanceUpdate,
        element_targets: dict[str, set[int]] | None = None,
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, payload.expected_revision)
        references = [item.model_dump(mode="json") for item in payload.selection.atoms]
        self._validate_atom_references(project, references)
        targets: dict[str, set[int]] = {}
        for item in payload.selection.atoms:
            targets.setdefault(item.structure_id, set()).add(item.atom_id)
        if payload.property == "nonpolar_hydrogens":
            if not element_targets or not any(element_targets.values()):
                raise InvalidProjectOperationError("Select explicit hydrogen atoms first")
            targets = {key: ids for key, ids in element_targets.items() if ids}
        forward: list[dict[str, Any]] = []
        inverse: list[dict[str, Any]] = []
        for entry_id, atom_ids in sorted(targets.items()):
            entry = self._entry(project, entry_id)
            before = deepcopy(entry.viewer_settings)
            if payload.property == "color":
                colors = update_selection_colors(
                    before.get("selection_colors", []), atom_ids, payload.color
                )
                if payload.color_mode == "carbon":
                    if element_targets is None:
                        raise InvalidProjectOperationError("Carbon targets must be resolved first")
                    colors = update_selection_colors(
                        colors, atom_ids - element_targets.get(entry_id, set()), "element"
                    )
                after = {
                    **before,
                    "selection_colors": colors,
                }
            else:
                after = {
                    **before,
                    "selection_nonpolar_hydrogens": update_selection_hydrogens(
                        before.get("selection_nonpolar_hydrogens", []),
                        atom_ids,
                        payload.show,
                    ),
                }
            forward.append(
                {"kind": "entry.update", "entry_id": entry_id, "values": {"viewer_settings": after}}
            )
            inverse.insert(
                0,
                {
                    "kind": "entry.update",
                    "entry_id": entry_id,
                    "values": {"viewer_settings": before},
                },
            )
        target_count = sum(len(ids) for ids in targets.values())
        property_label = "color" if payload.property == "color" else "hydrogen visibility"
        return self._record(
            project,
            "selection.appearance",
            f"{payload.action.title()} selection {property_label} for {target_count} atoms",
            forward,
            inverse,
            sorted(targets),
            selection_snapshot=references,
        )

    def isolate_entry(self, project_id: str, entry_id: str, expected_revision: int) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        entry = self._entry(project, entry_id)
        before = {item.id: item.visible for item in project.entries}
        after = {item.id: item.id == entry.id for item in project.entries}
        return self._record(
            project,
            "entry.isolate",
            f"Isolate {entry.name}",
            [{"kind": "entries.visibility", "values": after}],
            [{"kind": "entries.visibility", "values": before}],
            list(before),
        )

    def delete_entry(self, project_id: str, entry_id: str, expected_revision: int) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        entry = self._entry(project, entry_id)
        snapshot = _entry_state(entry)
        forward: list[dict[str, Any]] = []
        inverse: list[dict[str, Any]] = [{"kind": "entry.create", "entry": snapshot}]
        for owner in project.entries:
            if owner.id == entry.id:
                continue
            before = deepcopy(owner.viewer_settings)
            after = prune_pocket_seeds(before, entry.id, None)
            if after != before:
                forward.append(
                    {
                        "kind": "entry.update",
                        "entry_id": owner.id,
                        "values": {"viewer_settings": after},
                    }
                )
                inverse.append(
                    {
                        "kind": "entry.update",
                        "entry_id": owner.id,
                        "values": {"viewer_settings": before},
                    }
                )
        for saved_selection in project.saved_selections:
            retained = [
                reference
                for reference in saved_selection.atom_references
                if reference["structure_id"] != entry.id
            ]
            removed = len(saved_selection.atom_references) - len(retained)
            if removed == 0:
                continue
            warning = {
                "code": "invalid_selection_references_removed",
                "message": (
                    f"{removed} atom reference{'s were' if removed != 1 else ' was'} "
                    f"removed after deleting {entry.name}."
                ),
                "operation": "entry.delete",
                "severity": "warning",
                "field": "atom_references",
                "blocking": False,
            }
            forward.append(
                {
                    "kind": "selection.update",
                    "selection_id": saved_selection.id,
                    "values": {
                        "atom_references": retained,
                        "warnings": [*saved_selection.warnings, warning],
                    },
                }
            )
            inverse.append(
                {
                    "kind": "selection.update",
                    "selection_id": saved_selection.id,
                    "values": {
                        "atom_references": deepcopy(saved_selection.atom_references),
                        "warnings": deepcopy(saved_selection.warnings),
                    },
                }
            )
        for measurement in project.measurements:
            if not any(
                reference["structure_id"] == entry.id for reference in measurement.atom_references
            ):
                continue
            state = _measurement_state(measurement)
            forward.append({"kind": "measurement.delete", "measurement_id": measurement.id})
            inverse.append({"kind": "measurement.create", "measurement": state})
        for scene in project.scenes:
            retained_entries = [
                {
                    **state,
                    "viewer_settings": prune_pocket_seeds(state["viewer_settings"], entry.id, None),
                }
                for state in scene.entry_states
                if state["entry_id"] != entry.id
            ]
            retained_atoms = [
                reference
                for reference in scene.selection.get("atoms", [])
                if reference["structure_id"] != entry.id
            ]
            if retained_entries == scene.entry_states and len(retained_atoms) == len(
                scene.selection.get("atoms", [])
            ):
                continue
            forward.append(
                {
                    "kind": "scene.update",
                    "scene_id": scene.id,
                    "values": {
                        "entry_states": retained_entries,
                        "selection": {**scene.selection, "atoms": retained_atoms},
                    },
                }
            )
            inverse.append(
                {
                    "kind": "scene.update",
                    "scene_id": scene.id,
                    "values": {
                        "entry_states": deepcopy(scene.entry_states),
                        "selection": deepcopy(scene.selection),
                    },
                }
            )
        forward.append({"kind": "entry.delete", "entry_id": entry.id})
        return self._record(
            project,
            "entry.delete",
            f"Delete {entry.name}",
            forward,
            inverse,
            [entry.id],
        )

    def create_saved_selection(
        self,
        project_id: str,
        expected_revision: int,
        name: str,
        current: SelectionV1,
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        normalized_name = name.strip()
        if not normalized_name:
            raise InvalidProjectOperationError("Selection name must not be blank")
        if any(
            item.name.casefold() == normalized_name.casefold() for item in project.saved_selections
        ):
            raise InvalidProjectOperationError(
                f'A saved selection named "{normalized_name}" already exists'
            )
        entries = {entry.id: entry for entry in project.entries}
        for reference in current.atoms:
            entry = entries.get(reference.structure_id)
            if entry is None or reference.atom_id not in set(entry.atom_ids):
                raise InvalidProjectOperationError(
                    "Saved selection contains an atom reference that is not in the current project"
                )
        state: dict[str, Any] = {
            "id": _uuid(),
            "name": normalized_name,
            "atom_references": [reference.model_dump(mode="json") for reference in current.atoms],
            "granularity": current.granularity,
            "warnings": [],
            "created_at": datetime.now(UTC).isoformat(),
        }
        return self._record(
            project,
            "selection.create",
            f"Save selection {normalized_name}",
            [{"kind": "selection.create", "selection": state}],
            [{"kind": "selection.delete", "selection_id": state["id"]}],
            sorted({reference.structure_id for reference in current.atoms}),
            selection_snapshot=deepcopy(state["atom_references"]),
        )

    def delete_saved_selection(
        self,
        project_id: str,
        selection_id: str,
        expected_revision: int,
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        saved_selection = self._saved_selection(project, selection_id)
        state = _saved_selection_state(saved_selection)
        return self._record(
            project,
            "selection.delete",
            f"Delete saved selection {saved_selection.name}",
            [{"kind": "selection.delete", "selection_id": saved_selection.id}],
            [{"kind": "selection.create", "selection": state}],
            sorted(
                {str(reference["structure_id"]) for reference in saved_selection.atom_references}
            ),
            selection_snapshot=deepcopy(saved_selection.atom_references),
        )

    def create_measurement(
        self,
        project_id: str,
        expected_revision: int,
        name: str,
        kind: MeasurementKind,
        atom_references: list[dict[str, Any]],
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        expected = {"distance": 2, "angle": 3, "dihedral": 4}[kind]
        if len(atom_references) != expected:
            raise InvalidProjectOperationError(f"{kind.title()} requires exactly {expected} atoms")
        self._validate_atom_references(project, atom_references)
        if (
            len(
                {(reference["structure_id"], reference["atom_id"]) for reference in atom_references}
            )
            != expected
        ):
            raise InvalidProjectOperationError("Measurement atoms must be distinct")
        state: dict[str, Any] = {
            "id": _uuid(),
            "name": name.strip(),
            "kind": kind,
            "atom_references": deepcopy(atom_references),
            "visible": True,
            "warnings": [],
            "created_at": datetime.now(UTC).isoformat(),
        }
        return self._record(
            project,
            "measurement.create",
            f"Create {kind} measurement {state['name']}",
            [{"kind": "measurement.create", "measurement": state}],
            [{"kind": "measurement.delete", "measurement_id": state["id"]}],
            sorted({str(item["structure_id"]) for item in atom_references}),
            selection_snapshot=deepcopy(atom_references),
        )

    def update_measurement(
        self,
        project_id: str,
        measurement_id: str,
        expected_revision: int,
        name: str,
        visible: bool,
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        measurement = self._measurement(project, measurement_id)
        values = {"name": name.strip(), "visible": visible}
        return self._record(
            project,
            "measurement.update",
            f"Update measurement {measurement.name}",
            [
                {
                    "kind": "measurement.update",
                    "measurement_id": measurement.id,
                    "values": values,
                }
            ],
            [
                {
                    "kind": "measurement.update",
                    "measurement_id": measurement.id,
                    "values": {
                        "name": measurement.name,
                        "visible": measurement.visible,
                    },
                }
            ],
            sorted({str(reference["structure_id"]) for reference in measurement.atom_references}),
        )

    def delete_measurement(
        self, project_id: str, measurement_id: str, expected_revision: int
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        measurement = self._measurement(project, measurement_id)
        state = _measurement_state(measurement)
        return self._record(
            project,
            "measurement.delete",
            f"Delete measurement {measurement.name}",
            [{"kind": "measurement.delete", "measurement_id": measurement.id}],
            [{"kind": "measurement.create", "measurement": state}],
            sorted({str(reference["structure_id"]) for reference in measurement.atom_references}),
        )

    def create_scene(
        self,
        project_id: str,
        expected_revision: int,
        name: str,
        camera: dict[str, Any],
        selection: SelectionV1,
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        normalized_name = name.strip()
        if any(scene.name.casefold() == normalized_name.casefold() for scene in project.scenes):
            raise InvalidProjectOperationError(f'A scene named "{normalized_name}" already exists')
        references = [item.model_dump(mode="json") for item in selection.atoms]
        self._validate_atom_references(project, references)
        state: dict[str, Any] = {
            "id": _uuid(),
            "name": normalized_name,
            "camera": deepcopy(camera),
            "entry_states": [
                {
                    "entry_id": entry.id,
                    "visible": entry.visible,
                    "viewer_settings": deepcopy(entry.viewer_settings),
                }
                for entry in sorted(project.entries, key=lambda item: item.id)
            ],
            "selection": selection.model_dump(mode="json"),
            "created_at": datetime.now(UTC).isoformat(),
        }
        return self._record(
            project,
            "scene.create",
            f"Save scene {normalized_name}",
            [{"kind": "scene.create", "scene": state}],
            [{"kind": "scene.delete", "scene_id": state["id"]}],
            [entry.id for entry in project.entries],
            selection_snapshot=references,
        )

    def apply_scene(self, project_id: str, scene_id: str, expected_revision: int) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        scene = self._scene(project, scene_id)
        before = [
            {
                "entry_id": entry.id,
                "visible": entry.visible,
                "viewer_settings": deepcopy(entry.viewer_settings),
            }
            for entry in project.entries
        ]
        return self._record(
            project,
            "scene.apply",
            f"Apply scene {scene.name}",
            [{"kind": "entries.viewer_state", "values": deepcopy(scene.entry_states)}],
            [{"kind": "entries.viewer_state", "values": before}],
            [entry.id for entry in project.entries],
            selection_snapshot=deepcopy(scene.selection.get("atoms", [])),
        )

    def delete_scene(self, project_id: str, scene_id: str, expected_revision: int) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        scene = self._scene(project, scene_id)
        state = _scene_state(scene)
        return self._record(
            project,
            "scene.delete",
            f"Delete scene {scene.name}",
            [{"kind": "scene.delete", "scene_id": scene.id}],
            [{"kind": "scene.create", "scene": state}],
            [entry.id for entry in project.entries],
        )

    def create_group(
        self,
        project_id: str,
        expected_revision: int,
        name: str,
        entry_ids: list[str],
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        entries = [self._entry(project, entry_id) for entry_id in entry_ids]
        group = {
            "id": _uuid(),
            "parent_id": None,
            "name": name.strip(),
            "created_at": datetime.now(UTC).isoformat(),
        }
        if not group["name"]:
            raise InvalidProjectOperationError("Group name must not be blank")
        previous_groups = {entry.id: entry.group_id for entry in entries}
        grouped = {entry.id: group["id"] for entry in entries}
        return self._record(
            project,
            "group.create",
            f"Group {len(entries)} entries as {group['name']}",
            [
                {"kind": "group.create", "group": group},
                {"kind": "entries.group", "values": grouped},
            ],
            [
                {"kind": "entries.group", "values": previous_groups},
                {"kind": "group.delete", "group_id": group["id"]},
            ],
            entry_ids,
        )

    def record_coordinate_change(
        self,
        project_id: str,
        expected_revision: int,
        command_type: str,
        description: str,
        changes: list[dict[str, Any]],
        selection_snapshot: list[dict[str, Any]],
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        if not changes:
            raise InvalidProjectOperationError("Coordinate command must affect at least one entry")
        forward: list[dict[str, Any]] = []
        inverse: list[dict[str, Any]] = []
        affected_entry_ids: list[str] = []
        response_patches: list[CoordinatePatch] = []
        for change in changes:
            entry = self._entry(project, str(change["entry_id"]))
            if entry.locked:
                raise InvalidProjectOperationError(
                    f"Unlock {entry.name} before changing coordinates"
                )
            affected_entry_ids.append(entry.id)
            after_patch = CoordinatePatch.model_validate(change["after_patch"])
            before_patch = CoordinatePatch.model_validate(change["before_patch"])
            forward.append(
                {
                    "kind": "entry.coordinates",
                    "entry_id": entry.id,
                    "artifact_id": str(change["after_artifact_id"]),
                    "patch": after_patch.model_dump(mode="json"),
                }
            )
            inverse.insert(
                0,
                {
                    "kind": "entry.coordinates",
                    "entry_id": entry.id,
                    "artifact_id": str(change["before_artifact_id"]),
                    "patch": before_patch.model_dump(mode="json"),
                },
            )
            response_patches.append(after_patch)
        return self._record(
            project,
            command_type,
            description,
            forward,
            inverse,
            affected_entry_ids,
            selection_snapshot=selection_snapshot,
            structure_patches=response_patches,
        )

    def record_molecular_change(
        self,
        project_id: str,
        expected_revision: int,
        command_type: str,
        description: str,
        change: dict[str, Any],
        deleted_atom_ids: list[int],
    ) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        entry = self._entry(project, str(change["entry_id"]))
        if entry.locked:
            raise InvalidProjectOperationError(f"Unlock {entry.name} before editing its molecule")
        forward: list[dict[str, Any]] = [
            {
                "kind": "entry.molecule",
                "entry_id": entry.id,
                "artifact_id": str(change["after_artifact_id"]),
                "values": deepcopy(change["after_values"]),
                "next_atom_id": int(change["next_atom_id"]),
                "next_bond_id": int(change["next_bond_id"]),
            }
        ]
        inverse: list[dict[str, Any]] = [
            {
                "kind": "entry.molecule",
                "entry_id": entry.id,
                "artifact_id": str(change["before_artifact_id"]),
                "values": deepcopy(change["before_values"]),
            }
        ]
        deleted = set(deleted_atom_ids)
        if deleted:
            self._append_atom_reference_reconciliation(
                project,
                entry,
                deleted,
                forward,
                inverse,
                operation=command_type,
            )
        return self._record(
            project,
            command_type,
            description,
            forward,
            inverse,
            [entry.id],
            selection_snapshot=[
                {"structure_id": entry.id, "atom_id": atom_id} for atom_id in sorted(deleted)
            ],
            topology_patches=[
                TopologyPatch(
                    entry_id=entry.id,
                    artifact_id=str(change["after_artifact_id"]),
                )
            ],
        )

    @staticmethod
    def _append_atom_reference_reconciliation(
        project: Project,
        entry: StructureEntry,
        deleted_atom_ids: set[int],
        forward: list[dict[str, Any]],
        inverse: list[dict[str, Any]],
        *,
        operation: str,
    ) -> None:
        for owner in project.entries:
            before_settings = deepcopy(owner.viewer_settings)
            after_settings = (
                prune_selection_representations(before_settings, deleted_atom_ids)
                if owner.id == entry.id
                else before_settings
            )
            after_settings = prune_pocket_seeds(after_settings, entry.id, deleted_atom_ids)
            if after_settings != before_settings:
                forward.append(
                    {
                        "kind": "entry.update",
                        "entry_id": owner.id,
                        "values": {"viewer_settings": after_settings},
                    }
                )
                inverse.append(
                    {
                        "kind": "entry.update",
                        "entry_id": owner.id,
                        "values": {"viewer_settings": before_settings},
                    }
                )
        for saved_selection in project.saved_selections:
            retained = [
                reference
                for reference in saved_selection.atom_references
                if not (
                    reference["structure_id"] == entry.id
                    and int(reference["atom_id"]) in deleted_atom_ids
                )
            ]
            removed = len(saved_selection.atom_references) - len(retained)
            if removed == 0:
                continue
            warning = {
                "code": "invalid_selection_references_removed",
                "message": (
                    f"{removed} atom reference{'s were' if removed != 1 else ' was'} "
                    f"removed after editing {entry.name}."
                ),
                "operation": operation,
                "severity": "warning",
                "field": "atom_references",
                "blocking": False,
            }
            forward.append(
                {
                    "kind": "selection.update",
                    "selection_id": saved_selection.id,
                    "values": {
                        "atom_references": retained,
                        "warnings": [*saved_selection.warnings, warning],
                    },
                }
            )
            inverse.append(
                {
                    "kind": "selection.update",
                    "selection_id": saved_selection.id,
                    "values": {
                        "atom_references": deepcopy(saved_selection.atom_references),
                        "warnings": deepcopy(saved_selection.warnings),
                    },
                }
            )
        for measurement in project.measurements:
            if not any(
                reference["structure_id"] == entry.id
                and int(reference["atom_id"]) in deleted_atom_ids
                for reference in measurement.atom_references
            ):
                continue
            forward.append({"kind": "measurement.delete", "measurement_id": measurement.id})
            inverse.append(
                {
                    "kind": "measurement.create",
                    "measurement": _measurement_state(measurement),
                }
            )
        for scene in project.scenes:
            atoms = scene.selection.get("atoms", [])
            retained = [
                reference
                for reference in atoms
                if not (
                    reference["structure_id"] == entry.id
                    and int(reference["atom_id"]) in deleted_atom_ids
                )
            ]
            entry_states = deepcopy(scene.entry_states)
            styles_changed = False
            for state in entry_states:
                before_scene_settings = state["viewer_settings"]
                after_scene_settings = (
                    prune_selection_representations(before_scene_settings, deleted_atom_ids)
                    if state["entry_id"] == entry.id
                    else before_scene_settings
                )
                after_scene_settings = prune_pocket_seeds(
                    after_scene_settings, entry.id, deleted_atom_ids
                )
                if after_scene_settings != before_scene_settings:
                    state["viewer_settings"] = after_scene_settings
                    styles_changed = True
            if len(retained) == len(atoms) and not styles_changed:
                continue
            values: dict[str, Any] = {}
            inverse_values: dict[str, Any] = {}
            if len(retained) != len(atoms):
                values["selection"] = {**scene.selection, "atoms": retained}
                inverse_values["selection"] = deepcopy(scene.selection)
            if styles_changed:
                values["entry_states"] = entry_states
                inverse_values["entry_states"] = deepcopy(scene.entry_states)
            forward.append(
                {
                    "kind": "scene.update",
                    "scene_id": scene.id,
                    "values": values,
                }
            )
            inverse.append(
                {
                    "kind": "scene.update",
                    "scene_id": scene.id,
                    "values": inverse_values,
                }
            )

    def undo(self, project_id: str, expected_revision: int) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        command = self.session.scalar(
            select(CommandRecord)
            .where(CommandRecord.project_id == project_id, CommandRecord.is_applied.is_(True))
            .order_by(CommandRecord.position.desc())
            .limit(1)
        )
        if command is None:
            raise HistoryUnavailableError("Nothing to undo")
        self._apply(project, command.inverse_actions)
        command.is_applied = False
        self._touch(project)
        self.session.commit()
        return project_read(
            self.session,
            project,
            structure_patches=self._coordinate_patches(command.inverse_actions),
            topology_patches=self._topology_patches(command.inverse_actions),
        )

    def redo(self, project_id: str, expected_revision: int) -> ProjectRead:
        project = self._project(project_id)
        self._check_revision(project, expected_revision)
        command = self.session.scalar(
            select(CommandRecord)
            .where(CommandRecord.project_id == project_id, CommandRecord.is_applied.is_(False))
            .order_by(CommandRecord.position.asc())
            .limit(1)
        )
        if command is None:
            raise HistoryUnavailableError("Nothing to redo")
        self._apply(project, command.forward_actions)
        command.is_applied = True
        self._touch(project)
        self.session.commit()
        return project_read(
            self.session,
            project,
            structure_patches=self._coordinate_patches(command.forward_actions),
            topology_patches=self._topology_patches(command.forward_actions),
        )

    def seed_entry(
        self, project_id: str, name: str, structure_type: str = "unknown"
    ) -> StructureEntry:
        """Create a test fixture entry without exposing a production import shortcut."""
        project = self._project(project_id)
        entry = StructureEntry(
            id=_uuid(),
            project_id=project.id,
            name=name,
            structure_type=structure_type,
            normalized_data={"schema_version": 1, "atoms": [], "bonds": []},
            viewer_settings=default_viewer_settings(structure_type),
        )
        self.session.add(entry)
        self.session.flush()
        project.checkpoint_state = _project_state(project)
        self.session.commit()
        return entry

    def _record(
        self,
        project: Project,
        command_type: str,
        description: str,
        forward: list[dict[str, Any]],
        inverse: list[dict[str, Any]],
        affected_entry_ids: list[str],
        *,
        selection_snapshot: list[dict[str, Any]] | None = None,
        structure_patches: list[CoordinatePatch] | None = None,
        topology_patches: list[TopologyPatch] | None = None,
    ) -> ProjectRead:
        self.session.execute(
            delete(CommandRecord).where(
                CommandRecord.project_id == project.id,
                CommandRecord.is_applied.is_(False),
            )
        )
        max_position = self.session.scalar(
            select(func.max(CommandRecord.position)).where(CommandRecord.project_id == project.id)
        )
        self._apply(project, forward)
        self.session.add(
            CommandRecord(
                id=_uuid(),
                project_id=project.id,
                position=(max_position or 0) + 1,
                command_type=command_type,
                description=description,
                forward_actions=forward,
                inverse_actions=inverse,
                affected_entry_ids=affected_entry_ids,
                selection_snapshot=selection_snapshot or [],
            )
        )
        self._touch(project)
        self.session.flush()
        self._trim_history(project.id)
        self.session.commit()
        return project_read(
            self.session,
            project,
            structure_patches=structure_patches,
            topology_patches=topology_patches,
        )

    def _apply(self, project: Project, actions: list[dict[str, Any]]) -> None:
        for action in actions:
            kind = action["kind"]
            if kind == "project.update":
                for key, value in action["values"].items():
                    setattr(project, key, value)
            elif kind == "entry.update":
                entry = self._entry(project, action["entry_id"])
                for key, value in action["values"].items():
                    setattr(entry, key, deepcopy(value))
                entry.modified_at = datetime.now(UTC)
            elif kind == "entry.coordinates":
                entry = self._entry(project, action["entry_id"])
                entry.current_artifact_id = action["artifact_id"]
                entry.modified_at = datetime.now(UTC)
            elif kind == "entry.molecule":
                entry = self._entry(project, action["entry_id"])
                entry.current_artifact_id = action["artifact_id"]
                for key, value in action["values"].items():
                    setattr(entry, key, deepcopy(value))
                if "next_atom_id" in action:
                    entry.next_atom_id = max(entry.next_atom_id, int(action["next_atom_id"]))
                if "next_bond_id" in action:
                    entry.next_bond_id = max(entry.next_bond_id, int(action["next_bond_id"]))
                entry.modified_at = datetime.now(UTC)
            elif kind == "entry.create":
                state = action["entry"]
                self.session.add(
                    StructureEntry(
                        id=state["id"],
                        project_id=project.id,
                        group_id=state["group_id"],
                        name=state["name"],
                        description=state["description"],
                        structure_type=state["structure_type"],
                        original_filename=state["original_filename"],
                        source_format=state["source_format"],
                        normalized_data=deepcopy(state["normalized_data"]),
                        atom_count=state.get("atom_count", 0),
                        atom_ids=deepcopy(
                            state.get(
                                "atom_ids",
                                list(range(1, state.get("atom_count", 0) + 1)),
                            )
                        ),
                        bond_count=state.get("bond_count", 0),
                        residue_count=state.get("residue_count", 0),
                        conformer_count=state.get("conformer_count", 0),
                        warnings=deepcopy(state.get("warnings", [])),
                        next_atom_id=state.get("next_atom_id", state.get("atom_count", 0) + 1),
                        next_bond_id=state.get("next_bond_id", state.get("bond_count", 0) + 1),
                        viewer_settings=deepcopy(
                            state.get(
                                "viewer_settings",
                                default_viewer_settings(state["structure_type"]),
                            )
                        ),
                        visible=state["visible"],
                        locked=state["locked"],
                        user_metadata=deepcopy(state["user_metadata"]),
                        job_links=deepcopy(state["job_links"]),
                        generated_results=deepcopy(state["generated_results"]),
                        original_artifact_id=state["original_artifact_id"],
                        current_artifact_id=state["current_artifact_id"],
                        created_at=datetime.fromisoformat(state["created_at"]),
                    )
                )
                self.session.flush()
            elif kind == "entry.delete":
                entry = self._entry(project, action["entry_id"])
                self.session.delete(entry)
                self.session.flush()
            elif kind == "entries.visibility":
                for entry_id, visible in action["values"].items():
                    self._entry(project, entry_id).visible = visible
            elif kind == "entries.viewer_state":
                for state in action["values"]:
                    try:
                        entry = self._entry(project, state["entry_id"])
                    except EntryNotFoundError:
                        continue
                    entry.visible = state["visible"]
                    entry.viewer_settings = deepcopy(state["viewer_settings"])
            elif kind == "entries.group":
                for entry_id, group_id in action["values"].items():
                    self._entry(project, entry_id).group_id = group_id
            elif kind == "group.create":
                state = action["group"]
                self.session.add(
                    EntryGroup(
                        id=state["id"],
                        project_id=project.id,
                        parent_id=state["parent_id"],
                        name=state["name"],
                        created_at=datetime.fromisoformat(state["created_at"]),
                    )
                )
                self.session.flush()
            elif kind == "group.delete":
                group = self.session.get(EntryGroup, action["group_id"])
                if group is not None:
                    self.session.delete(group)
                    self.session.flush()
            elif kind == "selection.create":
                state = action["selection"]
                self.session.add(
                    SavedSelection(
                        id=state["id"],
                        project_id=project.id,
                        name=state["name"],
                        atom_references=deepcopy(state["atom_references"]),
                        granularity=state["granularity"],
                        warnings=deepcopy(state["warnings"]),
                        created_at=datetime.fromisoformat(state["created_at"]),
                    )
                )
                self.session.flush()
            elif kind == "selection.update":
                saved_selection = self._saved_selection(project, action["selection_id"])
                for key, value in action["values"].items():
                    setattr(saved_selection, key, deepcopy(value))
                saved_selection.modified_at = datetime.now(UTC)
            elif kind == "selection.delete":
                saved_selection = self._saved_selection(project, action["selection_id"])
                self.session.delete(saved_selection)
                self.session.flush()
            elif kind == "measurement.create":
                state = action["measurement"]
                self.session.add(
                    Measurement(
                        id=state["id"],
                        project_id=project.id,
                        name=state["name"],
                        kind=state["kind"],
                        atom_references=deepcopy(state["atom_references"]),
                        visible=state["visible"],
                        warnings=deepcopy(state["warnings"]),
                        created_at=datetime.fromisoformat(state["created_at"]),
                    )
                )
                self.session.flush()
            elif kind == "measurement.update":
                measurement = self._measurement(project, action["measurement_id"])
                for key, value in action["values"].items():
                    setattr(measurement, key, deepcopy(value))
                measurement.modified_at = datetime.now(UTC)
            elif kind == "measurement.delete":
                measurement = self._measurement(project, action["measurement_id"])
                self.session.delete(measurement)
                self.session.flush()
            elif kind == "scene.create":
                state = action["scene"]
                self.session.add(
                    Scene(
                        id=state["id"],
                        project_id=project.id,
                        name=state["name"],
                        camera=deepcopy(state["camera"]),
                        entry_states=deepcopy(state["entry_states"]),
                        selection=deepcopy(state["selection"]),
                        created_at=datetime.fromisoformat(state["created_at"]),
                    )
                )
                self.session.flush()
            elif kind == "scene.update":
                scene = self._scene(project, action["scene_id"])
                for key, value in action["values"].items():
                    setattr(scene, key, deepcopy(value))
                scene.modified_at = datetime.now(UTC)
            elif kind == "scene.delete":
                scene = self._scene(project, action["scene_id"])
                self.session.delete(scene)
                self.session.flush()
            else:
                raise InvalidProjectOperationError(f"Unknown command action: {kind}")
        self.session.expire(
            project, ["entries", "groups", "saved_selections", "measurements", "scenes"]
        )

    def _trim_history(self, project_id: str) -> None:
        command_ids = self.session.scalars(
            select(CommandRecord.id)
            .where(CommandRecord.project_id == project_id)
            .order_by(CommandRecord.position.desc())
            .offset(HISTORY_LIMIT)
        ).all()
        if command_ids:
            self.session.execute(delete(CommandRecord).where(CommandRecord.id.in_(command_ids)))

    @staticmethod
    def _coordinate_patches(actions: list[dict[str, Any]]) -> list[CoordinatePatch]:
        return [
            CoordinatePatch.model_validate(action["patch"])
            for action in actions
            if action["kind"] == "entry.coordinates"
        ]

    @staticmethod
    def _topology_patches(actions: list[dict[str, Any]]) -> list[TopologyPatch]:
        return [
            TopologyPatch(
                entry_id=str(action["entry_id"]),
                artifact_id=str(action["artifact_id"]),
            )
            for action in actions
            if action["kind"] == "entry.molecule"
        ]

    def _project(self, project_id: str) -> Project:
        project = self.session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        return project

    @staticmethod
    def _entry(project: Project, entry_id: str) -> StructureEntry:
        for entry in project.entries:
            if entry.id == entry_id:
                return entry
        raise EntryNotFoundError(entry_id)

    @staticmethod
    def _saved_selection(project: Project, selection_id: str) -> SavedSelection:
        for saved_selection in project.saved_selections:
            if saved_selection.id == selection_id:
                return saved_selection
        raise InvalidProjectOperationError(f"Saved selection {selection_id} was not found")

    @staticmethod
    def _measurement(project: Project, measurement_id: str) -> Measurement:
        for measurement in project.measurements:
            if measurement.id == measurement_id:
                return measurement
        raise InvalidProjectOperationError(f"Measurement {measurement_id} was not found")

    @staticmethod
    def _scene(project: Project, scene_id: str) -> Scene:
        for scene in project.scenes:
            if scene.id == scene_id:
                return scene
        raise InvalidProjectOperationError(f"Scene {scene_id} was not found")

    @staticmethod
    def _validate_atom_references(project: Project, atom_references: list[dict[str, Any]]) -> None:
        entries = {entry.id: entry for entry in project.entries}
        atom_ids_by_entry: dict[str, set[int]] = {}
        for reference in atom_references:
            entry_id = str(reference["structure_id"])
            entry = entries.get(entry_id)
            if entry is None:
                raise InvalidProjectOperationError("Atom reference is not in the current project")
            if entry_id not in atom_ids_by_entry:
                atom_ids_by_entry[entry_id] = set(entry.atom_ids)
            if int(reference["atom_id"]) not in atom_ids_by_entry[entry_id]:
                raise InvalidProjectOperationError("Atom reference is not in the current project")

    @staticmethod
    def _check_revision(project: Project, expected_revision: int) -> None:
        if project.revision != expected_revision:
            raise RevisionConflictError(project.revision)

    @staticmethod
    def _touch(project: Project) -> None:
        project.revision += 1
        project.modified_at = datetime.now(UTC)
        for entry in project.entries:
            entry.dirty = True

    @staticmethod
    def _copy_name(project: Project, name: str) -> str:
        existing = {entry.name for entry in project.entries}
        candidate = f"{name} copy"
        suffix = 2
        while candidate in existing:
            candidate = f"{name} copy {suffix}"
            suffix += 1
        return candidate
