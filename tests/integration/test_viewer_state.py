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
        "selection_representations": [],
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


def selection(entry_id: str, *atom_ids: int) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "atoms": [{"structure_id": entry_id, "atom_id": atom_id} for atom_id in sorted(atom_ids)],
        "granularity": "atom",
        "source": "inspector",
    }


def apply_style(
    client: ApiClient,
    project: dict[str, Any],
    target: dict[str, Any],
    style: str,
):
    return client.post(
        f"/api/v1/projects/{project['id']}/selection-representations",
        json={
            "expected_revision": project["revision"],
            "selection": target,
            "action": "apply",
            "style": style,
        },
    )


def test_selection_representation_replacement_reset_and_history(client: ApiClient) -> None:
    project = import_ligand(client)
    entry = project["entries"][0]
    first = apply_style(client, project, selection(entry["id"], 1, 2), "line")
    assert first.status_code == 200
    project = first.json()
    assert project["entries"][0]["viewer_settings"]["selection_representations"] == [
        {"style": "line", "atom_ids": [1, 2]}
    ]

    project = apply_style(client, project, selection(entry["id"], 2, 3), "thick-stick").json()
    assert project["entries"][0]["viewer_settings"]["selection_representations"] == [
        {"style": "line", "atom_ids": [1]},
        {"style": "thick-stick", "atom_ids": [2, 3]},
    ]
    assert project["history"]["undo_description"] == "Apply Thick Stick to 2 atoms in 1 entry"

    reset = client.post(
        f"/api/v1/projects/{project['id']}/selection-representations",
        json={
            "expected_revision": project["revision"],
            "selection": selection(entry["id"], 1, 2),
            "action": "reset",
        },
    ).json()
    assert reset["entries"][0]["viewer_settings"]["selection_representations"] == [
        {"style": "thick-stick", "atom_ids": [3]}
    ]
    undone = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": reset["revision"]},
    ).json()
    assert undone["entries"][0]["viewer_settings"]["selection_representations"] == [
        {"style": "line", "atom_ids": [1]},
        {"style": "thick-stick", "atom_ids": [2, 3]},
    ]


def test_selection_representation_multi_entry_is_atomic(client: ApiClient) -> None:
    project = import_ligand(client)
    first_entry = project["entries"][0]
    imported = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": project["revision"]},
        files=[
            (
                "files",
                (
                    "ethanol-2.mol",
                    (FIXTURES / "ethanol.mol").read_bytes(),
                    "chemical/x-mdl-molfile",
                ),
            )
        ],
    ).json()["project"]
    second_entry = next(item for item in imported["entries"] if item["id"] != first_entry["id"])
    target = {
        "schema_version": 1,
        "atoms": sorted(
            [
                {"structure_id": first_entry["id"], "atom_id": 1},
                {"structure_id": second_entry["id"], "atom_id": 2},
            ],
            key=lambda item: (item["structure_id"], item["atom_id"]),
        ),
        "granularity": "atom",
        "source": "inspector",
    }
    styled = apply_style(client, imported, target, "space-filling").json()
    assert styled["revision"] == imported["revision"] + 1
    assert all(entry["viewer_settings"]["selection_representations"] for entry in styled["entries"])

    invalid_target = {
        **target,
        "atoms": [
            target["atoms"][0],
            {"structure_id": second_entry["id"], "atom_id": 999},
        ],
    }
    invalid_target["atoms"] = sorted(
        invalid_target["atoms"], key=lambda item: (item["structure_id"], item["atom_id"])
    )
    rejected = apply_style(client, styled, invalid_target, "line")
    assert rejected.status_code == 422
    unchanged = client.get(f"/api/v1/projects/{project['id']}").json()
    assert unchanged["revision"] == styled["revision"]
    assert {
        item["id"]: item["viewer_settings"]["selection_representations"]
        for item in unchanged["entries"]
    } == {
        item["id"]: item["viewer_settings"]["selection_representations"]
        for item in styled["entries"]
    }


def test_polymer_styles_require_complete_supported_residues(client: ApiClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Polymer styles"}).json()
    project = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0},
        files=[
            (
                "files",
                (
                    "protein_editing.pdb",
                    (FIXTURES / "protein_editing.pdb").read_bytes(),
                    "chemical/x-pdb",
                ),
            )
        ],
    ).json()["project"]
    entry = project["entries"][0]
    structure = client.get(
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/structure"
    ).json()["structure"]
    residue_id = structure["residues"][0]["id"]
    residue_atoms = [atom["id"] for atom in structure["atoms"] if atom["residue_id"] == residue_id]
    accepted = apply_style(client, project, selection(entry["id"], *residue_atoms), "cartoon")
    assert accepted.status_code == 200, accepted.text
    styled = accepted.json()
    assert styled["entries"][0]["viewer_settings"]["selection_representations"] == [
        {"style": "cartoon", "atom_ids": residue_atoms}
    ]

    rejected = apply_style(client, styled, selection(entry["id"], residue_atoms[0]), "backbone")
    assert rejected.status_code == 422
    assert "every atom" in rejected.json()["detail"]["message"]
    assert client.get(f"/api/v1/projects/{project['id']}").json()["revision"] == styled["revision"]


def test_entry_viewer_update_cannot_mutate_selection_assignments(client: ApiClient) -> None:
    project = import_ligand(client)
    entry = project["entries"][0]
    project = apply_style(client, project, selection(entry["id"], 1), "line").json()
    settings = project["entries"][0]["viewer_settings"]
    preserved = client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/viewer-settings",
        json={
            "expected_revision": project["revision"],
            "settings": {**settings, "components": {**settings["components"], "hydrogens": False}},
        },
    )
    assert preserved.status_code == 200
    changed = preserved.json()
    assert changed["entries"][0]["viewer_settings"]["selection_representations"] == [
        {"style": "line", "atom_ids": [1]}
    ]
    bypass = client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/viewer-settings",
        json={
            "expected_revision": changed["revision"],
            "settings": {
                **changed["entries"][0]["viewer_settings"],
                "selection_representations": [],
            },
        },
    )
    assert bypass.status_code == 422


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
