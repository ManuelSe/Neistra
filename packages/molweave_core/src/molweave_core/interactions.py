"""Read-only, bounded interaction-v1 analysis in the workspace Cartesian frame.

Atom identity and chemistry come from normalized inputs, never viewer projections.
Template connectivity is an analysis assumption and cannot modify those inputs.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from importlib.resources import files
from typing import Literal
from xml.etree import ElementTree

import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from rdkit import Chem
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.molecular import Atom, NormalizedStructureV1

InteractionType = Literal[
    "clash", "hydrogen_bond", "hydrophobic", "pi_pi", "cation_pi", "salt_bridge"
]
TYPES: tuple[InteractionType, ...] = (
    "clash",
    "hydrogen_bond",
    "hydrophobic",
    "pi_pi",
    "cation_pi",
    "salt_bridge",
)
CANONICAL = frozenset(
    "ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL".split()
)


class AtomIdentity(BaseModel):
    model_config = ConfigDict(frozen=True)
    structure_id: str
    atom_id: int


class InteractionInputIdentity(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entry_id: str
    artifact_id: str


class InteractionRecord(BaseModel):
    kind: InteractionType
    scope: Literal["intra", "inter"]
    participants: list[list[AtomIdentity]]
    endpoints: list[tuple[float, float, float]]
    geometry: dict[str, float]


class InteractionWarning(BaseModel):
    entry_id: str
    code: str
    message: str
    atom_ids: list[int] = Field(default_factory=list)


class InteractionCoverage(BaseModel):
    status: Literal["complete", "partial", "unavailable"]
    assessed_atoms: int
    skipped_atoms: int


class InteractionResult(BaseModel):
    profile: Literal["interaction-v1"] = "interaction-v1"
    frame: Literal["workspace-cartesian"] = "workspace-cartesian"
    inputs: list[InteractionInputIdentity]
    records: list[InteractionRecord]
    coverage: dict[InteractionType, InteractionCoverage]
    warnings: list[InteractionWarning]
    candidate_comparisons: int


@dataclass(frozen=True)
class AnalysisInput:
    identity: InteractionInputIdentity
    structure: NormalizedStructureV1


@dataclass(frozen=True)
class AnalysisLimits:
    atoms: int = 100_000
    candidates: int = 1_000_000
    records: int = 20_000


class InteractionLimitError(ValueError):
    """No partial result may be published after a resource bound is exceeded."""


@dataclass
class Site:
    reference: AtomIdentity
    atom: Atom
    point: np.ndarray
    molecule: str
    safe_connectivity: bool
    radius: float | None
    neighbors: set[int] = field(default_factory=set)


def _template_bonds() -> dict[str, list[tuple[str, str]]]:
    # Public packaged OpenMM definitions, pinned by uv.lock. No private API.
    root = ElementTree.fromstring(files("openmm.app").joinpath("data/residues.xml").read_text())
    return {
        residue.attrib["name"]: [(bond.attrib["from"], bond.attrib["to"]) for bond in residue]
        for residue in root
        if residue.attrib["name"] in CANONICAL
    }


def _sites(inputs: list[AnalysisInput]) -> tuple[list[Site], list[InteractionWarning]]:
    result: list[Site] = []
    warnings: list[InteractionWarning] = []
    templates = _template_bonds()
    periodic = Chem.GetPeriodicTable()
    for source in inputs:
        structure, entry = source.structure, source.identity.entry_id
        residues = {residue.id: residue for residue in structure.residues}
        by_residue: dict[int | None, list[Atom]] = defaultdict(list)
        for atom in structure.atoms:
            by_residue[atom.residue_id].append(atom)
        ambiguous = {
            residue_id
            for residue_id, atoms in by_residue.items()
            if any(atom.alternate_location for atom in atoms)
            or len({atom.name for atom in atoms}) != len(atoms)
        }
        # Names need not be unique in a residue-less ligand graph.
        ambiguous.discard(None)
        adjacency: dict[int, set[int]] = {atom.id: set() for atom in structure.atoms}
        for bond in structure.bonds:
            adjacency[bond.atom_1_id].add(bond.atom_2_id)
            adjacency[bond.atom_2_id].add(bond.atom_1_id)
        templated: set[int] = set()
        incomplete: set[int] = set()
        for residue_id, atoms in by_residue.items():
            residue = residues.get(residue_id) if residue_id is not None else None
            if residue_id in ambiguous:
                warnings.append(
                    InteractionWarning(
                        entry_id=entry,
                        code="alternate_or_duplicate_sites",
                        message=(
                            "Resolve alternate locations or duplicate residue atom names before "
                            "analysis."
                        ),
                        atom_ids=[atom.id for atom in atoms],
                    )
                )
                continue
            if residue and residue.name in templates and residue.component_type == "polymer":
                names = {atom.name: atom for atom in atoms}
                expected: set[str] = set()
                for first, second in templates[residue.name]:
                    if first.startswith(("-", "+")) or second.startswith(("-", "+")):
                        continue
                    expected.update((first, second))
                    if first in names and second in names:
                        adjacency[names[first].id].add(names[second].id)
                        adjacency[names[second].id].add(names[first].id)
                for atom in atoms:
                    if atom.name in expected:
                        templated.add(atom.id)
                    else:
                        incomplete.add(atom.id)
            elif structure.source.format.lower() in {"pdb", "mmcif", "cif", "xyz"}:
                incomplete.update(atom.id for atom in atoms)
        if templated:
            warnings.append(
                InteractionWarning(
                    entry_id=entry,
                    code="protein_template_connectivity",
                    message=(
                        "Observed canonical protein atoms use analysis-only OpenMM "
                        "connectivity; missing atoms and chain breaks are not rebuilt."
                    ),
                )
            )
        # Molecule unions use connectivity and source identity, never proximity.
        parent = {atom.id: atom.id for atom in structure.atoms}

        def root(atom_id: int, parent: dict[int, int] = parent) -> int:
            while parent[atom_id] != atom_id:
                parent[atom_id] = parent[parent[atom_id]]
                atom_id = parent[atom_id]
            return atom_id

        def union(first: int, second: int, parent: dict[int, int] = parent) -> None:
            a, b = root(first), root(second)
            parent[max(a, b)] = min(a, b)

        instances: dict[tuple[object, ...], int] = {}
        for atom in structure.atoms:
            residue = residues.get(atom.residue_id) if atom.residue_id is not None else None
            if residue:
                key = (
                    ("polymer", residue.chain_id, residue.source_subchain_id)
                    if residue.component_type == "polymer"
                    else ("residue", residue.id)
                )
                if key in instances:
                    union(instances[key], atom.id)
                else:
                    instances[key] = atom.id
        for atom_id, neighbors in adjacency.items():
            for neighbor in neighbors:
                union(atom_id, neighbor)
        # Missing inter-residue peptide edges make within-polymer exclusions unsafe.
        polymer_roots = {
            root(atom.id)
            for atom in structure.atoms
            if atom.residue_id in residues and residues[atom.residue_id].component_type == "polymer"
        }
        unsafe_roots = {root(atom_id) for atom_id in incomplete} | polymer_roots
        ambiguous_roots = {
            root(atom.id) for atom in structure.atoms if atom.residue_id in ambiguous
        }
        local: dict[int, int] = {}
        for atom, point in zip(structure.atoms, structure.active_coordinates, strict=True):
            if not np.isfinite(point).all():
                raise ValueError("Interaction coordinates must be finite")
            if root(atom.id) in ambiguous_roots:
                continue
            try:
                number = periodic.GetAtomicNumber(atom.element)
                radius = float(periodic.GetRvdw(number)) if number > 0 else None
            except RuntimeError:
                radius = None
            # Metals have coordination chemistry, not generic vdW clash semantics.
            if atom.element not in {
                "H",
                "B",
                "C",
                "N",
                "O",
                "F",
                "P",
                "S",
                "Cl",
                "Br",
                "I",
                "Si",
                "Se",
            }:
                radius = None
            local[atom.id] = len(result)
            result.append(
                Site(
                    AtomIdentity(structure_id=entry, atom_id=atom.id),
                    atom,
                    np.asarray(point, dtype=float),
                    f"{entry}:{root(atom.id)}",
                    root(atom.id) not in unsafe_roots,
                    radius,
                )
            )
        for atom_id, index in local.items():
            result[index].neighbors = {
                local[neighbor] for neighbor in adjacency[atom_id] if neighbor in local
            }
        if unsafe_roots:
            warnings.append(
                InteractionWarning(
                    entry_id=entry,
                    code="incomplete_connectivity",
                    message=(
                        "Within-molecule clashes are skipped where complete covalent "
                        "exclusions cannot be established; supported intermolecular element "
                        "contacts remain assessable."
                    ),
                )
            )
        if any(site.radius is None for site in result if site.reference.structure_id == entry):
            warnings.append(
                InteractionWarning(
                    entry_id=entry,
                    code="unsupported_element",
                    message=(
                        "Unknown elements and metal coordination are excluded from generic "
                        "clash analysis."
                    ),
                )
            )
    return result, warnings


def _local_neighbors(sites: list[Site], start: int, depth: int = 3) -> set[int]:
    visited, frontier = {start}, {start}
    for _ in range(depth):
        frontier = {neighbor for index in frontier for neighbor in sites[index].neighbors} - visited
        visited.update(frontier)
    return visited


def analyze_interactions(
    inputs: list[AnalysisInput], limits: AnalysisLimits = AnalysisLimits()
) -> InteractionResult:
    inputs = sorted(inputs, key=lambda source: source.identity.entry_id)
    if sum(len(source.structure.atoms) for source in inputs) > limits.atoms:
        raise InteractionLimitError("Interaction atom limit exceeded (100,000)")
    sites, warnings = _sites(inputs)
    records: list[InteractionRecord] = []
    comparisons = 0
    if sites:
        coordinates = np.asarray([site.point for site in sites])
        tree = cKDTree(coordinates)
        radius = max((site.radius or 0 for site in sites), default=0) * 2
        for first, site in enumerate(sites):
            # Count before allocating a neighbor list: dense inputs remain bounded.
            count = int(tree.query_ball_point(site.point, radius, return_length=True))
            if comparisons + count > limits.candidates:
                raise InteractionLimitError("Interaction candidate limit exceeded (1,000,000)")
            comparisons += count
            excluded = _local_neighbors(sites, first)
            for second in sorted(tree.query_ball_point(site.point, radius)):
                if second <= first or second in excluded:
                    continue
                other = sites[second]
                intra = site.molecule == other.molecule
                if intra and not (site.safe_connectivity and other.safe_connectivity):
                    continue
                if site.radius is None or other.radius is None:
                    continue
                distance = float(np.linalg.norm(site.point - other.point))
                overlap = site.radius + other.radius - distance
                if overlap < 0.4 - 1e-9:
                    continue
                if len(records) >= limits.records:
                    raise InteractionLimitError("Interaction result limit exceeded (20,000)")
                records.append(
                    InteractionRecord(
                        kind="clash",
                        scope="intra" if intra else "inter",
                        participants=[[site.reference], [other.reference]],
                        endpoints=[tuple(site.point), tuple(other.point)],
                        geometry={"distance": distance, "overlap": overlap},
                    )
                )
    assessed = sum(site.radius is not None for site in sites)
    total = sum(len(source.structure.atoms) for source in inputs)
    coverage = {
        kind: InteractionCoverage(status="unavailable", assessed_atoms=0, skipped_atoms=total)
        for kind in TYPES
    }
    coverage["clash"] = InteractionCoverage(
        status="partial" if warnings else "complete",
        assessed_atoms=assessed,
        skipped_atoms=total - assessed,
    )
    records.sort(
        key=lambda record: (
            record.kind,
            record.scope,
            tuple(
                (ref.structure_id, ref.atom_id) for group in record.participants for ref in group
            ),
        )
    )
    return InteractionResult(
        inputs=sorted(
            [source.identity for source in inputs], key=lambda identity: identity.entry_id
        ),
        records=records,
        coverage=coverage,
        warnings=warnings,
        candidate_comparisons=comparisons,
    )
