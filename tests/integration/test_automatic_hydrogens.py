import pytest

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_hydrogen_completion import preview
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture
from tests.support.hydrogen_fixture import model


@pytest.mark.parametrize(
    "action,ids",
    [
        ({"operation": "atom.delete"}, [1]),
        ({"operation": "atom.element", "element": "N"}, [1]),
        ({"operation": "atom.charge.set", "charge": 1}, [3]),
        ({"operation": "atom.add", "element": "N"}, [1]),
        ({"operation": "fragment.attach", "fragment": "ethyl"}, [1]),
    ],
)
def test_automatic_hydrogen_atomic_history_archive_and_original(
    client: ApiClient, action: dict, ids: list[int]
) -> None:
    before = model("CC.O")
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry['id']}/original").content
    if action["operation"] in {"atom.add", "fragment.attach"}:
        inspected = preview(client, project, entry["id"], ids, action, hydrogen_policy="automatic")
        assert inspected.status_code == 200, inspected.text
        assert client.get(path).json()["revision"] == project["revision"]
        assert structure(client, project["id"], entry["id"]) == before.model_dump(mode="json")
    response = edit(client, project, entry["id"], ids, action, hydrogen_policy="automatic")
    assert response.status_code == 200, response.text
    assert response.json()["hydrogen_reconciliation_report"]["policy"] == "automatic"
    current = response.json()["project"]
    assert current["revision"] == project["revision"] + 1
    after = structure(client, project["id"], entry["id"])
    if action["operation"] == "atom.delete":
        removed = {1, *[b.atom_2_id for b in before.bonds if b.atom_1_id == 1 and b.atom_2_id > 3]}
        assert not removed & {a["id"] for a in after["atoms"]}
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": current["revision"]}
    ).json()
    assert structure(client, project["id"], entry["id"]) == before.model_dump(mode="json")
    redone = client.post(
        f"{path}/history/redo", json={"expected_revision": undone["revision"]}
    ).json()
    assert structure(client, project["id"], entry["id"]) == after
    assert redone["revision"] == current["revision"] + 2
    assert client.get(f"{path}/entries/{entry['id']}/original").content == original
    archive = export_archive(client, project["id"], "automatic-h")
    restored = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    assert structure(client, restored["id"], restored["entries"][0]["id"]) == after


def test_automatic_hydrogen_unknown_direct_edit_and_stale_guards(client: ApiClient) -> None:
    before = model("C")
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    response = edit(
        client,
        project,
        entry["id"],
        [1],
        {"operation": "atom.element", "element": "P"},
        hydrogen_policy="automatic",
    )
    assert response.status_code == 200, response.text
    assert response.json()["hydrogen_reconciliation_report"]["status"] == "unresolved"
    after = structure(client, project["id"], entry["id"])
    assert len(after["atoms"]) == len(before.atoms)
    assert after["atoms"][0]["element"] == "P"
    stale = edit(
        client, project, entry["id"], [1], {"operation": "atom.delete"}, hydrogen_policy="automatic"
    )
    assert stale.status_code == 409
    assert structure(client, project["id"], entry["id"]) == after
