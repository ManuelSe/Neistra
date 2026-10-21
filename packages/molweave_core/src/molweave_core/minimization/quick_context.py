"""Bounded spatial discovery with whole residues and covalent closure."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping

import numpy as np
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.minimization.preflight import connected_atoms
from molweave_core.molecular import NormalizedStructureV1

AtomKey = tuple[str, int]


def discover(
    sources: dict[str, NormalizedStructureV1],
    keys: set[AtomKey],
    protein: dict[str, set[int]],
    positions: Mapping[AtomKey, tuple[float, ...]] | None = None,
    radius: float = 8.0,
) -> dict[str, set[int]]:
    positions = positions or {}
    centers = np.asarray(
        [
            positions.get((e, a.id), p)
            for e, source in sources.items()
            for a, p in zip(source.atoms, source.active_coordinates, strict=True)
            if (e, a.id) in keys
        ]
    )
    tree = cKDTree(centers)
    result = {}
    for entry, source in sources.items():
        adjacency: dict[int, set[int]] = {a.id: set() for a in source.atoms}
        groups = defaultdict(set)
        atom_residue = {}
        for a in source.atoms:
            groups[a.residue_id].add(a.id)
            atom_residue[a.id] = a.residue_id
        for b in source.bonds:
            adjacency[b.atom_1_id].add(b.atom_2_id)
            adjacency[b.atom_2_id].add(b.atom_1_id)
        local = {
            a.id
            for a, neighbors in zip(
                source.atoms,
                tree.query_ball_point(np.asarray(source.active_coordinates), radius),
                strict=True,
            )
            if neighbors
        }
        local.update(i for e, i in keys if e == entry)
        halo = {i for e, i in keys if e == entry}
        for _ in range(3):
            halo.update(n for i in list(halo) for n in adjacency[i])
        local.update(halo)
        encountered = set(local)
        for i in encountered:
            if i in protein[entry]:
                local.update(groups[atom_residue[i]])
        organic = local - protein[entry]
        if organic:
            # Small covalent nonprotein components stay intact, including attached UNK H.
            nonprotein = source.model_copy(
                update={
                    "bonds": [
                        b
                        for b in source.bonds
                        if b.atom_1_id not in protein[entry] and b.atom_2_id not in protein[entry]
                    ]
                }
            )
            local.update(connected_atoms(nonprotein, organic))
        if local:
            result[entry] = local
    return result
