from __future__ import annotations

import os
from typing import Any

import pytest
from molweave_api.import_export import ImportExportService, PreparedFile
from molweave_core.molecular import Conformer, NormalizedStructureV1

from tests.integration.test_coordinate_commands import _structure
from tests.integration.test_job_lifecycle import _worker
from tests.integration.test_minimization_jobs import minclient as minclient
from tests.support.api_client import ApiClient
from tests.support.minimization import molecule, peptide, translated


def seeded_project(client: ApiClient, *structures: NormalizedStructureV1) -> dict[str, Any]:
    """Seed already-normalized specimens via the real atomic import publication.

    This bypasses adapters only to supply sparse IDs/nonfirst/multiple conformers.
    Real raw-upload/preparation/worker paths remain in test_minimization_jobs.
    """
    project = client.post("/api/v1/projects", json={"name": "Apply specimen"}).json()
    from molweave_core.adapters.defaults import create_default_registry

    registry = create_default_registry()
    prepared = []
    for i, structure in enumerate(structures):
        native = registry.for_format(structure.source.format).export(structure, f"specimen-{i}")
        prepared.append(
            PreparedFile(
                filename=native.filename,
                data=native.data,
                media_type=native.media_type,
                source_format=structure.source.format,
                structures=(structure,),
            )
        )
    with client.app.state.session_factory() as session:
        result = ImportExportService(session, client.app.state.settings).commit_import(
            project["id"],
            project["revision"],
            prepared,
        )
        return result.project.model_dump(mode="json")


def calculate(
    client: ApiClient,
    project: dict[str, Any],
    selections: dict[str, list[int]],
    *,
    environment: bool = False,
    iterations: int = 500,
    acceptance_policy: str = "strict",
) -> tuple[dict[str, Any], str]:
    if not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"):
        pytest.skip("Locked native toolchain required for real Apply qualification")
    members = (
        project["entries"]
        if environment
        else [e for e in project["entries"] if e["id"] in selections]
    )
    response = client.post(
        f"/api/v1/projects/{project['id']}/minimizations",
        json={
            "expected_revision": project["revision"],
            "mode": "environment" if environment else "isolated",
            "selection": {
                "atoms": [
                    {"structure_id": entry, "atom_id": i}
                    for entry, ids in sorted(selections.items())
                    for i in sorted(ids)
                ]
            },
            "context": [{"entry_id": e["id"], "atom_ids": e["atom_ids"]} for e in members]
            if environment
            else [],
            "conformers": {
                e["id"]: _structure(client, project["id"], e["id"])["active_conformer_id"]
                for e in members
            },
            "max_iterations": iterations,
            "acceptance_policy": acceptance_policy,
        },
    )
    assert response.status_code == 201, response.text
    queued = response.json()
    assert _worker(client).run_once()
    response = client.get(f"/api/v1/projects/{project['id']}/minimizations/{queued['id']}/proposal")
    assert response.status_code == 200, response.text
    return response.json(), queued["id"]


def apply(client: ApiClient, project: dict[str, Any], job_id: str, proposal: dict[str, Any]):
    return client.post(
        f"/api/v1/projects/{project['id']}/minimizations/{job_id}/apply",
        json={
            "expected_revision": project["revision"],
            "proposal_sha256": proposal["proposal_sha256"],
        },
    )


def test_real_apply_is_one_exact_reversible_edit_and_cannot_be_retried(minclient: ApiClient):
    project = seeded_project(minclient, molecule())
    entry = project["entries"][0]
    before = _structure(minclient, project["id"], entry["id"])
    original = minclient.get(
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original"
    ).content
    proposal, job_id = calculate(minclient, project, {entry["id"]: [3]})
    assert proposal["applicable"]
    assert _structure(minclient, project["id"], entry["id"]) == before
    response = apply(minclient, project, job_id, proposal)
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["revision"] == project["revision"] + 1
    assert len(updated["topology_patches"]) == 1
    after = _structure(minclient, project["id"], entry["id"])
    assert after["bonds"] == before["bonds"]
    assert after["metadata"] == before["metadata"] and after["source"] == before["source"]
    assert after["atoms"][2]["coordinates"] != before["atoms"][2]["coordinates"]
    assert after["annotations"][-1]["job_id"] == job_id
    for index, atom in enumerate(after["atoms"]):
        assert {k: v for k, v in atom.items() if k != "coordinates"} == {
            k: v for k, v in before["atoms"][index].items() if k != "coordinates"
        }
        if atom["id"] != 3:
            assert atom == before["atoms"][index]
    assert (
        minclient.get(f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original").content
        == original
    )
    retry = apply(minclient, updated, job_id, proposal)
    assert retry.status_code == 409 and "already been applied" in retry.text
    undone = minclient.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": updated["revision"]},
    ).json()
    assert _structure(minclient, project["id"], entry["id"]) == before
    assert apply(minclient, undone, job_id, proposal).status_code == 409
    redone = minclient.post(
        f"/api/v1/projects/{project['id']}/history/redo",
        json={"expected_revision": undone["revision"]},
    ).json()
    assert (
        redone["entries"][0]["current_artifact_id"] == updated["entries"][0]["current_artifact_id"]
    )
    assert _structure(minclient, project["id"], entry["id"]) == after


