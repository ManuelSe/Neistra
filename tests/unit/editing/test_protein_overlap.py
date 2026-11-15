from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from neistra_core.adapters.macromolecular import PdbAdapter
from neistra_core.editing import protein as protein_module
from neistra_core.editing.protein import (
    InvalidProteinEditError,
    ProteinStructureValidator,
    _has_atomic_overlap,
)
from neistra_core.molecular import NormalizedStructureV1
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from tests.unit.editing.test_protein_editor import FIXTURE


@pytest.fixture
def protein() -> NormalizedStructureV1:
    return PdbAdapter().parse(FIXTURE.read_bytes(), FIXTURE.name).structures[0]


def brute_force(points: np.ndarray[Any, np.dtype[np.float64]]) -> bool:
    """Small-fixture oracle preserving the predecessor's exact axis arithmetic."""
    if len(points) < 2:
        return False
    distances = np.linalg.norm(points[:, np.newaxis, :] - points[np.newaxis, :, :], axis=2)
    np.fill_diagonal(distances, np.inf)
    return float(np.min(distances)) < 0.4


@pytest.mark.parametrize(
    "vector,expected",
    [
        ((-0.007012883902680816, -0.378476683284495, 0.12925254221614194), False),
        ((-0.012801681141727094, -0.14073765995054316, 0.37420452700574164), True),
    ],
)
@pytest.mark.parametrize("tied", [False, True])
def test_original_axis_reduction_controls_the_strict_overlap_boundary(
    vector: tuple[float, float, float],
    expected: bool,
    tied: bool,
) -> None:
    points = [(0.0, 0.0, 0.0), vector]
    if tied:
        points.append((-vector[0], -vector[1], -vector[2]))
    coordinates = np.asarray(points, dtype=np.float64)
    assert brute_force(coordinates) == expected
    assert _has_atomic_overlap(coordinates) == expected


@pytest.mark.parametrize(
    "points",
    [
        [],
        [(0, 0, 0)],
        [(0, 0, 0), (0, 0, 0)],
        [(0, 0, 0), (np.nextafter(0.4, 0), 0, 0)],
        [(0, 0, 0), (0.4, 0, 0)],
        [(0, 0, 0), (np.nextafter(0.4, np.inf), 0, 0)],
        [(0, 0, 0), (0.24, 0.32, 0)],
        [(0, 0, 0), (1, 0, 0), (-1, 0, 0), (0, 1, 0)],
        [(0, 0, 0), (1, 0, 0), (2, 0, 0), (2.1, 0, 0)],
    ],
)
def test_overlap_matches_independent_pair_oracle(points: list[tuple[float, float, float]]) -> None:
    coordinates = np.asarray(points, dtype=np.float64).reshape((-1, 3))
    assert _has_atomic_overlap(coordinates) == brute_force(coordinates)


def test_overlap_matches_pair_oracle_for_random_tied_and_collinear_clouds() -> None:
    rng = np.random.default_rng(147)
    for size in [2, 7, 33, 80]:
        points = rng.uniform(-4, 4, (size, 3))
        for candidate in [points, points * [1, 0, 0], np.round(points)]:
            assert _has_atomic_overlap(candidate) == brute_force(candidate)


@pytest.mark.parametrize("layout", ["coincident", "isolated_then_cluster", "late_pair", "none"])
def test_query_work_is_bounded_and_stops_at_first_positive_batch(
    monkeypatch: pytest.MonkeyPatch, layout: str
) -> None:
    points = np.asarray([(float(i), 0.0, 0.0) for i in range(101)])
    if layout == "coincident":
        # Production entry bound, without constructing a million molecular records.
        points = np.zeros((1_000_000, 3), dtype=np.float64)
    elif layout == "isolated_then_cluster":
        points[1:] = 5.0
    elif layout == "late_pair":
        points[-1] = points[-2]
    calls: list[int] = []

    class RecordingTree:
        def __init__(self, data: Any) -> None:
            self.tree = cKDTree(data)

        def query(self, rows: Any, **options: Any) -> Any:
            assert options == {"k": 2, "p": 2, "eps": 0, "workers": 1}
            calls.append(len(rows))
            return self.tree.query(rows, **options)

    monkeypatch.setattr(protein_module, "cKDTree", RecordingTree)
    assert _has_atomic_overlap(points) == (layout != "none")
    assert calls[0] == 1
    assert max(calls) <= 32
    if layout == "coincident":
        assert calls == [1]
    elif layout == "isolated_then_cluster":
        assert calls == [1, 32]
    else:
        assert sum(calls) == len(points)


def test_tied_neighbors_do_not_assume_self_is_the_first_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class TiedTree:
        def __init__(self, data: Any) -> None:
            pass

        def query(self, rows: Any, **options: Any) -> Any:
            return np.zeros((1, 2)), np.asarray([[1, 0]])

    monkeypatch.setattr(protein_module, "cKDTree", TiedTree)
    assert _has_atomic_overlap(np.zeros((2, 3)))


def test_protein_validation_checks_all_coordinates_before_spatial_queries(
    protein: NormalizedStructureV1,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unexpected_tree(data: Any) -> Any:
        pytest.fail("Nonfinite input reached the spatial index")

    monkeypatch.setattr(protein_module, "cKDTree", unexpected_tree)
    points = list(protein.active_coordinates)
    points[-1] = (float("nan"), 0, 0)
    malformed = protein.model_copy(
        update={
            "conformers": [protein.conformers[0].model_copy(update={"coordinates": points})],
        }
    )
    with pytest.raises(InvalidProteinEditError, match="finite"):
        ProteinStructureValidator().validate(malformed, "protein.test")


def test_validator_preserves_active_all_pair_semantics_and_warning_multiplicity(
    protein: NormalizedStructureV1,
) -> None:
    points = list(protein.active_coordinates)
    # Deliberately overlap polymer and ion: no bonded/component/altloc filtering.
    points[-1] = points[0]
    changed = protein.model_copy(
        update={
            "conformers": [protein.conformers[0].model_copy(update={"coordinates": points})],
        }
    )
    warnings = ProteinStructureValidator().validate(changed, "protein.test")
    assert [w.code for w in warnings].count("severe_atomic_clash") == 1
    assert warnings[0].operation == "protein.test"
