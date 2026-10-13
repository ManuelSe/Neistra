from __future__ import annotations

import asyncio
import multiprocessing
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import Request

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


def test_one_active_analysis_returns_busy_without_affecting_the_first(client: ApiClient) -> None:
    project = imported(client)

    async def concurrent() -> None:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=client.app), base_url="http://testserver"
        ) as api:
            path = f"/api/v1/projects/{project['id']}/interactions"
            first = asyncio.create_task(api.post(path, json=query(project)))
            await asyncio.sleep(0.05)
            busy = await api.post(path, json=query(project))
            assert busy.status_code == 429
            assert busy.json()["detail"]["code"] == "interactions_busy"
            assert (await first).status_code == 200

    asyncio.run(concurrent())


def test_disconnected_analysis_terminates_child_and_releases_admission(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = imported(client)
    baseline = {process.pid for process in multiprocessing.active_children()}
    path = f"/api/v1/projects/{project['id']}/interactions"
    with monkeypatch.context() as patch:
        patch.setattr(Request, "is_disconnected", AsyncMock(return_value=True))
        assert client.post(path, json=query(project)).status_code == 499
    assert {process.pid for process in multiprocessing.active_children()} == baseline
    assert client.post(path, json=query(project)).status_code == 200


def test_deadline_terminates_child_without_publishing_partial_results(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import molweave_api.interaction_service as module

    project = imported(client)
    baseline = {process.pid for process in multiprocessing.active_children()}
    values = iter([0.0, 31.0])

    # Replace this module's time facade, not asyncio's global clock.
    class Clock:
        @staticmethod
        def monotonic() -> float:
            return next(values)

    monkeypatch.setattr(module, "time", Clock)
    response = client.post(f"/api/v1/projects/{project['id']}/interactions", json=query(project))
    assert response.status_code == 504
    assert "records" not in response.json()
    assert {process.pid for process in multiprocessing.active_children()} == baseline


def test_six_type_import_analysis_preserves_project_artifacts_and_original(
    client: ApiClient,
) -> None:
    from pathlib import Path

    raw = (Path(__file__).parents[1] / "fixtures/interactions/six_types.mol").read_bytes()
    project = create_project(client)
    imported_response = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0, "generate_3d": "false", "infer_bonds": "false"},
        files=[("files", ("six_types.mol", raw, "application/octet-stream"))],
    )
    assert imported_response.status_code == 201
    project = imported_response.json()["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}/entries/{entry['id']}"
    normalized = client.get(f"{path}/structure").json()
    before = client.get(f"/api/v1/projects/{project['id']}").json()
    response = client.post(f"/api/v1/projects/{project['id']}/interactions", json=query(project))
    assert response.status_code == 200, response.text
    records = response.json()["records"]
    assert {r["kind"] for r in records} == {
        "hydrogen_bond",
        "hydrophobic",
        "pi_pi",
        "cation_pi",
        "salt_bridge",
        "clash",
    }
    assert {r["scope"] for r in records} == {"intra", "inter"}
    assert client.get(f"/api/v1/projects/{project['id']}").json() == before
    assert client.get(f"{path}/structure").json() == normalized
    assert client.get(f"{path}/original").content == raw
