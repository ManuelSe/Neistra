from __future__ import annotations

from tests.integration.test_coordinate_commands import _structure
from tests.integration.test_job_lifecycle import _worker
from tests.integration.test_minimization_apply import seeded_project
from tests.support.api_client import ApiClient
from tests.support.minimization import molecule


def calculate(client, project, atom_ids, **options):
    entry = project["entries"][0]
    response = client.post(
        f"/api/v1/projects/{project['id']}/quick-minimizations",
        json={
            "expected_revision": project["revision"],
            "selection": {"atoms": [{"structure_id": entry["id"], "atom_id": i} for i in atom_ids]},
            **options,
        },
    )
    assert response.status_code == 201, response.text
    job = response.json()
    assert _worker(client).run_once()
    response = client.get(
        f"/api/v1/projects/{project['id']}/quick-minimizations/{job['id']}/proposal"
    )
    assert response.status_code == 200, response.text
    return job, response.json()


def test_quick_apply_preserves_chemistry_originals_and_exact_undo_redo(client: ApiClient):
    project = seeded_project(client, molecule())
    entry = project["entries"][0]
    before = _structure(client, project["id"], entry["id"])
    original = client.get(
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original"
    ).content
    job, proposal = calculate(client, project, [3])
    assert proposal["applicable"], proposal
    assert _structure(client, project["id"], entry["id"]) == before
    url = f"/api/v1/projects/{project['id']}/quick-minimizations/{job['id']}/apply"
    payload = {
        "expected_revision": project["revision"],
        "proposal_sha256": proposal["proposal_sha256"],
    }
    response = client.post(url, json=payload)
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["revision"] == project["revision"] + 1
    after = _structure(client, project["id"], entry["id"])
    assert before["bonds"] == after["bonds"]
    assert before["metadata"] == after["metadata"] and before["source"] == after["source"]
    for a, b in zip(before["atoms"], after["atoms"], strict=True):
        assert {k: v for k, v in a.items() if k != "coordinates"} == {
            k: v for k, v in b.items() if k != "coordinates"
        }
        if a["id"] not in [3, 9]:
            assert a == b
    assert (
        client.get(f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original").content
        == original
    )
    assert (
        client.post(url, json={**payload, "expected_revision": updated["revision"]}).status_code
        == 409
    )
    undone = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": updated["revision"]},
    ).json()
    assert _structure(client, project["id"], entry["id"]) == before
    assert (
        client.post(url, json={**payload, "expected_revision": undone["revision"]}).status_code
        == 409
    )
    response = client.post(
        f"/api/v1/projects/{project['id']}/history/redo",
        json={"expected_revision": undone["revision"]},
    )
    assert response.status_code == 200
    assert _structure(client, project["id"], entry["id"]) == after


def test_quick_stale_revision_empty_selection_and_generic_submission_refuse(client: ApiClient):
    project = seeded_project(client, molecule())
    response = client.post(
        f"/api/v1/projects/{project['id']}/quick-minimizations",
        json={
            "expected_revision": project["revision"],
            "selection": {"atoms": []},
        },
    )
    assert response.status_code == 422
    job, proposal = calculate(client, project, [3])
    response = client.post(
        f"/api/v1/projects/{project['id']}/quick-minimizations/{job['id']}/apply",
        json={
            "expected_revision": project["revision"] - 1,
            "proposal_sha256": proposal["proposal_sha256"],
        },
    )
    assert response.status_code == 409


def test_raw_debug_upload_preserves_graph_after_real_quick_publication(client: ApiClient):
    from pathlib import Path

    path = Path(__file__).parents[1] / "fixtures/quick-minimization/paracetamol.pdb"
    project = client.post("/api/v1/projects", json={"name": "Raw quick input"}).json()
    response = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0},
        files=[("files", (path.name, path.read_bytes(), "chemical/x-pdb"))],
    )
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    entry = project["entries"][0]
    before = _structure(client, project["id"], entry["id"])
    job, proposal = calculate(client, project, entry["atom_ids"])
    assert proposal["applicable"], proposal
    assert proposal["report"]["method"] == "MMFF94"
    response = client.post(
        f"/api/v1/projects/{project['id']}/quick-minimizations/{job['id']}/apply",
        json={
            "expected_revision": project["revision"],
            "proposal_sha256": proposal["proposal_sha256"],
        },
    )
    assert response.status_code == 200, response.text
    after = _structure(client, project["id"], entry["id"])
    assert before["bonds"] == after["bonds"]
    assert [a["formal_charge"] for a in before["atoms"]] == [
        a["formal_charge"] for a in after["atoms"]
    ]
    assert before["metadata"] == after["metadata"]
    assert (
        client.get(f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original").content
        == path.read_bytes()
    )
