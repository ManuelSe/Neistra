"""Observed-state expectations independent of quick template defaults.

Offline native-library fixtures supply named atoms and explicit hydrogen graphs,
not equilibrium coordinates. These tests qualify state interpretation and graph
identity; stretched synthetic chain coordinates are never accepted as a pose.
"""

from __future__ import annotations

import numpy as np
import pytest
from neistra_core.adapters.rdkit_common import normalized_to_mol
from neistra_core.minimization.assembly import project_atoms
from neistra_core.minimization.contracts import CalculationError
from neistra_core.minimization.quick_model import (
    QuickAssembly,
    build_assembly,
    validate_current_graph,
)
from neistra_core.minimization.quick_protein import cap_boundaries, protein_graph
from neistra_core.molecular import Bond

from tests.scientific.test_quick_minimization import unknown_sequence
from tests.support.minimization import protein_state_chain
from tests.unit.test_quick_minimization import quick_capture


def observed_state(state, swap_oxygen=False):
    source = protein_state_chain(("NALA", state, "CALA"))
    standard = {"HID": "HIS", "HIE": "HIS", "HIP": "HIS", "ASH": "ASP", "GLH": "GLU",
                "LYN": "LYS"}.get(state, state)
    updates = {"residues": [
        residue.model_copy(update={"name": standard}) if residue.id == 2 else residue
        for residue in source.residues
    ]}
    if swap_oxygen:
        first, second = ("OD1", "OD2") if standard == "ASP" else ("OE1", "OE2")
        updates["atoms"] = [
            atom.model_copy(update={"name": second if atom.name == first else first})
            if atom.residue_id == 2 and atom.name in {first, second} else atom
            for atom in source.atoms
        ]
    return source.model_copy(update=updates)


def names(source):
    return {atom.name: atom for atom in source.atoms if atom.residue_id == 2}


def has_h(source, atom_id):
    atoms = {atom.id: atom for atom in source.atoms}
    return sum(
        atoms[other].element == "H"
        for bond in source.bonds if atom_id in (bond.atom_1_id, bond.atom_2_id)
        for other in (bond.atom_1_id, bond.atom_2_id) if other != atom_id
    )


def edge(source, first, second):
    return next(bond for bond in source.bonds if {
        bond.atom_1_id, bond.atom_2_id
    } == {first, second})


def assert_literal(source, graph, before):
    assert source.to_bytes() == before
    assert [atom.id for atom in graph.atoms] == [atom.id for atom in source.atoms]
    assert {(bond.atom_1_id, bond.atom_2_id) for bond in graph.bonds} == {
        (bond.atom_1_id, bond.atom_2_id) for bond in source.bonds
    }
    assert graph.active_coordinates == source.active_coordinates
    atoms = {atom.id: atom for atom in graph.atoms}
    for atom in source.atoms:
        assert atoms[atom.id].model_dump(exclude={"formal_charge"}) == atom.model_dump(
            exclude={"formal_charge"}
        )
        if atom.formal_charge is not None:
            assert atoms[atom.id].formal_charge == atom.formal_charge
    for bond in source.bonds:
        if bond.order is not None:
            assert edge(graph, bond.atom_1_id, bond.atom_2_id) == bond


@pytest.mark.parametrize("state,swap", [
    ("HID", False), ("HIE", False), ("HIP", False),
    ("ASH", False), ("ASH", True), ("GLH", False), ("GLH", True),
    ("LYN", False), ("LYS", False),
])
def test_nine_supplied_states_preserve_observed_hydrogens_without_default_conflicts(state, swap):
    source = observed_state(state, swap)
    before = source.to_bytes()
    graph, _, _ = protein_graph(source)
    observed, resolved = names(source), names(graph)
    if state in {"HID", "HIE", "HIP"}:
        delta, epsilon = (1, 0) if state == "HID" else (0, 1) if state == "HIE" else (1, 1)
        assert has_h(graph, resolved["ND1"].id) == delta
        assert has_h(graph, resolved["NE2"].id) == epsilon
        assert resolved["ND1"].formal_charge == (1 if state == "HIP" else 0)
        assert resolved["NE2"].formal_charge == 0
    elif state in {"ASH", "GLH"}:
        center, first, second = ("CG", "OD1", "OD2") if state == "ASH" else ("CD", "OE1", "OE2")
        protonated = first if swap else second
        carbonyl = second if swap else first
        assert has_h(source, observed[protonated].id) == 1
        assert has_h(graph, resolved[protonated].id) == 1
        assert edge(graph, resolved[center].id, resolved[protonated].id).order == 1
        assert edge(graph, resolved[center].id, resolved[carbonyl].id).order == 2
        assert resolved[first].formal_charge == resolved[second].formal_charge == 0
    else:
        assert has_h(graph, resolved["NZ"].id) == (2 if state == "LYN" else 3)
        assert resolved["NZ"].formal_charge == (0 if state == "LYN" else 1)
    assert_literal(source, graph, before)
    parameters, _ = quick_capture(source, allow_repair=False)
    assembly = build_assembly({"entry": source}, parameters)
    assert set(assembly.modes) == {"MMFF94"}
    validate_current_graph(assembly)
    assert source.to_bytes() == before


