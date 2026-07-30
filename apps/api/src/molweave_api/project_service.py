from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from uuid6 import uuid7

from molweave_api.models import CommandRecord, EntryGroup, Project, StructureEntry
from molweave_api.schemas import (
    EntryRead,
    GroupRead,
    HistoryRead,
    ProjectListItem,
    ProjectRead,
)

HISTORY_LIMIT = 200


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


def _project_state(project: Project) -> dict[str, Any]:
    return {
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
    }


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


def project_read(session: Session, project: Project) -> ProjectRead:
    session.refresh(project, attribute_names=["entries", "groups"])
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
        history=_history(session, project.id),
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
        return self._record(
            project,
            "entry.delete",
            f"Delete {entry.name}",
            [{"kind": "entry.delete", "entry_id": entry.id}],
            [{"kind": "entry.create", "entry": snapshot}],
            [entry.id],
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
        return project_read(self.session, project)

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
        return project_read(self.session, project)

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
                selection_snapshot=[],
            )
        )
        self._touch(project)
        self.session.flush()
        self._trim_history(project.id)
        self.session.commit()
        return project_read(self.session, project)

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
            else:
                raise InvalidProjectOperationError(f"Unknown command action: {kind}")
        self.session.expire(project, ["entries", "groups"])

    def _trim_history(self, project_id: str) -> None:
        command_ids = self.session.scalars(
            select(CommandRecord.id)
            .where(CommandRecord.project_id == project_id)
            .order_by(CommandRecord.position.desc())
            .offset(HISTORY_LIMIT)
        ).all()
        if command_ids:
            self.session.execute(delete(CommandRecord).where(CommandRecord.id.in_(command_ids)))

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
