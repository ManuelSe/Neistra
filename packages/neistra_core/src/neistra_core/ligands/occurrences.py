"""Entry-local occurrence summaries, independent of durable instance identity.

The caller supplies a complete current inventory and its prepared chemistry. Raw
source assessment, when supplied, must describe that same verified current input.
Native molecules are temporary and are never retained in the resulting summary.
"""

from __future__ import annotations

import math
import time
from collections import Counter, defaultdict
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Literal

from rdkit import Chem, rdBase

from neistra_core.ligands.chemistry import MAX_DEPICTION_ATOMS, PreparedLigandChemistry
from neistra_core.ligands.models import LigandCandidateV1, LigandInventoryV1
from neistra_core.ligands.source_evidence import MmcifSourceInventory
from neistra_core.molecular import NormalizedStructureV1

OCCURRENCE_POLICY = "ligand-occurrence-v1"
OccurrenceBasis = Literal["qualified_representation_v1", "verified_source_entity_v1"]


@dataclass(frozen=True)
class OccurrenceCount:
    count: int | None
    basis: OccurrenceBasis | None
    reason: str | None

    def __post_init__(self) -> None:
        if self.count is None:
            if self.basis is not None or not self.reason:
                raise ValueError("Unavailable occurrence counts require a reason and no basis")
        elif type(self.count) is not int or self.count < 1 or not self.basis or self.reason:
            raise ValueError("Known occurrence counts require a positive count and explicit basis")


@dataclass(frozen=True)
class OccurrenceLimits:
    max_candidates: int
    max_total_atoms: int
    max_candidate_atoms: int = MAX_DEPICTION_ATOMS

    def __post_init__(self) -> None:
        if any(type(value) is not int or value < 1 for value in (
            self.max_candidates, self.max_total_atoms, self.max_candidate_atoms,
        )):
            raise ValueError("Occurrence work limits must be positive integers")


@dataclass(frozen=True)
class OccurrenceIndex:
    by_candidate: Mapping[str, OccurrenceCount]
    default: OccurrenceCount
    potential_candidates: int
    potential_atoms: int
    qualified_candidates: int
    complete: bool
    chemical_complete: bool
    policy: str = OCCURRENCE_POLICY

    def for_candidate(self, candidate_key: str) -> OccurrenceCount:
        return self.by_candidate.get(candidate_key, self.default)


def _unavailable(reason: str) -> OccurrenceCount:
    return OccurrenceCount(None, None, reason)


def qualified_representation_key(molecule: Any) -> str:
    """Canonical strict graph representation; source IDs and coordinates are absent.

    Qualified total attached-H semantics are retained without treating explicit
    H-count/implicit-H bookkeeping as chemical identity. Explicit H graph nodes
    remain untouched. No hydrogen addition/removal or chemistry is performed.
    """
    if molecule is None or molecule.GetNumAtoms() == 0:
        raise ValueError("occurrence_representation_incomplete")
    if molecule.GetStereoGroups():
        raise ValueError("occurrence_enhanced_stereochemistry_unsupported")
    if Chem.GetMolSubstanceGroups(molecule):
        raise ValueError("occurrence_structural_groups_unsupported")
    native = Chem.Mol(molecule)
    native.RemoveAllConformers()
    atom_stereo = {
        Chem.ChiralType.CHI_UNSPECIFIED,
        Chem.ChiralType.CHI_TETRAHEDRAL_CW,
        Chem.ChiralType.CHI_TETRAHEDRAL_CCW,
    }
    for atom in native.GetAtoms():
        if atom.GetAtomicNum() <= 0 or atom.HasQuery():
            raise ValueError("occurrence_query_or_dummy_unsupported")
        if atom.GetChiralTag() not in atom_stereo:
            raise ValueError("occurrence_stereochemistry_unsupported")
        atom.SetAtomMapNum(0)
    bond_types = {
        Chem.BondType.SINGLE, Chem.BondType.DOUBLE, Chem.BondType.TRIPLE, Chem.BondType.AROMATIC,
    }
    bond_stereo = {
        Chem.BondStereo.STEREONONE, Chem.BondStereo.STEREOE, Chem.BondStereo.STEREOZ,
        Chem.BondStereo.STEREOCIS, Chem.BondStereo.STEREOTRANS,
    }
    for bond in native.GetBonds():
        if bond.HasQuery() or bond.GetBondType() not in bond_types:
            raise ValueError("occurrence_bond_representation_unsupported")
        if bond.GetStereo() not in bond_stereo or bond.GetBondDir() in {
            Chem.BondDir.UNKNOWN, Chem.BondDir.EITHERDOUBLE,
        }:
            raise ValueError("occurrence_stereochemistry_unsupported")
    parameters: Any = Chem.SmilesWriteParams()
    parameters.canonical = True
    parameters.doIsomericSmiles = True
    parameters.allHsExplicit = True
    parameters.allBondsExplicit = True
    parameters.ignoreAtomMapNumbers = False
    parameters.cleanStereo = False
    text = Chem.MolToCXSmiles(native, parameters, Chem.CXSmilesFields.CX_RADICALS)
    if not text:
        raise ValueError("occurrence_representation_incomplete")
    return f"{OCCURRENCE_POLICY}:{rdBase.rdkitVersion}:{text}"


