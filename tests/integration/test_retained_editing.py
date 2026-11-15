from __future__ import annotations

import pytest

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit as model_edit
from tests.integration.test_protein_edits import project_with_protein
from tests.integration.test_selection_edits import edit as selection_edit
from tests.scientific.test_direct_geometry_diagnostics import frames
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture


@pytest.mark.parametrize("pair", [(6, 7), (7, 8), (3, 6), (8, 10)])
def test_cut_then_mutate_has_exact_history_reload_archive_and_original(
    client: ApiClient,
    pair: tuple[int, int],
) -> None:
    project, entry_id = project_with_protein(client)
    path = f"/api/v1/projects/{project['id']}"
    original_bytes = client.get(f"{path}/entries/{entry_id}/original").content
    response = model_edit(
        client,
        project,
        entry_id,
        list(pair),
        {"operation": "bond.delete"},
        hydrogen_policy="automatic",
    )
    assert response.status_code == 200, response.text
    cut_project = response.json()["project"]
    cut = structure(client, project["id"], entry_id)
    response = selection_edit(
        client,
        cut_project,
        entry_id,
        [6, 7, 8, 9],
        {"operation": "residue.mutate", "target_name": "ALA"},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    after = structure(client, project["id"], entry_id)
    assert after["metadata"]["neistra_modeling"]["excluded_bonds"] == [list(pair)]
    assert all({b["atom_1_id"], b["atom_2_id"]} != set(pair) for b in after["bonds"])
    assert all(b in after["bonds"] for b in cut["bonds"])
    warnings = [
        w for w in result["warnings"] if w["code"] == "protein_retained_connectivity_unresolved"
    ]
    assert len(warnings) == 1
    assert all(f"atom {i} (" in warnings[0]["message"] for i in pair)
    assert warnings[0] in after["warnings"]
    assert result["project"]["revision"] == cut_project["revision"] + 1

    undone = client.post(
        f"{path}/history/undo",
        json={
            "expected_revision": result["project"]["revision"],
        },
    )
    assert undone.status_code == 200, undone.text
    assert structure(client, project["id"], entry_id) == cut
    redone = client.post(
        f"{path}/history/redo",
        json={
            "expected_revision": undone.json()["revision"],
        },
    )
    assert redone.status_code == 200, redone.text
    reloaded = client.get(path).json()
    assert reloaded["revision"] == redone.json()["revision"]
    assert structure(client, reloaded["id"], entry_id) == after
    assert client.get(f"{path}/entries/{entry_id}/original").content == original_bytes

    artifact = export_archive(client, project["id"], "retained-topology")
    restored = import_archive(client, client.get(artifact["artifact"]["download_url"]).content)[
        "project"
    ]
    restored_entry = restored["entries"][0]["id"]
    assert structure(client, restored["id"], restored_entry) == after
    assert (
        client.get(f"/api/v1/projects/{restored['id']}/entries/{restored_entry}/original").content
        == original_bytes
    )


@pytest.mark.parametrize("atom_id,element", [(6, "C"), (7, "P"), (8, "N"), (9, "S")])
def test_wrong_backbone_element_refusal_preserves_revision_artifact_history_and_floors(
    client: ApiClient,
    atom_id: int,
    element: str,
) -> None:
    project, entry_id = project_with_protein(client)
    response = model_edit(
        client,
        project,
        entry_id,
        [atom_id],
        {"operation": "atom.element", "element": element},
        hydrogen_policy="automatic",
    )
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    path = f"/api/v1/projects/{project['id']}"
    before_project = client.get(path).json()
    before = structure(client, project["id"], entry_id)
    response = selection_edit(
        client,
        project,
        entry_id,
        [6, 7, 8, 9],
        {"operation": "residue.mutate", "target_name": "ALA"},
    )
    assert response.status_code == 422, response.text
    assert f"atom {atom_id} (" in response.text and f"current element is {element}" in response.text
    assert client.get(path).json() == before_project
    assert structure(client, project["id"], entry_id) == before


def test_inactive_geometry_diagnostics_are_durable_and_exactly_undoable(client: ApiClient) -> None:
    before = frames([0.2, 1.4], active=2)
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}"
    original_bytes = client.get(f"{path}/entries/{entry_id}/original").content
    response = model_edit(
        client,
        project,
        entry_id,
        [10],
        {"operation": "atom.charge.set", "charge": 1},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    detail = next(w for w in result["warnings"] if w["code"] == "model_bond_geometry")
    assert "Conformer 1, bond 91 (atoms 10, 20)" in detail["message"]
    after = structure(client, project["id"], entry_id)
    assert detail in after["warnings"]
    assert after["conformers"] == before.model_dump(mode="json")["conformers"]
    undone = client.post(
        f"{path}/history/undo",
        json={
            "expected_revision": result["project"]["revision"],
        },
    )
    assert undone.status_code == 200, undone.text
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    redone = client.post(
        f"{path}/history/redo",
        json={
            "expected_revision": undone.json()["revision"],
        },
    )
    assert redone.status_code == 200, redone.text
    assert structure(client, project["id"], entry_id) == after
    assert client.get(f"{path}/entries/{entry_id}/original").content == original_bytes


@pytest.mark.parametrize("source", ["ARG", "GLN", "GLU", "LYS"])
def test_new_retained_proline_closure_and_inverse_conflict_have_exact_history(
    client: ApiClient,
    source: str,
) -> None:
    project, entry_id = project_with_protein(client)
    path = f"/api/v1/projects/{project['id']}"
    original_bytes = client.get(f"{path}/entries/{entry_id}/original").content
    response = selection_edit(
        client,
        project,
        entry_id,
        [6, 7, 8, 9],
        {"operation": "residue.mutate", "target_name": source},
    )
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    before = structure(client, project["id"], entry_id)
    selected = [a["id"] for a in before["atoms"] if a["residue_id"] == 2]
    response = selection_edit(
        client,
        project,
        entry_id,
        selected,
        {"operation": "residue.mutate", "target_name": "PRO"},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    after = structure(client, project["id"], entry_id)
    assert result["report"]["created_atom_ids"] == []
    assert len(result["report"]["created_bond_ids"]) == 1
    assert any(w["code"] == "protein_retained_proline_closure" for w in result["warnings"])
    before_atoms = {a["id"]: a for a in before["atoms"]}
    assert all(a == before_atoms[a["id"]] for a in after["atoms"])
    undone = client.post(
        f"{path}/history/undo",
        json={
            "expected_revision": result["project"]["revision"],
        },
    )
    assert undone.status_code == 200, undone.text
    assert structure(client, project["id"], entry_id) == before
    redone = client.post(
        f"{path}/history/redo",
        json={
            "expected_revision": undone.json()["revision"],
        },
    )
    assert redone.status_code == 200, redone.text
    assert structure(client, project["id"], entry_id) == after

    selected = [a["id"] for a in after["atoms"] if a["residue_id"] == 2]
    response = selection_edit(
        client,
        redone.json(),
        entry_id,
        selected,
        {"operation": "residue.mutate", "target_name": source},
    )
    assert response.status_code == 200, response.text
    inverse = response.json()
    assert any(w["code"] == "protein_target_topology_conflict" for w in inverse["warnings"])
    inverse_structure = structure(client, project["id"], entry_id)
    after_atoms = {a["id"]: a for a in after["atoms"]}
    assert all(
        a == after_atoms[a["id"]] for a in inverse_structure["atoms"] if a["id"] in after_atoms
    )
    closure_id = result["report"]["created_bond_ids"][0]
    closure = next(b for b in after["bonds"] if b["id"] == closure_id)
    assert closure in inverse_structure["bonds"]
    undone = client.post(
        f"{path}/history/undo",
        json={
            "expected_revision": inverse["project"]["revision"],
        },
    )
    assert undone.status_code == 200, undone.text
    assert structure(client, project["id"], entry_id) == after
    assert client.get(f"{path}/entries/{entry_id}/original").content == original_bytes
