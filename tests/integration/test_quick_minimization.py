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


def apply_quick(client, project, job, proposal):
    return client.post(
        f"/api/v1/projects/{project['id']}/quick-minimizations/{job['id']}/apply",
        json={
            "expected_revision": project["revision"],
            "proposal_sha256": proposal["proposal_sha256"],
        },
    )


def test_sparse_ids_active_conformer_and_exact_mask_are_coordinate_only(client: ApiClient):
    from molweave_core.molecular import Conformer

    source = molecule()
    coordinates = [(x + 1, y + 2, z + 3) for x, y, z in source.active_coordinates]
    source = source.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"id": a.id * 10 + 1, "coordinates": coordinates[i]})
                for i, a in enumerate(source.atoms)
            ],
            "bonds": [
                b.model_copy(
                    update={"atom_1_id": b.atom_1_id * 10 + 1, "atom_2_id": b.atom_2_id * 10 + 1}
                )
                for b in source.bonds
            ],
            "conformers": [
                source.conformers[0],
                Conformer(id=7, name="Active", coordinates=coordinates),
            ],
            "active_conformer_id": 7,
            "annotations": [],
            "metadata": {"retain": "this"},
        }
    )
    project = seeded_project(client, source)
    entry = project["entries"][0]
    before = _structure(client, project["id"], entry["id"])
    job, proposal = calculate(client, project, [31], expand_hydrogens=False)
    assert proposal["entries"][0]["atom_ids"] == [31]
    response = apply_quick(client, project, job, proposal)
    assert response.status_code == 200, response.text
    after = _structure(client, project["id"], entry["id"])
    assert after["conformers"][0] == before["conformers"][0]
    assert after["active_conformer_id"] == 7 and after["metadata"] == before["metadata"]
    for old, new in zip(before["atoms"], after["atoms"], strict=True):
        if old["id"] != 31:
            assert old == new


def test_visible_participation_ignores_hidden_unsupported_entry_but_can_include_it(
    client: ApiClient,
):
    from tests.support.minimization import translated

    project = seeded_project(client, molecule(), translated(molecule("[Fe]"), (3, 0, 0)))
    site = project["entries"][1]
    project = client.post(
        f"/api/v1/projects/{project['id']}/entries/{site['id']}/visibility",
        json={"expected_revision": project["revision"], "value": False},
    ).json()
    _, isolated = calculate(client, project, [3])
    assert isolated["report"]["coverage"] == "complete"
    assert site["id"] not in isolated["report"]["modeled_atoms"]
    job, explicit = calculate(
        client, project, [3], mode="environment", context_entry_ids=[site["id"]]
    )
    assert explicit["applicable"], explicit
    assert explicit["report"]["coverage"] == "approximate"
    assert site["id"] in explicit["report"]["modeled_atoms"]
    fixed = _structure(client, project["id"], site["id"])
    project = client.post(
        f"/api/v1/projects/{project['id']}/entries/{site['id']}/lock",
        json={"expected_revision": project["revision"], "value": True},
    ).json()
    assert apply_quick(client, project, job, explicit).status_code == 200
    assert _structure(client, project["id"], site["id"]) == fixed


def test_changed_and_newly_near_context_blocks_atomic_publication(client: ApiClient):
    from tests.support.minimization import translated

    project = seeded_project(client, molecule(), translated(molecule(), (50, 0, 0)))
    site = project["entries"][1]
    job, proposal = calculate(client, project, [3])
    assert site["id"] not in proposal["report"]["modeled_atoms"]
    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{site['id']}/transform",
        json={
            "expected_revision": project["revision"],
            "scope": "structure",
            "entry_id": site["id"],
            "translation": [-50, 0, 3],
            "rotation_degrees": [0, 0, 0],
            "pivot_mode": "structure_centroid",
        },
    )
    assert response.status_code == 200, response.text
    project = response.json()
    before = _structure(client, project["id"], project["entries"][0]["id"])
    response = apply_quick(client, project, job, proposal)
    assert response.status_code == 409 and "neighborhood changed" in response.text
    assert _structure(client, project["id"], project["entries"][0]["id"]) == before


def test_selection_lock_visibility_change_and_digest_refuse(client: ApiClient):
    project = seeded_project(client, molecule())
    job, proposal = calculate(client, project, [3])
    entry = project["entries"][0]
    project = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/lock",
        json={"expected_revision": project["revision"], "value": True},
    ).json()
    response = apply_quick(client, project, job, proposal)
    assert response.status_code == 409 and "Unlock" in response.text
    response = client.post(
        f"/api/v1/projects/{project['id']}/quick-minimizations",
        json={
            "expected_revision": project["revision"],
            "selection": {"atoms": [{"structure_id": entry["id"], "atom_id": 3}]},
        },
    )
    assert response.status_code == 422 and "Unlock" in response.text
    project = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/lock",
        json={"expected_revision": project["revision"], "value": False},
    ).json()
    assert (
        apply_quick(client, project, job, {**proposal, "proposal_sha256": "0" * 64}).status_code
        == 409
    )


