"""Migrate every retained viewer snapshot to identified surface objects.

Revision ID: 0014
Revises: 0013
"""

from collections.abc import Iterator
from copy import deepcopy
from typing import Any

import sqlalchemy as sa
from alembic import op
from molweave_api.schemas import ViewerSettings
from molweave_api.surface_upgrade import upgrade_surface_settings

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

TABLE_FIELDS = {
    "structure_entries": ("viewer_settings",),
    "projects": ("checkpoint_state",),
    "scenes": ("entry_states",),
    "command_records": ("forward_actions", "inverse_actions"),
}


def _entries(entries: list[dict[str, Any]]) -> Iterator[tuple[str, dict[str, Any]]]:
    for entry in entries:
        if "viewer_settings" in entry:
            yield str(entry.get("entry_id", entry.get("id", ""))), entry["viewer_settings"]


def _locations(table: str, row_id: str, value: Any) -> Iterator[tuple[str, dict[str, Any]]]:
    if table == "structure_entries":
        yield row_id, value
    elif table == "projects":
        yield from _entries(value.get("entries", []))
        for scene in value.get("scenes", []):
            yield from _entries(scene.get("entry_states", []))
    elif table == "scenes":
        yield from _entries(value)
    elif table == "command_records":
        for action in value:
            kind = action.get("kind")
            if kind == "entry.create":
                yield from _entries([action["entry"]])
            elif kind in {"entry.update", "entry.molecule"}:
                values = action["values"]
                if "viewer_settings" in values:
                    yield str(action.get("entry_id", "")), values["viewer_settings"]
            elif kind == "entries.viewer_state":
                yield from _entries(action["values"])
            elif kind == "scene.create":
                yield from _entries(action["scene"].get("entry_states", []))
            elif kind == "scene.update":
                yield from _entries(action["values"].get("entry_states", []))


def _migrate(*, downgrade: bool) -> None:
    connection = op.get_bind()
    changes: list[tuple[Any, str, dict[str, Any]]] = []
    for name, fields in TABLE_FIELDS.items():
        table = sa.table(
            name, sa.column("id", sa.String()), *(sa.column(field, sa.JSON()) for field in fields)
        )
        for row in connection.execute(sa.select(table)).mappings():
            values = {}
            for field in fields:
                value = deepcopy(row[field])
                if value is None:
                    continue
                for entry_id, settings in _locations(name, str(row["id"]), value):
                    if downgrade:
                        if settings.get("surface_objects") or not settings.get("representations"):
                            raise RuntimeError(
                                f"Cannot downgrade 0014: {name}.{field} retains surface objects "
                                "or an empty representation set; restore the pre-upgrade backup"
                            )
                        ViewerSettings.model_validate(settings)
                        settings.pop("schema_version", None)
                        settings.pop("surface_objects", None)
                        settings["selection_surface"] = None
                        settings["selection_pocket_surface"] = None
                    else:
                        converted = upgrade_surface_settings(settings, entry_id)
                        if converted["surface_objects"] and not entry_id:
                            raise RuntimeError(
                                "Cannot migrate surface state without its owner entry ID"
                            )
                        ViewerSettings.model_validate(converted)
                        settings.clear()
                        settings.update(converted)
                if name == "projects":
                    value["schema_version"] = 1 if downgrade else 2
                values[field] = value
            changes.append((table, row["id"], values))
    # Prevalidate the whole database before changing any row, including downgrade refusals.
    for table, row_id, values in changes:
        connection.execute(table.update().where(table.c.id == row_id).values(**values))


def upgrade() -> None:
    _migrate(downgrade=False)


def downgrade() -> None:
    _migrate(downgrade=True)
