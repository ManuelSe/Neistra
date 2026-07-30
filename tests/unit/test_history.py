from __future__ import annotations

from pathlib import Path

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"


def test_coordinate_gesture_is_one_reversible_command_and_clears_redo(
    client: ApiClient,
) -> None:
    project = client.post(
        "/api/v1/projects", json={"name": "History study"}
    ).json()
    project_id = project["id"]
    imported = client.post(
        f"/api/v1/projects/{project_id}/imports",
        data={"expected_revision": 0},
        files=[
            (
                "files",
                (
                    "ethanol.mol",
                    (FIXTURES / "ethanol.mol").read_bytes(),
                    "chemical/x-mdl-molfile",
                ),
            )
        ],
    ).json()
    entry_id = imported["imported_entry_ids"][0]
    before_artifact_id = imported["project"]["entries"][0]["current_artifact_id"]
    retained_before = imported["project"]["history"]["retained_commands"]

    changed = client.post(
        f"/api/v1/projects/{project_id}/entries/{entry_id}/transform",
        json={
            "expected_revision": 1,
            "entry_id": entry_id,
            "scope": "structure",
            "translation": [0.4, 0.0, 0.0],
            "pivot_mode": "structure_centroid",
        },
    ).json()
    after_artifact_id = changed["entries"][0]["current_artifact_id"]

    assert changed["revision"] == 2
    assert changed["history"]["retained_commands"] == retained_before + 1
    assert changed["history"]["undo_description"].startswith("Translate structure")

    undone = client.post(
        f"/api/v1/projects/{project_id}/history/undo",
        json={"expected_revision": 2},
    ).json()
    assert undone["entries"][0]["current_artifact_id"] == before_artifact_id
    assert undone["history"]["can_redo"] is True

    redone = client.post(
        f"/api/v1/projects/{project_id}/history/redo",
        json={"expected_revision": 3},
    ).json()
    assert redone["entries"][0]["current_artifact_id"] == after_artifact_id

    undone_again = client.post(
        f"/api/v1/projects/{project_id}/history/undo",
        json={"expected_revision": 4},
    ).json()
    divergent = client.patch(
        f"/api/v1/projects/{project_id}",
        json={
            "expected_revision": undone_again["revision"],
            "name": "Divergent history",
            "description": None,
        },
    ).json()
    assert divergent["history"]["can_redo"] is False
