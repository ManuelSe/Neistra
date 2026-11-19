"""Add installation property preferences and privately owned derived execution.

Revision ID: 0017
Revises: 0016
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "jobs", sa.Column("purpose", sa.String(24), nullable=False, server_default="user")
    )
    op.create_table(
        "ligand_property_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("enabled_categories", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1"),
        sa.CheckConstraint("revision >= 1"),
    )
    op.create_table(
        "ligand_property_content",
        sa.Column("input_hash", sa.String(64), primary_key=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("relative_path", sa.String(128), nullable=False),
        sa.Column("coverage", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "ligand_property_proofs",
        sa.Column("fingerprint", sa.String(64), primary_key=True),
        sa.Column(
            "input_hash",
            sa.String(64),
            sa.ForeignKey("ligand_property_content.input_hash", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_ligand_property_proofs_input_hash", "ligand_property_proofs", ["input_hash"]
    )
    op.create_table(
        "ligand_property_bindings",
        sa.Column(
            "entry_id",
            sa.String(36),
            sa.ForeignKey("structure_entries.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("incarnation", sa.String(36), nullable=False),
        sa.Column("source_key", sa.String(64), nullable=False),
        sa.Column(
            "input_hash",
            sa.String(64),
            sa.ForeignKey("ligand_property_content.input_hash", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_ligand_property_bindings_source_key", "ligand_property_bindings", ["source_key"]
    )
    op.create_table(
        "ligand_property_consumers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("project_documents_v3.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("entries_json", sa.JSON(), nullable=False),
        sa.Column("descriptor_ids", sa.JSON(), nullable=False),
        sa.Column("active_entry_id", sa.String(36), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released", sa.Boolean(), nullable=False),
        sa.Column("failures", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_ligand_property_consumers_project_id", "ligand_property_consumers", ["project_id"]
    )
    op.create_index(
        "ix_ligand_property_consumers_expires_at", "ligand_property_consumers", ["expires_at"]
    )
    op.create_table(
        "ligand_property_executions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "job_id",
            sa.String(36),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "project_id",
            sa.String(36),
            nullable=False,
        ),
        sa.Column("captures", sa.JSON(), nullable=False),
        sa.Column("reaped", sa.Boolean(), nullable=False),
        sa.Column("child_pid", sa.Integer(), nullable=True),
        sa.Column("child_start_token", sa.String(32), nullable=True),
        sa.Column("group_confirmed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_ligand_property_executions_project_id", "ligand_property_executions", ["project_id"]
    )


def downgrade() -> None:
    connection = op.get_bind()
    preferences = sa.table(
        "ligand_property_preferences", sa.column("enabled_categories", sa.JSON())
    )
    for categories in connection.execute(sa.select(preferences.c.enabled_categories)).scalars():
        if categories != ["composition", "polarity", "lipophilicity", "flexibility"]:
            raise ValueError("Restore default ligand property preferences before downgrade")
    if connection.execute(
        sa.text("SELECT 1 FROM ligand_property_executions WHERE reaped = 0 LIMIT 1")
    ).first():
        raise ValueError("Stop and reap derived ligand property work before downgrade")
    # Positive private association, not a plugin or parameter marker, grants cleanup.
    jobs = sa.table(
        "jobs",
        sa.column("id", sa.String()),
        sa.column("purpose", sa.String()),
        sa.column("job_type", sa.String()),
        sa.column("parameters", sa.JSON()),
    )
    executions = sa.table(
        "ligand_property_executions", sa.column("id", sa.String()), sa.column("job_id", sa.String())
    )
    rows = connection.execute(
        sa.select(jobs.c.id, jobs.c.parameters, executions.c.id.label("execution_id"))
        .join(executions, executions.c.job_id == jobs.c.id)
        .where(jobs.c.purpose == "ligand_properties", jobs.c.job_type == "ligand.properties")
    )
    for row in rows.mappings().all():
        if row["parameters"] == {"execution_id": row["execution_id"]}:
            connection.execute(sa.delete(jobs).where(jobs.c.id == row["id"]))
    for table in (
        "ligand_property_executions",
        "ligand_property_consumers",
        "ligand_property_bindings",
        "ligand_property_proofs",
        "ligand_property_content",
        "ligand_property_preferences",
    ):
        op.drop_table(table)
    op.drop_column("jobs", "purpose")
