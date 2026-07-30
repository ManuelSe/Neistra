from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.molecular import NormalizedStructureV1


@dataclass(frozen=True)
class Contact:
    atom_1_id: int
    atom_2_id: int
    distance: float


def close_contacts(
    structure: NormalizedStructureV1,
    cutoff: float,
    *,
    minimum_distance: float = 0.0,
) -> list[Contact]:
    if not np.isfinite(cutoff) or cutoff <= 0:
        raise ValueError("Contact cutoff must be a positive finite number")
    if not np.isfinite(minimum_distance) or minimum_distance < 0:
        raise ValueError("Minimum contact distance must be a non-negative finite number")
    if minimum_distance >= cutoff:
        raise ValueError("Minimum contact distance must be smaller than the cutoff")
    if len(structure.atoms) < 2:
        return []

    coordinates = np.asarray(structure.active_coordinates, dtype=np.float64)
    pairs = cKDTree(coordinates).query_pairs(cutoff, output_type="ndarray")
    bonded = {
        tuple(sorted((bond.atom_1_id, bond.atom_2_id)))
        for bond in structure.bonds
    }
    contacts: list[Contact] = []
    for first_index, second_index in pairs:
        first_id = structure.atoms[int(first_index)].id
        second_id = structure.atoms[int(second_index)].id
        if (first_id, second_id) in bonded:
            continue
        separation = float(np.linalg.norm(coordinates[first_index] - coordinates[second_index]))
        if separation < minimum_distance:
            continue
        contacts.append(Contact(first_id, second_id, separation))
    return sorted(contacts, key=lambda item: (item.distance, item.atom_1_id, item.atom_2_id))
