"""Canonical, nonrecursive automatic context; presentation never supplies membership."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from math import isfinite

from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.minimization.contracts import CalculationError
from molweave_core.molecular import NormalizedStructureV1
from molweave_core.selection import SelectionV1

Point = tuple[float, float, float]
RADIUS = 12.0


def whole_components(source: NormalizedStructureV1) -> tuple[frozenset[int], ...]:
    """Union canonical bonds and whole polymer chains without inferring new bonds."""
    parent = {a.id: a.id for a in source.atoms}

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def join(first: int, second: int) -> None:
        parent[find(second)] = find(first)

    for bond in source.bonds:
        join(bond.atom_1_id, bond.atom_2_id)
    chains = {r.id: r.chain_id for r in source.residues if r.component_type == "polymer"}
    first_in_chain: dict[int, int] = {}
    for atom in source.atoms:
        chain = chains.get(atom.residue_id) if atom.residue_id is not None else None
        if chain is not None:
            join(first_in_chain.setdefault(chain, atom.id), atom.id)
    groups: dict[int, set[int]] = defaultdict(set)
    for atom in source.atoms:
        groups[find(atom.id)].add(atom.id)
    return tuple(sorted((frozenset(group) for group in groups.values()), key=min))


@dataclass(frozen=True)
class ContextDiscovery:
    membership: dict[str, set[int]]
    component_count: int


def discover_context(
    selected_sources: Mapping[str, NormalizedStructureV1],
    candidates: Iterable[tuple[str, NormalizedStructureV1]],
    selection: SelectionV1,
    updates: Mapping[tuple[str, int], Point] | None = None,
) -> ContextDiscovery:
    """Discover around complete mandatory components, never around discovered ones.

    Candidates are streamed one entry at a time; no all-pairs distance matrix or
    chemistry-based filtering. Final-coordinate overrides support acceptance checks.
    """
    overrides = updates or {}
    seeds: dict[str, set[int]] = defaultdict(set)
    for ref in selection.atoms:
        seeds[ref.structure_id].add(ref.atom_id)
    if not seeds:
        raise CalculationError("selection_empty", "Select explicit movable atoms")
    points: list[Point] = []
    for entry_id, ids in seeds.items():
        source = selected_sources.get(entry_id)
        if source is None or not ids <= {a.id for a in source.atoms}:
            raise CalculationError(
                "atom_missing", "A selected atom/entry is missing", entry_id=entry_id
            )
        mandatory = set().union(*(group for group in whole_components(source) if group & ids))
        if len(mandatory) > 20_000:
            raise CalculationError("assembly_limit", "Complete calculation exceeds 20000 atoms")
        points.extend(
            overrides.get((entry_id, a.id), point)
            for a, point in zip(source.atoms, source.active_coordinates, strict=True)
            if a.id in mandatory
        )
        if len(points) > 20_000:
            raise CalculationError("assembly_limit", "Complete calculation exceeds 20000 atoms")
    if any(not isfinite(v) for point in points for v in point):
        raise CalculationError("invalid_coordinates", "Automatic context needs finite coordinates")
    tree = cKDTree(points)
    membership: dict[str, set[int]] = {}
    total = count = 0
    for entry_id, source in candidates:
        coordinates = [
            overrides.get((entry_id, a.id), point)
            for a, point in zip(source.atoms, source.active_coordinates, strict=True)
        ]
        if any(not isfinite(v) for point in coordinates for v in point):
            raise CalculationError(
                "invalid_coordinates",
                "Cannot determine automatic context "
                "for nonfinite coordinates; use explicit context or repair input",
                entry_id=entry_id,
            )
        distances = tree.query(coordinates, k=1)[0]
        near = {
            a.id for a, distance in zip(source.atoms, distances, strict=True) if distance <= RADIUS
        }
        included: set[int] = set()
        for group in whole_components(source):
            if group & (near | seeds.get(entry_id, set())):
                included.update(group)
                count += 1
        if included:
            membership[entry_id] = included
            total += len(included)
        if total > 20_000 or len(membership) > 100:
            raise CalculationError(
                "assembly_limit",
                "Automatic context exceeds 20000 atoms / "
                "100 entries; review explicit context instead of cropping chains",
            )
    return ContextDiscovery(membership, count)
