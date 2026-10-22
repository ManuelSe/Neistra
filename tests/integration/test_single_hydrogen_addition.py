import pytest

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture
from tests.support.hydrogen_fixture import model


@pytest.mark.parametrize(
    "smiles,parent,charge", [("N", 1, 1), ("O", 1, 1), ("CSC", 2, 1), ("[SH-]", 1, 0)]
)
def test_single_hydrogen_atomic_history_originals_and_archives(
    client: ApiClient, smiles: str, parent: int, charge: int
) -> None:
    before = model(smiles)
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry['id']}/original").content
    response = edit(client, project, entry["id"], [parent], {"operation": "hydrogens.add_one"})
    assert response.status_code == 200, response.text
    current = response.json()["project"]
    after = structure(client, project["id"], entry["id"])
    assert next(a["formal_charge"] for a in after["atoms"] if a["id"] == parent) == charge
    assert len(after["atoms"]) == len(before.atoms) + 1
    assert response.json()["selection_after"]["atoms"] == [
        {"structure_id": entry["id"], "atom_id": parent}
    ]
    assert current["revision"] == project["revision"] + 1
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": current["revision"]}
    ).json()
    assert structure(client, project["id"], entry["id"]) == before.model_dump(mode="json")
    # Invalid input cannot clear Redo, advance revisions or allocate IDs.
    rejected = edit(
        client, undone, entry["id"], [parent], {"operation": "hydrogens.add_one", "count": 2}
    )
    assert rejected.status_code == 422
    assert client.get(path).json()["revision"] == undone["revision"]
    redone = client.post(
        f"{path}/history/redo", json={"expected_revision": undone["revision"]}
    ).json()
    assert structure(client, project["id"], entry["id"]) == after
    saturated = edit(client, redone, entry["id"], [parent], {"operation": "hydrogens.add_one"})
    if smiles != "[SH-]":
        assert saturated.status_code == 422
        assert client.get(path).json()["revision"] == redone["revision"]
    assert client.get(f"{path}/entries/{entry['id']}/original").content == original
    if smiles == "[SH-]":
        after = structure(client, project["id"], entry["id"])
    archive = export_archive(client, project["id"], "single-h")
    restored = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    assert structure(client, restored["id"], restored["entries"][0]["id"]) == after


@pytest.mark.parametrize("smiles,remove", [("NC(F)Cl", {2}), ("CN(CC)CCC", set())])
def test_single_hydrogen_stereo_refusal_preserves_every_persisted_boundary(
    client: ApiClient, smiles: str, remove: set[int]
) -> None:
    from molweave_api.models import Artifact, CommandRecord
    from molweave_core.molecular import Conformer
    from sqlalchemy import func, select

    from tests.integration.test_viewer_state import apply_style, selection
    from tests.support.modeling_reader_qualification import allocation_counters

    before = model(smiles, remove_h_on=remove)
    mirror = [(x, y, -z) for x, y, z in before.active_coordinates]
    before = before.model_copy(
        update={
            "conformers": [*before.conformers, Conformer(id=9, name="Mirror", coordinates=mirror)]
        }
    )
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry['id']}/original").content
    styled = apply_style(client, project, selection(entry["id"], 2), "stick")
    assert styled.status_code == 200
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": styled.json()["revision"]}
    )
    assert undone.status_code == 200
    project = undone.json()
    assert project["history"]["can_redo"]
    counters = allocation_counters(client, project)
    snapshot = client.get(path).json()

    def stored_counts() -> tuple[int, int]:
        with client.app.state.session_factory() as session:
            return (
                session.execute(select(func.count()).select_from(Artifact)).scalar_one(),
                session.execute(select(func.count()).select_from(CommandRecord)).scalar_one(),
            )

    counts = stored_counts()
    rejected = edit(client, project, entry["id"], [2], {"operation": "hydrogens.add_one"})
    assert rejected.status_code == 422
    assert "stereo" in rejected.json()["detail"]["message"]
    assert client.get(path).json() == snapshot
    assert structure(client, project["id"], entry["id"]) == before.model_dump(mode="json")
    assert allocation_counters(client, project) == counters
    assert stored_counts() == counts
    assert client.get(f"{path}/entries/{entry['id']}/original").content == original