def test_multi_entry_ligand_and_residue_apply_is_atomic_with_exact_undo(minclient: ApiClient):
    project = seeded_project(minclient, peptide(), translated(molecule(), (2, 4, 3.5)))
    protein = next(e for e in project["entries"] if e["structure_type"] == "protein")
    ligand = next(e for e in project["entries"] if e["structure_type"] == "ligand")
    before = {e["id"]: _structure(minclient, project["id"], e["id"]) for e in project["entries"]}
    proposal, job_id = calculate(
        minclient, project, {protein["id"]: [7], ligand["id"]: [3]}, environment=True
    )
    assert proposal["report"]["outcome"] == "converged", proposal
    response = apply(minclient, project, job_id, proposal)
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["revision"] == project["revision"] + 1
    assert len(updated["topology_patches"]) == 2
    after = {e["id"]: _structure(minclient, project["id"], e["id"]) for e in project["entries"]}
    for entry, atom_id in [(protein, 7), (ligand, 3)]:
        for old, new in zip(before[entry["id"]]["atoms"], after[entry["id"]]["atoms"], strict=True):
            if old["id"] != atom_id:
                assert old == new
    undone = minclient.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": updated["revision"]},
    ).json()
    assert {
        e["id"]: _structure(minclient, project["id"], e["id"]) for e in project["entries"]
    } == before
    minclient.post(
        f"/api/v1/projects/{project['id']}/history/redo",
        json={"expected_revision": undone["revision"]},
    )
    assert {
        e["id"]: _structure(minclient, project["id"], e["id"]) for e in project["entries"]
    } == after


def test_sparse_ids_active_conformer_and_metadata_survive_apply(minclient: ApiClient):
    source = molecule()
    original_rows = source.active_coordinates
    active = [(p[0] + 1, p[1] + 2, p[2] + 3) for p in original_rows]
    from molweave_core.hydrogen_protection import protection_annotation, protection_facts

    facts = [
        f.model_copy(update={"atom_id": f.atom_id * 3}) for f in protection_facts(source).values()
    ]
    source = source.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"id": a.id * 3, "coordinates": active[i]})
                for i, a in enumerate(source.atoms)
            ],
            "bonds": [
                b.model_copy(update={"atom_1_id": b.atom_1_id * 3, "atom_2_id": b.atom_2_id * 3})
                for b in source.bonds
            ],
            "conformers": [
                source.conformers[0],
                Conformer(id=7, name="Active", coordinates=active),
            ],
            "active_conformer_id": 7,
            "metadata": {"user": "retained", **source.metadata},
            "annotations": [protection_annotation(facts, "import")],
        }
    )
    project = seeded_project(minclient, source)
    entry = project["entries"][0]
    proposal, job_id = calculate(minclient, project, {entry["id"]: [9]})
    assert apply(minclient, project, job_id, proposal).status_code == 200
    after = _structure(minclient, project["id"], entry["id"])
    assert after["active_conformer_id"] == 7
    assert after["conformers"][0] == source.model_dump(mode="json")["conformers"][0]
    assert after["metadata"] == source.metadata
    assert [a["id"] for a in after["atoms"]] == [a.id for a in source.atoms]


