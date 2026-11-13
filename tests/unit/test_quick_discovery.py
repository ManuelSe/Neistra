"""Independent exact spatial/closure oracles and assembly-index lifetime checks."""

from __future__ import annotations

from collections import defaultdict
from itertools import pairwise
from pathlib import Path

import numpy as np
import pytest
from neistra_core.minimization import quick_context, quick_optimize
from neistra_core.minimization.quick_context import (
    DiscoveryIndex,
    EntryDiscoveryIndex,
    candidate_entries,
    discover,
)
from neistra_core.minimization.quick_model import build_assembly
from neistra_core.minimization.quick_protein import protein_graph
from neistra_core.molecular import (
    Atom,
    Bond,
    Chain,
    Conformer,
    NormalizedStructureV1,
    Residue,
    SourceFacts,
)

from tests.support.minimization import LocalContext, molecule, protein_state_chain, translated
from tests.unit.test_quick_minimization import environment_parameters, quick_capture


def graph(points, edges=(), residues=None):
    residues = residues or {}
    atoms = [
        Atom(
            id=atom_id,
            name=f"C{atom_id}",
            element="C",
            coordinates=point,
            source_index=i,
            residue_id=residues.get(atom_id),
        )
        for i, (atom_id, point) in enumerate(sorted(points.items()))
    ]
    return NormalizedStructureV1(
        title="Discovery graph",
        structure_type="protein" if residues else "ligand",
        source=SourceFacts(filename="discovery.xyz", format="xyz"),
        atoms=atoms,
        bonds=[
            Bond(id=i + 1, atom_1_id=first, atom_2_id=second, order=1)
            for i, (first, second) in enumerate(edges)
        ],
        chains=[Chain(id=1, name="A")] if residues else [],
        residues=[
            Residue(id=residue, chain_id=1, name="ALA", author_number=residue)
            for residue in sorted(set(residues.values()))
        ],
        conformers=[
            Conformer(id=1, name="Captured", coordinates=[atom.coordinates for atom in atoms])
        ],
    )


def brute_membership(sources, keys, protein, radius, positions=None):
    """Full pair scan, explicit graph distances and nonprotein-only traversal."""
    positions = positions or {}
    centers = [
        positions.get((entry, atom.id), point)
        for entry, source in sources.items()
        for atom, point in zip(source.atoms, source.active_coordinates, strict=True)
        if (entry, atom.id) in keys
    ]
    result = {}
    for entry, source in sources.items():
        adjacent = {atom.id: set() for atom in source.atoms}
        grouped = defaultdict(set)
        atom_residue = {}
        for atom in source.atoms:
            grouped[atom.residue_id].add(atom.id)
            atom_residue[atom.id] = atom.residue_id
        for bond in source.bonds:
            adjacent[bond.atom_1_id].add(bond.atom_2_id)
            adjacent[bond.atom_2_id].add(bond.atom_1_id)
        local = {
            atom.id
            for atom, point in zip(source.atoms, source.active_coordinates, strict=True)
            if any(
                sum((a - b) ** 2 for a, b in zip(point, center, strict=True)) <= radius**2
                for center in centers
            )
        }
        frontier = {atom_id for key_entry, atom_id in keys if key_entry == entry}
        local.update(frontier)
        reached = set(frontier)
        for _ in range(3):
            frontier = {
                neighbor for atom_id in frontier for neighbor in adjacent[atom_id]
            } - reached
            reached.update(frontier)
        local.update(reached)
        protein_residues = {atom_residue[atom_id] for atom_id in local & protein[entry]}
        local.update(atom_id for residue in protein_residues for atom_id in grouped[residue])
        pending = list(local - protein[entry])
        organic = set(pending)
        while pending:
            for neighbor in adjacent[pending.pop()]:
                if neighbor not in protein[entry] and neighbor not in organic:
                    organic.add(neighbor)
                    pending.append(neighbor)
        local.update(organic)
        if local:
            result[entry] = local
    return result


