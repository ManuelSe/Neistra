from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest

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


def test_surface_display_edits_remain_allowed_on_locked_entries_and_keep_identity(
    client: ApiClient,
):
    project, receptor, _ = fixture(client)
    project = create(client, project, fragment(receptor["id"], 1, 2)).json()
    surface = deepcopy(objects(project, receptor["id"])[0])
    path = f"/api/v1/projects/{project['id']}"
    project = client.post(
        f"{path}/entries/{receptor['id']}/lock",
        json={"expected_revision": project["revision"], "value": True},
    ).json()
    for theme in ["element", "chain", "residue", "secondary-structure", "structure", "custom"]:
        response = change(
            client,
            project,
            receptor["id"],
            surface["id"],
            appearance={
                "color_by": theme,
                "custom_color": "#ff00ff",
                "opacity": 0.25,
                "mode": "mesh",
                "inherit_atom_colors": False,
            },
        )
        assert response.status_code == 200, response.text
        project = response.json()
        assert objects(project, receptor["id"])[0]["id"] == surface["id"]
        assert next(entry for entry in project["entries"] if entry["id"] == receptor["id"])[
            "locked"
        ]
    changed = change(
        client,
        project,
        receptor["id"],
        surface["id"],
        source={"kind": "fragment", "profile": "molecular-v1", "atom_ids": [3]},
    )
    assert changed.status_code == 200, changed.text
    project = changed.json()
    assert objects(project, receptor["id"])[0]["source"]["atom_ids"] == [3]
    assert (
        next(entry for entry in project["entries"] if entry["id"] == receptor["id"])[
            "current_artifact_id"
        ]
        == receptor["current_artifact_id"]
    )
    removed = remove(client, project, receptor["id"], surface["id"])
    assert removed.status_code == 200, removed.text
    assert objects(removed.json(), receptor["id"]) == []
    restored = history(client, removed.json(), "undo")
    assert objects(restored, receptor["id"])[0]["id"] == surface["id"]


def test_multiple_fragments_and_pockets_prune_duplicate_and_archive_without_cross_object_loss(
    client: ApiClient,
):
    from tests.integration.test_ligand_edits import edit

    project, receptor, ligand = fixture(client)
    first_pocket = pocket(receptor["id"], ligand["id"])
    second_pocket = deepcopy(first_pocket)
    second_pocket["source"]["seed_atom_references"][0]["atom_id"] = 3
    self_pocket = pocket(receptor["id"], receptor["id"])
    project = create(
        client,
        project,
        fragment(ligand["id"], 1, 2),
        fragment(ligand["id"], 2, 3),
        {"entry_id": ligand["id"], "source": {"kind": "entry"}},
        first_pocket,
        second_pocket,
        self_pocket,
    ).json()
    project = save_scene(client, project, [])
    before = deepcopy(project)
    original_ligand_objects = deepcopy(objects(project, ligand["id"]))
    original_pockets = deepcopy(objects(project, receptor["id"]))
    path = f"/api/v1/projects/{project['id']}"
    project = edit(client, project, ligand["id"], {"operation": "atom.delete", "atom_ids": [1]})[
        "project"
    ]
    changed_fragments = objects(project, ligand["id"])
    assert changed_fragments[0] == {
        **original_ligand_objects[0],
        "source": {"kind": "fragment", "profile": "molecular-v1", "atom_ids": [2]},
    }
    assert changed_fragments[1:] == original_ligand_objects[1:]
    assert objects(project, receptor["id"]) == original_pockets[1:]
    for state in project["scenes"][0]["entry_states"]:
        assert state["viewer_settings"]["surface_objects"] == objects(project, state["entry_id"])
    project = history(client, project, "undo")
    for owner in [receptor, ligand]:
        assert objects(project, owner["id"]) == objects(before, owner["id"])
    project = history(client, project, "redo")
    duplicated = client.post(
        f"{path}/entries/{receptor['id']}/duplicate",
        json={"expected_revision": project["revision"]},
    )
    assert duplicated.status_code == 200, duplicated.text
    project = duplicated.json()
    copied = next(
        entry for entry in project["entries"] if entry["id"] not in {receptor["id"], ligand["id"]}
    )
    assert [obj["id"] for obj in objects(project, copied["id"])] == [
        obj["id"] for obj in original_pockets[1:]
    ]
    assert objects(project, copied["id"])[1]["source"]["seed_atom_references"] == [
        {"structure_id": copied["id"], "atom_id": 1}
    ]
    exported = export_archive(client, project["id"], "multiple-pocket-remapping")
    restored = import_archive(client, client.get(exported["artifact"]["download_url"]).content)[
        "project"
    ]
    by_name = {entry["name"]: entry for entry in restored["entries"]}
    for original in [receptor, copied]:
        owner = by_name[original["name"]]
        refs = objects(restored, owner["id"])
        assert refs[0]["source"]["seed_atom_references"] == [
            {"structure_id": by_name[ligand["name"]]["id"], "atom_id": 3}
        ]
        assert refs[1]["source"]["seed_atom_references"] == [
            {"structure_id": owner["id"], "atom_id": 1}
        ]


@pytest.mark.parametrize("location", ["entry", "scene"])
def test_archive_rejects_surface_identifiers_that_cannot_be_addressed_as_uuid_segments(
    client: ApiClient, location: str
):
    import io
    import json
    import zipfile

    project, receptor, _ = fixture(client)
    project = create(client, project, fragment(receptor["id"], 1, 2)).json()
    project = save_scene(client, project, [])
    exported = export_archive(client, project["id"], f"invalid-surface-id-{location}")
    archive = client.get(exported["artifact"]["download_url"]).content
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(archive)) as source, zipfile.ZipFile(output, "w") as target:
        for member in source.infolist():
            data = source.read(member)
            if member.filename == "manifest.json":
                manifest = json.loads(data)
                states = (
                    manifest["entries"]
                    if location == "entry"
                    else manifest["scenes"][0]["entry_states"]
                )
                owner = next(
                    state
                    for state in states
                    if state.get("entry_id", state.get("id")) == receptor["id"]
                )
                owner["viewer_settings"]["surface_objects"][0]["id"] = "../../not-a-surface-uuid"
                data = json.dumps(manifest).encode()
            target.writestr(member, data)
    before = client.get("/api/v1/projects").json()
    rejected = client.post(
        "/api/v1/projects/import-archive",
        data={"operation_id": f"bad-id-{location}"},
        files={"file": ("invalid.molweave.zip", output.getvalue(), "application/zip")},
    )
    assert rejected.status_code == 422, rejected.text
    assert rejected.json()["detail"]["code"] == "invalid_archive_manifest"
    assert client.get("/api/v1/projects").json() == before


def test_legacy_archive_surface_identity_uses_canonical_owner_uuid():
    from molweave_api.archive_service import _upgrade_legacy_manifest

    from tests.integration.test_migrations import legacy_viewer_settings

    owner = "01924673-abcd-7000-8000-123456789abc"
    settings = {
        **legacy_viewer_settings(),
        "selection_surface": {"profile": "molecular-v1", "atom_ids": [1]},
    }
    converted = _upgrade_legacy_manifest(
        {
            "schema_version": 1,
            "entries": [{"id": owner.upper(), "viewer_settings": deepcopy(settings)}],
            "scenes": [
                {"entry_states": [{"entry_id": owner, "viewer_settings": deepcopy(settings)}]}
            ],
        }
    )
    live = converted["entries"][0]["viewer_settings"]["surface_objects"][0]
    scene = converted["scenes"][0]["entry_states"][0]["viewer_settings"]["surface_objects"][0]
    assert live == scene
