from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path

import numpy as np
import openmm
import pytest
from molweave_core.minimization.optimize import optimize_isolated
from molweave_core.minimization.parameterization import parameterize_isolated
from molweave_core.minimization.plugin import plugin
from molweave_core.minimization.preflight import isolated_preflight
from molweave_core.minimization.toolchain import AmberTools
from openmm import unit

from tests.support.minimization import LocalContext, capture, molecule


@pytest.fixture
def tools() -> AmberTools:
    if not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"):
        pytest.skip("Install/export the locked AmberTools prefix for native model qualification")
    return AmberTools.discover()


@pytest.mark.parametrize("selected", [None, [3], [1, 2, 3], [4]])
def test_real_gaff_minimization_keeps_fixed_atoms_exact(
    tmp_path: Path,
    tools: AmberTools,
    selected: list[int] | None,
) -> None:
    structure = molecule()
    snapshot = structure.to_bytes()
    parameters, inputs = capture(structure, selected)
    value = isolated_preflight(parameters, inputs)
    context = LocalContext(tmp_path)
    model = parameterize_isolated(value, tools, tmp_path / "model", context)
    report, proposal = optimize_isolated(value, model, parameters, context)
    assert report.outcome == "converged"
    assert report.final_energy < report.initial_energy
    assert report.maximum_gradient <= 10
    assert report.iterations > 0
    updated = {i: point for i, point in zip(proposal.atom_ids, proposal.coordinates, strict=True)}
    final = [updated.get(a.id, a.coordinates) for a in structure.atoms]
    for atom, point in zip(structure.atoms, final, strict=True):
        if atom.id not in updated:
            assert point == atom.coordinates
    assert structure.to_bytes() == snapshot
    assert len(proposal.atom_ids) == len(parameters.selection.atoms)
    assert model.system.getNumConstraints() == 0


def test_native_force_matches_independent_numerical_energy_derivative(
    tmp_path: Path,
    tools: AmberTools,
) -> None:
    parameters, inputs = capture(molecule(), [3])
    value = isolated_preflight(parameters, inputs)
    model = parameterize_isolated(value, tools, tmp_path / "model", LocalContext(tmp_path))
    integrator = openmm.VerletIntegrator(0.001)
    context = openmm.Context(
        model.system, integrator, openmm.Platform.getPlatformByName("Reference")
    )
    positions = np.asarray(value.structure.active_coordinates) / 10
    context.setPositions(positions * unit.nanometer)
    gradient = (
        -context.getState(getForces=True)
        .getForces(asNumpy=True)
        .value_in_unit(unit.kilojoule_per_mole / unit.nanometer)
    )
    for atom, axis in [(0, 1), (2, 0), (4, 2)]:
        values = []
        for sign in [-1, 1]:
            shifted = positions.copy()
            shifted[atom, axis] += sign * 1e-6
            context.setPositions(shifted * unit.nanometer)
            values.append(
                context.getState(getEnergy=True)
                .getPotentialEnergy()
                .value_in_unit(unit.kilojoule_per_mole)
            )
        numerical = (values[1] - values[0]) / 2e-6
        assert gradient[atom, axis] == pytest.approx(numerical, abs=1e-3, rel=1e-5)


def test_iteration_limit_is_not_convergence_and_original_state_is_unchanged(
    tmp_path: Path,
    tools: AmberTools,
) -> None:
    parameters, inputs = capture(molecule(), max_iterations=1)
    value = isolated_preflight(parameters, inputs)
    model = parameterize_isolated(value, tools, tmp_path / "model", LocalContext(tmp_path))
    report, _ = optimize_isolated(value, model, parameters, LocalContext(tmp_path))
    assert report.outcome == "non_converged"
    assert report.maximum_gradient > report.gradient_tolerance
    assert report.iterations == 1


