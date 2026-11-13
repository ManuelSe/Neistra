"""Qualify actual selected implementations, current graphs and historical quick jobs.

Invoke this file by absolute path with cwd and PYTHONPATH selecting the producer
or reader checkout. Only use disposable stores migrated by that implementation.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import io
import json
import zipfile
from copy import deepcopy
from pathlib import Path
from typing import Any

from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.integration.test_archive_roundtrip import create_project, export_archive
from tests.integration.test_minimization_apply import seeded_project
from tests.integration.test_model_edits import edit
from tests.integration.test_quick_minimization import calculate
from tests.support.api_client import ApiClient
from tests.support.minimization import molecule
from tests.support.modeling_reader_qualification import allocation_counters, canonical
from tests.support.quick_minimization_reader_qualification import (
    original_hashes,
    result_hashes,
)
from tests.support.quick_minimization_reader_qualification import (
    produce as produce_quick,
)
from tests.support.quick_minimization_reader_qualification import (
    read as read_quick,
)


def snapshot(client: ApiClient, project: dict[str, Any]) -> dict[str, Any]:
    project = client.get(f"/api/v1/projects/{project['id']}").json()
    return {
        "project": project,
        "canonical": canonical(client, project),
        "originals": original_hashes(client, project),
        "counters": allocation_counters(client, project),
    }


def assert_snapshot(client: ApiClient, project: dict[str, Any], state: dict[str, Any]) -> None:
    assert canonical(client, project) == state["canonical"]
    assert original_hashes(client, project) == state["originals"]
    assert allocation_counters(client, project) == state["counters"]


def export_bytes(client: ApiClient, project: dict[str, Any], label: str) -> bytes:
    artifact = export_archive(client, project["id"], label)["artifact"]
    response = client.get(artifact["download_url"])
    assert response.status_code == 200, response.text
    assert hashlib.sha256(response.content).hexdigest() == artifact["sha256"]
    return response.content


def model_field(client: ApiClient, job: dict[str, Any]) -> Any:
    model = next(item for item in job["results"] if item["role"] == "model")
    response = client.get(model["artifact"]["download_url"])
    assert response.status_code == 200, response.text
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        document = json.loads(archive.read("local-model.json"))
    assert document.get("effective_field") == job["result_values"].get("effective_field")
    return document.get("effective_field")


def input_hashes(client: ApiClient, job: dict[str, Any]) -> list[str]:
    hashes = []
    for item in job["inputs"]:
        response = client.get(f"/api/v1/artifacts/{item['artifact_id']}")
        assert response.status_code == 200, response.text
        digest = hashlib.sha256(response.content).hexdigest()
        assert digest == item["artifact_sha256"]
        assert len(response.content) == item["artifact_size"]
        hashes.append(digest)
    return hashes


def assert_job(
    client: ApiClient, actual: dict[str, Any], expected: dict[str, Any], *, archived: bool = False
) -> None:
    for key in (
        "plugin_name",
        "job_type",
        "implementation_version",
        "status",
        "parameters",
        "result_values",
        "warnings",
        "error",
    ):
        assert actual[key] == expected[key], key
    assert result_hashes(client, actual) == result_hashes(client, expected)
    assert input_hashes(client, actual) == input_hashes(client, expected)
    assert model_field(client, actual) == model_field(client, expected)
    if not archived:
        assert actual["inputs"] == expected["inputs"]
        assert actual["provenance"] == expected["provenance"]
        return
    assert len(actual["inputs"]) == len(expected["inputs"])
    entry_ids = {}
    for old, new in zip(expected["inputs"], actual["inputs"], strict=True):
        entry_ids[old["entry_id"]] = new["entry_id"]
        for key in set(old) - {"id", "entry_id", "artifact_id"}:
            assert new[key] == old[key], key
    provenance = deepcopy(expected["provenance"])
    provenance.update(
        archive_source_job_id=expected["id"],
        archive_source_project_id=expected["project_id"],
        job_id=actual["id"],
        project_id=actual["project_id"],
    )
    if isinstance(provenance.get("inputs"), list):
        provenance["inputs"] = [
            {**item, "entry_id": entry_ids.get(item.get("entry_id"), item.get("entry_id"))}
            for item in provenance["inputs"]
        ]
    assert actual["provenance"] == provenance


def archive_roundtrip(
    client: ApiClient,
    state: dict[str, Any],
    archive: bytes,
    label: str,
    expected_job: dict[str, Any] | None = None,
) -> None:
    for suffix in (".neistra.zip", ".molweave.zip"):
        response = client.post(
            "/api/v1/projects/import-archive",
            data={"operation_id": f"{label}-{suffix}"},
            files={"file": (f"qualification{suffix}", archive, "application/zip")},
        )
        assert response.status_code == 201, response.text
        restored = response.json()["project"]
        assert_snapshot(client, restored, state)
        jobs = client.get(f"/api/v1/projects/{restored['id']}/jobs").json()
        assert len(jobs) == (1 if expected_job else 0)
        if expected_job:
            assert_job(client, jobs[0], expected_job, archived=True)
        reexported = export_bytes(client, restored, f"{label}-reexport-{suffix}")
        reopened = client.post(
            "/api/v1/projects/import-archive",
            data={"operation_id": f"{label}-reopen-{suffix}"},
            files={"file": (f"reexport{suffix}", reexported, "application/zip")},
        )
        assert reopened.status_code == 201, reopened.text
        twice = reopened.json()["project"]
        assert_snapshot(client, twice, state)
        if expected_job:
            twice_jobs = client.get(f"/api/v1/projects/{twice['id']}/jobs").json()
            assert len(twice_jobs) == 1
            assert_job(client, twice_jobs[0], jobs[0], archived=True)


def produce(client: ApiClient, data: Path, current: bool, root: Path) -> dict[str, Any]:
    baseline = produce_quick(client, data)
    quick_states = json.loads((data / "quick-expectations.json").read_text())
    for state in quick_states:
        model_field(client, state["job"])
        input_hashes(client, state["job"])
        assert ("effective_field" in state["job"]["result_values"]) is current

    project = create_project(client, "Current connectivity reader")
    raw = (root / "tests/fixtures/minimization/peptide-heavy.pdb").read_bytes()
    response = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": project["revision"], "infer_bonds": "true"},
        files={"files": ("peptide-heavy.pdb", raw, "chemical/x-pdb")},
    )
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    entry = project["entries"][0]
    imported = canonical(client, project)[entry["name"]]
    if current:
        assert len(imported["bonds"]) == 15
        assert all(bond["inferred"] and bond["order"] is None for bond in imported["bonds"])
    has_edge = any(
        sorted([bond["atom_1_id"], bond["atom_2_id"]]) == [2, 5] for bond in imported["bonds"]
    )
    if not has_edge:
        assert not current
        response = edit(
            client,
            project,
            entry["id"],
            [2, 5],
            {"operation": "bond.set", "order": 1.0},
            hydrogen_policy="preserve",
        )
        assert response.status_code == 200, response.text
        project = response.json()["project"]
    before = snapshot(client, project)
    response = edit(
        client,
        project,
        entry["id"],
        [2, 5],
        {"operation": "bond.delete"},
        hydrogen_policy="preserve",
    )
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    after = snapshot(client, project)
    document = after["canonical"][entry["name"]]
    assert not any(
        sorted([bond["atom_1_id"], bond["atom_2_id"]]) == [2, 5] for bond in document["bonds"]
    )
    assert document["metadata"]["neistra_modeling"]["excluded_bonds"] == [[2, 5]]
    assert after["originals"][entry["name"]] == hashlib.sha256(raw).hexdigest()
    saved = client.post(
        f"/api/v1/projects/{project['id']}/save",
        json={"expected_revision": project["revision"]},
    )
    assert saved.status_code == 200, saved.text
    after["project"] = client.get(f"/api/v1/projects/{project['id']}").json()
    archive = export_bytes(client, after["project"], "connectivity-producer")
    (data / "connectivity.neistra.zip").write_bytes(archive)

    unapplied = seeded_project(client, molecule())
    unchanged = snapshot(client, unapplied)
    job, proposal = calculate(client, unapplied, [3])
    assert proposal["applicable"], proposal
    job = client.get(f"/api/v1/jobs/{job['id']}").json()
    assert job["status"] == "completed"
    assert job["implementation_version"] == ("1.0.3" if current else "1.0.2")
    assert "quick_minimization_application" not in job["provenance"]
    assert ("effective_field" in job["result_values"]) is current
    if current:
        assert job["result_values"]["graph_policy"] == "current-canonical-v1"
    model_field(client, job)
    input_hashes(client, job)
    assert_snapshot(client, unapplied, unchanged)
    # Job links/results are populated without a molecular revision or history edit.
    unchanged["project"] = client.get(f"/api/v1/projects/{unapplied['id']}").json()
    unapplied_archive = export_bytes(client, unapplied, "unapplied-producer")
    (data / "unapplied.neistra.zip").write_bytes(unapplied_archive)
    state = {
        "producer": APPLICATION_VERSION,
        "producer_current": current,
        "connectivity": {
            "before": before,
            "after": after,
            "initial_added_edge": not has_edge,
            "imported_canonical": imported,
            "archive_sha256": hashlib.sha256(archive).hexdigest(),
        },
        "unapplied": {
            **unchanged,
            "job": job,
            "proposal": proposal,
            "result_hashes": result_hashes(client, job),
            "archive_sha256": hashlib.sha256(unapplied_archive).hexdigest(),
        },
    }
    (data / "current-connectivity-expectations.json").write_text(json.dumps(state))
    return {"baseline": baseline, "historical_apply_refused": None}


def read(client: ApiClient, data: Path, current: bool) -> dict[str, Any]:
    state = json.loads((data / "current-connectivity-expectations.json").read_text())
    unapplied = state["unapplied"]
    path = f"/api/v1/projects/{unapplied['project']['id']}"
    project = client.get(path).json()
    assert project == unapplied["project"]
    assert_snapshot(client, project, unapplied)
    job = client.get(f"/api/v1/jobs/{unapplied['job']['id']}").json()
    assert_job(client, job, unapplied["job"])
    assert result_hashes(client, job) == unapplied["result_hashes"]
    historical_refused = None
    if current and not state["producer_current"]:
        url = f"{path}/quick-minimizations/{job['id']}"
        response = client.get(f"{url}/proposal")
        assert response.status_code == 200, response.text
        proposal = response.json()
        assert proposal["report"] == unapplied["proposal"]["report"]
        assert not proposal["applicable"]
        assert "Earlier or unsupported connectivity model" in proposal["unavailable_reason"]
        response = client.post(
            f"{url}/apply",
            json={
                "expected_revision": project["revision"],
                "proposal_sha256": proposal["proposal_sha256"],
            },
        )
        assert response.status_code == 409, response.text
        assert "Earlier or unsupported connectivity model" in response.text
        assert client.get(path).json() == project
        assert_snapshot(client, project, unapplied)
        assert_job(client, client.get(f"/api/v1/jobs/{job['id']}").json(), unapplied["job"])
        historical_refused = True

    quick_states = json.loads((data / "quick-expectations.json").read_text())
    for quick in quick_states:
        actual = client.get(f"/api/v1/jobs/{quick['job']['id']}").json()
        assert_job(client, actual, quick["job"])
    baseline = read_quick(client, data)
    # The selected helper's historical default-reader label is not this run's
    # version evidence. This wrapper records actual versions and limits below.
    baseline.pop("limitations", None)
    # The historical helper omits result_values and checks only one archive suffix.
    for quick in quick_states:
        current_project = client.get(f"/api/v1/projects/{quick['project']['id']}").json()
        retained = {
            "canonical": quick["after"],
            "originals": quick["originals"],
            "counters": quick["counters"],
        }
        archive_roundtrip(
            client,
            retained,
            (data / f"{quick['label']}.molweave.zip").read_bytes(),
            f"quick-{quick['label']}",
            quick["job"],
        )
        assert_snapshot(client, current_project, retained)

    connectivity = state["connectivity"]
    after = connectivity["after"]
    path = f"/api/v1/projects/{after['project']['id']}"
    project = client.get(path).json()
    assert project == after["project"]
    assert_snapshot(client, project, after)
    for action, expected in (("undo", connectivity["before"]), ("redo", after)):
        response = client.post(
            f"{path}/history/{action}", json={"expected_revision": project["revision"]}
        )
        assert response.status_code == 200, response.text
        project = response.json()
        assert canonical(client, project) == expected["canonical"]
        assert original_hashes(client, project) == expected["originals"]
    assert allocation_counters(client, project) == after["counters"]
    response = client.post(f"{path}/save", json={"expected_revision": project["revision"]})
    assert response.status_code == 200, response.text
    for label, saved, filename, expected_job in (
        ("connectivity", after, "connectivity.neistra.zip", None),
        ("unapplied", unapplied, "unapplied.neistra.zip", job),
    ):
        archive = (data / filename).read_bytes()
        expected_hash = (
            connectivity["archive_sha256"]
            if label == "connectivity"
            else (unapplied["archive_sha256"])
        )
        assert hashlib.sha256(archive).hexdigest() == expected_hash
        archive_roundtrip(client, saved, archive, label, expected_job)
        live = client.get(f"/api/v1/projects/{saved['project']['id']}").json()
        archive_roundtrip(
            client,
            saved,
            export_bytes(client, live, f"{label}-reader"),
            f"{label}-reader",
            expected_job,
        )
    return {"baseline": baseline, "historical_apply_refused": historical_refused}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("produce", "read"))
    parser.add_argument("--implementation-root", type=Path, required=True)
    parser.add_argument("--expected-version", required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--expect-current-connectivity", action="store_true")
    args = parser.parse_args()
    root = args.implementation_root.resolve()
    assert Path.cwd().resolve() == root
    assert APPLICATION_VERSION == args.expected_version
    modules = [
        "molweave_api.main",
        "molweave_api.archive_service",
        "molweave_core.molecular",
        "molweave_core.adapters.macromolecular",
        "molweave_core.minimization.quick_plugin",
        "molweave_demo_plugin",
        "tests.support.api_client",
        "tests.support.quick_minimization_reader_qualification",
        "tests.support.modeling_reader_qualification",
        "tests.integration.test_model_edits",
        "tests.integration.test_quick_minimization",
        "tests.support.minimization",
    ]
    paths = {}
    for name in modules:
        module = importlib.import_module(name)
        path = Path(module.__file__).resolve()
        assert path.is_relative_to(root), (name, path, root)
        paths[name] = str(path)
    data = args.data_dir.resolve()
    assert data.is_dir(), "Migrate a fresh disposable store first"
    app = create_app(Settings(data_dir=data, database_url=f"sqlite:///{data / 'molweave.db'}"))
    assert app.version == args.expected_version
    client = ApiClient(app)
    try:
        result = (
            produce(client, data, args.expect_current_connectivity, root)
            if args.mode == "produce"
            else read(client, data, args.expect_current_connectivity)
        )
        result.update(
            mode=args.mode,
            application_version=APPLICATION_VERSION,
            implementation_root=str(root),
            module_paths=paths,
            four_case_quick_retention=True,
            result_values_exact=True,
            connectivity_retention=True,
            unapplied_job_retention=True,
            assertion_scope=(
                "producer specimens verified"
                if args.mode == "produce"
                else "actual reader retention verified"
            ),
            both_archive_suffixes=args.mode == "read",
            limitations=[
                "Data retention under an older reader does not qualify its future authoring",
                "Old reader never executes or applies a new implementation job",
                "Archives retain historical results, not portable Undo or fresh Apply eligibility",
                "Existing sparse projects remain unchanged; no automatic connectivity repair",
            ],
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        app.state.engine.dispose()


if __name__ == "__main__":
    main()
