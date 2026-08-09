"""Add durable selection representation assignments to viewer settings.

Revision ID: 0008
Revises: 0007
"""

from collections.abc import Sequence
from copy import deepcopy
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

projects = sa.table(
    "projects",
    sa.column("id", sa.String(length=36)),
    sa.column("checkpoint_state", sa.JSON()),
)
entries = sa.table(
    "structure_entries",
    sa.column("id", sa.String(length=36)),
    sa.column("viewer_settings", sa.JSON()),
)
scenes = sa.table(
    "scenes",
    sa.column("id", sa.String(length=36)),
    sa.column("entry_states", sa.JSON()),
)


def _with_default(settings: dict[str, Any]) -> dict[str, Any]:
    updated = deepcopy(settings)
    updated.setdefault("selection_representations", [])
    return updated


def _without_default(settings: dict[str, Any]) -> dict[str, Any]:
    updated = deepcopy(settings)
    updated.pop("selection_representations", None)
    return updated


def _has_assignments(settings: dict[str, Any]) -> bool:
    return bool(settings.get("selection_representations", []))


def _assert_downgrade_safe() -> None:
    connection = op.get_bind()
    for _, settings in connection.execute(sa.select(entries.c.id, entries.c.viewer_settings)):
        if _has_assignments(dict(settings or {})):
            raise RuntimeError(
                "Cannot downgrade: reset all selection representations before reverting 0008"
            )
    for _, checkpoint in connection.execute(sa.select(projects.c.id, projects.c.checkpoint_state)):
        if any(
            _has_assignments(dict(entry.get("viewer_settings", {})))
            for entry in dict(checkpoint or {}).get("entries", [])
        ):
            raise RuntimeError(
                "Cannot downgrade: saved checkpoints contain selection representations"
            )
    for _, entry_states in connection.execute(sa.select(scenes.c.id, scenes.c.entry_states)):
        if any(
            _has_assignments(dict(state.get("viewer_settings", {})))
            for state in list(entry_states or [])
        ):
            raise RuntimeError("Cannot downgrade: named scenes contain selection representations")


def upgrade() -> None:
    connection = op.get_bind()
    for entry_id, settings in connection.execute(
        sa.select(entries.c.id, entries.c.viewer_settings)
    ):
        connection.execute(
            entries.update()
            .where(entries.c.id == entry_id)
            .values(viewer_settings=_with_default(dict(settings or {})))
        )
    for project_id, checkpoint in connection.execute(
        sa.select(projects.c.id, projects.c.checkpoint_state)
    ):
        state = deepcopy(dict(checkpoint or {}))
        for entry in state.get("entries", []):
            entry["viewer_settings"] = _with_default(dict(entry.get("viewer_settings", {})))
        connection.execute(
            projects.update().where(projects.c.id == project_id).values(checkpoint_state=state)
        )
    for scene_id, entry_states in connection.execute(sa.select(scenes.c.id, scenes.c.entry_states)):
        states = deepcopy(list(entry_states or []))
        for state in states:
            state["viewer_settings"] = _with_default(dict(state.get("viewer_settings", {})))
        connection.execute(
            scenes.update().where(scenes.c.id == scene_id).values(entry_states=states)
        )


def downgrade() -> None:
    _assert_downgrade_safe()
    connection = op.get_bind()
    for entry_id, settings in connection.execute(
        sa.select(entries.c.id, entries.c.viewer_settings)
    ):
        connection.execute(
            entries.update()
            .where(entries.c.id == entry_id)
            .values(viewer_settings=_without_default(dict(settings or {})))
        )
    for project_id, checkpoint in connection.execute(
        sa.select(projects.c.id, projects.c.checkpoint_state)
    ):
        state = deepcopy(dict(checkpoint or {}))
        for entry in state.get("entries", []):
            entry["viewer_settings"] = _without_default(dict(entry.get("viewer_settings", {})))
        connection.execute(
            projects.update().where(projects.c.id == project_id).values(checkpoint_state=state)
        )
    for scene_id, entry_states in connection.execute(sa.select(scenes.c.id, scenes.c.entry_states)):
        states = deepcopy(list(entry_states or []))
        for state in states:
            state["viewer_settings"] = _without_default(dict(state.get("viewer_settings", {})))
        connection.execute(
            scenes.update().where(scenes.c.id == scene_id).values(entry_states=states)
        )
