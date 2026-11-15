from __future__ import annotations

from typing import Any, cast

import pytest
from neistra_api.import_export import ArtifactService
from neistra_api.models import Artifact, StructureEntry

from tests.integration.test_model_edits import edit
from tests.integration.test_selection_edits import project_with_ligand
from tests.support.api_client import ApiClient


def _change_carbon_to_nitrogen(
    client: ApiClient, project: dict[str, Any], entry_id: str
) -> dict[str, Any]:
    response = edit(
        client, project, entry_id, [1], {"operation": "atom.element", "element": "N"}
    )
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json()["project"])


def test_projection_identifies_immutable_payload_with_optional_condition(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_ligand(client)
    artifact_id = project["entries"][0]["current_artifact_id"]
    path = f"/api/v1/projects/{project['id']}/entries/{entry_id}/structure"
    before = client.get(f"/api/v1/projects/{project['id']}").json()

    legacy = client.get(path)
    conditional = client.get(path, params={"expected_artifact_id": artifact_id})

    assert legacy.status_code == conditional.status_code == 200
    assert conditional.json() == legacy.json()
    assert conditional.json()["entry_id"] == entry_id
    assert conditional.json()["artifact_id"] == artifact_id
    assert conditional.json()["structure"]["atoms"][0]["element"] == "C"
    assert client.get(f"/api/v1/projects/{project['id']}").json() == before


def test_history_refuses_old_projection_condition_and_recovers_exact_payload(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_ligand(client)
    path = f"/api/v1/projects/{project['id']}"
    projection_path = f"{path}/entries/{entry_id}/structure"
    original = client.get(f"{path}/entries/{entry_id}/original").content
    carbon_id = project["entries"][0]["current_artifact_id"]
    nitrogen = _change_carbon_to_nitrogen(client, project, entry_id)
    nitrogen_id = nitrogen["entries"][0]["current_artifact_id"]
    assert carbon_id != nitrogen_id

    undone_response = client.post(
        f"{path}/history/undo", json={"expected_revision": nitrogen["revision"]}
    )
    assert undone_response.status_code == 200, undone_response.text
    undone = client.get(path).json()
    held_read = client.get(
        projection_path, params={"expected_artifact_id": nitrogen_id}
    )
    assert held_read.status_code == 409
    assert held_read.json()["detail"]["code"] == "structure_artifact_conflict"
    assert "structure" not in held_read.json()
    carbon = client.get(projection_path, params={"expected_artifact_id": carbon_id})
    assert carbon.status_code == 200
    assert carbon.json()["artifact_id"] == carbon_id
    assert carbon.json()["structure"]["atoms"][0]["element"] == "C"
    assert client.get(path).json() == undone

    redone_response = client.post(
        f"{path}/history/redo", json={"expected_revision": undone["revision"]}
    )
    assert redone_response.status_code == 200, redone_response.text
    redone = client.get(path).json()
    assert redone["entries"][0]["current_artifact_id"] == nitrogen_id
    stale = client.get(projection_path, params={"expected_artifact_id": carbon_id})
    assert stale.status_code == 409
    current = client.get(projection_path, params={"expected_artifact_id": nitrogen_id})
    assert current.status_code == 200
    assert current.json()["artifact_id"] == nitrogen_id
    assert current.json()["structure"]["atoms"][0]["element"] == "N"
    assert client.get(path).json() == redone
    assert client.get(f"{path}/entries/{entry_id}/original").content == original


@pytest.mark.parametrize("unknown_identity", [False, True])
def test_mismatched_condition_refuses_before_reading_any_artifact(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, unknown_identity: bool
) -> None:
    project, entry_id = project_with_ligand(client)
    old_id = project["entries"][0]["current_artifact_id"]
    current = _change_carbon_to_nitrogen(client, project, entry_id)
    path = f"/api/v1/projects/{project['id']}"
    before = client.get(path).json()
    assert before["revision"] == current["revision"]

    def unexpected_read(self: ArtifactService, artifact_id: str) -> tuple[Artifact, bytes]:
        raise AssertionError(f"A refused conditional read touched artifact {artifact_id}")

    monkeypatch.setattr(ArtifactService, "read", unexpected_read)
    response = client.get(
        f"{path}/entries/{entry_id}/structure",
        params={"expected_artifact_id": "not-an-artifact" if unknown_identity else old_id},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "structure_artifact_conflict"
    assert client.get(path).json() == before


@pytest.mark.parametrize("conditional", [False, True])
def test_response_keeps_captured_identity_if_current_pointer_changes_during_read(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, conditional: bool
) -> None:
    project, entry_id = project_with_ligand(client)
    path = f"/api/v1/projects/{project['id']}"
    projection_path = f"{path}/entries/{entry_id}/structure"
    carbon_id = project["entries"][0]["current_artifact_id"]
    expected = client.get(projection_path).json()
    nitrogen = _change_carbon_to_nitrogen(client, project, entry_id)
    nitrogen_id = nitrogen["entries"][0]["current_artifact_id"]
    undone_response = client.post(
        f"{path}/history/undo", json={"expected_revision": nitrogen["revision"]}
    )
    assert undone_response.status_code == 200, undone_response.text
    undone = client.get(path).json()
    original_read = ArtifactService.read
    reads: list[str] = []

    def advance_pointer(self: ArtifactService, artifact_id: str) -> tuple[Artifact, bytes]:
        reads.append(artifact_id)
        result = original_read(self, artifact_id)
        entry = self.session.get(StructureEntry, entry_id)
        assert entry is not None
        # Emulate a pointer update after payload capture. A response that rereads
        # the mutable entry would label carbon bytes with nitrogen's identity.
        entry.current_artifact_id = nitrogen_id
        entry.name = "Later entry name"
        return result

    monkeypatch.setattr(ArtifactService, "read", advance_pointer)
    response = client.get(
        projection_path,
        params={"expected_artifact_id": carbon_id} if conditional else {},
    )
    assert response.status_code == 200, response.text
    assert reads == [carbon_id]
    assert response.json() == expected
    assert response.json()["artifact_id"] != nitrogen_id
    # Reading must not publish the injected mutable session state or add history.
    assert client.get(path).json() == undone
