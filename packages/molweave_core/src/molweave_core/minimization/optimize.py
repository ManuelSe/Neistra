from __future__ import annotations

import time
from collections.abc import Callable

import numpy as np
import openmm
from numpy.typing import NDArray
from openmm import unit
from scipy.optimize import minimize  # type: ignore[import-untyped]
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.jobs import JobContext
from molweave_core.minimization.assembly import Assembly
from molweave_core.minimization.contracts import (
    GRADIENT_TOLERANCE,
    CalculationError,
    CoordinateProposal,
    MinimizationParameters,
    MinimizationReport,
)
from molweave_core.minimization.geometry import geometry_stereo, introduces_severe_overlap
from molweave_core.minimization.parameterization import Parameterized, finite_parameters
from molweave_core.minimization.preflight import IsolatedInput

SnapshotCallback = Callable[[int, tuple[tuple[str, int], ...], NDArray[np.float64]], None]


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
    snapshot: SnapshotCallback | None = None,
) -> tuple[MinimizationReport, CoordinateProposal]:
    original = np.asarray(value.structure.active_coordinates, dtype=np.float64)
    initial_stereo = geometry_stereo(value.molecule, original)
    validate_stereo_intent(value, initial_stereo)

    def validate(coordinates: NDArray[np.float64]) -> None:
        if geometry_stereo(value.molecule, coordinates) != initial_stereo:
            raise CalculationError(
                "stereo_changed", "Optimization changed geometric stereochemistry"
            )

    references = [(value.entry_id, a.id) for a in value.structure.atoms]
    indices = {a.id: i for i, a in enumerate(value.structure.atoms)}
    bonds = {frozenset((indices[b.atom_1_id], indices[b.atom_2_id])) for b in value.structure.bonds}
    report, proposals = optimize_coordinates(
        original,
        references,
        value.movable_indices,
        bonds,
        validate,
        parameterized,
        parameters,
        context,
        snapshot,
    )
    return report, proposals[0]


def optimize_environment(
    value: Assembly,
    parameterized: Parameterized,
    parameters: MinimizationParameters,
    context: JobContext,
    snapshot: SnapshotCallback | None = None,
) -> tuple[MinimizationReport, list[CoordinateProposal]]:
    from molweave_core.minimization.stereo import assembly_stereo_validator

    movable = tuple(i for i, ref in enumerate(value.references) if ref in value.movable)
    return optimize_coordinates(
        np.asarray(value.coordinates, dtype=np.float64),
        list(value.references),
        movable,
        set(value.bonds),
        assembly_stereo_validator(value),
        parameterized,
        parameters,
        context,
        snapshot,
    )


