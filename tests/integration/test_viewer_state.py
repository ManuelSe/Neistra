from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from tests.integration.test_archive_roundtrip import export_archive, import_archive
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
        "selection_surface": None,
        "selection_hidden_atoms": [],
        "selection_colors": [],
        "selection_nonpolar_hydrogens": [],
        "components": {
            "hydrogens": False,
            "nonpolar_hydrogens": False,
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


def color_selection(
    client: ApiClient,
    project: dict[str, Any],
    target: dict[str, Any],
    color: str | None,
):
    return client.post(
        f"/api/v1/projects/{project['id']}/selection-appearance",
        json={
            "expected_revision": project["revision"],
            "selection": target,
            "property": "color",
            "action": "set" if color is not None else "reset",
            **({"color": color} if color is not None else {}),
        },
    )


def test_selection_colors_overlap_history_scenes_archive_and_topology(client: ApiClient) -> None:
    project = import_ligand(client)
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    target = selection(entry["id"], 1, 2)
    original = client.get(f"{path}/entries/{entry['id']}/original").content
    normalized = client.get(f"{path}/entries/{entry['id']}/structure").json()
    first = color_selection(client, project, target, "#FF0000")
    assert first.status_code == 200, first.text
    project = first.json()
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == [
        {"color": "#ff0000", "atom_ids": [1, 2]}
    ]
    project = color_selection(client, project, selection(entry["id"], 2, 3), "#00ff00").json()
    expected = [{"color": "#00ff00", "atom_ids": [2, 3]}, {"color": "#ff0000", "atom_ids": [1]}]
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == expected
    assert client.get(f"{path}/entries/{entry['id']}/structure").json() == normalized
    assert client.get(f"{path}/entries/{entry['id']}/original").content == original
    project = client.post(
        f"{path}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "Colors",
            "selection": target,
            "camera": {
                "mode": "perspective",
                "position": [0, 0, 10],
                "target": [0, 0, 0],
                "up": [0, 1, 0],
                "radius": 10,
            },
        },
    ).json()
    project = color_selection(client, project, target, None).json()
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == [
        {"color": "#00ff00", "atom_ids": [3]}
    ]
    project = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == expected
    project = client.post(
        f"{path}/history/redo", json={"expected_revision": project["revision"]}
    ).json()
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == [
        {"color": "#00ff00", "atom_ids": [3]}
    ]
    project = client.post(
        f"{path}/scenes/{project['scenes'][0]['id']}/apply",
        json={"expected_revision": project["revision"]},
    ).json()
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == expected
    exported = export_archive(client, project["id"], "color-roundtrip")
    restored = import_archive(client, client.get(exported["artifact"]["download_url"]).content)[
        "project"
    ]
    assert restored["entries"][0]["viewer_settings"]["selection_colors"] == expected
    assert (
        restored["scenes"][0]["entry_states"][0]["viewer_settings"]["selection_colors"] == expected
    )
    edited = client.post(
        f"{path}/entries/{entry['id']}/ligand-edits",
        json={
            "expected_revision": project["revision"],
            "operation": "atom.delete",
            "atom_ids": [3],
        },
    )
    assert edited.status_code == 200, edited.text
    project = edited.json()["project"]
    for settings in [
        project["entries"][0]["viewer_settings"],
        project["scenes"][0]["entry_states"][0]["viewer_settings"],
    ]:
        assert settings["selection_colors"] == [
            {"color": "#00ff00", "atom_ids": [2]},
            {"color": "#ff0000", "atom_ids": [1]},
        ]
    project = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == expected


