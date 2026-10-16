from typing import Any

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.support.api_client import ApiClient


def create(client: ApiClient) -> dict[str, Any]:
    project = client.post("/api/v1/projects", json={"name": "From scratch"}).json()
    response = client.post(
        f"/api/v1/projects/{project['id']}/molecules",
        json={
            "expected_revision": project["revision"],
            "name": "Draft molecule",
            "element": "C",
            "charge": 0,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_creation_preview_cancel_apply_history_and_empty_rebuild(client: ApiClient) -> None:
    result = create(client)
    project, entry_id = result["project"], result["entry_id"]
    path = f"/api/v1/projects/{project['id']}"
    entry = project["entries"][0]
    assert project["revision"] == 1
    assert entry["original_filename"] is None and entry["original_artifact_id"] is None
    assert entry["source_format"] is None
    first = structure(client, project["id"], entry_id)
    assert first["source"]["format"] == "generated"
    assert first["source"]["facts"]["origin"] == "generated"
    assert first["atoms"][0]["coordinates"] == [0, 0, 0]
    assert result["selection_after"]["atoms"] == [{"structure_id": entry_id, "atom_id": 1}]
    payload = {
        "expected_revision": project["revision"],
        "expected_artifact_id": entry["current_artifact_id"],
        "selection": result["selection_after"],
        "action": {
            "operation": "fragment.attach",
            "fragment": "phenyl",
            "direction": 1,
            "rotation": 2,
        },
    }
    baseline = client.get(path).json()
    for _ in range(2):
        preview = client.post(f"{path}/entries/{entry_id}/model-edits/preview", json=payload)
        assert preview.status_code == 200, preview.text
        ghost = preview.json()
        assert all(a["preview_id"].startswith("preview-") and "id" not in a for a in ghost["atoms"])
        assert client.get(path).json() == baseline
        assert structure(client, project["id"], entry_id) == first
    response = client.post(f"{path}/entries/{entry_id}/model-edits", json=payload)
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    after = structure(client, project["id"], entry_id)
    assert [a["coordinates"] for a in after["atoms"][1:]] == [
        a["coordinates"] for a in ghost["atoms"]
    ]
    assert after["atoms"][0] == first["atoms"][0]
    assert response.json()["selection_after"]["atoms"] == [{"structure_id": entry_id, "atom_id": 2}]
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert structure(client, project["id"], entry_id) == first
    response = edit(
        client, undone, entry_id, [1], {"operation": "atom.add", "element": "N", "charge": None}
    )
    assert response.status_code == 200, response.text
    assert min(response.json()["report"]["created_atom_ids"]) > max(a["id"] for a in after["atoms"])
    project = response.json()["project"]
    current = structure(client, project["id"], entry_id)
    deleted = edit(
        client, project, entry_id, [a["id"] for a in current["atoms"]], {"operation": "atom.delete"}
    )
    assert deleted.status_code == 200, deleted.text
    project = deleted.json()["project"]
    empty = structure(client, project["id"], entry_id)
    assert empty["atoms"] == []
    rebuilt = edit(
        client, project, entry_id, [], {"operation": "atom.add", "element": "O", "charge": 0}
    )
    assert rebuilt.status_code == 200, rebuilt.text
    assert rebuilt.json()["report"]["created_atom_ids"][0] > max(a["id"] for a in current["atoms"])
    assert structure(client, project["id"], entry_id)["atoms"][0]["coordinates"] == [0, 0, 0]


def test_generated_and_empty_archives_have_no_fabricated_original(client: ApiClient) -> None:
    result = create(client)
    project, entry_id = result["project"], result["entry_id"]
    project = edit(client, project, entry_id, [1], {"operation": "atom.delete"}).json()["project"]
    before = structure(client, project["id"], entry_id)
    archive = export_archive(client, project["id"], "empty-generated")
    restored = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    entry = restored["entries"][0]
    assert entry["atom_ids"] == []
    assert entry["original_artifact_id"] is None
    assert entry["source_format"] is None
    assert structure(client, restored["id"], entry["id"]) == before
    assert (
        client.get(f"/api/v1/projects/{restored['id']}/entries/{entry['id']}/original").status_code
        == 409
    )


def test_first_atom_creation_is_one_reversible_command(client: ApiClient) -> None:
    result = create(client)
    project, entry_id = result["project"], result["entry_id"]
    path = f"/api/v1/projects/{project['id']}"
    before = structure(client, project["id"], entry_id)
    undone = client.post(f"{path}/history/undo", json={"expected_revision": project["revision"]})
    assert undone.status_code == 200, undone.text
    assert undone.json()["entries"] == []
    redone = client.post(
        f"{path}/history/redo", json={"expected_revision": undone.json()["revision"]}
    )
    assert redone.status_code == 200, redone.text
    assert redone.json()["entries"][0]["id"] == entry_id
    assert structure(client, project["id"], entry_id) == before


def test_preview_refuses_stale_locked_and_ghost_operands_without_mutation(
    client: ApiClient,
) -> None:
    result = create(client)
    project, entry_id = result["project"], result["entry_id"]
    path = f"/api/v1/projects/{project['id']}"
    payload = {
        "expected_revision": project["revision"],
        "expected_artifact_id": project["entries"][0]["current_artifact_id"],
        "selection": result["selection_after"],
        "action": {"operation": "atom.add", "element": "C"},
    }
    baseline = client.get(path).json()
    for changes, status in [
        ({"expected_revision": 0}, 409),
        ({"expected_artifact_id": "missing"}, 422),
        (
            {
                "selection": {
                    **result["selection_after"],
                    "atoms": [{"structure_id": entry_id, "atom_id": "preview-0"}],
                }
            },
            422,
        ),
        (
            {
                "selection": {
                    **result["selection_after"],
                    "atoms": [{"structure_id": entry_id, "atom_id": 9999}],
                }
            },
            422,
        ),
    ]:
        response = client.post(
            f"{path}/entries/{entry_id}/model-edits/preview", json={**payload, **changes}
        )
        assert response.status_code == status, response.text
        assert client.get(path).json() == baseline
    locked = client.post(
        f"{path}/entries/{entry_id}/lock",
        json={"expected_revision": project["revision"], "value": True},
    ).json()
    baseline = client.get(path).json()
    response = client.post(
        f"{path}/entries/{entry_id}/model-edits/preview",
        json={**payload, "expected_revision": locked["revision"]},
    )
    assert response.status_code == 422, response.text
    assert client.get(path).json() == baseline
