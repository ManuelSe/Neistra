from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest
from molweave_api.models import CommandRecord, StructureEntry
from sqlalchemy import select

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.integration.test_molecule_creation import create
from tests.integration.test_selection_edits import edit as helper_edit
from tests.integration.test_selection_edits import project_with_ligand, selection
from tests.support.api_client import ApiClient


def counters(client: ApiClient, entry_id: str) -> tuple[int, int]:
    with client.app.state.session_factory() as session:
        entry = session.get(StructureEntry, entry_id)
        assert entry is not None
        return entry.next_atom_id, entry.next_bond_id


def history(client: ApiClient, project: dict[str, Any], direction: str) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/projects/{project['id']}/history/{direction}",
        json={"expected_revision": project["revision"]},
    )
    assert response.status_code == 200, response.text
    return dict(response.json())


@pytest.mark.parametrize("generated", [False, True])
def test_entry_recreation_and_branching_keep_atom_and_bond_allocation_floors(
    client: ApiClient, generated: bool
) -> None:
    if generated:
        result = create(client)
        project, entry_id = result["project"], result["entry_id"]
    else:
        project, entry_id = project_with_ligand(client)
    initial = structure(client, project["id"], entry_id)
    old_atoms, old_bonds = [], []
    for element in ["N", "P"]:
        response = edit(
            client, project, entry_id, [1], {"operation": "atom.add", "element": element}
        )
        assert response.status_code == 200, response.text
        result = response.json()
        project = result["project"]
        old_atoms.extend(result["report"]["created_atom_ids"])
        old_bonds.extend(result["report"]["created_bond_ids"])
    for _ in range(3):
        project = history(client, project, "undo")
    assert project["entries"] == []
    project = history(client, project, "redo")
    assert structure(client, project["id"], entry_id) == initial
    response = edit(client, project, entry_id, [1], {"operation": "atom.add", "element": "O"})
    assert response.status_code == 200, response.text
    result = response.json()
    assert min(result["report"]["created_atom_ids"]) > max(old_atoms)
    assert min(result["report"]["created_bond_ids"]) > max(old_bonds)
    project = result["project"]
    after = structure(client, project["id"], entry_id)
    expected_floor = counters(client, entry_id)
    archive = export_archive(client, project["id"], "recreated-identity-floor")
    restored = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    assert structure(client, restored["id"], restored["entries"][0]["id"]) == after
    assert counters(client, restored["entries"][0]["id"]) == expected_floor
    project = history(client, project, "undo")
    assert structure(client, project["id"], entry_id) == initial
    project = history(client, project, "redo")
    assert structure(client, project["id"], entry_id) == after


def test_legacy_helper_allocation_survives_import_undo_redo_and_branching(
    client: ApiClient,
) -> None:
    project, entry_id = project_with_ligand(client)
    response = helper_edit(client, project, entry_id, [1], {"operation": "hydrogens.prepare"})
    assert response.status_code == 200, response.text
    result = response.json()
    old_atoms = result["report"]["created_atom_ids"]
    old_bonds = result["report"]["created_bond_ids"]
    assert old_atoms and old_bonds
    project = result["project"]
    for direction in ["undo", "undo", "redo"]:
        project = history(client, project, direction)
    response = helper_edit(client, project, entry_id, [1], {"operation": "hydrogens.prepare"})
    assert response.status_code == 200, response.text
    assert min(response.json()["report"]["created_atom_ids"]) > max(old_atoms)
    assert min(response.json()["report"]["created_bond_ids"]) > max(old_bonds)


@pytest.mark.parametrize("allocate", [False, True])
def test_retained_older_low_floor_is_recovered_without_preview_or_refusal_writes(
    client: ApiClient, allocate: bool
) -> None:
    result = create(client)
    project, entry_id = result["project"], result["entry_id"]
    result = edit(client, project, entry_id, [1], {"operation": "atom.add", "element": "N"}).json()
    old_atom = result["report"]["created_atom_ids"][0]
    old_bond = result["report"]["created_bond_ids"][0]
    project = history(client, result["project"], "undo")
    # Model the preceding service's stale recreation counters, keeping its real
    # retained forward molecular action as evidence of the earlier allocations.
    with client.app.state.session_factory() as session:
        entry = session.get(StructureEntry, entry_id)
        assert entry is not None
        entry.next_atom_id, entry.next_bond_id = 2, 1
        for command in session.scalars(select(CommandRecord)):
            actions = deepcopy(command.forward_actions)
            for action in actions:
                if action["kind"] == "entry.create" and action["entry"]["id"] == entry_id:
                    action["entry"].update(next_atom_id=2, next_bond_id=1)
            command.forward_actions = actions
        session.commit()
    path = f"/api/v1/projects/{project['id']}"
    baseline = client.get(path).json()
    payload = {
        "expected_revision": project["revision"],
        "expected_artifact_id": baseline["entries"][0]["current_artifact_id"],
        "selection": selection(entry_id, [1]),
        "action": {"operation": "atom.add", "element": "O"},
    }
    preview = client.post(f"{path}/entries/{entry_id}/model-edits/preview", json=payload)
    assert preview.status_code == 200, preview.text
    assert client.get(path).json() == baseline
    assert counters(client, entry_id) == (2, 1)
    refusal = edit(client, project, entry_id, [1, 1], {"operation": "bond.set", "order": 1})
    assert refusal.status_code == 422
    assert client.get(path).json() == baseline
    assert counters(client, entry_id) == (2, 1)
    action = (
        {"operation": "atom.add", "element": "O"}
        if allocate
        else {"operation": "atom.element", "element": "O"}
    )
    response = edit(client, project, entry_id, [1], action)
    assert response.status_code == 200, response.text
    result = response.json()
    if not allocate:
        response = edit(
            client, result["project"], entry_id, [1], {"operation": "atom.add", "element": "P"}
        )
        assert response.status_code == 200, response.text
        result = response.json()
    assert min(result["report"]["created_atom_ids"]) > old_atom
    assert min(result["report"]["created_bond_ids"]) > old_bond
