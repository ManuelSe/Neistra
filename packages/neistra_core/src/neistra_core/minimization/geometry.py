"""Shared geometric acceptance checks without preparation-engine imports."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import numpy as np
from numpy.typing import NDArray
from rdkit import Chem
from scipy.spatial import cKDTree  # type: ignore[import-untyped]


def introduces_severe_overlap(
    original: NDArray[np.float64],
    final: NDArray[np.float64],
    movable: NDArray[np.int64],
    bonds: set[frozenset[int]],
    checkpoint: Callable[[], None],
) -> bool:
    # All fixed-only pairs are unchanged. Avoid an unbounded global pair set.
    before_tree, after_tree = cKDTree(original), cKDTree(final)
    for index in movable:
        checkpoint()
        i = int(index)
        original_neighbors = set(before_tree.query_ball_point(original[i], 0.6))
        if any(
            j != i and j not in original_neighbors and frozenset((i, j)) not in bonds
            for j in after_tree.query_ball_point(final[i], 0.6)
        ):
            return True
    return False


def geometry_stereo(molecule: Any, coordinates: NDArray[np.float64]) -> tuple[str, ...]:
    copy = Chem.Mol(molecule)
    Chem.RemoveStereochemistry(copy)
    conformer = copy.GetConformer()
    for i, point in enumerate(coordinates):
        conformer.SetAtomPosition(i, tuple(float(v) for v in point))
    Chem.AssignStereochemistryFrom3D(copy, confId=conformer.GetId(), replaceExistingTags=True)
    return tuple(
        [str(a.GetChiralTag()) for a in copy.GetAtoms()]
        + [str(b.GetStereo()) for b in copy.GetBonds()]
    )