@pytest.mark.parametrize("radius", [6.0, 7.0, 8.0])
def test_closed_radius_matches_brute_force_at_adjacent_float_boundaries(radius):
    sources = {
        "mover": graph({41: (0.0, 0.0, 0.0)}),
        "site": graph(
            {
                3: (float(np.nextafter(radius, 0.0)), 0.0, 0.0),
                19: (radius, 0.0, 0.0),
                73: (float(np.nextafter(radius, np.inf)), 0.0, 0.0),
            }
        ),
    }
    keys, protein = {("mover", 41)}, {entry: set() for entry in sources}
    expected = brute_membership(sources, keys, protein, radius)
    assert expected == {"mover": {41}, "site": {3, 19}}
    index = DiscoveryIndex.build(sources, protein)
    assert discover(sources, keys, protein, radius=radius, index=index) == expected
    assert discover(sources, keys, protein, radius=radius) == expected
    assert candidate_entries(sources, keys, radius=radius) == set(expected)


@pytest.mark.parametrize("radius", [6.0, 7.0, 8.0])
def test_multiple_coincident_current_centers_override_only_mover_positions(radius):
    sources = {
        "mover": graph({11: (-30.0, 0.0, 0.0), 97: (-29.0, 0.0, 0.0)}),
        "site": graph(
            {
                3: (100.0 + radius, -20.0, 3.0),
                7: (100.0 - radius, -20.0, 3.0),
                19: (100.0 + radius + 0.01, -20.0, 3.0),
            }
        ),
    }
    keys = {("mover", 11), ("mover", 97)}
    protein = {entry: set() for entry in sources}
    positions = {key: (100.0, -20.0, 3.0) for key in keys}
    expected = brute_membership(sources, keys, protein, radius, positions)
    assert expected == {"mover": {11, 97}, "site": {3, 7}}
    assert discover(sources, keys, protein, positions, radius) == expected
    # Candidate screening is spatial only; discovery separately forces movers.
    assert candidate_entries(sources, keys, positions, radius) == {"site"}


def test_exact_closure_expands_one_protein_residue_then_only_nonprotein_components():
    site = graph(
        {
            10: (1.0, 0.0, 0.0),
            30: (40.0, 0.0, 0.0),
            50: (50.0, 0.0, 0.0),
            70: (2.0, 0.0, 0.0),
            90: (100.0, 0.0, 0.0),
            110: (150.0, 0.0, 0.0),
        },
        [(10, 30), (30, 50), (70, 90), (90, 50), (50, 110)],
        {10: 1, 30: 1, 50: 2},
    )
    sources = {"mover": graph({1: (0.0, 0.0, 0.0)}), "site": site}
    protein, keys = {"mover": set(), "site": {10, 30, 50}}, {("mover", 1)}
    expected = brute_membership(sources, keys, protein, 3.0)
    assert expected == {"mover": {1}, "site": {10, 30, 70, 90}}
    assert discover(sources, keys, protein, radius=3.0) == expected


def test_covalent_halo_is_exactly_three_edges_before_residue_expansion():
    ids = [2, 8, 22, 41, 99, 150]
    source = graph(
        {atom_id: (float(i * 30), 0.0, 0.0) for i, atom_id in enumerate(ids)},
        list(pairwise(ids)),
        {atom_id: i + 1 for i, atom_id in enumerate(ids)},
    )
    sources, keys, protein = {"p": source}, {("p", 2)}, {"p": set(ids)}
    expected = brute_membership(sources, keys, protein, 0.1)
    assert expected == {"p": {2, 8, 22, 41}}
    assert discover(sources, keys, protein, radius=0.1) == expected


