"""Validated installation camera preferences, separate from molecular history."""

from __future__ import annotations

from datetime import UTC, datetime
from math import isfinite, pi, sqrt, tan
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator
from sqlalchemy import insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from neistra_api.models import WorkspacePresentation, utc_now

FiniteNumber = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Vector3 = tuple[FiniteNumber, FiniteNumber, FiniteNumber]


def _native_norm(vector: Vector3) -> float:
    # Match the pinned viewer's arithmetic: hypot would rescue overflowing or
    # underflowing squared norms that its actual lookAt matrix cannot use.
    return sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2])


def _cross(a: Vector3, b: Vector3) -> Vector3:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _normalized(vector: Vector3) -> Vector3:
    length = _native_norm(vector)
    if not isfinite(length) or length <= 0:
        raise ValueError("Camera orientation must have finite, nondegenerate native norms")
    inverse = 1 / length
    result = (vector[0] * inverse, vector[1] * inverse, vector[2] * inverse)
    if not all(isfinite(value) for value in result):
        raise ValueError("Camera orientation cannot be represented by the viewer")
    return result


class SessionCamera(BaseModel):
    """Complete automatic camera pose; FOV is in radians, radius is not zoom."""

    model_config = ConfigDict(extra="forbid")

    mode: Literal["perspective", "orthographic"]
    position: Vector3
    target: Vector3
    up: Vector3
    radius: FiniteNumber = Field(gt=0)
    fov: FiniteNumber = Field(gt=0, lt=pi)

    @model_validator(mode="after")
    def native_projection_is_nondegenerate(self) -> SessionCamera:
        delta = tuple(self.position[i] - self.target[i] for i in range(3))
        if not all(isfinite(value) for value in delta):
            raise ValueError("Camera position-to-target difference must be finite")
        # The pinned lookAt returns an identity matrix in this exact condition.
        if all(abs(value) < 1e-6 for value in delta):
            raise ValueError("Camera position and target are indistinguishable to the viewer")
        direction: Vector3 = (delta[0], delta[1], delta[2])
        distance = _native_norm(direction)
        z = _normalized(direction)
        # Use the raw up vector, as the native lookAt does. Normalizing it first
        # would hide an unrepresentable cross product for extreme finite inputs.
        x = _normalized(_cross(self.up, z))
        y = _normalized(_cross(z, x))
        if not all(
            isfinite(sum(axis[i] * self.position[i] for i in range(3))) for axis in (x, y, z)
        ):
            raise ValueError("Camera view translation must be finite")
        height = (2 * tan(self.fov / 2)) * distance
        if not isfinite(height) or height <= 0 or not isfinite(1 / height) or 1 / height <= 0:
            raise ValueError("Camera FOV and distance produce a degenerate projection")
        return self


class WorkspacePresentationV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    revision: StrictInt = Field(ge=0)
    camera: SessionCamera | None
    updated_at: datetime | None

    @model_validator(mode="after")
    def record_is_consistent(self) -> WorkspacePresentationV1:
        if self.revision == 0:
            if self.camera is not None or self.updated_at is not None:
                raise ValueError("An unsaved presentation cannot contain a camera or timestamp")
        elif self.camera is None or self.updated_at is None:
            raise ValueError("A saved presentation requires a camera and timestamp")
        return self


class WorkspacePresentationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: StrictInt = Field(ge=0)
    camera: SessionCamera


class PresentationRevisionConflict(RuntimeError):
    def __init__(self, current_revision: int) -> None:
        self.current_revision = current_revision
        super().__init__(f"Saved view changed; current revision is {current_revision}")


def read_presentation(session: Session) -> WorkspacePresentationV1:
    # Column mappings avoid an ORM identity-map snapshot hiding an external write
    # when a caller deliberately reuses a session.
    table = WorkspacePresentation.__table__
    row = session.execute(select(table).where(table.c.id == 1)).mappings().one_or_none()
    if row is None:
        return WorkspacePresentationV1(revision=0, camera=None, updated_at=None)
    updated_at = row["updated_at"]
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=UTC)
    return WorkspacePresentationV1(
        schema_version=row["schema_version"],
        revision=row["revision"],
        camera=SessionCamera.model_validate(row["camera"]),
        updated_at=updated_at,
    )


def update_presentation(
    session: Session, payload: WorkspacePresentationUpdate
) -> WorkspacePresentationV1:
    current = read_presentation(session)
    if current.revision != payload.expected_revision:
        raise PresentationRevisionConflict(current.revision)
    if current.camera == payload.camera:
        return current

    table = WorkspacePresentation.__table__
    now = utc_now()
    values = {
        "schema_version": 1,
        "revision": current.revision + 1,
        "camera": payload.camera.model_dump(mode="json"),
        "updated_at": now,
    }
    if current.revision == 0:
        try:
            session.execute(insert(WorkspacePresentation).values(id=1, **values))
            session.commit()
        except IntegrityError:
            session.rollback()
            latest = read_presentation(session)
            if latest.revision == 0:
                raise
            raise PresentationRevisionConflict(latest.revision) from None
    else:
        result = session.connection().execute(
            update(WorkspacePresentation)
            .where(
                table.c.id == 1,
                table.c.revision == payload.expected_revision,
            )
            .values(**values)
        )
        if result.rowcount != 1:
            session.rollback()
            raise PresentationRevisionConflict(read_presentation(session).revision)
        session.commit()
    return WorkspacePresentationV1(
        revision=current.revision + 1,
        camera=payload.camera,
        updated_at=now,
    )
