"""Observed standard-amino-acid connectivity, independent of calculation engines."""

from __future__ import annotations

from collections import Counter, defaultdict
from functools import lru_cache
from itertools import pairwise
from math import dist
from typing import Any

from rdkit import Chem

from neistra_core.modeling_metadata import modeling_metadata
from neistra_core.molecular import (
    Atom,
    Bond,
    InferenceRecord,
    MolecularWarning,
    NormalizedStructureV1,
    Residue,
)

CODES = dict(
    zip(
        ("ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL").split(),
        "ARNDCQEGHILKMFPSTWYV",
        strict=True,
    )
)


@lru_cache(maxsize=20)
def template(name: str) -> Any:
    """Return a read-only named template; callers must copy before modifying it."""
    mol = Chem.MolFromSequence(CODES[name])
    if name == "ILE":
        # Sequence atom names in the pinned library require the standard CG1-CD1 edge.
        indices = {a.GetPDBResidueInfo().GetName().strip(): a.GetIdx() for a in mol.GetAtoms()}
        if mol.GetBondBetweenAtoms(indices["CG2"], indices["CD1"]) is not None:
            rw = Chem.RWMol(mol)
            rw.RemoveBond(indices["CG2"], indices["CD1"])
            rw.AddBond(indices["CG1"], indices["CD1"], Chem.BondType.SINGLE)
            mol = rw.GetMol()
    return mol


def observed_residue_atoms(source: NormalizedStructureV1) -> dict[int, dict[str, Atom]]:
    """Match observed names/elements without completing missing atoms or alternate sites."""
    groups: dict[int | None, list[Atom]] = defaultdict(list)
    for atom in source.atoms:
        groups[atom.residue_id].append(atom)
    identities = Counter(
        (r.chain_id, r.source_subchain_id, r.author_number, r.insertion_code)
        for r in source.residues
    )
    result = {}
    for residue in source.residues:
        identity = (
            residue.chain_id,
            residue.source_subchain_id,
            residue.author_number,
            residue.insertion_code,
        )
        if residue.name not in CODES or identities[identity] != 1:
            continue
        group = groups[residue.id]
        names = {a.name: a for a in group}
        if len(names) != len(group) or any(a.alternate_location for a in group):
            continue
        expected = {
            a.GetPDBResidueInfo().GetName().strip(): a.GetSymbol()
            for a in template(residue.name).GetAtoms()
        }
        if any(names[n].element != element for n, element in expected.items() if n in names):
            continue
        if names:
            result[residue.id] = names
    return result


def sequence_neighbors(first: Residue, second: Residue) -> bool:
    """Require a single unambiguous sequence step within one chain/subchain."""
    if first.chain_id != second.chain_id or first.source_subchain_id != second.source_subchain_id:
        return False
    if first.label_number is not None or second.label_number is not None:
        return first.label_number is not None and second.label_number == first.label_number + 1
    return (
        first.author_number is not None
        and second.author_number == first.author_number + 1
        and not first.insertion_code
        and not second.insertion_code
    )


def peptide_entity_compatible(first: Residue, second: Residue) -> bool:
    """Known nonpolymer/entity boundaries veto import-only peptide inference."""
    if any(r.component_type in {"ligand", "water", "ion"} for r in (first, second)):
        return False
    if any(
        r.source_entity_type not in {None, "unknown", "polymer"}
        for r in (first, second)
    ):
        return False
    return not (
        first.source_entity_id is not None
        and second.source_entity_id is not None
        and first.source_entity_id != second.source_entity_id
    )


def infer_standard_connectivity(
    source: NormalizedStructureV1, *, break_after: frozenset[int] = frozenset()
) -> NormalizedStructureV1:
    """Import-only inference. Never call while reading or calculating existing entries."""
    observed = observed_residue_atoms(source)
    excluded = set(modeling_metadata(source).excluded_bonds)
    supplied = {tuple(sorted((b.atom_1_id, b.atom_2_id))) for b in source.bonds}
    candidates: set[tuple[int, int]] = set()
    for residue in source.residues:
        names = observed.get(residue.id)
        if names is None:
            continue
        for bond in template(residue.name).GetBonds():
            first, second = (
                a.GetPDBResidueInfo().GetName().strip()
                for a in (bond.GetBeginAtom(), bond.GetEndAtom())
            )
            if first in names and second in names:
                a, b = names[first].id, names[second].id
                candidates.add((min(a, b), max(a, b)))
    indices = {a.id: i for i, a in enumerate(source.atoms)}
    for first, second in pairwise(source.residues):
        if (
            first.id in break_after
            or not sequence_neighbors(first, second)
            or not peptide_entity_compatible(first, second)
        ):
            continue
        left, right = observed.get(first.id, {}), observed.get(second.id, {})
        if "C" not in left or "N" not in right:
            continue
        a, b = left["C"].id, right["N"].id
        if all(
            0.9 <= dist(c.coordinates[indices[a]], c.coordinates[indices[b]]) < 1.8
            for c in source.conformers
        ):
            candidates.add((min(a, b), max(a, b)))
    next_id = max((b.id for b in source.bonds), default=0) + 1
    additions = [
        Bond(id=next_id + i, atom_1_id=a, atom_2_id=b, order=None, inferred=True)
        for i, (a, b) in enumerate(sorted(candidates - supplied - excluded))
    ]
    warnings = [
        MolecularWarning(
            code="protein_connectivity_scope",
            message=(
                "Missing connectivity inference is limited to observed standard amino acids "
                "and conservative peptide links. Other supplied connections were retained; "
                "no atoms, ligand graphs, nucleic-acid bonds or metal coordination were inferred."
            ),
            operation="import",
            field="bonds",
            severity="info",
        )
    ]
    if not additions:
        return source.model_copy(update={"warnings": [*source.warnings, *warnings]})
    message = (
        f"Inferred {len(additions)} observed standard-protein connections; bond orders remain "
        "unknown. Atom identities, charges and coordinates were preserved."
    )
    return source.model_copy(
        update={
            "bonds": [*source.bonds, *additions],
            "warnings": [
                *source.warnings,
                MolecularWarning(
                    code="protein_connectivity_inferred",
                    message=message,
                    operation="import",
                    field="bonds",
                ),
                *warnings,
            ],
            "inferences": [
                *source.inferences,
                InferenceRecord(
                    code="standard_protein_connectivity_v1",
                    message=message,
                    atom_ids=sorted({i for b in additions for i in (b.atom_1_id, b.atom_2_id)}),
                    bond_ids=[b.id for b in additions],
                ),
            ],
        }
    )
