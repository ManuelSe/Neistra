from __future__ import annotations

from typing import Any

import pytest

from tests.integration.test_archive_roundtrip import import_archive
from tests.integration.test_ligand_edits import structure
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import FIXTURE, build_fixture


def project_with_ligand(client: ApiClient) -> tuple[dict[str, Any], str]:
    project = client.post("/api/v1/projects", json={"name": "Prepared editing"}).json()
    imported = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0},
        files={
            "files": (
                "ethanol-3d.mol",
                (FIXTURE.parent / "ethanol-3d.mol").read_bytes(),
                "chemical/x-mdl-molfile",
            )
        },
    )
    assert imported.status_code == 201, imported.text
    project = imported.json()["project"]
    return project, project["entries"][0]["id"]


def selection(entry_id: str, ids: list[int]) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "atoms": [{"structure_id": entry_id, "atom_id": i} for i in ids],
        "granularity": "atom",
        "source": "viewer",
    }


def edit(
    client: ApiClient,
    project: dict[str, Any],
    entry_id: str,
    ids: list[int],
    action: dict[str, Any],
):  # type: ignore[no-untyped-def]
    entry = next(e for e in project["entries"] if e["id"] == entry_id)
    return client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/selection-edits",
        json={
            "expected_revision": project["revision"],
            "expected_artifact_id": entry["current_artifact_id"],
            "selection": selection(entry_id, ids),
            "action": action,
        },
    )


@pytest.mark.parametrize("complex_entry", [False, True])
def test_atomic_prepare_substitute_undo_redo_and_original(
    client: ApiClient, complex_entry: bool
) -> None:
    if complex_entry:
        assert build_fixture() == FIXTURE.read_bytes()
        project = import_archive(client, FIXTURE.read_bytes())["project"]
        entry_id = project["entries"][0]["id"]
    else:
        project, entry_id = project_with_ligand(client)
    before = structure(client, project["id"], entry_id)
    target = next(
        a["id"] for a in before["atoms"] if a["element"] == "C" and a["formal_charge"] == 0
    )
    original = client.get(f"/api/v1/projects/{project['id']}/entries/{entry_id}/original").content
    prepared = edit(client, project, entry_id, [target], {"operation": "hydrogens.prepare"})
    assert prepared.status_code == 200, prepared.text
    first = prepared.json()
    assert first["project"]["revision"] == project["revision"] + 1
    prepared_structure = structure(client, project["id"], entry_id)
    assert all(a in prepared_structure["atoms"] for a in before["atoms"])
    h = next(
        a["id"]
        for a in prepared_structure["atoms"]
        if a["element"] == "H"
        and any(
            {b["atom_1_id"], b["atom_2_id"]} == {a["id"], target}
            for b in prepared_structure["bonds"]
        )
    )
    replaced = edit(
        client, first["project"], entry_id, [h], {"operation": "atom.element", "element": "C"}
    )
    assert replaced.status_code == 200, replaced.text
    result = replaced.json()
    assert result["replacements"][str(h)] in result["report"]["created_atom_ids"]
    assert result["project"]["revision"] == first["project"]["revision"] + 1
    after = structure(client, project["id"], entry_id)
    undo = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": result["project"]["revision"]},
    ).json()
    assert structure(client, project["id"], entry_id) == prepared_structure
    redo = client.post(
        f"/api/v1/projects/{project['id']}/history/redo",
        json={"expected_revision": undo["revision"]},
    ).json()
    assert structure(client, project["id"], entry_id) == after
    assert (
        client.get(f"/api/v1/projects/{project['id']}/entries/{entry_id}/original").content
        == original
    )
    assert redo["revision"] == undo["revision"] + 1


def test_refusals_leave_revision_artifact_and_allocator_unchanged(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    for ids, action in [
        ([], {"operation": "atom.delete"}),
        ([1, 2], {"operation": "atom.element", "element": "N"}),
        ([1], {"operation": "atom.element", "element": "C"}),
    ]:
        response = edit(client, project, entry_id, ids, action)
        assert response.status_code == 422, response.text
        assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline


@pytest.mark.parametrize(
    "fragment", ["methyl", "ethyl", "hydroxyl", "amino", "carboxylic_acid", "phenyl"]
)
def test_fragment_actions_publish_one_complete_reversible_command(
    client: ApiClient, fragment: str
) -> None:
    project, entry_id = project_with_ligand(client)
    first = edit(client, project, entry_id, [1], {"operation": "hydrogens.prepare"}).json()
    before = structure(client, project["id"], entry_id)
    h = next(
        a["id"]
        for a in before["atoms"]
        if a["element"] == "H"
        and any({b["atom_1_id"], b["atom_2_id"]} == {a["id"], 1} for b in before["bonds"])
    )
    response = edit(
        client,
        first["project"],
        entry_id,
        [h],
        {"operation": "fragment.replace", "fragment": fragment},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["project"]["revision"] == first["project"]["revision"] + 1
    after = structure(client, project["id"], entry_id)
    assert h not in {a["id"] for a in after["atoms"]}
    assert after["inferences"][-1]["bond_ids"] == result["report"]["created_bond_ids"]
    undone = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": result["project"]["revision"]},
    )
    assert undone.status_code == 200
    assert structure(client, project["id"], entry_id) == before
