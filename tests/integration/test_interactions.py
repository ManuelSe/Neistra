from __future__ import annotations

from typing import Any

from tests.integration.test_import_export import create_project, upload
from tests.support.api_client import ApiClient


def imported(client: ApiClient) -> dict[str, Any]:
    project = create_project(client)
    response = upload(client, project["id"], 0, ["ethanol.mol", "ethanol.mol"])
    assert response.status_code == 201
    return response.json()["project"]  # type: ignore[no-any-return]


def query(project: dict[str, Any]) -> dict[str, Any]:
    return {
        "profile": "interaction-v1",
        "frame": "workspace-cartesian",
        "inputs": [
            {"entry_id": entry["id"], "artifact_id": entry["current_artifact_id"]}
            for entry in project["entries"]
        ],
    }


def test_interactions_are_read_only_and_use_normalized_artifacts(client: ApiClient) -> None:
    project = imported(client)
    before = client.get(f"/api/v1/projects/{project['id']}").json()
    response = client.post(f"/api/v1/projects/{project['id']}/interactions", json=query(project))
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["profile"] == "interaction-v1"
    assert result["records"] and all(record["scope"] == "inter" for record in result["records"])
    current = client.get(f"/api/v1/projects/{project['id']}").json()
    assert current == before


def test_interaction_inputs_reject_stale_foreign_duplicate_and_wrong_frame(
    client: ApiClient,
) -> None:
    project = imported(client)
    path = f"/api/v1/projects/{project['id']}/interactions"
    payload = query(project)
    payload["inputs"][0]["artifact_id"] = "stale"
    assert client.post(path, json=payload).status_code == 409
    other = create_project(client, "other")
    assert (
        client.post(f"/api/v1/projects/{other['id']}/interactions", json=query(project)).status_code
        == 404
    )
    payload = query(project)
    payload["inputs"].append(payload["inputs"][0])
    assert client.post(path, json=payload).status_code == 422
    payload = query(project)
    payload["frame"] = "independent"
    assert client.post(path, json=payload).status_code == 422