def optimize_coordinates(
    original: NDArray[np.float64],
    references: list[tuple[str, int]],
    movable_indices: tuple[int, ...],
    bonds: set[frozenset[int]],
    validate_stereo: Callable[[NDArray[np.float64]], None],
    parameterized: Parameterized,
    parameters: MinimizationParameters,
    context: JobContext,
    snapshot: SnapshotCallback | None = None,
) -> tuple[MinimizationReport, list[CoordinateProposal]]:
    if np.any(cKDTree(original).query(original, k=2)[0][:, 1] < 1e-6):
        raise CalculationError(
            "singular_geometry", "Coincident atoms require explicit coordinate repair"
        )
    if not finite_parameters(parameterized.system):
        raise CalculationError("invalid_parameters", "Native model contains nonfinite parameters")
    movable = np.asarray(movable_indices, dtype=np.int64)
    fixed = np.ones(len(original), dtype=bool)
    fixed[movable] = False
    full = original.copy() / 10  # coordinates in nm; fixed rows are never variables
    captured = full.copy()
    integrator = openmm.VerletIntegrator(0.001)
    platform = "CPU" if parameters.mode == "environment" else "Reference"
    engine = openmm.Context(
        parameterized.system,
        integrator,
        openmm.Platform.getPlatformByName(platform),
        {"Threads": "1", "DeterministicForces": "true"} if platform == "CPU" else {},
    )
    evaluations = 0
    iterations = 0
    started = time.monotonic()
    last_progress = started - 1
    movable_references = tuple(references[int(i)] for i in movable)

    def objective(flat: NDArray[np.float64]) -> tuple[float, NDArray[np.float64]]:
        nonlocal evaluations
        context.checkpoint()
        if time.monotonic() - started > 300:
            raise CalculationError("optimization_timeout", "Optimization exceeded 300 seconds")
        full[movable] = flat.reshape((-1, 3))
        engine.setPositions(full * unit.nanometer)
        state = engine.getState(getEnergy=True, getForces=True)
        energy = float(state.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole))
        forces = np.asarray(
            state.getForces(asNumpy=True).value_in_unit(unit.kilojoule_per_mole / unit.nanometer),
            dtype=np.float64,
        )
        gradient = -forces[movable].reshape(-1)
        evaluations += 1
        if not np.isfinite(energy) or not np.isfinite(forces).all():
            raise CalculationError("nonfinite_objective", "Energy or forces became nonfinite")
        return energy, gradient

    def iteration(accepted: NDArray[np.float64]) -> None:
        nonlocal iterations, last_progress
        iterations += 1
        context.checkpoint()
        if snapshot is not None:
            snapshot(iterations, movable_references, np.asarray(accepted).reshape((-1, 3)) * 10)
        now = time.monotonic()
        if now - last_progress >= 1:
            context.progress(
                35 + 55 * iterations / parameters.max_iterations,
                f"Optimization iteration {iterations}; convergence checked separately",
            )
            last_progress = now

    try:
        initial_energy, initial_gradient = objective(captured[movable].reshape(-1))
        ordinary_iteration_limit = False
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
            ordinary_iteration_limit = (
                result.status == 1
                and result.nit >= parameters.max_iterations
                and result.nfev < 20_000
                and termination == "STOP: TOTAL NO. OF ITERATIONS REACHED LIMIT"
            )
        maximum_gradient = float(np.max(np.abs(gradient)))
        converged = maximum_gradient <= GRADIENT_TOLERANCE
        if not np.array_equal(
            full[fixed],
            captured[fixed],
        ):
            raise CalculationError(
                "fixed_mask_failed", "Fixed coordinates changed during optimization"
            )
        validate_stereo(final)
        if final_energy > initial_energy + max(1e-6, abs(initial_energy) * 1e-10):
            raise CalculationError(
                "objective_increased", "Final objective exceeds the initial objective"
            )
        displacement = np.linalg.norm(final[movable] - original[movable], axis=1)
        unchanged = bool(np.max(np.abs(final[movable] - original[movable])) <= 1e-9)
        # Count locally without materializing all pair combinations, even for dense input.
        tree = cKDTree(final)
        new_severe_overlaps = introduces_severe_overlap(
            original, final, movable, bonds, context.checkpoint
        )
        clashes = sum(
            1
            for i in range(len(final))
            for j in tree.query_ball_point(final[i], 0.6)
            if j > i and frozenset((i, j)) not in bonds
        )
        report = MinimizationReport(
            schema_version=2 if parameters.schema_version == 2 else 1,
            outcome="unchanged"
            if unchanged and converged
            else "converged"
            if converged
            else "non_converged",
            reason=termination,
            termination_kind="converged"
            if converged
            else "iteration_limit"
            if ordinary_iteration_limit
            else "abnormal",
            new_severe_overlaps=new_severe_overlaps,
            nonconverged_eligible=(
                not converged
                and parameters.acceptance_policy == "interactive"
                and ordinary_iteration_limit
                and not new_severe_overlaps
                and final_energy < initial_energy - max(1e-6, abs(initial_energy) * 1e-10)
            ),
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
            toolchain={
                "engine": "OpenMM",
                "engine_version": openmm.__version__,
                "platform": platform,
                "platform_threads": 1,
                "solver": "SciPy L-BFGS-B",
                "solver_variables": "movable coordinates only",
            },
        )
        proposals = []
        for capture in parameters.captured_inputs:
            rows = sorted(
                (int(i) for i in movable if references[i][0] == capture.entry_id),
                key=lambda i: references[i][1],
            )
            if rows:
                proposals.append(
                    CoordinateProposal(
                        entry_id=capture.entry_id,
                        conformer_id=capture.conformer_id,
                        atom_ids=[references[i][1] for i in rows],
                        coordinates=[tuple(float(v) for v in final[i]) for i in rows],
                    )
                )
        return report, proposals
    finally:
        engine = None
        del integrator
