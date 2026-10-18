"""Match existing protein graphs to the checksum-locked AMBER residue libraries.

Names are calculation labels only. Matching never creates canonical atoms/bonds,
chooses protonation by pH, or accepts a partial residue/chain.
"""

from __future__ import annotations

import shlex
from dataclasses import dataclass
from pathlib import Path

from rdkit import Chem

from molweave_core.minimization.contracts import CalculationError
from molweave_core.molecular import NormalizedStructureV1

STATES: dict[str, tuple[str, ...]] = {
    name: (name,)
    for name in (
        "ALA",
        "ARG",
        "ASN",
        "GLN",
        "GLY",
        "ILE",
        "LEU",
        "MET",
        "PHE",
        "PRO",
        "SER",
        "THR",
        "TRP",
        "TYR",
        "VAL",
    )
}
STATES.update(
    {
        "ASP": ("ASP", "ASH"),
        "GLU": ("GLU", "GLH"),
        "CYS": ("CYS", "CYM"),
        "LYS": ("LYS", "LYN"),
        "HIS": ("HID", "HIE", "HIP"),
    }
)
for _state in ("ASH", "GLH", "CYM", "LYN", "HID", "HIE", "HIP"):
    STATES[_state] = (_state,)


@dataclass(frozen=True)
class ResidueTemplate:
    name: str
    atom_names: tuple[str, ...]
    elements: tuple[str, ...]
    bonds: frozenset[frozenset[int]]
    positions: tuple[tuple[float, float, float], ...]
    net_charge: int


@dataclass(frozen=True)
class MatchedResidue:
    template: ResidueTemplate
    # Canonical IDs in the template's native order, not source row order.
    atom_ids: tuple[int, ...]


def read_templates(prefix: Path) -> dict[str, ResidueTemplate]:
    sections: dict[tuple[str, str], list[list[str]]] = {}
    for filename in ("amino12.lib", "aminont12.lib", "aminoct12.lib", "solvents.lib"):
        key: tuple[str, str] | None = None
        for line in (prefix / "dat/leap/lib" / filename).read_text().splitlines():
            if line.startswith("!entry."):
                _, name, _, section = line.split(maxsplit=1)[0].split(".")
                key = (
                    (name, section)
                    if section in {"atoms", "connectivity", "positions"}
                    and (filename != "solvents.lib" or name == "TP3")
                    else None
                )
            elif key is not None:
                sections.setdefault(key, []).append(shlex.split(line))
    table = Chem.GetPeriodicTable()
    return {
        name: ResidueTemplate(
            name,
            tuple(a[0] for a in rows),
            tuple(table.GetElementSymbol(int(a[6])) if int(a[6]) > 0 else "" for a in rows),
            frozenset(
                frozenset((int(b[0]) - 1, int(b[1]) - 1))
                for b in sections.get((name, "connectivity"), [])
            ),
            tuple(
                (float(row[0]), float(row[1]), float(row[2])) for row in sections[name, "positions"]
            ),
            round(sum(float(a[7]) for a in rows)),
        )
        for (name, section), rows in sections.items()
        if section == "atoms"
    }


def match_protein_chain(
    structure: NormalizedStructureV1, templates: dict[str, ResidueTemplate]
) -> tuple[MatchedResidue, ...]:
    residues = {r.id: r for r in structure.residues}
    atoms = {a.id: a for a in structure.atoms}
    links: dict[int, int] = {}
    for bond in structure.bonds:
        first, second = atoms[bond.atom_1_id], atoms[bond.atom_2_id]
        if first.residue_id == second.residue_id:
            continue
        if first.name == "N" and second.name == "C":
            first, second = second, first
        if (
            (first.name, second.name) != ("C", "N")
            or first.residue_id is None
            or (second.residue_id is None)
            or first.residue_id in links
        ):
            raise CalculationError(
                "crosslink_unsupported", "Only ordinary peptide links are supported"
            )
        links[first.residue_id] = second.residue_id
    starts = set(residues) - set(links.values())
    if len(starts) != 1 or len(set(links.values())) != len(links):
        raise CalculationError("protein_topology", "Complete one unambiguous linear peptide chain")
    order = [starts.pop()]
    while order[-1] in links and links[order[-1]] not in order:
        order.append(links[order[-1]])
    if len(order) != len(residues) or len(order) < 2 or order[-1] in links:
        raise CalculationError(
            "protein_topology", "Complete peptide connectivity and both termini before minimization"
        )
    matched = []
    for index, residue_id in enumerate(order):
        residue = residues[residue_id]
        terminus = "N" if index == 0 else "C" if index == len(order) - 1 else ""
        candidates = []
        for state in STATES.get(residue.name, ()):
            template = templates.get(terminus + state)
            if template is None:
                continue
            by_name = {}
            for atom in atoms.values():
                if atom.residue_id == residue_id:
                    name = "H1" if terminus == "N" and atom.name == "H" else atom.name
                    if name in by_name:
                        raise CalculationError("protein_mapping", "Duplicate protein atom labels")
                    by_name[name] = atom
            if set(by_name) != set(template.atom_names):
                continue
            ordered = [by_name[name] for name in template.atom_names]
            if tuple(a.element for a in ordered) != template.elements:
                continue
            ids = tuple(a.id for a in ordered)
            position = {atom_id: i for i, atom_id in enumerate(ids)}
            bonds = frozenset(
                frozenset((position[b.atom_1_id], position[b.atom_2_id]))
                for b in structure.bonds
                if b.atom_1_id in position and b.atom_2_id in position
            )
            if bonds == template.bonds:
                candidates.append(MatchedResidue(template, ids))
        if len(candidates) != 1:
            raise CalculationError(
                "protein_template_missing",
                f"Residue {residue.id} ({residue.name}) needs complete, unambiguous standard "
                "atoms, explicit H, canonical connectivity and supported termini. Prepare it "
                "in a separate action; minimization does not repair chemistry.",
            )
        matched.append(candidates[0])
    return tuple(matched)
