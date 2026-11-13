"""Effective-field diagnostics follow evaluated fields and canonical identities."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from neistra_core.adapters.rdkit_common import mol_to_normalized
from neistra_core.minimization.quick_contracts import QuickEffectiveField, QuickReport
from neistra_core.minimization.quick_field import force_field
from neistra_core.minimization.quick_model import build_assembly
from neistra_core.minimization.quick_plugin import execute
from pydantic import ValidationError
from rdkit import Chem
from rdkit.Chem import AllChem

from tests.support.minimization import LocalContext, combined, molecule, translated
from tests.unit.test_quick_minimization import environment_parameters, quick_capture

all_chem: Any = AllChem


def mixed_native(selected):
    sources = {
        "native": molecule("CCO"),
        "fallback": translated(molecule("B"), (4, 0, 0)),
    }
    parameters, _ = environment_parameters(sources, selected)
    return build_assembly(sources, parameters)


def unresolved():
    source = molecule("CC", explicit_h=False)
    return source.model_copy(update={
        "bonds": [bond.model_copy(update={"order": None}) for bond in source.bonds],
        "atoms": [atom.model_copy(update={"formal_charge": 1}) for atom in source.atoms],
    })


def components(assembly):
    assert assembly.effective_field is not None
    return {component.entry_id: component for component in assembly.effective_field.components}


@pytest.mark.parametrize("selected", [
    {"fallback": [1]}, {"native": [1], "fallback": [1]},
])
def test_moving_uff_changes_actual_native_assignment_for_all_supported_components(selected):
    assembly = mixed_native(selected)
    field, method = force_field(assembly)
    assert set(assembly.modes) == {"MMFF94", "UFF"}
    assert method == "UFF"
    records = components(assembly)
    assert set(records) == {"fallback", "native"}
    assert records["native"].atom_ids == list(range(1, 10))
    assert records["fallback"].atom_ids == [1, 2, 3, 4]
    assert all(record.method == "UFF" for record in records.values())
    assert all(record.coverage == "approximate" for record in records.values())
    assert all(record.omissions == ["uff_electrostatics"] for record in records.values())
    # Independently build the expected full UFF objective, rather than treating
    # interpretation labels or the summary method as evidence of actual use.
    reference = all_chem.UFFGetMoleculeForceField(
        assembly.molecule, vdwThresh=float("inf"), ignoreInterfragInteractions=False
    )
    for index in set(range(len(assembly.references))) - set(assembly.movable):
        reference.AddFixedPoint(index)
    reference.Initialize()
    xyz = assembly.coordinates.copy()
    xyz[assembly.movable] += 0.025
    positions = xyz.reshape(-1).tolist()
    assert field.CalcEnergy(positions) == pytest.approx(reference.CalcEnergy(positions), abs=1e-8)
    assert np.allclose(field.CalcGrad(positions), reference.CalcGrad(positions), rtol=0, atol=1e-8)


def test_fixed_uff_is_geometric_context_without_claiming_lost_native_native_electrostatics():
    assembly = mixed_native({"native": [1]})
    field, method = force_field(assembly)
    assert method == "MMFF94" and len(field.parts) == 2
    records = components(assembly)
    assert records["native"].method == "MMFF94"
    assert records["native"].omissions == ["unsupported_site_electrostatics"]
    assert records["native"].coverage == "approximate"
    assert records["fallback"].method == "geometry_repair"
    assert set(records["fallback"].omissions) == {
        "unsupported_site_electrostatics", "unsupported_physical_terms", "coordination",
    }
    assert "uff_electrostatics" not in assembly.effective_field.omissions


@pytest.mark.parametrize("native_moves", [False, True])
def test_repair_with_fixed_or_moving_native_components_reports_the_installed_contributions(
    native_moves,
):
    sources = {"repair": unresolved(), "native": translated(molecule("CCO"), (4, 0, 0))}
    selected = {"repair": [1], **({"native": [1]} if native_moves else {})}
    parameters, _ = environment_parameters(sources, selected)
    assembly = build_assembly(sources, parameters)
    field, method = force_field(assembly)
    assert method == "geometry_repair"
    assert len(field.parts) == (2 if native_moves else 1)
    records = components(assembly)
    assert records["repair"].method == "geometry_repair"
    assert records["native"].method == ("MMFF94" if native_moves else "fixed_geometry")
    assert "unsupported_site_electrostatics" in records["native"].omissions
    assert ("fixed_only_native_terms" in records["native"].omissions) is not native_moves
    assert "uff_electrostatics" not in assembly.effective_field.omissions
    assert all(record.coverage == "approximate" for record in records.values())


def test_rebuild_and_failed_build_replace_actual_field_provenance(monkeypatch):
    import neistra_core.minimization.quick_field as module

    assembly = mixed_native({"native": [1], "fallback": [1]})
    force_field(assembly)
    first = assembly.effective_field
    assembly.movable = [i for i, ref in enumerate(assembly.references) if ref == ("native", 1)]
    force_field(assembly)
    assert assembly.effective_field is not first
    assert components(assembly)["native"].method == "MMFF94"
    assert components(assembly)["fallback"].method == "geometry_repair"

    def fail(*args):
        raise RuntimeError("native field unavailable")

    monkeypatch.setattr(module, "native_field", fail)
    with pytest.raises(RuntimeError, match="native field unavailable"):
        force_field(assembly)
    assert assembly.effective_field is None


def test_projected_fixed_constants_keep_complete_local_moving_force_coverage():
    native = molecule("CCO")
    water = molecule("O")
    # Complete disconnected fixed fragments trigger exact native projection.
    pocket = combined(*(translated(water, (3 + 0.01 * i, 0, 0)) for i in range(100)))
    sources = {"native": native, "pocket": pocket}
    parameters, _ = environment_parameters(sources, {"native": [1]})
    assembly = build_assembly(sources, parameters)
    force_field(assembly)
    assert assembly.energy_reference == "captured_geometry"
    assert assembly.effective_field is not None
    assert assembly.effective_field.omissions == ["fixed_only_native_terms"]
    assert all(component.method == "MMFF94" for component in assembly.effective_field.components)
    assert all(
        component.coverage == "complete" for component in assembly.effective_field.components
    )


def test_sparse_protein_diagnostics_are_scoped_to_affected_canonical_residues():
    native = Chem.MolFromSequence("AA")
    assert all_chem.EmbedMolecule(native, randomSeed=82) == 0
    protein = mol_to_normalized(native, filename="current.pdb", format_name="pdb")
    residues = {atom.id: atom.residue_id for atom in protein.atoms}
    peptide = next(bond for bond in protein.bonds if (
        residues[bond.atom_1_id] != residues[bond.atom_2_id]
    ))
    protein = protein.model_copy(update={
        "bonds": [bond for bond in protein.bonds if bond.id != peptide.id],
    })
    source = combined(protein, molecule("CCO"))
    parameters, _ = quick_capture(source)
    assembly = build_assembly({"entry": source}, parameters)
    original = source.to_bytes()
    force_field(assembly)
    assert assembly.connectivity_limited
    assert assembly.effective_field is not None
    records = {
        component.component_id: component for component in assembly.effective_field.components
    }
    # The absent incoming peptide is diagnosed on residue 2 (canonical atoms
    # 6--11); neither residue 1 nor the independent ethanol is mislabeled.
    assert "current_connectivity" not in records["entry:1"].omissions
    assert "current_connectivity" in records["entry:6"].omissions
    assert "current_connectivity" not in records["entry:12"].omissions
    assert source.to_bytes() == original


def test_disconnected_native_components_do_not_imply_current_connectivity_omissions():
    source = combined(molecule("CCO"), translated(molecule("O"), (4, 0, 0)))
    parameters, _ = quick_capture(source)
    assembly = build_assembly({"entry": source}, parameters)
    force_field(assembly)
    assert assembly.effective_field is not None
    assert len(assembly.effective_field.components) == 2
    assert assembly.effective_field.omissions == []
    assert all(
        component.coverage == "complete" for component in assembly.effective_field.components
    )


def test_job_and_model_share_effective_field_while_strict_report_remains_unchanged(tmp_path: Path):
    parameters, inputs = quick_capture(molecule())
    result = execute(parameters, inputs, LocalContext(tmp_path))
    provenance = QuickEffectiveField.model_validate(result.values["effective_field"])
    model = next(artifact for artifact in result.artifacts if artifact.role == "model")
    with zipfile.ZipFile(io.BytesIO(model.data)) as archive:
        stored = json.loads(archive.read("local-model.json"))
    assert stored["effective_field"] == provenance.model_dump(mode="json")
    assert provenance.components[0].atom_ids == list(range(1, 10))
    report = json.loads(next(
        artifact.data for artifact in result.artifacts if artifact.role == "report"
    ))
    assert "effective_field" not in report
    assert QuickReport.model_validate(report).schema_version == 1


def valid_provenance():
    return {
        "schema_version": 1,
        "model": "quick-local-v1",
        "components": [{
            "component_id": "entry:1", "entry_id": "entry", "atom_ids": [1, 3],
            "method": "MMFF94", "coverage": "complete", "omissions": [],
        }],
        "omissions": [],
    }


@pytest.mark.parametrize("change", [
    {"atom_ids": [0, 3]}, {"atom_ids": [3, 1]}, {"atom_ids": [1, 1]},
    {"atom_ids": [True, 3]}, {"atom_ids": [1.0, 3]}, {"atom_ids": ["1", 3]},
    {"atom_ids": [1, 9007199254740992]},
    {"component_id": "entry:3"}, {"method": "UFF"},
    {"omissions": ["uff_electrostatics"]},
    {"coverage": "approximate", "omissions": ["coordination", "coordination"]},
    {"coverage": "approximate", "omissions": ["unknown"]},
])
def test_invalid_component_diagnostics_are_rejected(change):
    value = valid_provenance()
    value["components"][0].update(change)
    with pytest.raises(ValidationError):
        QuickEffectiveField.model_validate(value)


@pytest.mark.parametrize("kind", [
    "overlap", "duplicate_identity", "extra_omission", "missing_omission",
])
def test_invalid_component_memberships_or_overall_omission_union_are_rejected(kind):
    value = valid_provenance()
    if kind == "overlap":
        value["components"].append({
            **value["components"][0], "component_id": "entry:3", "atom_ids": [3, 5],
        })
    elif kind == "duplicate_identity":
        value["components"].append(value["components"][0].copy())
    elif kind == "extra_omission":
        value["omissions"] = ["fixed_only_native_terms"]
    else:
        value["components"][0]["omissions"] = ["fixed_only_native_terms"]
    with pytest.raises(ValidationError):
        QuickEffectiveField.model_validate(value)


def test_blocked_after_field_construction_omits_final_model_provenance(tmp_path: Path, monkeypatch):
    import neistra_core.minimization.quick_optimize as module

    def blocked(assembly, *args):
        force_field(assembly)
        assert assembly.effective_field is not None
        raise RuntimeError("final local-model validation failed")

    monkeypatch.setattr(module, "optimize", blocked)
    parameters, inputs = quick_capture(molecule())
    result = execute(parameters, inputs, LocalContext(tmp_path))
    assert result.values["outcome"] == "blocked"
    assert "effective_field" not in result.values
    assert all(artifact.role != "model" for artifact in result.artifacts)
