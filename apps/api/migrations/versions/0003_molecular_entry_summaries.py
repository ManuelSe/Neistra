"""Add artifact-backed molecular entry summaries.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

projects = sa.table(
    "projects",
    sa.column("id", sa.String(length=36)),
    sa.column("checkpoint_state", sa.JSON()),
)


def _states() -> list[tuple[str, dict[str, Any]]]:
    rows = op.get_bind().execute(
        sa.select(projects.c.id, projects.c.checkpoint_state)
    ).all()
    return [(project_id, dict(state)) for project_id, state in rows]


def _update_snapshots(*, remove: bool) -> None:
    connection = op.get_bind()
    fields: dict[str, Any] = {
        "atom_count": 0,
        "bond_count": 0,
        "residue_count": 0,
        "conformer_count": 0,
        "warnings": [],
    }
    for project_id, state in _states():
        entries = state.get("entries", [])
        for entry in entries:
            if remove:
                for field in fields:
                    entry.pop(field, None)
            else:
                for field, default in fields.items():
                    entry.setdefault(field, default)
        connection.execute(
            projects.update()
            .where(projects.c.id == project_id)
            .values(checkpoint_state=state)
        )


def upgrade() -> None:
    op.add_column(
        "structure_entries",
        sa.Column("atom_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "structure_entries",
        sa.Column("bond_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "structure_entries",
        sa.Column("residue_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "structure_entries",
        sa.Column("conformer_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "structure_entries",
        sa.Column("warnings", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    _update_snapshots(remove=False)


def downgrade() -> None:
    _update_snapshots(remove=True)
    op.drop_column("structure_entries", "warnings")
    op.drop_column("structure_entries", "conformer_count")
    op.drop_column("structure_entries", "residue_count")
    op.drop_column("structure_entries", "bond_count")
    op.drop_column("structure_entries", "atom_count")
