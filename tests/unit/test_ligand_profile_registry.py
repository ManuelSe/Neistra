"""Source-qualified registry contracts, independent of the browser evaluator."""

from __future__ import annotations

import importlib
import json
import math
import runpy
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from neistra_core.ligand_profiles import PROFILE_REGISTRY, profile_registry_document
from neistra_core.ligand_profiles.models import ProfileConstraint, ProfileRegistry
from neistra_core.ligand_properties.registry import DESCRIPTOR_REGISTRY
from pydantic import ValidationError

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures/profiles"
REFERENCE = runpy.run_path(str(FIXTURES / "generate_boundaries.py"))["REFERENCE"]


def flattened(document: dict[str, Any], profile_id: str) -> list[dict[str, Any]]:
    profile = next(item for item in document["profiles"] if item["id"] == profile_id)
    by_id = {item["id"]: item for item in document["constraints"]}
    result = {key: by_id[key] for key in profile["constraint_ids"]}
    for component in profile["component_ids"]:
        for constraint in flattened(document, component):
            result[constraint["id"]] = constraint
    return list(result.values())


def test_registry_has_seven_defensible_and_two_inspectable_unavailable_variants() -> None:
    available = [item.id for item in PROFILE_REGISTRY.profiles if item.availability == "available"]
    unavailable = [item for item in PROFILE_REGISTRY.profiles if item.availability == "unavailable"]
    assert available == list(REFERENCE)
    assert [item.id for item in unavailable] == ["cns-mpo", "scaffold-som"]
    assert unavailable[0].missing_inputs == ("logd_ph_7_4", "most_basic_pka")
    assert unavailable[1].missing_inputs == ("reproducible_scaffold_som_method",)
    assert all(item.unavailable_reason and not item.constraint_ids for item in unavailable)
    assert all(
        not item.required_descriptor_ids and not item.default_filter_ranges for item in unavailable
    )
    assert len(PROFILE_REGISTRY.constraints) == 22


@pytest.mark.parametrize("profile_id", list(REFERENCE))
def test_every_exact_source_limit_and_operator_matches_independent_reference(
    profile_id: str,
) -> None:
    actual = flattened(profile_registry_document(), profile_id)
    assert [(item["descriptor_id"], item["operator"], item["limit"]) for item in actual] == (
        REFERENCE[profile_id]
    )


def test_composite_references_existing_profiles_without_threshold_copies() -> None:
    profiles = {item.id: item for item in PROFILE_REGISTRY.profiles}
    assert profiles["ro5-veber"].component_ids == ("ro5", "veber")
    assert profiles["ro5-veber"].constraint_ids == ()
    assert profiles["ro3"].required_descriptor_ids == (
        "molecular_weight",
        "hbd",
        "hba",
        "calculated_logp",
    )
    assert profiles["veber"].required_descriptor_ids == ("tpsa", "rotatable_bond_count")
    assert profiles["teague-lead-range"].source_domain == "no_formally_charged_atoms"
    assert all(
        profile.source_domain == "qualified_representation"
        for profile in profiles.values()
        if profile.id != "teague-lead-range"
    )


def test_paper_citations_and_adaptations_are_inspectable() -> None:
    sources = {item.id: item for item in PROFILE_REGISTRY.sources}
    assert {key: item.doi for key, item in sources.items()} == {
        "lipinski-1997": "10.1016/S0169-409X(96)00423-1",
        "congreve-2003": "10.1016/S1359-6446(03)02831-9",
        "veber-2002": "10.1021/jm020017n",
        "doak-2014": "10.1016/j.chembiol.2014.08.013",
        "gleeson-2008": "10.1021/jm701122q",
        "teague-1999": "10.1002/(SICI)1521-3773(19991216)38:24<3743::AID-ANIE3743>3.0.CO;2-U",
        "wager-2010": "10.1021/cn100008c",
        "lee-schneider-2001": "10.1021/cc000097l",
    }
    for profile in PROFILE_REGISTRY.profiles:
        assert profile.source_ids and profile.adaptations and profile.definition_version
        assert all(sources[source].url.startswith("https://") for source in profile.source_ids)
    assert "not an extra" in " ".join(
        next(item for item in PROFILE_REGISTRY.profiles if item.id == "veber").adaptations
    )


def test_default_filter_endpoints_are_derived_and_keep_strictness() -> None:
    profiles = {item.id: item for item in PROFILE_REGISTRY.profiles}
    ranges = {
        profile: {item.descriptor_id: item for item in profiles[profile].default_filter_ranges}
        for profile in profiles
    }
    assert ranges["ro3"]["molecular_weight"].maximum is not None
    assert ranges["ro3"]["molecular_weight"].maximum.inclusive is False
    assert ranges["gleeson-4-400"]["calculated_logp"].maximum is not None
    assert ranges["gleeson-4-400"]["calculated_logp"].maximum.inclusive is False
    for descriptor in ("molecular_weight", "calculated_logp"):
        interval = ranges["teague-lead-range"][descriptor]
        assert interval.minimum is not None and interval.maximum is not None
        assert interval.minimum.inclusive is interval.maximum.inclusive is True
    assert ranges["doak-outer-envelope"]["molecular_weight"].minimum is None
    assert ranges["ro5"]["calculated_logp"].minimum is None


