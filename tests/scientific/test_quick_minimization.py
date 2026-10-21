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
    p, inputs = environment_parameters(sources, {"ligand": [2]}, expand_hydrogens=False)
    model = build_assembly(sources, p)
    assert "site" not in model.modeled_atoms
    result = execute(p, inputs, LocalContext(tmp_path))
    report = QuickReport.model_validate_json(
        next(a.data for a in result.artifacts if a.role == "report")
    )
    assert report.timings["context_rebuilds"] > 0
    assert "site" in report.modeled_atoms
    with zipfile.ZipFile(
        io.BytesIO(next(a.data for a in result.artifacts if a.role == "model"))
    ) as bundle:
        saved = json.loads(bundle.read("local-model.json"))
    assert np.asarray(saved["field_center"]).shape == (len(saved["atoms"]), 3)
    assert np.isfinite(saved["field_center"]).all()


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


@pytest.mark.parametrize("side", [1, -1])
def test_repair_planarity_preserves_cis_and_trans_with_radian_scaled_strength(side):
    from molweave_core.minimization.quick_model import QuickAssembly

    mol = Chem.MolFromSmiles("CC=CC")
    xyz = np.asarray(
        [
            [-0.76, 1.52 * np.sqrt(3) / 2, 0],
            [0, 0, 0],
            [1.34, 0, 0],
            [2.1, side * 1.52 * np.sqrt(3) / 2, 0],
        ]
    )
    conformer = Chem.Conformer(4)
    for i, point in enumerate(xyz):
        conformer.SetAtomPosition(i, tuple(point))
    mol.AddConformer(conformer)
    model = QuickAssembly(
        molecule=mol,
        references=[("entry", i + 1) for i in range(4)],
        movable=[3],
        sources={},
        modeled_atoms={},
        modes=["repair"] * 4,
    )
    field, method = force_field(model)
    assert method == "geometry_repair"
    twisted = xyz.copy()
    twisted[3, 1:] = [xyz[3, 1] / np.sqrt(2), xyz[3, 1] / np.sqrt(2)]
    # The 45-degree rotation preserves every bond length/angle and leaves no
    # steric violation. Its independent torsion penalty is k * (pi/4)^2.
    flat = xyz.reshape(-1).tolist()
    angled = twisted.reshape(-1).tolist()
    assert field.CalcEnergy(angled) - field.CalcEnergy(flat) == pytest.approx(
        10 * (np.pi / 4) ** 2, abs=1e-9
    )
    assert field.CalcEnergy(flat) < 0.1
    gradient = np.asarray(field.CalcGrad(angled))
    plus, minus = twisted.reshape(-1).copy(), twisted.reshape(-1).copy()
    plus[11] += 1e-5
    minus[11] -= 1e-5
    numerical = (field.CalcEnergy(plus.tolist()) - field.CalcEnergy(minus.tolist())) / 2e-5
    assert gradient[11] == pytest.approx(numerical, abs=1e-6)


def test_quick_solver_and_eligibility_ignore_constant_energy_offsets(tmp_path: Path, monkeypatch):
    import molweave_core.minimization.quick_optimize as module

    source = molecule("CCO")
    parameters, _ = quick_capture(source)
    original_field = module.force_field

    class OffsetField:
        def __init__(self, field):
            self.field = field

        def CalcEnergy(self, positions):
            return self.field.CalcEnergy(positions) + 1e8

        def CalcGrad(self, positions):
            return self.field.CalcGrad(positions)

    first = build_assembly({"entry": source}, parameters)
    report, _ = optimize(first, parameters, LocalContext(tmp_path))
    assert usable(report)

    def shifted(assembly, positions=None):
        field, method = original_field(assembly, positions)
        return OffsetField(field), method

    monkeypatch.setattr(module, "force_field", shifted)
    second = build_assembly({"entry": source}, parameters)
    shifted_report, _ = optimize(second, parameters, LocalContext(tmp_path))
    assert usable(shifted_report)
    assert np.allclose(first.result_coordinates, second.result_coordinates, atol=2e-4)
    assert shifted_report.maximum_gradient < 0.02


