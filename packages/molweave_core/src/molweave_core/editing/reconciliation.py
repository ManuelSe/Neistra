"""Endpoint-local destructive H proposals; additive completion retains its contract."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from itertools import permutations
from typing import Any, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from rdkit import Chem
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.editing.geometry import covalent_length
from molweave_core.editing.hydrogen import (
    MAX_ANALYZED,
    MAX_COORDINATES,
    MAX_DIAGNOSTICS,
    MAX_HYDROGENS,
    Geometry,
    HydrogenBuilder,
    HydrogenDiagnostic,
    UnsupportedSite,
    fit_coordination,
    reconcile_current_stereo,
)
from molweave_core.hydrogen_protection import (
    ordinary_generated,
    protection_facts,
)
from molweave_core.molecular import (
    Atom,
    Bond,
    InferenceRecord,
    MolecularWarning,
    NormalizedStructureV1,
)


class ReconciliationSite(BaseModel):
    model_config = ConfigDict(frozen=True)
    atom_id: int
    status: Literal["complete", "unchanged", "skipped", "unprocessed"]
    geometry: Geometry | None = None
    added_hydrogen_ids: list[int] = Field(default_factory=list)
    removed_hydrogen_ids: list[int] = Field(default_factory=list)
    moved_hydrogen_ids: list[int] = Field(default_factory=list)


class ReconciliationReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    policy: Literal["reconcile_if_possible"] = "reconcile_if_possible"
    status: Literal["complete", "partial", "unchanged", "unresolved"]
    target_count: int
    completed_count: int
    unchanged_count: int
    skipped_count: int
    unprocessed_count: int
    added_hydrogen_count: int
    removed_hydrogen_count: int
    moved_hydrogen_count: int
    sites: list[ReconciliationSite]
    diagnostics: list[HydrogenDiagnostic]
    reason_counts: dict[str, int]
    diagnostics_truncated: bool


@dataclass(frozen=True)
class ReconciliationResult:
    structure: NormalizedStructureV1
    report: ReconciliationReport
    warnings: tuple[MolecularWarning, ...]


def _without(structure: NormalizedStructureV1, removed: set[int]) -> NormalizedStructureV1:
    indices = [n for n, a in enumerate(structure.atoms) if a.id not in removed]
    return structure.model_copy(
        update={
            "atoms": [structure.atoms[n] for n in indices],
            "bonds": [b for b in structure.bonds if not removed & {b.atom_1_id, b.atom_2_id}],
            "conformers": [
                c.model_copy(update={"coordinates": [c.coordinates[n] for n in indices]})
                for c in structure.conformers
            ],
        }
    )


def reconcile_hydrogens(
    before: NormalizedStructureV1,
    draft: NormalizedStructureV1,
    targets: list[int],
    *,
    next_atom_id: int,
    next_bond_id: int,
    operation: str,
    atom_limit: int,
    inferred_deletion: bool = False,
) -> ReconciliationResult:
    """Compute complete per-site conformer changes before materializing any change."""
    find_centres: Any = Chem.FindMolChiralCenters
    try:
        original = HydrogenBuilder(before)
        current = HydrogenBuilder(draft)
    except ValueError as context_error:
        report = ReconciliationReport(
            status="unresolved",
            target_count=len(targets),
            completed_count=0,
            unchanged_count=0,
            skipped_count=len(targets),
            unprocessed_count=0,
            added_hydrogen_count=0,
            removed_hydrogen_count=0,
            moved_hydrogen_count=0,
            sites=[ReconciliationSite(atom_id=t, status="skipped") for t in targets],
            diagnostics=[
                HydrogenDiagnostic(
                    atom_id=t, reason="invalid_conformer_context", message=str(context_error)
                )
                for t in targets
            ],
            reason_counts={"invalid_conformer_context": len(targets)},
            diagnostics_truncated=False,
        )
        return ReconciliationResult(
            draft,
            report,
            (
                MolecularWarning(
                    code="model_hydrogen_invalid_conformer_context",
                    operation=f"model.{operation}",
                    message=f"Bond draft retained; H reconciliation unavailable: {context_error}",
                ),
            ),
        )
    try:
        facts = protection_facts(before)
    except ValueError:
        facts = {}
    target_h = {
        t: sorted(i for i, _ in current.adjacency[t] if current.atoms[i].element in {"H", "D", "T"})
        for t in targets
    }
    stripped = _without(draft, {i for ids in target_h.values() for i in ids})
    builder = HydrogenBuilder(stripped)
    points = {c.id: np.asarray(c.coordinates) for c in draft.conformers}
    active = next(n for n, c in enumerate(draft.conformers) if c.id == draft.active_conformer_id)
    sites: list[ReconciliationSite] = []
    diagnostics: list[HydrogenDiagnostic] = []
    reasons: Counter[str] = Counter()
    removed: set[int] = set()
    moved: dict[int, list[tuple[float, float, float]]] = {}
    additions: list[Atom] = []
    bonds: list[Bond] = []
    added_frames: list[list[tuple[float, float, float]]] = [[] for _ in draft.conformers]
    inferences = []
    rows = work = 0
    source_floor = max((a.source_index for a in draft.atoms), default=-1) + 1

    def diagnostic(
        target: int, reason: str, message: str, conformers: list[int] | None = None
    ) -> None:
        reasons[reason] += 1
        if len(diagnostics) < MAX_DIAGNOSTICS:
            diagnostics.append(
                HydrogenDiagnostic(
                    atom_id=target, reason=reason, message=message, conformer_ids=conformers or []
                )
            )

    def require_ordinary(atom: Atom) -> None:
        fact = facts.get(atom.id)
        if (
            not fact
            or not fact.matches(atom)
            or fact.isotope is None
            or fact.radical_electrons is None
        ):
            raise UnsupportedSite(
                "protection_unknown",
                "Source isotope/radical identity is not established; H unchanged.",
            )
        if not fact.ordinary:
            raise UnsupportedSite(
                "protected_identity",
                "Isotope-labelled or radical site/H is protected; H unchanged.",
            )

    for target in sorted(targets):
        h_ids = target_h[target]
        try:
            parent = current.atoms[target]
            if parent.element in {"H", "D", "T"} or any(
                current.atoms[t].element in {"H", "D", "T"} for t in targets
            ):
                raise UnsupportedSite(
                    "explicit_hydrogen_edit",
                    "H endpoint edit retained literally; no H re-added or reconciled.",
                )
            if inferred_deletion:
                raise UnsupportedSite(
                    "inferred_bond_deletion",
                    "Display-only removal has no authoritative valence decrement; H unchanged.",
                )
            require_ordinary(parent)
            for h in h_ids:
                atom = current.atoms[h]
                require_ordinary(atom)
                incident = current.adjacency[h]
                if (
                    atom.element != "H"
                    or atom.formal_charge != 0
                    or len(incident) != 1
                    or incident[0][0] != target
                    or incident[0][1].order != 1.0
                    or incident[0][1].aromatic
                    or original.atoms[h].stereo not in {None, "NONE"}
                    or atom.alternate_location not in {None, "", parent.alternate_location}
                ):
                    raise UnsupportedSite(
                        "protected_hydrogen",
                        "Charged, ambiguous, nonterminal or stereo-significant H is protected.",
                    )
            amount, shape = builder.automatic_configuration(target)
            if any(b.aromatic or b.order == 1.5 for _, b in builder.adjacency[target]):
                raise UnsupportedSite(
                    "aromatic_reconciliation",
                    "Aromatic H reconciliation is outside this profile; draft retained.",
                )
            if len(h_ids) > 4 or amount > 4:
                raise UnsupportedSite(
                    "site_capacity",
                    "Local H coordination exceeds this bounded profile; H unchanged.",
                )
            previous_orders = sorted(b.order or 0 for _, b in original.adjacency[target])
            next_orders = sorted(b.order or 0 for _, b in current.adjacency[target])
            if amount == len(h_ids) and previous_orders == next_orders:
                sites.append(ReconciliationSite(atom_id=target, status="unchanged", geometry=shape))
                continue
            retained = h_ids[:amount]
            deleted = h_ids[amount:]
            new_count = max(0, amount - len(h_ids))
            needed = max(len(h_ids), amount)
            if (
                work + needed > MAX_HYDROGENS
                or rows + needed * len(draft.conformers) > MAX_COORDINATES
                or len(draft.atoms) - len(removed) - len(deleted) + len(additions) + new_count
                > atom_limit
            ):
                raise UnsupportedSite(
                    "reconciliation_budget",
                    "Whole-site H/coordinate/entry budget exhausted; H unchanged.",
                )
            work += needed
            rows += needed * len(draft.conformers)
            neighbors = [i for i, _ in builder.adjacency[target]]
            stereo = False
            if shape == "tetrahedral" and amount == 1 and len(neighbors) == 3:
                mol, mapping = builder._context(target)
                for f in facts.values():
                    if f.atom_id in mapping and not f.ordinary:
                        raise UnsupportedSite(
                            "protected_stereo_context",
                            "Protected identity in stereo context prevents automatic H choice.",
                        )
                stereo = mapping[target] in {
                    idx for idx, _ in find_centres(mol, includeUnassigned=True)
                }
                if stereo and len(h_ids) != 1:
                    raise UnsupportedSite(
                        "undetermined_configuration",
                        "New stereocentre needs explicit manual H placement; H unchanged.",
                    )
            frames: list[list[tuple[float, float, float]]] = []
            mismatch: list[int] = []
            for conformer in draft.conformers:
                pts = points[conformer.id]
                center = pts[current.indices[target]]
                vectors = np.asarray([pts[current.indices[i]] - center for i in neighbors]).reshape(
                    (-1, 3)
                )
                norms = np.linalg.norm(vectors, axis=1)
                if (
                    not np.isfinite(center).all()
                    or not np.isfinite(norms).all()
                    or any(norms < 1e-6)
                ):
                    raise UnsupportedSite(
                        "degenerate_geometry",
                        f"Conformer {conformer.id} has unusable heavy geometry.",
                    )
                vectors = vectors / norms[:, None]
                old_h = np.asarray([pts[current.indices[i]] for i in retained]).reshape((-1, 3))
                if not np.isfinite(old_h).all():
                    raise UnsupportedSite(
                        "degenerate_geometry",
                        f"Conformer {conformer.id} has unusable retained H geometry.",
                    )
                choices: list[tuple[float, int, tuple[int, ...], Any, float]] = []
                for orientation in range(6):
                    directions, error = fit_coordination(vectors, shape, amount, orientation)
                    generated = center + directions * covalent_length(parent.element, "H")
                    for assignment in permutations(range(amount), len(retained)):
                        order = list(assignment) + [n for n in range(amount) if n not in assignment]
                        candidate = generated[order] if amount else np.empty((0, 3))
                        if stereo:
                            base = pts[[current.indices[i] for i in neighbors]]
                            old_volume = float(np.linalg.det(base - old_h[0]))
                            new_volume = float(np.linalg.det(base - candidate[0]))
                            if abs(old_volume) < 1e-3 or old_volume * new_volume <= 0:
                                continue
                        score = float(np.sum((candidate[: len(retained)] - old_h) ** 2))
                        choices.append(
                            (round(score, 10), orientation, assignment, candidate, error)
                        )
                if not choices:
                    raise UnsupportedSite(
                        "undetermined_configuration",
                        f"Conformer {conformer.id} cannot preserve retained stereo orientation.",
                    )
                choices.sort(key=lambda item: item[:3])
                candidate, error = choices[0][3:]
                lengths = np.linalg.norm(candidate - center, axis=1)
                if not np.isfinite(candidate).all() or not np.allclose(
                    lengths, covalent_length(parent.element, "H"), rtol=1e-6, atol=1e-8
                ):
                    raise UnsupportedSite(
                        "coordinate_precision",
                        f"Conformer {conformer.id} cannot represent finite H bond lengths.",
                    )
                if error > 0.15:
                    mismatch.append(conformer.id)
                frames.append([(float(row[0]), float(row[1]), float(row[2])) for row in candidate])
            if len(neighbors) < 2 and amount:
                diagnostic(
                    target,
                    "orientation_underdetermined",
                    "Deterministic local H orientation chosen; geometry is unoptimized.",
                )
            if mismatch:
                diagnostic(
                    target,
                    "geometry_mismatch",
                    "Fixed heavy geometry differs from ideal coordination; heavy atoms unchanged.",
                    mismatch,
                )
            moved_ids = []
            for n, h in enumerate(retained):
                coordinates = [frame[n] for frame in frames]
                if any(
                    coordinates[k] != tuple(c.coordinates[current.indices[h]])
                    for k, c in enumerate(draft.conformers)
                ):
                    moved[h] = coordinates
                    moved_ids.append(h)
            new_ids = []
            for n in range(new_count):
                atom_id = next_atom_id + len(additions)
                bond_id = next_bond_id + len(bonds)
                new_ids.append(atom_id)
                additions.append(
                    Atom(
                        id=atom_id,
                        name=f"H{atom_id}",
                        element="H",
                        formal_charge=0,
                        coordinates=frames[active][len(retained) + n],
                        residue_id=parent.residue_id,
                        alternate_location=parent.alternate_location,
                        source_index=source_floor + len(additions),
                        inferred_fields=["coordinates", "chemistry"],
                    )
                )
                bonds.append(
                    Bond(id=bond_id, atom_1_id=target, atom_2_id=atom_id, order=1.0, inferred=True)
                )
            for k, frame in enumerate(frames):
                added_frames[k].extend(frame[len(retained) :])
            removed.update(deleted)
            sites.append(
                ReconciliationSite(
                    atom_id=target,
                    status="complete",
                    geometry=shape,
                    added_hydrogen_ids=new_ids,
                    removed_hydrogen_ids=deleted,
                    moved_hydrogen_ids=moved_ids,
                )
            )
            inferences.append(
                InferenceRecord(
                    code="model_hydrogen_reconciliation",
                    atom_ids=[target, *retained, *new_ids, *deleted],
                    message=(
                        f"{operation}; policy=reconcile_if_possible; geometry={shape}; "
                        f"added={new_ids}; removed={deleted}; moved={moved_ids}; "
                        "unoptimized endpoint-local placement, heavy coordinates fixed."
                    ),
                )
            )
        except (ValueError, RuntimeError, OverflowError) as error:
            reason = (
                error.reason if isinstance(error, UnsupportedSite) else "reconciliation_unavailable"
            )
            diagnostic(target, reason, str(error), [c.id for c in draft.conformers])
            sites.append(
                ReconciliationSite(
                    atom_id=target,
                    status="unprocessed" if reason == "reconciliation_budget" else "skipped",
                )
            )
    retained_indices = [n for n, a in enumerate(draft.atoms) if a.id not in removed]
    after = draft.model_copy(
        update={
            "atoms": [
                a.model_copy(
                    update={
                        "coordinates": moved[a.id][active],
                        "inferred_fields": sorted(set(a.inferred_fields) | {"coordinates"}),
                    }
                )
                if a.id in moved
                else a
                for a in draft.atoms
                if a.id not in removed
            ]
            + additions,
            "bonds": [b for b in draft.bonds if not removed & {b.atom_1_id, b.atom_2_id}] + bonds,
            "conformers": [
                c.model_copy(
                    update={
                        "coordinates": [
                            moved[draft.atoms[n].id][k]
                            if draft.atoms[n].id in moved
                            else c.coordinates[n]
                            for n in retained_indices
                        ]
                        + added_frames[k]
                    }
                )
                for k, c in enumerate(draft.conformers)
            ],
            "annotations": [
                *draft.annotations,
                *([ordinary_generated(additions)] if additions else []),
            ],
            "inferences": [*draft.inferences, *inferences],
        }
    )
    changed = set(moved) | {a.id for a in additions}
    if changed:
        for conformer in after.conformers:
            values = np.asarray(conformer.coordinates)
            finite = np.isfinite(values).all(axis=1)
            tree = cKDTree(values[finite])
            finite_indices = np.flatnonzero(finite)
            nearest = tree.query(values[finite], k=2)[0][:, 1]
            close = {
                after.atoms[int(finite_indices[n])].id for n, d in enumerate(nearest) if d < 0.6
            }
            for site in sites:
                if close & set(site.added_hydrogen_ids + site.moved_hydrogen_ids):
                    diagnostic(
                        site.atom_id,
                        "placement_clash",
                        "Changed H has a contact below 0.6 angstrom; inspect unoptimized geometry.",
                        [conformer.id],
                    )
    counts = Counter(s.status for s in sites)
    failed = counts["skipped"] + counts["unprocessed"]
    report = ReconciliationReport(
        status="partial"
        if failed and counts["complete"]
        else "unresolved"
        if failed
        else "complete"
        if counts["complete"]
        else "unchanged",
        target_count=len(targets),
        completed_count=counts["complete"],
        unchanged_count=counts["unchanged"],
        skipped_count=counts["skipped"],
        unprocessed_count=counts["unprocessed"],
        added_hydrogen_count=len(additions),
        removed_hydrogen_count=len(removed),
        moved_hydrogen_count=len(moved),
        sites=sites,
        diagnostics=diagnostics,
        reason_counts=dict(sorted(reasons.items())),
        diagnostics_truncated=sum(reasons.values()) > len(diagnostics),
    )
    warnings = [
        MolecularWarning(
            code="model_hydrogen_reconciliation",
            operation=f"model.{operation}",
            message=(
                f"Bond edit retained; H reconciliation {report.status}: "
                f"{len(additions)} added, {len(removed)} removed, {len(moved)} moved. "
                "Ideal geometry is unoptimized; no protonation/preparation implied."
            ),
        )
    ]
    warnings.extend(
        MolecularWarning(
            code=f"model_hydrogen_{r}",
            operation=f"model.{operation}",
            message=f"H reconciliation: {n} diagnostics for {r}; inspect report.",
        )
        for r, n in sorted(reasons.items())
    )
    if counts["complete"]:
        after, stereo_warnings = reconcile_current_stereo(
            after,
            {s.atom_id for s in sites if s.status == "complete"},
            operation,
            row_budget=MAX_COORDINATES - rows,
            analyzed_atom_count=min(builder.analyzed, MAX_ANALYZED),
        )
        warnings.extend(stereo_warnings)
    return ReconciliationResult(after, report, tuple(warnings))
