from __future__ import annotations

from tests.support.api_client import ApiClient


def create_project(client: ApiClient, name: str = "Kinase study") -> dict[str, object]:
    response = client.post("/api/v1/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()


def seed_entry(client: ApiClient, project_id: str, name: str) -> str:
    response = client.post(
        f"/api/v1/testing/projects/{project_id}/entries",
        json={"name": name, "structure_type": "protein"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_project_update_is_durable_and_reversible(client: ApiClient) -> None:
    project = create_project(client)
    assert project["schema_version"] == 1
    project_id = str(project["id"])

    updated = client.patch(
        f"/api/v1/projects/{project_id}",
        json={
            "expected_revision": 0,
            "name": "Focused kinase study",
            "description": "Recovered workspace",
        },
    ).json()

    assert updated["revision"] == 1
    assert updated["has_uncheckpointed_changes"] is True
    assert (
        updated["history"]["undo_description"] == "Update project details for Focused kinase study"
    )

    undone = client.post(
        f"/api/v1/projects/{project_id}/history/undo",
        json={"expected_revision": 1},
    ).json()
    assert undone["name"] == "Kinase study"
    assert undone["revision"] == 2
    assert undone["has_uncheckpointed_changes"] is False
    assert undone["history"]["can_redo"] is True

    redone = client.post(
        f"/api/v1/projects/{project_id}/history/redo",
        json={"expected_revision": 2},
    ).json()
    assert redone["name"] == "Focused kinase study"
    assert redone["revision"] == 3
    assert redone["has_uncheckpointed_changes"] is True


def test_entry_operations_are_reversible_with_seeded_fixture(client: ApiClient) -> None:
    project = create_project(client)
    project_id = str(project["id"])
    alpha_id = seed_entry(client, project_id, "Alpha")
    beta_id = seed_entry(client, project_id, "Beta")

    renamed = client.patch(
        f"/api/v1/projects/{project_id}/entries/{alpha_id}",
        json={
            "expected_revision": 0,
            "name": "Alpha refined",
            "description": "Seed fixture",
            "user_metadata": {"owner": "test"},
        },
    ).json()
    assert renamed["entries"][0]["dirty"] is True

    duplicated = client.post(
        f"/api/v1/projects/{project_id}/entries/{alpha_id}/duplicate",
        json={"expected_revision": 1},
    ).json()
    duplicate = next(entry for entry in duplicated["entries"] if entry["name"].endswith("copy"))
    assert duplicate["id"] != alpha_id

    grouped = client.post(
        f"/api/v1/projects/{project_id}/groups",
        json={
            "expected_revision": 2,
            "name": "Candidates",
            "entry_ids": [alpha_id, beta_id],
        },
    ).json()
    assert len(grouped["groups"]) == 1

    locked = client.post(
        f"/api/v1/projects/{project_id}/entries/{alpha_id}/lock",
        json={"expected_revision": 3, "value": True},
    ).json()
    assert next(entry for entry in locked["entries"] if entry["id"] == alpha_id)["locked"]

    hidden = client.post(
        f"/api/v1/projects/{project_id}/entries/{beta_id}/visibility",
        json={"expected_revision": 4, "value": False},
    ).json()
    assert not next(entry for entry in hidden["entries"] if entry["id"] == beta_id)["visible"]

    isolated = client.post(
        f"/api/v1/projects/{project_id}/entries/{alpha_id}/isolate",
        json={"expected_revision": 5},
    ).json()
    assert [entry["visible"] for entry in isolated["entries"]].count(True) == 1

    deleted = client.delete(
        f"/api/v1/projects/{project_id}/entries/{beta_id}",
        params={"expected_revision": 6},
    ).json()
    assert beta_id not in {entry["id"] for entry in deleted["entries"]}

    restored = client.post(
        f"/api/v1/projects/{project_id}/history/undo",
        json={"expected_revision": 7},
    ).json()
    assert beta_id in {entry["id"] for entry in restored["entries"]}

    for expected_revision in range(8, 14):
        restored = client.post(
            f"/api/v1/projects/{project_id}/history/undo",
            json={"expected_revision": expected_revision},
        ).json()

    assert {entry["name"] for entry in restored["entries"]} == {"Alpha", "Beta"}
    assert restored["groups"] == []
    assert all(entry["visible"] and not entry["locked"] for entry in restored["entries"])


def test_stale_revision_and_unavailable_history_are_structured(client: ApiClient) -> None:
    project = create_project(client)
    project_id = str(project["id"])

    stale = client.patch(
        f"/api/v1/projects/{project_id}",
        json={"expected_revision": 99, "name": "Wrong", "description": None},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "revision_conflict"

    unavailable = client.post(
        f"/api/v1/projects/{project_id}/history/undo",
        json={"expected_revision": 0},
    )
    assert unavailable.status_code == 409
    assert unavailable.json()["detail"]["code"] == "history_unavailable"
