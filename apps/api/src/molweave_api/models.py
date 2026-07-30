from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
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
    bond_count: Mapped[int] = mapped_column(Integer, default=0)
    residue_count: Mapped[int] = mapped_column(Integer, default=0)
    conformer_count: Mapped[int] = mapped_column(Integer, default=0)
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
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
