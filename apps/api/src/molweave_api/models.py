from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from molweave_api.database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    checkpoint_revision: Mapped[int] = mapped_column(Integer, default=0)
    checkpoint_state: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    entries: Mapped[list[StructureEntry]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    groups: Mapped[list[EntryGroup]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    commands: Mapped[list[CommandRecord]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    saved_selections: Mapped[list[SavedSelection]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    measurements: Mapped[list[Measurement]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    scenes: Mapped[list[Scene]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    jobs: Mapped[list[Job]] = relationship(back_populates="project", cascade="all, delete-orphan")


class EntryGroup(Base):
    __tablename__ = "entry_groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("entry_groups.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project: Mapped[Project] = relationship(back_populates="groups")


class StructureEntry(Base):
    __tablename__ = "structure_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    group_id: Mapped[str | None] = mapped_column(
        ForeignKey("entry_groups.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    structure_type: Mapped[str] = mapped_column(String(24), default="unknown")
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_format: Mapped[str | None] = mapped_column(String(32), nullable=True)
    normalized_data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    atom_count: Mapped[int] = mapped_column(Integer, default=0)
    atom_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    bond_count: Mapped[int] = mapped_column(Integer, default=0)
    residue_count: Mapped[int] = mapped_column(Integer, default=0)
    conformer_count: Mapped[int] = mapped_column(Integer, default=0)
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    next_atom_id: Mapped[int] = mapped_column(Integer, default=1)
    next_bond_id: Mapped[int] = mapped_column(Integer, default=1)
    viewer_settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    user_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    dirty: Mapped[bool] = mapped_column(Boolean, default=False)
    job_links: Mapped[list[str]] = mapped_column(JSON, default=list)
    generated_results: Mapped[list[str]] = mapped_column(JSON, default=list)
    original_artifact_id: Mapped[str | None] = mapped_column(
        ForeignKey("artifacts.id", ondelete="RESTRICT"), nullable=True
    )
    current_artifact_id: Mapped[str | None] = mapped_column(
        ForeignKey("artifacts.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project: Mapped[Project] = relationship(back_populates="entries")


class CommandRecord(Base):
    __tablename__ = "command_records"
    __table_args__ = (UniqueConstraint("project_id", "position"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    command_type: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(240))
    forward_actions: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    inverse_actions: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    affected_entry_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    selection_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    is_applied: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    project: Mapped[Project] = relationship(back_populates="commands")


class SavedSelection(Base):
    __tablename__ = "saved_selections"
    __table_args__ = (UniqueConstraint("project_id", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    atom_references: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    granularity: Mapped[str] = mapped_column(String(16), default="atom")
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project: Mapped[Project] = relationship(back_populates="saved_selections")


class Measurement(Base):
    __tablename__ = "measurements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(16))
    atom_references: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project: Mapped[Project] = relationship(back_populates="measurements")


class Scene(Base):
    __tablename__ = "scenes"
    __table_args__ = (UniqueConstraint("project_id", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    camera: Mapped[dict[str, Any]] = mapped_column(JSON)
    entry_states: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    selection: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project: Mapped[Project] = relationship(back_populates="scenes")


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    size: Mapped[int] = mapped_column(Integer)
    media_type: Mapped[str] = mapped_column(String(120))
    filename: Mapped[str] = mapped_column(String(255))
    relative_path: Mapped[str] = mapped_column(String(512), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    plugin_name: Mapped[str] = mapped_column(String(120))
    job_type: Mapped[str] = mapped_column(String(120))
    implementation_version: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSON)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    status_message: Mapped[str] = mapped_column(String(500), default="Queued")
    result_values: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    error: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON)
    cancellation_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    event_sequence: Mapped[int] = mapped_column(Integer, default=0)
    worker_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    modified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project: Mapped[Project] = relationship(back_populates="jobs")
    inputs: Mapped[list[JobInput]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )
    results: Mapped[list[JobResultArtifact]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )
    events: Mapped[list[JobEvent]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class JobInput(Base):
    __tablename__ = "job_inputs"
    __table_args__ = (UniqueConstraint("job_id", "ordinal"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    ordinal: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(64))
    entry_id: Mapped[str] = mapped_column(String(36))
    entry_name: Mapped[str] = mapped_column(String(160))
    structure_type: Mapped[str] = mapped_column(String(24))
    artifact_id: Mapped[str] = mapped_column(ForeignKey("artifacts.id", ondelete="RESTRICT"))
    artifact_sha256: Mapped[str] = mapped_column(String(64))
    artifact_size: Mapped[int] = mapped_column(Integer)
    media_type: Mapped[str] = mapped_column(String(120))
    filename: Mapped[str] = mapped_column(String(255))

    job: Mapped[Job] = relationship(back_populates="inputs")


class JobResultArtifact(Base):
    __tablename__ = "job_result_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    artifact_id: Mapped[str] = mapped_column(ForeignKey("artifacts.id", ondelete="RESTRICT"))
    role: Mapped[str] = mapped_column(String(64))
    filename: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(120))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    importable_structure: Mapped[bool] = mapped_column(Boolean, default=False)
    imported_entry_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    job: Mapped[Job] = relationship(back_populates="results")


class JobEvent(Base):
    __tablename__ = "job_events"
    __table_args__ = (UniqueConstraint("job_id", "sequence"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    sequence: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(32))
    stream: Mapped[str | None] = mapped_column(String(16), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    job: Mapped[Job] = relationship(back_populates="events")
