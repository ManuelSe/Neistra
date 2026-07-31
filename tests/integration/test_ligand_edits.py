from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"


def project_with_ligand(client: ApiClient) -> tuple[dict[str, Any], str]:
    project_response = client.post(
        "/api/v1/projects", json={"name": "Ligand editing"}
    )
    assert project_response.status_code == 201
    project = cast(dict[str, Any], project_response.json())
    imported = client.post(
        f"/api/v1/projects/{project['id']}/imports",
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
    )
    assert imported.status_code == 201
    payload = cast(dict[str, Any], imported.json())
    return cast(dict[str, Any], payload["project"]), str(
        payload["imported_entry_ids"][0]
    )


def edit(
    client: ApiClient,
    project: dict[str, Any],
    entry_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/ligand-edits",
        json={"expected_revision": project["revision"], **payload},
    )
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json())


def structure(client: ApiClient, project_id: str, entry_id: str) -> dict[str, Any]:
    response = client.get(
        f"/api/v1/projects/{project_id}/entries/{entry_id}/structure"
    )
    assert response.status_code == 200
    return cast(dict[str, Any], response.json()["structure"])


def test_topology_edits_are_durable_reversible_and_ids_never_reuse(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_ligand(client)
    original = structure(client, project["id"], entry_id)
    original_upload = client.get(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/original"
    ).content

    first = edit(
        client,
        project,
        entry_id,
        {
            "operation": "atom.add",
            "element": "F",
            "coordinates": [3.5, 0.0, 0.0],
        },
    )
    assert first["report"]["created_atom_ids"] == [4]
    assert first["project"]["entries"][0]["dirty"] is True
    assert first["project"]["entries"][0]["atom_ids"] == [1, 2, 3, 4]
    assert first["project"]["topology_patches"] == [
        {
            "entry_id": entry_id,
            "artifact_id": first["project"]["entries"][0][
                "current_artifact_id"
            ],
        }
    ]

    undone_response = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": first["project"]["revision"]},
    )
    assert undone_response.status_code == 200
    undone = cast(dict[str, Any], undone_response.json())
    assert undone["entries"][0]["atom_ids"] == [1, 2, 3]
    assert structure(client, project["id"], entry_id) == original

    branched = edit(
        client,
        undone,
        entry_id,
        {
            "operation": "atom.add",
            "element": "Cl",
            "coordinates": [3.5, 0.0, 0.0],
        },
    )
    assert branched["report"]["created_atom_ids"] == [5]
    assert branched["project"]["history"]["can_redo"] is False
    with_bond = edit(
        client,
        branched["project"],
        entry_id,
        {
            "operation": "bond.add",
            "atom_1_id": 3,
            "atom_2_id": 5,
            "order": 1,
        },
    )
    assert with_bond["report"]["created_bond_ids"] == [3]
    assert client.get(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/original"
    ).content == original_upload

    restart_read = client.get(f"/api/v1/projects/{project['id']}")
    assert restart_read.status_code == 200
    assert restart_read.json()["entries"][0]["atom_ids"] == [1, 2, 3, 5]


def test_atom_deletion_reconciles_durable_references_and_undo_restores_them(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_ligand(client)
    selection = {
        "schema_version": 1,
        "atoms": [{"structure_id": entry_id, "atom_id": 2}],
        "granularity": "atom",
        "source": "inspector",
    }
    saved = client.post(
        f"/api/v1/projects/{project['id']}/selections",
        json={
            "expected_revision": project["revision"],
            "name": "Middle carbon",
            "selection": selection,
        },
    ).json()
    measured = client.post(
        f"/api/v1/projects/{project['id']}/measurements",
        json={
            "expected_revision": saved["revision"],
            "name": "C-C",
            "kind": "distance",
            "atom_references": [
                {"structure_id": entry_id, "atom_id": 1},
                {"structure_id": entry_id, "atom_id": 2},
            ],
        },
    ).json()
    scene = client.post(
        f"/api/v1/projects/{project['id']}/scenes",
        json={
            "expected_revision": measured["revision"],
            "name": "Selected carbon",
            "camera": {
                "mode": "perspective",
                "position": [0, 0, 10],
                "target": [0, 0, 0],
                "up": [0, 1, 0],
                "radius": 10,
            },
            "selection": selection,
        },
    ).json()

    deleted = edit(
        client,
        scene,
        entry_id,
        {"operation": "atom.delete", "atom_ids": [2]},
    )
    changed = deleted["project"]
    assert changed["entries"][0]["atom_ids"] == [1, 3]
    assert changed["saved_selections"][0]["atom_references"] == []
    assert changed["saved_selections"][0]["warnings"][-1]["code"] == (
        "invalid_selection_references_removed"
    )
    assert changed["measurements"] == []
    assert changed["scenes"][0]["selection"]["atoms"] == []

    restored_response = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": changed["revision"]},
    )
    assert restored_response.status_code == 200
    restored = restored_response.json()
    assert restored["entries"][0]["atom_ids"] == [1, 2, 3]
    assert restored["saved_selections"][0]["atom_references"] == selection["atoms"]
    assert len(restored["measurements"]) == 1
    assert restored["scenes"][0]["selection"]["atoms"] == selection["atoms"]


def test_validation_locking_and_cleanup_failures_do_not_mutate_project(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_ligand(client)
    invalid = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/ligand-edits",
        json={
            "expected_revision": project["revision"],
            "operation": "bond.order",
            "bond_id": 2,
            "order": 3,
        },
    )
    assert invalid.status_code == 422
    assert "Invalid valence" in invalid.json()["detail"]["message"]
    assert client.get(f"/api/v1/projects/{project['id']}").json()["revision"] == 1

    cleaned = edit(
        client,
        project,
        entry_id,
        {
            "operation": "coordinates.cleanup",
            "force_field": "auto",
            "max_iterations": 200,
        },
    )
    assert cleaned["report"]["force_field"] in {"MMFF", "UFF"}
    assert cleaned["report"]["converged"] in {True, False}

    locked = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/lock",
        json={
            "expected_revision": cleaned["project"]["revision"],
            "value": True,
        },
    ).json()
    blocked = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/ligand-edits",
        json={
            "expected_revision": locked["revision"],
            "operation": "atom.add",
            "element": "F",
            "coordinates": [3, 0, 0],
        },
    )
    assert blocked.status_code == 422
    assert "Unlock" in blocked.json()["detail"]["message"]
