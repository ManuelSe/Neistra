from __future__ import annotations

from copy import deepcopy
from typing import Any

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_pocket_surfaces import fixture, history, save_scene
from tests.support.api_client import ApiClient


def create(client: ApiClient, project: dict[str, Any], *items: dict[str, Any]):
    return client.post(
        f"/api/v1/projects/{project['id']}/surfaces",
        json={
            "expected_revision": project["revision"],
            "surfaces": list(items),
        },
    )


def objects(project: dict[str, Any], entry_id: str):
    return next(entry for entry in project["entries"] if entry["id"] == entry_id)[
        "viewer_settings"
    ]["surface_objects"]


def change(
    client: ApiClient, project: dict[str, Any], entry_id: str, surface_id: str, **values: Any
):
    return client.request(
        "PATCH",
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/surfaces/{surface_id}",
        json={"expected_revision": project["revision"], **values},
    )


def remove(client: ApiClient, project: dict[str, Any], entry_id: str, surface_id: str):
    return client.request(
        "DELETE",
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/surfaces/{surface_id}",
        json={"expected_revision": project["revision"]},
    )


def fragment(entry_id: str, *ids: int):
    return {"entry_id": entry_id, "source": {"kind": "fragment", "atom_ids": list(ids)}}


def pocket(entry_id: str, seed_entry_id: str):
    return {
        "entry_id": entry_id,
        "source": {
            "kind": "pocket",
            "radius": 5,
            "seed_atom_references": [{"structure_id": seed_entry_id, "atom_id": 1}],
        },
    }


def test_three_kinds_and_same_entry_objects_are_independent_reversible_and_molecularly_invariant(
    client: ApiClient,
):
    project, receptor, ligand = fixture(client)
    path = f"/api/v1/projects/{project['id']}"
    originals = {
        entry["id"]: client.get(f"{path}/entries/{entry['id']}/original").content
        for entry in project["entries"]
    }
    structures = {
        entry["id"]: client.get(f"{path}/entries/{entry['id']}/structure").json()
        for entry in project["entries"]
    }
    response = create(
        client,
        project,
        {"entry_id": receptor["id"], "source": {"kind": "entry"}},
        fragment(receptor["id"], 1, 2),
        pocket(receptor["id"], ligand["id"]),
        fragment(receptor["id"], 2, 3),
    )
    assert response.status_code == 200, response.text
    changed = response.json()
    assert changed["schema_version"] == 2
    assert changed["revision"] == project["revision"] + 1
    surfaces = deepcopy(objects(changed, receptor["id"]))
    assert len(surfaces) == len({surface["id"] for surface in surfaces}) == 4
    assert [item["source"]["kind"] for item in surfaces] == [
        "entry",
        "fragment",
        "pocket",
        "fragment",
    ]
    assert surfaces[1]["source"]["atom_ids"] == [1, 2]
    assert surfaces[3]["source"]["atom_ids"] == [2, 3]
    project = change(
        client,
        changed,
        receptor["id"],
        surfaces[1]["id"],
        name="Site A",
        visible=False,
        appearance={
            "color_by": "custom",
            "custom_color": "#2288ff",
            "opacity": 0.2,
            "mode": "mesh",
        },
    ).json()
    after = objects(project, receptor["id"])
    assert after[1]["name"] == "Site A" and not after[1]["visible"]
    assert after[1]["appearance"]["mode"] == "mesh"
    assert [after[i] for i in [0, 2, 3]] == [surfaces[i] for i in [0, 2, 3]]
    before_noop = client.get(path).json()
    assert (
        change(client, project, receptor["id"], surfaces[1]["id"], visible=False).json()
        == before_noop
    )
    project = history(client, project, "undo")
    assert objects(project, receptor["id"]) == surfaces
    project = history(client, project, "redo")
    assert objects(project, receptor["id"])[1] == after[1]
    project = remove(client, project, receptor["id"], surfaces[2]["id"]).json()
    assert len(objects(project, receptor["id"])) == 3
    project = history(client, project, "undo")
    assert objects(project, receptor["id"])[2] == surfaces[2]
    for entry in project["entries"]:
        assert (
            client.get(f"{path}/entries/{entry['id']}/original").content == originals[entry["id"]]
        )
        assert (
            client.get(f"{path}/entries/{entry['id']}/structure").json() == structures[entry["id"]]
        )
    assert project["structure_patches"] == project["topology_patches"] == []


