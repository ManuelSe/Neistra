"""Reduced-coordinate local optimization using native RDKit energies and forces."""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import fields
from typing import Any

import numpy as np
from rdkit.Chem import AllChem
from scipy.optimize import minimize  # type: ignore[import-untyped]
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.jobs import JobContext
from molweave_core.minimization.contracts import CalculationError, CoordinateProposal
from molweave_core.minimization.optimize import geometry_stereo, introduces_severe_overlap
from molweave_core.minimization.quick_context import discover
from molweave_core.minimization.quick_contracts import (
    QUICK_FORCE_TOLERANCE,
    QuickParameters,
    QuickReport,
)
from molweave_core.minimization.quick_model import QuickAssembly, build_assembly

all_chem: Any = AllChem


class BudgetReached(Exception):
    pass


def force_field(assembly: QuickAssembly) -> tuple[Any, str]:
    mol = assembly.molecule
    if all_chem.MMFFHasAllMoleculeParams(mol):
        props = all_chem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94")
        props.SetMMFFDielectricModel(2)
        props.SetMMFFDielectricConstant(4.0)
        ff = all_chem.MMFFGetMoleculeForceField(
            mol, props, nonBondedThresh=100.0, ignoreInterfragInteractions=False
        )
        method = "MMFF94"
    elif all_chem.UFFHasAllMoleculeParams(mol):
        ff = all_chem.UFFGetMoleculeForceField(mol, ignoreInterfragInteractions=False)
        method = "UFF"
        assembly.warnings.append(
            "UFF fallback: electrostatic pocket interactions are not represented."
        )
    else:
        raise CalculationError("parameters_missing", "Local force-field parameters are unavailable")
    moving = set(assembly.movable)
    for i in range(mol.GetNumAtoms()):
        if i not in moving:
            ff.AddFixedPoint(i)
    ff.Initialize()
    return ff, method


def helper_keys(assembly: QuickAssembly) -> list[Any]:
    keys: list[Any] = []
    counts: dict[Any, int] = {}
    for i, ref in enumerate(assembly.references):
        if ref is not None:
            keys.append(ref)
        else:
            atom = assembly.molecule.GetAtomWithIdx(i)
            parent = next(
                (
                    assembly.references[n.GetIdx()]
                    for n in atom.GetNeighbors()
                    if assembly.references[n.GetIdx()] is not None
                ),
                None,
            )
            identity = (parent, atom.GetAtomicNum(), atom.GetIsotope())
            counts[identity] = counts.get(identity, 0) + 1
            keys.append(("helper", identity, counts[identity]))
    return keys


def declared_stereo(assembly: QuickAssembly, coordinates: Any) -> dict[int, str]:
    geometry = geometry_stereo(assembly.molecule, coordinates)
    expected = {}
    indices = {ref: i for i, ref in enumerate(assembly.references) if ref is not None}
    for entry, source in assembly.sources.items():
        for atom in source.atoms:
            i = indices.get((entry, atom.id))
            if i is not None and atom.stereo:
                expected[i] = f"CHI_{atom.stereo}"
        for bond in source.bonds:
            a, b = indices.get((entry, bond.atom_1_id)), indices.get((entry, bond.atom_2_id))
            if a is None or b is None or bond.stereo in {None, "", "NONE", "ANY"}:
                continue
            native = assembly.molecule.GetBondBetweenAtoms(a, b)
            if native is None or bond.stereo not in {"E", "Z"}:
                raise CalculationError(
                    "stereo_unsupported", "Declared bond stereochemistry cannot be assessed"
                )
            expected[assembly.molecule.GetNumAtoms() + native.GetIdx()] = f"STEREO{bond.stereo}"
    if any(geometry[i] != value for i, value in expected.items()):
        raise CalculationError(
            "stereo_conflict", "Coordinates conflict with declared stereochemistry"
        )
    return expected