@pytest.mark.parametrize("unsupported", [False, True])
def test_lower_objective_cannot_publish_collapsed_covalent_geometry(
    tmp_path: Path, monkeypatch, unsupported
):
    from types import SimpleNamespace

    import molweave_core.minimization.quick_optimize as module

    source = molecule("CC", explicit_h=False)
    if unsupported:
        source = source.model_copy(
            update={
                "atoms": [source.atoms[0].model_copy(update={"element": "Fe"}), source.atoms[1]],
                "annotations": [],
            }
        )
    parameters, _ = quick_capture(source, expand_hydrogens=False)
    model = build_assembly({"entry": source}, parameters)
    target = model.coordinates.copy()
    target[1] = target[0]

    class CollapsingObjective:
        def CalcEnergy(self, positions):
            return float(np.sum((np.asarray(positions).reshape(-1, 3) - target) ** 2))

        def CalcGrad(self, positions):
            return (2 * (np.asarray(positions).reshape(-1, 3) - target)).reshape(-1)

    monkeypatch.setattr(module, "force_field", lambda *args: (CollapsingObjective(), "MMFF94"))
    monkeypatch.setattr(
        module,
        "minimize",
        lambda *args, **kw: SimpleNamespace(
            x=target[model.movable].reshape(-1),
            success=True,
            status=0,
        ),
    )
    report, _ = optimize(model, parameters, LocalContext(tmp_path))
    assert report.final_energy < report.initial_energy
    assert not report.new_severe_overlaps  # Bonded pairs are deliberately excluded here.
    assert report.outcome == "failed" and not report.bonded_geometry_verified
    assert report.geometry_violations and not usable(report)


def test_historical_quick_report_without_geometry_proof_cannot_apply(tmp_path: Path):
    source = molecule()
    parameters, _ = quick_capture(source)
    report, _ = optimize(
        build_assembly({"entry": source}, parameters), parameters, LocalContext(tmp_path)
    )
    assert usable(report)
    historical = report.model_dump(exclude={"bonded_geometry_verified", "geometry_violations"})
    assert not usable(QuickReport.model_validate(historical))
    assert not usable(
        QuickReport.model_validate(report.model_dump(exclude={"planar_geometry_verified"}))
    )
    inconsistent = report.model_copy(update={"geometry_violations": ["Invalid bond"]})
    assert not usable(inconsistent)


