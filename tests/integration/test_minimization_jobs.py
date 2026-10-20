from __future__ import annotations

import hashlib
import multiprocessing
import os
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from molweave_api.database import Base
from molweave_api.main import create_app
from molweave_api.settings import Settings
from molweave_core.adapters.rdkit_common import normalized_to_mol

from tests.integration.test_coordinate_commands import _structure
from tests.integration.test_job_lifecycle import _project_with_structure, _worker
from tests.support.api_client import ApiClient
from tests.support.minimization import molecule


@pytest.fixture
def minclient(tmp_path: Path) -> Iterator[ApiClient]:
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        auto_create_schema=True,
        enable_test_routes=True,
        job_plugin_allowlist=("molweave.demo", "molweave.minimization", "test.native_tree"),
        job_plugin_targets=(
            "molweave_demo_plugin.plugin:plugin",
            "molweave_core.minimization.plugin:plugin",
            "tests.support.native_job_plugin:plugin",
        ),
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    yield ApiClient(app)
    Base.metadata.drop_all(app.state.engine)
    app.state.engine.dispose()


def submit_molecule(client: ApiClient) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    from rdkit import Chem

    project = client.post("/api/v1/projects", json={"name": "Minimization"}).json()
    mol = normalized_to_mol(molecule())
    response = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0},
        files=[("files", ("explicit.mol", Chem.MolToMolBlock(mol), "chemical/x-mdl-molfile"))],
    )
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    entry = project["entries"][0]
    structure = _structure(client, project["id"], entry["id"])
    submitted = client.post(
        f"/api/v1/projects/{project['id']}/minimizations",
        json={
            "expected_revision": project["revision"],
            "selection": {"atoms": [{"structure_id": entry["id"], "atom_id": 3}]},
            "conformers": {entry["id"]: structure["active_conformer_id"]},
        },
    )
    assert submitted.status_code == 201, submitted.text
    return project, entry, submitted.json()


def test_real_worker_produces_proposal_without_mutating_molecule(minclient: ApiClient) -> None:
    if not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"):
        pytest.skip("Locked native toolchain required for scientific worker qualification")
    project, entry, queued = submit_molecule(minclient)
    before = _structure(minclient, project["id"], entry["id"])
    assert _worker(minclient).run_once()
    job = minclient.get(f"/api/v1/jobs/{queued['id']}").json()
    assert job["status"] == "completed", job
    assert job["result_values"]["outcome"] == "converged", job
    assert len(job["results"]) == 3
    assert not any(a["importable_structure"] for a in job["results"])
    report = next(a for a in job["results"] if a["role"] == "report")
    document = minclient.get(report["artifact"]["download_url"]).json()
    assert document["movable_count"] == 1 and document["fixed_count"] == 8
    assert document["final_energy"] < document["initial_energy"]
    current = minclient.get(f"/api/v1/projects/{project['id']}").json()
    assert current["revision"] == project["revision"]
    assert current["entries"][0]["current_artifact_id"] == entry["current_artifact_id"]
    assert _structure(minclient, project["id"], entry["id"]) == before
    assert job["inputs"][0]["artifact_id"] == entry["current_artifact_id"]
    live = minclient.get(f"/api/v1/projects/{project['id']}/minimizations/{job['id']}/live")
    assert live.headers["cache-control"] == "no-store" and live.json()["frame"] is None
    assert not (minclient.app.state.settings.data_dir / "work/jobs" / job["id"]).exists()
    events = minclient.get(f"/api/v1/jobs/{job['id']}/events").json()
    assert all(
        "coordinates" not in event["data"] and "entries" not in event["data"] for event in events
    )