@pytest.mark.parametrize(
    "change",
    [
        "moving_lock",
        "context_transform",
        "moving_transform",
        "delete_context",
        "revision",
        "digest",
    ],
)
def test_changed_dependencies_and_invalid_requests_reject_atomically(
    minclient: ApiClient, change: str
):
    project = seeded_project(minclient, molecule(), translated(molecule(), (0, 0, 5)))
    moving, fixed = project["entries"]
    proposal, job_id = calculate(minclient, project, {moving["id"]: [3]}, environment=True)
    if change == "moving_lock":
        project = minclient.post(
            f"/api/v1/projects/{project['id']}/entries/{moving['id']}/lock",
            json={"expected_revision": project["revision"], "value": True},
        ).json()
    elif change in {"context_transform", "moving_transform"}:
        target = fixed if change == "context_transform" else moving
        response = minclient.post(
            f"/api/v1/projects/{project['id']}/entries/{target['id']}/transform",
            json={
                "expected_revision": project["revision"],
                "scope": "structure",
                "entry_id": target["id"],
                "translation": [1, 0, 0],
                "rotation_degrees": [0, 0, 0],
                "pivot_mode": "structure_centroid",
            },
        )
        assert response.status_code == 200, response.text
        project = response.json()
    elif change == "delete_context":
        response = minclient.delete(
            f"/api/v1/projects/{project['id']}/entries/{fixed['id']}",
            params={"expected_revision": project["revision"]},
        )
        assert response.status_code == 200, response.text
        project = response.json()
    elif change == "revision":
        project["revision"] += 100
    else:
        proposal["proposal_sha256"] = "0" * 64
    before_project = minclient.get(f"/api/v1/projects/{project['id']}").json()
    before = {
        e["id"]: _structure(minclient, project["id"], e["id"]) for e in before_project["entries"]
    }
    response = apply(minclient, project, job_id, proposal)
    assert response.status_code in {404, 409, 422}, response.text
    current = minclient.get(f"/api/v1/projects/{project['id']}").json()
    assert current == before_project
    assert {
        e["id"]: _structure(minclient, project["id"], e["id"]) for e in current["entries"]
    } == before


def test_unrelated_revision_and_locked_fixed_context_can_apply(minclient: ApiClient):
    project = seeded_project(minclient, molecule(), translated(molecule(), (0, 0, 5)))
    moving, fixed = project["entries"]
    proposal, job_id = calculate(minclient, project, {moving["id"]: [3]}, environment=True)
    project = minclient.post(
        f"/api/v1/projects/{project['id']}/entries/{fixed['id']}/lock",
        json={"expected_revision": project["revision"], "value": True},
    ).json()
    project = minclient.patch(
        f"/api/v1/projects/{project['id']}/entries/{moving['id']}",
        json={
            "expected_revision": project["revision"],
            "name": "Renamed after capture",
            "description": "Retain this",
            "user_metadata": {"unrelated": "retained"},
        },
    ).json()
    fixed_before = _structure(minclient, project["id"], fixed["id"])
    response = apply(minclient, project, job_id, proposal)
    assert response.status_code == 200, response.text
    updated = response.json()
    current = next(e for e in updated["entries"] if e["id"] == moving["id"])
    assert current["name"] == "Renamed after capture" and current["description"] == "Retain this"
    assert current["user_metadata"] == {"unrelated": "retained"}
    assert _structure(minclient, project["id"], fixed["id"]) == fixed_before


def test_nonconverged_and_foreign_proposals_cannot_apply(minclient: ApiClient):
    project = seeded_project(minclient, molecule())
    entry = project["entries"][0]
    proposal, job_id = calculate(minclient, project, {entry["id"]: entry["atom_ids"]}, iterations=1)
    assert proposal["report"]["outcome"] == "non_converged" and not proposal["applicable"]
    assert proposal["entries"]  # inspectable, no false success or silent Apply
    assert apply(minclient, project, job_id, proposal).status_code == 409
    other = seeded_project(minclient, molecule())
    assert apply(minclient, other, job_id, proposal).status_code == 404
    assert (
        minclient.get(f"/api/v1/projects/{project['id']}").json()["revision"] == project["revision"]
    )


