from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import openmm
import pytest
from molweave_core.minimization.assembly import Assembly, environment_preflight
from molweave_core.minimization.context_model import parameterize_environment
from molweave_core.minimization.optimize import optimize_environment
from molweave_core.minimization.parameterization import Parameterized
from molweave_core.minimization.plugin import plugin
from molweave_core.minimization.templates import STATES, read_templates
from molweave_core.minimization.toolchain import AmberTools
from openmm import unit

from tests.support.minimization import (
    LocalContext,
    combined,
    environment_capture,
    molecule,
    peptide,
    translated,
)


@pytest.fixture
def tools() -> AmberTools:
    if not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"):
        pytest.skip("Install/export locked AmberTools for native model qualification")
    return AmberTools.discover()


def energy_gradient(value: Assembly, model: Parameterized) -> tuple[float, np.ndarray]:
    integrator = openmm.VerletIntegrator(0.001)
    context = openmm.Context(
        model.system, integrator, openmm.Platform.getPlatformByName("Reference")
    )
    context.setPositions(np.asarray(value.coordinates) * unit.angstrom)
    state = context.getState(getEnergy=True, getForces=True)
    return (
        state.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole),
        -state.getForces(asNumpy=True).value_in_unit(unit.kilojoule_per_mole / unit.nanometer),
    )


def test_same_and_separate_entries_give_equivalent_coupled_calculations(
    tmp_path: Path,
    tools: AmberTools,
) -> None:
    protein = peptide()
    ligand = translated(molecule(), (2, 4, 3.5))
    joined = combined(protein, ligand)
    results = []
    for label, sources, selected in [
        (
            "same",
            {"complex": joined},
            {"complex": [len(protein.atoms) + a.id for a in ligand.atoms]},
        ),
        (
            "separate",
            {"protein": protein, "ligand": ligand},
            {"ligand": [a.id for a in ligand.atoms]},
        ),
    ]:
        parameters, inputs = environment_capture(sources, selected)
        value = environment_preflight(parameters, inputs, read_templates(tools.prefix))
        context = LocalContext(tmp_path)
        model = parameterize_environment(value, tools, tmp_path / label, context)
        report, proposals = optimize_environment(value, model, parameters, context)
        assert report.outcome == "converged", report
        assert report.maximum_gradient <= 10
        assert report.final_energy < report.initial_energy
        assert report.fixed_count == len(protein.atoms)
        assert len(proposals) == 1
        results.append((report, np.asarray(proposals[0].coordinates)))
    assert results[0][0].initial_energy == pytest.approx(results[1][0].initial_energy, abs=1e-3)
    np.testing.assert_allclose(results[0][1], results[1][1], atol=0.02)
    assert joined.to_bytes() == combined(protein, ligand).to_bytes()


def test_context_changes_real_ligand_forces_and_optimized_outcome(
    tmp_path: Path,
    tools: AmberTools,
) -> None:
    protein = peptide()
    ligand = translated(molecule(), (2, 4, 3.5))
    records = []
    for label, sources in [
        ("near", {"protein": protein, "ligand": ligand}),
        ("absent", {"ligand": ligand}),
    ]:
        parameters, inputs = environment_capture(sources, {"ligand": [a.id for a in ligand.atoms]})
        value = environment_preflight(parameters, inputs, read_templates(tools.prefix))
        model = parameterize_environment(value, tools, tmp_path / label, LocalContext(tmp_path))
        energy, gradient = energy_gradient(value, model)
        rows = [i for i, ref in enumerate(value.references) if ref[0] == "ligand"]
        report, proposals = optimize_environment(value, model, parameters, LocalContext(tmp_path))
        assert report.outcome == "converged"
        records.append((energy, gradient[rows], np.asarray(proposals[0].coordinates)))
    assert abs(records[0][0] - records[1][0]) > 1
    assert np.max(np.abs(records[0][1] - records[1][1])) > 1
    assert np.max(np.abs(records[0][2] - records[1][2])) > 0.05