def test_surface_batch_validation_conflicts_noops_and_generic_write_guards(client: ApiClient):
    project, receptor, ligand = fixture(client)
    path = f"/api/v1/projects/{project['id']}"
    before = client.get(path).json()
    invalid = create(client, project, fragment(receptor["id"], 1), fragment(ligand["id"], 999_999))
    assert invalid.status_code == 422
    assert client.get(path).json() == before
    assert create(client, project, pocket(ligand["id"], receptor["id"])).status_code == 422
    assert client.get(path).json() == before
    response = create(client, project, fragment(ligand["id"], 1, 2))
    assert response.status_code == 200, response.text
    updated = client.get(path).json()
    surface = objects(updated, ligand["id"])[0]
    assert create(client, project, fragment(ligand["id"], 1)).status_code == 409
    for values in [
        {"source": {"kind": "entry"}},
        {"name": "  "},
        {"visible": None},
        {"appearance": {"opacity": 2}},
        {"source": {"kind": "fragment", "atom_ids": [999_999]}},
    ]:
        assert change(client, updated, ligand["id"], surface["id"], **values).status_code == 422
        assert client.get(path).json() == updated
    settings = deepcopy(
        next(e for e in updated["entries"] if e["id"] == ligand["id"])["viewer_settings"]
    )
    settings["surface_objects"] = []
    route = f"{path}/entries/{ligand['id']}/viewer-settings"
    assert (
        client.request(
            "PUT", route, json={"expected_revision": updated["revision"], "settings": settings}
        ).status_code
        == 422
    )
    settings.pop("surface_objects")
    response = client.request(
        "PUT", route, json={"expected_revision": updated["revision"], "settings": settings}
    )
    assert response.status_code == 200, response.text
    assert objects(response.json(), ligand["id"])[0] == surface
    latest = response.json()
    settings.pop("schema_version")
    assert (
        client.request(
            "PUT", route, json={"expected_revision": latest["revision"], "settings": settings}
        ).status_code
        == 422
    )
    for old in ["selection-surface", "selection-pocket-surface"]:
        assert client.post(f"{path}/{old}", json={}).status_code == 410


def test_surface_scenes_checkpoints_and_archives_preserve_ids_and_remap_seeds(client: ApiClient):
    project, receptor, ligand = fixture(client)
    project = create(
        client, project, fragment(receptor["id"], 1, 2), pocket(receptor["id"], ligand["id"])
    ).json()
    seeds = [{"structure_id": ligand["id"], "atom_id": 1}]
    project = save_scene(client, project, seeds)
    expected = deepcopy(objects(project, receptor["id"]))
    path = f"/api/v1/projects/{project['id']}"
    project = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    assert not project["has_uncheckpointed_changes"]
    project = change(client, project, receptor["id"], expected[1]["id"], visible=False).json()
    assert project["has_uncheckpointed_changes"]
    project = client.post(
        f"{path}/scenes/{project['scenes'][0]['id']}/apply",
        json={"expected_revision": project["revision"]},
    ).json()
    assert objects(project, receptor["id"]) == expected
    exported = export_archive(client, project["id"], "surface-objects")
    assert exported["manifest_schema_version"] == 2
    restored = import_archive(client, client.get(exported["artifact"]["download_url"]).content)[
        "project"
    ]
    restored_receptor = next(e for e in restored["entries"] if e["source_format"] == "pdb")
    restored_ligand = next(e for e in restored["entries"] if e["source_format"] == "mol")
    restored_objects = objects(restored, restored_receptor["id"])
    assert [o["id"] for o in restored_objects] == [o["id"] for o in expected]
    assert restored_objects[0] == expected[0]
    assert restored_objects[1]["source"]["seed_atom_references"] == [
        {"structure_id": restored_ligand["id"], "atom_id": 1}
    ]
    assert (
        restored["scenes"][0]["entry_states"][
            0
            if restored["scenes"][0]["entry_states"][0]["entry_id"] == restored_receptor["id"]
            else 1
        ]["viewer_settings"]["surface_objects"]
        == restored_objects
    )


def test_surface_capacity_is_atomic_and_last_surface_can_be_removed_without_a_fallback(
    client: ApiClient,
):
    project, receptor, ligand = fixture(client)
    project = create(client, project, *(fragment(ligand["id"], 1) for _ in range(16))).json()
    before = client.get(f"/api/v1/projects/{project['id']}").json()
    assert (
        create(client, project, fragment(receptor["id"], 1), fragment(ligand["id"], 1)).status_code
        == 422
    )
    assert client.get(f"/api/v1/projects/{project['id']}").json() == before
    settings = deepcopy(
        next(e for e in project["entries"] if e["id"] == receptor["id"])["viewer_settings"]
    )
    settings["representations"] = []
    route = f"/api/v1/projects/{project['id']}/entries/{receptor['id']}/viewer-settings"
    project = client.request(
        "PUT", route, json={"expected_revision": project["revision"], "settings": settings}
    ).json()
    project = create(
        client, project, {"entry_id": receptor["id"], "source": {"kind": "entry"}}
    ).json()
    project = remove(
        client, project, receptor["id"], objects(project, receptor["id"])[0]["id"]
    ).json()
    owner = next(e for e in project["entries"] if e["id"] == receptor["id"])
    assert (
        owner["viewer_settings"]["representations"]
        == owner["viewer_settings"]["surface_objects"]
        == []
    )
