from __future__ import annotations

import importlib

import pytest
from neistra_core.adapters.rdkit_common import mol_to_normalized
from neistra_core.ligand_properties import (
    DESCRIPTOR_REGISTRY,
    MAX_PROPERTY_BONDS,
    DescriptorDefinition,
    DescriptorReport,
    DescriptorValue,
    calculate_properties,
)
from neistra_core.molecular import Bond, InferenceRecord
from pydantic import ValidationError
from rdkit import Chem


@pytest.mark.parametrize("value", [True, "1", float("nan"), float("inf")])
def test_result_numeric_boundary_refuses_coercion_and_nonfinite_values(value: object) -> None:
    with pytest.raises(ValidationError):
        DescriptorValue(descriptor_id="hbd", status="ready", value=value)


@pytest.mark.parametrize(
    "payload",
    [
        {"status": "ready"},
        {"status": "ready", "value": 0, "reason": "failure"},
        {"status": "unavailable", "value": 0, "reason": "unknown"},
        {"status": "error"},
    ],
)
def test_result_shape_requires_exact_success_or_reason(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        DescriptorValue.model_validate({"descriptor_id": "hbd", **payload})


def test_report_is_immutable_roundtrippable_and_explicitly_covers_its_outcomes() -> None:
    original = b"CCO\n"
    structure = mol_to_normalized(
        Chem.MolFromSmiles("CCO"), filename="ethanol.smi", format_name="smiles"
    )
    report = calculate_properties(structure, [1, 2, 3], original_bytes=original)
    assert DescriptorReport.model_validate_json(report.model_dump_json()) == report
    with pytest.raises(ValidationError):
        report.input_hash = "f" * 64
    with pytest.raises(ValidationError):
        report.values[0].value = 999
    with pytest.raises(TypeError):
        DESCRIPTOR_REGISTRY["other"] = DESCRIPTOR_REGISTRY["hbd"]  # type: ignore[index]
    payload = report.model_dump(mode="json")
    payload["coverage"] = ["hbd"]
    with pytest.raises(ValidationError):
        DescriptorReport.model_validate(payload)
    payload = report.model_dump(mode="json")
    payload["contains_formally_charged_atoms"] = 0
    with pytest.raises(ValidationError):
        DescriptorReport.model_validate(payload)


@pytest.mark.parametrize("member_ids", [[], [1, 1], [999], [True, 2, 3], [0, 2, 3]])
def test_invalid_membership_never_falls_back_to_the_whole_structure(member_ids: list[int]) -> None:
    structure = mol_to_normalized(
        Chem.MolFromSmiles("CCO"), filename="ethanol.smi", format_name="smiles"
    )
    result = calculate_properties(structure, member_ids, original_bytes=b"CCO\n")
    assert result.model_reason == "invalid_candidate_membership"
    assert all(value.value is None for value in result.values)


def test_dense_malformed_input_is_refused_before_evidence_graph_canonicalization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    structure = mol_to_normalized(
        Chem.MolFromSmiles("CC"), filename="ethane.smi", format_name="smiles"
    )
    structure = structure.model_copy(
        update={
            "bonds": [
                Bond(id=number + 1, atom_1_id=1, atom_2_id=2, order=1)
                for number in range(MAX_PROPERTY_BONDS + 1)
            ]
        }
    )
    module = importlib.import_module("neistra_core.ligand_properties.input")

    def forbidden(*args: object, **kwargs: object) -> object:
        raise AssertionError("Resource-refused input entered molecular preparation")

    monkeypatch.setattr(module, "prepare_chemistry", forbidden)
    monkeypatch.setattr(module, "_evidence_identity", forbidden)
    result = calculate_properties(structure, [1, 2])
    assert result.model_reason == "property_bond_limit"
    assert all(value.value is None for value in result.values)


def test_atom_associated_inference_retains_its_site_when_ids_change() -> None:
    digests = []
    for reverse in [False, True]:
        mol = Chem.MolFromSmiles("CCOC")
        order = [3, 2, 1, 0] if reverse else [0, 1, 2, 3]
        mol = Chem.RenumberAtoms(mol, order)
        structure = mol_to_normalized(mol, filename="source.mol", format_name="mol")
        structure = structure.model_copy(
            update={
                "inferences": [
                    InferenceRecord(
                        code="formal_charge_inferred",
                        message="Current fact",
                        atom_ids=[order.index(0) + 1],
                    )
                ]
            }
        )
        result = calculate_properties(
            structure, [1, 2, 3, 4], original_bytes=Chem.MolToMolBlock(mol).encode()
        )
        digests.append(result.input_hash)
    assert digests[0] == digests[1]


@pytest.mark.parametrize("module", [".models", ".registry", ".input", ".calculate"])
def test_legacy_namespace_is_the_same_implementation(module: str) -> None:
    assert importlib.import_module(
        "molweave_core.ligand_properties" + module
    ) is importlib.import_module("neistra_core.ligand_properties" + module)


def test_legacy_package_exports_the_canonical_functions_and_models() -> None:
    legacy = importlib.import_module("molweave_core.ligand_properties")
    canonical = importlib.import_module("neistra_core.ligand_properties")
    assert legacy.calculate_properties is canonical.calculate_properties
    assert legacy.DescriptorReport is canonical.DescriptorReport
    assert legacy.DESCRIPTOR_REGISTRY is canonical.DESCRIPTOR_REGISTRY


def test_plot_domains_are_display_hints_and_do_not_clamp_scientific_values() -> None:
    definition = DESCRIPTOR_REGISTRY["calculated_logp"]
    assert definition.plot_domain == (-2, 10)
    altered = definition.model_dump(mode="json")
    altered["plot_domain"] = [10, -2]
    with pytest.raises(ValidationError):
        DescriptorDefinition.model_validate(altered)
    assert (
        DescriptorValue(descriptor_id="calculated_logp", status="ready", value=20.0).value == 20.0
    )