def test_capabilities_and_capture_cannot_be_bypassed(minclient: ApiClient, monkeypatch):
    capabilities = minclient.get("/api/v1/minimization-capabilities").json()
    assert capabilities["limits"]["assembly_atoms"] == 20_000
    if os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"):
        assert capabilities["available"]
    monkeypatch.delenv("MOLWEAVE_AMBERTOOLS_PREFIX", raising=False)
    assert not minclient.get("/api/v1/minimization-capabilities").json()["available"]
    project = seeded_project(minclient, molecule())
    entry = project["entries"][0]
    attempted = minclient.post(
        f"/api/v1/projects/{project['id']}/jobs",
        json={
            "job_type": "coordinates.minimize",
            "parameters": {},
            "inputs": [{"entry_id": entry["id"], "role": "calculation"}],
        },
    )
    assert attempted.status_code == 422 and "minimizations endpoint" in attempted.text
    body = {
        "expected_revision": project["revision"],
        "selection": {"atoms": [{"structure_id": entry["id"], "atom_id": 3}]},
        "conformers": {entry["id"]: 99},
    }
    assert (
        minclient.post(f"/api/v1/projects/{project['id']}/minimizations", json=body).status_code
        == 409
    )
    body["conformers"] = {}
    assert (
        minclient.post(f"/api/v1/projects/{project['id']}/minimizations", json=body).status_code
        == 422
    )
    body["captured_inputs"] = []
    assert (
        minclient.post(f"/api/v1/projects/{project['id']}/minimizations", json=body).status_code
        == 422
    )
    assert minclient.get(f"/api/v1/projects/{project['id']}/jobs").json() == []


def test_archive_retains_reports_and_provenance_but_proposals_are_historical(minclient: ApiClient):
    from tests.integration.test_archive_roundtrip import export_archive, import_archive

    project = seeded_project(minclient, molecule())
    entry = project["entries"][0]
    proposal, job_id = calculate(minclient, project, {entry["id"]: [3]})
    response = apply(minclient, project, job_id, proposal)
    assert response.status_code == 200, response.text
    expected = _structure(minclient, project["id"], entry["id"])
    exported = export_archive(minclient, project["id"], "minimization-archive")
    restored = import_archive(
        minclient, minclient.get(exported["artifact"]["download_url"]).content
    )["project"]
    assert _structure(minclient, restored["id"], restored["entries"][0]["id"]) == expected
    jobs = minclient.get(f"/api/v1/projects/{restored['id']}/jobs").json()
    assert len(jobs) == 1 and jobs[0]["id"] != job_id
    job = jobs[0]
    assert len(job["results"]) == 3
    report = minclient.get(
        f"/api/v1/projects/{restored['id']}/minimizations/{job['id']}/proposal"
    ).json()
    assert report["report"] == proposal["report"]
    assert not report["applicable"] and "historical" in report["unavailable_reason"]
    assert apply(minclient, restored, job["id"], report).status_code == 409
    assert restored["history"]["retained_commands"] == 0
    # A reload reads the same report/artifact digest and applied marker from storage.
    original = minclient.get(
        f"/api/v1/projects/{project['id']}/minimizations/{job_id}/proposal"
    ).json()
    assert original["proposal_sha256"] == proposal["proposal_sha256"]
    assert not original["applicable"]


def test_concurrent_apply_requests_publish_exactly_one_command(minclient: ApiClient):
    import threading
    from concurrent.futures import ThreadPoolExecutor

    project = seeded_project(minclient, molecule())
    entry = project["entries"][0]
    proposal, job_id = calculate(minclient, project, {entry["id"]: [3]})
    ready = threading.Barrier(2)

    def attempt(_: int):
        ready.wait(timeout=5)
        return apply(minclient, project, job_id, proposal)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(attempt, range(2)))
    assert sorted(r.status_code for r in responses) == [200, 409]
    current = minclient.get(f"/api/v1/projects/{project['id']}").json()
    assert current["revision"] == project["revision"] + 1
    assert current["history"]["retained_commands"] == project["history"]["retained_commands"] + 1


def test_corrupted_proposal_storage_is_never_applied(minclient: ApiClient):
    from molweave_api.models import Artifact, Job

    project = seeded_project(minclient, molecule())
    entry = project["entries"][0]
    proposal, job_id = calculate(minclient, project, {entry["id"]: [3]})
    with minclient.app.state.session_factory() as session:
        job = session.get(Job, job_id)
        result = next(r for r in job.results if r.role == "proposal")
        artifact = session.get(Artifact, result.artifact_id)
        path = minclient.app.state.settings.data_dir / artifact.relative_path
        original = path.read_bytes()
        path.write_bytes(original.replace(b'"converged"', b'"unchanged"'))
    before = minclient.get(f"/api/v1/projects/{project['id']}").json()
    assert apply(minclient, project, job_id, proposal).status_code == 409
    assert minclient.get(f"/api/v1/projects/{project['id']}").json() == before
    path.write_bytes(original)


