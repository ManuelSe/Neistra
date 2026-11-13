"""Observed standard-residue templates and disposable peptide boundary caps."""

from __future__ import annotations

from collections import defaultdict
from itertools import pairwise
from typing import Any

import numpy as np
from rdkit import Chem

from neistra_core.minimization.contracts import CalculationError
from neistra_core.molecular import Atom, MolecularWarning, NormalizedStructureV1
from neistra_core.protein_connectivity import CODES as CODES
from neistra_core.protein_connectivity import sequence_neighbors
from neistra_core.protein_connectivity import template as template


def protein_graph(
    source: NormalizedStructureV1,
) -> tuple[NormalizedStructureV1, set[int], dict[int, str]]:
    """Interpret existing edges and states only; the current endpoint graph is exact."""
    groups = defaultdict(list)
    for atom in source.atoms:
        groups[atom.residue_id].append(atom)
    bonds = {frozenset((b.atom_1_id, b.atom_2_id)): b for b in source.bonds}
    atoms = {a.id: a for a in source.atoms}
    protein: set[int] = set()
    assumptions = {}
    diagnostics: dict[int, set[tuple[int, int]]] = defaultdict(set)

    def link(first: int, second: int, order: float) -> None:
        key = frozenset((first, second))
        existing = bonds.get(key)
        if existing is not None:
            if existing.order is None:
                resolved = 1.5 if existing.aromatic else order
                bonds[key] = existing.model_copy(
                    update={"order": resolved, "aromatic": resolved == 1.5}
                )

    for residue in source.residues:
        if residue.name not in CODES:
            continue
        group = groups[residue.id]
        names = {a.name: a for a in group}
        if len(names) != len(group):
            continue  # handled as an unsupported component, never resolve duplicate sites
        t = template(residue.name)
        expected = {a.GetPDBResidueInfo().GetName().strip(): a for a in t.GetAtoms()}
        heavy = set(expected) - {"OXT"}
        if not heavy <= names.keys() or any(
            names[n].element != expected[n].GetSymbol() for n in heavy
        ):
            continue
        protein.update(a.id for a in group)
        for b in t.GetBonds():
            a, c = (
                x.GetPDBResidueInfo().GetName().strip() for x in (b.GetBeginAtom(), b.GetEndAtom())
            )
            if a in names and c in names:
                edge = frozenset((names[a].id, names[c].id))
                if edge not in bonds:
                    diagnostics[residue.id].add(
                        (min(names[a].id, names[c].id), max(names[a].id, names[c].id))
                    )
                link(names[a].id, names[c].id, b.GetBondTypeAsDouble())
        for b in source.bonds:
            if b.atom_1_id in {a.id for a in group} and b.atom_2_id in {a.id for a in group}:
                if atoms[b.atom_1_id].element == "H" or atoms[b.atom_2_id].element == "H":
                    link(b.atom_1_id, b.atom_2_id, 1.0)
        defaults = {"ASP": {"OD2": -1}, "GLU": {"OE2": -1}, "LYS": {"NZ": 1}, "ARG": {"NH1": 1}}
        for name, a in names.items():
            if a.formal_charge is not None:
                continue
            charge = -1 if name == "OXT" else defaults.get(residue.name, {}).get(name, 0)
            # Observed acid H is stronger evidence than a default deprotonated state.
            if charge == -1 and any(
                atoms[j].element == "H"
                for b in bonds.values()
                if a.id in (b.atom_1_id, b.atom_2_id)
                for j in (b.atom_1_id, b.atom_2_id)
                if j != a.id
            ):
                charge = 0
            if charge == 1:
                adjacent = [b for b in bonds.values() if a.id in (b.atom_1_id, b.atom_2_id)]
                supplied_h = any(
                    atoms[j].element == "H"
                    for b in adjacent
                    for j in (b.atom_1_id, b.atom_2_id)
                    if j != a.id
                )
                if supplied_h:
                    charge = int(sum(b.order or 1 for b in adjacent) >= 4)
            atoms[a.id] = a.model_copy(update={"formal_charge": charge})
        # Charge an observed protonated N terminus; no new terminus at a missing segment.
        n = names.get("N")
        if n and n.formal_charge is None:
            degree = sum(n.id in (b.atom_1_id, b.atom_2_id) for b in bonds.values())
            supplied_h = any(
                atoms[j].element == "H"
                for b in bonds.values()
                if n.id in (b.atom_1_id, b.atom_2_id)
                for j in (b.atom_1_id, b.atom_2_id)
                if j != n.id
            )
            first = next(
                (
                    r
                    for r in source.residues
                    if r.chain_id == residue.chain_id
                    and r.source_subchain_id == residue.source_subchain_id
                ),
                None,
            )
            has_previous = any(
                atoms[j].name == "C" and atoms[j].residue_id != residue.id
                for b in bonds.values()
                if n.id in (b.atom_1_id, b.atom_2_id)
                for j in (b.atom_1_id, b.atom_2_id)
                if j != n.id
            )
            established_start = (
                first == residue
                and residue.author_number == 1
                and not supplied_h
                and not has_previous
            )
            if degree >= 4 or established_start:
                atoms[n.id] = atoms[n.id].model_copy(update={"formal_charge": 1})
        delta, epsilon = names.get("ND1"), names.get("NE2")
        if residue.name == "HIS" and delta and epsilon and delta.formal_charge is None:

            def has_h(atom_id: int) -> bool:
                return any(
                    atoms[j].element == "H"
                    for b in bonds.values()
                    if atom_id in (b.atom_1_id, b.atom_2_id)
                    for j in (b.atom_1_id, b.atom_2_id)
                    if j != atom_id
                )

            if has_h(delta.id) and has_h(epsilon.id):
                atoms[delta.id] = atoms[delta.id].model_copy(update={"formal_charge": 1})
        assumptions[residue.id] = (
            f"Residue {residue.id} {residue.name}: observed standard template; "
            "missing states use ASP/GLU-, LYS/ARG+, neutral CYS/TYR and epsilon-H HIS; "
            "no pH prediction"
        )
    for first, second in pairwise(source.residues):
        if (
            first.chain_id != second.chain_id
            or first.source_subchain_id != second.source_subchain_id
        ):
            continue
        a = {x.name: x for x in groups[first.id]}
        b = {x.name: x for x in groups[second.id]}
        if not {"C", "CA"} <= a.keys() or "N" not in b:
            continue
        if a["C"].id in protein and b["N"].id in protein and sequence_neighbors(first, second):
            edge = frozenset((a["C"].id, b["N"].id))
            if edge not in bonds:
                diagnostics[second.id].add((min(a["C"].id, b["N"].id), max(a["C"].id, b["N"].id)))
            link(a["C"].id, b["N"].id, 1.0)
    for bond in list(bonds.values()):
        if bond.order is None and all(
            atoms[i].name == "SG" and i in protein for i in (bond.atom_1_id, bond.atom_2_id)
        ):
            link(bond.atom_1_id, bond.atom_2_id, 1.0)
    return (
        source.model_copy(
            update={
                "atoms": [atoms[a.id] for a in source.atoms],
                "bonds": sorted(bonds.values(), key=lambda b: b.id),
                "warnings": [
                    *source.warnings,
                    *[
                        MolecularWarning(
                            code="quick_current_connectivity",
                            message=(
                                f"Residue {residue_id}: {len(edges)} observed template connections "
                                "are absent from the current graph and remain absent. "
                                "The local calculation follows stored connectivity; "
                                "use explicit bond editing to change it."
                            ),
                            operation="coordinates.quick_minimize",
                            field=f"residues.{residue_id}",
                        )
                        for residue_id, edges in sorted(diagnostics.items())
                    ],
                ],
            }
        ),
        protein,
        assumptions,
    )