def test_axes_share_domains_and_distinguish_numeric_validity_from_display() -> None:
    assert [axis.id for axis in PROFILE_REGISTRY.axes] == [
        "hbd",
        "hba",
        "tpsa",
        "molecular_weight",
        "heavy_atom_count",
        "heteroatom_count",
        "carbon_count",
        "formal_charge",
        "calculated_logp",
        "molar_refractivity",
        "rotatable_bond_count",
        "ring_count",
        "aromatic_ring_count",
        "fraction_sp3",
    ]
    for axis in PROFILE_REGISTRY.axes:
        assert axis.domain == DESCRIPTOR_REGISTRY[axis.descriptor_id].plot_domain
        assert axis.clipping == "mark_and_clip" and axis.missing == "leave_missing"
    rules = {axis.descriptor_id: axis.numeric_rule for axis in PROFILE_REGISTRY.axes}
    assert rules["hbd"] == "nonnegative_integer"
    assert rules["formal_charge"] == "safe_integer"
    assert rules["fraction_sp3"] == "fraction_0_1"
    assert rules["calculated_logp"] == rules["molar_refractivity"] == "finite"


def test_transport_specimen_matches_fresh_canonical_serialization_and_roundtrips() -> None:
    document = profile_registry_document()
    assert json.loads((FIXTURES / "registry.json").read_text()) == document
    assert ProfileRegistry.model_validate_json(json.dumps(document)) == PROFILE_REGISTRY
    document["constraints"][0]["limit"] = -999
    assert profile_registry_document()["constraints"][0]["limit"] == 500
    with pytest.raises(ValidationError):
        PROFILE_REGISTRY.registry_version = "changed"  # type: ignore[misc]


def test_offline_oracles_are_reproducible_and_cover_adjacent_floats_and_integer_neighbours() -> (
    None
):
    generator = runpy.run_path(str(FIXTURES / "generate_boundaries.py"))
    fixture = json.loads((FIXTURES / "boundaries.json").read_text())
    assert fixture == json.loads(json.dumps(generator["independent_specimen"]()))
    assert len(fixture["samples"]) == 87
    assert len(fixture["operator_controls"]) == 12
    below = next(
        item for item in fixture["samples"] if item["id"] == "ro5:molecular_weight:le:500:below"
    )
    assert below["values"]["molecular_weight"] == math.nextafter(500.0, -math.inf)
    above = next(item for item in fixture["samples"] if item["id"] == "ro5:hbd:le:5:above")
    assert above["values"]["hbd"] == 6


def test_actual_molecular_observations_reproduce_and_have_independent_counts_and_mass() -> None:
    generator = runpy.run_path(str(FIXTURES / "generate_boundaries.py"))
    fixture = json.loads((FIXTURES / "molecular-cases.json").read_text())
    assert fixture == json.loads(json.dumps(generator["molecular_specimen"]()))
    cases = {item["id"]: item for item in fixture["cases"]}
    assert cases["ethanol"]["values"]["molecular_weight"] == pytest.approx(
        2 * 12.011 + 6 * 1.008 + 15.999, abs=1e-10, rel=0
    )
    assert cases["ethylbenzene"]["values"]["molecular_weight"] == pytest.approx(
        8 * 12.011 + 10 * 1.008, abs=1e-10, rel=0
    )
    assert cases["ethylbenzene"]["values"]["carbon_count"] == 8
    assert cases["ethylbenzene"]["values"]["fraction_sp3"] == 0.25
    for name in ("glycine-zwitterion", "nitrobenzene"):
        assert cases[name]["values"]["formal_charge"] == 0
        assert cases[name]["contains_formally_charged_atoms"] is True
        assert cases[name]["expected_profiles"]["teague-lead-range"] == "unavailable"
    assert cases["ethylbenzene"]["contains_formally_charged_atoms"] is False
    assert cases["ethylbenzene"]["expected_profiles"]["teague-lead-range"] == "pass"


