"""Shared deterministic local frames and approximate covalent lengths."""

from typing import Any

import numpy as np
from rdkit import Chem


def local_frame(axis: Any) -> Any:
    reference = np.eye(3)[int(np.argmin(np.abs(axis)))]
    second = np.cross(axis, reference)
    second /= np.linalg.norm(second)
    return np.column_stack((axis, second, np.cross(axis, second)))


_ELEMENTS = frozenset(Chem.GetPeriodicTable().GetElementSymbol(i) for i in range(1, 119))


def covalent_radius(element: str) -> float | None:
    if element not in _ELEMENTS:
        return None
    table = Chem.GetPeriodicTable()
    return float(table.GetRcovalent(table.GetAtomicNumber(element)))


def covalent_length(first: str, second: str) -> float:
    left, right = covalent_radius(first), covalent_radius(second)
    return 1.5 if left is None or right is None else left + right
