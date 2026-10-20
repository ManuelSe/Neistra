from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from molweave_core.jobs import JobCancelled
from molweave_core.minimization.contracts import CalculationError, MinimizationParameters
from molweave_core.minimization.parameterization import write_calculation_mol2
from molweave_core.minimization.plugin import plugin
from molweave_core.minimization.preflight import isolated_preflight
from molweave_core.minimization.toolchain import AmberTools
from pydantic import ValidationError

from tests.support.minimization import LocalContext, capture, molecule


def test_subset_keeps_complete_covalent_context_and_input_exact() -> None:
    structure = molecule()
    before = structure.to_bytes()
    parameters, inputs = capture(structure, [3])
    value = isolated_preflight(parameters, inputs)
    assert value.movable_indices == (2,)
    assert [a.id for a in value.structure.atoms] == list(range(1, 10))
    assert value.structure.to_bytes() == before
    assert structure.to_bytes() == before


def test_empty_selection_never_means_everything() -> None:
    with pytest.raises(ValidationError, match="movable"):
        capture(molecule(), [])


@pytest.mark.parametrize(
    "change,code",
    [
        ("charge", "chemistry_unknown"),
        ("order", "chemistry_unknown"),
        ("alternate", "alternate_sites"),
        ("identity", "identity_uncertain"),
        ("isotope", "identity_uncertain"),
        ("coordinates", "input_invalid"),
    ],
)
def test_prerequisites_refuse_without_repair(change: str, code: str) -> None:
    structure = molecule()
    if change == "charge":
        structure = structure.model_copy(
            update={
                "atoms": [a.model_copy(update={"formal_charge": None}) for a in structure.atoms]
            }
        )
    elif change == "order":
        structure = structure.model_copy(
            update={"bonds": [b.model_copy(update={"order": None}) for b in structure.bonds]}
        )
    elif change == "alternate":
        structure = structure.model_copy(
            update={
                "atoms": [a.model_copy(update={"alternate_location": "A"}) for a in structure.atoms]
            }
        )
    elif change == "identity":
        structure = structure.model_copy(update={"annotations": []})
    elif change == "isotope":
        annotations = [dict(a) for a in structure.annotations]
        annotations[0] = {
            **annotations[0],
            "atoms": [{**a, "isotope": 2} for a in annotations[0]["atoms"]],
        }
        structure = structure.model_copy(update={"annotations": annotations})
    else:
        structure = structure.model_copy(
            update={
                "conformers": [
                    c.model_copy(
                        update={"coordinates": [(float("nan"), 0, 0)] * len(structure.atoms)}
                    )
                    for c in structure.conformers
                ]
            }
        )
    parameters, inputs = capture(structure, [1])
    before = structure.to_bytes()
    with pytest.raises(CalculationError) as error:
        isolated_preflight(parameters, inputs)
    assert error.value.code == code
    assert structure.to_bytes() == before


def test_missing_hydrogens_require_a_separate_action() -> None:
    parameters, inputs = capture(molecule(explicit_h=False))
    with pytest.raises(CalculationError, match="Complete explicit hydrogens"):
        isolated_preflight(parameters, inputs)


def test_input_hash_and_complete_context_are_verified() -> None:
    parameters, inputs = capture(molecule(), [3])
    with pytest.raises(CalculationError, match="immutable"):
        isolated_preflight(parameters, (replace(inputs[0], data=b"{}"),))
    truncated = parameters.model_copy(
        update={
            "captured_inputs": [parameters.captured_inputs[0].model_copy(update={"atom_ids": [3]})]
        }
    )
    with pytest.raises(CalculationError, match="complete covalent"):
        isolated_preflight(truncated, inputs)


def test_current_active_conformer_must_match_capture() -> None:
    parameters, inputs = capture(molecule())
    parameters = parameters.model_copy(
        update={
            "captured_inputs": [
                parameters.captured_inputs[0].model_copy(update={"conformer_id": 7})
            ]
        }
    )
    with pytest.raises(CalculationError, match="active conformer"):
        isolated_preflight(parameters, inputs)


