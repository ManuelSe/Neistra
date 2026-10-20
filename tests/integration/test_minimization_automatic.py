from __future__ import annotations

import os

import pytest

from tests.integration.test_coordinate_commands import _structure
from tests.integration.test_job_lifecycle import _worker
from tests.integration.test_minimization_apply import seeded_project
from tests.integration.test_minimization_jobs import minclient as minclient
from tests.support.minimization import molecule, peptide, translated


def submit(client, project, entry, **extra):
    return client.post(
        f"/api/v1/projects/{project['id']}/minimizations",
        json={
            "expected_revision": project["revision"],
            "mode": "automatic",
            "selection": {"atoms": [{"structure_id": entry["id"], "atom_id": 3}]},
            **extra,
        },
    )


def test_server_captures_hidden_complete_context_and_excludes_distant_entries(minclient):
    project = seeded_project(
        minclient,
        peptide(),
        translated(molecule(), (2, 4, 3.5)),
        translated(molecule(), (100, 0, 0)),
    )
    protein = next(e for e in project["entries"] if e["structure_type"] == "protein")
    ligands = sorted(
        (e for e in project["entries"] if e["structure_type"] == "ligand"),
        key=lambda e: _structure(minclient, project["id"], e["id"])["atoms"][0]["coordinates"][0],
    )
    ligand, remote = ligands
    project = minclient.post(
        f"/api/v1/projects/{project['id']}/entries/{protein['id']}/visibility",
        json={"expected_revision": project["revision"], "value": False},
    ).json()
    response = submit(minclient, project, ligand)
    assert response.status_code == 201, response.text
    params = response.json()["parameters"]
    assert params["schema_version"] == 2 and params["context_policy"] == "automatic"
    assert params["mode"] == "environment"
    assert {c["entry_id"]: c["atom_ids"] for c in params["captured_inputs"]} == {
        protein["id"]: protein["atom_ids"],
        ligand["id"]: ligand["atom_ids"],
    }
    assert remote["id"] not in {c["entry_id"] for c in params["captured_inputs"]}
    assert params["selection"]["atoms"] == [{"structure_id": ligand["id"], "atom_id": 3}]
    assert submit(minclient, project, ligand, conformers={ligand["id"]: 1}).status_code == 422


@pytest.mark.skipif(
    not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"), reason="Locked native model required"
)
def test_auto_native_result_refuses_newly_nearby_omitted_context(minclient):
    project = seeded_project(minclient, molecule(), translated(molecule(), (100, 0, 0)))
    moving, distant = project["entries"]
    before = _structure(minclient, project["id"], moving["id"])
    response = submit(minclient, project, moving)
    assert response.status_code == 201, response.text
    job = response.json()
    assert job["parameters"]["mode"] == "isolated"
    assert _worker(minclient).run_once()
    path = f"/api/v1/projects/{project['id']}/minimizations/{job['id']}"
    proposal = minclient.get(path + "/proposal").json()
    assert proposal["applicable"], proposal
    changed = minclient.post(
        f"/api/v1/projects/{project['id']}/entries/{distant['id']}/transform",
        json={
            "expected_revision": project["revision"],
            "scope": "structure",
            "entry_id": distant["id"],
            "translation": [-95, 0, 0],
            "rotation_degrees": [0, 0, 0],
            "pivot_mode": "structure_centroid",
        },
    )
    assert changed.status_code == 200, changed.text
    proposal = minclient.get(path + "/proposal").json()
    assert not proposal["applicable"] and "omitted context" in proposal["unavailable_reason"]
    result = minclient.post(
        path + "/apply",
        json={
            "expected_revision": changed.json()["revision"],
            "proposal_sha256": proposal["proposal_sha256"],
        },
    )
    assert result.status_code == 409
    assert _structure(minclient, project["id"], moving["id"]) == before


@pytest.mark.skipif(
    not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"), reason="Locked native model required"
)
def test_required_unsupported_neighbor_blocks_whole_automatic_calculation(minclient):
    project = seeded_project(minclient, molecule(), translated(molecule("[Cl-]"), (5, 0, 0)))
    job = submit(minclient, project, project["entries"][0]).json()
    assert len(job["parameters"]["captured_inputs"]) == 2
    assert _worker(minclient).run_once()
    proposal = minclient.get(
        f"/api/v1/projects/{project['id']}/minimizations/{job['id']}/proposal"
    ).json()
    assert proposal["report"]["outcome"] == "blocked"
    assert "unsupported_element" in proposal["report"]["reason"]
    assert not proposal["entries"] and not proposal["applicable"]
