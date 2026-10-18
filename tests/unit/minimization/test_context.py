from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
from molweave_core.minimization.assembly import environment_preflight
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.stereo import assembly_stereo_validator
from molweave_core.minimization.templates import ResidueTemplate
from molweave_core.molecular import Bond

from tests.support.minimization import combined, environment_capture, molecule, peptide


@pytest.fixture
def templates() -> dict[str, ResidueTemplate]:
    data = json.loads(
        (Path(__file__).parents[2] / "fixtures/minimization/template-graphs.json").read_text()
    )
    return {
        name: ResidueTemplate(
            name,
            tuple(v["atom_names"]),
            tuple(v["elements"]),
            frozenset(frozenset(b) for b in v["bonds"]),
            tuple(tuple(p) for p in v["positions"]),
            v["net_charge"],
        )
        for name, v in data.items()
    }


@pytest.mark.parametrize(
    "change,code",
    [
        ("hydrogen", "protein_template_missing"),
        ("terminal_oxygen", "protein_template_missing"),
        ("nonstandard", "protein_template_missing"),
        ("crosslink", "crosslink_unsupported"),
        ("missing_peptide", "protein_topology"),
    ],
)
def test_incomplete_or_unsupported_proteins_refuse_before_parameterization(templates, change, code):
    source = peptide()
    if change in {"hydrogen", "terminal_oxygen"}:
        atom_id = next(
            a.id for a in source.atoms if a.name == ("H" if change == "hydrogen" else "OXT")
        )
        indices = [i for i, a in enumerate(source.atoms) if a.id != atom_id]
        source = source.model_copy(
            update={
                "atoms": [source.atoms[i] for i in indices],
                "bonds": [b for b in source.bonds if atom_id not in {b.atom_1_id, b.atom_2_id}],
                "conformers": [
                    c.model_copy(update={"coordinates": [c.coordinates[i] for i in indices]})
                    for c in source.conformers
                ],
            }
        )
    elif change == "nonstandard":
        source = source.model_copy(
            update={
                "residues": [
                    r.model_copy(update={"name": "MSE"}) if r.id == 2 else r
                    for r in source.residues
                ]
            }
        )
    elif change == "crosslink":
        source = source.model_copy(
            update={"bonds": [*source.bonds, Bond(id=31, atom_1_id=5, atom_2_id=14, order=1)]}
        )
    else:
        source = source.model_copy(
            update={"bonds": [b for b in source.bonds if {b.atom_1_id, b.atom_2_id} != {3, 6}]}
        )
    params, inputs = environment_capture({"p": source}, {"p": [7]})
    with pytest.raises(CalculationError) as error:
        environment_preflight(params, inputs, templates)
    assert error.value.code == code
    assert source.to_bytes() == inputs[0].data


def test_context_capture_is_exact_and_closed(templates):
    source = peptide()
    params, inputs = environment_capture({"p": source}, {"p": [7]}, {"p": [6, 7, 8, 9, 24, 25, 26]})
    with pytest.raises(CalculationError, match="complete covalent"):
        environment_preflight(params, inputs, templates)
    params, inputs = environment_capture({"p": source}, {"p": [7]})
    tampered = replace(inputs[0], sha256="0" * 64)
    with pytest.raises(CalculationError, match="immutable capture"):
        environment_preflight(params, (tampered,), templates)
    assert hashlib.sha256(inputs[0].data).hexdigest() == params.captured_inputs[0].sha256


def test_covalent_adduct_refuses_and_does_not_drop_the_ligand(templates):
    source = combined(peptide(), molecule())
    source = source.model_copy(
        update={
            "bonds": [
                *source.bonds,
                Bond(id=max(b.id for b in source.bonds) + 1, atom_1_id=5, atom_2_id=32, order=1),
            ]
        }
    )
    params, inputs = environment_capture({"p": source}, {"p": [32]})
    with pytest.raises(CalculationError, match="adducts are deferred"):
        environment_preflight(params, inputs, templates)


def test_excluded_disconnected_components_do_not_enter_context(templates):
    ligand = molecule()
    source = combined(peptide(), ligand, molecule("[Na+]"))
    # The excluded ion remains in the source artifact and must not be parameterized.
    included = [a.id for a in source.atoms[:-1]]
    params, inputs = environment_capture({"p": source}, {"p": [32]}, {"p": included})
    value = environment_preflight(params, inputs, templates)
    assert len(value.references) == len(source.atoms) - 1
    assert {c.kind for c in value.components} == {"protein", "organic"}
    params, inputs = environment_capture({"p": source}, {"p": [32]})
    with pytest.raises(CalculationError, match="closed-shell organic"):
        environment_preflight(params, inputs, templates)


def test_mirrored_protein_geometry_is_rejected_without_choosing_configuration(templates):
    source = peptide()
    params, inputs = environment_capture({"p": source}, {"p": [7]})
    value = environment_preflight(params, inputs, templates)
    validate = assembly_stereo_validator(value)
    reflected = np.asarray(value.coordinates).copy()
    reflected[:, 2] *= -1
    with pytest.raises(CalculationError, match="protein stereochemistry"):
        validate(reflected)


def test_organic_component_limit_is_whole_calculation_refusal(templates):
    sources = {str(i): molecule() for i in range(5)}
    params, inputs = environment_capture(sources, {"0": [3]})
    with pytest.raises(CalculationError, match="four organic"):
        environment_preflight(params, inputs, templates)


@pytest.mark.parametrize("kind", ["charge", "net_charge", "order", "stereo", "duplicate_bond"])
def test_assigned_protein_chemistry_is_not_silently_overwritten(templates, kind):
    source = peptide()
    if kind in {"charge", "stereo"}:
        source = source.model_copy(
            update={
                "atoms": [
                    a.model_copy(
                        update={"formal_charge": 5}
                        if kind == "charge"
                        else {"stereo": "TETRAHEDRAL_CCW"}
                    )
                    if a.id == 2
                    else a
                    for a in source.atoms
                ]
            }
        )
    elif kind == "net_charge":
        source = source.model_copy(
            update={"atoms": [a.model_copy(update={"formal_charge": 0}) for a in source.atoms]}
        )
    elif kind == "duplicate_bond":
        source = source.model_copy(
            update={"bonds": [*source.bonds, source.bonds[0].model_copy(update={"id": 31})]}
        )
    else:
        source = source.model_copy(
            update={
                "bonds": [
                    b.model_copy(update={"order": 3.0})
                    if {b.atom_1_id, b.atom_2_id} == {1, 2}
                    else b
                    for b in source.bonds
                ]
            }
        )
    params, inputs = environment_capture({"p": source}, {"p": [7]})
    with pytest.raises(CalculationError):
        value = environment_preflight(params, inputs, templates)
        assembly_stereo_validator(value)
