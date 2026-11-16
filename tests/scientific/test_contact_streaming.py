from __future__ import annotations

import math
from itertools import combinations

import numpy as np
import pytest
from neistra_core import contacts as contact_module
from neistra_core.contacts import (
    Contact,
    ContactCapacityError,
    ContactGeometryError,
    ContactLimits,
    close_contacts,
)
from neistra_core.molecular import (
    Atom,
    Bond,
    Conformer,
    MolecularWarning,
    NormalizedStructureV1,
    SourceFacts,
)

Point = tuple[float, float, float]


def molecular_input(
    points: list[Point], *, ids: list[int] | None = None, bonds: list[Bond] | None = None
) -> NormalizedStructureV1:
    atom_ids = ids if ids is not None else list(range(1, len(points) + 1))
    return NormalizedStructureV1(
        title="contact correctness fixture",
        structure_type="complex",
        source=SourceFacts(filename="contacts.sdf", format="sdf"),
        atoms=[
            Atom(id=atom_id, name=f"C{atom_id}", element="C", coordinates=point, source_index=row)
            for row, (atom_id, point) in enumerate(zip(atom_ids, points, strict=True))
        ],
        bonds=bonds or [],
        conformers=[Conformer(id=1, name="Observed", coordinates=points)],
    )


def all_pairs_reference(
    structure: NormalizedStructureV1, cutoff: float, minimum: float
) -> list[tuple[int, int, float]]:
    """Independent exhaustive search using the standard-library point distance."""
    coordinates = structure.active_coordinates
    excluded = {frozenset((bond.atom_1_id, bond.atom_2_id)) for bond in structure.bonds}
    result = []
    for first, second in combinations(range(len(structure.atoms)), 2):
        first_id, second_id = structure.atoms[first].id, structure.atoms[second].id
        if frozenset((first_id, second_id)) in excluded:
            continue
        distance = math.dist(coordinates[first], coordinates[second])
        component_bound = max(
            abs(a - b) for a, b in zip(coordinates[first], coordinates[second], strict=True)
        )
        distance = max(distance, component_bound)
        if minimum <= distance <= cutoff:
            result.append((first_id, second_id, distance))
    return sorted(result, key=lambda item: (item[2], item[0], item[1]))


def contact_rows(contacts: list[Contact]) -> list[tuple[int, int, float]]:
    return [(item.atom_1_id, item.atom_2_id, item.distance) for item in contacts]


@pytest.mark.parametrize("count", [2, 3, 7, 20])
@pytest.mark.parametrize("scale", [math.ulp(0.0), 1e-310, 0.1, 1.0, 100.0, 1e154])
def test_complete_stream_matches_independent_small_all_pairs(count: int, scale: float) -> None:
    random = np.random.default_rng(20261116 + count)
    points = [tuple(point) for point in random.normal(size=(count, 3)) * scale]
    ids = [2 + 15 * i for i in range(count)]
    bonds = [
        Bond(id=i + 1, atom_1_id=ids[i + 1], atom_2_id=ids[i], order=None, inferred=True)
        for i in range(count - 1)
        if i % 2 == 0
    ]
    source = molecular_input(points, ids=ids, bonds=bonds)
    snapshot = source.to_bytes()
    cutoff = max(math.ulp(0.0), 2 * scale)
    expected = all_pairs_reference(source, cutoff, 0.0)
    actual = contact_rows(close_contacts(source, cutoff))
    assert actual == expected
    assert source.to_bytes() == snapshot


@pytest.mark.parametrize(
    ("separation", "included"),
    [
        (math.nextafter(0.5, 0.0), False),
        (0.5, True),
        (math.nextafter(0.5, math.inf), True),
        (math.nextafter(2.0, 0.0), True),
        (2.0, True),
        (math.nextafter(2.0, math.inf), False),
    ],
)
def test_inclusive_limits_and_adjacent_float_exclusion(separation: float, included: bool) -> None:
    source = molecular_input([(0, 0, 0), (separation, 0, 0)], ids=[2, 17])
    result = contact_rows(close_contacts(source, 2.0, minimum_distance=0.5))
    assert result == ([(2, 17, separation)] if included else [])


