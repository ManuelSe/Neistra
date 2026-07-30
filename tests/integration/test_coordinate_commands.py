from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import pytest

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"


def _project(client: ApiClient) -> dict[str, Any]:
    response = client.post("/api/v1/projects", json={"name": "Coordinate study"})
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


def _import(
    client: ApiClient,
    project_id: str,
    revision: int,
    *filenames: str,
) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/projects/{project_id}/imports",
        data={"expected_revision": revision},
        files=[
            (
                "files",
                (
                    filename,
                    (FIXTURES / filename).read_bytes(),
                    "application/octet-stream",
                ),
            )
            for filename in filenames
        ],
    )
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


def _structure(client: ApiClient, project_id: str, entry_id: str) -> dict[str, Any]:
    response = client.get(
        f"/api/v1/projects/{project_id}/entries/{entry_id}/structure"
    )
    assert response.status_code == 200
    return cast(dict[str, Any], response.json()["structure"])


def test_transform_is_durable_reversible_and_preserves_original(
    client: ApiClient,
) -> None:
    project = _project(client)
    project_id = project["id"]
    imported = _import(client, project_id, 0, "protein_models_altloc.pdb")
    entry_id = imported["imported_entry_ids"][0]
    entry = imported["project"]["entries"][0]
    original_artifact_id = entry["original_artifact_id"]
    before_artifact_id = entry["current_artifact_id"]
    before = _structure(client, project_id, entry_id)

    response = client.post(
        f"/api/v1/projects/{project_id}/entries/{entry_id}/transform",
        json={
            "expected_revision": 1,
            "entry_id": entry_id,
            "scope": "structure",
            "selection": {"schema_version": 1, "atoms": []},
            "translation": [2.5, -1.0, 0.25],
            "rotation_degrees": [0.0, 0.0, 0.0],
            "pivot_mode": "structure_centroid",
        },
    )

    assert response.status_code == 200
    transformed_project = response.json()
    assert transformed_project["revision"] == 2
    assert transformed_project["history"]["undo_description"].startswith(
        "Translate structure"
    )
    assert len(transformed_project["structure_patches"]) == 1
    patch = transformed_project["structure_patches"][0]
    assert patch["entry_id"] == entry_id
    assert patch["atom_ids"] == list(range(1, len(before["atoms"]) + 1))
    transformed_entry = transformed_project["entries"][0]
    assert transformed_entry["current_artifact_id"] != before_artifact_id
    assert transformed_entry["original_artifact_id"] == original_artifact_id

    after = _structure(client, project_id, entry_id)
    for before_atom, after_atom in zip(
        before["atoms"], after["atoms"], strict=True
    ):
        assert after_atom["coordinates"] == [
            before_atom["coordinates"][0] + 2.5,
            before_atom["coordinates"][1] - 1.0,
            before_atom["coordinates"][2] + 0.25,
        ]
    for before_conformer, after_conformer in zip(
        before["conformers"], after["conformers"], strict=True
    ):
        for before_point, after_point in zip(
            before_conformer["coordinates"],
            after_conformer["coordinates"],
            strict=True,
        ):
            assert after_point == [
                before_point[0] + 2.5,
                before_point[1] - 1.0,
                before_point[2] + 0.25,
            ]

    undone = client.post(
        f"/api/v1/projects/{project_id}/history/undo",
        json={"expected_revision": 2},
    )
    assert undone.status_code == 200
    assert undone.json()["structure_patches"][0]["artifact_id"] == before_artifact_id
    assert _structure(client, project_id, entry_id) == before

    redone = client.post(
        f"/api/v1/projects/{project_id}/history/redo",
        json={"expected_revision": 3},
    )
    assert redone.status_code == 200
    assert _structure(client, project_id, entry_id) == after
    original = client.get(
        f"/api/v1/projects/{project_id}/entries/{entry_id}/original"
    )
    assert original.content == (FIXTURES / "protein_models_altloc.pdb").read_bytes()


