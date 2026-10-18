"""Reject supplied protein chemistry inconsistent with a matched standard state.

Unknown fields remain unknown in the project; the explicit-H template establishes
only the calculation state. Resonance encodings can be equivalent without changing
canonical labels.
"""

from __future__ import annotations

from itertools import pairwise

from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.templates import MatchedResidue
from molweave_core.molecular import NormalizedStructureV1

AROMATIC_PATHS = {
    "PHE": ("CG CD1 CE1 CZ CE2 CD2 CG",),
    "TYR": ("CG CD1 CE1 CZ CE2 CD2 CG",),
    "HID": ("CG ND1 CE1 NE2 CD2 CG",),
    "HIE": ("CG ND1 CE1 NE2 CD2 CG",),
    "HIP": ("CG ND1 CE1 NE2 CD2 CG",),
    "TRP": ("CG CD1 NE1 CE2 CD2 CG", "CD2 CE3 CZ3 CH2 CZ2 CE2 CD2"),
}


def validate_protein_chemistry(
    structure: NormalizedStructureV1, matched: tuple[MatchedResidue, ...]
) -> None:
    atoms = {a.id: a for a in structure.atoms}
    known = {
        frozenset((b.atom_1_id, b.atom_2_id)): b.order
        for b in structure.bonds
        if b.order is not None
    }
    expected_orders: dict[frozenset[int], set[float]] = {}
    for residue in matched:
        template = residue.template
        state = template.name[-3:]
        by_name = dict(zip(template.atom_names, residue.atom_ids, strict=True))
        for pair in template.bonds:
            expected_orders[frozenset(residue.atom_ids[i] for i in pair)] = {1.0}

        def order(
            names: tuple[str, str], allowed: set[float], by_name: dict[str, int] = by_name
        ) -> None:
            if all(n in by_name for n in names):
                expected_orders[frozenset(by_name[n] for n in names)] = allowed

        terminal = template.name.startswith("C") and len(template.name) == 4
        resonance_groups: list[list[tuple[str, str]]] = []
        order(("C", "O"), {1.0, 2.0} if terminal else {2.0})
        order(("C", "OXT"), {1.0, 2.0})
        charged_sites: dict[str, int] = {}
        if template.name.startswith("N") and len(template.name) == 4:
            charged_sites["N"] = 1
        if terminal:
            charged_sites.update({"O": -1, "OXT": -1})
            resonance_groups.append([("C", "O"), ("C", "OXT")])
        if state in {"ASP", "GLU"}:
            center, first, second = ("CG", "OD1", "OD2") if state == "ASP" else ("CD", "OE1", "OE2")
            order((center, first), {1.0, 2.0})
            order((center, second), {1.0, 2.0})
            charged_sites.update({first: -1, second: -1})
            resonance_groups.append([(center, first), (center, second)])
        elif state in {"ASN", "ASH"}:
            order(("CG", "OD1"), {2.0})
        elif state in {"GLN", "GLH"}:
            order(("CD", "OE1"), {2.0})
        elif state == "ARG":
            resonance_groups.append([("CZ", n) for n in ("NE", "NH1", "NH2")])
            for name in ("NE", "NH1", "NH2"):
                order(("CZ", name), {1.0, 2.0})
                charged_sites[name] = 1
        elif state == "LYS":
            charged_sites["NZ"] = 1
        elif state == "CYM":
            charged_sites["SG"] = -1
        elif state == "HIP":
            charged_sites.update({"ND1": 1, "NE2": 1})
        aromatic = set()
        for path in AROMATIC_PATHS.get(state, ()):
            labels = path.split()
            for first, second in pairwise(labels):
                order((first, second), {1.0, 1.5, 2.0})
                aromatic.add(frozenset((by_name[first], by_name[second])))
        possible_charges = {0}
        for name, atom_id in by_name.items():
            charge = atoms[atom_id].formal_charge
            if charge is not None and charge not in {0, charged_sites.get(name, 0)}:
                raise CalculationError(
                    "protein_chemistry_conflict",
                    "Assigned protein formal charge conflicts with the explicit-H template state",
                )
            choices = {charge} if charge is not None else {0, charged_sites.get(name, 0)}
            possible_charges = {a + b for a in possible_charges for b in choices}
        if template.net_charge not in possible_charges:
            raise CalculationError(
                "protein_chemistry_conflict",
                "Assigned net charge conflicts with the template state",
            )
        for group in resonance_groups:
            pairs = [frozenset(by_name[n] for n in names) for names in group]
            if all(p in known for p in pairs) and sum(known[p] for p in pairs) != len(pairs) + 1:
                raise CalculationError(
                    "protein_chemistry_conflict",
                    "Assigned resonance orders conflict with the template",
                )
        if aromatic and aromatic <= known.keys():
            orders = [known[pair] for pair in aromatic]
            double_count = 2 if state in {"HID", "HIE", "HIP"} else 4 if state == "TRP" else 3
            if not (
                all(v == 1.5 for v in orders)
                or (all(v in {1.0, 2.0} for v in orders) and orders.count(2.0) == double_count)
            ):
                raise CalculationError(
                    "protein_chemistry_conflict",
                    "Assigned aromatic orders conflict with the standard protein template",
                )
    for bond in structure.bonds:
        pair = frozenset((bond.atom_1_id, bond.atom_2_id))
        allowed = expected_orders.get(pair, {1.0})  # ordinary inter-residue peptide link
        if bond.order is not None and bond.order not in allowed:
            raise CalculationError(
                "protein_chemistry_conflict",
                "Assigned protein bond order conflicts with the matched standard template",
            )
