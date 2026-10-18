"""Real worker timing/RSS on independently prepared inputs; Linux native profile."""

from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from molweave_core.molecular import NormalizedStructureV1

from tests.integration.test_coordinate_commands import _structure
from tests.integration.test_job_lifecycle import _worker
from tests.integration.test_minimization_apply import seeded_project
from tests.integration.test_minimization_jobs import minclient as minclient
from tests.support.api_client import ApiClient
from tests.support.minimization import molecule, translated

FIXTURES = Path(__file__).parents[1] / "fixtures/minimization"


def prepared_pocket(copies: int = 1) -> tuple[NormalizedStructureV1, ...]:
    protein = NormalizedStructureV1.from_bytes(
        (FIXTURES / "1stp-protein.normalized.json").read_bytes()
    )
    ligand = NormalizedStructureV1.from_bytes(
        (FIXTURES / "1stp-biotin.normalized.json").read_bytes()
    )
    return (*(translated(protein, (60.0 * i, 0, 0)) for i in range(copies)), ligand)


def processes() -> dict[int, tuple[int, int, str]]:
    table = {}
    for path in Path("/proc").glob("[0-9]*/status"):
        try:
            fields = dict(line.split(":", 1) for line in path.read_text().splitlines())
            if fields["State"].strip().startswith("Z"):
                continue
            table[int(path.parent.name)] = (
                int(fields["PPid"]),
                int(fields.get("VmRSS", "0 kB").split()[0]) * 1024,
                fields["Name"].strip(),
            )
        except (OSError, ValueError, KeyError, ProcessLookupError):
            continue
    return table


def owned(table: dict[int, tuple[int, int, str]]) -> dict[int, tuple[int, int, str]]:
    ids = {os.getpid()}
    while True:
        expanded = ids | {pid for pid, (ppid, _, _) in table.items() if ppid in ids}
        if expanded == ids:
            return {pid: table[pid] for pid in ids if pid in table}
        ids = expanded


class Memory:
    def __init__(self):
        self.peak = 0
        self.samples = 0
        self.names: set[str] = set()
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.sample)

    def sample(self):
        while not self.stop.is_set():
            table = owned(processes())
            self.peak = max(self.peak, sum(row[1] for row in table.values()))
            self.names.update(row[2] for row in table.values())
            self.samples += 1
            self.stop.wait(0.02)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *args):
        self.stop.set()
        self.thread.join(2)


def retain(label: str, value: dict[str, Any], tmp_path: Path):
    root = Path(os.environ.get("MOLWEAVE_MINIMIZATION_EVIDENCE_DIR", str(tmp_path)))
    root.mkdir(parents=True, exist_ok=True)
    (root / f"{label}-{os.getpid()}.json").write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n"
    )


