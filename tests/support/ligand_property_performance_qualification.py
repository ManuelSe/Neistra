"""Real descriptor-worker qualification and read-only native evidence collection.

Run ``python -m tests.support.ligand_property_performance_qualification run
--output-dir <fresh-owned-directory>`` only after freezing the candidate. No
services are started. ASGI calls use the production API; calculations use its
ordinary spawned worker. Invoke with the repository's documented API/core/plugin
PYTHONPATH; child processes inherit that environment unchanged. ``observe`` samples
an existing, explicitly supplied test database read-only and never claims that
polling is free of overhead.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import re
import sqlite3
import statistics
import subprocess
import sys
import threading
import time
from contextlib import contextmanager
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from tests.support.performance import performance_budget, performance_enabled

ROOT = Path(__file__).resolve().parents[2]
DATABASE_ALIASES = (
    "NEISTRA_DATA_DIR",
    "NEISTRA_DATABASE_URL",
    "MOLWEAVE_DATA_DIR",
    "MOLWEAVE_DATABASE_URL",
    "DATABASE_URL",
)


def dump(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def source_inventory() -> dict[str, str]:
    paths = (
        subprocess.check_output(
            [
                "git",
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
                "-z",
                "--",
                "apps",
                "packages",
                "scripts",
                "tests/fixtures",
                "tests/e2e/support",
                "tests/support/api_client.py",
                "tests/support/performance.py",
                "package.json",
                "pyproject.toml",
                "uv.lock",
                "pnpm-lock.yaml",
                "playwright.config.ts",
                "tests/support/ligand_property_performance_qualification.py",
                "tests/e2e/ligand-properties-performance.spec.ts",
            ],
            cwd=ROOT,
        )
        .decode()
        .split("\0")
    )
    return {
        name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        for name in sorted(set(paths))
        if name and (ROOT / name).is_file()
    }


def distribution(values: list[float]) -> dict[str, float | int]:
    if not values or any(not math.isfinite(value) or value < 0 for value in values):
        raise ValueError("Every performance sample must be finite and nonnegative")
    ordered = sorted(values)
    return {
        "samples": len(values),
        "median": statistics.median(values),
        "p95": ordered[math.ceil(len(ordered) * 0.95) - 1],
        "max": max(values),
    }


def bulk_smiles(kind: str, index: int) -> str:
    if kind == "repeated":
        return "CCCCCCCCCC"
    if kind != "distinct" or not 0 <= index < 1000:
        raise ValueError("Expected repeated or distinct workload with index below 1000")
    # One unique oxygen terminus removes chain-reversal equivalence. Synthetic
    # C/N sequences are capacity fixtures, not claims of experimentally stable compounds.
    return "O" + "".join("N" if index & (1 << bit) else "C" for bit in range(10)) + "C" * 10


def fixture_manifest() -> dict[str, Any]:
    from rdkit import Chem, rdBase

    seen: set[str] = set()
    rows = []
    for index in range(1000):
        text = bulk_smiles("distinct", index)
        molecule = Chem.MolFromSmiles(text)
        assert molecule is not None and 10 <= molecule.GetNumHeavyAtoms() <= 100
        canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
        assert canonical not in seen, "Distinct capacity fixtures must differ chemically"
        seen.add(canonical)
        rows.append(
            {"smiles": text, "canonical": canonical, "heavy_atoms": molecule.GetNumHeavyAtoms()}
        )
    return {
        "library": rdBase.rdkitVersion,
        "kind": "synthetic operational graphs",
        "distinct": rows,
        "repeated": bulk_smiles("repeated", 0),
    }


def source(entry: dict[str, Any]) -> dict[str, Any]:
    designation = entry["ligand_designation"]
    assert designation["status"] == "resolved", designation
    return {
        "entry_id": entry["id"],
        "source_artifact_id": entry["current_artifact_id"],
        "instance_id": designation["instance_id"],
        "atom_ids": designation["atom_ids"],
    }


def coordinate_baseline(
    command: dict[str, Any], persisted: dict[str, Any], canonical: dict[str, Any]
) -> dict[str, Any]:
    """Validate only the observed single-entry command transport differences.

    The complete persisted DTO remains the later exact no-mutation oracle. This
    function never strips arbitrary fields, timestamp precision or molecular data.
    """
    assert len(command["entries"]) == len(persisted["entries"]) == 1
    entry = persisted["entries"][0]
    assert canonical["entry_id"] == entry["id"]
    assert canonical["artifact_id"] == entry["current_artifact_id"]
    patches = command["structure_patches"]
    assert len(patches) == 1 and persisted["structure_patches"] == []
    patch = patches[0]
    assert set(patch) == {"entry_id", "artifact_id", "atom_ids", "coordinates"}
    assert patch["entry_id"] == entry["id"]
    assert patch["artifact_id"] == entry["current_artifact_id"]
    atom_ids = entry["atom_ids"]
    assert atom_ids and all(type(value) is int for value in atom_ids)
    assert atom_ids == sorted(set(atom_ids))
    assert all(type(value) is int for value in patch["atom_ids"])
    assert patch["atom_ids"] == atom_ids
    atoms = canonical["structure"]["atoms"]
    assert len(atoms) == len(atom_ids)
    by_id = {atom["id"]: atom for atom in atoms}
    assert len(by_id) == len(atoms) and sorted(by_id) == atom_ids
    coordinates = [by_id[atom_id]["coordinates"] for atom_id in atom_ids]
    assert all(
        len(point) == 3
        and all(type(value) in (int, float) and math.isfinite(value) for value in point)
        for point in coordinates
    )
    assert all(
        len(point) == 3
        and all(type(value) in (int, float) and math.isfinite(value) for value in point)
        for point in patch["coordinates"]
    )
    assert patch["coordinates"] == coordinates
    comparable = deepcopy(command)
    suffix_differences = []
    for label, left, right in (
        ("/modified_at", comparable, persisted),
        ("/entries/0/modified_at", comparable["entries"][0], entry),
    ):
        acknowledged, stored = left["modified_at"], right["modified_at"]
        if acknowledged != stored:
            # SQLite's reload omits the literal UTC suffix while retaining every
            # fractional digit. No parsing/rounding/offset conversion is allowed.
            assert isinstance(acknowledged, str) and isinstance(stored, str)
            assert acknowledged == stored + "Z"
            assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}", stored)
            suffix_differences.append(
                {"path": label, "acknowledged": acknowledged, "persisted": stored}
            )
            left["modified_at"] = stored
    # The only omitted transport data has already been verified in full against
    # the exact immutable canonical artifact, including membership and coordinates.
    comparable["structure_patches"] = []
    assert comparable == persisted, "An additional command/persisted difference is forbidden"
    return {
        "scope": "Exact single-entry command transport validation; entire persisted DTO retained",
        "timestamp_suffix_differences": suffix_differences,
        "validated_patch": patch,
        "canonical_entry_id": canonical["entry_id"],
        "canonical_artifact_id": canonical["artifact_id"],
    }


class Calls:
    """Count actual API requests; no substituted scientific responses."""

    def __init__(self, client: Any) -> None:
        self.client = client
        self.records: list[dict[str, Any]] = []

    def send(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        started = time.perf_counter()
        response = self.client.request(method, path, **kwargs)
        self.records.append(
            {
                "method": method,
                "path": path,
                "status": response.status_code,
                "seconds": time.perf_counter() - started,
                "response_bytes": len(response.content),
            }
        )
        assert response.is_success, (method, path, response.status_code, response.text)
        return dict(response.json())


def import_project(calls: Calls, label: str, smiles: list[str]) -> dict[str, Any]:
    project = calls.send("POST", "/api/v1/projects", json={"name": label})
    for offset in range(0, len(smiles), 50):
        files = [
            ("files", ("capacity.smi", f"{text} capacity\n".encode(), "chemical/x-daylight-smiles"))
            for text in smiles[offset : offset + 50]
        ]
        project = calls.send(
            "POST",
            f"/api/v1/projects/{project['id']}/imports",
            data={"expected_revision": project["revision"], "generate_3d": "false"},
            files=files,
        )["project"]
    assert len(project["entries"]) == len(smiles)
    return project


def job_rows(database: Path, project_id: str | None = None) -> dict[str, Any]:
    """Read positively associated executions and ordinary jobs without mutating SQLite."""
    with sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True, timeout=5) as db:
        db.row_factory = sqlite3.Row
        clause, params = (
            (" WHERE j.project_id = ?", (project_id,))
            if project_id
            else (" WHERE j.purpose = 'ligand_properties'", ())
        )
        rows = db.execute(
            "SELECT j.id,j.project_id,j.job_type,j.purpose,j.status,j.started_at,j.completed_at,"
            "j.provenance,j.result_values,e.id AS execution_id,e.child_pid,e.child_start_token,"
            "e.reaped,e.captures FROM jobs j "
            "LEFT JOIN ligand_property_executions e ON e.job_id=j.id" + clause,
            params,
        ).fetchall()
        jobs = []
        for row in rows:
            item = dict(row)
            for key in ("provenance", "result_values", "captures"):
                item[key] = json.loads(item[key]) if item[key] is not None else None
            jobs.append(item)
        retained = {}
        for table in (
            "ligand_property_content",
            "ligand_property_proofs",
            "ligand_property_bindings",
            "ligand_property_consumers",
            "ligand_property_executions",
        ):
            retained[table] = db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        retained["content_bytes"] = db.execute(
            "SELECT coalesce(sum(size),0) FROM ligand_property_content"
        ).fetchone()[0]
    return {"jobs": jobs, "retained": retained}


def rss_bytes(pid: int) -> int | None:
    try:
        for line in Path(f"/proc/{pid}/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    except (OSError, ValueError):
        pass
    return None


def owned_process(row: dict[str, Any]) -> tuple[int, str] | None:
    """Confirm the persisted child start token and process group before sampling."""
    pid, token = row["child_pid"], row["child_start_token"]
    if not pid or not token:
        return None
    try:
        stat = Path(f"/proc/{pid}/stat").read_text()
        fields = stat[stat.rindex(")") + 2 :].split()
        if fields[19] == token and int(fields[2]) == pid and fields[0] != "Z":
            return int(fields[1]), str(pid)
    except (OSError, ValueError, IndexError):
        pass
    return None


@contextmanager
def application(data: Path) -> Any:
    from neistra_api.main import create_app
    from neistra_api.settings import Settings

    from tests.support.api_client import ApiClient

    assert not data.exists()
    data.mkdir()
    database = data / "molweave.db"
    env = {key: value for key, value in os.environ.items() if key not in DATABASE_ALIASES}
    env.update(NEISTRA_DATA_DIR=str(data), NEISTRA_DATABASE_URL=f"sqlite:///{database}")
    migration = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        check=False,
    )
    (data / "migration.log").write_bytes(migration.stdout + migration.stderr)
    assert migration.returncode == 0, migration.stderr.decode(errors="replace")
    app = create_app(Settings(data_dir=data, database_url=f"sqlite:///{database}"))
    try:
        yield Calls(ApiClient(app)), app, database
    finally:
        app.state.engine.dispose()


class WorkerTrace:
    def __init__(self, app: Any, database: Path) -> None:
        from neistra_api.job_worker import JobWorker
        from sqlalchemy import event

        self.worker = JobWorker(
            app.state.settings,
            app.state.session_factory,
            app.state.job_registry,
            "descriptor-performance",
        )
        self.database = database
        self.iterations: list[dict[str, Any]] = []
        self.jobs: dict[str, Any] = {}
        self.sql_statements = 0

        def count(*args: Any) -> None:
            self.sql_statements += 1

        event.listen(app.state.engine, "before_cursor_execute", count)
        self.worker.recover_abandoned()

    def once(self) -> bool:
        started, sql_before = time.perf_counter(), self.sql_statements
        stopped = threading.Event()
        memory: dict[str, Any] = {
            "interval_seconds": 0.02,
            "samples": 0,
            "peak_parent_combined_api_coordinator_rss_bytes": 0,
            "peak_owned_children_rss_bytes": {},
        }
        sampling_errors: list[str] = []

        def sample_memory() -> None:
            try:
                while not stopped.is_set():
                    memory["samples"] += 1
                    memory["peak_parent_combined_api_coordinator_rss_bytes"] = max(
                        memory["peak_parent_combined_api_coordinator_rss_bytes"],
                        rss_bytes(os.getpid()) or 0,
                    )
                    for row in job_rows(self.database)["jobs"]:
                        if owned_process(row) is not None:
                            identity = f"{row['child_pid']}:{row['child_start_token']}"
                            memory["peak_owned_children_rss_bytes"][identity] = max(
                                memory["peak_owned_children_rss_bytes"].get(identity, 0),
                                rss_bytes(row["child_pid"]) or 0,
                            )
                    stopped.wait(0.02)
            except Exception as error:
                sampling_errors.append(repr(error))

        sampler = threading.Thread(target=sample_memory, daemon=True)
        sampler.start()
        try:
            worked = self.worker.run_once()
        finally:
            stopped.set()
            sampler.join(timeout=5)
        assert not sampler.is_alive() and not sampling_errors, sampling_errors
        elapsed = time.perf_counter() - started
        snapshot = job_rows(self.database)
        self.jobs.update({row["id"]: row for row in snapshot["jobs"]})
        metrics = dict(self.worker.property_metrics)
        assert metrics.get("coordinator_native_preparations") == 0
        assert 0 <= metrics["source_proofs"] <= 8
        assert 0 <= metrics["verified_bytes"] <= 64 * 1024 * 1024
        if "source_read_calls" in metrics:
            assert 0 <= metrics["source_read_calls"] <= 16
            assert metrics["source_read_byte_cap"] <= 64 * 1024 * 1024 + 16
        if "publication_verified_bytes" in metrics:
            assert 0 <= metrics["publication_verified_bytes"] <= 64 * 1024 * 1024
            assert 0 <= metrics["publication_source_reads"] <= 16
            assert metrics["publication_read_byte_cap"] <= 64 * 1024 * 1024 + 16
        for key in ("raw_proof_seconds", "coordinator_seconds"):
            assert math.isfinite(metrics[key]) and metrics[key] >= 0
        materialized = metrics.get("input_materialization")
        if materialized is not None:
            assert 1 <= materialized["source_count"] <= 8
            assert 0 <= materialized["verified_bytes"] <= 64 * 1024 * 1024
            assert 0 < materialized["envelope_bytes"] <= 96 * 1024 * 1024
            assert math.isfinite(materialized["seconds"]) and materialized["seconds"] >= 0
        assert snapshot["retained"]["content_bytes"] <= 16 * 1024 * 1024
        assert snapshot["retained"]["ligand_property_content"] <= 2048
        assert snapshot["retained"]["ligand_property_proofs"] <= 4096
        self.iterations.append(
            {
                "seconds": elapsed,
                "worked": worked,
                "sql_statements": self.sql_statements - sql_before,
                "metrics": metrics,
                "memory": memory,
                "retained": snapshot["retained"],
                "parent_combined_api_coordinator_rss_bytes": rss_bytes(os.getpid()),
            }
        )
        return bool(worked)


def allocate(
    calls: Calls, project: dict[str, Any], entries: list[dict[str, Any]], active: str | None = None
) -> dict[str, Any]:
    base = f"/api/v1/projects/{project['id']}/ligand-properties"
    owner = calls.send("POST", f"{base}/consumers")
    payload = {
        "entries": [source(entry) for entry in entries],
        "descriptor_ids": [],
        "sequence": 1,
        "active_entry_id": active,
    }
    calls.send("PUT", f"{base}/consumers/{owner['consumer_id']}", json=payload)
    return {"id": owner["consumer_id"], "payload": payload, "renewed": time.monotonic()}


def renew(calls: Calls, project: dict[str, Any], owners: list[dict[str, Any]]) -> None:
    for owner in owners:
        if time.monotonic() - owner["renewed"] >= 20:
            calls.send(
                "PUT",
                f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{owner['id']}",
                json=owner["payload"],
            )
            owner["renewed"] = time.monotonic()


def read(
    calls: Calls, project: dict[str, Any], entries: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    result = calls.send(
        "POST",
        f"/api/v1/projects/{project['id']}/ligand-properties/read",
        json={"entries": [source(entry) for entry in entries], "descriptor_ids": []},
    )
    assert result["project_id"] == project["id"]
    assert [row["source"] for row in result["entries"]] == [source(entry) for entry in entries]
    return list(result["entries"])


def ready(
    calls: Calls,
    trace: WorkerTrace,
    project: dict[str, Any],
    owners: list[dict[str, Any]],
    entries: list[dict[str, Any]],
    *,
    require_qualified: bool = True,
) -> list[dict[str, Any]]:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        rows = read(calls, project, entries)
        if all(row["status"] == "ready" for row in rows):
            for row in rows:
                if require_qualified:
                    assert row["report"]["model_status"] == "qualified", row
                    assert all(value["status"] == "ready" for value in row["report"]["values"]), row
            return rows
        assert all(row["status"] == "pending" or row["status"] == "ready" for row in rows), rows
        renew(calls, project, owners)
        assert trace.once(), "Useful pending demands made no worker progress"
    raise AssertionError("Current property result did not settle within the readiness bound")


def release(calls: Calls, project: dict[str, Any], owner: dict[str, Any]) -> None:
    calls.send(
        "DELETE",
        f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{owner['id']}",
        params={"sequence": owner["payload"]["sequence"] + 1},
    )


def sample(output: Path, index: int) -> dict[str, Any]:
    setup_started = time.perf_counter()
    with application(output / "store") as (calls, app, database):
        project = import_project(calls, f"Cold descriptor {index}", ["C" * (10 + index * 4)])
        before = calls.send("GET", f"/api/v1/projects/{project['id']}")
        trace = WorkerTrace(app, database)
        setup_seconds = time.perf_counter() - setup_started
        started = time.perf_counter()
        owner = allocate(calls, project, project["entries"], project["entries"][0]["id"])
        rows = ready(calls, trace, project, [owner], project["entries"])
        elapsed = 1000 * (time.perf_counter() - started)
        performance_budget(elapsed, 2000, "cold API/real-worker result ms")
        assert calls.send("GET", f"/api/v1/projects/{project['id']}") == before
        entry = project["entries"][0]
        changed = calls.send(
            "POST",
            f"/api/v1/projects/{project['id']}/selection-transform",
            json={
                "expected_revision": project["revision"],
                "selection": {
                    "atoms": [
                        {"structure_id": entry["id"], "atom_id": atom_id}
                        for atom_id in entry["atom_ids"]
                    ]
                },
                "rotation_matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
                "translation": [1, 0, 0],
            },
        )
        # Command patches are transport output, not persisted project fields.
        # Capture observations before validation and outside the warm timer.
        dump(output / "coordinate-command.json", changed)
        dump(output / "coordinate-before-command.json", before)
        persisted = calls.send("GET", f"/api/v1/projects/{project['id']}")
        dump(output / "coordinate-persisted-before.json", persisted)
        dump(output / "coordinate-patch.json", changed.get("structure_patches"))
        canonical = calls.send(
            "GET",
            f"/api/v1/projects/{project['id']}/entries/{entry['id']}/structure",
            params={"expected_artifact_id": changed["entries"][0]["current_artifact_id"]},
        )
        dump(output / "coordinate-canonical.json", canonical)
        dump(output / "coordinate-baseline-calls.json", calls.records)
        baseline_proof = coordinate_baseline(changed, persisted, canonical)
        dump(output / "coordinate-baseline-proof.json", baseline_proof)
        assert source(changed["entries"][0]) != source(entry)
        assert read(calls, changed, changed["entries"])[0]["status"] == "pending"
        previous_jobs = set(trace.jobs)
        coordinate_started = time.perf_counter()
        owner["payload"].update(sequence=2, entries=[source(changed["entries"][0])])
        calls.send(
            "PUT",
            f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{owner['id']}",
            json=owner["payload"],
        )
        reused = ready(calls, trace, changed, [owner], changed["entries"])
        coordinate_ms = 1000 * (time.perf_counter() - coordinate_started)
        after_coordinate = calls.send("GET", f"/api/v1/projects/{project['id']}")
        dump(output / "coordinate-persisted-after.json", after_coordinate)
        dump(output / "coordinate-after-calls.json", calls.records)
        dump(output / "coordinate-reused-report.json", reused)
        performance_budget(coordinate_ms, 100, "coordinate current proof/cache result ms")
        assert reused[0]["report"]["input_hash"] == rows[0]["report"]["input_hash"]
        assert set(trace.jobs) == previous_jobs, "Coordinate reuse must not spawn a descriptor job"
        assert after_coordinate == persisted, "Warm descriptor work changed persisted project state"
        release(calls, project, owner)
        assert not trace.once()
        return {
            "index": index,
            "coordinator_process_pid": os.getpid(),
            "parent_process_pid": os.getppid(),
            "setup_seconds_excluded": setup_seconds,
            "demand_to_current_ms": elapsed,
            "sources": [source(project["entries"][0])],
            "input_hash": rows[0]["report"]["input_hash"],
            "coordinate_reuse": {
                "source": source(changed["entries"][0]),
                "current_result_ms": coordinate_ms,
                "new_jobs": 0,
                "persisted_baseline_exactly_preserved": True,
                "command_projection_proof": baseline_proof,
                "baseline_observation": "Immediate persisted GET and bound canonical structure "
                "read/patch validation precede warm reads/demand and are outside warm timing",
            },
            "calls": calls.records,
            "iterations": trace.iterations,
            "jobs": list(trace.jobs.values()),
            "retention": job_rows(database)["retained"],
            "store": str(output / "store"),
        }


def complex_sample(output: Path) -> dict[str, Any]:
    """Keep the observed full complex; do not assign additional chemical definition."""
    specimen = ROOT / "tests/fixtures/complex/1stp.pdb"
    with application(output / "store") as (calls, app, database):
        project = calls.send("POST", "/api/v1/projects", json={"name": "Observed complex"})
        project = calls.send(
            "POST",
            f"/api/v1/projects/{project['id']}/imports",
            data={"expected_revision": 0, "generate_3d": "false"},
            files=[("files", ("1stp.pdb", specimen.read_bytes(), "chemical/x-pdb"))],
        )["project"]
        assert len(project["entries"]) == 1
        entry = project["entries"][0]
        base = f"/api/v1/projects/{project['id']}/entries/{entry['id']}"
        candidates = calls.send(
            "GET",
            f"{base}/ligand-candidates",
            params={
                "expected_artifact_id": entry["current_artifact_id"],
                "limit": 48,
            },
        )
        exact = [
            candidate
            for candidate in candidates["candidates"]
            if candidate["candidate_key"] in candidates["selectable_candidate_keys"]
            and any(
                location["residue_name"] == "BTN"
                and location["chain_name"] == "A"
                and location["author_number"] == 300
                for location in candidate["locations"]
            )
        ]
        assert len(exact) == 1, "The observed BTN A300 fixture must have one exact source instance"
        project = calls.send(
            "PUT",
            f"{base}/ligand-designation",
            json={
                "expected_revision": project["revision"],
                "expected_artifact_id": entry["current_artifact_id"],
                "expected_input_hash": candidates["input_hash"],
                "candidate_key": exact[0]["candidate_key"],
            },
        )
        trace = WorkerTrace(app, database)
        started = time.perf_counter()
        owner = allocate(calls, project, project["entries"], entry["id"])
        rows = ready(calls, trace, project, [owner], project["entries"], require_qualified=False)
        elapsed = 1000 * (time.perf_counter() - started)
        report = rows[0]["report"]
        heavy = next(
            value for value in report["values"] if value["descriptor_id"] == "heavy_atom_count"
        )
        assert heavy["status"] == "ready" and heavy["value"] == 16
        if report["model_status"] != "qualified":
            assert report["model_reason"], "Unsupported source chemistry must disclose its reason"
            assert any(value["status"] == "unavailable" for value in report["values"])
        release(calls, project, owner)
        assert not trace.once()
        return {
            "scope": (
                "Original full complex with deliberate exact BTN A300; "
                "no extra chemistry assignment"
            ),
            "original_sha256": hashlib.sha256(specimen.read_bytes()).hexdigest(),
            "full_source_atoms": len(project["entries"][0]["atom_ids"]),
            "source": source(project["entries"][0]),
            "current_result_ms": elapsed,
            "scientific_model_qualified": report["model_status"] == "qualified",
            "report": report,
            "calls": calls.records,
            "iterations": trace.iterations,
            "jobs": list(trace.jobs.values()),
        }


class WorkOrderTail:
    """Mirror only newly completed records from the explicitly owned worker trace."""

    def __init__(
        self, trace: Path, output: Path, database: Path, inventory: dict[str, str]
    ) -> None:
        trace = trace.resolve()
        assert trace == database.resolve().parent / "qualification/worker-turns.jsonl"
        assert trace.is_file() and not trace.is_symlink()
        self.path = trace
        self.incomplete = trace.with_suffix(".jsonl.incomplete.json")
        assert not self.incomplete.exists()
        self.source = trace.open("rb")
        header_bytes = self.source.readline(QualificationWorkerTrace.MAX_RECORD_BYTES + 1)
        assert header_bytes.endswith(b"\n")
        header = json.loads(header_bytes)
        assert header["event"] == "header" and header["format_version"] == 1
        assert header["database"] == str(database.resolve())
        assert header["source_digest"] == sha_json(inventory)
        self.source.seek(0, 2)
        size = self.source.tell()
        start = max(0, size - 2 * QualificationWorkerTrace.MAX_RECORD_BYTES - 1)
        self.source.seek(start)
        suffix = self.source.read()
        last_newline = suffix.rfind(b"\n")
        assert last_newline >= 0
        completed_offset = start + last_newline + 1
        completed = suffix[:last_newline].rsplit(b"\n", 1)[-1]
        previous = json.loads(completed)
        self.source.seek(completed_offset)
        self.buffer = b""
        self.destination = output.parent / "work-order-observed.jsonl"
        self.target = self.destination.open("xb")
        self.target.write(header_bytes)
        self.state: dict[str, Any] = {
            "scope": "Contiguous completed records after start; worker continues normally",
            "trace": str(trace),
            "observed_records": str(self.destination),
            "header": header,
            "start_record": previous["record"],
            "last_record": previous["record"],
            "records": 0,
            "source_start_offset": completed_offset,
            "complete": False,
        }

    def poll(self) -> None:
        assert not self.incomplete.exists(), (
            "The worker trace explicitly reports incomplete evidence"
        )
        while block := self.source.read(1024 * 1024):
            self.buffer += block
            lines = self.buffer.split(b"\n")
            self.buffer = lines.pop()
            assert len(self.buffer) <= QualificationWorkerTrace.MAX_RECORD_BYTES
            for line in lines:
                assert 0 < len(line) <= QualificationWorkerTrace.MAX_RECORD_BYTES
                record = json.loads(line)
                assert record["record"] == self.state["last_record"] + 1
                self.state["last_record"] = record["record"]
                self.state["records"] += 1
                self.target.write(line + b"\n")
            self.target.flush()
            assert self.source.tell() <= QualificationWorkerTrace.MAX_BYTES

    def finish(self) -> dict[str, Any]:
        self.poll()
        if self.buffer:
            partial = self.destination.with_suffix(".trailing-partial")
            partial.write_bytes(self.buffer)
            self.state["trailing_inflight_record"] = {
                "path": str(partial),
                "bytes": len(self.buffer),
            }
        self.target.flush()
        self.target.close()
        self.source.close()
        self.state.update(
            complete=True,
            observed_bytes=self.destination.stat().st_size,
            observed_sha256=hashlib.sha256(self.destination.read_bytes()).hexdigest(),
        )
        return self.state


def observe(
    database: Path, output: Path, stop: Path, project_id: str | None, turn_trace: Path | None = None
) -> None:
    assert database.is_file() and not output.exists()
    output.parent.mkdir(parents=True, exist_ok=True)
    state: dict[str, Any] = {
        "scope": "Read-only test-store observations; 100ms sampling overhead retained",
        "started_utc": datetime.now(UTC).isoformat(),
        "samples": 0,
        "jobs": {},
        "peak_child_rss_bytes": {},
        "complete": False,
        "sources_before": source_inventory(),
        "source_inventory_scope": (
            "Production, configuration, fixtures and harness; "
            "full release map remains owned by its gate"
        ),
    }
    tail = (
        WorkOrderTail(turn_trace, output, database, state["sources_before"])
        if turn_trace is not None
        else None
    )
    if tail is not None:
        state["work_order"] = tail.state
    fingerprints: dict[str, str] = {}
    last_write = 0.0
    deadline = time.monotonic() + 3600
    while True:
        assert time.monotonic() < deadline, "Observer stop file was not supplied within one hour"
        if tail is not None:
            tail.poll()
        snapshot = job_rows(database, project_id)
        changed = False
        for row in snapshot["jobs"]:
            # Preserve exact source/order/phase evidence without rewriting private
            # capture path manifests on every 100ms RSS sample. The owned database
            # itself remains intact for the complete qualification packet.
            if row["captures"] is not None:
                row["captures"] = [
                    {
                        "semantic_fingerprint": item.get("semantic_fingerprint"),
                        "targets": [{"source": target["source"]} for target in item["targets"]],
                    }
                    for item in row["captures"]
                ]
            fingerprint = hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()
            if fingerprints.get(row["id"]) != fingerprint:
                changed = True
                fingerprints[row["id"]] = fingerprint
                state["jobs"][row["id"]] = row
            identity = owned_process(row)
            if identity is not None and (rss := rss_bytes(row["child_pid"])) is not None:
                key = f"{row['child_pid']}:{row['child_start_token']}"
                state["peak_child_rss_bytes"][key] = max(
                    state["peak_child_rss_bytes"].get(key, 0), rss
                )
                parents = state.setdefault("peak_worker_parent_rss_bytes", {})
                parents[str(identity[0])] = max(
                    parents.get(str(identity[0]), 0), rss_bytes(identity[0]) or 0
                )
        running = sum(
            row["execution_id"] is not None and row["status"] == "running"
            for row in snapshot["jobs"]
        )
        state["max_running_property_jobs"] = max(state.get("max_running_property_jobs", 0), running)
        state["retained"] = snapshot["retained"]
        state["samples"] += 1
        if changed or time.monotonic() - last_write >= 1:
            dump(output, state)
            last_write = time.monotonic()
        if stop.exists():
            break
        time.sleep(0.1)
    if tail is not None:
        state["work_order"] = tail.finish()
    state["sources_after"] = source_inventory()
    state["sources_unchanged"] = state["sources_after"] == state["sources_before"]
    assert state["sources_unchanged"], "The observed candidate changed during qualification"
    state.update(complete=True, finished_utc=datetime.now(UTC).isoformat())
    dump(output, state)


class QualificationWorkerTrace:
    """Bounded observation of exact production calls; never an alternate scheduler."""

    MAX_BYTES = 128 * 1024 * 1024
    MAX_RECORDS = 200_000
    MAX_TURNS = 100_000
    MAX_RECORD_BYTES = 256 * 1024

    def __init__(self, path: Path, settings: Any) -> None:
        self.path = path.resolve()
        data = settings.data_dir.resolve()
        assert self.path == data / "qualification/worker-turns.jsonl"
        assert not settings.data_dir.is_symlink()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        assert not any(
            parent.is_symlink()
            for parent in [path, *path.parents]
            if parent.is_relative_to(settings.data_dir)
        )
        assert not self.path.exists()
        self.incomplete_path = self.path.with_suffix(".jsonl.incomplete.json")
        assert not self.incomplete_path.exists()
        self.handle = self.path.open("x", encoding="utf-8", buffering=1)
        self.records, self.bytes, self.turn = 0, 0, 0
        self.context: dict[str, Any] | None = None
        self.materializing = False
        self.seen_targets: set[str] = set()
        self.last_active = ""
        self.failed = False
        assert settings.database_url.startswith("sqlite:///")
        database = Path(settings.database_url.removeprefix("sqlite:///")).resolve()
        inventory = source_inventory()
        inventory_path = self.path.with_suffix(".sources.json")
        with inventory_path.open("x") as handle:
            handle.write(json.dumps(inventory, sort_keys=True) + "\n")
        self.emit(
            "header",
            format_version=1,
            database=str(database),
            data_dir=str(data),
            worker_pid=os.getpid(),
            sources=inventory_path.name,
            source_digest=sha_json(inventory),
            source_count=len(inventory),
            caps={
                "bytes": self.MAX_BYTES,
                "records": self.MAX_RECORDS,
                "turns": self.MAX_TURNS,
                "record_bytes": self.MAX_RECORD_BYTES,
            },
            scope="Qualification-only observation of exact worker.main and production methods; "
            "trace overhead included, no controlled reference-host claim",
        )

    def fail(self, reason: str) -> None:
        if not self.failed:
            self.failed = True
            record = {
                "complete": False,
                "reason": reason,
                "records": self.records,
                "bytes": self.bytes,
                "turn": self.turn,
                "trace": str(self.path),
            }
            with self.incomplete_path.open("x") as handle:
                handle.write(json.dumps(record) + "\n")
        raise RuntimeError("Qualification worker trace incomplete: " + reason)

    def emit(self, event: str, **fields: Any) -> None:
        if self.failed:
            raise RuntimeError("Qualification worker trace already incomplete")
        row = {
            "record": self.records + 1,
            "event": event,
            "turn": self.context["turn"] if self.context is not None else None,
            "epoch_us": time.time_ns() // 1000,
            "monotonic_ns": str(time.monotonic_ns()),
            **fields,
        }
        try:
            encoded = json.dumps(row, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n"
        except (TypeError, ValueError):
            self.fail("record is not finite JSON; no incomplete record was published")
        size = len(encoded.encode())
        if size > self.MAX_RECORD_BYTES:
            self.fail("per-record byte cap exceeded")
        if self.records >= self.MAX_RECORDS or self.bytes + size > self.MAX_BYTES:
            self.fail("total byte/record cap exceeded; no records were silently dropped")
        try:
            self.handle.write(encoded)
            self.handle.flush()
        except OSError:
            self.fail("trace write failed; captured interval is incomplete")
        self.records += 1
        self.bytes += size

    @staticmethod
    def source_stamp(value: dict[str, Any]) -> dict[str, Any]:
        members = value["atom_ids"]
        return {
            "entry_id": value["entry_id"],
            "source_artifact_id": value["source_artifact_id"],
            "instance_id": value["instance_id"],
            "atom_count": len(members),
            "membership_sha256": hashlib.sha256(
                json.dumps(members, separators=(",", ":")).encode()
            ).hexdigest(),
        }

    @staticmethod
    def utc(value: Any) -> str:
        assert isinstance(value, datetime)
        return (
            value.replace(tzinfo=UTC).isoformat(timespec="microseconds")
            if value.tzinfo is None
            else value.astimezone(UTC).isoformat(timespec="microseconds")
        )

    def target(self, target: dict[str, Any]) -> dict[str, Any]:
        return {
            "project_id": target["project_id"],
            "source": self.source_stamp(target["source"]),
            "source_key": target["source_key"],
            "active": bool(target.get("active", False)),
            "consumers": [
                {
                    "id": row["id"],
                    "generation": row["generation"],
                    "descriptor_ids": list(row["descriptor_ids"]),
                }
                for row in target["consumers"]
            ],
        }

    def loaded_job(self, job: Any) -> dict[str, Any] | None:
        if job is None:
            return None
        # Read already loaded state only. Accessing an expired ORM attribute here
        # could introduce a hidden SQL query into the measured coordinator.
        raw = vars(job)
        required = {"id", "project_id", "purpose", "job_type", "created_at"}
        if not required <= raw.keys():
            self.fail("required job trace fields were not loaded; no lazy load attempted")
        return {
            key: self.utc(raw[key]) if isinstance(raw[key], datetime) else raw[key]
            for key in required
        }

    def observe_active(self, owners: list[Any]) -> None:
        active = []
        for owner in owners:
            raw = vars(owner)
            if raw.get("active_entry_id") is None:
                continue
            required = {"id", "project_id", "generation", "sequence", "updated_at", "entries_json"}
            if not required <= raw.keys():
                self.fail("active owner fields were not loaded; no lazy load attempted")
            matches = [
                value
                for value in raw["entries_json"]
                if value["entry_id"] == raw["active_entry_id"]
            ]
            if len(matches) != 1:
                self.fail("active owner does not identify one actual source")
            active.append(
                {
                    "id": raw["id"],
                    "project_id": raw["project_id"],
                    "generation": raw["generation"],
                    "sequence": raw["sequence"],
                    "accepted_updated_at": self.utc(raw["updated_at"]),
                    "source": self.source_stamp(matches[0]),
                }
            )
        active.sort(key=lambda row: row["id"])
        if self.context is not None:
            self.context["active_owners"] = active
        identity = sha_json(active)
        if identity != self.last_active:
            self.last_active = identity
            self.emit("active_owners", owners=active)

    def install(self) -> None:
        from neistra_api.job_service import JobService
        from neistra_api.job_worker import JobWorker
        from neistra_api.ligand_property_service import LigandPropertyService

        recorder = self
        original_run: Any = JobWorker.run_once
        original_materialize: Any = LigandPropertyService.materialize
        original_claim: Any = JobService.claim_next
        original_owners: Any = LigandPropertyService._live_consumers
        original_live: Any = LigandPropertyService._target_live
        original_bind: Any = LigandPropertyService._bind

        def run_once(worker: Any) -> Any:
            if recorder.context is not None:
                recorder.fail("overlapping run_once calls are outside this single-worker contract")
            recorder.turn += 1
            if recorder.turn > recorder.MAX_TURNS:
                recorder.fail("turn cap exceeded")
            recorder.context = {
                "turn": recorder.turn,
                "ordinary_checks": 0,
                "ordinary_claims": [],
                "active_owners": [],
                "streak_before": vars(worker).get("_property_streak"),
                "active_streak_before": vars(worker).get("_active_property_streak"),
            }
            recorder.seen_targets.clear()
            recorder.emit(
                "turn_begin",
                streak=recorder.context["streak_before"],
                active_streak=recorder.context["active_streak_before"],
            )
            try:
                result = original_run(worker)
            except BaseException as error:
                recorder.emit("turn_error", exception=type(error).__name__)
                raise
            else:
                recorder.emit(
                    "turn_end",
                    worked=result,
                    **{key: value for key, value in recorder.context.items() if key != "turn"},
                    streak_after=vars(worker).get("_property_streak"),
                    active_streak_after=vars(worker).get("_active_property_streak"),
                )
                return result
            finally:
                recorder.context = None
                recorder.materializing = False

        def materialize(service: Any, *args: Any, **kwargs: Any) -> Any:
            recorder.materializing = True
            admitted: list[dict[str, Any]] = []
            if recorder.context is not None:
                recorder.context["materialize"] = {
                    "prefer_bulk": bool(kwargs.get("prefer_bulk", False)),
                    "kind": "running",
                    "admitted": admitted,
                }
            try:
                result = original_materialize(service, *args, **kwargs)
            except BaseException as error:
                if recorder.context is not None:
                    recorder.context["materialize"].update(
                        kind="exception", exception=type(error).__name__
                    )
                raise
            else:
                kind = (
                    "True"
                    if result is True
                    else "False"
                    if result is False
                    else "None"
                    if result is None
                    else "Job"
                )
                summary = {
                    "kind": kind,
                    "prefer_bulk": bool(kwargs.get("prefer_bulk", False)),
                    "metrics": dict(vars(service).get("last_metrics", {})),
                    "admitted": admitted,
                }
                if kind == "Job":
                    summary["job"] = recorder.loaded_job(result)
                if recorder.context is not None:
                    recorder.context["materialize"] = summary
                if kind in {"True", "Job"}:
                    recorder.emit("materialize_return", **summary)
                return result
            finally:
                recorder.materializing = False

        def claim(service: Any, *args: Any, **kwargs: Any) -> Any:
            if recorder.context is not None:
                recorder.context["ordinary_checks"] += 1
            result = original_claim(service, *args, **kwargs)
            if result is not None:
                row = recorder.loaded_job(result)
                if recorder.context is not None:
                    recorder.context["ordinary_claims"].append(row)
                recorder.emit("ordinary_claim", job=row)
            return result

        def owners(service: Any, *args: Any, **kwargs: Any) -> Any:
            result = original_owners(service, *args, **kwargs)
            recorder.observe_active(result)
            return result

        def live(service: Any, target: dict[str, Any], *args: Any, **kwargs: Any) -> Any:
            result = original_live(service, target, *args, **kwargs)
            stamp = recorder.target(target)
            phase = "materialize" if recorder.materializing else "execution_or_publication"
            identity = sha_json([phase, stamp, bool(result)])
            if identity not in recorder.seen_targets:
                recorder.seen_targets.add(identity)
                recorder.emit("target_live", phase=phase, live=bool(result), target=stamp)
            if result and recorder.materializing and recorder.context is not None:
                admitted = recorder.context["materialize"]["admitted"]
                if stamp not in admitted:
                    admitted.append(stamp)
            return result

        def bind(service: Any, target: dict[str, Any], input_hash: str) -> Any:
            result = original_bind(service, target, input_hash)
            recorder.emit(
                "bind_return",
                target=recorder.target(target),
                input_hash=input_hash,
                phase="method_returned_before_commit; successful turn/current API proof required",
            )
            return result

        for owner, name, method in (
            (JobWorker, "run_once", run_once),
            (LigandPropertyService, "materialize", materialize),
            (JobService, "claim_next", claim),
            (LigandPropertyService, "_live_consumers", owners),
            (LigandPropertyService, "_target_live", live),
            (LigandPropertyService, "_bind", bind),
        ):
            setattr(owner, name, method)


def sha_json(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def qualification_worker(path: Path) -> None:
    from neistra_api import worker
    from neistra_api.settings import Settings

    recorder = QualificationWorkerTrace(path, Settings.from_env())
    recorder.install()
    try:
        # Keep the real settings/plugin registry/health/recovery/run_forever,
        # process ownership and idle sleeps. No qualification scheduler exists.
        worker.main()
    finally:
        if not recorder.failed:
            recorder.emit("worker_stopped")
        recorder.handle.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    worker_parser = commands.add_parser("worker")
    worker_parser.add_argument("--trace", type=Path, required=True)
    run = commands.add_parser("run")
    run.add_argument("--output-dir", type=Path, required=True)
    cold = commands.add_parser("cold")
    cold.add_argument("--output-dir", type=Path, required=True)
    cold.add_argument("--index", type=int, required=True)
    complex_parser = commands.add_parser("complex")
    complex_parser.add_argument("--output-dir", type=Path, required=True)
    watcher = commands.add_parser("observe")
    watcher.add_argument("--database", type=Path, required=True)
    watcher.add_argument("--output", type=Path, required=True)
    watcher.add_argument("--stop-file", type=Path, required=True)
    watcher.add_argument("--project-id")
    watcher.add_argument("--turn-trace", type=Path)
    args = parser.parse_args()
    performance_enabled()
    if args.command == "worker":
        qualification_worker(args.trace)
        return
    if args.command == "observe":
        observe(args.database, args.output, args.stop_file, args.project_id, args.turn_trace)
        return
    output = args.output_dir.resolve()
    assert not output.exists(), "Preserve earlier qualification output; use a fresh directory"
    output.mkdir(parents=True)
    if args.command == "cold":
        dump(output / "result.json", sample(output, args.index))
        return
    if args.command == "complex":
        dump(output / "result.json", complex_sample(output))
        return
    state: dict[str, Any] = {
        "scope": (
            "Five fresh API/coordinator processes and real spawned descriptor children; "
            "browser edits qualified separately"
        ),
        "started_utc": datetime.now(UTC).isoformat(),
        "python": sys.version,
        "platform": platform.platform(),
        "cpu_count": os.cpu_count(),
        "load_average_before": os.getloadavg(),
        "transport": "Production ASGI in-process; real spawned calculations; browser separate",
        "timing_enforced": performance_enabled(),
        "cold_process_starts": [],
        "complete": False,
        "sources_before": source_inventory(),
        "source_inventory_scope": (
            "Production, configuration, fixtures and harness; "
            "full release map remains owned by its gate"
        ),
    }
    fixtures = fixture_manifest()
    dump(output / "fixture-manifest.json", fixtures)
    state["fixture_manifest_sha256"] = hashlib.sha256(
        (output / "fixture-manifest.json").read_bytes()
    ).hexdigest()
    dump(output / "qualification.json", state)
    for index in range(5):
        target = output / f"cold-{index}"
        started = time.perf_counter()
        process = subprocess.run(
            [
                sys.executable,
                "-m",
                "tests.support.ligand_property_performance_qualification",
                "cold",
                "--index",
                str(index),
                "--output-dir",
                str(target),
            ],
            cwd=ROOT,
            capture_output=True,
            check=False,
        )
        (output / f"cold-{index}.log").write_bytes(process.stdout + process.stderr)
        assert process.returncode == 0, (index, process.stderr.decode(errors="replace"))
        row = json.loads((target / "result.json").read_text())
        row["full_process_seconds_including_setup"] = time.perf_counter() - started
        row["actual_enclosing_exit"] = process.returncode
        state["cold_process_starts"].append(row)
        dump(output / "qualification.json", state)
    state["cold_result_ms"] = distribution(
        [row["demand_to_current_ms"] for row in state["cold_process_starts"]]
    )
    complex_output = output / "observed-complex"
    process = subprocess.run(
        [
            sys.executable,
            "-m",
            "tests.support.ligand_property_performance_qualification",
            "complex",
            "--output-dir",
            str(complex_output),
        ],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    (output / "observed-complex.log").write_bytes(process.stdout + process.stderr)
    assert process.returncode == 0, process.stderr.decode(errors="replace")
    state["observed_complex"] = json.loads((complex_output / "result.json").read_text())
    state["sources_after"] = source_inventory()
    assert state["sources_after"] == state["sources_before"], "Candidate sources changed"
    state["load_average_after"] = os.getloadavg()
    state.update(complete=True, finished_utc=datetime.now(UTC).isoformat())
    dump(output / "qualification.json", state)


if __name__ == "__main__":
    main()