@pytest.mark.parametrize("collapsed", [False, True])
def test_metal_linked_repair_ring_keeps_geometry_and_exact_fixed_pocket(tmp_path: Path, collapsed):
    from molweave_core.molecular import Bond

    from tests.support.minimization import combined

    ligand = molecule("c1ccncc1", explicit_h=False)
    xyz = list(ligand.active_coordinates)
    nitrogen = next(a.id for a in ligand.atoms if a.element == "N")
    metal = translated(
        molecule("[Fe]"), tuple(np.asarray(xyz[nitrogen - 1]) + np.asarray([0, 0, 2.3]))
    )
    xyz[0] = tuple(np.asarray(xyz[0]) + np.asarray([0, 0, 0.7]))
    if collapsed:
        xyz[1] = tuple(np.asarray(xyz[0]) + np.asarray([0.0007, 0, 0]))
    ligand = ligand.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": p})
                for a, p in zip(ligand.atoms, xyz, strict=True)
            ],
            "conformers": [c.model_copy(update={"coordinates": xyz}) for c in ligand.conformers],
        }
    )
    source = combined(ligand, metal)
    source = source.model_copy(
        update={
            "bonds": [
                *source.bonds,
                Bond(
                    id=max(b.id for b in source.bonds) + 1,
                    atom_1_id=nitrogen,
                    atom_2_id=source.atoms[-1].id,
                    order=None,
                ),
            ]
        }
    )
    water = translated(molecule("O"), (4.5, 0, 0))
    # A badly strained fixed-only native component contributes an arbitrarily
    # large constant, and must neither steer nor prematurely stop ring repair.
    water_xyz = [
        water.atoms[0].coordinates,
        tuple(np.asarray(water.atoms[0].coordinates) + np.asarray([0.01, 0, 0])),
        tuple(np.asarray(water.atoms[0].coordinates) + np.asarray([0, 0.01, 0])),
    ]
    water = water.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": p})
                for a, p in zip(water.atoms, water_xyz, strict=True)
            ],
            "conformers": [
                c.model_copy(update={"coordinates": water_xyz}) for c in water.conformers
            ],
        }
    )
    sources = {"ligand": source, "fixed": water}
    original = {k: s.to_bytes() for k, s in sources.items()}
    parameters, _ = environment_parameters(sources, {"ligand": list(range(1, 7))})
    model = build_assembly(sources, parameters)
    assert {"repair", "MMFF94"} <= set(model.modes)
    field, method = force_field(model)
    assert method == "geometry_repair" and len(field.parts) == 1
    before = model.coordinates.copy()
    report, _ = optimize(model, parameters, LocalContext(tmp_path))
    assert usable(report), report
    assert report.bonded_geometry_verified and report.coverage == "approximate"
    fixed = sorted(set(range(len(before))) - set(model.movable))
    assert np.array_equal(before[fixed], model.result_coordinates[fixed])
    indices = {ref: i for i, ref in enumerate(model.references) if ref is not None}
    points = np.asarray([model.result_coordinates[indices["ligand", i]] for i in range(1, 7)])
    for bond in ligand.bonds:
        length = np.linalg.norm(points[bond.atom_1_id - 1] - points[bond.atom_2_id - 1])
        assert 1.25 < length < 1.6
    _, _, axes = np.linalg.svd(points - points.mean(axis=0))
    assert np.max(np.abs((points - points.mean(axis=0)) @ axes[-1])) < 0.15
    assert original == {k: s.to_bytes() for k, s in sources.items()}


@pytest.mark.parametrize("partial", [False, True])
@pytest.mark.parametrize("raw", [False, True])
def test_component_projection_matches_full_native_pocket_energy_and_gradient(partial, raw):
    from molweave_core.molecular import NormalizedStructureV1

    fixtures = Path(__file__).parents[1] / "fixtures/minimization"
    sources = {
        key: NormalizedStructureV1.from_bytes((fixtures / name).read_bytes())
        for key, name in [
            ("protein", "1stp-protein.normalized.json"),
            ("ligand", "1stp-biotin.normalized.json"),
        ]
    }
    if raw:
        sources = {
            key: create_default_registry()
            .for_filename(name)
            .parse((fixtures / name).read_bytes(), name)
            .structures[0]
            for key, name in [
                ("protein", "1stp-protein-prepared.pdb"),
                ("ligand", "1stp-biotin-prepared.mol"),
            ]
        }
    selected = [1] if partial else [a.id for a in sources["ligand"].atoms]
    parameters, _ = environment_parameters(sources, {"ligand": selected})
    model = build_assembly(sources, parameters)
    field, method = force_field(model)
    assert method == "MMFF94" and len(field.parts) > 1
    props = all_chem.MMFFGetMoleculeProperties(model.molecule, mmffVariant="MMFF94")
    props.SetMMFFDielectricModel(2)
    props.SetMMFFDielectricConstant(4)
    reference = all_chem.MMFFGetMoleculeForceField(
        model.molecule,
        props,
        nonBondedThresh=float("inf"),
        ignoreInterfragInteractions=False,
    )
    for i in set(range(len(model.references))) - set(model.movable):
        reference.AddFixedPoint(i)
    reference.Initialize()
    original = model.coordinates.copy()
    reference_energy = reference.CalcEnergy(original.reshape(-1).tolist())
    assert model.energy_reference == "captured_geometry"
    assert field.CalcEnergy(original.reshape(-1).tolist()) == pytest.approx(0, abs=1e-6)
    for displaced in [False, True]:
        xyz = original.copy()
        if displaced:
            xyz[model.movable] += np.linspace(-0.05, 0.07, 3 * len(model.movable)).reshape(-1, 3)
        positions = xyz.reshape(-1).tolist()
        assert field.CalcEnergy(positions) == pytest.approx(
            reference.CalcEnergy(positions) - reference_energy, abs=1e-5
        )
        assert np.allclose(
            field.CalcGrad(positions), reference.CalcGrad(positions), rtol=0, atol=1e-7
        )
    assert np.array_equal(original, model.coordinates)


