"""Shared persistence boundaries for distinct coordinate-calculation services."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping

from neistra_core.molecular import NormalizedStructureV1
from sqlalchemy import select
from sqlalchemy.orm import Session

from neistra_api.import_export import ArtifactService
from neistra_api.job_service import JobConflictError
from neistra_api.models import Artifact, Project, StructureEntry
from neistra_api.project_service import (
    EntryNotFoundError,
    ProjectNotFoundError,
    RevisionConflictError,
)


def get_project(session: Session, project_id: str, expected_revision: int | None = None) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise ProjectNotFoundError(project_id)
    if expected_revision is not None and project.revision != expected_revision:
        raise RevisionConflictError(project.revision)
    return project


def get_entry(project: Project, entry_id: str) -> StructureEntry:
    entry = next((entry for entry in project.entries if entry.id == entry_id), None)
    if entry is None:
        raise EntryNotFoundError(entry_id)
    return entry


def read_verified_artifact(artifacts: ArtifactService, artifact_id: str) -> tuple[Artifact, bytes]:
    artifact, data = artifacts.read(artifact_id)
    if len(data) != artifact.size or hashlib.sha256(data).hexdigest() != artifact.sha256:
        raise JobConflictError(
            "Stored calculation data failed integrity checks; rerun from verified sources"
        )
    return artifact, data


def parse_calculation_source(data: bytes) -> NormalizedStructureV1:
    try:
        return NormalizedStructureV1.from_bytes(data)
    except ValueError as error:
        raise JobConflictError(
            "Canonical source data is invalid; repair or reimport it before minimization"
        ) from error


def lock_coordinate_publication(session: Session, project_id: str) -> None:
    # Acquire before dependency/retry reads so independent API processes cannot
    # publish twice. Transaction completion remains the caller's responsibility.
    connection = session.connection()
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("BEGIN IMMEDIATE")
    else:
        session.execute(select(Project.id).where(Project.id == project_id).with_for_update())


def replace_selected_coordinates(
    before: NormalizedStructureV1,
    updates: Mapping[int, tuple[float, float, float]],
    conformer_id: int,
) -> NormalizedStructureV1 | None:
    """Replace validated selected rows, preserving source order and other facts.

    Callers validate finite values, exact selected IDs and the captured active
    conformer before this pure operation. They own annotations, warnings and
    scientific acceptance. The largest coordinate-component displacement must be
    strictly greater than 1e-9 Å, preserving the services' existing no-op rule.
    """
    if not any(
        max(abs(atom.coordinates[j] - updates[atom.id][j]) for j in range(3)) > 1e-9
        for atom in before.atoms
        if atom.id in updates
    ):
        return None
    coordinates = [updates.get(atom.id, atom.coordinates) for atom in before.atoms]
    return before.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"coordinates": point}) if atom.id in updates else atom
                for atom, point in zip(before.atoms, coordinates, strict=True)
            ],
            "conformers": [
                conformer.model_copy(update={"coordinates": coordinates})
                if conformer.id == conformer_id
                else conformer
                for conformer in before.conformers
            ],
        }
    )
