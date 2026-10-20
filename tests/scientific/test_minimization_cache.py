from __future__ import annotations

import os

import numpy as np
import openmm
import pytest
from molweave_core.minimization.assembly import environment_preflight
from molweave_core.minimization.context_model import parameterize_environment
from molweave_core.minimization.parameter_cache import ParameterCache
from molweave_core.minimization.templates import read_templates
from molweave_core.minimization.toolchain import AmberTools
from openmm import unit

from tests.support.minimization import (
    LocalContext,
    environment_capture,
    molecule,
    peptide,
    translated,
)

pytestmark = pytest.mark.skipif(
    not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"),
    reason="Locked native cache qualification required",
)


def evaluated(system, coordinates):
    integrator = openmm.VerletIntegrator(0.001)
    engine = openmm.Context(system, integrator, openmm.Platform.getPlatformByName("Reference"))
    engine.setPositions(np.asarray(coordinates) / 10 * unit.nanometer)
    state = engine.getState(getEnergy=True, getForces=True)
    return (
        state.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole),
        np.asarray(
            state.getForces(asNumpy=True).value_in_unit(unit.kilojoule_per_mole / unit.nanometer)
        ),
    )


def test_native_cache_preserves_forces_reuses_receptor_and_respects_charge_geometry(
    tmp_path, monkeypatch
):
    tools = AmberTools.discover()
    templates = read_templates(tools.prefix)
    cache = ParameterCache(tmp_path / "cache")
    context = LocalContext(tmp_path)
    calls = []
    original = AmberTools.run

    def run(self, program, arguments, directory, context, deadline):
        calls.append(program)
        return original(self, program, arguments, directory, context, deadline)

    monkeypatch.setattr(AmberTools, "run", run)

    def assembly(protein_offset=0.0, ligand_offset=0.0, selected=3, smiles="CCO"):
        params, inputs = environment_capture(
            {
                "protein": translated(peptide(), (protein_offset, 0, 0)),
                "ligand": translated(molecule(smiles), (2 + ligand_offset, 4, 3.5)),
            },
            {"ligand": [selected]},
        )
        return environment_preflight(params, inputs, templates)

    value = assembly()
    cold = parameterize_environment(value, tools, tmp_path / "cold", context, cache=cache)
    assert not cold.provenance["parameter_cache"]["hit"]
    assert "antechamber" in calls and "tleap" in calls
    calls.clear()
    changed_selection = assembly(selected=1)
    warm = parameterize_environment(
        changed_selection, tools, tmp_path / "warm", context, cache=cache
    )
    assert warm.provenance["parameter_cache"]["hit"] and calls == []
    first, second = (
        evaluated(cold.system, value.coordinates),
        evaluated(warm.system, value.coordinates),
    )
    assert first[0] == pytest.approx(second[0], abs=1e-8)
    np.testing.assert_allclose(first[1], second[1], rtol=1e-9, atol=1e-7)

    moved_protein = assembly(protein_offset=0.03)
    reused = parameterize_environment(
        moved_protein, tools, tmp_path / "protein-moved", context, cache=cache
    )
    assert reused.provenance["parameter_cache"]["hit"] and calls == []
    uncached = parameterize_environment(moved_protein, tools, tmp_path / "reference", context)
    actual, expected = (
        evaluated(reused.system, moved_protein.coordinates),
        evaluated(uncached.system, moved_protein.coordinates),
    )
    assert actual[0] == pytest.approx(expected[0], abs=1e-7)
    np.testing.assert_allclose(actual[1], expected[1], rtol=1e-9, atol=1e-7)
    calls.clear()

    moved_ligand = assembly(ligand_offset=0.02)
    recharged = parameterize_environment(
        moved_ligand, tools, tmp_path / "ligand-moved", context, cache=cache
    )
    assert not recharged.provenance["parameter_cache"]["hit"]
    assert "antechamber" in calls
    assert any(
        record["kind"] == "protein" and record["hit"]
        for record in recharged.provenance["component_caches"]
    )
    assert (
        recharged.provenance["charge_normalizations"][0]["charge_input_sha256"]
        != cold.provenance["charge_normalizations"][0]["charge_input_sha256"]
    )

    # A corrupt assembled entry must rebuild under the same qualified force field.
    key = warm.provenance["parameter_cache"]["key"]
    (cache.root / f"assembly-{key}" / "model.prmtop").write_bytes(b"corrupt")
    calls.clear()
    repaired = parameterize_environment(value, tools, tmp_path / "repaired", context, cache=cache)
    assert not repaired.provenance["parameter_cache"]["hit"]
    assert calls == ["tleap"]  # Both validated component preparations remain reusable.
    repaired_energy, repaired_forces = evaluated(repaired.system, value.coordinates)
    assert repaired_energy == pytest.approx(first[0], abs=1e-8)
    np.testing.assert_allclose(repaired_forces, first[1], rtol=1e-9, atol=1e-7)
    assert (tmp_path / "warm/model.prmtop").read_bytes() == (
        tmp_path / "cold/model.prmtop"
    ).read_bytes()

    calls.clear()
    protonated = assembly(smiles="CC[NH3+]")
    changed = parameterize_environment(
        protonated, tools, tmp_path / "protonated", context, cache=cache
    )
    assert not changed.provenance["parameter_cache"]["hit"] and "antechamber" in calls
    assert changed.provenance["charge_normalizations"][0]["target_total_e"] == 1
    assert any(
        record["kind"] == "protein" and record["hit"]
        for record in changed.provenance["component_caches"]
    )


def test_native_model_settings_are_part_of_assembled_cache_identity(tmp_path):
    tools = AmberTools.discover()
    params, inputs = environment_capture({"protein": peptide()}, {"protein": [7]})
    value = environment_preflight(params, inputs, read_templates(tools.prefix))
    cache = ParameterCache(tmp_path / "cache")
    context = LocalContext(tmp_path)
    isolated = parameterize_environment(
        value, tools, tmp_path / "isolated", context, isolated=True, cache=cache
    )
    environment = parameterize_environment(
        value, tools, tmp_path / "environment", context, cache=cache
    )
    warm = parameterize_environment(value, tools, tmp_path / "warm", context, cache=cache)
    assert not isolated.provenance["parameter_cache"]["hit"]
    assert not environment.provenance["parameter_cache"]["hit"]
    assert warm.provenance["parameter_cache"]["hit"]
    assert (
        isolated.provenance["parameter_cache"]["key"]
        != environment.provenance["parameter_cache"]["key"]
    )
    for model, method in [
        (isolated, openmm.NonbondedForce.NoCutoff),
        (warm, openmm.NonbondedForce.CutoffNonPeriodic),
    ]:
        force = next(f for f in model.system.getForces() if isinstance(f, openmm.NonbondedForce))
        assert force.getNonbondedMethod() == method