@pytest.mark.parametrize("collapsed", [False, True])
def test_fixed_context_geometry_settling_is_limited_and_never_overrides_geometry(
    tmp_path: Path, monkeypatch, collapsed
):
    from types import SimpleNamespace

    import molweave_core.minimization.quick_optimize as module

    source = molecule("CC", explicit_h=False)
    if collapsed:
        xyz = [
            source.atoms[0].coordinates,
            tuple(np.asarray(source.atoms[0].coordinates) + np.asarray([0.001, 0, 0])),
        ]
        source = source.model_copy(
            update={
                "atoms": [
                    a.model_copy(update={"coordinates": p})
                    for a, p in zip(source.atoms, xyz, strict=True)
                ],
                "conformers": [
                    c.model_copy(update={"coordinates": xyz}) for c in source.conformers
                ],
            }
        )
    parameters, _ = quick_capture(source, [2], expand_hydrogens=False, max_iterations=100)
    model = build_assembly({"entry": source}, parameters)

    class UniformField:
        def CalcEnergy(self, positions):
            return -float(np.asarray(positions).reshape(-1, 3)[model.movable, 0].sum())

        def CalcGrad(self, positions):
            gradient = np.zeros_like(np.asarray(positions).reshape(-1, 3))
            gradient[model.movable, 0] = -1
            return gradient.reshape(-1)

    def limited(objective, initial, callback, options, **kw):
        point = initial.copy()
        for _ in range(options["maxiter"]):
            point.reshape(-1, 3)[:, 0] += 0.001
            callback(point)
        return SimpleNamespace(x=point, success=False, status=1)

    monkeypatch.setattr(module, "force_field", lambda *args: (UniformField(), "MMFF94"))
    monkeypatch.setattr(module, "minimize", limited)
    report, _ = optimize(model, parameters, LocalContext(tmp_path))
    assert report.maximum_gradient > report.gradient_tolerance
    if collapsed:
        assert report.iterations == 100
        assert report.outcome == "failed" and not usable(report)
        assert report.geometry_violations
    else:
        assert 25 <= report.iterations < 100
        assert report.outcome == "improved" and usable(report)
        assert report.termination_kind == "geometry_settled"
        assert report.settled_geometry_steps >= 3
        assert any("does not establish convergence" in w for w in report.warnings)