@pytest.mark.parametrize("seed", [3, 13, 37])
def test_random_small_graphs_match_full_pair_and_graph_oracle(seed):
    random = np.random.default_rng(seed)
    ids = [3 + 7 * i for i in range(40)]
    source = graph(
        dict(zip(ids, map(tuple, random.uniform(-20, 20, (40, 3))), strict=True)),
        [(ids[i], ids[i + 1]) for i in range(39) if i % 5 != 4],
        {atom_id: i // 4 + 1 for i, atom_id in enumerate(ids)},
    )
    sources, keys = {"scene": source}, {("scene", ids[2]), ("scene", ids[22])}
    protein = {"scene": set(ids[:16])}
    before = source.to_bytes()
    index = DiscoveryIndex.build(sources, protein)
    for radius in [6.0, 7.0, 8.0]:
        assert discover(sources, keys, protein, radius=radius, index=index) == brute_membership(
            sources, keys, protein, radius
        )
    assert source.to_bytes() == before


def test_induced_components_never_connect_through_an_omitted_bridge_or_cycle_vertex():
    source = graph(
        {
            2: (0.0, 0.0, 0.0),
            10: (1.0, 0.0, 0.0),
            20: (2.0, 0.0, 0.0),
            40: (1.0, 1.0, 0.0),
            99: (4.0, 0.0, 0.0),
        },
        [(2, 10), (10, 20), (20, 40), (40, 2)],
    )
    index = EntryDiscoveryIndex.build(source, set())
    assert list(index.induced_components({2, 20, 99})) == [{2}, {20}, {99}]
    assert list(index.induced_components({2, 10, 20, 99})) == [{2, 10, 20}, {99}]


def test_indexes_are_immutable_and_store_component_members_once_with_linear_adjacency():
    ids = list(range(1, 1001))
    source = graph({i: (float(i), 0.0, 0.0) for i in ids}, list(pairwise(ids)))
    index = EntryDiscoveryIndex.build(source, set())
    assert len(index.organic_components) == 1
    assert sum(map(len, index.organic_components)) == len(ids)
    assert set(index.organic_component.values()) == {0}
    assert len(index.organic_component) == len(ids)
    assert sum(map(len, index.adjacency.values())) == 2 * (len(ids) - 1)
    with pytest.raises(TypeError):
        index.rows[1] = 0
    with pytest.raises(TypeError):
        index.adjacency[1] = ()
    with pytest.raises(ValueError):
        index.coordinates[0] = (9.0, 9.0, 9.0)


def test_fresh_calls_observe_changes_and_reject_other_graphs_or_classifications():
    source = graph({11: (0.0, 0.0, 0.0), 47: (9.0, 0.0, 0.0)})
    sources, protein, keys = {"s": source}, {"s": set()}, {("s", 11)}
    index = DiscoveryIndex.build(sources, protein)
    assert discover(sources, keys, protein, radius=6.0, index=index) == {"s": {11}}
    with pytest.raises(ValueError, match="classification"):
        discover(sources, keys, {"s": {47}}, index=index)
    changed = graph({11: (0.0, 0.0, 0.0), 47: (6.0, 0.0, 0.0)}, [(11, 47)])
    with pytest.raises(ValueError, match="assembly"):
        discover({"s": changed}, keys, protein, index=index)
    assert discover({"s": changed}, keys, protein, radius=6.0) == {"s": {11, 47}}
    assert index.entries["s"].coordinates[1].tolist() == [9.0, 0.0, 0.0]


def test_unselected_zero_atom_entry_contributes_no_context():
    sources = {"mover": graph({11: (0.0, 0.0, 0.0)}), "empty": graph({})}
    keys, protein = {("mover", 11)}, {entry: set() for entry in sources}
    assert discover(sources, keys, protein) == {"mover": {11}}
    assert candidate_entries(sources, keys) == {"mover"}


def test_incident_index_reads_interpreted_arginine_orders_before_assigning_charge():
    source = protein_state_chain(("NALA", "ARG", "CALA"))
    before = source.to_bytes()
    observed = {atom.name: atom for atom in source.atoms if atom.residue_id == 2}
    assert observed["NH1"].formal_charge is None
    graph, _, _ = protein_graph(source)
    atoms = {atom.name: atom for atom in graph.atoms if atom.residue_id == 2}
    imine = next(
        bond
        for bond in graph.bonds
        if {bond.atom_1_id, bond.atom_2_id} == {atoms["CZ"].id, atoms["NH1"].id}
    )
    assert imine.order == 2
    assert atoms["NH1"].formal_charge == 1
    assert atoms["NH2"].formal_charge == 0
    assert source.to_bytes() == before


def test_discovery_and_candidate_screens_allocate_only_one_count_per_query_row(monkeypatch):
    native = quick_context.cKDTree
    calls = []

    class CountTree:
        def __init__(self, points):
            self.tree = native(points)

        def query_ball_point(self, points, radius, **kwargs):
            assert kwargs == {"eps": 0.0, "return_length": True}
            result = self.tree.query_ball_point(points, radius, **kwargs)
            assert result.ndim == 1 and result.dtype.kind in "iu"
            calls.append((len(points), len(result), int(result.sum())))
            return result

    monkeypatch.setattr(quick_context, "cKDTree", CountTree)
    sources = {
        "movers": graph({i: (0.0, 0.0, 0.0) for i in range(1, 65)}),
        "site": graph({i: (0.0, 0.0, 0.0) for i in range(1, 257)}),
    }
    keys = {("movers", i) for i in range(1, 65)}
    assert (
        sum(map(len, discover(sources, keys, {entry: set() for entry in sources}).values())) == 320
    )
    assert candidate_entries(sources, keys) == set(sources)
    assert calls == [(64, 64, 4096), (256, 256, 16384)] * 2


def test_isolation_indexes_the_final_projected_graph_and_jobs_do_not_share_snapshots():
    source = molecule("CC.CC")
    parameters, _ = quick_capture(source, [1], mode="isolated", expand_hydrogens=False)
    first = build_assembly({"entry": source}, parameters)
    second = build_assembly({"entry": source}, parameters)
    assert first.discovery_index is not None and second.discovery_index is not None
    index = first.discovery_index.entries["entry"]
    assert set(index.atom_ids) == set(first.modeled_atoms["entry"])
    assert len(index.atom_ids) < len(source.atoms)
    assert index.source is first.graphs["entry"]
    assert first.discovery_index is not second.discovery_index
    assert not np.shares_memory(
        index.coordinates, second.discovery_index.entries["entry"].coordinates
    )


def test_optimizer_rebuild_replaces_complete_discovery_and_helper_adjacency(
    tmp_path: Path, monkeypatch
):
    source = molecule("CC", explicit_h=False)
    points = list(source.active_coordinates)
    points[1] = tuple(value + 12 for value in points[0])
    source = source.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"coordinates": point})
                for atom, point in zip(source.atoms, points, strict=True)
            ],
            "conformers": [
                conformer.model_copy(update={"coordinates": points})
                for conformer in source.conformers
            ],
        }
    )
    sources = {
        "ligand": source,
        "site": translated(molecule("[Cl-]"), tuple(value + 1 for value in points[0])),
    }
    parameters, _ = environment_parameters(sources, {"ligand": [2]}, expand_hydrogens=False)
    assembly = build_assembly(sources, parameters)
    initial_index, initial_adjacency = assembly.discovery_index, assembly.temporary_adjacency
    native = quick_optimize.discover
    calls = []

    def checked(graphs, keys, protein, positions=None, radius=8.0, *, index=None):
        assert index is not None
        index.require_sources(graphs, protein)
        calls.append((radius, index))
        return native(graphs, keys, protein, positions, radius, index=index)

    monkeypatch.setattr(quick_optimize, "discover", checked)
    report, _ = quick_optimize.optimize(assembly, parameters, LocalContext(tmp_path))
    assert report.timings["context_rebuilds"] > 0
    assert assembly.discovery_index is not initial_index
    assert assembly.temporary_adjacency is not initial_adjacency
    assert {radius for radius, _ in calls} == {6.0, 7.0, 8.0}
    assert calls[-1][1] is assembly.discovery_index
    assert len({id(index) for _, index in calls}) > 1
    assert assembly.temporary_adjacency == tuple(
        frozenset(neighbor.GetIdx() for neighbor in atom.GetNeighbors())
        for atom in assembly.molecule.GetAtoms()
    )
    assert any(ref is None for ref in assembly.references)
