"""Add pocket surface defaults without losing retained history.

Revision ID: 0013
Revises: 0012
"""

from collections.abc import Iterator
from copy import deepcopy
from typing import Any

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

FIELDS = ("selection_pocket_surface",)
TABLE_FIELDS = {
    "structure_entries": ("viewer_settings",),
    "projects": ("checkpoint_state",),
    "scenes": ("entry_states",),
    "command_records": ("forward_actions", "inverse_actions"),
}


def _entry_settings(entries: list[dict[str, Any]]) -> Iterator[dict[str, Any]]:
    for entry in entries:
        if "viewer_settings" in entry:
            yield entry["viewer_settings"]


def _settings(table: str, field: str, value: Any) -> Iterator[dict[str, Any]]:
    """Traverse only documented state paths, never user metadata or job parameters."""
    if table == "structure_entries":
        yield value
    elif table == "projects":
        yield from _entry_settings(value.get("entries", []))
        for scene in value.get("scenes", []):
            yield from _entry_settings(scene.get("entry_states", []))
    elif table == "scenes":
        yield from _entry_settings(value)
    elif table == "command_records":
        for action in value:
            kind = action.get("kind")
            if kind == "entry.create":
                yield from _entry_settings([action["entry"]])
            elif kind in {"entry.update", "entry.molecule"}:
                yield from _entry_settings([action["values"]])
            elif kind == "entries.viewer_state":
                yield from _entry_settings(action["values"])
            elif kind == "scene.create":
                yield from _entry_settings(action["scene"].get("entry_states", []))
            elif kind == "scene.update":
                yield from _entry_settings(action["values"].get("entry_states", []))


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
                for settings in _settings(name, field, value):
                    for key in FIELDS:
                        if downgrade:
                            if settings.get(key) is not None:
                                raise RuntimeError(
                                    f"Cannot downgrade 0013: {name}.{field} "
                                    "retains pocket surface state"
                                )
                            settings.pop(key, None)
                        else:
                            settings.setdefault(key, None)
                values[field] = value
            changes.append((table, row["id"], values))
    # Validate every location before writing so a refusal leaves all state intact.
    for table, row_id, values in changes:
        connection.execute(table.update().where(table.c.id == row_id).values(**values))


def upgrade() -> None:
    _migrate(downgrade=False)


def downgrade() -> None:
    _migrate(downgrade=True)
