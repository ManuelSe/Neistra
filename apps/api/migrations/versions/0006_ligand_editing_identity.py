"""Add exact atom identity summaries and monotonic edit allocators.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
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
    sa.column("atom_count", sa.Integer()),
    sa.column("bond_count", sa.Integer()),
    sa.column("atom_ids", sa.JSON()),
    sa.column("next_atom_id", sa.Integer()),
    sa.column("next_bond_id", sa.Integer()),
)


def _update_snapshots(*, remove: bool) -> None:
    connection = op.get_bind()
    for project_id, raw_state in connection.execute(
        sa.select(projects.c.id, projects.c.checkpoint_state)
    ).all():
        state: dict[str, Any] = dict(raw_state)
        for entry in state.get("entries", []):
            if remove:
                entry.pop("atom_ids", None)
                entry.pop("next_atom_id", None)
                entry.pop("next_bond_id", None)
            else:
                atom_count = int(entry.get("atom_count", 0))
                bond_count = int(entry.get("bond_count", 0))
                entry.setdefault("atom_ids", list(range(1, atom_count + 1)))
                entry.setdefault("next_atom_id", atom_count + 1)
                entry.setdefault("next_bond_id", bond_count + 1)
        connection.execute(
            projects.update()
            .where(projects.c.id == project_id)
            .values(checkpoint_state=state)
        )


def upgrade() -> None:
    with op.batch_alter_table("structure_entries") as batch:
        batch.add_column(sa.Column("atom_ids", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("next_atom_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("next_bond_id", sa.Integer(), nullable=True))
    connection = op.get_bind()
    for entry_id, atom_count, bond_count in connection.execute(
        sa.select(entries.c.id, entries.c.atom_count, entries.c.bond_count)
    ).all():
        connection.execute(
            entries.update()
            .where(entries.c.id == entry_id)
            .values(
                atom_ids=list(range(1, int(atom_count) + 1)),
                next_atom_id=int(atom_count) + 1,
                next_bond_id=int(bond_count) + 1,
            )
        )
    with op.batch_alter_table("structure_entries") as batch:
        batch.alter_column("atom_ids", nullable=False)
        batch.alter_column("next_atom_id", nullable=False)
        batch.alter_column("next_bond_id", nullable=False)
    _update_snapshots(remove=False)


def downgrade() -> None:
    _update_snapshots(remove=True)
    with op.batch_alter_table("structure_entries") as batch:
        batch.drop_column("next_bond_id")
        batch.drop_column("next_atom_id")
        batch.drop_column("atom_ids")
