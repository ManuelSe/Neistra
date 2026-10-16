from __future__ import annotations

from typing import Any

import pytest

from tests.integration.test_archive_roundtrip import import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_selection_edits import project_with_ligand, selection
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture, prepared_complex
from tests.support.modeling_fixture import paracetamol


def edit(
    client: ApiClient,
    project: dict[str, Any],
    entry_id: str,
    ids: list[int],
    action: dict[str, Any],
    **options: Any,
):  # type: ignore[no-untyped-def]
    entry = next(e for e in project["entries"] if e["id"] == entry_id)
    return client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits",
        json={
            "expected_revision": project["revision"],
            "expected_artifact_id": entry["current_artifact_id"],
            "selection": selection(entry_id, ids),
            "action": action,
            **options,
        },
    )


def test_draft_aromatic_graph_renders_and_undo_redo_preserve_original(client: ApiClient) -> None:
    before = paracetamol(orphan_h=True)
    before = before.model_copy(
        update={
            "atoms": [a.model_copy(update={"formal_charge": None}) for a in before.atoms],
        }
    )
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry_id}/original").content
    bond = next(b for b in before.bonds if b.aromatic)
    response = edit(
        client, project, entry_id, [bond.atom_1_id, bond.atom_2_id], {"operation": "bond.delete"}
    )
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    assert project["revision"] == 1
    after = structure(client, project["id"], entry_id)
    assert after["atoms"] == before.model_dump(mode="json")["atoms"]
    assert after["metadata"]["neistra_modeling"]["excluded_bonds"] == [
        sorted([bond.atom_1_id, bond.atom_2_id])
    ]
    projected = client.get(f"{path}/entries/{entry_id}/structure")
    assert projected.status_code == 200
    assert projected.json()["viewer"]["format"] == "sdf"
    assert "M  END" in projected.json()["viewer"]["data"]
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    redone = client.post(
        f"{path}/history/redo", json={"expected_revision": undone["revision"]}
    ).json()
    assert redone["revision"] == undone["revision"] + 1
    assert structure(client, project["id"], entry_id) == after
    assert client.get(f"{path}/entries/{entry_id}/original").content == original


def test_raw_protein_unknowns_covalent_link_and_display_exclusion(client: ApiClient) -> None:
    before = prepared_complex()
    target = next(a for a in before.atoms if a.formal_charge == 0)
    before = before.model_copy(
        update={"atoms": [a.model_copy(update={"formal_charge": None}) for a in before.atoms]}
    )
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    response = edit(
        client,
        project,
        entry_id,
        [target.id],
        {"operation": "atom.element", "element": "P"},
        hydrogen_policy="complete_if_possible",
    )
    assert response.status_code == 200, response.text
    assert any(
        w["code"] == "model_hydrogen_completion_skipped" for w in response.json()["warnings"]
    )
    project = response.json()["project"]
    after = structure(client, project["id"], entry_id)
    assert after["atoms"][target.id - 1]["element"] == "P"
    assert all(a["formal_charge"] is None for a in after["atoms"])
    response = edit(
        client, project, entry_id, [1, target.id], {"operation": "bond.set", "order": None}
    )
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    assert structure(client, project["id"], entry_id)["bonds"][-1]["order"] is None
    response = edit(client, project, entry_id, [1, target.id], {"operation": "bond.delete"})
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    assert [1, target.id] in structure(client, project["id"], entry_id)["metadata"][
        "neistra_modeling"
    ]["excluded_bonds"]


def test_delete_all_atoms_retains_empty_entry_and_monotonic_allocators(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    before = structure(client, project["id"], entry_id)
    response = edit(
        client, project, entry_id, [a["id"] for a in before["atoms"]], {"operation": "atom.delete"}
    )
    assert response.status_code == 200, response.text
    current = response.json()["project"]
    assert current["entries"][0]["atom_count"] == 0
    assert response.json()["selection_after"]["atoms"] == []
    assert structure(client, project["id"], entry_id)["atoms"] == []


@pytest.mark.parametrize(
    "action,ids",
    [
        ({"operation": "atom.delete"}, []),
        ({"operation": "atom.element", "element": "N"}, [1, 2]),
        ({"operation": "atom.element", "element": "C"}, [1]),
        ({"operation": "bond.set", "order": 4}, [1, 2]),
        ({"operation": "atom.charge.set", "charge": 0.5}, [1]),
        ({"operation": "atom.delete"}, [10000]),
    ],
)
def test_refusals_do_not_publish_or_allocate(
    client: ApiClient, action: dict[str, Any], ids: list[int]
) -> None:
    project, entry_id = project_with_ligand(client)
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    response = edit(client, project, entry_id, ids, action)
    assert response.status_code == 422, response.text
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline


def test_stale_revision_artifact_and_lock_are_enforced(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    response = edit(
        client, project, entry_id, [1], {"operation": "atom.charge.set", "charge": None}
    )
    assert response.status_code == 200, response.text
    current = response.json()["project"]
    assert edit(client, project, entry_id, [1], {"operation": "atom.delete"}).status_code == 409
    assert (
        edit(
            client,
            current,
            entry_id,
            [1],
            {"operation": "atom.delete"},
            expected_artifact_id=project["entries"][0]["current_artifact_id"],
        ).status_code
        == 422
    )
    locked = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/lock",
        json={"expected_revision": current["revision"], "value": True},
    ).json()
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    assert edit(client, locked, entry_id, [1], {"operation": "atom.delete"}).status_code == 422
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