def test_selection_color_validation_and_legacy_entry_updates(client: ApiClient) -> None:
    project = import_ligand(client)
    entry_id = project["entries"][0]["id"]
    target = selection(entry_id, 1)
    for color in ["red", "#fff", "#1234567"]:
        assert color_selection(client, project, target, color).status_code == 422
    assert color_selection(client, project, selection(entry_id, 999), "#ffffff").status_code == 422
    colored = color_selection(client, project, target, "#ffffff").json()
    assert color_selection(client, project, target, "#000000").status_code == 409
    settings = colored["entries"][0]["viewer_settings"]
    settings.pop("selection_colors")
    response = client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/viewer-settings",
        json={"expected_revision": colored["revision"], "settings": settings},
    )
    assert response.status_code == 200, response.text
    project = response.json()
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == [
        {"color": "#ffffff", "atom_ids": [1]}
    ]
    settings["selection_colors"] = []
    assert (
        client.request(
            "PUT",
            f"/api/v1/projects/{project['id']}/entries/{entry_id}/viewer-settings",
            json={"expected_revision": project["revision"], "settings": settings},
        ).status_code
        == 422
    )


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

    colored = color_selection(client, styled, target, "#123456")
    assert colored.status_code == 200
    styled = colored.json()
    assert all(entry["viewer_settings"]["selection_colors"] for entry in styled["entries"])

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
    before = client.get(f"/api/v1/projects/{project['id']}").json()
    assert color_selection(client, styled, invalid_target, "#abcdef").status_code == 422
    assert client.get(f"/api/v1/projects/{project['id']}").json() == before
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
                "selection_colors": [],
                "selection_nonpolar_hydrogens": [],
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
    assert project["entries"][0]["viewer_settings"]["components"]["nonpolar_hydrogens"] is False
    assert project["history"]["undo_description"] == "Update viewer settings for Ethanol"

    undone_settings = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": project["revision"]},
    ).json()
    assert (
        undone_settings["entries"][0]["viewer_settings"]["components"]["nonpolar_hydrogens"] is True
    )
    project = client.post(
        f"/api/v1/projects/{project['id']}/history/redo",
        json={"expected_revision": undone_settings["revision"]},
    ).json()
    assert project["entries"][0]["viewer_settings"]["components"]["nonpolar_hydrogens"] is False

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


def test_local_hydrogens_exact_targets_persistence_and_molecular_invariance(
    client: ApiClient,
) -> None:
    project = client.post("/api/v1/projects", json={"name": "Hydrogens"}).json()
    path = f"/api/v1/projects/{project['id']}"
    imported = client.post(
        f"{path}/imports",
        data={"expected_revision": 0},
        files=[
            (
                "files",
                (
                    "hydrogens.mol",
                    (FIXTURES.parent / "hydrogens" / "polar_hydrogens_ligand.mol").read_bytes(),
                    "chemical/x-mdl-molfile",
                ),
            ),
        ],
    )
    assert imported.status_code == 201, imported.text
    project = imported.json()["project"]
    entry = project["entries"][0]
    entry_path = f"{path}/entries/{entry['id']}"
    normalized = client.get(f"{entry_path}/structure").json()
    original = client.get(f"{entry_path}/original").content
    project = client.get(path).json()

    def change(current: dict[str, Any], ids: list[int], show: bool | None):
        return client.post(
            f"{path}/selection-appearance",
            json={
                "expected_revision": current["revision"],
                "selection": selection(entry["id"], *ids),
                "property": "nonpolar_hydrogens",
                "action": "reset" if show is None else "set",
                **({"show": show} if show is not None else {}),
            },
        )

    for ids in [[1, 3], [2, 999]]:
        assert change(project, ids, False).status_code == 422
        assert client.get(path).json() == project
    result = change(project, [1, 2, 3, 4], False)
    assert result.status_code == 200, result.text
    project = result.json()
    assert change({**project, "revision": project["revision"] - 1}, [2], True).status_code == 409
    project = change(project, [2], True).json()
    expected = [{"show": False, "atom_ids": [4]}, {"show": True, "atom_ids": [2]}]
    field = "selection_nonpolar_hydrogens"
    assert project["entries"][0]["viewer_settings"][field] == expected
    assert client.get(f"{entry_path}/structure").json() == normalized
    assert client.get(f"{entry_path}/original").content == original
    project = client.post(
        f"{path}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "Hydrogens",
            "camera": camera(),
            "selection": selection(entry["id"], 2, 4),
        },
    ).json()
    settings = project["entries"][0]["viewer_settings"]
    legacy = {k: v for k, v in settings.items() if k != field}
    project = client.request(
        "PUT",
        f"{entry_path}/viewer-settings",
        json={
            "expected_revision": project["revision"],
            "settings": legacy,
        },
    ).json()
    assert project["entries"][0]["viewer_settings"][field] == expected
    assert (
        client.request(
            "PUT",
            f"{entry_path}/viewer-settings",
            json={
                "expected_revision": project["revision"],
                "settings": {**settings, field: []},
            },
        ).status_code
        == 422
    )
    exported = export_archive(client, project["id"], "local-hydrogens")
    restored = import_archive(client, client.get(exported["artifact"]["download_url"]).content)[
        "project"
    ]
    assert restored["entries"][0]["viewer_settings"][field] == expected
    assert restored["scenes"][0]["entry_states"][0]["viewer_settings"][field] == expected
    project = change(project, [2], None).json()
    assert project["entries"][0]["viewer_settings"][field] == expected[:1]
    project = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert project["entries"][0]["viewer_settings"][field] == expected
    result = client.post(
        f"{entry_path}/ligand-edits",
        json={
            "expected_revision": project["revision"],
            "operation": "atom.delete",
            "atom_ids": [2],
        },
    )
    assert result.status_code == 200, result.text
    project = result.json()["project"]
    assert project["entries"][0]["viewer_settings"][field] == expected[:1]
    assert project["scenes"][0]["entry_states"][0]["viewer_settings"][field] == expected[:1]
    project = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert project["entries"][0]["viewer_settings"][field] == expected
    assert client.get(f"{entry_path}/structure").json() == normalized


