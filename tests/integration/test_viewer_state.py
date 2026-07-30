from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"


def import_ligand(client: ApiClient) -> dict[str, Any]:
    project = client.post("/api/v1/projects", json={"name": "Viewer state"}).json()
    response = client.post(
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
    assert response.status_code == 201
    return cast(dict[str, Any], response.json()["project"])


def viewer_settings() -> dict[str, Any]:
    return {
        "representations": [
            {
                "id": "main",
                "style": "stick",
                "color_by": "custom",
                "custom_color": "#22c55e",
                "opacity": 0.65,
            },
            {
                "id": "surface",
                "style": "surface",
                "color_by": "element",
                "custom_color": "#3b82f6",
                "opacity": 0.3,
            },
        ],
        "components": {
            "hydrogens": False,
            "solvent": True,
            "ions": True,
            "ligands": True,
            "protein": False,
        },
        "labels": {
            "atoms": True,
            "residues": False,
            "chains": False,
            "structure": True,
        },
    }


def camera() -> dict[str, Any]:
    return {
        "mode": "orthographic",
        "position": [10.0, 4.0, 3.0],
        "target": [0.0, 0.0, 0.0],
        "up": [0.0, 1.0, 0.0],
        "radius": 12.0,
    }


def test_viewer_measurement_and_scene_state_are_undoable(client: ApiClient) -> None:
    project = import_ligand(client)
    entry = project["entries"][0]
    assert entry["viewer_settings"]["representations"][0]["style"] == "ball-and-stick"

    project = client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/viewer-settings",
        json={"expected_revision": project["revision"], "settings": viewer_settings()},
    ).json()
    assert len(project["entries"][0]["viewer_settings"]["representations"]) == 2

    project = client.post(
        f"/api/v1/projects/{project['id']}/measurements",
        json={
            "expected_revision": project["revision"],
            "name": "C-C distance",
            "kind": "distance",
            "atom_references": [
                {"structure_id": entry["id"], "atom_id": 1},
                {"structure_id": entry["id"], "atom_id": 2},
            ],
        },
    ).json()
    measurement = project["measurements"][0]
    assert measurement["visible"] is True

    project = client.patch(
        f"/api/v1/projects/{project['id']}/measurements/{measurement['id']}",
        json={
            "expected_revision": project["revision"],
            "name": "Hidden carbon distance",
            "visible": False,
        },
    ).json()
    assert project["measurements"][0]["name"] == "Hidden carbon distance"

    project = client.post(
        f"/api/v1/projects/{project['id']}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "Inspection",
            "camera": camera(),
            "selection": {
                "atoms": [{"structure_id": entry["id"], "atom_id": 1}],
                "granularity": "atom",
                "source": "inspector",
            },
        },
    ).json()
    scene = project["scenes"][0]
    assert scene["camera"]["mode"] == "orthographic"
    assert scene["entry_states"][0]["viewer_settings"] == viewer_settings()

    project = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/visibility",
        json={"expected_revision": project["revision"], "value": False},
    ).json()
    applied = client.post(
        f"/api/v1/projects/{project['id']}/scenes/{scene['id']}/apply",
        json={"expected_revision": project["revision"]},
    ).json()
    assert applied["entries"][0]["visible"] is True
    assert applied["entries"][0]["viewer_settings"] == viewer_settings()

    undone = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": applied["revision"]},
    ).json()
    assert undone["entries"][0]["visible"] is False


def test_invalid_measurements_are_atomic_and_deletion_reconciles_state(
    client: ApiClient,
) -> None:
    project = import_ligand(client)
    entry_id = project["entries"][0]["id"]
    invalid = client.post(
        f"/api/v1/projects/{project['id']}/measurements",
        json={
            "expected_revision": project["revision"],
            "name": "Invalid",
            "kind": "angle",
            "atom_references": [
                {"structure_id": entry_id, "atom_id": 1},
                {"structure_id": entry_id, "atom_id": 999},
                {"structure_id": entry_id, "atom_id": 2},
            ],
        },
    )
    assert invalid.status_code == 422
    unchanged = client.get(f"/api/v1/projects/{project['id']}").json()
    assert unchanged["revision"] == project["revision"]

    project = client.post(
        f"/api/v1/projects/{project['id']}/measurements",
        json={
            "expected_revision": project["revision"],
            "name": "Distance",
            "kind": "distance",
            "atom_references": [
                {"structure_id": entry_id, "atom_id": 1},
                {"structure_id": entry_id, "atom_id": 2},
            ],
        },
    ).json()
    project = client.post(
        f"/api/v1/projects/{project['id']}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "Before deletion",
            "camera": camera(),
            "selection": {
                "atoms": [{"structure_id": entry_id, "atom_id": 1}],
                "granularity": "atom",
                "source": "inspector",
            },
        },
    ).json()
    deleted = client.delete(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}",
        params={"expected_revision": project["revision"]},
    ).json()
    assert deleted["measurements"] == []
    assert deleted["scenes"][0]["entry_states"] == []
    assert deleted["scenes"][0]["selection"]["atoms"] == []

    restored = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": deleted["revision"]},
    ).json()
    assert len(restored["measurements"]) == 1
    assert len(restored["scenes"][0]["entry_states"]) == 1


def test_close_contact_endpoint_returns_sorted_nonbonded_pairs(client: ApiClient) -> None:
    project = import_ligand(client)
    entry_id = project["entries"][0]["id"]
    response = client.post(
        f"/api/v1/projects/{project['id']}/contacts",
        json={"entry_id": entry_id, "cutoff": 3.0, "minimum_distance": 0.5},
    )
    assert response.status_code == 200
    contacts = response.json()
    assert contacts
    distances = [item["distance"] for item in contacts]
    assert distances == sorted(distances)

    invalid = client.post(
        f"/api/v1/projects/{project['id']}/contacts",
        json={"entry_id": entry_id, "cutoff": 1.0, "minimum_distance": 2.0},
    )
    assert invalid.status_code == 422