def test_missing_toolchain_is_reported_without_false_success(
    minclient: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("MOLWEAVE_AMBERTOOLS_PREFIX", raising=False)
    project, _entry, queued = submit_molecule(minclient)
    assert _worker(minclient).run_once()
    job = minclient.get(f"/api/v1/jobs/{queued['id']}").json()
    assert job["status"] == "completed"
    assert job["result_values"]["outcome"] == "blocked"
    report = next(a for a in job["results"] if a["role"] == "report")
    assert (
        "toolchain_unavailable"
        in minclient.get(report["artifact"]["download_url"]).json()["reason"]
    )
    assert (
        minclient.get(f"/api/v1/projects/{project['id']}").json()["revision"] == project["revision"]
    )


def active_pid(pid: int) -> bool:
    try:
        return Path(f"/proc/{pid}/stat").read_text().split(") ", 1)[1][0] != "Z"
    except FileNotFoundError:
        return False


@pytest.mark.parametrize(
    "mode,cancel,status",
    [
        ("cooperative", True, "cancelled"),
        ("ignoring", True, "cancelled"),
        ("ignoring", False, "failed"),
        ("crash", False, "failed"),
        ("memory", False, "failed"),
    ],
)
@pytest.mark.skipif(sys.platform != "linux", reason="Native process-tree model is Linux-qualified")
def test_native_descendants_stop_on_cancel_deadline_and_child_loss(
    minclient: ApiClient,
    tmp_path: Path,
    mode: str,
    cancel: bool,
    status: str,
) -> None:
    project, entry = _project_with_structure(minclient)
    pid_file = tmp_path / "pids"
    response = minclient.post(
        f"/api/v1/projects/{project['id']}/jobs",
        json={
            "job_type": "test.native_tree",
            "parameters": {"pid_file": str(pid_file), "mode": mode},
            "inputs": [{"role": "structure", "entry_id": entry["id"]}],
        },
    )
    assert response.status_code == 201, response.text
    job = response.json()
    errors = []

    def run() -> None:
        try:
            _worker(minclient).run_once()
        except BaseException as error:
            errors.append(error)

    thread = threading.Thread(target=run)
    thread.start()
    deadline = time.monotonic() + 8
    while not pid_file.exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    assert pid_file.exists(), minclient.get(f"/api/v1/jobs/{job['id']}").json()
    pids = [int(i) for i in pid_file.read_text().split()]
    if cancel:
        assert minclient.post(f"/api/v1/jobs/{job['id']}/cancel").status_code == 200
    thread.join(timeout=8)
    assert not thread.is_alive() and not errors, errors
    finished = minclient.get(f"/api/v1/jobs/{job['id']}").json()
    assert finished["status"] == status, finished
    deadline = time.monotonic() + 3
    while any(active_pid(pid) for pid in pids) and time.monotonic() < deadline:
        time.sleep(0.01)
    assert not any(active_pid(pid) for pid in pids), pids
    if mode == "crash":
        assert finished["error"]["code"] == "child_process_lost"
    elif mode == "memory":
        assert finished["error"]["code"] == "resident_memory_exceeded"
        assert "resident bytes" in finished["error"]["message"]
    elif not cancel:
        assert finished["error"]["code"] == "wall_time_exceeded"


@pytest.mark.skipif(sys.platform != "linux", reason="Native process-tree model is Linux-qualified")
def test_worker_loss_terminates_native_tree_and_recovers_honestly(
    minclient: ApiClient,
    tmp_path: Path,
) -> None:
    from tests.support.native_job_plugin import run_worker

    project, entry = _project_with_structure(minclient)
    pid_file = tmp_path / "lost-worker-pids"
    response = minclient.post(
        f"/api/v1/projects/{project['id']}/jobs",
        json={
            "job_type": "test.native_tree",
            "parameters": {"pid_file": str(pid_file)},
            "inputs": [{"role": "structure", "entry_id": entry["id"]}],
        },
    )
    assert response.status_code == 201, response.text
    job = response.json()
    coordinator = multiprocessing.get_context("spawn").Process(
        target=run_worker,
        args=(minclient.app.state.settings,),
    )
    coordinator.start()
    try:
        deadline = time.monotonic() + 8
        while not pid_file.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert pid_file.exists()
        pids = [int(i) for i in pid_file.read_text().split()]
        coordinator.terminate()
        coordinator.join(timeout=3)
        deadline = time.monotonic() + 3
        while any(active_pid(pid) for pid in pids) and time.monotonic() < deadline:
            time.sleep(0.01)
        assert not any(active_pid(pid) for pid in pids), pids
        assert _worker(minclient).recover_abandoned() == 1
        recovered = minclient.get(f"/api/v1/jobs/{job['id']}").json()
        assert recovered["status"] == "failed" and recovered["error"]["code"] == "worker_lost"
    finally:
        if coordinator.is_alive():
            coordinator.kill()
            coordinator.join(timeout=3)


def test_worker_includes_hidden_locked_protein_context_without_mutation(minclient: ApiClient):
    if not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"):
        pytest.skip("Locked native toolchain required for scientific worker qualification")
    from molweave_core.molecular import NormalizedStructureV1
    from rdkit import Chem

    from tests.support.minimization import translated

    project = minclient.post("/api/v1/projects", json={"name": "Explicit context"}).json()
    heavy = Path(__file__).parents[1] / "fixtures/minimization/peptide-heavy.pdb"
    ligand = normalized_to_mol(translated(molecule(), (2, 4, 3.5)))
    imported = minclient.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0},
        files=[
            ("files", (heavy.name, heavy.read_bytes(), "chemical/x-pdb")),
            ("files", ("ligand.mol", Chem.MolToMolBlock(ligand), "chemical/x-mdl-molfile")),
        ],
    )
    assert imported.status_code == 201, imported.text
    project = imported.json()["project"]
    protein = next(e for e in project["entries"] if e["structure_type"] == "protein")
    added = minclient.post(
        f"/api/v1/projects/{project['id']}/entries/{protein['id']}/protein-edits",
        json={
            "expected_revision": project["revision"],
            "operation": "protein.hydrogen.add",
            "ph": 7,
        },
    )
    assert added.status_code == 200, added.text
    project = added.json()["project"]
    for action, value in [("visibility", False), ("lock", True)]:
        changed = minclient.post(
            f"/api/v1/projects/{project['id']}/entries/{protein['id']}/{action}",
            json={"expected_revision": project["revision"], "value": value},
        )
        assert changed.status_code == 200, changed.text
        project = changed.json()
    captures = []
    selected = []
    before = {}
    for entry in sorted(project["entries"], key=lambda e: e["id"]):
        structure = _structure(minclient, project["id"], entry["id"])
        before[entry["id"]] = structure
        captures.append(
            {
                "entry_id": entry["id"],
                "artifact_id": entry["current_artifact_id"],
                "sha256": hashlib.sha256(
                    NormalizedStructureV1.model_validate(structure).to_bytes()
                ).hexdigest(),
                "conformer_id": structure["active_conformer_id"],
                "atom_ids": [a["id"] for a in structure["atoms"]],
            }
        )
        if entry["structure_type"] == "ligand":
            selected.append({"structure_id": entry["id"], "atom_id": 3})
    response = minclient.post(
        f"/api/v1/projects/{project['id']}/minimizations",
        json={
            "expected_revision": project["revision"],
            "mode": "environment",
            "selection": {"atoms": selected},
            "context": [{"entry_id": c["entry_id"], "atom_ids": c["atom_ids"]} for c in captures],
            "conformers": {c["entry_id"]: c["conformer_id"] for c in captures},
        },
    )
    assert response.status_code == 201, response.text
    assert _worker(minclient).run_once()
    job = minclient.get(f"/api/v1/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job
    report = minclient.get(
        next(r["artifact"]["download_url"] for r in job["results"] if r["role"] == "report")
    ).json()
    assert report["outcome"] == "converged", report
    assert report["fixed_count"] == 39
    assert report["movable_count"] == 1
    assert any(row["entry_id"] == protein["id"] for row in report["toolchain"]["mapping"])
    current = minclient.get(f"/api/v1/projects/{project['id']}").json()
    assert current["revision"] == project["revision"]
    for entry in current["entries"]:
        assert _structure(minclient, project["id"], entry["id"]) == before[entry["id"]]
    assert next(e for e in current["entries"] if e["id"] == protein["id"])["locked"] is True
