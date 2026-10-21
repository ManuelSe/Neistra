"""Independent quick-field physics, local boundaries and imperfect input qualification."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from molweave_core.adapters.defaults import create_default_registry
from molweave_core.adapters.rdkit_common import mol_to_normalized
from molweave_core.minimization.quick_contracts import QuickReport, usable
from molweave_core.minimization.quick_field import force_field
from molweave_core.minimization.quick_model import build_assembly
from molweave_core.minimization.quick_optimize import optimize
from molweave_core.minimization.quick_plugin import execute
from molweave_core.minimization.quick_protein import protein_graph
from rdkit import Chem
from rdkit.Chem import AllChem

from tests.support.minimization import LocalContext, molecule, translated
from tests.unit.test_quick_minimization import environment_parameters, quick_capture

all_chem: Any = AllChem


def test_native_nonbonded_exclusions_scaling_and_dielectric_against_pair_sum():
    """Independent buffered14-7/Coulomb sum, with graph-distance exclusions.

    Equations/scale reference: RDKit Code/ForceField/MMFF/Nonbonded.cpp and
    Code/GraphMol/ForceFieldHelpers/MMFF/Builder.cpp (BSD3).
    """
    source = molecule("OCCC[NH3+]")
    parameters, _ = quick_capture(source)
    assembly = build_assembly({"entry": source}, parameters)
    mol = assembly.molecule
    props = all_chem.MMFFGetMoleculeProperties(mol)
    props.SetMMFFDielectricModel(2)
    props.SetMMFFDielectricConstant(4)
    for setter in [
        "SetMMFFBondTerm",
        "SetMMFFAngleTerm",
        "SetMMFFStretchBendTerm",
        "SetMMFFOopTerm",
        "SetMMFFTorsionTerm",
    ]:
        getattr(props, setter)(False)
    native = all_chem.MMFFGetMoleculeForceField(
        mol, props, nonBondedThresh=100, ignoreInterfragInteractions=False
    )
    steps = Chem.GetDistanceMatrix(mol)
    xyz = assembly.coordinates
    expected = 0.0
    count_14 = count_excluded = 0
    for i in range(len(xyz)):
        for j in range(i):
            if steps[i, j] <= 2:
                count_excluded += 1
                continue
            distance = float(np.linalg.norm(xyz[i] - xyz[j]))
            _, _, radius, epsilon = props.GetMMFFVdWParams(i, j)
            expected += (
                epsilon
                * (1.07 * radius / (distance + 0.07 * radius)) ** 7
                * (1.12 * radius**7 / (distance**7 + 0.12 * radius**7) - 2)
            )
            scale = 0.75 if steps[i, j] == 3 else 1.0
            count_14 += steps[i, j] == 3
            expected += (
                332.0716
                * props.GetMMFFPartialCharge(i)
                * props.GetMMFFPartialCharge(j)
                / (4 * (distance + 0.05) ** 2)
                * scale
            )
    assert count_14 and count_excluded
    assert native.CalcEnergy(xyz.reshape(-1).tolist()) == pytest.approx(expected, abs=1e-8)


@pytest.mark.parametrize("selected", [[1], [2, 3], [8]])
def test_partial_ring_substituent_and_h_use_full_native_bonded_boundary(selected):
    source = molecule("Cc1ccccc1")
    parameters, _ = quick_capture(source, selected, expand_hydrogens=False)
    assembly = build_assembly({"entry": source}, parameters)
    field, method = force_field(assembly)
    assert method == "MMFF94"
    props = all_chem.MMFFGetMoleculeProperties(assembly.molecule)
    props.SetMMFFDielectricModel(2)
    props.SetMMFFDielectricConstant(4)
    independent = all_chem.MMFFGetMoleculeForceField(
        assembly.molecule, props, ignoreInterfragInteractions=False
    )
    xyz = assembly.coordinates.reshape(-1).tolist()
    gradient = np.asarray(field.CalcGrad(xyz)).reshape(-1, 3)
    reference = np.asarray(independent.CalcGrad(xyz)).reshape(-1, 3)
    assert np.allclose(gradient[assembly.movable], reference[assembly.movable], atol=1e-10)
    assert field.CalcEnergy(xyz) == pytest.approx(independent.CalcEnergy(xyz), abs=1e-10)
    assert set(assembly.modeled_atoms["entry"]) == {a.id for a in source.atoms}


def unknown_sequence(sequence: str, hydrogens: bool = False):
    native = Chem.MolFromSequence(sequence)
    if hydrogens:
        native = Chem.AddHs(native)
    assert all_chem.EmbedMolecule(native, randomSeed=82) == 0
    source = mol_to_normalized(native, filename="observed.pdb", format_name="pdb")
    return source.model_copy(
        update={
            "atoms": [a.model_copy(update={"formal_charge": None}) for a in source.atoms],
            "bonds": [
                b.model_copy(update={"order": None, "aromatic": False}) for b in source.bonds
            ],
        }
    )


def test_observed_protein_defaults_and_supplied_h_precedence_without_completion():
    source = unknown_sequence("DEKRCHY")
    graph, _, _ = protein_graph(source)
    atom = {
        (r.name, a.name): a for r in graph.residues for a in graph.atoms if a.residue_id == r.id
    }
    assert atom["ASP", "OD2"].formal_charge == -1
    assert atom["GLU", "OE2"].formal_charge == -1
    assert atom["LYS", "NZ"].formal_charge == 1
    assert atom["ARG", "NH1"].formal_charge == 1
    assert atom["CYS", "SG"].formal_charge == 0 and atom["TYR", "OH"].formal_charge == 0
    assert atom["ASP", "N"].formal_charge == 1 and atom["TYR", "OXT"].formal_charge == -1
    assert len(source.atoms) == len(graph.atoms)
    p, _ = quick_capture(source, [1])
    model = build_assembly({"entry": source}, p)
    assert "repair" not in model.modes
    assert any("epsilon-H HIS" in note for note in model.assumptions)
    # Explicit neutral amine/carboxylic H override otherwise charged defaults.
    observed = unknown_sequence("K", hydrogens=True)
    graph, _, _ = protein_graph(observed)
    nz = next(a for a in graph.atoms if a.name == "NZ")
    oxt = next(a for a in graph.atoms if a.name == "OXT")
    assert nz.formal_charge == 0 and oxt.formal_charge == 0


def test_pdb_gap_does_not_invent_a_charged_n_terminus():
    source = unknown_sequence("A")
    source = source.model_copy(
        update={
            "residues": [
                r.model_copy(update={"author_number": 20, "label_number": 1})
                for r in source.residues
            ]
        }
    )
    graph, _, _ = protein_graph(source)
    assert next(a for a in graph.atoms if a.name == "N").formal_charge == 0


def test_raw_1stp_water_and_ligand_produce_an_honest_usable_local_result(tmp_path: Path):
    path = Path(__file__).parents[1] / "fixtures/complex/1stp.pdb"
    source = (
        create_default_registry()
        .for_filename(path.name)
        .parse(path.read_bytes(), path.name)
        .structures[0]
    )
    residues = {r.id for r in source.residues if r.name == "BTN"}
    ids = [a.id for a in source.atoms if a.residue_id in residues]
    assert ids
    p, inputs = quick_capture(source, ids)
    result = execute(p, inputs, LocalContext(tmp_path))
    document = json.loads(next(a.data for a in result.artifacts if a.role == "proposal"))
    report = QuickReport.model_validate(document["report"])
    assert usable(report), report
    assert report.fixed_count > 0 and report.cap_count > 0
    if report.method == "geometry_repair":
        assert report.coverage == "approximate" and report.units["energy"] == "penalty"
    archive = next(a for a in result.artifacts if a.role == "model")
    with zipfile.ZipFile(io.BytesIO(archive.data)) as bundle:
        model = json.loads(bundle.read("local-model.json"))
    original, candidate = (
        np.asarray(model["coordinates"]),
        np.asarray(model["candidate_coordinates"]),
    )
    fixed = sorted(set(range(len(original))) - set(model["movable_indices"]))
    assert np.array_equal(original[fixed], candidate[fixed])
    assert len(model["atoms"]) == len(original) and model["bonds"]


def test_context_guard_extends_before_motion_enters_new_neighbors(tmp_path: Path):
    source = molecule("CC", explicit_h=False)
    coordinates = list(source.active_coordinates)
    coordinates[1] = tuple(v + 12 for v in coordinates[0])
    source = source.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": p})
                for a, p in zip(source.atoms, coordinates, strict=True)
            ],
            "conformers": [
                c.model_copy(update={"coordinates": coordinates}) for c in source.conformers
            ],
        }
    )
    site = translated(molecule("[Cl-]"), tuple(v + 1 for v in coordinates[0]))
    sources = {"ligand": source, "site": site}
    p, _ = environment_parameters(sources, {"ligand": [2]}, expand_hydrogens=False)
    model = build_assembly(sources, p)
    assert "site" not in model.modeled_atoms
    report, _ = optimize(model, p, LocalContext(tmp_path))
    assert report.timings["context_rebuilds"] > 0
    assert "site" in report.modeled_atoms


def test_isolated_mode_excludes_disconnected_context_inside_the_selected_entry():
    from tests.support.minimization import combined

    ligand = molecule()
    source = combined(ligand, translated(molecule("O"), (3, 0, 0)))
    automatic, _ = quick_capture(source, [3])
    isolated, _ = quick_capture(source, [3], mode="isolated")
    assert len(build_assembly({"entry": source}, automatic).modeled_atoms["entry"]) > len(
        ligand.atoms
    )
    assert len(build_assembly({"entry": source}, isolated).modeled_atoms["entry"]) == len(
        ligand.atoms
    )


def test_abnormal_solver_stop_is_never_usable(tmp_path: Path, monkeypatch):
    from types import SimpleNamespace

    import molweave_core.minimization.quick_optimize as module

    source = molecule()
    p, _ = quick_capture(source, [3])
    model = build_assembly({"entry": source}, p)
    monkeypatch.setattr(
        module,
        "minimize",
        lambda objective, initial, **kw: SimpleNamespace(x=initial, success=False, status=2),
    )
    report, _ = module.optimize(model, p, LocalContext(tmp_path))
    assert report.termination_kind == "abnormal" and report.outcome == "failed"
    assert not usable(report)


@pytest.mark.parametrize("smiles", ["F[C@](Cl)(Br)I", "F/C=C/F"])
def test_declared_stereochemistry_is_preserved_and_conflicts_refuse(tmp_path: Path, smiles: str):
    from molweave_core.minimization.quick_optimize import declared_stereo

    source = molecule(smiles)
    p, _ = quick_capture(source)
    model = build_assembly({"entry": source}, p)
    assert declared_stereo(model, model.coordinates)
    report, _ = optimize(model, p, LocalContext(tmp_path))
    assert report.outcome in {"improved", "converged", "unchanged"}
    if "@" in smiles:
        source = source.model_copy(
            update={
                "atoms": [
                    a.model_copy(
                        update={
                            "stereo": "TETRAHEDRAL_CW"
                            if a.stereo == "TETRAHEDRAL_CCW"
                            else "TETRAHEDRAL_CCW"
                        }
                    )
                    if a.stereo
                    else a
                    for a in source.atoms
                ]
            }
        )
        p, _ = quick_capture(source)
        with pytest.raises(ValueError, match="conflict"):
            optimize(build_assembly({"entry": source}, p), p, LocalContext(tmp_path))


def test_assigned_current_connectivity_is_not_reconnected_by_protein_templates():
    native = Chem.MolFromSequence("AA")
    assert all_chem.EmbedMolecule(native, randomSeed=82) == 0
    source = mol_to_normalized(native, filename="current.pdb", format_name="pdb")
    atoms = {a.id: a for a in source.atoms}
    cut = next(
        b for b in source.bonds if atoms[b.atom_1_id].residue_id != atoms[b.atom_2_id].residue_id
    )
    source = source.model_copy(update={"bonds": [b for b in source.bonds if b.id != cut.id]})
    graph, _, _ = protein_graph(source)
    assert {frozenset((b.atom_1_id, b.atom_2_id)) for b in graph.bonds} == {
        frozenset((b.atom_1_id, b.atom_2_id)) for b in source.bonds
    }
