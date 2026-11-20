"""Independent source-context and retained/live lease qualification controls."""

from __future__ import annotations

import copy
import hashlib
import json
import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from neistra_api.database import Base
from neistra_api.main import create_app
from neistra_api.settings import Settings
from neistra_core.ligand_properties import DescriptorReport

from tests.support.api_client import ApiClient
from tests.support.ligand_profiles_performance_preflight import (
    assert_vectors,
    consumer_state,
    current_context,
    preflight,
    source_context,
)
from tests.support.ligand_property_performance_fixtures import load_fixture
from tests.support.ligand_property_performance_qualification import source


@dataclass
class Case:
    client: ApiClient
    data: Path
    database: Path
    project: dict[str, Any]
    directory: Path
    result: dict[str, Any]

    def requirements(self, project: dict[str, Any], phase: str) -> dict[str, Any]:
        entry = project["entries"][0]
        return {
            "project_id": project["id"],
            "source": source(entry),
            "original_artifact_id": entry["original_artifact_id"],
            "preflight_directory": str(self.directory),
            "preflight_sha256": hashlib.sha256(
                (self.directory / "qualification/result.json").read_bytes()
            ).hexdigest(),
            "phase": phase,
        }

    def edit(self) -> dict[str, Any]:
        entry = self.project["entries"][0]
        response = self.client.post(
            f"/api/v1/projects/{self.project['id']}/entries/{entry['id']}/model-edits",
            json={
                "expected_revision": self.project["revision"],
                "expected_artifact_id": entry["current_artifact_id"],
                "selection": {"atoms": [{"structure_id": entry["id"], "atom_id": 1}]},
                "action": {"operation": "atom.element", "element": "N"},
                "hydrogen_policy": "automatic",
            },
        )
        assert response.is_success, response.text
        return dict(response.json()["project"])


@pytest.fixture
def case(tmp_path: Path, request: pytest.FixtureRequest) -> Iterator[Case]:
    data = tmp_path / "data"
    data.mkdir()
    database = data / "neistra.db"
    app = create_app(Settings(data_dir=data, database_url=f"sqlite:///{database}"))
    Base.metadata.create_all(app.state.engine)
    client = ApiClient(app)
    try:
        project = client.post("/api/v1/projects", json={"name": "Profile source context"}).json()
        fixture, original = load_fixture(getattr(request, "param", "paired-chromium-10"))
        response = client.post(
            f"/api/v1/projects/{project['id']}/imports",
            data={"expected_revision": project["revision"], "generate_3d": "false"},
            files=[("files", (fixture["filename"], original, "chemical/x-mdl-sdfile"))],
        )
        assert response.is_success, response.text
        project = response.json()["project"]
        directory = tmp_path / "preflight"
        directory.mkdir()
        requirements = directory / "requirements.json"
        entry = project["entries"][0]
        requirements.write_text(
            json.dumps(
                {
                    "project_id": project["id"],
                    "source": source(entry),
                    "original_artifact_id": entry["original_artifact_id"],
                    "smiles": fixture["intended_smiles"],
                    "fixture_id": fixture["id"],
                }
            )
        )
        result = preflight(database, data, requirements, directory / "qualification")
        yield Case(client, data, database, project, directory, result)
    finally:
        app.state.engine.dispose()


def test_original_context_keeps_distinct_provenance_hash_and_independent_values(case: Case) -> None:
    independent = case.result["independent_no_original"]["before_report"]
    contextual = case.result["source_context"]["before_report"]
    assert independent["provenance"] == ["current_explicit_graph"]
    assert contextual["provenance"] == ["exact_immutable_source_match"]
    assert independent["input_hash"] != contextual["input_hash"]
    assert independent["values"] == contextual["values"]
    assert case.result["independent_no_original"]["original_recovery_disabled"] is True
    assert "original_recovery_disabled" not in case.result
    assert "after_report" not in case.result["source_context"]


@pytest.mark.parametrize(
    "case",
    [
        "paired-chromium-10",
        "paired-chromium-86",
        "paired-mobile-chromium-10",
        "paired-mobile-chromium-86",
    ],
    indirect=True,
)
def test_actual_edit_undo_redo_sources_are_qualified_after_publication(case: Case) -> None:
    edited = case.edit()
    first = current_context(
        case.database, case.data, case.requirements(edited, "after"), case.directory / "edited"
    )
    assert first["report"]["provenance"] == ["current_explicit_graph"]
    assert (
        first["report"]["values"]
        == case.result["independent_no_original"]["after_report"]["values"]
    )
    response = case.client.post(
        f"/api/v1/projects/{edited['id']}/history/undo",
        json={"expected_revision": edited["revision"]},
    )
    assert response.is_success, response.text
    restored = response.json()
    undone = current_context(
        case.database, case.data, case.requirements(restored, "before"), case.directory / "undo"
    )
    assert undone["source"] == source(case.project["entries"][0])
    assert undone["source_sha256"] == case.result["independent_no_original"]["source_sha256"]
    response = case.client.post(
        f"/api/v1/projects/{edited['id']}/history/redo",
        json={"expected_revision": restored["revision"]},
    )
    assert response.is_success, response.text
    redone = response.json()
    requirements = case.requirements(redone, "after")
    requirements["expected_canonical_sha256"] = first["source_sha256"]
    repeated = current_context(case.database, case.data, requirements, case.directory / "redo")
    assert repeated["source"] == first["source"]
    assert repeated["source_sha256"] == first["source_sha256"]
    assert repeated["report"]["input_hash"] == first["report"]["input_hash"]