def test_plugin_retains_real_parameters_report_and_nonimportable_proposal(
    tmp_path: Path,
    tools: AmberTools,
) -> None:
    parameters, inputs = capture(molecule(), [3])
    result = plugin.execute("coordinates.minimize", parameters, inputs, LocalContext(tmp_path))
    artifacts = {a.role: a for a in result.artifacts}
    assert result.values["outcome"] == "converged"
    report = json.loads(artifacts["report"].data)
    assert report["toolchain"]["ambertools"] == "24.8"
    assert report["toolchain"]["files"]["dat/leap/parm/gaff.dat"]
    proposal = json.loads(artifacts["proposal"].data)
    assert proposal["entries"][0]["atom_ids"] == [3]
    with zipfile.ZipFile(io.BytesIO(artifacts["model"].data)) as archive:
        assert {"model.prmtop", "charged.mol2", "input.mol2", "sqm.out"} <= set(archive.namelist())
    assert all(not role.importable_structure for role in plugin.definitions()[0].result_roles)


@pytest.mark.parametrize("smiles", ["c1ccccc1", "C[NH3+]", "C[C@H](O)C(=O)O", "ClCCBr"])
def test_qualified_organic_examples_include_aromatic_charged_stereo_and_halogen(
    tmp_path: Path,
    tools: AmberTools,
    smiles: str,
) -> None:
    parameters, inputs = capture(molecule(smiles))
    result = plugin.execute("coordinates.minimize", parameters, inputs, LocalContext(tmp_path))
    report = json.loads(next(a.data for a in result.artifacts if a.role == "report"))
    assert report["outcome"] == "converged", report
    assert report["maximum_gradient"] <= 10
    assert report["final_energy"] <= report["initial_energy"]


def test_changed_assigned_native_bond_orders_refuse_without_rewriting_draft(
    tmp_path: Path,
    tools: AmberTools,
) -> None:
    structure = molecule("CC(=O)[O-]")
    before = structure.to_bytes()
    parameters, inputs = capture(structure)
    result = plugin.execute("coordinates.minimize", parameters, inputs, LocalContext(tmp_path))
    report = json.loads(next(a.data for a in result.artifacts if a.role == "report"))
    assert report["outcome"] == "blocked"
    assert "does not preserve supplied bond-order representation" in report["reason"]
    assert structure.to_bytes() == before


def test_sparse_ids_and_nonfirst_active_conformer_keep_immutable_input_exact(
    tmp_path: Path,
    tools: AmberTools,
) -> None:
    from molweave_core.molecular import Conformer

    structure = molecule()
    annotations = [
        {**a, "atoms": [{**fact, "atom_id": fact["atom_id"] * 3} for fact in a["atoms"]]}
        for a in structure.annotations
    ]
    active = [(x + 1.5, y, z) for x, y, z in structure.active_coordinates]
    structure = structure.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"id": a.id * 3, "coordinates": active[i]})
                for i, a in enumerate(structure.atoms)
            ],
            "bonds": [
                b.model_copy(update={"atom_1_id": b.atom_1_id * 3, "atom_2_id": b.atom_2_id * 3})
                for b in structure.bonds
            ],
            "annotations": annotations,
            "active_conformer_id": 7,
            "conformers": [
                *structure.conformers,
                Conformer(id=7, name="Active", coordinates=active),
            ],
        }
    )
    parameters, inputs = capture(structure, [9])
    before = structure.to_bytes()
    result = plugin.execute("coordinates.minimize", parameters, inputs, LocalContext(tmp_path))
    proposal = json.loads(next(a.data for a in result.artifacts if a.role == "proposal"))
    assert proposal["report"]["outcome"] == "converged", proposal["report"]
    assert proposal["entries"][0]["atom_ids"] == [9]
    assert proposal["entries"][0]["conformer_id"] == 7
    assert structure.to_bytes() == before


def test_modified_native_parameter_data_cannot_reuse_qualified_profile(
    tmp_path: Path,
    tools: AmberTools,
) -> None:
    from molweave_core.minimization.contracts import CalculationError
    from molweave_core.minimization.toolchain import DATA_FILES, NATIVE_FILES

    for name in [*NATIVE_FILES, *DATA_FILES]:
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if name == "dat/leap/parm/gaff.dat":
            target.write_bytes((tools.prefix / name).read_bytes() + b"\nmodified parameter data\n")
        else:
            target.symlink_to(tools.prefix / name)
    (tmp_path / "conda-meta").symlink_to(tools.prefix / "conda-meta", target_is_directory=True)
    with pytest.raises(CalculationError, match="differ from the model lock"):
        AmberTools.discover(tmp_path)
