from __future__ import annotations

import time
from typing import Any

import numpy as np
import openmm
from numpy.typing import NDArray
from openmm import unit
from rdkit import Chem
from scipy.optimize import minimize  # type: ignore[import-untyped]
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.jobs import JobContext
from molweave_core.minimization.contracts import (
    GRADIENT_TOLERANCE,
    CalculationError,
    CoordinateProposal,
    MinimizationParameters,
    MinimizationReport,
)
from molweave_core.minimization.parameterization import Parameterized, finite_parameters
from molweave_core.minimization.preflight import IsolatedInput


def geometry_stereo(molecule: Any, coordinates: NDArray[np.float64]) -> tuple[str, ...]:
    copy = Chem.Mol(molecule)
    Chem.RemoveStereochemistry(copy)
    conformer = copy.GetConformer()
    for i, point in enumerate(coordinates):
        conformer.SetAtomPosition(i, tuple(float(v) for v in point))
    Chem.AssignStereochemistryFrom3D(copy, confId=conformer.GetId(), replaceExistingTags=True)
    return tuple(
        [str(a.GetChiralTag()) for a in copy.GetAtoms()]
        + [str(b.GetStereo()) for b in copy.GetBonds()]
    )


def validate_stereo_intent(value: IsolatedInput, perceived: tuple[str, ...]) -> None:
    for i, atom in enumerate(value.structure.atoms):
        if atom.stereo and f"CHI_{atom.stereo}" != perceived[i]:
            raise CalculationError(
                "stereo_conflict", "Current coordinates conflict with supplied tetrahedral intent"
            )
    offset = len(value.structure.atoms)
    for i, bond in enumerate(value.structure.bonds):
        if bond.stereo in {None, "", "NONE", "ANY"}:
            continue
        if bond.stereo not in {"E", "Z"}:
            raise CalculationError(
                "unsupported_stereo", "Bond stereo encoding lacks qualified reference semantics"
            )
        if f"STEREO{bond.stereo}" != perceived[offset + i]:
            raise CalculationError(
                "stereo_conflict", "Current coordinates conflict with supplied E/Z intent"
            )


def optimize_isolated(
    value: IsolatedInput,
    parameterized: Parameterized,
    parameters: MinimizationParameters,
    context: JobContext,
) -> tuple[MinimizationReport, CoordinateProposal]:
    original = np.asarray(value.structure.active_coordinates, dtype=np.float64)
    if cKDTree(original).query_pairs(1e-6):
        raise CalculationError(
            "singular_geometry", "Coincident atoms require explicit coordinate repair"
        )
    if not finite_parameters(parameterized.system):
        raise CalculationError("invalid_parameters", "Native model contains nonfinite parameters")
    movable = np.asarray(value.movable_indices, dtype=np.int64)
    full = original.copy() / 10  # coordinates in nm; fixed rows are never variables
    captured = full.copy()
    initial_stereo = geometry_stereo(value.molecule, original)
    validate_stereo_intent(value, initial_stereo)
    integrator = openmm.VerletIntegrator(0.001)
    engine = openmm.Context(
        parameterized.system, integrator, openmm.Platform.getPlatformByName("Reference")
    )
    evaluations = 0
    iterations = 0
    started = time.monotonic()

    def objective(flat: NDArray[np.float64]) -> tuple[float, NDArray[np.float64]]:
        nonlocal evaluations
        context.checkpoint()
        if time.monotonic() - started > 300:
            raise CalculationError("optimization_timeout", "Optimization exceeded 300 seconds")
        full[movable] = flat.reshape((-1, 3))
        engine.setPositions(full * unit.nanometer)
        state = engine.getState(getEnergy=True, getForces=True)
        energy = float(state.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole))
        gradient = -np.asarray(
            state.getForces(asNumpy=True).value_in_unit(unit.kilojoule_per_mole / unit.nanometer),
            dtype=np.float64,
        )[movable].reshape(-1)
        evaluations += 1
        if not np.isfinite(energy) or not np.isfinite(gradient).all():
            raise CalculationError("nonfinite_objective", "Energy or forces became nonfinite")
        return energy, gradient

    def iteration(_: NDArray[np.float64]) -> None:
        nonlocal iterations
        iterations += 1
        context.progress(
            35 + 55 * iterations / parameters.max_iterations,
            f"Optimization iteration {iterations}; convergence checked separately",
        )

    try:
        initial_energy, initial_gradient = objective(captured[movable].reshape(-1))
        if np.max(np.abs(initial_gradient)) <= GRADIENT_TOLERANCE:
            final_energy, gradient = initial_energy, initial_gradient
            final = original.copy()
            termination = "Initial movable gradient already meets tolerance"
        else:
            result = minimize(
                objective,
                captured[movable].reshape(-1),
                jac=True,
                method="L-BFGS-B",
                callback=iteration,
                options={
                    "gtol": GRADIENT_TOLERANCE,
                    "ftol": 0,
                    "maxiter": parameters.max_iterations,
                    "maxfun": 20_000,
                },
            )
            final_energy, gradient = objective(np.asarray(result.x, dtype=np.float64))
            final = original.copy()
            final[movable] = full[movable] * 10
            termination = str(result.message)
        maximum_gradient = float(np.max(np.abs(gradient)))
        converged = maximum_gradient <= GRADIENT_TOLERANCE
        if not np.array_equal(
            full[[i for i in range(len(full)) if i not in movable]],
            captured[[i for i in range(len(full)) if i not in movable]],
        ):
            raise CalculationError(
                "fixed_mask_failed", "Fixed coordinates changed during optimization"
            )
        if geometry_stereo(value.molecule, final) != initial_stereo:
            raise CalculationError(
                "stereo_changed", "Optimization changed current geometric stereochemistry"
            )
        if final_energy > initial_energy + max(1e-6, abs(initial_energy) * 1e-10):
            raise CalculationError(
                "objective_increased", "Final objective exceeds the initial objective"
            )
        displacement = np.linalg.norm(final[movable] - original[movable], axis=1)
        unchanged = bool(np.max(np.abs(final[movable] - original[movable])) <= 1e-9)
        bonded = {frozenset((b.atom_1_id, b.atom_2_id)) for b in value.structure.bonds}
        clashes = sum(
            frozenset((value.structure.atoms[i].id, value.structure.atoms[j].id)) not in bonded
            for i, j in cKDTree(final).query_pairs(0.6)
        )
        report = MinimizationReport(
            outcome="unchanged"
            if unchanged and converged
            else "converged"
            if converged
            else "non_converged",
            reason=termination,
            parameters=parameters,
            initial_energy=initial_energy,
            final_energy=final_energy,
            maximum_gradient=maximum_gradient,
            iterations=iterations,
            evaluations=evaluations,
            maximum_displacement=float(displacement.max()),
            rms_displacement=float(np.sqrt(np.mean(displacement**2))),
            residual_clashes=clashes,
            movable_count=len(movable),
            fixed_count=len(original) - len(movable),
            warnings=[
                "Local minimum is not a global/native conformation or validated binding pose.",
                "Residual clashes count nonbonded atom pairs closer than 0.6 angstrom.",
            ],
            elapsed_seconds=time.monotonic() - started,
        )
        proposal = CoordinateProposal(
            entry_id=value.entry_id,
            conformer_id=value.structure.active_conformer_id,
            atom_ids=[value.structure.atoms[i].id for i in movable],
            coordinates=[tuple(float(v) for v in final[i]) for i in movable],
        )
        return report, proposal
    finally:
        engine = None
        del integrator
