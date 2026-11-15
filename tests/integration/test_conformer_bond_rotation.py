from __future__ import annotations

import pytest

from tests.integration.test_archive_roundtrip import import_archive
from tests.integration.test_ligand_edits import edit, structure
from tests.scientific.test_conformer_bond_rotation import conformer_ligand
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture


@pytest.mark.parametrize("moving", [[10, 20], [30, 40]])
def test_multiconformer_legacy_rotation_preserves_original_and_exact_history(
    client: ApiClient,
    moving: list[int],
) -> None:
    before = conformer_ligand()
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry_id}/original").content
    result = edit(
        client,
        project,
        entry_id,
        {
            "operation": "bond.rotate",
            "bond_id": 71,
            "movable_atom_ids": moving,
            "angle_degrees": 60,
        },
    )
    assert result["report"]["created_atom_ids"] == []
    assert result["report"]["created_bond_ids"] == []
    assert result["report"]["changed_atom_ids"] == moving
    after = structure(client, project["id"], entry_id)
    for old, new in zip(before.conformers, after["conformers"], strict=True):
        for index in [1, 2, 4]:
            assert new["coordinates"][index] == list(old.coordinates[index])
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
    assert client.get(f"{path}/entries/{entry_id}/original").content == original
