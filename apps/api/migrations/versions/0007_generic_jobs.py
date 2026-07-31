"""Add durable generic job lifecycle tables.

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(length=36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plugin_name", sa.String(length=120), nullable=False),
        sa.Column("job_type", sa.String(length=120), nullable=False),
        sa.Column("implementation_version", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("status_message", sa.String(length=500), nullable=False),
        sa.Column("result_values", sa.JSON(), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("error", sa.JSON(), nullable=True),
        sa.Column("provenance", sa.JSON(), nullable=False),
        sa.Column("cancellation_requested", sa.Boolean(), nullable=False),
        sa.Column("event_sequence", sa.Integer(), nullable=False),
        sa.Column("worker_id", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("modified_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_jobs_status", "jobs", ["status"])
    op.create_table(
        "job_inputs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "job_id",
            sa.String(length=36),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.Column("entry_id", sa.String(length=36), nullable=False),
        sa.Column("entry_name", sa.String(length=160), nullable=False),
        sa.Column("structure_type", sa.String(length=24), nullable=False),
        sa.Column(
            "artifact_id",
            sa.String(length=36),
            sa.ForeignKey("artifacts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("artifact_sha256", sa.String(length=64), nullable=False),
        sa.Column("artifact_size", sa.Integer(), nullable=False),
        sa.Column("media_type", sa.String(length=120), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.UniqueConstraint("job_id", "ordinal"),
    )
    op.create_table(
        "job_result_artifacts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "job_id",
            sa.String(length=36),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "artifact_id",
            sa.String(length=36),
            sa.ForeignKey("artifacts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("media_type", sa.String(length=120), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("importable_structure", sa.Boolean(), nullable=False),
        sa.Column("imported_entry_ids", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "job_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "job_id",
            sa.String(length=36),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("stream", sa.String(length=16), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("job_id", "sequence"),
    )


def downgrade() -> None:
    op.drop_table("job_events")
    op.drop_table("job_result_artifacts")
    op.drop_table("job_inputs")
    op.drop_index("ix_jobs_status", table_name="jobs")
    op.drop_table("jobs")
