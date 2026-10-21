"""Reduced-coordinate local optimization using native RDKit energies and forces."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

import numpy as np
from rdkit.Chem import AllChem
from scipy.optimize import minimize  # type: ignore[import-untyped]

from molweave_core.jobs import JobContext
from molweave_core.minimization.contracts import CalculationError, CoordinateProposal
from molweave_core.minimization.optimize import geometry_stereo, introduces_severe_overlap
from molweave_core.minimization.quick_contracts import (
    QUICK_FORCE_TOLERANCE,
    QuickParameters,
    QuickReport,
)
from molweave_core.minimization.quick_model import QuickAssembly

all_chem: Any = AllChem


class BudgetReached(Exception):
    pass


def force_field(assembly: QuickAssembly) -> tuple[Any, str]:
    mol = assembly.molecule
    if all_chem.MMFFHasAllMoleculeParams(mol):
        props = all_chem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94")
        props.SetMMFFDielectricModel(2)
        props.SetMMFFDielectricConstant(4.0)
        ff = all_chem.MMFFGetMoleculeForceField(mol, props, ignoreInterfragInteractions=False)
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


def optimize(
    assembly: QuickAssembly,
    parameters: QuickParameters,
    context: JobContext,
    snapshot: Callable[..., None] | None = None,
) -> tuple[QuickReport, list[CoordinateProposal]]:
    started = time.monotonic()
    field_start = time.monotonic()
    ff, method = force_field(assembly)
    field_seconds = time.monotonic() - field_start
    original = assembly.coordinates.copy()
    full = original.copy()
    moving = np.asarray(assembly.movable, dtype=np.int64)
    canonical = np.asarray(
        [i for i in moving if assembly.references[i] is not None], dtype=np.int64
    )
    references = tuple(assembly.references[i] for i in canonical)
    initial_stereo = geometry_stereo(assembly.molecule, original)
    declared = {
        i
        for i, ref in enumerate(assembly.references)
        if ref and any(a.id == ref[1] and a.stereo for a in assembly.sources[ref[0]].atoms)
    }
    iterations = evaluations = 0
    last = original[moving].reshape(-1).copy()
    termination = "iteration_limit"

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

    initial_energy, initial_gradient = evaluate(last)
    if np.max(np.abs(initial_gradient)) <= QUICK_FORCE_TOLERANCE:
        termination = "converged"
    else:
        try:
            while iterations < parameters.max_iterations:
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
                if np.max(np.abs(last - center)) < 1e-9:
                    termination = "stalled"
                    break
        except BudgetReached:
            termination = "budget_limit"
    final_energy, gradient = evaluate(last, False)
    final = full.copy()
    final_stereo = geometry_stereo(assembly.molecule, final)
    if any(initial_stereo[i] != final_stereo[i] for i in declared):
        raise CalculationError(
            "stereo_changed", "Quick relaxation changed declared stereochemistry"
        )
    bonds = {
        frozenset((b.GetBeginAtomIdx(), b.GetEndAtomIdx())) for b in assembly.molecule.GetBonds()
    }
    overlaps = introduces_severe_overlap(original, final, canonical, bonds, context.checkpoint)
    displacement = np.linalg.norm(final[canonical] - original[canonical], axis=1)
    improved = final_energy < initial_energy - max(1e-6, abs(initial_energy) * 1e-10)
    unchanged = bool(np.max(displacement) <= 1e-9)
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
            (i for i in canonical if mapped[i][0] == capture.entry_id),
            key=lambda i: mapped[i][1],
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