def optimize(
    assembly: QuickAssembly,
    parameters: QuickParameters,
    context: JobContext,
    snapshot: Callable[..., None] | None = None,
) -> tuple[QuickReport, list[CoordinateProposal]]:
    started = time.monotonic()
    field_seconds = rebuild_seconds = 0.0
    keys = {(a.structure_id, a.atom_id) for a in parameters.selection.atoms}
    iterations = evaluations = rebuilds = 0
    termination = "iteration_limit"
    ff: Any = None
    method: Any = None
    original: Any = None
    full: Any = None
    moving: Any = None
    canonical: Any = None
    references: Any = None
    last: Any = None
    expected_stereo: dict[int, str] = {}

    def install(model: QuickAssembly, saved: dict[Any, Any] | None = None) -> None:
        nonlocal \
            assembly, \
            ff, \
            method, \
            original, \
            full, \
            moving, \
            canonical, \
            references, \
            last, \
            field_seconds, \
            expected_stereo
        if model is not assembly:
            for attribute in fields(QuickAssembly):
                setattr(assembly, attribute.name, getattr(model, attribute.name))
        original = model.coordinates.copy()
        full = original.copy()
        moving = np.asarray(model.movable, dtype=np.int64)
        canonical = np.asarray(
            [i for i in moving if model.references[i] is not None], dtype=np.int64
        )
        references = tuple(model.references[i] for i in canonical)
        expected_stereo = declared_stereo(model, original)
        if saved:
            for i in moving:
                identity = helper_keys_cache[i]
                if identity in saved:
                    full[i] = saved[identity]
        before = time.monotonic()
        ff, method = force_field(model)
        field_seconds += time.monotonic() - before
        last = full[moving].reshape(-1).copy()

    helper_keys_cache = helper_keys(assembly)
    install(assembly)

    def evaluate(flat: Any, check_budget: bool = True) -> tuple[float, Any]:
        nonlocal evaluations
        context.checkpoint()
        if check_budget and time.monotonic() - started > 15:
            raise BudgetReached
        full[moving] = np.asarray(flat).reshape((-1, 3))
        positions = full.reshape(-1).tolist()
        energy = float(ff.CalcEnergy(positions))
        gradient = (
            np.asarray(ff.CalcGrad(positions), dtype=np.float64)
            .reshape((-1, 3))[moving]
            .reshape(-1)
        )
        evaluations += 1
        if not np.isfinite(energy) or not np.isfinite(gradient).all():
            raise CalculationError(
                "nonfinite_objective", "Local objective or movable forces are nonfinite"
            )
        return energy, gradient

    def accepted(flat: Any) -> None:
        nonlocal iterations, last
        iterations += 1
        last = np.asarray(flat, dtype=np.float64).copy()
        context.checkpoint()
        full[moving] = last.reshape((-1, 3))
        if snapshot is not None:
            snapshot(iterations, references, full[canonical].copy())
        if iterations == 1 or iterations % 25 == 0:
            context.progress(
                30 + 60 * iterations / parameters.max_iterations,
                f"Quick relaxation iteration {iterations}",
            )

    try:
        while iterations < parameters.max_iterations:
            positions = {
                ref: tuple(float(v) for v in full[i])
                for i, ref in enumerate(assembly.references)
                if ref is not None and ref in keys
            }
            needed = discover(assembly.graphs, keys, assembly.protein, positions)
            if any(not ids <= set(assembly.modeled_atoms.get(e, [])) for e, ids in needed.items()):
                before = time.monotonic()
                for e, ids in assembly.modeled_atoms.items():
                    needed.setdefault(e, set()).update(ids)
                saved = {identity: full[i].copy() for i, identity in enumerate(helper_keys_cache)}
                new = build_assembly(assembly.sources, parameters, needed)
                helper_keys_cache = helper_keys(new)
                install(new, saved)
                rebuilds += 1
                rebuild_seconds += time.monotonic() - before
            _, gradient = evaluate(last)
            if np.max(np.abs(gradient)) <= QUICK_FORCE_TOLERANCE:
                termination = "converged"
                break
            center = last.copy()
            result = minimize(
                evaluate,
                center,
                jac=True,
                method="L-BFGS-B",
                callback=accepted,
                bounds=list(zip(center - 0.5, center + 0.5, strict=True)),
                options={
                    "gtol": QUICK_FORCE_TOLERANCE,
                    "ftol": 1e-7,
                    "maxiter": min(25, parameters.max_iterations - iterations),
                    "maxfun": 5000,
                },
            )
            last = np.asarray(result.x, dtype=np.float64)
            _, gradient = evaluate(last)
            if np.max(np.abs(gradient)) <= QUICK_FORCE_TOLERANCE:
                termination = "converged"
                break
            at_bound = bool(np.any(np.abs(last - center) >= 0.5 - 1e-8))
            if (result.success and not at_bound) or np.max(np.abs(last - center)) < 1e-9:
                termination = "stalled"
                break
    except BudgetReached:
        termination = "budget_limit"
    final_energy, gradient = evaluate(last, False)
    final = full.copy()
    # Both energies use exactly the final assembly, fixed rows, helpers and native objective.
    initial_energy, _ = evaluate(original[moving].reshape(-1), False)
    final_stereo = geometry_stereo(assembly.molecule, final)
    if any(final_stereo[i] != value for i, value in expected_stereo.items()):
        raise CalculationError(
            "stereo_changed", "Quick relaxation changed declared stereochemistry"
        )
    final_positions = {
        ref: tuple(float(v) for v in final[i])
        for i, ref in enumerate(assembly.references)
        if ref is not None and ref in keys
    }
    final_context = discover(assembly.graphs, keys, assembly.protein, final_positions, radius=6.0)
    if any(not ids <= set(assembly.modeled_atoms.get(e, [])) for e, ids in final_context.items()):
        raise CalculationError("context_guard", "Final coordinates escaped the local context guard")
    bonds = {
        frozenset((b.GetBeginAtomIdx(), b.GetEndAtomIdx())) for b in assembly.molecule.GetBonds()
    }
    overlaps = introduces_severe_overlap(original, final, moving, bonds, context.checkpoint)
    displacement = np.linalg.norm(final[canonical] - original[canonical], axis=1)
    improved = final_energy < initial_energy - max(1e-6, abs(initial_energy) * 1e-10)
    unchanged = bool(np.max(displacement) <= 1e-9)
    tree = cKDTree(final)
    clashes = sum(
        j > i and frozenset((int(i), j)) not in bonds
        for i in canonical
        for j in tree.query_ball_point(final[i], 0.6)
    )
    report = QuickReport(
        parameters=parameters,
        outcome="unchanged"
        if unchanged
        else "converged"
        if termination == "converged" and improved
        else "improved"
        if improved
        else "failed",
        reason="Local relaxation converged"
        if termination == "converged"
        else f"Local relaxation: {termination}",
        method=method,
        coverage="approximate" if method == "UFF" else "complete",
        initial_energy=initial_energy,
        final_energy=final_energy,
        maximum_gradient=float(np.max(np.abs(gradient))),
        iterations=iterations,
        evaluations=evaluations,
        maximum_displacement=float(displacement.max()),
        rms_displacement=float(np.sqrt(np.mean(displacement**2))),
        residual_clashes=clashes,
        new_severe_overlaps=overlaps,
        movable_count=len(canonical),
        fixed_count=sum(r is not None for r in assembly.references) - len(canonical),
        helper_count=sum(r is None for r in assembly.references),
        cap_count=assembly.cap_count,
        termination_kind=termination,
        warnings=assembly.warnings.copy(),
        assumptions=assembly.assumptions.copy(),
        modeled_atoms=assembly.modeled_atoms,
        timings={
            "force_field": field_seconds,
            "context_rebuild": rebuild_seconds,
            "context_rebuilds": float(rebuilds),
            "optimization": time.monotonic() - started - field_seconds,
        },
    )
    if overlaps:
        report.outcome = "failed"
        report.reason = "Local relaxation introduced a severe nonbonded overlap"
    if termination != "converged":
        report.warnings.append(
            f"Useful local improvement does not establish convergence ({termination})."
        )
    proposals = []
    mapped = {i: ref for i, ref in enumerate(assembly.references) if ref is not None}
    for capture in parameters.captured_inputs:
        rows = sorted(
            (i for i in canonical if mapped[i][0] == capture.entry_id), key=lambda i: mapped[i][1]
        )
        if rows:
            proposals.append(
                CoordinateProposal(
                    entry_id=capture.entry_id,
                    conformer_id=capture.conformer_id,
                    atom_ids=[mapped[i][1] for i in rows],
                    coordinates=[tuple(float(v) for v in final[i]) for i in rows],
                )
            )
    return report, proposals
