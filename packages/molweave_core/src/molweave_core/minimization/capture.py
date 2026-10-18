"""Cheap canonical membership closure used before immutable job capture."""

from __future__ import annotations

from molweave_core.minimization.contracts import CalculationError
from molweave_core.molecular import NormalizedStructureV1


def complete_membership(source: NormalizedStructureV1, seeds: set[int]) -> set[int]:
    adjacency: dict[int, set[int]] = {a.id: set() for a in source.atoms}
    for bond in source.bonds:
        adjacency[bond.atom_1_id].add(bond.atom_2_id)
        adjacency[bond.atom_2_id].add(bond.atom_1_id)
    if not seeds <= adjacency.keys():
        raise CalculationError(
            "atom_missing", "A selected/context atom is missing; refresh the source"
        )
    # Whole chain membership also exposes sparse/missing canonical peptide bonds to
    # worker preflight. Display-inferred bonds never become calculation topology.
    chain_by_residue = {r.id: r.chain_id for r in source.residues if r.component_type == "polymer"}
    chain_atoms: dict[int, set[int]] = {}
    chain_by_atom = {}
    for atom in source.atoms:
        if atom.residue_id in chain_by_residue:
            chain = chain_by_residue[atom.residue_id]
            chain_atoms.setdefault(chain, set()).add(atom.id)
            chain_by_atom[atom.id] = chain
    pending = list(seeds)
    reached = set(seeds)
    expanded_chains = set()
    while pending:
        current = pending.pop()
        neighbors = adjacency[current]
        context_chain = chain_by_atom.get(current)
        if context_chain is not None and context_chain not in expanded_chains:
            expanded_chains.add(context_chain)
            neighbors = neighbors | chain_atoms[context_chain]
        for atom_id in neighbors - reached:
            reached.add(atom_id)
            pending.append(atom_id)
        if len(reached) > 20_000:
            raise CalculationError("assembly_limit", "Complete calculation exceeds 20000 atoms")
    return reached
