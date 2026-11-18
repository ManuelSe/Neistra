from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from threading import BoundedSemaphore, Event

import pytest
from neistra_api.ligand_occurrence_cache import OccurrenceCacheKey, OccurrenceSummaryCache
from neistra_core.ligands.models import LigandCandidateV1
from neistra_core.ligands.occurrences import OccurrenceCount, OccurrenceIndex

KEYS = frozenset({"a", "b"})


def key(name: str = "input", record: int = 0) -> OccurrenceCacheKey:
    return OccurrenceCacheKey(
        "owned-store", name, "smiles", record, "resolver", "chemistry",
        "ligand-occurrence-v1", "2026.03.4", 1024, 8192, 1024,
    )


def index(reason: str | None = None) -> OccurrenceIndex:
    return OccurrenceIndex(
        {} if reason else {name: OccurrenceCount(2, "qualified_representation_v1", None)
                          for name in KEYS},
        OccurrenceCount(None, None, reason or "occurrence_not_applicable"),
        2, 6, 0 if reason else 2, reason is None, reason is None,
    )


def forbidden() -> OccurrenceIndex:
    raise AssertionError("A retained summary must not recompute its inventory")


def test_same_key_and_shared_slot_saturation_are_not_queued() -> None:
    slots = BoundedSemaphore(2)
    cache = OccurrenceSummaryCache(slots)
    cached = cache.get_or_build(key("retained"), KEYS, index)
    entered = [Event(), Event()]
    release = Event()

    def held(number: int) -> OccurrenceIndex:
        entered[number].set()
        assert release.wait(5)
        return index()

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(cache.get_or_build, key("a"), KEYS, lambda: held(0))
        second = executor.submit(cache.get_or_build, key("b"), KEYS, lambda: held(1))
        try:
            assert all(event.wait(5) for event in entered)
            assert cache.snapshot().in_flight == 2
            assert cache.get_or_build(key("a"), KEYS, forbidden) is None
            assert cache.get_or_build(key("third"), KEYS, forbidden) is None
            assert cache.get_or_build(key("retained"), KEYS, forbidden) is cached
            assert not slots.acquire(blocking=False)
            with pytest.raises(RuntimeError, match="active"):
                cache.clear()
        finally:
            release.set()
        assert first.result() is not None and second.result() is not None
    assert cache.snapshot().in_flight == 0
    assert slots.acquire(blocking=False) and slots.acquire(blocking=False)


def test_builder_and_validation_failures_release_ownership_and_slots() -> None:
    slots = BoundedSemaphore(1)
    cache = OccurrenceSummaryCache(slots)

    def broken() -> OccurrenceIndex:
        raise RuntimeError("injected builder failure")

    with pytest.raises(RuntimeError, match="injected"):
        cache.get_or_build(key(), KEYS, broken)
    assert cache.snapshot().in_flight == cache.snapshot().entries == 0
    invalid = replace(index(), by_candidate={"a": OccurrenceCount(
        3, "qualified_representation_v1", None,
    )})
    with pytest.raises(ValueError, match="exceeds"):
        cache.get_or_build(key(), KEYS, lambda: invalid)
    partial = replace(index(), chemical_complete=False)
    with pytest.raises(ValueError, match="Incomplete chemistry"):
        cache.get_or_build(key(), KEYS, lambda: partial)
    assert cache.get_or_build(key(), KEYS, index) is not None
    assert cache.snapshot().in_flight == 0


def test_retention_copies_immutable_values_and_does_not_retain_transient_refusals() -> None:
    cache = OccurrenceSummaryCache(BoundedSemaphore(2))
    mutable = dict(index().by_candidate)
    value = cache.get_or_build(key(), KEYS, lambda: replace(index(), by_candidate=mutable))
    assert value is not None
    mutable.clear()
    assert value.for_candidate("a").count == 2
    with pytest.raises(TypeError):
        value.by_candidate["a"] = OccurrenceCount(None, None, "corrupted")  # type: ignore[index]
    assert value.for_candidate("absent").count is None
    for reason in ("occurrence_work_busy", "occurrence_work_limit"):
        result = cache.get_or_build(key(reason), KEYS, lambda reason=reason: index(reason))
        assert result is not None
    assert cache.snapshot().entries == 1
    assert cache.get_or_build(key("occurrence_work_limit"), KEYS, index).chemical_complete


def test_lru_entry_and_exact_encoded_byte_bounds_and_oversized_nonretention() -> None:
    cache = OccurrenceSummaryCache(BoundedSemaphore(2), max_entries=2)
    for name in ("a", "b"):
        cache.get_or_build(key(name), KEYS, index)
    cache.get_or_build(key("a"), KEYS, forbidden)
    cache.get_or_build(key("c"), KEYS, index)
    assert cache.snapshot().entries == 2
    calls = []
    cache.get_or_build(key("b"), KEYS, lambda: (calls.append("rebuilt"), index())[1])
    assert calls == ["rebuilt"]
    weight = OccurrenceSummaryCache._weight(key("a"), index())
    bounded = OccurrenceSummaryCache(
        BoundedSemaphore(2), max_entry_bytes=weight + 1, max_encoded_bytes=2 * weight - 1,
    )
    bounded.get_or_build(key("a"), KEYS, index)
    bounded.get_or_build(key("b"), KEYS, index)
    assert bounded.snapshot().entries == 1
    assert bounded.snapshot().encoded_bytes <= 2 * weight - 1
    before = bounded.snapshot()
    oversized = replace(key("c"), store="s" * 10000)
    assert bounded.get_or_build(oversized, KEYS, index).for_candidate("a").count == 2
    assert bounded.snapshot() == before


def test_source_record_index_participates_in_cache_identity() -> None:
    cache = OccurrenceSummaryCache(BoundedSemaphore(2))
    cache.get_or_build(key(record=0), KEYS, index)
    assert cache.get_or_build(key(record=1), KEYS, lambda: index(
        "occurrence_inventory_unqualified",
    )).for_candidate("a").count is None
    assert cache.snapshot().entries == 2
    assert cache.get_or_build(key(record=0), KEYS, forbidden).for_candidate("a").count == 2


@pytest.mark.parametrize("count", [0, -1, True, 1.5, "2"])
def test_candidate_count_is_a_qualified_positive_integer(count: object) -> None:
    with pytest.raises(ValueError):
        LigandCandidateV1.model_validate({
            "candidate_key": "a", "atom_ids": [1], "label": "Exact instance",
            "boundary_status": "qualified", "occurrence_count": count,
            "occurrence_basis": "qualified_representation_v1", "occurrence_reason": None,
        })