@pytest.mark.parametrize("change", ["canonical", "original", "instance", "membership", "method"])
def test_changed_independent_capture_or_context_refuses(case: Case, change: str) -> None:
    independent = copy.deepcopy(case.result["independent_no_original"])
    output = case.directory / "qualification"
    if change in {"canonical", "original"}:
        path = output / ("actual-source.json" if change == "canonical" else "actual-original.sdf")
        path.write_bytes(path.read_bytes() + b"changed")
    elif change == "instance":
        independent["source"]["instance_id"] = "another-instance"
    elif change == "membership":
        independent["source"]["atom_ids"] = independent["source"]["atom_ids"][:-1]
    else:
        independent["before_report"]["policy_version"] += "-changed"
    with pytest.raises(AssertionError):
        source_context(output, independent)


@pytest.mark.parametrize("change", ["hash", "source", "original", "membership", "redo", "phase"])
def test_actual_source_or_history_identity_cannot_be_relabelled(case: Case, change: str) -> None:
    edited = case.edit()
    requirements = case.requirements(edited, "after")
    if change == "hash":
        requirements["preflight_sha256"] = "0" * 64
    elif change == "source":
        requirements["source"]["source_artifact_id"] = source(case.project["entries"][0])[
            "source_artifact_id"
        ]
    elif change == "original":
        requirements["original_artifact_id"] = "wrong-original"
    elif change == "membership":
        requirements["source"]["atom_ids"] = requirements["source"]["atom_ids"][:-1]
    elif change == "redo":
        requirements["expected_canonical_sha256"] = "0" * 64
    else:
        requirements["phase"] = "before"
    with pytest.raises(AssertionError):
        current_context(case.database, case.data, requirements, case.directory / "refused")


@pytest.mark.parametrize("change", ["number", "integer-type", "method", "charge"])
def test_matching_hash_does_not_certify_altered_numerical_values(case: Case, change: str) -> None:
    expected = case.result["independent_no_original"]["before_report"]
    actual = copy.deepcopy(expected)
    if change == "number":
        actual["values"][0]["value"] += 2e-10
    elif change == "integer-type":
        actual["values"][1]["value"] = float(actual["values"][1]["value"])
    elif change == "method":
        actual["library_version"] += "-changed"
    else:
        actual["contains_formally_charged_atoms"] = True
    assert actual["input_hash"] == expected["input_hash"]
    with pytest.raises(AssertionError):
        assert_vectors(
            DescriptorReport.model_validate(actual), DescriptorReport.model_validate(expected)
        )


def test_released_retained_consumer_is_distinct_from_live_demand(case: Case) -> None:
    path = f"/api/v1/projects/{case.project['id']}/ligand-properties/consumers"
    response = case.client.post(path)
    assert response.is_success
    identity = response.json()["consumer_id"]
    active = consumer_state(case.database, case.data, [case.project["id"]])
    assert active["owned_live_count"] == active["retained_total"] == 1
    response = case.client.delete(f"{path}/{identity}?sequence=1")
    assert response.is_success
    released = consumer_state(case.database, case.data, [case.project["id"]])
    assert released["retained_total"] == 1 and released["owned_live_count"] == 0
    assert released["owned_records"][0]["released"] == 1
    assert released["owned_records"][0]["expired"] is False


def test_expired_record_is_inactive_without_claiming_release_or_deletion(case: Case) -> None:
    path = f"/api/v1/projects/{case.project['id']}/ligand-properties/consumers"
    response = case.client.post(path)
    assert response.is_success
    with sqlite3.connect(case.database) as db:
        db.execute("UPDATE ligand_property_consumers SET expires_at='2000-01-01 00:00:00'")
    expired = consumer_state(case.database, case.data, [case.project["id"]])
    assert expired["retained_total"] == 1 and expired["owned_live_count"] == 0
    assert expired["owned_records"][0]["released"] == 0
    assert expired["owned_records"][0]["expired"] is True