@pytest.mark.parametrize("kekule", [False, True])
def test_folded_substituted_repair_ring_recovers_consistent_planarity(tmp_path: Path, kekule):
    from molweave_core.adapters.rdkit_common import normalized_to_mol
    from molweave_core.molecular import Bond

    from tests.support.minimization import combined

    ligand = molecule("Cc1ccncc1C", explicit_h=False)
    native = normalized_to_mol(ligand)
    ring = list(Chem.GetSymmSSSR(native)[0])
    if kekule:
        Chem.Kekulize(native, clearAromaticFlags=True)
        ligand = mol_to_normalized(native, filename="folded.mol", format_name="mol")
    xyz = np.asarray(ligand.active_coordinates).copy()
    # A folded initial ring and independently displaced substituents produce
    # inconsistent cis/trans signs if every target follows damaged coordinates.
    xyz[ring, 2] += np.asarray([-1.0, 1.0, 1.0, -1.0, 0.7, -0.8])
    for i in set(range(len(xyz))) - set(ring):
        xyz[i, 2] += 2.0
    ligand = ligand.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": tuple(p)})
                for a, p in zip(ligand.atoms, xyz, strict=True)
            ],
            "conformers": [
                c.model_copy(update={"coordinates": [tuple(p) for p in xyz]})
                for c in ligand.conformers
            ],
        }
    )
    nitrogen = next(a.id for a in ligand.atoms if a.element == "N")
    source = combined(ligand, translated(molecule("[Fe]"), (0, 0, 6)))
    source = source.model_copy(
        update={
            "bonds": [
                *source.bonds,
                Bond(
                    id=max(b.id for b in source.bonds) + 1,
                    atom_1_id=nitrogen,
                    atom_2_id=source.atoms[-1].id,
                    order=None,
                ),
            ]
        }
    )
    original = source.to_bytes()
    parameters, _ = quick_capture(source, [a.id for a in ligand.atoms])
    model = build_assembly({"entry": source}, parameters)
    assert "repair" in model.modes
    fixed = sorted(set(range(len(model.coordinates))) - set(model.movable))
    before = model.coordinates.copy()
    report, _ = optimize(model, parameters, LocalContext(tmp_path))
    assert usable(report), report
    mapping = {ref: i for i, ref in enumerate(model.references) if ref is not None}
    points = np.asarray(
        [model.result_coordinates[mapping["entry", ligand.atoms[i].id]] for i in ring]
    )
    centered = points - points.mean(axis=0)
    _, _, axes = np.linalg.svd(centered)
    assert np.max(np.abs(centered @ axes[-1])) < 0.1
    assert np.array_equal(before[fixed], model.result_coordinates[fixed])
    assert source.to_bytes() == original


@pytest.mark.parametrize("unsaturated", [True, False])
def test_planar_guard_rejects_lower_energy_folded_aromatic_but_allows_saturated_ring(
    tmp_path: Path, monkeypatch, unsaturated
):
    from types import SimpleNamespace

    import molweave_core.minimization.quick_optimize as module

    source = molecule("c1ccccc1" if unsaturated else "C1CCCCC1", explicit_h=False)
    xyz = np.asarray(source.active_coordinates).copy()
    if unsaturated:
        xyz[:, 2] += np.asarray([0.45, -0.45] * 3)
    source = source.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": tuple(p)})
                for a, p in zip(source.atoms, xyz, strict=True)
            ],
            "conformers": [
                c.model_copy(update={"coordinates": [tuple(p) for p in xyz]})
                for c in source.conformers
            ],
        }
    )
    parameters, _ = quick_capture(source)
    model = build_assembly({"entry": source}, parameters)
    target = model.coordinates.copy()
    target[model.movable, 0] += 0.01

    class TranslationObjective:
        def CalcEnergy(self, positions):
            return float(np.sum((np.asarray(positions).reshape(-1, 3) - target) ** 2))

        def CalcGrad(self, positions):
            return (2 * (np.asarray(positions).reshape(-1, 3) - target)).reshape(-1)

    monkeypatch.setattr(module, "force_field", lambda *args: (TranslationObjective(), "MMFF94"))
    monkeypatch.setattr(
        module,
        "minimize",
        lambda *args, **kw: SimpleNamespace(
            x=target[model.movable].reshape(-1), success=True, status=0
        ),
    )
    report, _ = optimize(model, parameters, LocalContext(tmp_path))
    assert report.final_energy < report.initial_energy
    if unsaturated:
        assert report.outcome == "failed" and not usable(report)
        assert not report.planar_geometry_verified
        assert any("plane deviation" in v for v in report.geometry_violations)
    else:
        assert report.planar_geometry_verified and usable(report)
