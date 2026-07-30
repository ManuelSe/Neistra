"""Version existing project checkpoint snapshots.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

projects = sa.table(
    "projects",
    sa.column("id", sa.String(length=36)),
    sa.column("checkpoint_state", sa.JSON()),
)


def _states() -> list[tuple[str, dict[str, Any]]]:
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(projects.c.id, projects.c.checkpoint_state)
    ).all()
    return [(project_id, dict(state)) for project_id, state in rows]


def upgrade() -> None:
    connection = op.get_bind()
    for project_id, state in _states():
        state["schema_version"] = 1
        connection.execute(
            projects.update()
            .where(projects.c.id == project_id)
            .values(checkpoint_state=state)
        )


def downgrade() -> None:
    connection = op.get_bind()
    for project_id, state in _states():
        state.pop("schema_version", None)
        connection.execute(
            projects.update()
            .where(projects.c.id == project_id)
            .values(checkpoint_state=state)
        )
