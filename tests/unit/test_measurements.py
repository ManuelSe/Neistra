from __future__ import annotations

import pytest
from molweave_core.measurements import (
    InvalidMeasurementError,
    angle,
    calculate,
    dihedral,
    distance,
)


def test_reference_distance_angle_and_dihedral() -> None:
    assert distance((0, 0, 0), (1, 2, 2)) == pytest.approx(3.0)
    assert angle((1, 0, 0), (0, 0, 0), (0, 1, 0)) == pytest.approx(90.0)
    assert dihedral((1, 0, 0), (0, 0, 0), (0, 1, 0), (0, 1, 1)) == pytest.approx(
        -90.0
    )


def test_calculate_requires_the_exact_atom_count() -> None:
    with pytest.raises(InvalidMeasurementError, match="requires exactly 3"):
        calculate("angle", [(0, 0, 0), (1, 0, 0)])


def test_degenerate_geometry_is_reported() -> None:
    with pytest.raises(InvalidMeasurementError, match="coincident atoms"):
        angle((0, 0, 0), (0, 0, 0), (1, 0, 0))
    with pytest.raises(InvalidMeasurementError, match="coincident atoms"):
        dihedral((0, 0, 0), (1, 0, 0), (2, 0, 0), (3, 0, 0))
