"""Read-only, bounded interaction-v1 analysis in the workspace Cartesian frame.

Atom identity and chemistry come from normalized inputs, never viewer projections.
Template connectivity is an analysis assumption and cannot modify those inputs.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from importlib.resources import files
from itertools import pairwise
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
        if any(warning.code == "missing_coordinates" for warning in structure.warnings):
            warnings.append(
                InteractionWarning(
                    entry_id=entry,
                    code="missing_coordinates",
                    message="Coordinates are missing; this input is not assessable.",
                )
            )
            continue
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
        incomplete_residues: set[int] = set()
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
                heavy = {name for name in expected if not name.startswith("H") and name != "OXT"}
                if not heavy.issubset(names) or any(
                    names[name].element != name[0] for name in heavy if name in names
                ):
                    incomplete_residues.add(residue.id)
            elif structure.source.format.lower() in {"pdb", "mmcif", "cif", "xyz"}:
                incomplete.update(atom.id for atom in atoms)
        polymers: dict[tuple[int, str | None], list[int]] = defaultdict(list)
        for residue in structure.residues:
            if residue.component_type == "polymer":
                polymers[(residue.chain_id, residue.source_subchain_id)].append(residue.id)
        inferred_peptides = 0
        for residue_ids in polymers.values():
            for previous_id, current_id in pairwise(residue_ids):
                previous, current = residues[previous_id], residues[current_id]
                a = {atom.name: atom for atom in by_residue[previous_id]}
                b = {atom.name: atom for atom in by_residue[current_id]}
                if (
                    "C" not in a
                    or "N" not in b
                    or previous_id in ambiguous
                    or current_id in ambiguous
                ):
                    incomplete_residues.update((previous_id, current_id))
                    continue
                if b["N"].id in adjacency[a["C"].id]:
                    continue
                label_contiguous = (
                    previous.label_number is not None
                    and current.label_number == previous.label_number + 1
                )
                author_contiguous = (
                    previous.author_number is not None
                    and current.author_number == previous.author_number + 1
                    and not previous.insertion_code
                    and not current.insertion_code
                )
                if (
                    previous.name in templates
                    and current.name in templates
                    and (label_contiguous or author_contiguous)
                ):
                    adjacency[a["C"].id].add(b["N"].id)
                    adjacency[b["N"].id].add(a["C"].id)
                    inferred_peptides += 1
                else:
                    incomplete_residues.update((previous_id, current_id))
        if inferred_peptides:
            warnings.append(
                InteractionWarning(
                    entry_id=entry,
                    code="protein_template_peptide_links",
                    message=(
                        "Consecutive source residues in the same polymer instance use "
                        "analysis-only peptide connectivity; no distance-based molecule "
                        "splitting is performed."
                    ),
                )
            )
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
            if residue and structure.source.format.lower() in {"pdb", "mmcif", "cif"}:
                key = (
                    ("polymer", residue.chain_id, residue.source_subchain_id)
                    if residue.component_type == "polymer"
                    else ("residue", residue.id)
                )
                if key in instances:
                    union(instances[key], atom.id)
                else:
                    instances[key] = atom.id
            elif structure.source.format.lower() == "xyz":
                # XYZ supplies no molecular boundaries; guessed bonds cannot make
                # disconnected fragments defensible intermolecular instances.
                if instances:
                    union(next(iter(instances.values())), atom.id)
                else:
                    instances[("unresolved_xyz",)] = atom.id
        for atom_id, neighbors in adjacency.items():
            for neighbor in neighbors:
                union(atom_id, neighbor)
        # Missing template atoms or uncertain peptide links make exclusions unsafe.
        polymer_roots = {
            root(atom.id) for atom in structure.atoms if atom.residue_id in incomplete_residues
        }
        unsafe_roots = {root(atom_id) for atom_id in incomplete} | polymer_roots
        ambiguous_roots = {
            root(atom.id) for atom in structure.atoms if atom.residue_id in ambiguous
        }
        atom_lookup = {atom.id: atom for atom in structure.atoms}
        for bond in structure.bonds:
            first_atom, second_atom = atom_lookup[bond.atom_1_id], atom_lookup[bond.atom_2_id]
            if first_atom.residue_id == second_atom.residue_id or bond.order is not None:
                continue
            a_residue, b_residue = (
                residues.get(first_atom.residue_id or -1),
                residues.get(second_atom.residue_id or -1),
            )
            canonical_link = (
                a_residue is not None
                and b_residue is not None
                and a_residue.name in CANONICAL
                and b_residue.name in CANONICAL
                and (
                    set((first_atom.name, second_atom.name)) == {"C", "N"}
                    or (a_residue.name == b_residue.name == "CYS"
                    and first_atom.name == second_atom.name == "SG")
                )
            )
            if not canonical_link:
                ambiguous_roots.update((root(first_atom.id), root(second_atom.id)))
        if ambiguous_roots:
            warnings.append(
                InteractionWarning(
                    entry_id=entry,
                    code="ambiguous_molecular_scope",
                    message=(
                        "Alternate sites or links without unambiguous covalent evidence "
                        "prevent molecular scope assignment; affected groups are skipped."
                    ),
                )
            )
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


def angle(first: np.ndarray, vertex: np.ndarray, last: np.ndarray) -> float | None:
    a, b = first - vertex, last - vertex
    norm = float(np.linalg.norm(a) * np.linalg.norm(b))
    if norm < 1e-12:
        return None
    return float(np.degrees(np.arccos(np.clip(np.dot(a, b) / norm, -1, 1))))


@dataclass
class CandidateBudget:
    limits: AnalysisLimits
    comparisons: int = 0

    def neighbors(self, tree: cKDTree, point: np.ndarray, radius: float) -> list[int]:
        count = int(tree.query_ball_point(point, radius, return_length=True))
        if self.comparisons + count > self.limits.candidates:
            raise InteractionLimitError("Interaction candidate limit exceeded (1,000,000)")
        self.comparisons += count
        return sorted(tree.query_ball_point(point, radius))


def add_record(
    records: list[InteractionRecord],
    limits: AnalysisLimits,
    sites: list[Site],
    kind: InteractionType,
    groups: list[list[int]],
    geometry: dict[str, float],
    endpoints: list[tuple[float, float, float]] | None = None,
) -> None:
    if len(records) >= limits.records:
        raise InteractionLimitError("Interaction result limit exceeded (20,000)")
    first, second = sites[groups[0][0]], sites[groups[1][0]]
    records.append(
        InteractionRecord(
            kind=kind,
            scope="intra" if first.molecule == second.molecule else "inter",
            participants=[[sites[index].reference for index in group] for group in groups],
            endpoints=endpoints or [tuple(first.point), tuple(second.point)],
            geometry=geometry,
        )
    )


def analyze_interactions(
    inputs: list[AnalysisInput], limits: AnalysisLimits = AnalysisLimits()
) -> InteractionResult:
    inputs = sorted(inputs, key=lambda source: source.identity.entry_id)
    if sum(len(source.structure.atoms) for source in inputs) > limits.atoms:
        raise InteractionLimitError("Interaction atom limit exceeded (100,000)")
    sites, warnings = _sites(inputs)
    from molweave_core.interaction_chemistry import type_sites

    chemistry = type_sites(inputs, sites, warnings)
    from molweave_core.interaction_groups import interaction_groups

    rings, charges = interaction_groups(chemistry, sites, warnings)
    records: list[InteractionRecord] = []
    budget = CandidateBudget(limits)
    hydrogen_contacts: set[tuple[int, int]] = set()
    undefined_geometry: set[str] = set()
    acceptors = sorted(chemistry.acceptors)
    if acceptors:
        tree = cKDTree(np.asarray([sites[index].point for index in acceptors]))
        for donor, hydrogens in sorted(chemistry.donors.items()):
            excluded = _local_neighbors(sites, donor)
            for candidate in budget.neighbors(tree, sites[donor].point, 3.5):
                acceptor = acceptors[candidate]
                if acceptor in excluded:
                    continue
                donor_distance = float(np.linalg.norm(sites[donor].point - sites[acceptor].point))
                for hydrogen in hydrogens:
                    distance = float(np.linalg.norm(sites[hydrogen].point - sites[acceptor].point))
                    donor_angle = angle(
                        sites[donor].point, sites[hydrogen].point, sites[acceptor].point
                    )
                    bases = [
                        neighbor
                        for neighbor in sites[acceptor].neighbors
                        if sites[neighbor].atom.element != "H"
                    ]
                    base_angles = [
                        angle(sites[hydrogen].point, sites[acceptor].point, sites[base].point)
                        for base in bases
                    ]
                    if donor_angle is None or any(value is None for value in base_angles):
                        undefined_geometry.add(sites[donor].reference.structure_id)
                    if (
                        distance > 2.5 + 1e-9
                        or donor_angle is None
                        or donor_angle < 130 - 1e-9
                        or any(value is None or value < 90 - 1e-9 for value in base_angles)
                    ):
                        continue
                    geometry = {
                        "distance": distance,
                        "donor_acceptor_distance": donor_distance,
                        "donor_angle": donor_angle,
                    }
                    if base_angles:
                        geometry["acceptor_angle"] = min(
                            value for value in base_angles if value is not None
                        )
                    add_record(
                        records,
                        limits,
                        sites,
                        "hydrogen_bond",
                        [[hydrogen, donor], [acceptor]],
                        geometry,
                        [tuple(sites[hydrogen].point), tuple(sites[acceptor].point)],
                    )
                    hydrogen_contacts.update(
                        (
                            (min(hydrogen, acceptor), max(hydrogen, acceptor)),
                            (min(donor, acceptor), max(donor, acceptor)),
                        )
                    )
    for entry in sorted(undefined_geometry):
        warnings.append(
            InteractionWarning(
                entry_id=entry,
                code="undefined_hbond_geometry",
                message=(
                    "Degenerate required hydrogen-bond angles are unassessable; "
                    "affected contacts are skipped."
                ),
            )
        )
    if rings:
        ring_tree = cKDTree(np.asarray([ring.center for ring in rings]))
        for first, ring in enumerate(rings):
            for second in budget.neighbors(ring_tree, ring.center, 5.5):
                if second <= first or set(ring.atoms).intersection(rings[second].atoms):
                    continue
                other_ring = rings[second]
                vector = other_ring.center - ring.center
                distance = float(np.linalg.norm(vector))
                plane_angle = float(
                    np.degrees(
                        np.arccos(np.clip(abs(np.dot(ring.normal, other_ring.normal)), 0, 1))
                    )
                )
                offsets = [
                    float(np.linalg.norm(vector - np.dot(vector, normal) * normal))
                    for normal in (ring.normal, other_ring.normal)
                ]
                parallel = plane_angle <= 30 + 1e-9 and max(offsets) <= 2 + 1e-9
                perpendicular = plane_angle >= 60 - 1e-9 and min(offsets) <= 2 + 1e-9
                if parallel or perpendicular:
                    add_record(
                        records,
                        limits,
                        sites,
                        "pi_pi",
                        [ring.atoms, other_ring.atoms],
                        {
                            "distance": distance,
                            "plane_angle": plane_angle,
                            "offset_1": offsets[0],
                            "offset_2": offsets[1],
                        },
                        [tuple(ring.center), tuple(other_ring.center)],
                    )
        for charge in charges:
            if charge.charge <= 0:
                continue
            for candidate in budget.neighbors(ring_tree, charge.center, 6.0):
                ring = rings[candidate]
                if set(charge.atoms).intersection(ring.atoms):
                    continue
                vector = charge.center - ring.center
                distance = float(np.linalg.norm(vector))
                if distance < 1e-12:
                    continue
                normal_angle = float(
                    np.degrees(
                        np.arccos(np.clip(abs(np.dot(vector, ring.normal)) / distance, 0, 1))
                    )
                )
                offset = float(np.linalg.norm(vector - np.dot(vector, ring.normal) * ring.normal))
                if offset <= 2 + 1e-9 and normal_angle <= 30 + 1e-9:
                    add_record(
                        records,
                        limits,
                        sites,
                        "cation_pi",
                        [charge.atoms, ring.atoms],
                        {
                            "distance": distance,
                            "normal_angle": normal_angle,
                            "offset": offset,
                            "charge": float(charge.charge),
                        },
                        [tuple(charge.center), tuple(ring.center)],
                    )
    # Index charge-bearing atoms, not group centers: elongated charge groups must
    # retain the specified nearest-site criterion without unbounded all-pairs.
    if charges:
        charge_sites = [
            (owner, index) for owner, group in enumerate(charges) for index in group.atoms
        ]
        charge_tree = cKDTree(np.asarray([sites[index].point for _, index in charge_sites]))
        emitted: set[tuple[int, int]] = set()
        for owner, index in charge_sites:
            for candidate in budget.neighbors(charge_tree, sites[index].point, 4.5):
                second, _ = charge_sites[candidate]
                pair = (min(owner, second), max(owner, second))
                if (
                    owner == second
                    or pair in emitted
                    or charges[owner].charge * charges[second].charge >= 0
                ):
                    continue
                a, b = charges[pair[0]], charges[pair[1]]
                if any(
                    other in _local_neighbors(sites, atom) for atom in a.atoms for other in b.atoms
                ):
                    continue
                distance = min(
                    float(np.linalg.norm(sites[atom].point - sites[other].point))
                    for atom in a.atoms
                    for other in b.atoms
                )
                emitted.add(pair)
                add_record(
                    records,
                    limits,
                    sites,
                    "salt_bridge",
                    [a.atoms, b.atoms],
                    {
                        "distance": distance,
                        "charge_1": float(a.charge),
                        "charge_2": float(b.charge),
                    },
                    [tuple(a.center), tuple(b.center)],
                )
    if sites:
        coordinates = np.asarray([site.point for site in sites])
        tree = cKDTree(coordinates)
        radius = max(4.0, max((site.radius or 0 for site in sites), default=0) * 2)
        for first, site in enumerate(sites):
            # Count before allocating a neighbor list: dense inputs remain bounded.
            excluded = _local_neighbors(sites, first)
            for second in budget.neighbors(tree, site.point, radius):
                if second <= first or second in excluded:
                    continue
                other = sites[second]
                intra = site.molecule == other.molecule
                distance = float(np.linalg.norm(site.point - other.point))
                if (
                    first in chemistry.hydrophobic
                    and second in chemistry.hydrophobic
                    and distance <= 4.0 + 1e-9
                ):
                    add_record(
                        records,
                        limits,
                        sites,
                        "hydrophobic",
                        [[first], [second]],
                        {"distance": distance},
                    )
                if intra and not (site.safe_connectivity and other.safe_connectivity):
                    continue
                if site.radius is None or other.radius is None:
                    continue
                if (first, second) in hydrogen_contacts:
                    continue
                overlap = site.radius + other.radius - distance
                if overlap < 0.4 - 1e-9:
                    continue
                add_record(
                    records,
                    limits,
                    sites,
                    "clash",
                    [[first], [second]],
                    {"distance": distance, "overlap": overlap},
                )
    assessed = sum(site.radius is not None for site in sites)
    total = sum(len(source.structure.atoms) for source in inputs)
    coverage = {
        kind: InteractionCoverage(status="unavailable", assessed_atoms=0, skipped_atoms=total)
        for kind in TYPES
    }
    coverage["clash"] = InteractionCoverage(
        status="unavailable" if not assessed else "partial" if warnings else "complete",
        assessed_atoms=assessed,
        skipped_atoms=total - assessed,
    )
    typed = len(chemistry.typed)
    for kind in ("hydrogen_bond", "hydrophobic", "pi_pi", "cation_pi", "salt_bridge"):
        coverage[kind] = InteractionCoverage(
            status="unavailable"
            if not typed
            else "partial"
            if warnings or typed < total
            else "complete",
            assessed_atoms=typed,
            skipped_atoms=total - typed,
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
        candidate_comparisons=budget.comparisons,
    )
