from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import uuid4

import pytest
from neistra_core.ligands.models import LigandDesignationV1

from tests.support import rebranding_reader_qualification as rich


def project() -> dict[str, Any]:
    entry: dict[str, Any] = {
        field: None
        for field in (
            "description",
            "structure_type",
            "original_filename",
            "source_format",
            "atom_count",
            "atom_ids",
            "bond_count",
            "residue_count",
            "conformer_count",
            "warnings",
            "visible",
            "locked",
        )
    }
    entry.update(
        id="entry-old",
        name="occurrence",
        current_artifact_id="artifact-old",
        user_metadata={"ligand_designation": {"scientist_owned": True}},
        viewer_settings={"surface_objects": []},
        ligand_designation=LigandDesignationV1(
            status="resolved",
            source_artifact_id="artifact-old",
            instance_id=str(uuid4()),
            atom_ids=[17, 29],
            origin="manual",
            selected_at="2026-11-16T15:00:00Z",
            assessed_at="2026-11-16T15:00:00Z",
            assessed_revision=37,
            resolver_version="qualified-v1",
        ).model_dump(mode="json"),
    )
    return {
        "schema_version": 3,
        "entries": [entry],
        "scenes": [],
        "saved_selections": [],
        "measurements": [],
    }


def imported(expected: dict[str, Any]) -> dict[str, Any]:
    actual = deepcopy(expected)
    entry = actual["entries"][0]
    entry.update(id="entry-new", current_artifact_id="artifact-new")
    entry["ligand_designation"].update(source_artifact_id="artifact-new", instance_id=str(uuid4()))
    return actual


def test_typed_designation_preserves_exact_membership_and_metadata_with_owned_remaps() -> None:
    expected = project()
    original = deepcopy(expected)
    actual = imported(expected)
    assert rich.assert_portable_display(actual, expected) == {"entry-old": "entry-new"}
    assert expected == original


@pytest.mark.parametrize(
    "field,value",
    [
        ("atom_ids", [17]),
        ("origin", "automatic_single_candidate"),
        ("selected_at", None),
        ("assessed_at", None),
        ("assessed_revision", 0),
        ("resolver_version", "other-policy"),
        ("status", "unresolved"),
        ("reason_code", "unknown"),
        ("source_artifact_id", "wrong-artifact"),
    ],
)
def test_deep_portable_oracle_rejects_designation_loss(field: str, value: Any) -> None:
    expected = project()
    actual = imported(expected)
    actual["entries"][0]["ligand_designation"][field] = value
    with pytest.raises(AssertionError):
        rich.assert_portable_display(actual, expected)


def test_archive_requires_independent_uuid_and_retains_stale_missing_anchors() -> None:
    expected = project()
    expected["entries"][0]["ligand_designation"].update(
        status="stale", atom_ids=[99999], reason_code="lost_anchors"
    )
    actual = imported(expected)
    rich.assert_portable_display(actual, expected)
    actual["entries"][0]["ligand_designation"]["instance_id"] = expected["entries"][0][
        "ligand_designation"
    ]["instance_id"]
    with pytest.raises(AssertionError, match="independent imported intent"):
        rich.assert_portable_display(actual, expected)


def test_schema2_portable_import_gets_only_exact_unresolved_default() -> None:
    expected = project()
    expected["schema_version"] = 2
    del expected["entries"][0]["ligand_designation"]
    actual = deepcopy(expected)
    actual["schema_version"] = 3
    actual["entries"][0]["ligand_designation"] = LigandDesignationV1().model_dump(mode="json")
    rich.assert_portable_display(actual, expected)
    actual["entries"][0]["ligand_designation"]["reason_code"] = "auto_enriched"
    with pytest.raises(AssertionError):
        rich.assert_portable_display(actual, expected)


def test_schema_converter_preserves_unknown_fields_and_nested_user_metadata() -> None:
    expected = project()
    expected["schema_version"] = 2
    del expected["entries"][0]["ligand_designation"]
    expected["future_owned_field"] = {"do_not_strip": [1, 2]}
    converted = rich.selected_expected_project(expected)
    assert converted["future_owned_field"] == expected["future_owned_field"]
    assert converted["entries"][0]["user_metadata"] == expected["entries"][0]["user_metadata"]
    assert expected["schema_version"] == 2


def test_schema2_selected_reader_does_not_import_current_only_helper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from molweave_api.schemas import ProjectRead

    monkeypatch.setattr(ProjectRead.model_fields["schema_version"], "default", 2)
    original = project()
    original["schema_version"] = 2
    del original["entries"][0]["ligand_designation"]
    copied = rich.selected_expected_project(original)
    assert copied == original and copied is not original
    # An old reader cannot silently legitimize a schema3 designation by stripping it.
    newer = project()
    assert rich.selected_expected_project(newer) == newer
