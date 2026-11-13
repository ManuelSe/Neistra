"""Bounded spatial discovery with assembly-owned immutable current-graph indexes."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from types import MappingProxyType

import numpy as np
from numpy.typing import NDArray
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from neistra_core.minimization.preflight import connected_atoms
from neistra_core.molecular import NormalizedStructureV1

AtomKey = tuple[str, int]


@dataclass(frozen=True, slots=True)
class EntryDiscoveryIndex:
    """One snapshot of interpreted/isolation graph endpoints and captured rows.

    Organic component members are stored once; atoms map to a component number.
    No all-pairs graph distances or coordinates from a different assembly are cached.
    """

    source: NormalizedStructureV1
    atom_ids: tuple[int, ...]
    rows: Mapping[int, int]
    coordinates: NDArray[np.float64]
    adjacency: Mapping[int, tuple[int, ...]]
    protein: frozenset[int]
    residue: Mapping[int, int | None]
    residues: Mapping[int | None, frozenset[int]]
    organic_component: Mapping[int, int]
    organic_components: tuple[frozenset[int], ...]

    @classmethod
    def build(cls, source: NormalizedStructureV1, protein: set[int]) -> EntryDiscoveryIndex:
        atom_ids = tuple(atom.id for atom in source.atoms)
        coordinates = np.array(source.active_coordinates, dtype=np.float64).reshape((-1, 3))
        coordinates.setflags(write=False)
        adjacent: dict[int, list[int]] = {atom_id: [] for atom_id in atom_ids}
        for bond in source.bonds:
            adjacent[bond.atom_1_id].append(bond.atom_2_id)
            adjacent[bond.atom_2_id].append(bond.atom_1_id)
        adjacency = {atom_id: tuple(neighbors) for atom_id, neighbors in adjacent.items()}
        groups: dict[int | None, set[int]] = defaultdict(set)
        residue = {}
        for atom in source.atoms:
            groups[atom.residue_id].add(atom.id)
            residue[atom.id] = atom.residue_id
        remaining = set(atom_ids) - protein
        components: list[frozenset[int]] = []
        component_for: dict[int, int] = {}
        while remaining:
            seed = remaining.pop()
            members, pending = {seed}, [seed]
            while pending:
                for neighbor in adjacency[pending.pop()]:
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        members.add(neighbor)
                        pending.append(neighbor)
            component_for.update((atom_id, len(components)) for atom_id in members)
            components.append(frozenset(members))
        return cls(
            source,
            atom_ids,
            MappingProxyType({atom_id: i for i, atom_id in enumerate(atom_ids)}),
            coordinates,
            MappingProxyType(adjacency),
            frozenset(protein),
            MappingProxyType(residue),
            MappingProxyType({key: frozenset(value) for key, value in groups.items()}),
            MappingProxyType(component_for),
            tuple(components),
        )

    def induced_components(self, members: set[int]) -> Iterator[set[int]]:
        """Connectivity restricted to selected members, never through omitted atoms."""
        remaining = set(members)
        for seed in sorted(members):
            if seed not in remaining:
                continue
            remaining.remove(seed)
            component, pending = {seed}, [seed]
            while pending:
                for neighbor in self.adjacency[pending.pop()]:
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        component.add(neighbor)
                        pending.append(neighbor)
            yield component


@dataclass(frozen=True, slots=True)
class DiscoveryIndex:
    entries: Mapping[str, EntryDiscoveryIndex]

    @classmethod
    def build(
        cls,
        sources: dict[str, NormalizedStructureV1],
        protein: dict[str, set[int]],
    ) -> DiscoveryIndex:
        return cls(
            MappingProxyType(
                {
                    entry: EntryDiscoveryIndex.build(source, protein[entry])
                    for entry, source in sources.items()
                }
            )
        )

    def require_sources(
        self,
        sources: dict[str, NormalizedStructureV1],
        protein: dict[str, set[int]],
    ) -> None:
        if (
            self.entries.keys() != sources.keys()
            or self.entries.keys() != protein.keys()
            or any(
                self.entries[entry].source is not source
                or self.entries[entry].protein != protein[entry]
                for entry, source in sources.items()
            )
        ):
            raise ValueError("Discovery index belongs to a different assembly or classification")


def discover(
    sources: dict[str, NormalizedStructureV1],
    keys: set[AtomKey],
    protein: dict[str, set[int]],
    positions: Mapping[AtomKey, tuple[float, ...]] | None = None,
    radius: float = 8.0,
    *,
    index: DiscoveryIndex | None = None,
) -> dict[str, set[int]]:
    # Independent callers, including validation, construct their own fresh snapshot.
    index = DiscoveryIndex.build(sources, protein) if index is None else index
    index.require_sources(sources, protein)
    positions = positions or {}
    selected_by_entry: dict[str, set[int]] = defaultdict(set)
    for entry, atom_id in keys:
        selected_by_entry[entry].add(atom_id)
    centers = np.asarray(
        [
            positions.get((entry, atom_id), item.coordinates[item.rows[atom_id]])
            for entry, item in index.entries.items()
            for atom_id in sorted(selected_by_entry[entry], key=item.rows.__getitem__)
        ]
    )
    tree = cKDTree(centers)
    result = {}
    for entry, item in index.entries.items():
        # Only membership is needed. Exact count queries avoid N*M neighbor lists.
        counts = tree.query_ball_point(item.coordinates, radius, eps=0.0, return_length=True)
        local = {atom_id for atom_id, count in zip(item.atom_ids, counts, strict=True) if count}
        selected = selected_by_entry[entry]
        local.update(selected)
        halo = set(selected)
        for _ in range(3):
            halo.update(neighbor for atom_id in list(halo) for neighbor in item.adjacency[atom_id])
        local.update(halo)
        encountered = set(local)
        for atom_id in encountered:
            if atom_id in item.protein:
                local.update(item.residues[item.residue[atom_id]])
        components = {item.organic_component[atom_id] for atom_id in local - item.protein}
        for component in components:
            local.update(item.organic_components[component])
        if local:
            result[entry] = local
    return result


def candidate_entries(
    sources: dict[str, NormalizedStructureV1],
    keys: set[AtomKey],
    positions: Mapping[AtomKey, tuple[float, ...]] | None = None,
    radius: float = 8.0,
) -> set[str]:
    """Fresh exact spatial screen before chemical template work or Apply checks."""
    positions = positions or {}
    centers = np.asarray(
        [
            positions.get((entry, atom.id), point)
            for entry, source in sources.items()
            for atom, point in zip(source.atoms, source.active_coordinates, strict=True)
            if (entry, atom.id) in keys
        ]
    )
    tree = cKDTree(centers)
    return {
        entry
        for entry, source in sources.items()
        if np.any(
            tree.query_ball_point(
                np.asarray(source.active_coordinates).reshape((-1, 3)),
                radius,
                eps=0.0,
                return_length=True,
            )
        )
    }


def isolate_graph(source: NormalizedStructureV1, selected: set[int]) -> NormalizedStructureV1:
    """Isolation excludes disconnected neighbors even when they share a project entry."""
    from neistra_core.minimization.assembly import project_atoms

    return project_atoms(source, connected_atoms(source, selected))
