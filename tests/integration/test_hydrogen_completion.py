from tests.integration.test_archive_roundtrip import import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture
from tests.support.hydrogen_fixture import model


def test_optional_completion_is_one_command_with_originals_and_exact_undo(
    client: ApiClient,
) -> None:
    before = model("CC(C)C(=O)Nc1ccc(O)cc1", remove_h_on={1})
    # An explicit assignment, rather than a no-op, triggers post-edit completion.
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": None}) if a.id == 1 else a
                for a in before.atoms
            ]
        }
    )
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry_id}/original").content
    response = edit(
        client,
        project,
        entry_id,
        [1],
        {"operation": "atom.charge.set", "charge": 0},
        hydrogen_policy="complete_if_possible",
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["applied"] is True
    assert result["hydrogen_report"]["added_hydrogen_count"] == 3
    after = structure(client, project["id"], entry_id)
    assert result["project"]["revision"] == project["revision"] + 1
    assert [a["coordinates"] for a in after["atoms"][: len(before.atoms)]] == [
        list(a.coordinates) for a in before.atoms
    ]
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": result["project"]["revision"]}
    ).json()
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    client.post(f"{path}/history/redo", json={"expected_revision": undone["revision"]})
    assert structure(client, project["id"], entry_id) == after
    assert client.get(f"{path}/entries/{entry_id}/original").content == original
