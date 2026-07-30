"""Add durable named atom selections.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

projects = sa.table(
    "projects",
    sa.column("id", sa.String(length=36)),
    sa.column("checkpoint_state", sa.JSON()),
)


def _update_snapshots(*, remove: bool) -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(projects.c.id, projects.c.checkpoint_state)
    ).all()
    for project_id, raw_state in rows:
        state: dict[str, Any] = dict(raw_state)
        if remove:
            state.pop("saved_selections", None)
        else:
            state.setdefault("saved_selections", [])
        connection.execute(
            projects.update()
            .where(projects.c.id == project_id)
            .values(checkpoint_state=state)
        )


def upgrade() -> None:
    op.create_table(
        "saved_selections",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(length=36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("atom_references", sa.JSON(), nullable=False),
        sa.Column("granularity", sa.String(length=16), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("modified_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "name"),
    )
    _update_snapshots(remove=False)


def downgrade() -> None:
    _update_snapshots(remove=True)
    op.drop_table("saved_selections")