def submit(client: ApiClient, project: dict[str, Any], environment: bool):
    ligand = next(e for e in project["entries"] if e["structure_type"] == "ligand")
    response = client.post(
        f"/api/v1/projects/{project['id']}/minimizations",
        json={
            "expected_revision": project["revision"],
            "mode": "environment" if environment else "isolated",
            "selection": {
                "atoms": [
                    {"structure_id": ligand["id"], "atom_id": i}
                    for i in ligand["atom_ids"]
                ]
            },
            "context": [
                {"entry_id": e["id"], "atom_ids": e["atom_ids"]} for e in project["entries"]
            ]
            if environment
            else [],
            "conformers": {e["id"]: 1 for e in project["entries"]},
            "max_iterations": 500,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize(
    "label,copies", [("ligand", 0), ("prepared-1stp", 1), ("large-assembly", 8)]
)
def test_real_worker_setup_optimization_and_aggregate_rss(
    minclient: ApiClient, tmp_path: Path, label: str, copies: int
):
    if not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"):
        pytest.skip("Locked Linux native profile required for performance qualification")
    project = seeded_project(minclient, *(prepared_pocket(copies) if copies else (molecule(),)))
    before = {e["id"]: _structure(minclient, project["id"], e["id"]) for e in project["entries"]}
    queued = submit(minclient, project, copies > 0)
    start = time.monotonic()
    with Memory() as memory:
        assert _worker(minclient).run_once()
    total = time.monotonic() - start
    job = minclient.get(f"/api/v1/jobs/{queued['id']}").json()
    assert job["status"] == "completed", job
    proposal = minclient.get(
        f"/api/v1/projects/{project['id']}/minimizations/{job['id']}/proposal"
    ).json()
    report = proposal["report"]
    assert report["outcome"] == "converged", report
    assert report["maximum_gradient"] <= 10 and report["final_energy"] < report["initial_energy"]
    events = minclient.get(f"/api/v1/jobs/{job['id']}/events").json()
    times = {
        e["data"].get("progress"): datetime.fromisoformat(e["created_at"])
        for e in events
        if e["kind"] == "progress"
    }
    setup = (times[35] - datetime.fromisoformat(job["started_at"])).total_seconds()
    optimization_and_publication = (times[100] - times[35]).total_seconds()
    assert setup <= 120 and optimization_and_publication <= 60
    assert memory.peak <= 2 * 1024**3
    assert memory.samples > 5
    assert {
        e["id"]: _structure(minclient, project["id"], e["id"]) for e in project["entries"]
    } == before
    assert (
        minclient.get(f"/api/v1/projects/{project['id']}").json()["revision"] == project["revision"]
    )
    assert sum(len(c["atom_ids"]) for c in report["parameters"]["captured_inputs"]) == sum(
        e["atom_count"] for e in project["entries"]
    )
    retain(
        label,
        {
            "case": label,
            "assembly_atoms": sum(e["atom_count"] for e in project["entries"]),
            "movable_atoms": report["movable_count"],
            "setup_seconds": setup,
            "optimization_plus_publication_seconds": optimization_and_publication,
            "total_worker_seconds": total,
            "peak_aggregate_rss_bytes": memory.peak,
            "rss_samples": memory.samples,
            "process_names": sorted(memory.names),
            "outcome": report["outcome"],
            "maximum_gradient": report["maximum_gradient"],
            "iterations": report["iterations"],
            "measurement": (
                "20ms /proc RSS sum: test/API/coordinator parent and all live descendants; "
                "fresh child/parameters, ordinary OS cache; not whole browser/OS memory"
            ),
            "model": report["model"],
        },
        tmp_path,
    )


def test_real_sqm_cancellation_settles_within_five_seconds(minclient: ApiClient, tmp_path: Path):
    if not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"):
        pytest.skip("Locked Linux native profile required for real SQM cancellation")
    project = seeded_project(minclient, molecule("C" * 80))
    queued = submit(minclient, project, False)
    before = _structure(minclient, project["id"], project["entries"][0]["id"])
    errors = []

    def work():
        try:
            _worker(minclient).run_once()
        except BaseException as error:
            errors.append(error)

    thread = threading.Thread(target=work)
    thread.start()
    native_pids = []
    try:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and thread.is_alive():
            native_pids = [pid for pid, row in owned(processes()).items() if row[2] == "sqm"]
            if native_pids:
                break
            time.sleep(0.02)
        assert native_pids, "Real SQM never started; no cancellation measurement claimed"
        start = time.monotonic()
        response = minclient.post(f"/api/v1/jobs/{queued['id']}/cancel")
        assert response.status_code == 200
        thread.join(5)
        elapsed = time.monotonic() - start
        assert not thread.is_alive() and elapsed <= 5
        assert not errors
        assert not set(native_pids) & processes().keys()
        job = minclient.get(f"/api/v1/jobs/{queued['id']}").json()
        assert job["status"] == "cancelled" and job["results"] == []
        assert _structure(minclient, project["id"], project["entries"][0]["id"]) == before
        retain(
            "native-cancellation",
            {
                "seconds": elapsed,
                "native_sqm_pids_observed": native_pids,
                "descendants_stopped": True,
                "status": job["status"],
            },
            tmp_path,
        )
    finally:
        if thread.is_alive():
            minclient.post(f"/api/v1/jobs/{queued['id']}/cancel")
            thread.join(8)