@pytest.mark.parametrize("state", ["HIP", "ASP", "GLU"])
def test_coherent_supplied_charge_alternatives_do_not_receive_a_second_default_charge(state):
    source = observed_state(state)
    group = names(source)
    if state == "HIP":
        assigned, unknown = "NE2", "ND1"
        source = source.model_copy(update={"atoms": [
            atom.model_copy(update={"formal_charge": 1}) if atom.id == group[assigned].id else atom
            for atom in source.atoms
        ]})
        expected = 1
    else:
        center, assigned, unknown = ("CG", "OD1", "OD2") if state == "ASP" else ("CD", "OE1", "OE2")
        source = source.model_copy(update={
            "atoms": [
                atom.model_copy(update={"formal_charge": -1})
                if atom.id == group[assigned].id else atom for atom in source.atoms
            ],
            "bonds": [
                bond.model_copy(update={"order": 1})
                if {bond.atom_1_id, bond.atom_2_id} == {group[center].id, group[assigned].id}
                else bond.model_copy(update={"order": 2})
                if {bond.atom_1_id, bond.atom_2_id} == {group[center].id, group[unknown].id}
                else bond for bond in source.bonds
            ],
        })
        expected = -1
    before = source.to_bytes()
    graph, _, _ = protein_graph(source)
    resolved = names(graph)
    assert resolved[assigned].formal_charge == expected
    assert resolved[unknown].formal_charge == 0
    assert_literal(source, graph, before)
    parameters, _ = quick_capture(source, allow_repair=False)
    assembly = build_assembly({"entry": source}, parameters)
    assert set(assembly.modes) == {"MMFF94"}
    validate_current_graph(assembly)


@pytest.mark.parametrize("conflict", ["acid_double", "acid_negative", "histidine_double_charge"])
def test_conflicting_assigned_states_are_preserved_and_refused_or_explicitly_repaired(conflict):
    source = observed_state("HIP" if conflict == "histidine_double_charge" else "ASH")
    group = names(source)
    if conflict == "acid_double":
        target = edge(source, group["CG"].id, group["OD2"].id).id
        source = source.model_copy(update={"bonds": [
            bond.model_copy(update={"order": 2}) if bond.id == target else bond
            for bond in source.bonds
        ]})
    else:
        targets = {group["OD2"].id} if conflict == "acid_negative" else {
            group["ND1"].id, group["NE2"].id,
        }
        source = source.model_copy(update={"atoms": [
            atom.model_copy(update={"formal_charge": -1 if conflict == "acid_negative" else 1})
            if atom.id in targets else atom for atom in source.atoms
        ]})
    before = source.to_bytes()
    graph, _, _ = protein_graph(source)
    assert_literal(source, graph, before)
    strict, _ = quick_capture(source, allow_repair=False)
    with pytest.raises(CalculationError) as error:
        build_assembly({"entry": source}, strict)
    assert error.value.code == "chemistry_unresolved"
    approximate, _ = quick_capture(source, allow_repair=True)
    assembly = build_assembly({"entry": source}, approximate)
    assert "repair" in assembly.modes
    assert any("Approximate repair" in warning for warning in assembly.warnings)
    validate_current_graph(assembly)
    assert source.to_bytes() == before


@pytest.mark.parametrize("present", [True, False])
def test_explicit_disulfide_order_resolves_but_a_deleted_disulfide_stays_deleted(present):
    source = unknown_sequence("CC")
    sulfurs = [atom.id for atom in source.atoms if atom.name == "SG"]
    if present:
        source = source.model_copy(update={"bonds": [*source.bonds, Bond(
            id=max(bond.id for bond in source.bonds) + 1,
            atom_1_id=sulfurs[0], atom_2_id=sulfurs[1], order=None,
        )]})
    before = source.to_bytes()
    graph, _, _ = protein_graph(source)
    assert_literal(source, graph, before)
    if present:
        assert edge(graph, *sulfurs).order == 1
    else:
        assert not any({bond.atom_1_id, bond.atom_2_id} == set(sulfurs) for bond in graph.bonds)
    parameters, _ = quick_capture(source, allow_repair=False)
    assembly = build_assembly({"entry": source}, parameters)
    assert set(assembly.modes) == {"MMFF94"}
    validate_current_graph(assembly)
    for sulfur in sulfurs:
        index = assembly.references.index(("entry", sulfur))
        hydrogen_neighbors = sum(
            neighbor.GetAtomicNum() == 1
            for neighbor in assembly.molecule.GetAtomWithIdx(index).GetNeighbors()
        )
        assert hydrogen_neighbors == (0 if present else 1)
    assert source.to_bytes() == before