def test_movable_residue_boundary_preserves_native_terms_and_fixed_rows(
    tmp_path: Path,
    tools: AmberTools,
) -> None:
    protein = peptide()
    selected = [a.id for a in protein.atoms if a.residue_id == 2]
    parameters, inputs = environment_capture({"protein": protein}, {"protein": selected})
    value = environment_preflight(parameters, inputs, read_templates(tools.prefix))
    model = parameterize_environment(value, tools, tmp_path / "model", LocalContext(tmp_path))
    moving = {i for i, ref in enumerate(value.references) if ref in value.movable}
    for kind, count, getter, width in [
        ("HarmonicBondForce", "getNumBonds", "getBondParameters", 2),
        ("HarmonicAngleForce", "getNumAngles", "getAngleParameters", 3),
        ("PeriodicTorsionForce", "getNumTorsions", "getTorsionParameters", 4),
    ]:
        force = next(f for f in model.system.getForces() if type(f).__name__ == kind)
        assert any(
            0 < len(set(getattr(force, getter)(i)[:width]) & moving) < width
            for i in range(getattr(force, count)())
        )
    nonbonded = next(f for f in model.system.getForces() if isinstance(f, openmm.NonbondedForce))
    assert nonbonded.getNonbondedMethod() == openmm.NonbondedForce.CutoffNonPeriodic
    assert nonbonded.getCutoffDistance().value_in_unit(unit.nanometer) == 1.2
    assert nonbonded.getUseSwitchingFunction()
    assert nonbonded.getSwitchingDistance().value_in_unit(unit.nanometer) == 1.0
    assert nonbonded.getReactionFieldDielectric() == 78.3
    crossing = [
        nonbonded.getExceptionParameters(i)
        for i in range(nonbonded.getNumExceptions())
        if len(set(nonbonded.getExceptionParameters(i)[:2]) & moving) == 1
    ]
    assert any(
        abs(q.value_in_unit(unit.elementary_charge**2)) > 0
        and epsilon.value_in_unit(unit.kilojoule_per_mole) > 0
        for _, _, q, _, epsilon in crossing
    )
    assert any(
        q.value_in_unit(unit.elementary_charge**2) == 0
        and epsilon.value_in_unit(unit.kilojoule_per_mole) == 0
        for _, _, q, _, epsilon in crossing
    )
    report, proposals = optimize_environment(value, model, parameters, LocalContext(tmp_path))
    assert report.outcome == "converged"
    assert set(proposals[0].atom_ids) == set(selected)
    assert protein.to_bytes() == inputs[0].data


def test_real_environment_plugin_retains_mapping_and_model_artifacts(
    tmp_path: Path,
    tools: AmberTools,
) -> None:
    ligand = translated(molecule(), (2, 4, 3.5))
    parameters, inputs = environment_capture(
        {"protein": peptide(), "ligand": ligand}, {"ligand": [3], "protein": [7]}
    )
    result = plugin.execute("coordinates.minimize", parameters, inputs, LocalContext(tmp_path))
    report = json.loads(next(a.data for a in result.artifacts if a.role == "report"))
    assert report["outcome"] == "converged", report
    assert report["toolchain"]["residue_templates"] == ["NALA", "GLY", "CSER"]
    assert report["toolchain"]["cutoff_nm"] == 1.2
    proposal = json.loads(next(a.data for a in result.artifacts if a.role == "proposal"))
    assert [p["entry_id"] for p in proposal["entries"]] == ["ligand", "protein"]
    assert len(report["toolchain"]["mapping"]) == len(peptide().atoms) + len(ligand.atoms)
    assert any(a.role == "model" for a in result.artifacts)


def test_context_force_derivatives_and_native_one_four_scaling(tmp_path: Path, tools: AmberTools):
    source = peptide()
    params, inputs = environment_capture({"p": source}, {"p": [7]})
    value = environment_preflight(params, inputs, read_templates(tools.prefix))
    model = parameterize_environment(value, tools, tmp_path / "model", LocalContext(tmp_path))
    _, analytical = energy_gradient(value, model)
    integrator = openmm.VerletIntegrator(0.001)
    engine = openmm.Context(
        model.system, integrator, openmm.Platform.getPlatformByName("Reference")
    )
    positions = np.asarray(value.coordinates) / 10
    rows = [i for i, ref in enumerate(value.references) if ref[1] in {3, 6, 7, 14}]
    for row in rows:
        for axis in range(3):
            energies = []
            for sign in [-1, 1]:
                point = positions.copy()
                point[row, axis] += sign * 1e-6
                engine.setPositions(point * unit.nanometer)
                energies.append(
                    engine.getState(getEnergy=True)
                    .getPotentialEnergy()
                    .value_in_unit(unit.kilojoule_per_mole)
                )
            assert analytical[row, axis] == pytest.approx(
                (energies[1] - energies[0]) / 2e-6, abs=1e-2, rel=1e-5
            )
    force = next(f for f in model.system.getForces() if isinstance(f, openmm.NonbondedForce))
    verified = 0
    for i in range(force.getNumExceptions()):
        first, second, charge, _, epsilon = force.getExceptionParameters(i)
        if epsilon.value_in_unit(unit.kilojoule_per_mole) <= 0:
            continue
        q1, _, e1 = force.getParticleParameters(first)
        q2, _, e2 = force.getParticleParameters(second)
        assert charge.value_in_unit(unit.elementary_charge**2) == pytest.approx(
            (q1 * q2).value_in_unit(unit.elementary_charge**2) / 1.2
        )
        assert epsilon.value_in_unit(unit.kilojoule_per_mole) == pytest.approx(
            (e1 * e2).sqrt().value_in_unit(unit.kilojoule_per_mole) / 2
        )
        verified += 1
    assert verified > 10