def test_selected_rotation_uses_custom_pivot_and_rejects_invalid_commands(
    client: ApiClient,
) -> None:
    project = _project(client)
    project_id = project["id"]
    imported = _import(client, project_id, 0, "ethanol.mol")
    entry_id = imported["imported_entry_ids"][0]
    before = _structure(client, project_id, entry_id)
    selection = {
        "schema_version": 1,
        "atoms": [{"structure_id": entry_id, "atom_id": 1}],
    }

    rotated = client.post(
        f"/api/v1/projects/{project_id}/entries/{entry_id}/transform",
        json={
            "expected_revision": 1,
            "entry_id": entry_id,
            "scope": "selection",
            "selection": selection,
            "rotation_degrees": [0.0, 0.0, 180.0],
            "pivot_mode": "custom",
            "pivot": [0.0, 0.0, 0.0],
        },
    )

    assert rotated.status_code == 200, rotated.text
    assert rotated.json()["structure_patches"][0]["atom_ids"] == [1]
    after = _structure(client, project_id, entry_id)
    assert after["atoms"][1]["coordinates"] == before["atoms"][1]["coordinates"]
    assert after["atoms"][2]["coordinates"] == before["atoms"][2]["coordinates"]
    assert after["atoms"][0]["coordinates"] == pytest.approx(
        [
            -before["atoms"][0]["coordinates"][0],
            -before["atoms"][0]["coordinates"][1],
            before["atoms"][0]["coordinates"][2],
        ],
        abs=1e-12,
    )

    no_op = client.post(
        f"/api/v1/projects/{project_id}/entries/{entry_id}/transform",
        json={
            "expected_revision": 2,
            "entry_id": entry_id,
            "scope": "structure",
            "translation": [0.0, 0.0, 0.0],
            "rotation_degrees": [0.0, 0.0, 360.0],
            "pivot_mode": "structure_centroid",
        },
    )
    assert no_op.status_code == 422
    assert no_op.json()["detail"]["code"] == "invalid_project_operation"

    locked = client.post(
        f"/api/v1/projects/{project_id}/entries/{entry_id}/lock",
        json={"expected_revision": 2, "value": True},
    ).json()
    blocked = client.post(
        f"/api/v1/projects/{project_id}/entries/{entry_id}/transform",
        json={
            "expected_revision": locked["revision"],
            "entry_id": entry_id,
            "scope": "structure",
            "translation": [1.0, 0.0, 0.0],
            "pivot_mode": "structure_centroid",
        },
    )
    assert blocked.status_code == 422
    assert "Unlock" in blocked.json()["detail"]["message"]


def test_backbone_superposition_reports_rmsd_and_rejects_bad_correspondence(
    client: ApiClient,
) -> None:
    project = _project(client)
    project_id = project["id"]
    imported = _import(
        client,
        project_id,
        0,
        "protein_models_altloc.pdb",
        "protein_models_altloc.pdb",
    )
    moving_id, reference_id = imported["imported_entry_ids"]
    reference_artifact_id = next(
        entry["current_artifact_id"]
        for entry in imported["project"]["entries"]
        if entry["id"] == reference_id
    )
    transformed = client.post(
        f"/api/v1/projects/{project_id}/entries/{moving_id}/transform",
        json={
            "expected_revision": 1,
            "entry_id": moving_id,
            "scope": "structure",
            "translation": [4.0, -2.0, 1.0],
            "rotation_degrees": [0.0, 0.0, 37.0],
            "pivot_mode": "structure_centroid",
        },
    ).json()

    response = client.post(
        f"/api/v1/projects/{project_id}/superpositions",
        json={
            "expected_revision": transformed["revision"],
            "moving_entry_id": moving_id,
            "reference_entry_id": reference_id,
            "mode": "backbone",
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["report"]["atom_count"] == 5
    assert result["report"]["rmsd"] < 1e-9
    assert result["project"]["structure_patches"][0]["entry_id"] == moving_id
    assert next(
        entry["current_artifact_id"]
        for entry in result["project"]["entries"]
        if entry["id"] == reference_id
    ) == reference_artifact_id

    bad_selection = {
        "schema_version": 1,
        "atoms": [
            {"structure_id": moving_id, "atom_id": atom_id}
            for atom_id in (1, 2, 3)
        ]
        + [
            {"structure_id": reference_id, "atom_id": atom_id}
            for atom_id in (1, 2, 4)
        ],
    }
    rejected = client.post(
        f"/api/v1/projects/{project_id}/superpositions",
        json={
            "expected_revision": result["project"]["revision"],
            "moving_entry_id": moving_id,
            "reference_entry_id": reference_id,
            "mode": "selection",
            "selection": bad_selection,
        },
    )
    assert rejected.status_code == 422
    assert "equal protein identities" in rejected.json()["detail"]["message"]