@pytest.mark.parametrize("author,explicit_h,expected", [
    (1, False, 1), (20, False, 0), (20, True, 1),
])
def test_n_terminus_charge_requires_start_evidence(author, explicit_h, expected):
    source = protein_state_chain(("NALA",)) if explicit_h else unknown_sequence("A")
    source = source.model_copy(update={"residues": [
        residue.model_copy(update={"name": "ALA", "author_number": author})
        for residue in source.residues
    ]})
    before = source.to_bytes()
    nitrogen = next(atom.id for atom in source.atoms if atom.name == "N")
    if explicit_h:
        assert has_h(source, nitrogen) == 3
    graph, _, _ = protein_graph(source)
    assert next(atom.formal_charge for atom in graph.atoms if atom.id == nitrogen) == expected
    assert_literal(source, graph, before)
    # A supplied charge is retained even when the default or observed H would
    # suggest a different one; later chemistry validation owns contradiction.
    supplied = source.model_copy(update={"atoms": [
        atom.model_copy(update={"formal_charge": 0}) if atom.id == nitrogen else atom
        for atom in source.atoms
    ]})
    graph, _, _ = protein_graph(supplied)
    assert next(atom.formal_charge for atom in graph.atoms if atom.id == nitrogen) == 0
    assert_literal(supplied, graph, supplied.to_bytes())


@pytest.mark.parametrize("left,right,groups,helpers", [
    (True, True, 2, 5), (False, True, 1, 2), (True, False, 1, 3), (False, False, 0, 0),
])
def test_boundary_caps_follow_only_retained_peptide_edges_at_exact_observed_positions(
    left, right, groups, helpers,
):
    source = unknown_sequence("AAA")
    residues = {residue: {
        atom.name: atom for atom in source.atoms if atom.residue_id == residue
    } for residue in (1, 2, 3)}
    left_edge = edge(source, residues[1]["C"].id, residues[2]["N"].id).id
    right_edge = edge(source, residues[2]["C"].id, residues[3]["N"].id).id
    source = source.model_copy(update={"bonds": [
        bond for bond in source.bonds
        if (left or bond.id != left_edge) and (right or bond.id != right_edge)
    ]})
    before = source.to_bytes()
    graph, protein, _ = protein_graph(source)
    members = {atom.id for atom in source.atoms if atom.residue_id == 2}
    projected = project_atoms(graph, members)
    molecule = normalized_to_mol(projected)
    capped, count = cap_boundaries(molecule, graph, members, protein)
    assert count == groups
    assert capped.GetNumAtoms() - len(projected.atoms) == helpers
    expected = [
        *([residues[1][name].coordinates for name in ("C", "O", "CA")] if left else []),
        *([residues[3][name].coordinates for name in ("N", "CA")] if right else []),
    ]
    positions = np.asarray(capped.GetConformer().GetPositions())
    assert np.array_equal(positions[:len(projected.atoms)], projected.active_coordinates)
    assert sorted(map(tuple, positions[len(projected.atoms):])) == sorted(expected)
    # Each connected helper group has exactly one canonical anchor. Neither
    # direct nor helper-mediated paths recreate a removed canonical connection.
    references = [("entry", atom.id) for atom in projected.atoms] + [None] * helpers
    assembly = QuickAssembly(capped, references, [], {"entry": source}, {"entry": sorted(members)})
    validate_current_graph(assembly)
    remaining = set(range(len(projected.atoms), capped.GetNumAtoms()))
    actual_groups = 0
    while remaining:
        pending = [remaining.pop()]
        anchors, found = set(), set()
        while pending:
            index = pending.pop()
            found.add(index)
            for neighbor in capped.GetAtomWithIdx(index).GetNeighbors():
                other = neighbor.GetIdx()
                if other < len(projected.atoms):
                    anchors.add(references[other][1])
                elif other in remaining:
                    remaining.remove(other)
                    pending.append(other)
        assert len(anchors) == 1
        anchor = next(iter(anchors))
        assert all(
            bond.GetBondTypeAsDouble() == 1 for bond in capped.GetBonds()
            if (bond.GetBeginAtomIdx() in found) != (bond.GetEndAtomIdx() in found)
        )
        if anchor == residues[2]["N"].id:
            assert left and len(found) == 3
            assert sorted(capped.GetAtomWithIdx(index).GetSymbol() for index in found) == [
                "C", "C", "O",
            ]
            assert sorted(bond.GetBondTypeAsDouble() for bond in capped.GetBonds() if {
                bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
            } <= found) == [1, 2]
        else:
            assert anchor == residues[2]["C"].id and right and len(found) == 2
            assert sorted(capped.GetAtomWithIdx(index).GetSymbol() for index in found) == ["C", "N"]
        actual_groups += 1
    assert actual_groups == groups
    assert_literal(source, graph, before)
