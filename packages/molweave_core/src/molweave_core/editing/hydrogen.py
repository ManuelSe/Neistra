"""Bounded, additive hydrogen proposals for authored molecular drafts.

The proposal is independent of persistence, allocation and navigation components.
Only bounded, fully specified chemical contexts enter broader perception.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from itertools import permutations
from math import cos, pi, sin
from typing import Any, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from rdkit import Chem
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.adapters.rdkit_common import normalized_to_mol
from molweave_core.editing.geometry import covalent_length, local_frame
from molweave_core.molecular import (
    Atom,
    Bond,
    InferenceRecord,
    MolecularWarning,
    NormalizedStructureV1,
)

Geometry = Literal["linear", "trigonal_planar", "tetrahedral"]
Point = tuple[float, float, float]
MAX_SITES = 4096
MAX_HYDROGENS = 4096
MAX_COORDINATES = 16384
MAX_CONTEXT = 1024
MAX_ANALYZED = 16384
MAX_DIAGNOSTICS = 200


class HydrogenDiagnostic(BaseModel):
    model_config = ConfigDict(frozen=True)
    atom_id: int
    reason: str
    message: str
    conformer_ids: list[int] = Field(default_factory=list)


class HydrogenReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    status: Literal["complete", "partial", "unchanged", "unresolved"]
    target_count: int
    completed_count: int
    unchanged_count: int
    skipped_count: int
    unprocessed_count: int
    added_hydrogen_count: int
    diagnostics: list[HydrogenDiagnostic]
    reason_counts: dict[str, int]
    diagnostics_truncated: bool


@dataclass(frozen=True)
class HydrogenSite:
    parent_id: int
    geometry: Geometry
    frames: tuple[tuple[Point, ...], ...]
    orientation: int = 0


@dataclass(frozen=True)
class HydrogenProposal:
    sites: tuple[HydrogenSite, ...]
    report: HydrogenReport
    analyzed_atom_count: int = 0
    generated_coordinate_rows: int = 0


class UnsupportedSite(ValueError):
    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


_IDEAL = {
    "linear": np.array([[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0]]),
    "trigonal_planar": np.array(
        [[1.0, 0.0, 0.0], [-0.5, 3**0.5 / 2, 0.0], [-0.5, -(3**0.5) / 2, 0.0]]
    ),
    "tetrahedral": np.array(
        [[1.0, 1.0, 1.0], [1.0, -1.0, -1.0], [-1.0, 1.0, -1.0], [-1.0, -1.0, 1.0]]
    )
    / 3**0.5,
}
_VALENCE = {
    ("C", 0): 4,
    ("N", 0): 3,
    ("N", 1): 4,
    ("O", 0): 2,
    ("O", -1): 1,
    ("O", 1): 3,
    ("S", 0): 2,
    ("F", 0): 1,
    ("Cl", 0): 1,
    ("Br", 0): 1,
    ("I", 0): 1,
}


def _fit(vectors: Any, geometry: Geometry, count: int, orientation: int) -> tuple[Any, float]:
    """Fit ideal occupied vertices with a proper rotation; never reflect chirality."""
    ideal = _IDEAL[geometry]
    occupied = len(vectors)
    if occupied + count > len(ideal):
        raise UnsupportedSite("geometry_capacity", "Not enough free positions in this geometry.")
    if not occupied:
        # Six reproducible choices around a fixed axis, including isolated parents.
        angle = orientation * pi / 3
        rotation = np.array(
            [[cos(angle), -sin(angle), 0.0], [sin(angle), cos(angle), 0.0], [0.0, 0.0, 1.0]]
        )
        return ideal[:count] @ rotation.T, 0.0
    candidates = []
    for indices in permutations(range(len(ideal)), occupied):
        source = ideal[list(indices)]
        if occupied == 1:
            rotation = local_frame(vectors[0]) @ local_frame(source[0]).T
            axis = vectors[0]
            angle = orientation * pi / 3
            cross = np.array(
                [[0.0, -axis[2], axis[1]], [axis[2], 0.0, -axis[0]], [-axis[1], axis[0], 0.0]]
            )
            rotation = (
                np.eye(3) * cos(angle)
                + (1 - cos(angle)) * np.outer(axis, axis)
                + sin(angle) * cross
            ) @ rotation
        else:
            u, _, vt = np.linalg.svd(source.T @ vectors)
            rotation = vt.T @ np.diag([1.0, 1.0, np.linalg.det(vt.T @ u.T)]) @ u.T
        fitted = ideal @ rotation.T
        error = float(np.sum((fitted[list(indices)] - vectors) ** 2))
        free = [i for i in range(len(ideal)) if i not in indices]
        candidates.append((error, indices, fitted[free]))
    candidates.sort(key=lambda item: (round(item[0], 10), item[1]))
    # For constrained frames only symmetry-equivalent best fits are alternatives.
    best = [item for item in candidates if item[0] <= candidates[0][0] + 1e-8]
    picked = best[orientation % len(best)]
    return picked[2][:count], picked[0]


class HydrogenBuilder:
    def __init__(self, structure: NormalizedStructureV1) -> None:
        if len({c.id for c in structure.conformers}) != len(structure.conformers):
            raise ValueError("Conformer identities must be unique for hydrogen building.")
        self.structure = structure
        self.atoms = {a.id: a for a in structure.atoms}
        self.indices = {a.id: i for i, a in enumerate(structure.atoms)}
        self.adjacency: dict[int, list[tuple[int, Bond]]] = {i: [] for i in self.atoms}
        self.pi_bonds = {i: 0 for i in self.atoms}
        pairs = set()
        for bond in structure.bonds:
            pair = tuple(sorted((bond.atom_1_id, bond.atom_2_id)))
            if pair in pairs:
                raise ValueError("Duplicate bond endpoints require an explicit repair.")
            pairs.add(pair)
            if bond.order == 2.0 or bond.aromatic:
                self.pi_bonds[bond.atom_1_id] += 1
                self.pi_bonds[bond.atom_2_id] += 1
            self.adjacency[bond.atom_1_id].append((bond.atom_2_id, bond))
            self.adjacency[bond.atom_2_id].append((bond.atom_1_id, bond))
        for neighbors in self.adjacency.values():
            neighbors.sort(key=lambda item: item[0])
        self.contexts: dict[int, Any] = {}
        self.analyzed = 0
        self.trees: dict[int, Any] = {}
        self.points: dict[int, Any] = {}

    def targets(self, selected: list[int], *, entry: bool = False) -> list[int]:
        if len(set(selected)) != len(selected) or not set(selected) <= self.atoms.keys():
            raise ValueError("Select current, unique atoms in this entry.")
        if entry:
            return sorted(i for i, a in self.atoms.items() if a.element != "H")
        result = set()
        for i in selected:
            if self.atoms[i].element != "H":
                result.add(i)
            else:
                neighbors = self.adjacency[i]
                if len(neighbors) != 1 or self.atoms[neighbors[0][0]].element == "H":
                    raise ValueError("Select a heavy atom or a hydrogen with one heavy parent.")
                result.add(neighbors[0][0])
        if not result:
            raise ValueError("Select at least one hydrogen completion target.")
        return sorted(result)

    def _context(self, target: int) -> tuple[Any, dict[int, int]]:
        if target in self.contexts:
            value = self.contexts[target]
            if isinstance(value, UnsupportedSite):
                raise value
            return value  # type: ignore[no-any-return]
        members: set[int] = set()
        stack = [target]
        # Cache complete canonical closure even when chemical conversion is too large.
        # Otherwise later targets could repeatedly traverse overlapping truncated contexts.
        while stack:
            current = stack.pop()
            if current not in members:
                members.add(current)
                stack.extend(i for i, _ in self.adjacency[current] if i not in members)
        error = None
        if len(members) > MAX_CONTEXT:
            error = UnsupportedSite(
                "context_limit",
                "Chemical context exceeds the bounded analysis size; it was not cut or capped.",
            )
        elif self.analyzed + len(members) > MAX_ANALYZED:
            error = UnsupportedSite(
                "analysis_budget", "Request chemical-context analysis budget exhausted."
            )
        else:
            self.analyzed += len(members)
            if any(self.atoms[i].formal_charge is None for i in members) or any(
                b.order not in {1.0, 1.5, 2.0, 3.0} for i in members for _, b in self.adjacency[i]
            ):
                error = UnsupportedSite(
                    "context_unknown",
                    "Aromatic/resonance context contains unspecified charge or bond order.",
                )
            elif any(b.aromatic != (b.order == 1.5) for i in members for _, b in self.adjacency[i]):
                error = UnsupportedSite(
                    "context_contradictory",
                    "Aromatic/resonance context has contradictory aromatic flags and bond orders.",
                )
            else:
                ordered = sorted(members)
                indices = [self.indices[i] for i in ordered]
                projection = self.structure.model_copy(
                    update={
                        "atoms": [self.atoms[i] for i in ordered],
                        "bonds": sorted(
                            {b.id: b for i in members for _, b in self.adjacency[i]}.values(),
                            key=lambda b: b.id,
                        ),
                        "conformers": [
                            c.model_copy(
                                update={"coordinates": [c.coordinates[i] for i in indices]}
                            )
                            for c in self.structure.conformers
                            if c.id == self.structure.active_conformer_id
                        ],
                    }
                )
                try:
                    mol = normalized_to_mol(projection)
                    Chem.SanitizeMol(mol)
                    value = (mol, {i: n for n, i in enumerate(ordered)})
                    for i in members:
                        self.contexts[i] = value
                    return value
                except (ValueError, RuntimeError, OverflowError):
                    error = UnsupportedSite(
                        "context_invalid",
                        (
                            "Aromatic/resonance context is not chemically interpretable; draft"
                            " retained."
                        ),
                    )
        for i in members:
            self.contexts[i] = error
        assert error is not None
        raise error

    def _automatic(self, target: int) -> tuple[int, Geometry]:
        atom = self.atoms[target]
        if atom.formal_charge is None:
            raise UnsupportedSite(
                "unknown_charge", "Automatic completion requires an assigned parent formal charge."
            )
        valence = _VALENCE.get((atom.element, atom.formal_charge))
        if valence is None:
            raise UnsupportedSite(
                "unsupported_state",
                "This element/charge state is outside automatic completion; use explicit Add N H.",
            )
        neighbors = self.adjacency[target]
        if any(b.order not in {1.0, 1.5, 2.0, 3.0} for _, b in neighbors):
            raise UnsupportedSite(
                "unknown_bond_order", "Automatic completion requires known incident bond orders."
            )
        if any(
            self.atoms[i].alternate_location not in {None, "", atom.alternate_location}
            for i, _ in neighbors
        ):
            raise UnsupportedSite(
                "alternate_context",
                "Incident alternate sites do not define one compatible geometry.",
            )
        if any(b.aromatic != (b.order == 1.5) for _, b in neighbors):
            raise UnsupportedSite(
                "contradictory_bond_order",
                (
                    "Incident aromatic flags and bond orders disagree; assign the "
                    "intended bond chemistry explicitly."
                ),
            )
        aromatic = any(b.aromatic or b.order == 1.5 for _, b in neighbors)
        if aromatic:
            mol, indices = self._context(target)
            count = int(mol.GetAtomWithIdx(indices[target]).GetNumImplicitHs())
        else:
            total = sum(float(b.order or 0) for _, b in neighbors)
            count = int(valence - total)
            if count < 0 or total != int(total):
                raise UnsupportedSite(
                    "valence_exceeded",
                    (
                        "Incident bonds exceed the supported local valence; existing atoms"
                        " were retained."
                    ),
                )
        # Amide and conjugated heteroatoms use a planar local coordination.
        conjugated = atom.element in {"N", "O", "S"} and any(
            b.order == 1.0 and self.pi_bonds[i] > 0 for i, b in neighbors
        )
        orders = [b.order for _, b in neighbors]
        geometry: Geometry = (
            "linear"
            if 3.0 in orders or orders.count(2.0) == 2
            else "trigonal_planar"
            if aromatic or 2.0 in orders or conjugated
            else "tetrahedral"
        )
        return count, geometry

    def propose(
        self,
        targets: list[int],
        *,
        count: int | None = None,
        geometry: Geometry = "tetrahedral",
        orientation: int = 0,
        atom_limit: int = 1_000_000,
    ) -> HydrogenProposal:
        if count is not None and (len(targets) != 1 or not 1 <= count <= 4):
            raise ValueError("Add N H requires one heavy parent and a count from 1 to 4.")
        if not 0 <= orientation <= 5:
            raise ValueError("Choose orientation 0 through 5.")
        if len(set(targets)) != len(targets) or any(
            i not in self.atoms or self.atoms[i].element == "H" for i in targets
        ):
            raise ValueError("Hydrogen targets must be unique current heavy atoms.")
        sites = []
        diagnostics: list[HydrogenDiagnostic] = []
        reasons: Counter[str] = Counter()
        skipped = unchanged = unprocessed = added = 0
        attempted_h = generated_rows = 0

        def diagnostic(
            target: int, reason: str, message: str, conformers: list[int] | None = None
        ) -> None:
            reasons[reason] += 1
            if len(diagnostics) < MAX_DIAGNOSTICS:
                diagnostics.append(
                    HydrogenDiagnostic(
                        atom_id=target,
                        reason=reason,
                        message=message,
                        conformer_ids=conformers or [],
                    )
                )

        for n, target in enumerate(sorted(targets)):
            if n >= MAX_SITES:
                unprocessed += 1
                diagnostic(target, "target_budget", "Target-site budget exhausted; site unchanged.")
                continue
            try:
                amount, shape = self._automatic(target) if count is None else (count, geometry)
                if amount == 0:
                    unchanged += 1
                    continue
                if (
                    attempted_h + amount > MAX_HYDROGENS
                    or generated_rows + amount * len(self.structure.conformers) > MAX_COORDINATES
                    or len(self.atoms) + added + amount > atom_limit
                ):
                    unprocessed += 1
                    diagnostic(
                        target,
                        "addition_budget",
                        (
                            "Insufficient remaining hydrogen, coordinate or entry budget for "
                            "this complete site."
                        ),
                    )
                    continue
                # Charge the whole admitted site even when a later frame fails.
                attempted_h += amount
                generated_rows += amount * len(self.structure.conformers)
                frames = []
                issues: dict[str, list[int]] = {}
                for conformer in self.structure.conformers:
                    if conformer.id not in self.points:
                        self.points[conformer.id] = np.asarray(conformer.coordinates)
                    points = self.points[conformer.id]
                    center = points[self.indices[target]]
                    vectors = np.array(
                        [points[self.indices[i]] - center for i, _ in self.adjacency[target]]
                    ).reshape((-1, 3))
                    norms = np.linalg.norm(vectors, axis=1)
                    if (
                        not np.isfinite(center).all()
                        or not np.isfinite(vectors).all()
                        or not np.isfinite(norms).all()
                        or any(norms < 1e-6)
                    ):
                        raise UnsupportedSite(
                            "degenerate_geometry",
                            f"Conformer {conformer.id} has coincident or nonfinite "
                            "local coordinates.",
                        )
                    vectors = vectors / norms[:, None]
                    if (
                        count is None
                        and shape == "tetrahedral"
                        and len(vectors) == 3
                        and amount == 1
                        and abs(float(np.linalg.det(vectors))) < 1e-3
                    ):
                        raise UnsupportedSite(
                            "undetermined_configuration",
                            f"Conformer {conformer.id} does not determine the new "
                            "tetrahedral orientation; use explicit preview.",
                        )
                    if (
                        count is None
                        and shape == "trigonal_planar"
                        and len(vectors) == 2
                        and amount == 1
                        and np.linalg.norm(np.cross(vectors[0], vectors[1])) < 1e-3
                    ):
                        raise UnsupportedSite(
                            "undetermined_configuration",
                            f"Conformer {conformer.id} does not determine a trigonal plane; "
                            "use explicit preview.",
                        )
                    directions, error = _fit(vectors, shape, amount, orientation)
                    generated = center + directions * covalent_length(
                        self.atoms[target].element, "H"
                    )
                    if not np.isfinite(generated).all():
                        raise UnsupportedSite(
                            "degenerate_geometry", "Candidate coordinates are nonfinite."
                        )
                    actual_lengths = np.linalg.norm(generated - center, axis=1)
                    if not np.allclose(
                        actual_lengths,
                        covalent_length(self.atoms[target].element, "H"),
                        rtol=1e-6,
                        atol=1e-8,
                    ):
                        raise UnsupportedSite(
                            "coordinate_precision",
                            (
                                "Coordinate precision cannot represent the proposed H bond length;"
                                " site unchanged."
                            ),
                        )
                    if error > 0.15:
                        issues.setdefault("geometry_mismatch", []).append(conformer.id)
                    if len(vectors) < 2:
                        issues.setdefault("orientation_underdetermined", []).append(conformer.id)
                    if conformer.id not in self.trees:
                        if not np.isfinite(points).all():
                            # Remote malformed coordinates must not veto a local proposal.
                            points = points[np.isfinite(points).all(axis=1)]
                        self.trees[conformer.id] = cKDTree(points)
                    if float(np.min(self.trees[conformer.id].query(generated)[0])) < 0.6:
                        issues.setdefault("placement_clash", []).append(conformer.id)
                    frames.append(
                        tuple((float(row[0]), float(row[1]), float(row[2])) for row in generated)
                    )
                sites.append(HydrogenSite(target, shape, tuple(frames), orientation))
                added += amount
                for reason, conformers in issues.items():
                    diagnostic(
                        target,
                        reason,
                        {
                            "geometry_mismatch": (
                                "Retained angles differ from ideal coordination; retained "
                                "coordinates were not moved."
                            ),
                            "orientation_underdetermined": (
                                "Retained geometry does not fix every placement degree of freedom;"
                                " inspect the deterministic proposal."
                            ),
                            "placement_clash": (
                                "A new H is within 0.6 angstrom of retained material; inspect the "
                                "unoptimized proposal."
                            ),
                        }[reason],
                        conformers,
                    )
            except UnsupportedSite as error:
                skipped += 1
                diagnostic(
                    target, error.reason, str(error), [c.id for c in self.structure.conformers]
                )
        unresolved = skipped + unprocessed
        status: Literal["complete", "partial", "unchanged", "unresolved"] = (
            "partial"
            if sites and unresolved
            else "complete"
            if sites
            else "unresolved"
            if unresolved
            else "unchanged"
        )
        return HydrogenProposal(
            tuple(sites),
            HydrogenReport(
                status=status,
                target_count=len(targets),
                completed_count=len(sites),
                unchanged_count=unchanged,
                skipped_count=skipped,
                unprocessed_count=unprocessed,
                added_hydrogen_count=added,
                diagnostics=diagnostics,
                reason_counts=dict(sorted(reasons.items())),
                diagnostics_truncated=sum(reasons.values()) > len(diagnostics),
            ),
            self.analyzed,
            generated_rows,
        )


def apply_hydrogen_proposal(
    before: NormalizedStructureV1,
    proposal: HydrogenProposal,
    *,
    next_atom_id: int,
    next_bond_id: int,
    operation: str,
) -> tuple[NormalizedStructureV1, tuple[MolecularWarning, ...]]:
    """Materialize at the editing boundary; proposal generation consumes no identities."""
    if not proposal.sites:
        return before, ()
    if next_atom_id <= max((a.id for a in before.atoms), default=0) or next_bond_id <= max(
        (b.id for b in before.bonds), default=0
    ):
        raise ValueError("Hydrogen identities must exceed retained allocation floors.")
    atoms = {a.id: a for a in before.atoms}
    active = next(i for i, c in enumerate(before.conformers) if c.id == before.active_conformer_id)
    new_atoms: list[Atom] = []
    new_bonds: list[Bond] = []
    frames: list[list[Point]] = [[] for _ in before.conformers]
    source_index = max((a.source_index for a in before.atoms), default=-1) + 1
    inferences = []
    for site in proposal.sites:
        parent = atoms[site.parent_id]
        ids = []
        bonds = []
        for n in range(len(site.frames[0])):
            atom_id = next_atom_id + len(new_atoms)
            bond_id = next_bond_id + len(new_bonds)
            ids.append(atom_id)
            bonds.append(bond_id)
            new_atoms.append(
                Atom(
                    id=atom_id,
                    name=f"H{atom_id}",
                    element="H",
                    formal_charge=0,
                    coordinates=site.frames[active][n],
                    residue_id=parent.residue_id,
                    alternate_location=parent.alternate_location,
                    source_index=source_index + len(new_atoms),
                    inferred_fields=["coordinates", "chemistry"],
                )
            )
            new_bonds.append(
                Bond(id=bond_id, atom_1_id=parent.id, atom_2_id=atom_id, order=1.0, inferred=True)
            )
        for frame, points in zip(frames, site.frames, strict=True):
            frame.extend(points)
        inferences.append(
            InferenceRecord(
                code="model_hydrogen_placement",
                atom_ids=[parent.id, *ids],
                bond_ids=bonds,
                message=f"{operation}; geometry={site.geometry}; "
                f"count={len(site.frames[0])}; orientation={site.orientation}; "
                "unoptimized additive placement; retained coordinates unchanged.",
            )
        )
    warnings = [
        MolecularWarning(
            code="model_hydrogen_approximate",
            operation=f"model.{operation}",
            field="coordinates",
            message=(
                "Hydrogens use approximate covalent lengths and ideal local "
                "coordination; no protonation, optimization or preparation is "
                "implied."
            ),
        )
    ]
    for reason, number in proposal.report.reason_counts.items():
        warnings.append(
            MolecularWarning(
                code=f"model_hydrogen_{reason}",
                operation=f"model.{operation}",
                field="chemistry",
                message=f"Hydrogen building: {number} sites reported {reason.replace('_', ' ')}. "
                "Review the operation report and unoptimized geometry.",
            )
        )
    after = before.model_copy(
        update={
            "atoms": [*before.atoms, *new_atoms],
            "bonds": [*before.bonds, *new_bonds],
            "conformers": [
                c.model_copy(update={"coordinates": [*c.coordinates, *frame]})
                for c, frame in zip(before.conformers, frames, strict=True)
            ],
            "inferences": [*before.inferences, *inferences],
        }
    )
    after, stereo_warnings = _reconcile_stereo(
        after,
        {site.parent_id for site in proposal.sites},
        operation,
        analyzed_atom_count=proposal.analyzed_atom_count,
        row_budget=MAX_COORDINATES - proposal.generated_coordinate_rows,
    )
    warnings.extend(stereo_warnings)
    metadata = dict(after.metadata)
    for key in ("canonical_smiles", "formula", "molecular_weight", "descriptors"):
        metadata.pop(key, None)
    unique = {(w.code, w.field, w.message): w for w in [*before.warnings, *warnings]}
    return after.model_copy(
        update={"metadata": metadata, "warnings": list(unique.values())}
    ), tuple(warnings)


def _retained_atom_orientation(builder: HydrogenBuilder, atom_id: int, points: Any) -> bool:
    neighbors = builder.adjacency[atom_id]
    if len(neighbors) not in {3, 4}:
        return False
    center = np.asarray(points[builder.indices[atom_id]])
    vectors = np.array([np.asarray(points[builder.indices[i]]) - center for i, _ in neighbors])
    norms = np.linalg.norm(vectors, axis=1)
    if not np.isfinite(norms).all() or any(norms < 1e-6):
        return False
    vectors = vectors / norms[:, None]
    volume = vectors if len(neighbors) == 3 else vectors[:3] - vectors[3]
    return abs(float(np.linalg.det(volume))) > 1e-3


def _retained_bond_orientation(builder: HydrogenBuilder, bond: Bond, points: Any) -> bool:
    # Both endpoint planes need retained substituents. Virtual H cannot supply
    # missing geometric evidence or resolve a collinear higher-priority ligand.
    for start, end in [(bond.atom_1_id, bond.atom_2_id), (bond.atom_2_id, bond.atom_1_id)]:
        center = np.asarray(points[builder.indices[start]])
        axis = np.asarray(points[builder.indices[end]]) - center
        axis_length = float(np.linalg.norm(axis))
        if not np.isfinite(axis_length) or axis_length < 1e-6:
            return False
        neighbors = [i for i, _ in builder.adjacency[start] if i != end]
        if not neighbors:
            return False
        for i in neighbors:
            vector = np.asarray(points[builder.indices[i]]) - center
            length = float(np.linalg.norm(vector))
            if (
                not np.isfinite(length)
                or length < 1e-6
                or np.linalg.norm(np.cross(axis / axis_length, vector / length)) < 1e-3
            ):
                return False
    return True


def _reconcile_stereo(
    structure: NormalizedStructureV1,
    targets: set[int],
    operation: str,
    *,
    row_budget: int,
    analyzed_atom_count: int,
) -> tuple[NormalizedStructureV1, list[MolecularWarning]]:
    """Reconcile affected bounded contexts after additions, never source facts.

    A failed/oversized projection conservatively clears dependent current labels;
    physical coordinates remain the model and unresolved assignments remain explicit.
    """
    builder = HydrogenBuilder(structure)
    builder.analyzed = analyzed_atom_count
    atom_updates: dict[int, str | None] = {}
    bond_updates: dict[int, str | None] = {}
    visited: set[int] = set()
    warnings = []
    assessment_failures = 0
    disagreement_count = 0
    unresolved_geometry: set[tuple[str, int]] = set()
    analysis_rows = 0
    local = targets | {i for t in targets for i, _ in builder.adjacency[t]}
    for target in sorted(targets):
        if target in visited:
            continue
        members: set[int] = set()
        stack = [target]
        while stack:
            current = stack.pop()
            if current not in members:
                members.add(current)
                stack.extend(i for i, _ in builder.adjacency[current] if i not in members)
        visited.update(members)
        # Current tetrahedral neighbor tags depend on canonical neighbor ordering.
        member_bonds = {b.id: b for i in members for _, b in builder.adjacency[i]}
        try:
            mol, indices = builder._context(target)
            # Count repeated conformer assessment as analyzed atom visits as well.
            extra_visits = len(indices) * (len(structure.conformers) - 1)
            if builder.analyzed + extra_visits > MAX_ANALYZED:
                raise UnsupportedSite(
                    "stereo_analysis_budget",
                    "Stereo assessment exceeds the request atom-analysis budget across conformers.",
                )
            builder.analyzed += extra_visits
            # Use fully explicit completion representation before stereo perception.
            virtual_h = sum(int(a.GetNumImplicitHs()) for a in mol.GetAtoms())
            needed_rows = virtual_h * len(structure.conformers)
            if analysis_rows + needed_rows > row_budget:
                raise UnsupportedSite(
                    "stereo_coordinate_budget",
                    ("Bounded stereo-coordinate analysis is unavailable for this context."),
                )
            analysis_rows += needed_rows
            per_atom: dict[int, set[str | None]] = {i: set() for i in members if i in local}
            per_bond: dict[int, set[str | None]] = {
                b.id: set()
                for b in member_bonds.values()
                if b.order == 2.0
                and (b.stereo not in {None, "NONE"} or {b.atom_1_id, b.atom_2_id} & local)
            }
            bonds_by_pair = {
                tuple(sorted((b.atom_1_id, b.atom_2_id))): b.id
                for b in member_bonds.values()
                if b.id in per_bond
            }
            reverse = {n: i for i, n in indices.items()}
            for source_conformer in structure.conformers:
                frame = Chem.Conformer(len(indices))
                frame.Set3D(True)
                for atom_id, n in indices.items():
                    frame.SetAtomPosition(n, source_conformer.coordinates[builder.indices[atom_id]])
                mol.RemoveAllConformers()
                mol.AddConformer(frame, assignId=True)
                analysis = Chem.AddHs(mol, addCoords=True)
                conformer = analysis.GetConformer()
                Chem.RemoveStereochemistry(analysis)
                Chem.AssignStereochemistryFrom3D(
                    analysis, conformer.GetId(), replaceExistingTags=True
                )
                Chem.AssignStereochemistry(analysis, cleanIt=True, force=True)
                for i in per_atom:
                    tag = str(analysis.GetAtomWithIdx(indices[i]).GetChiralTag()).removeprefix(
                        "CHI_"
                    )
                    if tag != "UNSPECIFIED" and not _retained_atom_orientation(
                        builder, i, source_conformer.coordinates
                    ):
                        unresolved_geometry.add(("atom", i))
                        tag = "UNSPECIFIED"
                    per_atom[i].add(None if tag == "UNSPECIFIED" else tag)
                for b in analysis.GetBonds():
                    left, right = reverse.get(b.GetBeginAtomIdx()), reverse.get(b.GetEndAtomIdx())
                    if left is not None and right is not None:
                        bid = bonds_by_pair.get(tuple(sorted((left, right))))
                        if bid is not None:
                            tag = str(b.GetStereo()).removeprefix("STEREO")
                            if tag != "NONE" and not _retained_bond_orientation(
                                builder, member_bonds[bid], source_conformer.coordinates
                            ):
                                unresolved_geometry.add(("bond", bid))
                                tag = "NONE"
                            per_bond[bid].add(None if tag == "NONE" else tag)
            for i, tags in per_atom.items():
                disagreement_count += int(len(tags) > 1)
                atom_updates[i] = next(iter(tags)) if len(tags) == 1 else None
            for i, tags in per_bond.items():
                disagreement_count += int(len(tags) > 1)
                bond_updates[i] = next(iter(tags)) if len(tags) == 1 else None
        except (ValueError, RuntimeError, OverflowError):
            assessment_failures += 1
            atom_updates.update({i: None for i in members & local})
            bond_updates.update(
                {b.id: None for b in member_bonds.values() if b.stereo not in {None, "NONE"}}
            )

    if unresolved_geometry:
        warnings.append(
            MolecularWarning(
                code="model_hydrogen_stereo_geometry_unresolved",
                operation=f"model.{operation}",
                field="stereo",
                message=(
                    f"{len(unresolved_geometry)} current stereo assignments "
                    "lack retained geometric evidence; temporary analysis H "
                    "were not used to choose a configuration."
                ),
            )
        )
    if disagreement_count:
        warnings.append(
            MolecularWarning(
                code="model_hydrogen_stereo_disagreement",
                operation=f"model.{operation}",
                field="stereo",
                message=f"Conformers disagree on {disagreement_count} affected stereo assignments; "
                "no universal current tag was chosen. Coordinates and source facts were retained.",
            )
        )
    if assessment_failures:
        warnings.append(
            MolecularWarning(
                code="model_hydrogen_stereo_unresolved",
                operation=f"model.{operation}",
                field="stereo",
                message=(
                    f"Stereo assessment unavailable in {assessment_failures} contexts; "
                    "dependent current labels were cleared where necessary. "
                    "Coordinates and source facts were retained."
                ),
            )
        )
    changed = any(
        a.id in atom_updates
        and a.stereo != atom_updates[a.id]
        and (a.stereo not in {None, "NONE"} or atom_updates[a.id])
        for a in structure.atoms
    ) or any(
        b.id in bond_updates
        and b.stereo != bond_updates[b.id]
        and (b.stereo not in {None, "NONE"} or bond_updates[b.id])
        for b in structure.bonds
    )
    if changed:
        warnings.append(
            MolecularWarning(
                code="model_hydrogen_stereo_reconciled",
                operation=f"model.{operation}",
                field="stereo",
                message=(
                    "Affected current stereo annotations were reconciled with retained"
                    " 3D geometry after hydrogen completion; unresolved or conflicting"
                    " assignments were cleared. Source facts were preserved."
                ),
            )
        )
    return structure.model_copy(
        update={
            "atoms": [
                a.model_copy(
                    update={
                        "stereo": atom_updates[a.id],
                        "inferred_fields": sorted(set(a.inferred_fields) | {"stereo"}),
                    }
                )
                if a.id in atom_updates and (a.stereo or "NONE") != (atom_updates[a.id] or "NONE")
                else a
                for a in structure.atoms
            ],
            "bonds": [
                b.model_copy(update={"stereo": bond_updates[b.id]})
                if b.id in bond_updates and (b.stereo or "NONE") != (bond_updates[b.id] or "NONE")
                else b
                for b in structure.bonds
            ],
        }
    ), warnings
