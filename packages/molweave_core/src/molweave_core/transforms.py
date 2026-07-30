from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from molweave_core.molecular import Conformer, NormalizedStructureV1

Point3D = tuple[float, float, float]
FloatMatrix = NDArray[np.float64]


class InvalidTransformError(ValueError):
    """Raised when a coordinate transform is undefined or would be a no-op."""


@dataclass(frozen=True, slots=True)
class RigidTransform:
    rotation: tuple[Point3D, Point3D, Point3D]
    translation: Point3D

    @classmethod
    def from_euler(
        cls,
        translation: Sequence[float],
        rotation_degrees: Sequence[float],
        pivot: Sequence[float],
    ) -> RigidTransform:
        translation_array = _vector(translation, "Translation")
        rotation_values = _vector(rotation_degrees, "Rotation")
        pivot_array = _vector(pivot, "Pivot")
        rotation = euler_rotation_matrix(rotation_values.tolist())
        if np.array_equal(translation_array, np.zeros(3)) and np.allclose(
            rotation, np.identity(3), rtol=0, atol=1e-15
        ):
            raise InvalidTransformError("Transform must change at least one coordinate")
        offset = pivot_array - rotation @ pivot_array + translation_array
        return cls(
            rotation=_matrix_tuple(rotation),
            translation=_point(offset),
        )

    def arrays(self) -> tuple[FloatMatrix, NDArray[np.float64]]:
        return (
            np.asarray(self.rotation, dtype=np.float64),
            np.asarray(self.translation, dtype=np.float64),
        )


def euler_rotation_matrix(rotation_degrees: Sequence[float]) -> FloatMatrix:
    """Compose right-handed X, then Y, then Z rotations for column vectors."""

    x_degrees, y_degrees, z_degrees = _vector(rotation_degrees, "Rotation")
    x, y, z = np.deg2rad([x_degrees, y_degrees, z_degrees])
    rotate_x = np.asarray(
        [
            [1.0, 0.0, 0.0],
            [0.0, np.cos(x), -np.sin(x)],
            [0.0, np.sin(x), np.cos(x)],
        ],
        dtype=np.float64,
    )
    rotate_y = np.asarray(
        [
            [np.cos(y), 0.0, np.sin(y)],
            [0.0, 1.0, 0.0],
            [-np.sin(y), 0.0, np.cos(y)],
        ],
        dtype=np.float64,
    )
    rotate_z = np.asarray(
        [
            [np.cos(z), -np.sin(z), 0.0],
            [np.sin(z), np.cos(z), 0.0],
            [0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )
    return rotate_z @ rotate_y @ rotate_x


def centroid(
    structure: NormalizedStructureV1,
    atom_ids: Iterable[int] | None = None,
) -> Point3D:
    selected_indices = _atom_indices(structure, atom_ids or (atom.id for atom in structure.atoms))
    coordinates = np.asarray(structure.active_coordinates, dtype=np.float64)
    _validate_coordinates(coordinates)
    return _point(coordinates[selected_indices].mean(axis=0))


def transform_structure(
    structure: NormalizedStructureV1,
    atom_ids: Iterable[int],
    *,
    translation: Sequence[float] = (0.0, 0.0, 0.0),
    rotation_degrees: Sequence[float] = (0.0, 0.0, 0.0),
    pivot: Sequence[float] = (0.0, 0.0, 0.0),
) -> NormalizedStructureV1:
    transform = RigidTransform.from_euler(translation, rotation_degrees, pivot)
    rotation, offset = transform.arrays()
    return apply_rigid_transform(structure, atom_ids, rotation, offset.tolist())


def apply_rigid_transform(
    structure: NormalizedStructureV1,
    atom_ids: Iterable[int],
    rotation: Sequence[Sequence[float]] | FloatMatrix,
    translation: Sequence[float],
) -> NormalizedStructureV1:
    selected_indices = _atom_indices(structure, atom_ids)
    rotation_array = np.asarray(rotation, dtype=np.float64)
    if rotation_array.shape != (3, 3) or not np.all(np.isfinite(rotation_array)):
        raise InvalidTransformError("Rotation matrix must be a finite 3 by 3 matrix")
    translation_array = _vector(translation, "Translation")
    transformed_conformers: list[Conformer] = []
    for conformer in structure.conformers:
        coordinates = np.asarray(conformer.coordinates, dtype=np.float64)
        _validate_coordinates(coordinates)
        changed = coordinates.copy()
        changed[selected_indices] = (
            coordinates[selected_indices] @ rotation_array.T + translation_array
        )
        transformed_conformers.append(
            conformer.model_copy(
                update={
                    "coordinates": [
                        _point(point) for point in changed
                    ]
                }
            )
        )
    active_coordinates = next(
        conformer.coordinates
        for conformer in transformed_conformers
        if conformer.id == structure.active_conformer_id
    )
    atoms = [
        atom.model_copy(update={"coordinates": active_coordinates[index]})
        for index, atom in enumerate(structure.atoms)
    ]
    return structure.model_copy(
        update={"atoms": atoms, "conformers": transformed_conformers}
    )


def _atom_indices(
    structure: NormalizedStructureV1,
    atom_ids: Iterable[int],
) -> NDArray[np.intp]:
    requested = list(atom_ids)
    if not requested:
        raise InvalidTransformError("Transform requires at least one atom")
    if len(set(requested)) != len(requested):
        raise InvalidTransformError("Transform atom IDs must be unique")
    index_by_id = {atom.id: index for index, atom in enumerate(structure.atoms)}
    missing = sorted(set(requested) - index_by_id.keys())
    if missing:
        raise InvalidTransformError(
            f"Transform references missing atom IDs: {', '.join(map(str, missing))}"
        )
    return np.asarray([index_by_id[atom_id] for atom_id in requested], dtype=np.intp)


def _vector(values: Sequence[float], label: str) -> NDArray[np.float64]:
    vector = np.asarray(values, dtype=np.float64)
    if vector.shape != (3,) or not np.all(np.isfinite(vector)):
        raise InvalidTransformError(f"{label} must be a finite 3D vector")
    return vector


def _validate_coordinates(coordinates: FloatMatrix) -> None:
    if (
        coordinates.ndim != 2
        or coordinates.shape[1] != 3
        or not np.all(np.isfinite(coordinates))
    ):
        raise InvalidTransformError("Structure coordinates must be finite 3D points")


def _point(values: Sequence[float] | NDArray[np.float64]) -> Point3D:
    return (float(values[0]), float(values[1]), float(values[2]))


def _matrix_tuple(matrix: FloatMatrix) -> tuple[Point3D, Point3D, Point3D]:
    return (_point(matrix[0]), _point(matrix[1]), _point(matrix[2]))