def _source_counts(
    structure: NormalizedStructureV1,
    inventory: LigandInventoryV1,
    source: MmcifSourceInventory | None,
) -> dict[str, OccurrenceCount]:
    if source is None or source.status != "qualified" \
            or structure.source.format.lower() not in {"mmcif", "cif"}:
        return {}
    residue_members: dict[int, set[int]] = defaultdict(set)
    for atom in structure.atoms:
        if atom.residue_id is not None:
            residue_members[atom.residue_id].add(atom.id)
    candidates_by_residue: dict[int, list[LigandCandidateV1]] = defaultdict(list)
    for candidate in inventory.candidates:
        for identity in candidate.residue_ids:
            candidates_by_residue[identity].append(candidate)
    entities: dict[str, list[str]] = defaultdict(list)
    invalid: set[str] = set()
    for residue_id, (asym, entity) in source.nonpolymer_residues.items():
        matching = candidates_by_residue.get(residue_id, [])
        if len(matching) != 1 or len(matching[0].residue_ids) != 1 \
                or set(matching[0].atom_ids) != residue_members.get(residue_id):
            invalid.add(entity)
            continue
        if not asym or not entity:
            invalid.add(entity)
            continue
        # Each complete canonical residue is an independently verified source
        # occurrence. An asymmetry may contain multiple such occurrences.
        entities[entity].append(matching[0].candidate_key)
    return {
        key: OccurrenceCount(len(keys), "verified_source_entity_v1", None)
        for entity, keys in entities.items() if entity not in invalid
        for key in keys
    }


def build_occurrence_index(
    structure: NormalizedStructureV1,
    inventory: LigandInventoryV1,
    prepared: PreparedLigandChemistry,
    *,
    limits: OccurrenceLimits,
    source_inventory: MmcifSourceInventory | None = None,
    deadline: float | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> OccurrenceIndex:
    """Count a complete admitted entry, never a visible page or a lower bound.

    The deadline is polled between operations; it is not a hard per-library-call
    deadline. The service owns resource admission and retained-summary capacity.
    """
    if deadline is not None and not math.isfinite(deadline):
        raise ValueError("Occurrence deadline must be finite")
    potential: list[LigandCandidateV1] = []
    potential_count = 0
    atom_count = 0
    qualified = 0

    def result(
        values: dict[str, OccurrenceCount], reason: str,
        *, complete: bool = False, chemical_complete: bool = False,
    ) -> OccurrenceIndex:
        return OccurrenceIndex(
            MappingProxyType(dict(values)), _unavailable(reason), potential_count, atom_count,
            qualified, complete, chemical_complete,
        )

    for candidate in inventory.candidates:
        if candidate.potential_ligand and candidate.boundary_status != "ineligible":
            potential_count += 1
            atom_count += len(candidate.atom_ids)
            if potential_count <= limits.max_candidates:
                potential.append(candidate)
    if potential_count > limits.max_candidates:
        return result({}, "occurrence_candidate_limit")
    if not potential:
        return result({}, "occurrence_not_applicable", complete=True)
    members = [identity for candidate in inventory.candidates for identity in candidate.atom_ids]
    if len(set(members)) != len(members) or set(members) != {atom.id for atom in structure.atoms} \
            or len({candidate.candidate_key for candidate in inventory.candidates}) \
            != len(inventory.candidates):
        return result({}, "occurrence_inventory_incomplete")
    if deadline is not None and clock() >= deadline:
        return result({}, "occurrence_work_limit")
    source_counts = _source_counts(structure, inventory, source_inventory)
    known = {candidate.candidate_key: source_counts[candidate.candidate_key]
             for candidate in potential if candidate.candidate_key in source_counts}
    if deadline is not None and clock() >= deadline:
        return result({}, "occurrence_work_limit")
    if len(known) == len(potential):
        return result(known, "occurrence_not_applicable", complete=True)
    if atom_count > limits.max_total_atoms or any(
        len(candidate.atom_ids) > limits.max_candidate_atoms for candidate in potential
    ):
        return result(known, "occurrence_atom_limit")
    if any(not candidate.selectable for candidate in potential):
        return result(known, "occurrence_inventory_unqualified")
    signatures: dict[str, str] = {}
    try:
        for candidate in potential:
            if deadline is not None and clock() >= deadline:
                return result(known, "occurrence_work_limit")
            chemistry = prepared.qualify(candidate.atom_ids)
            qualified += 1
            if chemistry.status != "qualified":
                return result(known, "occurrence_inventory_unqualified")
            signatures[candidate.candidate_key] = qualified_representation_key(chemistry.molecule)
            if deadline is not None and clock() >= deadline:
                return result(known, "occurrence_work_limit")
    except (ValueError, RuntimeError, OverflowError) as error:
        reason = str(error) if isinstance(error, ValueError) else ""
        return result(known, reason if reason.startswith("occurrence_") and reason.isidentifier()
                      else "occurrence_representation_unqualified")
    counts = Counter(signatures.values())
    for key, signature in signatures.items():
        known.setdefault(
            key, OccurrenceCount(counts[signature], "qualified_representation_v1", None),
        )
    return result(known, "occurrence_not_applicable", complete=True, chemical_complete=True)
