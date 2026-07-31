from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"


def project_with_protein(
    client: ApiClient,
    filename: str = "protein_editing.pdb",
) -> tuple[dict[str, Any], str]:
    created = client.post("/api/v1/projects", json={"name": "Protein editing"})
    assert created.status_code == 201
    project = cast(dict[str, Any], created.json())
    imported = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0},
        files=[
            (
                "files",
                (
                    filename,
                    (FIXTURES / filename).read_bytes(),
                    "chemical/x-pdb",
                ),
            )
        ],
    )
    assert imported.status_code == 201, imported.text
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
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/protein-edits",
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


def test_mutation_and_hydrogens_are_durable_reversible_and_preserve_original(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_protein(client)
    original = structure(client, project["id"], entry_id)
    original_upload = client.get(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/original"
    ).content

    mutated = edit(
        client,
        project,
        entry_id,
        {
            "operation": "protein.residue.mutate",
            "residue_id": 1,
            "target_name": "VAL",
        },
    )
    assert mutated["report"]["created_atom_ids"] == [23, 24]
    assert mutated["report"]["changed_residue_ids"] == [1]
    assert {warning["code"] for warning in mutated["warnings"]} >= {
        "side_chain_not_optimized",
        "terminal_residue_mutation",
    }
    assert mutated["project"]["topology_patches"][0]["entry_id"] == entry_id
    current = structure(client, project["id"], entry_id)
    assert current["residues"][0]["name"] == "VAL"
    original_backbone = {
        atom["name"]: (atom["id"], atom["coordinates"])
        for atom in original["atoms"]
        if atom["residue_id"] == 1 and atom["name"] in {"N", "CA", "C", "O"}
    }
    current_backbone = {
        atom["name"]: (atom["id"], atom["coordinates"])
        for atom in current["atoms"]
        if atom["residue_id"] == 1 and atom["name"] in {"N", "CA", "C", "O"}
    }
    assert current_backbone == original_backbone

    undone_response = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": mutated["project"]["revision"]},
    )
    assert undone_response.status_code == 200
    undone = cast(dict[str, Any], undone_response.json())
    assert structure(client, project["id"], entry_id) == original

    added = edit(
        client,
        undone,
        entry_id,
        {"operation": "protein.hydrogen.add", "ph": 7.0},
    )
    assert added["report"]["created_atom_ids"]
    assert min(added["report"]["created_atom_ids"]) == 25
    assert {
        warning["code"] for warning in added["warnings"]
    } >= {"hydrogen_placement_ph_dependent", "terminal_hydrogen_placement"}
    removed = edit(
        client,
        added["project"],
        entry_id,
        {"operation": "protein.hydrogen.remove"},
    )
    assert set(removed["report"]["deleted_atom_ids"]) == set(
        added["report"]["created_atom_ids"]
    )
    assert client.get(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/original"
    ).content == original_upload


def test_metadata_component_and_hierarchy_edits_are_undoable(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_protein(client)
    renamed = edit(
        client,
        project,
        entry_id,
        {
            "operation": "protein.chain.rename",
            "chain_id": 1,
            "name": "X",
        },
    )
    assert renamed["report"]["changed_chain_ids"] == [1]
    renumbered = edit(
        client,
        renamed["project"],
        entry_id,
        {
            "operation": "protein.residue.renumber",
            "chain_id": 1,
            "start": 100,
            "step": 10,
        },
    )
    current = structure(client, project["id"], entry_id)
    assert current["chains"][0]["name"] == "X"
    assert [
        residue["author_number"]
        for residue in current["residues"]
        if residue["chain_id"] == 1
    ] == [100, 110, 120]

    water_removed = edit(
        client,
        renumbered["project"],
        entry_id,
        {"operation": "protein.water.delete"},
    )
    assert water_removed["report"]["deleted_atom_ids"] == [21]
    ion_removed = edit(
        client,
        water_removed["project"],
        entry_id,
        {"operation": "protein.ion.delete"},
    )
    assert ion_removed["report"]["deleted_atom_ids"] == [22]
    assert {
        residue["component_type"]
        for residue in structure(client, project["id"], entry_id)["residues"]
    }.isdisjoint({"water", "ion"})

    restored_response = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": ion_removed["project"]["revision"]},
    )
    assert restored_response.status_code == 200
    restored = structure(client, project["id"], entry_id)
    assert any(residue["component_type"] == "ion" for residue in restored["residues"])


def test_residue_deletion_reconciles_references_and_undo_restores_them(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_protein(client)
    selection = {
        "schema_version": 1,
        "atoms": [{"structure_id": entry_id, "atom_id": 7}],
        "granularity": "atom",
        "source": "inspector",
    }
    saved = client.post(
        f"/api/v1/projects/{project['id']}/selections",
        json={
            "expected_revision": project["revision"],
            "name": "Glycine alpha",
            "selection": selection,
        },
    ).json()
    deleted = edit(
        client,
        cast(dict[str, Any], saved),
        entry_id,
        {"operation": "protein.residue.delete", "residue_ids": [2]},
    )
    changed = deleted["project"]
    assert deleted["report"]["deleted_atom_ids"] == [6, 7, 8, 9]
    assert changed["saved_selections"][0]["atom_references"] == []
    warning = changed["saved_selections"][0]["warnings"][-1]
    assert warning["operation"] == "protein.residue.delete"

    restored_response = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": changed["revision"]},
    )
    assert restored_response.status_code == 200
    restored = restored_response.json()
    assert restored["saved_selections"][0]["atom_references"] == selection["atoms"]
    assert 7 in restored["entries"][0]["atom_ids"]


def test_template_failure_lock_and_wrong_entry_type_are_atomic(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_protein(
        client, "protein_models_altloc.pdb"
    )
    failed = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/protein-edits",
        json={
            "expected_revision": project["revision"],
            "operation": "protein.residue.mutate",
            "residue_id": 1,
            "target_name": "VAL",
        },
    )
    assert failed.status_code == 422
    assert "exactly one conformer" in failed.json()["detail"]["message"]
    assert client.get(f"/api/v1/projects/{project['id']}").json()["revision"] == 1

    locked = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/lock",
        json={"expected_revision": 1, "value": True},
    ).json()
    blocked = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/protein-edits",
        json={
            "expected_revision": locked["revision"],
            "operation": "protein.atom.delete",
            "atom_ids": [1],
        },
    )
    assert blocked.status_code == 422
    assert "Unlock" in blocked.json()["detail"]["message"]

    ligand_project_response = client.post(
        "/api/v1/projects", json={"name": "Wrong entry type"}
    )
    assert ligand_project_response.status_code == 201
    ligand_project = ligand_project_response.json()
    imported = client.post(
        f"/api/v1/projects/{ligand_project['id']}/imports",
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
    ).json()
    wrong = client.post(
        (
            f"/api/v1/projects/{ligand_project['id']}/entries/"
            f"{imported['imported_entry_ids'][0]}/protein-edits"
        ),
        json={
            "expected_revision": imported["project"]["revision"],
            "operation": "protein.atom.delete",
            "atom_ids": [1],
        },
    )
    assert wrong.status_code == 422
    assert "classified as protein or complex" in wrong.json()["detail"]["message"]
