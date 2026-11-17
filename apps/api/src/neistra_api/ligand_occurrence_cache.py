"""Bounded process-local retention of immutable occurrence summaries only."""

from __future__ import annotations

import json
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import asdict, dataclass
from threading import BoundedSemaphore, Lock
from types import MappingProxyType

from neistra_core.ligands.occurrences import (
    OCCURRENCE_POLICY,
    OccurrenceCount,
    OccurrenceIndex,
)


@dataclass(frozen=True, slots=True)
class OccurrenceCacheKey:
    store: str
    inventory: str
    source_format: str
    source_record: int
    resolver: str
    chemistry: str
    occurrence: str
    library: str
    max_candidates: int
    max_atoms: int
    max_candidate_atoms: int


@dataclass(frozen=True, slots=True)
class OccurrenceCacheStats:
    entries: int
    encoded_bytes: int
    in_flight: int


class OccurrenceSummaryCache:
    """No work queue; existing depiction slots also admit cold count builders.

    Retention is measured in canonical encoded key/value bytes, not Python heap
    or resident memory. Source verification belongs before lookup. Native
    molecules, preparation contexts and builder closures are never retained.
    """

    def __init__(
        self,
        work_slots: BoundedSemaphore,
        *,
        max_entries: int = 64,
        max_entry_bytes: int = 256 * 1024,
        max_encoded_bytes: int = 8 * 1024 * 1024,
    ) -> None:
        if any(type(value) is not int or value < 1 for value in (
            max_entries, max_entry_bytes, max_encoded_bytes,
        )):
            raise ValueError("Occurrence cache limits must be positive integers")
        self._slots = work_slots
        self._max_entries = max_entries
        self._max_entry_bytes = max_entry_bytes
        self._max_bytes = max_encoded_bytes
        self._lock = Lock()
        self._entries: OrderedDict[OccurrenceCacheKey, tuple[OccurrenceIndex, int]] = OrderedDict()
        self._in_flight: set[OccurrenceCacheKey] = set()
        self._encoded_bytes = 0

    @staticmethod
    def _finalize(value: OccurrenceIndex, candidate_keys: frozenset[str]) -> OccurrenceIndex:
        if value.policy != OCCURRENCE_POLICY or not set(value.by_candidate) <= candidate_keys:
            raise ValueError("Occurrence summary does not describe the admitted inventory")
        if value.default.count is not None:
            raise ValueError("An absent candidate cannot inherit a known occurrence count")
        if type(value.complete) is not bool or type(value.chemical_complete) is not bool:
            raise ValueError("Occurrence completeness flags must be boolean")
        for count in (value.default, *value.by_candidate.values()):
            if not isinstance(count, OccurrenceCount):
                raise ValueError("Occurrence summary values must be typed immutable counts")
            if count.count is None:
                if count.basis is not None or not isinstance(count.reason, str) or not count.reason:
                    raise ValueError("Unavailable occurrence counts require a reason")
            elif type(count.count) is not int or count.count < 1 or count.basis not in {
                "qualified_representation_v1", "verified_source_entity_v1",
            } or count.reason is not None:
                raise ValueError("Known occurrence count has an invalid evidence basis")
            if count.basis == "qualified_representation_v1" and not value.chemical_complete:
                raise ValueError("Incomplete chemistry cannot publish exact chemical totals")
            if count.count is not None and count.count > len(candidate_keys):
                raise ValueError("Occurrence count exceeds this entry's complete inventory")
        for number in (
            value.potential_candidates, value.potential_atoms, value.qualified_candidates,
        ):
            if type(number) is not int or number < 0:
                raise ValueError("Occurrence work counters must be nonnegative integers")
        if value.chemical_complete and not value.complete:
            raise ValueError("Complete chemical counts require a complete summary")
        return OccurrenceIndex(
            MappingProxyType(dict(value.by_candidate)), value.default,
            value.potential_candidates, value.potential_atoms, value.qualified_candidates,
            value.complete, value.chemical_complete, value.policy,
        )

    @staticmethod
    def _weight(key: OccurrenceCacheKey, value: OccurrenceIndex) -> int:
        payload = {
            "key": asdict(key),
            "counts": {name: asdict(count) for name, count in value.by_candidate.items()},
            "default": asdict(value.default),
            "potential_candidates": value.potential_candidates,
            "potential_atoms": value.potential_atoms,
            "qualified_candidates": value.qualified_candidates,
            "complete": value.complete,
            "chemical_complete": value.chemical_complete,
            "policy": value.policy,
        }
        return len(json.dumps(
            payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
        ).encode())

    def get_or_build(
        self,
        key: OccurrenceCacheKey,
        candidate_keys: frozenset[str],
        build: Callable[[], OccurrenceIndex],
    ) -> OccurrenceIndex | None:
        with self._lock:
            cached = self._entries.get(key)
            if cached is not None:
                self._entries.move_to_end(key)
                return cached[0]
            if key in self._in_flight or not self._slots.acquire(blocking=False):
                return None
            self._in_flight.add(key)
        try:
            value = self._finalize(build(), candidate_keys)
            # A later deliberate retry may succeed under different host load.
            if value.default.reason in {"occurrence_work_busy", "occurrence_work_limit"}:
                return value
            size = self._weight(key, value)
            if size > self._max_entry_bytes or size > self._max_bytes:
                return value
            with self._lock:
                while self._entries and (
                    len(self._entries) >= self._max_entries
                    or self._encoded_bytes + size > self._max_bytes
                ):
                    _, (_, old_size) = self._entries.popitem(last=False)
                    self._encoded_bytes -= old_size
                self._entries[key] = value, size
                self._encoded_bytes += size
            return value
        finally:
            with self._lock:
                self._in_flight.discard(key)
            self._slots.release()

    def snapshot(self) -> OccurrenceCacheStats:
        with self._lock:
            return OccurrenceCacheStats(
                len(self._entries), self._encoded_bytes, len(self._in_flight),
            )

    def clear(self) -> None:
        """Reset retained derived values only after admitted work has settled."""
        with self._lock:
            if self._in_flight:
                raise RuntimeError("Occurrence work is still active")
            self._entries.clear()
            self._encoded_bytes = 0
