from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from molweave_core.jobs import JobCancelled
from molweave_core.minimization.quick_contracts import QuickCapture, QuickParameters, usable
from molweave_core.minimization.quick_model import build_assembly, read_sources, resolve_selection
from molweave_core.minimization.quick_plugin import execute
from molweave_core.selection import AtomReference, SelectionV1

from tests.support.minimization import LocalContext, capture, molecule


def quick_capture(structure, selected=None, **options):
    old, inputs = capture(structure, selected)
    requested = old.selection
    return QuickParameters(
        requested_selection=requested,
        selection=resolve_selection(
            {"entry": structure}, requested, options.get("expand_hydrogens", True)
        ),
        captured_inputs=[QuickCapture(**c.model_dump()) for c in old.captured_inputs],
        **options,
    ), inputs


def test_native_quick_partial_result_moves_only_expanded_mask(tmp_path: Path):
    source = molecule()
    parameters, inputs = quick_capture(source, [3])
    assert [a.atom_id for a in parameters.selection.atoms] == [3, 9]
    context = LocalContext(tmp_path)
    result = execute(parameters, inputs, context)
    proposal = json.loads(next(a.data for a in result.artifacts if a.role == "proposal"))
    from molweave_core.minimization.quick_contracts import QuickReport

    report = QuickReport.model_validate(proposal["report"])
    assert usable(report), report
    assert report.method == "MMFF94"
    assert proposal["entries"][0]["atom_ids"] == [3, 9]
    assert report.final_energy < report.initial_energy
    assert source == read_sources(parameters, inputs)["entry"]
    assert context.values[-1] == 100


def test_exact_selection_keeps_every_other_model_coordinate_fixed(tmp_path: Path):
    from molweave_core.minimization.quick_optimize import optimize

    source = molecule()
    parameters, _ = quick_capture(source, [3], expand_hydrogens=False)
    assembly = build_assembly({"entry": source}, parameters)
    original = assembly.coordinates.copy()
    report, proposal = optimize(assembly, parameters, LocalContext(tmp_path))
    assert usable(report)
    assert proposal[0].atom_ids == [3]
    assert np.array_equal(original, assembly.coordinates)
    assert report.fixed_count == len(source.atoms) - 1


def test_empty_selection_and_forged_expansion_refuse():
    source = molecule()
    with pytest.raises(ValueError, match="Select atoms"):
        resolve_selection({"entry": source}, SelectionV1(atoms=[]), True)
    parameters, inputs = quick_capture(source, [3])
    forged = parameters.model_copy(
        update={"selection": SelectionV1(atoms=[AtomReference(structure_id="entry", atom_id=3)])}
    )
    with pytest.raises(ValueError, match="Resolved movable mask"):
        read_sources(forged, inputs)


def test_quick_cancel_does_not_publish_a_proposal(tmp_path: Path):
    parameters, inputs = quick_capture(molecule())
    context = LocalContext(tmp_path)
    context.cancelled = True
    with pytest.raises(JobCancelled):
        execute(parameters, inputs, context)


def environment_parameters(sources, selected, **options):
    from tests.support.minimization import environment_capture

    old, inputs = environment_capture(sources, selected)
    requested = old.selection
    return QuickParameters(
        requested_selection=requested,
        selection=resolve_selection(sources, requested, options.get("expand_hydrogens", True)),
        captured_inputs=[QuickCapture(**c.model_dump()) for c in old.captured_inputs],
        **options,
    ), inputs


def test_local_native_interfragment_attraction_and_independent_gradient():
    from molweave_core.minimization.quick_optimize import force_field

    from tests.support.minimization import translated

    positive = molecule("[NH4+]")
    negative = translated(molecule("[Cl-]"), (5, 0, 0))
    sources = {"cation": positive, "site": negative}
    parameters, _ = environment_parameters(sources, {"cation": [1]})
    assembly = build_assembly(sources, parameters)
    ff, method = force_field(assembly)
    assert method == "MMFF94"
    xyz = assembly.coordinates.reshape(-1)
    gradient = np.asarray(ff.CalcGrad(xyz.tolist()))
    i = assembly.references.index(("cation", 1))
    plus, minus = xyz.copy(), xyz.copy()
    plus[3 * i] += 1e-5
    minus[3 * i] -= 1e-5
    numerical = (ff.CalcEnergy(plus.tolist()) - ff.CalcEnergy(minus.tolist())) / 2e-5
    assert gradient[3 * i] == pytest.approx(numerical, abs=1e-4)
    # The isolated ion has no translational force; its pocket contribution is attractive.
    whole = np.asarray(ff.CalcGrad(xyz.tolist())).reshape(-1, 3)
    force = -whole[assembly.movable].sum(axis=0)
    site = assembly.coordinates[assembly.references.index(("site", 1))]
    center = assembly.coordinates[assembly.movable].mean(axis=0)
    assert np.dot(force, site - center) > 0
    assert all(
        not ref or ref[0] == "cation"
        for i, ref in enumerate(assembly.references)
        if i in assembly.movable
    )


def test_1stp_local_field_caps_mixed_mask_and_finite_forces():
    from molweave_core.minimization.quick_optimize import force_field
    from molweave_core.molecular import NormalizedStructureV1

    fixtures = Path(__file__).parents[1] / "fixtures/minimization"
    sources = {
        key: NormalizedStructureV1.from_bytes((fixtures / name).read_bytes())
        for key, name in [
            ("protein", "1stp-protein.normalized.json"),
            ("ligand", "1stp-biotin.normalized.json"),
        ]
    }
    parameters, _ = environment_parameters(
        sources, {"ligand": [a.id for a in sources["ligand"].atoms]}
    )
    assembly = build_assembly(sources, parameters)
    assert 32 < len(assembly.references) < 1500
    assert assembly.cap_count > 0
    assert len(assembly.modeled_atoms["protein"]) < len(sources["protein"].atoms)
    assert all(
        ref is None or ref[0] == "ligand"
        for i, ref in enumerate(assembly.references)
        if i in assembly.movable
    )
    ff, method = force_field(assembly)
    assert method == "MMFF94"
    assert np.isfinite(ff.CalcEnergy(assembly.coordinates.reshape(-1).tolist()))
    assert np.isfinite(ff.CalcGrad(assembly.coordinates.reshape(-1).tolist())).all()
    # A selected residue stays movable while covalent neighbors remain fixed.
    residue = next(
        a.residue_id for a in sources["protein"].atoms if a.id in assembly.modeled_atoms["protein"]
    )
    ids = [a.id for a in sources["protein"].atoms if a.residue_id == residue]
    mixed, _ = environment_parameters(sources, {"protein": ids, "ligand": [1]})
    model = build_assembly(sources, mixed)
    selected = {(a.structure_id, a.atom_id) for a in mixed.selection.atoms}
    assert {
        model.references[i] for i in model.movable if model.references[i] is not None
    } == selected