def test_quick_noop_creates_no_history_and_archived_job_is_historical(client: ApiClient):
    from tests.integration.test_archive_roundtrip import export_archive, import_archive

    project = seeded_project(client, molecule("[Cl-]"))
    job, proposal = calculate(client, project, [1])
    assert proposal["report"]["outcome"] == "unchanged" and not proposal["applicable"]
    assert apply_quick(client, project, job, proposal).status_code == 409
    assert client.get(f"/api/v1/projects/{project['id']}").json()["revision"] == project["revision"]
    project = seeded_project(client, molecule())
    job, proposal = calculate(client, project, [3])
    response = apply_quick(client, project, job, proposal)
    assert response.status_code == 200, response.text
    project = response.json()
    exported = export_archive(client, project["id"], "quick-history")
    restored = import_archive(client, client.get(exported["artifact"]["download_url"]).content)[
        "project"
    ]
    jobs = client.get(f"/api/v1/projects/{restored['id']}/jobs").json()
    assert len(jobs) == 1 and jobs[0]["job_type"] == "coordinates.quick_minimize"
    response = client.get(
        f"/api/v1/projects/{restored['id']}/quick-minimizations/{jobs[0]['id']}/proposal"
    )
    assert response.status_code == 200, response.text
    assert (
        not response.json()["applicable"] and "historical" in response.json()["unavailable_reason"]
    )


def test_multi_entry_quick_publication_is_one_exact_atomic_undo(client: ApiClient):
    from tests.support.minimization import translated

    project = seeded_project(client, molecule(), translated(molecule(), (0, 0, 5)))
    before = {e["id"]: _structure(client, project["id"], e["id"]) for e in project["entries"]}
    response = client.post(
        f"/api/v1/projects/{project['id']}/quick-minimizations",
        json={
            "expected_revision": project["revision"],
            "selection": {
                "atoms": [
                    {"structure_id": e["id"], "atom_id": 3}
                    for e in sorted(project["entries"], key=lambda e: e["id"])
                ]
            },
        },
    )
    assert response.status_code == 201, response.text
    job = response.json()
    assert _worker(client).run_once()
    proposal = client.get(
        f"/api/v1/projects/{project['id']}/quick-minimizations/{job['id']}/proposal"
    ).json()
    assert proposal["applicable"], proposal
    assert len(proposal["entries"]) == 2
    applied = apply_quick(client, project, job, proposal)
    assert applied.status_code == 200, applied.text
    updated = applied.json()
    assert updated["revision"] == project["revision"] + 1
    assert len(updated["structure_patches"]) == 2
    assert updated["topology_patches"] == []
    response = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": updated["revision"]},
    )
    assert response.status_code == 200
    assert {
        e["id"]: _structure(client, project["id"], e["id"]) for e in project["entries"]
    } == before


def test_native_quick_cancellation_cannot_publish_a_late_result(client: ApiClient):
    import threading
    import time
    from pathlib import Path

    from molweave_core.adapters.defaults import create_default_registry

    path = Path(__file__).parents[1] / "fixtures/minimization/long-alkane.mol"
    source = (
        create_default_registry()
        .for_filename(path.name)
        .parse(path.read_bytes(), path.name)
        .structures[0]
    )
    project = seeded_project(client, source)
    entry = project["entries"][0]
    before = _structure(client, project["id"], entry["id"])
    response = client.post(
        f"/api/v1/projects/{project['id']}/quick-minimizations",
        json={
            "expected_revision": project["revision"],
            "max_iterations": 2000,
            "selection": {
                "atoms": [{"structure_id": entry["id"], "atom_id": a} for a in entry["atom_ids"]]
            },
        },
    )
    assert response.status_code == 201, response.text
    job = response.json()
    worker = threading.Thread(target=_worker(client).run_once)
    worker.start()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        current = client.get(f"/api/v1/jobs/{job['id']}").json()
        if current["status"] == "running":
            break
        time.sleep(0.02)
    assert current["status"] == "running"
    response = client.post(f"/api/v1/jobs/{job['id']}/cancel")
    assert response.status_code == 200, response.text
    worker.join(timeout=5)
    assert not worker.is_alive()
    current = client.get(f"/api/v1/jobs/{job['id']}").json()
    assert current["status"] == "cancelled", current
    assert (
        client.get(
            f"/api/v1/projects/{project['id']}/quick-minimizations/{job['id']}/proposal"
        ).status_code
        == 409
    )
    assert _structure(client, project["id"], entry["id"]) == before


def test_server_capture_cannot_be_bypassed_and_invalid_limits_never_queue(client: ApiClient):
    project = seeded_project(client, molecule())
    job, proposal = calculate(client, project, [3])
    response = client.post(
        f"/api/v1/projects/{project['id']}/jobs",
        json={
            "job_type": "coordinates.quick_minimize",
            "parameters": job["parameters"],
            "inputs": [{"role": "calculation", "entry_id": project["entries"][0]["id"]}],
        },
    )
    assert response.status_code == 422 and "capture" in response.text
    for iterations in [0, 2001]:
        response = client.post(
            f"/api/v1/projects/{project['id']}/quick-minimizations",
            json={
                "expected_revision": project["revision"],
                "max_iterations": iterations,
                "selection": {
                    "atoms": [{"structure_id": project["entries"][0]["id"], "atom_id": 3}]
                },
            },
        )
        assert response.status_code == 422
    assert apply_quick(client, project, job, proposal).status_code == 200