def cap_boundaries(
    mol: Any, source: NormalizedStructureV1, members: set[int], protein: set[int]
) -> tuple[Any, int]:
    """Use observed adjacent peptide atom positions for fixed ACE/NME helpers."""
    atoms = {a.id: a for a in source.atoms}
    index = {a.id: i for i, a in enumerate(a for a in source.atoms if a.id in members)}
    groups: dict[int | None, dict[str, Atom]] = defaultdict(dict)
    for a in source.atoms:
        groups[a.residue_id][a.name] = a
    rw = Chem.RWMol(mol)
    positions = list(mol.GetConformer().GetPositions())
    count = 0
    for bond in source.bonds:
        first, second = bond.atom_1_id, bond.atom_2_id
        if (first in members) == (second in members):
            continue
        inside, outside = (first, second) if first in members else (second, first)
        if (
            inside not in protein
            or outside not in protein
            or {atoms[inside].name, atoms[outside].name} != {"C", "N"}
        ):
            raise CalculationError(
                "boundary_unsupported", "Local covalent boundary is not a supported peptide cut"
            )
        group = groups[atoms[outside].residue_id]
        names = ["C", "O", "CA"] if atoms[outside].name == "C" else ["N", "CA"]
        if not set(names) <= group.keys():
            raise CalculationError(
                "boundary_incomplete", "Observed peptide atoms needed for boundary cap are missing"
            )
        added = {}
        for name in names:
            a = group[name]
            rd = Chem.Atom(a.element)
            rd.SetFormalCharge(0)
            added[name] = rw.AddAtom(rd)
            positions.append(np.asarray(a.coordinates))
        if names[0] == "C":
            rw.AddBond(added["C"], added["O"], Chem.BondType.DOUBLE)
            rw.AddBond(added["C"], added["CA"], Chem.BondType.SINGLE)
            rw.AddBond(index[inside], added["C"], Chem.BondType.SINGLE)
        else:
            rw.AddBond(added["N"], added["CA"], Chem.BondType.SINGLE)
            rw.AddBond(index[inside], added["N"], Chem.BondType.SINGLE)
        count += 1
    result = rw.GetMol()
    conformer = Chem.Conformer(len(positions))
    for i, p in enumerate(positions):
        conformer.SetAtomPosition(i, tuple(float(v) for v in p))
    result.RemoveAllConformers()
    result.AddConformer(conformer)
    # Neutral epsilon tautomer when absent H gives no supplied alternative evidence.
    for a in result.GetAtoms():
        info = a.GetPDBResidueInfo()
        if (
            info
            and info.GetResidueName() == "HIS"
            and info.GetName().strip() == "NE2"
            and not any(n.GetAtomicNum() == 1 for n in a.GetNeighbors())
            and not any(
                other.GetPDBResidueInfo()
                and other.GetPDBResidueInfo().GetResidueNumber() == info.GetResidueNumber()
                and other.GetPDBResidueInfo().GetChainId() == info.GetChainId()
                and other.GetPDBResidueInfo().GetName().strip() in {"ND1", "NE2"}
                and other.GetAtomicNum() == 7
                and any(n.GetAtomicNum() == 1 for n in other.GetNeighbors())
                for other in result.GetAtoms()
            )
        ):
            a.SetNumExplicitHs(1)
    return result, count
