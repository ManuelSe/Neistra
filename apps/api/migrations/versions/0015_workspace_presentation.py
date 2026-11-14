"""Add an installation-local camera preference independent of project history.

Revision ID: 0015
Revises: 0014
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workspace_presentations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("camera", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_workspace_presentation_singleton"),
        sa.CheckConstraint("schema_version = 1", name="ck_workspace_presentation_schema"),
        sa.CheckConstraint("revision >= 1", name="ck_workspace_presentation_revision"),
    )


def downgrade() -> None:
    # The preference is deliberately absent from project/archive snapshots.
    op.drop_table("workspace_presentations")
