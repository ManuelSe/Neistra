from __future__ import annotations

from math import acos, atan2, degrees
from typing import Literal

import numpy as np
from numpy.typing import NDArray

MeasurementKind = Literal["distance", "angle", "dihedral"]
Point3D = tuple[float, float, float]


class InvalidMeasurementError(ValueError):
    """Raised when a measurement cannot be defined by the supplied coordinates."""


def _vector(point: Point3D) -> NDArray[np.float64]:
    value = np.asarray(point, dtype=np.float64)
    if value.shape != (3,) or not np.all(np.isfinite(value)):
        raise InvalidMeasurementError("Measurement coordinates must be finite 3D points")
    return value


def _unit(vector: NDArray[np.float64], label: str) -> NDArray[np.float64]:
    length = float(np.linalg.norm(vector))
    if length <= np.finfo(np.float64).eps:
        raise InvalidMeasurementError(f"{label} is undefined for coincident atoms")
    return vector / length


def distance(point_a: Point3D, point_b: Point3D) -> float:
    return float(np.linalg.norm(_vector(point_b) - _vector(point_a)))


def angle(point_a: Point3D, vertex: Point3D, point_c: Point3D) -> float:
    first = _unit(_vector(point_a) - _vector(vertex), "Angle")
    second = _unit(_vector(point_c) - _vector(vertex), "Angle")
    cosine = float(np.clip(np.dot(first, second), -1.0, 1.0))
    return degrees(acos(cosine))


def dihedral(
    point_a: Point3D,
    point_b: Point3D,
    point_c: Point3D,
    point_d: Point3D,
) -> float:
    bond_1 = _vector(point_b) - _vector(point_a)
    bond_2 = _vector(point_c) - _vector(point_b)
    bond_3 = _vector(point_d) - _vector(point_c)
    middle = _unit(bond_2, "Dihedral")
    normal_1 = _unit(np.cross(bond_1, bond_2), "Dihedral")
    normal_2 = _unit(np.cross(bond_2, bond_3), "Dihedral")
    companion = np.cross(middle, normal_1)
    return degrees(atan2(float(np.dot(companion, normal_2)), float(np.dot(normal_1, normal_2))))


def calculate(kind: MeasurementKind, points: list[Point3D]) -> float:
    expected = {"distance": 2, "angle": 3, "dihedral": 4}[kind]
    if len(points) != expected:
        raise InvalidMeasurementError(f"{kind.title()} requires exactly {expected} atoms")
    if kind == "distance":
        return distance(points[0], points[1])
    if kind == "angle":
        return angle(points[0], points[1], points[2])
    return dihedral(points[0], points[1], points[2], points[3])
