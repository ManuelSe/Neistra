"""Real worker cache provenance, artifacts and paired cold/warm preparation timing."""

from __future__ import annotations

import hashlib
import os
import statistics
from datetime import datetime

import pytest

from tests.integration.test_coordinate_commands import _structure
from tests.integration.test_job_lifecycle import _worker
from tests.integration.test_minimization_apply import seeded_project
from tests.integration.test_minimization_jobs import minclient as minclient
from tests.integration.test_minimization_performance import prepared_pocket, retain, submit


@pytest.mark.skipif(
    not os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX"),
    reason="Locked native cache benchmark required",
)
def test_real_worker_three_paired_cache_runs_preserve_inputs_and_independent_artifacts(
    minclient, monkeypatch, tmp_path
):
    project = seeded_project(minclient, *prepared_pocket())
    before = {e["id"]: _structure(minclient, project["id"], e["id"]) for e in project["entries"]}

    def run(enabled):
        monkeypatch.setenv("MOLWEAVE_MINIMIZATION_CACHE", "1" if enabled else "0")
        queued = submit(minclient, project, True)
        assert _worker(minclient).run_once()
        job = minclient.get(f"/api/v1/jobs/{queued['id']}").json()
        assert job["status"] == "completed", job
        proposal = minclient.get(
            f"/api/v1/projects/{project['id']}/minimizations/{job['id']}/proposal"
        ).json()
        report = proposal["report"]
        assert report["outcome"] == "converged", report
        events = minclient.get(f"/api/v1/jobs/{job['id']}/events").json()
        times = {
            e["data"].get("progress"): datetime.fromisoformat(e["created_at"])
            for e in events
            if e["kind"] == "progress"
        }
        native_calls = [
            e["message"] for e in events if e["kind"] == "log" and ": exited " in e["message"]
        ]
        record = {
            "job_id": job["id"],
            "cache": report["toolchain"].get("parameter_cache"),
            "preparation_seconds": (times[35] - times[5]).total_seconds(),
            "startup_seconds": (
                times[35] - datetime.fromisoformat(job["started_at"])
            ).total_seconds(),
            "native_calls": native_calls,
        }
        return job, record

    primed, prime = run(True)
    cold, warm = [], []
    for _ in range(3):
        _, cold_record = run(False)
        _, warm_record = run(True)
        cold.append(cold_record)
        warm.append(warm_record)
        assert cold_record["native_calls"]
        assert warm_record["cache"]["hit"] and not warm_record["native_calls"]
    cold_median = statistics.median(r["preparation_seconds"] for r in cold)
    warm_median = statistics.median(r["preparation_seconds"] for r in warm)
    evidence = {
        "fixture": "prepared1STP",
        "prime": prime,
        "cold": cold,
        "warm": warm,
        "cold_median_seconds": cold_median,
        "warm_median_seconds": warm_median,
        "preparation_speedup": cold_median / warm_median,
    }
    retain("issue89-cache-pairs", evidence, tmp_path)
    assert warm_median <= cold_median / 2, evidence
    assert max(r["startup_seconds"] for r in [*cold, *warm]) < 120
    model = next(r["artifact"] for r in primed["results"] if r["role"] == "model")
    data = minclient.get(model["download_url"]).content
    assert hashlib.sha256(data).hexdigest() == model["sha256"]
    cache_root = minclient.app.state.settings.data_dir / "cache/minimization"
    cache_root.rename(tmp_path / "retired-native-cache")
    assert minclient.get(model["download_url"]).content == data
    assert {
        e["id"]: _structure(minclient, project["id"], e["id"]) for e in project["entries"]
    } == before
    assert (
        minclient.get(f"/api/v1/projects/{project['id']}").json()["revision"] == project["revision"]
    )
