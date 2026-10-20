"""Profile fixed-only cost; no production energy terms are omitted."""

from __future__ import annotations

import os
import statistics
import time
from pathlib import Path

import numpy as np
import openmm
import pytest
from molweave_core.minimization.assembly import Assembly, environment_preflight
from molweave_core.minimization.context_model import parameterize_environment
from molweave_core.minimization.templates import read_templates
from molweave_core.minimization.toolchain import AmberTools
from openmm import unit

from tests.integration.test_minimization_performance import prepared_pocket, retain
from tests.support.minimization import LocalContext, environment_capture


@pytest.mark.parametrize("copies", [1, 8])
def test_fixed_only_cost_is_profiled_without_changing_the_model(tmp_path: Path, copies: int):
    if not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"):
        pytest.skip("Locked native toolchain required for fixed-only profiling")
    sources = {f"entry-{i}": s for i, s in enumerate(prepared_pocket(copies))}
    ligand = f"entry-{copies}"
    parameters, inputs = environment_capture(
        sources, {ligand: [a.id for a in sources[ligand].atoms]}
    )
    tools = AmberTools.discover()
    full = environment_preflight(parameters, inputs, read_templates(tools.prefix))
    fixed = Assembly(tuple(c for c in full.components if c.kind == "protein"), frozenset())
    results = {}
    engines = []
    for name, assembly in [("full", full), ("fixed_only", fixed)]:
        model = parameterize_environment(assembly, tools, tmp_path / name, LocalContext(tmp_path))
        integrator = openmm.VerletIntegrator(0.001)
        engine = openmm.Context(
            model.system, integrator, openmm.Platform.getPlatformByName("CPU"), {"Threads": "1"}
        )
        engines.append((engine, integrator))
        positions = np.asarray(assembly.coordinates) / 10.0
        timings = []
        energy = 0.0
        forces = None
        for iteration in range(16):
            engine.setPositions(positions * unit.nanometer)
            start = time.perf_counter()
            state = engine.getState(getEnergy=True, getForces=True)
            energy = state.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)
            forces = state.getForces(asNumpy=True).value_in_unit(
                unit.kilojoule_per_mole / unit.nanometer
            )
            if iteration >= 4:
                timings.append(time.perf_counter() - start)
        assert np.isfinite(energy) and np.isfinite(forces).all()
        results[name] = {
            "median_seconds": statistics.median(timings),
            "seconds": timings,
            "energy_kj_mol": energy,
            "atoms": len(assembly.atoms),
        }
    engine = engines[0][0]
    positions = np.asarray(full.coordinates) / 10.0
    index = next(i for i, ref in enumerate(full.references) if ref in full.movable)
    engine.setPositions(positions * unit.nanometer)
    gradient = (
        -engine.getState(getForces=True)
        .getForces(asNumpy=True)
        .value_in_unit(unit.kilojoule_per_mole / unit.nanometer)[index, 0]
    )
    # The fixed-only energy is a constant for these variables. Subtracting it
    # preserves the derivative but is not itself a computational optimization.
    epsilon = 1e-3
    energies = []
    for sign in [-1, 1]:
        trial = positions.copy()
        trial[index, 0] += sign * epsilon
        engine.setPositions(trial * unit.nanometer)
        energies.append(
            engine.getState(getEnergy=True)
            .getPotentialEnergy()
            .value_in_unit(unit.kilojoule_per_mole)
        )
    offset = results["fixed_only"]["energy_kj_mol"]
    derivative = (energies[1] - energies[0]) / (2 * epsilon)
    shifted = ((energies[1] - offset) - (energies[0] - offset)) / (2 * epsilon)
    assert shifted == pytest.approx(derivative, abs=1e-7)
    assert derivative == pytest.approx(gradient, rel=0.03, abs=1.0)
    retain(
        f"fixed-cost-{copies}",
        {
            "engine": openmm.__version__,
            "platform": "CPU",
            "threads": 1,
            "model": "amber-local-v1",
            "toolchain": tools.provenance,
            "samples": results,
            "fixed_to_full_cost_ratio": results["fixed_only"]["median_seconds"]
            / results["full"]["median_seconds"],
            "movable_gradient": float(gradient),
            "finite_difference": derivative,
            "offset_finite_difference": shifted,
            "limitation": "Subsystem cost is a potential opportunity, "
            "not measured production speedup; "
            "no production terms are omitted. Neutral biotin and distant translated chains "
            "are qualification assumptions, not a biological assembly.",
        },
        tmp_path,
    )
