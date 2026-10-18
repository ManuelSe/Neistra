"""Failure injection verifies honest refusal; positive physics uses native scientific tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from molweave_core.minimization.plugin import plugin
from molweave_core.minimization.toolchain import AmberTools

from tests.support.minimization import LocalContext, capture, environment_capture, molecule


@pytest.mark.parametrize("failure", ["missing_charge_file", "unfinished_sqm", "wrong_net_charge"])
def test_charge_failure_is_never_a_coordinate_success(tmp_path: Path, monkeypatch, failure):
    calls = []

    def run(self, program, arguments, directory, context, deadline):
        calls.append(program)
        assert program == "antechamber"
        if failure == "missing_charge_file":
            return "tool returned without charges"
        text = (directory / "input.mol2").read_text()
        if failure == "wrong_net_charge":
            lines = text.splitlines()
            index = lines.index("@<TRIPOS>ATOM") + 1
            fields = lines[index].split()
            fields[8] = "1.0"
            lines[index] = " ".join(fields)
            text = "\n".join(lines) + "\n"
        (directory / "charged.mol2").write_text(text)
        (directory / "sqm.out").write_text(
            "Calculation Completed" if failure == "wrong_net_charge" else "SCF did not converge"
        )
        return ""

    monkeypatch.setattr(
        AmberTools, "discover", classmethod(lambda cls, prefix=None: AmberTools(tmp_path, {}))
    )
    monkeypatch.setattr(AmberTools, "run", run)
    params, inputs = capture(molecule())
    before = inputs[0].data
    result = plugin.execute("coordinates.minimize", params, inputs, LocalContext(tmp_path))
    report = json.loads(next(a.data for a in result.artifacts if a.role == "report"))
    proposal = json.loads(next(a.data for a in result.artifacts if a.role == "proposal"))
    assert report["outcome"] == "blocked" and "charge_generation_failed" in report["reason"]
    assert proposal["entries"] == [] and report["maximum_gradient"] is None
    assert inputs[0].data == before and calls == ["antechamber"]


@pytest.mark.parametrize("cross_entry", [False, True])
def test_singular_geometry_refuses_before_parameter_generation(
    tmp_path: Path, monkeypatch, cross_entry
):
    source = molecule()
    if cross_entry:
        params, inputs = environment_capture({"first": source, "second": source}, {"first": [3]})
    else:
        coords = [source.atoms[0].coordinates] * len(source.atoms)
        source = source.model_copy(
            update={
                "atoms": [
                    a.model_copy(update={"coordinates": coords[i]})
                    for i, a in enumerate(source.atoms)
                ],
                "conformers": [
                    c.model_copy(update={"coordinates": coords}) for c in source.conformers
                ],
            }
        )
        params, inputs = capture(source)
    from tests.support.minimization import protein_state_templates

    monkeypatch.setattr(
        AmberTools, "discover", classmethod(lambda cls, prefix=None: AmberTools(tmp_path, {}))
    )
    # Environment mode reads templates even for organic-only assemblies.
    monkeypatch.setattr(
        "molweave_core.minimization.templates.read_templates",
        lambda prefix: protein_state_templates(),
    )

    def forbidden(*args, **kwargs):
        raise AssertionError("Native generation must not start")

    monkeypatch.setattr(AmberTools, "run", forbidden)
    result = plugin.execute("coordinates.minimize", params, inputs, LocalContext(tmp_path))
    report = json.loads(next(a.data for a in result.artifacts if a.role == "report"))
    assert report["outcome"] == "blocked" and "singular_geometry" in report["reason"]
    assert not (tmp_path / "calculation").exists()
