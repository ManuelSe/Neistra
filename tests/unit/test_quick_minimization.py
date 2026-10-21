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
