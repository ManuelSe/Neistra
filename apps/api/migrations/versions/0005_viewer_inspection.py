"""Add viewer settings, measurements, and named scenes.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from molweave_api.viewer_state import default_viewer_settings

revision: str = "0005"
down_revision: str | None = "0004"
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
    sa.column("structure_type", sa.String(length=24)),
    sa.column("viewer_settings", sa.JSON()),
)


def _update_snapshots(*, remove: bool) -> None:
    connection = op.get_bind()
    for project_id, raw_state in connection.execute(
        sa.select(projects.c.id, projects.c.checkpoint_state)
    ).all():
        state: dict[str, Any] = dict(raw_state)
        if remove:
            state.pop("measurements", None)
            state.pop("scenes", None)
            for entry in state.get("entries", []):
                entry.pop("viewer_settings", None)
        else:
            state.setdefault("measurements", [])
            state.setdefault("scenes", [])
            for entry in state.get("entries", []):
                entry.setdefault(
                    "viewer_settings",
                    default_viewer_settings(str(entry.get("structure_type", "unknown"))),
                )
        connection.execute(
            projects.update().where(projects.c.id == project_id).values(checkpoint_state=state)
        )


def upgrade() -> None:
    with op.batch_alter_table("structure_entries") as batch:
        batch.add_column(sa.Column("viewer_settings", sa.JSON(), nullable=True))
    connection = op.get_bind()
    for entry_id, structure_type in connection.execute(
        sa.select(entries.c.id, entries.c.structure_type)
    ).all():
        connection.execute(
            entries.update()
            .where(entries.c.id == entry_id)
            .values(viewer_settings=default_viewer_settings(str(structure_type)))
        )
    with op.batch_alter_table("structure_entries") as batch:
        batch.alter_column("viewer_settings", nullable=False)

    op.create_table(
        "measurements",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(length=36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("atom_references", sa.JSON(), nullable=False),
        sa.Column("visible", sa.Boolean(), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("modified_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "scenes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(length=36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("camera", sa.JSON(), nullable=False),
        sa.Column("entry_states", sa.JSON(), nullable=False),
        sa.Column("selection", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("modified_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "name"),
    )
    _update_snapshots(remove=False)


def downgrade() -> None:
    _update_snapshots(remove=True)
    op.drop_table("scenes")
    op.drop_table("measurements")
    with op.batch_alter_table("structure_entries") as batch:
        batch.drop_column("viewer_settings")