def test_explicit_complete_water_is_fixed_and_retains_native_terms(
    tmp_path: Path, tools: AmberTools
):
    from tests.support.minimization import water

    ligand = molecule()
    fixed_water = translated(water(), (0, 0, 4))
    params, inputs = environment_capture({"l": ligand, "w": fixed_water}, {"l": [3]})
    value = environment_preflight(params, inputs, read_templates(tools.prefix))
    model = parameterize_environment(value, tools, tmp_path / "model", LocalContext(tmp_path))
    assert model.provenance["water_auxiliary_distance_terms"] == 1
    assert model.system.getNumConstraints() == 0
    report, proposals = optimize_environment(value, model, params, LocalContext(tmp_path))
    assert report.outcome == "converged"
    assert report.fixed_count == len(ligand.atoms) + 2
    assert [p.entry_id for p in proposals] == ["l"]
    assert fixed_water.to_bytes() == next(i.data for i in inputs if i.entry_id == "w")


def test_native_neighbor_handling_updates_after_large_motion(tmp_path: Path, tools: AmberTools):
    ligand = translated(molecule(), (2, 4, 3.5))
    params, inputs = environment_capture({"p": peptide(), "l": ligand}, {"l": [3]})
    value = environment_preflight(params, inputs, read_templates(tools.prefix))
    model = parameterize_environment(value, tools, tmp_path / "model", LocalContext(tmp_path))
    integrator = openmm.VerletIntegrator(0.001)
    engine = openmm.Context(
        model.system,
        integrator,
        openmm.Platform.getPlatformByName("CPU"),
        {"Threads": "1", "DeterministicForces": "true"},
    )
    original = np.asarray(value.coordinates) / 10
    moving = [i for i, ref in enumerate(value.references) if ref[0] == "l"]
    gradients = []
    for shift in [0, 10, 0]:
        positions = original.copy()
        positions[moving, 0] += shift
        engine.setPositions(positions * unit.nanometer)
        gradients.append(
            engine.getState(getForces=True)
            .getForces(asNumpy=True)
            .value_in_unit(unit.kilojoule_per_mole / unit.nanometer)[moving]
            .copy()
        )
    assert np.max(np.abs(gradients[0] - gradients[1])) > 1
    np.testing.assert_allclose(gradients[0], gradients[2], atol=1e-4, rtol=1e-5)


def test_isolated_protein_uses_one_complete_chain_without_a_cutoff(
    tmp_path: Path, tools: AmberTools
):
    parameters, inputs = environment_capture({"p": peptide()}, {"p": [7]})
    parameters = parameters.model_copy(update={"mode": "isolated"})
    result = plugin.execute("coordinates.minimize", parameters, inputs, LocalContext(tmp_path))
    report = json.loads(next(a.data for a in result.artifacts if a.role == "report"))
    assert report["outcome"] == "converged", report
    assert report["toolchain"]["nonbonded"] == "NoCutoff"
    assert report["toolchain"]["cutoff_nm"] is None
    assert report["movable_count"] == 1
    assert report["fixed_count"] == len(peptide().atoms) - 1


@pytest.mark.parametrize("state", sorted({s for values in STATES.values() for s in values}))
def test_all26_internal_states_generate_finite_native_models_and_consistent_forces(
    tmp_path: Path, tools: AmberTools, state: str
):
    from molweave_core.minimization.parameterization import finite_parameters
    from molweave_core.minimization.stereo import assembly_stereo_validator

    from tests.support.minimization import protein_state_chain, protein_state_templates

    source = protein_state_chain(("NALA", state, "CALA"))
    params, inputs = environment_capture({"p": source}, {"p": [7]})
    templates = read_templates(tools.prefix)
    assert templates[state] == protein_state_templates()[state]
    assembly = environment_preflight(params, inputs, templates)
    assembly_stereo_validator(assembly)
    model = parameterize_environment(assembly, tools, tmp_path / state, LocalContext(tmp_path))
    assert model.system.getNumParticles() == len(source.atoms)
    assert model.system.getNumConstraints() == 0 and finite_parameters(model.system)
    integrator = openmm.VerletIntegrator(0.001)
    engine = openmm.Context(
        model.system, integrator, openmm.Platform.getPlatformByName("Reference")
    )
    try:
        coordinates = np.asarray(assembly.coordinates) / 10
        engine.setPositions(coordinates)
        state_value = engine.getState(getEnergy=True, getForces=True)
        assert np.isfinite(state_value.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole))
        forces = state_value.getForces(asNumpy=True).value_in_unit(
            unit.kilojoule_per_mole / unit.nanometer
        )
        assert np.isfinite(forces).all()
        # Independent central energy difference at a side-chain site when present.
        middle = assembly.components[0].residues[1]
        atom = next((i for i, name in enumerate(middle.template.atom_names) if name == "CB"), 0)
        row = assembly.references.index(("p", middle.atom_ids[atom]))
        energies = []
        for sign in [-1, 1]:
            shifted = coordinates.copy()
            shifted[row, 0] += sign * 1e-6
            engine.setPositions(shifted)
            energies.append(
                engine.getState(getEnergy=True)
                .getPotentialEnergy()
                .value_in_unit(unit.kilojoule_per_mole)
            )
        assert -forces[row, 0] == pytest.approx(
            (energies[1] - energies[0]) / 2e-6, rel=1e-5, abs=0.02
        )
    finally:
        del engine, integrator