@pytest.mark.parametrize(
    ("points", "cutoff", "reported", "included"),
    [
        (
            [
                (0.05009831177913488, 1.4887140843570787, 0.22736186026269692),
                (2.126545451587064, -0.07793706197842075, -0.7416686198345033),
            ],
            2.7757969324300857,
            2.7757969324300857,
            True,
        ),
        (
            [
                (0.5649559062949664, -1.1254276422148826, 0.7252430205473623),
                (-0.97997155237217, 1.0568096903649375, -0.8942596694636524),
            ],
            3.125979780996943,
            3.1259797809969436,
            False,
        ),
    ],
    ids=["formerly-omitted-at-reported-cutoff", "formerly-included-above-reported-cutoff"],
)
def test_declared_distance_controls_tree_boundary_refinement(
    points: list[Point], cutoff: float, reported: float, included: bool
) -> None:
    source = molecular_input(points, ids=[2, 17])
    assert contact_rows(close_contacts(source, cutoff)) == ([(2, 17, reported)] if included else [])
    assert close_contacts(source, math.nextafter(reported, 0.0)) == []
    assert contact_rows(close_contacts(source, reported)) == [(2, 17, reported)]


def test_coincident_distinct_atoms_and_deterministic_tie_order() -> None:
    source = molecular_input([(1, 1, 1)] * 3, ids=[2, 17, 99])
    assert contact_rows(close_contacts(source, 2.0)) == [
        (2, 17, 0.0),
        (2, 99, 0.0),
        (17, 99, 0.0),
    ]
    assert close_contacts(source, 2.0, minimum_distance=0.5) == []


@pytest.mark.parametrize("order", [None, 1.0, 2.0])
@pytest.mark.parametrize("inferred", [False, True])
@pytest.mark.parametrize("reverse", [False, True])
def test_every_recorded_bond_is_excluded(
    order: float | None, inferred: bool, reverse: bool
) -> None:
    first, second = (17, 2) if reverse else (2, 17)
    source = molecular_input(
        [(0, 0, 0), (1, 0, 0)],
        ids=[2, 17],
        bonds=[Bond(id=1, atom_1_id=first, atom_2_id=second, order=order, inferred=inferred)],
    )
    assert close_contacts(source, 2.0) == []


def test_sparse_ids_use_the_actual_active_frame_without_changing_source() -> None:
    source = molecular_input([(0, 0, 0), (0, 0, 3)], ids=[2, 17])
    source = source.model_copy(
        update={
            "active_conformer_id": 7,
            "conformers": [
                Conformer(id=1, name="Other frame", coordinates=[(0, 0, 0), (0, 0, 9)]),
                Conformer(id=7, name="Current frame", coordinates=[(0, 0, 0), (0, 0, 3)]),
            ],
        }
    )
    snapshot = source.to_bytes()
    assert contact_rows(close_contacts(source, 3.0)) == [(2, 17, 3.0)]
    assert source.to_bytes() == snapshot


@pytest.mark.parametrize("count", [0, 1])
@pytest.mark.parametrize("missing_fact", [False, True], ids=["warning", "source-fact"])
def test_missing_small_inputs_are_unavailable_not_empty(count: int, missing_fact: bool) -> None:
    source = molecular_input([(0, 0, 0)] * count)
    if missing_fact:
        source = source.model_copy(
            update={
                "source": source.source.model_copy(update={"facts": {"missing_coordinates": True}}),
            }
        )
    else:
        source = source.model_copy(
            update={
                "warnings": [
                    MolecularWarning(
                        code="missing_coordinates",
                        message="Source has no observed coordinates",
                        operation="parse",
                    )
                ]
            }
        )
    with pytest.raises(ContactGeometryError, match="missing"):
        close_contacts(source, 2.0)


@pytest.mark.parametrize("count", [0, 1])
def test_valid_small_active_frames_return_complete_empty(count: int) -> None:
    assert close_contacts(molecular_input([(1, 2, 3)] * count), 2.0) == []


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_singleton_is_unavailable_before_empty_return(value: float) -> None:
    with pytest.raises(ContactGeometryError, match="finite"):
        close_contacts(molecular_input([(value, 0, 0)]), 2.0)


@pytest.mark.parametrize("count", [0, 1])
@pytest.mark.parametrize("invalid", ["missing-active-frame", "wrong-count", "wrong-shape"])
def test_invalid_small_frame_is_rejected_at_core_boundary(count: int, invalid: str) -> None:
    source = molecular_input([(0, 0, 0)] * count)
    # Deliberately bypass DTO validation to exercise the core's defensive boundary.
    if invalid == "missing-active-frame":
        source = source.model_copy(update={"active_conformer_id": 7})
    else:
        coordinates = (
            [(float("nan"), 0, 0)] * (count + 1)
            if invalid == "wrong-count"
            else [(0, 0) for _ in range(count)]
        )
        if count == 0 and invalid == "wrong-shape":
            coordinates = np.empty((0, 4))
        frame = source.conformers[0].model_copy(update={"coordinates": coordinates})
        source = source.model_copy(update={"conformers": [frame]})
    with pytest.raises(ContactGeometryError):
        close_contacts(source, 2.0)


