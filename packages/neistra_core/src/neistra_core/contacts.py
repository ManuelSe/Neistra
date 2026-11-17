from __future__ import annotations

import math
from dataclasses import dataclass
from numbers import Integral

import numpy as np
from numpy.typing import NDArray
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from neistra_core.molecular import NormalizedStructureV1


@dataclass(frozen=True)
class Contact:
    atom_1_id: int
    atom_2_id: int
    distance: float


class ContactQueryError(ValueError):
    """Contact settings or limits do not describe a valid search."""


class ContactGeometryError(ValueError):
    """Observed coordinates are unavailable or exceed numerical search range."""


class ContactCapacityError(ValueError):
    """A complete contact search would exceed an admitted resource limit."""


@dataclass(frozen=True)
class ContactLimits:
    max_input_atoms: int
    max_raw_visits: int
    max_results: int

    def __post_init__(self) -> None:
        for value in (self.max_input_atoms, self.max_raw_visits, self.max_results):
            if isinstance(value, bool) or not isinstance(value, Integral) or value < 0:
                raise ContactQueryError("Contact limits must be non-negative integers")


DEFAULT_CONTACT_LIMITS = ContactLimits(
    max_input_atoms=100_000,
    max_raw_visits=2_000_000,
    max_results=250_000,
)


def _contact_coordinates(structure: NormalizedStructureV1, atom_count: int) -> NDArray[np.float64]:
    if structure.source.facts.get("missing_coordinates") is True or any(
        warning.code == "missing_coordinates" for warning in structure.warnings
    ):
        raise ContactGeometryError("Source coordinates are missing")
    try:
        active = structure.active_coordinates
    except StopIteration as error:
        raise ContactGeometryError("Active coordinate frame is unavailable") from error
    if len(active) != atom_count:
        raise ContactGeometryError("Active coordinate frame must provide one point per atom")
    try:
        coordinates = np.array(active, dtype=np.float64, copy=True, order="C")
    except (TypeError, ValueError, OverflowError) as error:
        raise ContactGeometryError("Active coordinates must be finite float64 3D points") from error
    if atom_count == 0 and coordinates.shape == (0,):
        coordinates = coordinates.reshape((0, 3))
    if coordinates.shape != (atom_count, 3) or not np.isfinite(coordinates).all():
        raise ContactGeometryError("Active coordinates must be finite float64 3D points")
    try:
        atom_coordinates = np.array(
            [atom.coordinates for atom in structure.atoms], dtype=np.float64, order="C"
        )
    except (TypeError, ValueError, OverflowError) as error:
        raise ContactGeometryError("Atom coordinates must be finite float64 3D points") from error
    if atom_count == 0 and atom_coordinates.shape == (0,):
        atom_coordinates = atom_coordinates.reshape((0, 3))
    if atom_coordinates.shape != (atom_count, 3) or not np.isfinite(atom_coordinates).all():
        raise ContactGeometryError("Atom coordinates must be finite float64 3D points")
    # The viewer and shared measurements use atom coordinates. Never search a
    # different active frame; exact numeric equality permits ordinary signed zero.
    if not np.array_equal(coordinates, atom_coordinates):
        raise ContactGeometryError("Current atom coordinates and active conformer disagree")
    if atom_count:
        for axis in range(3):
            span = float(coordinates[:, axis].max()) - float(coordinates[:, axis].min())
            if not math.isfinite(span):
                raise ContactGeometryError("Coordinate extent exceeds numerical search range")
    coordinates.flags.writeable = False
    return coordinates


def close_contacts(
    structure: NormalizedStructureV1,
    cutoff: float,
    *,
    minimum_distance: float = 0.0,
    limits: ContactLimits = DEFAULT_CONTACT_LIMITS,
) -> list[Contact]:
    """Return complete nonbonded atom-center contacts in Cartesian Å, or refuse.

    A single-point infinity-norm cube supplies conservative candidates for the
    declared stable Euclidean distance below. Limits charge every raw returned
    neighbor before exclusions, not just final contacts. They do not bound tree
    traversal or wall time; a caller requiring termination must own that lifecycle.
    """
    if not math.isfinite(cutoff) or cutoff <= 0:
        raise ContactQueryError("Contact cutoff must be a positive finite number")
    if not math.isfinite(minimum_distance) or minimum_distance < 0:
        raise ContactQueryError("Minimum contact distance must be a non-negative finite number")
    if minimum_distance >= cutoff:
        raise ContactQueryError("Minimum contact distance must be smaller than the cutoff")
    atom_count = len(structure.atoms)
    if atom_count > limits.max_input_atoms:
        raise ContactCapacityError(
            f"Contact search supports at most {limits.max_input_atoms} input atoms"
        )
    coordinates = _contact_coordinates(structure, atom_count)
    if atom_count < 2:
        return []

    try:
        tree = cKDTree(coordinates, copy_data=False, boxsize=None)
    except ValueError as error:
        raise ContactGeometryError("Coordinate extent exceeds numerical search range") from error
    bonded = {tuple(sorted((bond.atom_1_id, bond.atom_2_id))) for bond in structure.bonds}
    atom_ids = tuple(atom.id for atom in structure.atoms)
    contacts: list[Contact] = []
    raw_visits = 0
    for first_index in range(atom_count):
        if raw_visits >= limits.max_raw_visits:
            raise ContactCapacityError(
                f"Contact search exceeds {limits.max_raw_visits} raw neighbor visits"
            )
        try:
            neighbors = tree.query_ball_point(
                coordinates[first_index],
                cutoff,
                p=np.inf,
                eps=0.0,
                workers=1,
                return_sorted=False,
            )
        except ValueError as error:
            raise ContactGeometryError(
                "Coordinate extent exceeds numerical search range"
            ) from error
        raw_visits += len(neighbors)
        if raw_visits > limits.max_raw_visits:
            raise ContactCapacityError(
                f"Contact search exceeds {limits.max_raw_visits} raw neighbor visits"
            )
        first_id = atom_ids[first_index]
        first = coordinates[first_index]
        for candidate in neighbors:
            second_index = int(candidate)
            if second_index <= first_index:
                continue
            second_id = atom_ids[second_index]
            if (first_id, second_id) in bonded:
                continue
            second = coordinates[second_index]
            dx = float(first[0]) - float(second[0])
            dy = float(first[1]) - float(second[1])
            dz = float(first[2]) - float(second[2])
            separation = max(math.hypot(dx, dy, dz), abs(dx), abs(dy), abs(dz))
            if not math.isfinite(separation):
                raise ContactGeometryError("Contact separation exceeds numerical search range")
            if not minimum_distance <= separation <= cutoff:
                continue
            if len(contacts) >= limits.max_results:
                raise ContactCapacityError(
                    f"Contact search exceeds {limits.max_results} retained results"
                )
            contacts.append(Contact(first_id, second_id, separation))
    contacts.sort(key=lambda item: (item.distance, item.atom_1_id, item.atom_2_id))
    return contacts