def test_carbon_only_color_restores_elements_and_preserves_history_and_archive(
    client: ApiClient,
) -> None:
    project = import_ligand(client)
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry_id}/original").content
    normalized = client.get(f"{path}/entries/{entry_id}/structure").json()
    project = color_selection(client, project, selection(entry_id, 1, 2, 3), "#ff0000").json()
    previous = project["entries"][0]["viewer_settings"]
    payload = {
        "expected_revision": project["revision"],
        "selection": selection(entry_id, 2, 3),
        "property": "color",
        "action": "set",
        "color": "#00FF00",
        "color_mode": "carbon",
    }
    response = client.post(f"{path}/selection-appearance", json=payload)
    assert response.status_code == 200, response.text
    project = response.json()
    expected = [
        {"color": "#00ff00", "atom_ids": [2]},
        {"color": "#ff0000", "atom_ids": [1]},
        {"color": "element", "atom_ids": [3]},
    ]
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == expected
    assert client.get(f"{path}/entries/{entry_id}/original").content == original
    assert client.get(f"{path}/entries/{entry_id}/structure").json() == normalized
    assert client.post(f"{path}/selection-appearance", json=payload).status_code == 409
    project = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert project["entries"][0]["viewer_settings"] == previous
    project = client.post(
        f"{path}/history/redo", json={"expected_revision": project["revision"]}
    ).json()
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == expected
    project = client.post(
        f"{path}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "Carbon",
            "selection": selection(entry_id, 2, 3),
            "camera": {
                "mode": "perspective",
                "position": [0, 0, 10],
                "target": [0, 0, 0],
                "up": [0, 1, 0],
                "radius": 5,
            },
        },
    ).json()
    exported = export_archive(client, project["id"], "carbon-roundtrip")
    restored = import_archive(client, client.get(exported["artifact"]["download_url"]).content)[
        "project"
    ]
    assert restored["entries"][0]["viewer_settings"]["selection_colors"] == expected
    assert (
        restored["scenes"][0]["entry_states"][0]["viewer_settings"]["selection_colors"] == expected
    )
    deleted = client.post(
        f"{path}/entries/{entry_id}/ligand-edits",
        json={
            "expected_revision": project["revision"],
            "operation": "atom.delete",
            "atom_ids": [3],
        },
    )
    assert deleted.status_code == 200, deleted.text
    project = deleted.json()["project"]
    for state in [project["entries"][0], project["scenes"][0]["entry_states"][0]]:
        assert state["viewer_settings"]["selection_colors"] == expected[:2]
    project = client.post(
        f"{path}/history/undo",
        json={
            "expected_revision": project["revision"],
        },
    ).json()
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == expected
    assert (
        project["scenes"][0]["entry_states"][0]["viewer_settings"]["selection_colors"] == expected
    )
    # A no-carbon selection explicitly restores element coloring; no unrelated C changes.
    response = client.post(
        f"{path}/selection-appearance",
        json={
            **payload,
            "expected_revision": project["revision"],
            "selection": selection(entry_id, 3),
        },
    )
    assert response.status_code == 200, response.text
    project = response.json()
    assert project["entries"][0]["viewer_settings"]["selection_colors"] == expected
    project = client.get(path).json()
    for invalid in [
        {"color_mode": "unknown"},
        {"action": "reset", "color": None},
        {"selection": selection(entry_id, 2, 999)},
        {"property": "nonpolar_hydrogens", "color": None, "show": True},
    ]:
        assert (
            client.post(
                f"{path}/selection-appearance",
                json={
                    **payload,
                    "expected_revision": project["revision"],
                    **invalid,
                },
            ).status_code
            == 422
        )
        assert client.get(path).json() == project
    reset = color_selection(client, project, selection(entry_id, 2, 3), None).json()
    assert reset["entries"][0]["viewer_settings"]["selection_colors"] == [
        {"color": "#ff0000", "atom_ids": [1]}
    ]