def test_extreme_finite_extent_is_explicit_numerical_unavailability() -> None:
    source = molecular_input([(-1e308, 0, 0), (1e308, 0, 0)])
    with pytest.raises(ContactGeometryError, match="numerical search range"):
        close_contacts(source, 2.0)


def test_unrepresentable_separation_refuses_instead_of_returning_earlier_contacts() -> None:
    source = molecular_input([(0, 0, 0), (1, 0, 0), (1.7e308, 1.7e308, 0)])
    # Each component extent is finite, but the distant pair's norm is not.
    with pytest.raises(ContactGeometryError, match="numerical search range"):
        close_contacts(source, 1.75e308)


def test_large_finite_offset_still_uses_observed_float64_separation() -> None:
    first, second = 1e308, math.nextafter(1e308, 0.0)
    source = molecular_input([(first, first, first), (second, first, first)])
    assert contact_rows(close_contacts(source, 3e292)) == [(1, 2, first - second)]


def test_input_limit_is_checked_before_coordinate_or_tree_allocation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = molecular_input([(0, 0, 0)] * 3)
    assert len(close_contacts(source, 2.0, limits=ContactLimits(3, 9, 3))) == 3

    def forbidden(*args: object, **kwargs: object) -> None:
        pytest.fail("Over-budget input must be refused before coordinate/tree allocation")

    monkeypatch.setattr(contact_module.np, "array", forbidden)
    monkeypatch.setattr(contact_module, "cKDTree", forbidden)
    with pytest.raises(ContactCapacityError, match="input atoms"):
        close_contacts(source, 2.0, limits=ContactLimits(2, 9, 3))


@pytest.mark.parametrize("excluded", ["minimum", "all-recorded-bonds"])
def test_raw_neighbor_budget_charges_self_reverse_and_excluded_work(excluded: str) -> None:
    bonds = (
        [
            Bond(id=row, atom_1_id=first, atom_2_id=second, order=None, inferred=True)
            for row, (first, second) in enumerate(combinations([1, 2, 3], 2), start=1)
        ]
        if excluded == "all-recorded-bonds"
        else []
    )
    source = molecular_input([(0, 0, 0)] * 3, bonds=bonds)
    minimum = 0.5 if excluded == "minimum" else 0.0
    assert (
        close_contacts(source, 2.0, minimum_distance=minimum, limits=ContactLimits(3, 9, 0)) == []
    )
    with pytest.raises(ContactCapacityError, match="raw neighbor visits"):
        close_contacts(source, 2.0, minimum_distance=minimum, limits=ContactLimits(3, 8, 0))


def test_candidate_search_uses_only_bounded_single_point_lists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_tree = contact_module.cKDTree
    list_lengths = []

    class SinglePointTree:
        def __init__(self, *args: object, **kwargs: object) -> None:
            self.tree = original_tree(*args, **kwargs)

        def query_ball_point(self, point: object, *args: object, **kwargs: object) -> list[int]:
            assert np.shape(point) == (3,), "A batch query can materialize N neighbor lists"
            result = self.tree.query_ball_point(point, *args, **kwargs)
            list_lengths.append(len(result))
            return result

        def query_pairs(self, *args: object, **kwargs: object) -> None:
            pytest.fail("A global pair allocation must not precede contact admission")

        def count_neighbors(self, *args: object, **kwargs: object) -> None:
            pytest.fail("A count-only guard does not qualify pair allocation")

    monkeypatch.setattr(contact_module, "cKDTree", SinglePointTree)
    source = molecular_input([(0, 0, 0)] * 3)
    with pytest.raises(ContactCapacityError, match="raw neighbor visits"):
        close_contacts(source, 2.0, minimum_distance=0.5, limits=ContactLimits(3, 8, 0))
    assert list_lengths == [3, 3, 3]


def test_result_limit_refuses_whole_operation_before_extra_result_allocation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = molecular_input([(0, 0, 0)] * 3)
    assert len(close_contacts(source, 2.0, limits=ContactLimits(3, 9, 3))) == 3
    allocations = []

    def allocate(first: int, second: int, distance: float) -> Contact:
        allocations.append((first, second, distance))
        return Contact(first, second, distance)

    monkeypatch.setattr(contact_module, "Contact", allocate)
    with pytest.raises(ContactCapacityError, match="retained results"):
        close_contacts(source, 2.0, limits=ContactLimits(3, 9, 2))
    assert len(allocations) == 2