@pytest.mark.parametrize("case_id", ["isotopic-methane", "methyl-radical"])
def test_unavailable_models_keep_only_independently_qualified_partial_values(case_id: str) -> None:
    fixture = json.loads((FIXTURES / "molecular-cases.json").read_text())
    specimen = next(item for item in fixture["partial_cases"] if item["id"] == case_id)
    assert specimen["model_status"] == "unavailable" and specimen["model_reason"]
    assert specimen["coverage"] == list(DESCRIPTOR_REGISTRY)
    values = {item["descriptor_id"]: item for item in specimen["values"]}
    assert specimen["expected_known_values"] == {
        "heavy_atom_count": 1,
        "heteroatom_count": 0,
        "carbon_count": 1,
        "formal_charge": 0,
    }
    for descriptor_id, expected in specimen["expected_known_values"].items():
        assert values[descriptor_id]["status"] == "ready"
        assert values[descriptor_id]["value"] == expected
    for descriptor in DESCRIPTOR_REGISTRY.values():
        if descriptor.depends_on == "qualified_graph":
            assert values[descriptor.id]["status"] == "unavailable"
            assert values[descriptor.id]["value"] is None
            assert values[descriptor.id]["reason"] == specimen["model_reason"]


@pytest.mark.parametrize(
    "collection", ["descriptors", "sources", "constraints", "axes", "profiles"]
)
def test_duplicate_registry_identifiers_are_refused(collection: str) -> None:
    document = profile_registry_document()
    document[collection].append(deepcopy(document[collection][0]))
    with pytest.raises(ValidationError):
        ProfileRegistry.model_validate(document)


@pytest.mark.parametrize("value", [True, False, math.nan, math.inf, -math.inf, "500", None])
def test_limit_numbers_are_strict_finite_values(value: object) -> None:
    with pytest.raises(ValidationError):
        ProfileConstraint(
            id="control", descriptor_id="molecular_weight", operator="le", limit=value
        )


@pytest.mark.parametrize("limit", [3.5, 2**53])
def test_integer_descriptor_limits_cannot_be_fractional_or_unsafe(limit: float) -> None:
    document = profile_registry_document()
    document["constraints"][2]["limit"] = limit
    with pytest.raises(ValidationError):
        ProfileRegistry.model_validate(document)


@pytest.mark.parametrize(
    "field,foreign",
    [
        ("source_ids", "unknown-source"),
        ("constraint_ids", "unknown-constraint"),
        ("component_ids", "unknown-profile"),
        ("axis_ids", "unknown-axis"),
    ],
)
def test_foreign_profile_references_are_refused(field: str, foreign: str) -> None:
    document = profile_registry_document()
    profile = document["profiles"][0]
    profile[field] = [foreign]
    if field == "component_ids":
        profile["constraint_ids"] = []
    with pytest.raises(ValidationError):
        ProfileRegistry.model_validate(document)


def test_composite_cycles_are_refused_before_evaluation() -> None:
    document = profile_registry_document()
    document["profiles"][0]["constraint_ids"] = []
    document["profiles"][0]["component_ids"] = ["ro5-veber"]
    with pytest.raises(ValidationError, match="cycle"):
        ProfileRegistry.model_validate(document)


@pytest.mark.parametrize(
    "mutation",
    [
        "descriptor-method",
        "constraint-descriptor",
        "axis-descriptor",
        "axis-policy",
        "axis-domain",
        "derived-filter",
        "required-descriptors",
        "missing-source-reason",
        "unavailable-executable",
        "default-inclusive-not-bool",
    ],
)
def test_malformed_registry_boundaries_are_refused(mutation: str) -> None:
    document = profile_registry_document()
    if mutation == "descriptor-method":
        document["descriptors"][0]["policy_version"] = "other"
    elif mutation == "constraint-descriptor":
        document["constraints"][0]["descriptor_id"] = "foreign"
    elif mutation == "axis-descriptor":
        document["axes"][0]["descriptor_id"] = "foreign"
    elif mutation == "axis-policy":
        document["axes"][0]["numeric_rule"] = "safe_integer"
    elif mutation == "axis-domain":
        document["axes"][0]["domain"][1] = math.inf
    elif mutation == "derived-filter":
        document["profiles"][0]["default_filter_ranges"][0]["maximum"]["value"] = 501
    elif mutation == "required-descriptors":
        document["profiles"][0]["required_descriptor_ids"] = ["molecular_weight"]
    elif mutation == "missing-source-reason":
        document["profiles"][-1]["unavailable_reason"] = None
    elif mutation == "unavailable-executable":
        document["profiles"][-1]["constraint_ids"] = ["mw-le-500"]
    else:
        document["profiles"][0]["default_filter_ranges"][0]["maximum"]["inclusive"] = "true"
    with pytest.raises(ValidationError):
        ProfileRegistry.model_validate(document)


def test_compatibility_aliases_do_not_create_another_registry_or_runtime() -> None:
    canonical = importlib.import_module("neistra_core.ligand_profiles.registry")
    alias = importlib.import_module("molweave_core.ligand_profiles.registry")
    assert alias is canonical
    assert alias.PROFILE_REGISTRY is PROFILE_REGISTRY