def test_unconfigured_or_wrong_toolchain_refuses(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("MOLWEAVE_AMBERTOOLS_PREFIX", raising=False)
    with pytest.raises(CalculationError, match="Install the locked"):
        AmberTools.discover()
    with pytest.raises(CalculationError, match="Invalid locked"):
        AmberTools.discover(tmp_path)


def test_cancellation_is_not_a_scientific_success(tmp_path: Path) -> None:
    parameters, inputs = capture(molecule())
    context = LocalContext(tmp_path)
    context.cancelled = True
    with pytest.raises(JobCancelled):
        plugin.execute("coordinates.minimize", parameters, inputs, context)
    assert not list(tmp_path.iterdir())


def test_profile_and_limits_are_not_user_selected_guesses() -> None:
    parameters, _ = capture(molecule())
    raw = parameters.model_dump(mode="json")
    for change in ({"model": "uff"}, {"mode": "everything"}, {"max_iterations": 2001}):
        with pytest.raises(ValidationError):
            MinimizationParameters.model_validate({**raw, **change})


def test_native_projection_uses_only_generated_labels_not_user_script_text() -> None:
    structure = molecule()
    injection = "user_text\nquit\nsource another-file"
    structure = structure.model_copy(
        update={
            "title": injection,
            "atoms": [a.model_copy(update={"name": injection}) for a in structure.atoms],
        }
    )
    parameters, inputs = capture(structure)
    value = isolated_preflight(parameters, inputs)
    text, names = write_calculation_mol2(value)
    assert "user_text" not in text and "source another-file" not in text
    assert len(set(names)) == len(structure.atoms)


@pytest.mark.parametrize("smiles", ["[Cl-]", "[Br-]", "[I-]", "N", "O"])
def test_inorganic_components_cannot_enter_the_organic_gaff_path(smiles):
    parameters, inputs = capture(molecule(smiles))
    before = inputs[0].data
    with pytest.raises(CalculationError, match="inorganic ions are unsupported"):
        isolated_preflight(parameters, inputs)
    assert inputs[0].data == before


def test_explicit_ion_classification_cannot_be_ignored_for_an_organic_graph():
    source = molecule()
    source = source.model_copy(
        update={
            "residues": [r.model_copy(update={"component_type": "ion"}) for r in source.residues]
        }
    )
    parameters, inputs = capture(source)
    with pytest.raises(CalculationError, match="inorganic ions are unsupported"):
        isolated_preflight(parameters, inputs)


def test_missing_identity_is_not_misreported_as_malformed():
    params, inputs = capture(molecule().model_copy(update={"annotations": []}))
    with pytest.raises(CalculationError, match=r"Atom 1.*missing evidence") as caught:
        isolated_preflight(params, inputs)
    assert caught.value.code == "identity_uncertain"
    assert caught.value.__cause__ is None


def test_malformed_identity_preserves_the_underlying_cause():
    source = molecule().model_copy(
        update={"annotations": [{"kind": "neistra_hydrogen_protection", "schema_version": 2}]}
    )
    params, inputs = capture(source)
    with pytest.raises(CalculationError, match="Malformed or conflicting") as caught:
        isolated_preflight(params, inputs)
    assert isinstance(caught.value.__cause__, ValidationError)


def test_server_recovery_overlay_is_local_bounded_and_never_overrides_existing_facts():
    from molweave_core.hydrogen_protection import protection_facts
    from molweave_core.minimization.contracts import IdentityRecovery
    from molweave_core.minimization.preflight import recovered_identity

    original = molecule()
    source = original.model_copy(update={"annotations": []})
    params, inputs = capture(source, [3])
    raw = params.model_dump(mode="json")
    assert "identity_recovery" not in raw["captured_inputs"][0]
    proof = IdentityRecovery(
        original_artifact_id="original",
        original_sha256="a" * 64,
        atoms=list(protection_facts(original).values()),
    )
    captured = params.captured_inputs[0].model_copy(update={"identity_recovery": proof})
    with pytest.raises(ValidationError, match="schema2"):
        MinimizationParameters.model_validate({**raw, "captured_inputs": [captured.model_dump()]})
    upgraded = MinimizationParameters.model_validate(
        {**raw, "schema_version": 2, "captured_inputs": [captured.model_dump()]}
    )
    value = isolated_preflight(upgraded, inputs)
    assert protection_facts(value.structure) == protection_facts(original)
    assert not source.annotations and inputs[0].data == source.to_bytes()
    with pytest.raises(CalculationError, match="missing captured atom"):
        recovered_identity(original, captured)
    bad = source.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"source_index": 999}) if a.id == 1 else a for a in source.atoms
            ]
        }
    )
    with pytest.raises(CalculationError, match="missing captured atom"):
        recovered_identity(bad, captured)
    outside = captured.model_dump()
    outside["atom_ids"] = [1]
    with pytest.raises(ValidationError):
        type(captured).model_validate(outside)