@pytest.mark.parametrize("kind", ["noop", "unselected", "wrong_conformer"])
def test_semantically_invalid_or_unchanged_proposals_create_no_history(
    minclient: ApiClient, kind: str
):
    # Inject a malformed *worker result* with internally consistent hashes, so this
    # tests publication's independent identity/no-op boundary rather than file SHA.
    import hashlib
    import json

    from molweave_api.import_export import ArtifactService
    from molweave_api.models import Job
    from molweave_core.artifacts import LocalArtifactStore

    project = seeded_project(minclient, molecule())
    entry = project["entries"][0]
    proposal, job_id = calculate(minclient, project, {entry["id"]: [3]})
    before = _structure(minclient, project["id"], entry["id"])
    with minclient.app.state.session_factory() as session:
        job = session.get(Job, job_id)
        result = next(r for r in job.results if r.role == "proposal")
        service = ArtifactService(
            session, LocalArtifactStore(minclient.app.state.settings.data_dir)
        )
        _, raw = service.read(result.artifact_id)
        doc = json.loads(raw)
        if kind == "noop":
            doc["entries"][0]["coordinates"] = [before["atoms"][2]["coordinates"]]
        elif kind == "unselected":
            doc["entries"][0]["atom_ids"] = [2]
        else:
            doc["entries"][0]["conformer_id"] = 99
        raw = json.dumps(doc, sort_keys=True, separators=(",", ":")).encode()
        digest = hashlib.sha256(raw).hexdigest()
        artifact = service.publish(raw, "invalid-worker.json", "application/json")
        result.artifact_id = artifact.id
        result.metadata_json = {**result.metadata_json, "proposal_sha256": digest}
        job.result_values = {**job.result_values, "proposal_sha256": digest}
        session.commit()
    proposal["proposal_sha256"] = digest
    assert apply(minclient, project, job_id, proposal).status_code == 409
    assert (
        minclient.get(f"/api/v1/projects/{project['id']}").json()["revision"] == project["revision"]
    )
    assert _structure(minclient, project["id"], entry["id"]) == before


def test_warned_iteration_limit_requires_acknowledgement_and_is_one_undoable_edit(minclient):
    project = seeded_project(minclient, molecule())
    entry = project["entries"][0]
    before = _structure(minclient, project["id"], entry["id"])
    proposal, job_id = calculate(
        minclient,
        project,
        {entry["id"]: entry["atom_ids"]},
        iterations=1,
        acceptance_policy="interactive",
    )
    report = proposal["report"]
    assert report["outcome"] == "non_converged" and proposal["applicable"]
    assert report["termination_kind"] == "iteration_limit"
    assert report["nonconverged_eligible"] and report["new_severe_overlaps"] is False
    assert report["maximum_gradient"] > report["gradient_tolerance"]
    assert report["final_energy"] < report["initial_energy"]
    denied = apply(minclient, project, job_id, proposal)
    assert denied.status_code == 409 and "acknowledgement" in denied.text
    assert _structure(minclient, project["id"], entry["id"]) == before
    response = minclient.post(
        f"/api/v1/projects/{project['id']}/minimizations/{job_id}/apply",
        json={
            "expected_revision": project["revision"],
            "proposal_sha256": proposal["proposal_sha256"],
            "acknowledge_nonconvergence": True,
        },
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["revision"] == project["revision"] + 1
    after = _structure(minclient, project["id"], entry["id"])
    assert after != before and after["bonds"] == before["bonds"]
    provenance = minclient.get(f"/api/v1/jobs/{job_id}").json()["provenance"][
        "minimization_application"
    ]
    assert provenance["outcome"] == "non_converged" and provenance["acknowledged_nonconvergence"]
    undo = minclient.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": updated["revision"]},
    )
    assert undo.status_code == 200, undo.text
    assert _structure(minclient, project["id"], entry["id"]) == before
    redo = minclient.post(
        f"/api/v1/projects/{project['id']}/history/redo",
        json={"expected_revision": undo.json()["revision"]},
    )
    assert redo.status_code == 200, redo.text
    assert _structure(minclient, project["id"], entry["id"]) == after
