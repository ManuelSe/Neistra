"""Actual-source shared-schema readers and private derived-state qualification.

The coordinator uses only the standard library. Application imports occur inside
actors whose cwd and module search path identify the selected implementation.
No actor can substitute a current implementation for the tagged predecessor.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import runpy
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, cast

PROTOCOL = "private-derived-shared-schema-v1"
PHASES = ("produce-current", "old-write", "reopen-current")
CASES = (
    "pending",
    "captured",
    "started",
    "completed",
    "cancelled",
    "corrupt",
    "stale",
    "forged",
    "project-deleted",
)
SUFFIXES = ("neistra", "molweave")
HERE = Path(__file__).resolve()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n")


def load(path: Path) -> Any:
    return json.loads(path.read_bytes())


def database(data: Path) -> Path:
    matches = [data / name for name in ("molweave.db", "neistra.db") if (data / name).is_file()]
    assert len(matches) == 1, "One unambiguous owned database is required"
    return matches[0]


def heads(data: Path) -> list[str]:
    with sqlite3.connect(f"{database(data).as_uri()}?mode=ro", uri=True) as connection:
        return sorted(
            row[0] for row in connection.execute("SELECT version_num FROM alembic_version")
        )


def process_identity(pid: int) -> tuple[str, int, str] | None:
    try:
        text = Path(f"/proc/{pid}/stat").read_text()
        fields = text[text.rindex(")") + 2 :].split()
        return fields[19], int(fields[2]), fields[0]
    except (OSError, ValueError, IndexError):
        return None


def live_group_members(group: int) -> list[str]:
    return [
        path.parent.name
        for path in Path("/proc").glob("[0-9]*/stat")
        if (identity := process_identity(int(path.parent.name))) is not None
        and identity[1] == group
        and identity[2] != "Z"
    ]


def assert_no_live_captures(data: Path) -> None:
    """A closed copy must never inherit authority over a living source child."""
    with sqlite3.connect(f"{database(data).as_uri()}?mode=ro", uri=True) as connection:
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE name='ligand_property_executions'"
        ).fetchone()
        if not exists:
            return
        for pid, token in connection.execute(
            "SELECT child_pid, child_start_token FROM ligand_property_executions WHERE reaped=0"
        ):
            identity = process_identity(pid) if pid is not None else None
            if pid is not None and identity is None:
                assert not live_group_members(pid), "Never copy an unreaped orphan process group"
            assert identity is None or identity[0] != token or identity[2] == "Z", (
                "Never copy a live positively identified capture",
                pid,
            )


def closed_copy(source: Path, target: Path) -> None:
    assert source.is_dir() and not target.exists()
    assert not source.is_symlink() and not target.resolve().is_relative_to(source.resolve())
    assert_no_live_captures(source)
    assert not any(path.is_symlink() for path in source.rglob("*"))
    shutil.copytree(source, target)


def environment(root: Path, data: Path) -> dict[str, str]:
    result = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("NEISTRA_", "MOLWEAVE_"))
        and key not in {"PYTHONPATH", "PYTHONOPTIMIZE", "DATABASE_URL"}
    }
    result.update(
        PYTHONPATH=os.pathsep.join(
            str(root / part)
            for part in (
                "apps/api/src",
                "packages/neistra_core/src",
                "packages/neistra_demo_plugin/src",
                ".",
            )
        ),
        PYTHONDONTWRITEBYTECODE="1",
        NEISTRA_DATA_DIR=str(data),
        NEISTRA_DATABASE_URL=f"sqlite:///{data / 'molweave.db'}",
        OPENBLAS_NUM_THREADS="1",
        OMP_NUM_THREADS="1",
    )
    return result


def verify_predecessor(
    current: Path,
    previous: Path,
    receipt: Path,
    version: str,
    tag: str,
    commit: str,
) -> dict[str, Any]:
    assert re.fullmatch(r"\d+\.\d+\.\d+", version)
    assert tag == f"v{version}" and re.fullmatch(r"[0-9a-f]{40}", commit)
    kind = subprocess.check_output(["git", "cat-file", "-t", tag], cwd=current, text=True).strip()
    assert kind == "tag", "An actual annotated predecessor tag is mandatory"
    actual = subprocess.check_output(
        ["git", "rev-parse", f"{tag}^{{}}"],
        cwd=current,
        text=True,
    ).strip()
    assert actual == commit, "Preceding tag identifies a different runtime"
    subprocess.run(
        ["git", "merge-base", "--is-ancestor", commit, "HEAD"],
        cwd=current,
        check=True,
        capture_output=True,
    )
    record = load(receipt)
    assert record["commit"] == commit and record["tag"] == tag and record["files"]
    runner = runpy.run_path(str(current / "docs/assets/ligand-properties/qualification.py.txt"))
    # tagged_identities uses Git in its caller's cwd, never in the extracted tree.
    assert Path.cwd().resolve() == current
    expected = runner["tagged_identities"](tag)
    assert record["files"] == expected
    assert runner["extracted_identities"](previous, expected) == expected
    return {
        "tag": tag,
        "commit": commit,
        "files": len(expected),
        "receipt_sha256": digest(receipt.read_bytes()),
        "annotated_tag": True,
    }


def editing_tools() -> dict[str, Any]:
    return runpy.run_path(str(HERE.with_name("structure_editing_reader_qualification.py")))


def snapshot(data: Path) -> dict[str, Any]:
    helper = runpy.run_path(str(HERE.with_name("schema_boundary_refusal.py")))
    return cast(dict[str, Any], helper["snapshot"](data))


def migrate(root: Path, data: Path) -> None:
    process = subprocess.run(
        [sys.executable, "-B", "-m", "alembic", "upgrade", "head"],
        cwd=root,
        env=environment(root, data),
        capture_output=True,
    )
    assert process.returncode == 0, process.stdout.decode() + process.stderr.decode()


def client_for(root: Path, data: Path, version: str) -> Any:
    from neistra_api.main import create_app
    from neistra_api.settings import Settings

    from tests.support.api_client import ApiClient

    assert Path.cwd().resolve() == root
    app = create_app(Settings(data_dir=data, database_url=f"sqlite:///{database(data)}"))
    assert app.version == version
    app.state.editing_reader_data = str(data)
    return ApiClient(app)


def source(project: dict[str, Any], entry_id: str) -> dict[str, Any]:
    matches = [entry for entry in project["entries"] if entry["id"] == entry_id]
    assert len(matches) == 1, "The exact fixture target must still exist"
    entry = matches[0]
    intent = entry["ligand_designation"]
    assert intent["status"] == "resolved"
    return {
        "entry_id": entry["id"],
        "source_artifact_id": entry["current_artifact_id"],
        "instance_id": intent["instance_id"],
        "atom_ids": intent["atom_ids"],
    }


def response_ok(response: Any, status: int) -> Any:
    assert response.status_code == status, response.text
    return response.json()


def worker(client: Any) -> Any:
    from neistra_api.job_worker import JobWorker

    return JobWorker(
        client.app.state.settings,
        client.app.state.session_factory,
        client.app.state.job_registry,
        "actual-property-reader-worker",
    )


def read_properties(client: Any, project: dict[str, Any], entry_id: str) -> Any:
    return client.post(
        f"/api/v1/projects/{project['id']}/ligand-properties/read",
        json={"entries": [source(project, entry_id)], "descriptor_ids": []},
    )


def demand(
    client: Any,
    project: dict[str, Any],
    entry_id: str,
    *,
    consumer: str | None = None,
    sequence: int = 1,
) -> str:
    base = f"/api/v1/projects/{project['id']}/ligand-properties/consumers"
    if consumer is None:
        consumer = response_ok(client.post(base), 200)["consumer_id"]
    response_ok(
        client.request(
            "PUT",
            f"{base}/{consumer}",
            json={
                "sequence": sequence,
                "entries": [source(project, entry_id)],
                "descriptor_ids": [],
                "active_entry_id": entry_id,
            },
        ),
        200,
    )
    return consumer


def import_ethanol(client: Any, label: str) -> dict[str, Any]:
    project = response_ok(client.post("/api/v1/projects", json={"name": label}), 201)
    payload = HERE.parents[1] / "fixtures/formats/ethanol.mol"
    response_ok(
        client.post(
            f"/api/v1/projects/{project['id']}/imports",
            data={
                "expected_revision": project["revision"],
                "generate_3d": "true",
            },
            files=[("files", ("ethanol.mol", payload.read_bytes(), "chemical/x-mdl-molfile"))],
        ),
        201,
    )
    return cast(dict[str, Any], response_ok(client.get(f"/api/v1/projects/{project['id']}"), 200))


def attach_anchor(client: Any, project: dict[str, Any]) -> tuple[dict[str, Any], str, str]:
    """Keep ordinary user-job inputs distinct from the descriptor deletion target."""
    assert len(project["entries"]) == 1
    target_id = project["entries"][0]["id"]
    project = response_ok(
        client.request(
            "PATCH",
            f"/api/v1/projects/{project['id']}/entries/{target_id}",
            json={"expected_revision": project["revision"], "name": "Descriptor target"},
        ),
        200,
    )
    duplicated = response_ok(
        client.post(
            f"/api/v1/projects/{project['id']}/entries/{target_id}/duplicate",
            json={"expected_revision": project["revision"]},
        ),
        200,
    )
    anchors = [entry for entry in duplicated["entries"] if entry["id"] != target_id]
    assert len(anchors) == 1
    anchor_id = anchors[0]["id"]
    project = response_ok(
        client.request(
            "PATCH",
            f"/api/v1/projects/{project['id']}/entries/{anchor_id}",
            json={"expected_revision": duplicated["revision"], "name": "Retained user-job anchor"},
        ),
        200,
    )
    assert target_id != anchor_id and len(project["entries"]) == 2
    return project, target_id, anchor_id


def ordinary_output(client: Any, project: dict[str, Any], anchor_id: str) -> dict[str, Any]:
    job = response_ok(
        client.post(
            f"/api/v1/projects/{project['id']}/jobs",
            json={
                "job_type": "molweave.demo.structure_statistics",
                "parameters": {"step_count": 1},
                "inputs": [{"role": "structure", "entry_id": anchor_id}],
            },
        ),
        201,
    )
    assert worker(client).run_once()
    result = response_ok(client.get(f"/api/v1/jobs/{job['id']}"), 200)
    assert result["status"] == "completed" and result["results"]
    return cast(dict[str, Any], result)


def output_sha(client: Any, artifact: dict[str, Any]) -> str:
    response = client.get(f"/api/v1/artifacts/{artifact['id']}")
    assert response.status_code == 200, response.text
    assert len(response.content) == artifact["size"]
    observed = digest(response.content)
    assert observed == artifact["sha256"]
    return observed


def job_state(client: Any, project_id: str) -> list[dict[str, Any]]:
    from neistra_api.models import Job
    from sqlalchemy import select

    with client.app.state.session_factory() as session:
        return [
            {
                "id": row.id,
                "status": row.status,
                "job_type": row.job_type,
                "inputs": len(row.inputs),
                "input_entry_ids": [item.entry_id for item in row.inputs],
                "results": len(row.results),
                "parameters": row.parameters,
            }
            for row in session.scalars(
                select(Job).where(Job.project_id == project_id).order_by(Job.id)
            ).all()
        ]


def assert_private_shells(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        if row["job_type"] == "ligand.properties":
            assert row["inputs"] == row["results"] == 0, "Private capture became ordinary data"


def project_state(client: Any, project_id: str) -> dict[str, Any]:
    tools = editing_tools()
    project = response_ok(client.get(f"/api/v1/projects/{project_id}"), 200)
    return {
        "project": project,
        "molecular": tools["state"](client, project),
        "history": tools["history_rows"](client, project_id),
        "jobs": job_state(client, project_id),
    }


def assert_molecular(actual: dict[str, Any], expected: dict[str, Any]) -> None:
    editing_tools()["assert_state"](actual["molecular"], expected["molecular"], retained=True)


def archive_roundtrip(
    client: Any, project: dict[str, Any], output: Path, version: str
) -> list[dict[str, Any]]:
    tools = editing_tools()
    prefix = f"{output.parent.name}-{output.name}"
    payload = tools["export_bytes"](client, project, f"{prefix}-export", version)
    rows = []
    for suffix in SUFFIXES:
        destination = output / f"producer.{suffix}.zip"
        destination.write_bytes(payload)
        restored = tools["import_bytes"](client, payload, f".{suffix}.zip", f"{prefix}-{suffix}")
        tools["assert_state"](tools["state"](client, restored), tools["state"](client, project))
        assert restored["history"]["retained_commands"] == 0
        shells = job_state(client, restored["id"])
        assert_private_shells(shells)
        again = tools["export_bytes"](client, restored, f"{prefix}-reexport-{suffix}", version)
        (output / f"reader.{suffix}.zip").write_bytes(again)
        reread = tools["import_bytes"](client, again, f".{suffix}.zip", f"{prefix}-reread-{suffix}")
        tools["assert_state"](tools["state"](client, reread), tools["state"](client, restored))
        assert_private_shells(job_state(client, reread["id"]))
        rows.append(
            {
                "suffix": suffix,
                "imported_project": restored["id"],
                "reimported_project": reread["id"],
                "sha256": digest(payload),
                "reexport_sha256": digest(again),
                "canonical_originals_exact": True,
                "ordinary_private_inputs_results_absent": True,
            }
        )
    return rows


def post_delete_archive_control(
    client: Any,
    case: dict[str, Any],
    deleted: dict[str, Any],
    output: Path,
    version: str,
) -> dict[str, Any]:
    """Archive a missing target before Undo, retaining ordinary anchor inputs."""
    target_id, anchor_id = case["target_entry_id"], case["anchor_entry_id"]
    assert target_id != anchor_id
    assert [entry["id"] for entry in deleted["entries"]] == [anchor_id]
    before = project_state(client, case["project_id"])
    assert before["project"]["id"] == deleted["id"] == case["project_id"]
    assert before["project"]["revision"] == deleted["revision"]
    assert [entry["id"] for entry in before["project"]["entries"]] == [anchor_id], (
        "The target must still be deleted before export"
    )
    ordinary = [row for row in before["jobs"] if row["job_type"] != "ligand.properties"]
    assert ordinary and all(row["input_entry_ids"] == [anchor_id] for row in ordinary)
    assert any(row["id"] == case["user_job_id"] and row["results"] > 0 for row in ordinary)
    output.mkdir(parents=True)
    archives = archive_roundtrip(client, deleted, output, version)
    assert len(archives) == len(SUFFIXES)
    assert {row["suffix"] for row in archives} == set(SUFFIXES)
    after = project_state(client, case["project_id"])
    assert after == before, "The original target must remain absent through portable roundtrips"
    return {
        "target_id": target_id,
        "anchor_id": anchor_id,
        "target_absent_during_all_roundtrips": True,
        "anchor_and_user_jobs_preserved": True,
        "before_undo": True,
        "original_project_unchanged_during_roundtrips": True,
        "state": before,
        "both_suffixes": archives,
    }


def actual_started(root: Path, data: Path, version: str, authorization: Path) -> dict[str, Any]:
    """Observe a real calculation child, then terminate its owned coordinator.

    This is an interrupted-worker fixture, not a claim that a later database row
    still represents a living child. No live capture identity is ever copied.
    """
    log = data / "interrupted-worker.log"
    command = [
        sys.executable,
        "-B",
        str(HERE),
        "actor",
        "worker-once",
        "--root",
        str(root),
        "--workspace",
        str(data.parent),
        "--data-dir",
        str(data),
        "--expected-version",
        version,
        "--suite",
        "properties",
        "--evidence",
        str(data / "worker-once.json"),
        "--authorization",
        str(authorization),
    ]
    observed = None
    with log.open("wb") as stream:
        process = subprocess.Popen(
            command,
            cwd=root,
            env=environment(root, data),
            stdout=stream,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline and process.poll() is None:
                with sqlite3.connect(f"{database(data).as_uri()}?mode=ro", uri=True) as connection:
                    rows = connection.execute(
                        "SELECT child_pid,child_start_token,group_confirmed FROM "
                        "ligand_property_executions WHERE reaped=0 AND child_pid IS NOT NULL"
                    ).fetchall()
                for pid, token, group in rows:
                    identity = process_identity(pid)
                    if (
                        group
                        and identity is not None
                        and identity[0] == token
                        and identity[1] == pid
                        and identity[2] != "Z"
                    ):
                        observed = {
                            "pid": pid,
                            "start_token": token,
                            "pgid": identity[1],
                            "state": identity[2],
                            "observed_alive": True,
                        }
                        break
                if observed is not None:
                    break
                time.sleep(0.005)
            assert observed is not None, (
                "Real calculation child was not observed; do not invent running evidence"
            )
        finally:
            if process.poll() is None:
                process.terminate()  # Exact Popen handle owns this coordinator only.
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
    assert observed is not None
    # The production child notices its lost parent. A remaining owned group is
    # reaped only after matching its durable start token and group identity.
    identity = process_identity(observed["pid"])
    if identity is not None and identity[0] == observed["start_token"] and identity[2] != "Z":
        assert identity[1] == observed["pid"]
        os.killpg(observed["pid"], signal.SIGKILL)
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        identity = process_identity(observed["pid"])
        if identity is None or identity[0] != observed["start_token"] or identity[2] == "Z":
            break
        time.sleep(0.01)
    else:
        raise AssertionError("Interrupted owned child did not exit")
    assert_no_live_captures(data)
    return {
        "actual_spawn_observation": observed,
        "coordinator_exit": process.returncode,
        "argv": command,
        "log_sha256": digest(log.read_bytes()),
        "live_child_after_fixture": False,
        "scope": (
            "Real controlled calculation observed; coordinator interrupted; "
            "retained restart metadata is not a living-child claim"
        ),
    }


def produce_properties(args: argparse.Namespace) -> dict[str, Any]:
    from neistra_api.job_service import JobService
    from neistra_api.ligand_property_service import LigandPropertyService, private_execution
    from neistra_api.models import Job, LigandPropertyContent, LigandPropertyExecution
    from sqlalchemy import select
    from uuid6 import uuid7

    cases = {}
    for label in CASES:
        data = args.workspace / "cases" / label
        data.mkdir(parents=True)
        migrate(args.root, data)
        assert heads(data) == ["0017"]
        client = client_for(args.root, data, args.expected_version)
        try:
            project = import_ethanol(client, f"Derived reader {label}")
            project, target_id, anchor_id = attach_anchor(client, project)
            response_ok(
                client.request(
                    "PUT",
                    "/api/v1/workspace/ligand-property-preferences",
                    json={
                        "expected_revision": 0,
                        "enabled_categories": ["composition", "polarity"],
                    },
                ),
                200,
            )
            user = ordinary_output(client, project, anchor_id)
            project = response_ok(client.get(f"/api/v1/projects/{project['id']}"), 200)
            consumer = demand(client, project, target_id)
            process_facts: dict[str, Any] = {"calculation_child_observed": False}
            if label in {"captured", "cancelled", "project-deleted"}:
                with client.app.state.session_factory() as session:
                    service = LigandPropertyService(session, client.app.state.settings)
                    captured = service.materialize("claimed-reader-fixture")
                    assert isinstance(captured, Job)
                    assert not captured.inputs and not captured.results
                    if label == "cancelled":
                        JobService(
                            session, client.app.state.settings, client.app.state.job_registry
                        ).cancelled(captured.id)
                        service.reaped(captured.id)
                process_facts["scope"] = "Claimed immutable capture; calculation has not started"
            elif label == "started":
                process_facts = actual_started(
                    args.root, data, args.expected_version, args.workspace / "preceding-source.json"
                )
            elif label != "pending":
                assert worker(client).run_once()
                current = response_ok(read_properties(client, project, target_id), 200)["entries"][
                    0
                ]
                assert (
                    current["status"] == "ready"
                    and current["report"]["model_status"] == "qualified"
                )
                if label == "corrupt":
                    with client.app.state.session_factory() as session:
                        content = session.scalar(select(LigandPropertyContent))
                        assert content is not None
                        path = data / "cache/ligand-properties-v1" / content.relative_path
                        path.write_bytes(b"Explicit derived-cache corruption control")
                    assert (
                        response_ok(read_properties(client, project, target_id), 200)["entries"][0][
                            "status"
                        ]
                        != "ready"
                    )
                elif label == "stale":
                    entry = next(entry for entry in project["entries"] if entry["id"] == target_id)
                    old_source = source(project, target_id)
                    project = response_ok(
                        client.post(
                            f"/api/v1/projects/{project['id']}/entries/{entry['id']}/model-edits",
                            json={
                                "expected_revision": project["revision"],
                                "expected_artifact_id": entry["current_artifact_id"],
                                "selection": {
                                    "atoms": [{"structure_id": entry["id"], "atom_id": 1}]
                                },
                                "hydrogen_policy": "preserve",
                                "action": {"operation": "atom.element", "element": "N"},
                            },
                        ),
                        200,
                    )["project"]
                    stale = client.post(
                        f"/api/v1/projects/{project['id']}/ligand-properties/read",
                        json={"entries": [old_source], "descriptor_ids": []},
                    )
                    assert stale.status_code == 409
                    assert (
                        response_ok(read_properties(client, project, target_id), 200)["entries"][0][
                            "status"
                        ]
                        != "ready"
                    )
                elif label == "forged":
                    with client.app.state.session_factory() as session:
                        execution = session.scalar(select(LigandPropertyExecution))
                        assert execution is not None
                        forged = Job(
                            id=str(uuid7()),
                            project_id=project["id"],
                            purpose="user",
                            plugin_name="neistra.ligand_properties",
                            job_type="ligand.properties",
                            implementation_version="ligand-properties-v1",
                            status="completed",
                            progress=100,
                            parameters={"execution_id": execution.id},
                            provenance={"purpose": "ligand_properties"},
                            status_message="Historical marker is not private authority",
                        )
                        session.add(forged)
                        session.commit()
                        assert private_execution(session, forged) is None
            cases[label] = {
                "data": str(data),
                "project_id": project["id"],
                "target_entry_id": target_id,
                "anchor_entry_id": anchor_id,
                "target_name": "Descriptor target",
                "anchor_name": "Retained user-job anchor",
                "target_source": source(project, target_id),
                "consumer_id": consumer,
                "user_job_id": user["id"],
                "user_job": user,
                "user_output_hashes": {
                    item["artifact"]["id"]: output_sha(client, item["artifact"])
                    for item in user["results"]
                },
                "process_facts": process_facts,
                "state": project_state(client, project["id"]),
                "preferences": response_ok(
                    client.get("/api/v1/workspace/ligand-property-preferences"), 200
                ),
            }
            assert_private_shells(cases[label]["state"]["jobs"])
        finally:
            client.app.state.engine.dispose()
        assert_no_live_captures(data)
        cases[label]["snapshot"] = snapshot(data)
    dump(args.workspace / "property-cases.json", cases)
    return {
        "cases": cases,
        "case_labels": list(CASES),
        "case_stores_isolated": True,
        "all_live_children_reaped_before_actor_exit": True,
    }


def old_properties(args: argparse.Namespace) -> dict[str, Any]:
    from neistra_api.models import Job, Project
    from sqlalchemy import delete, text

    produced = load(args.workspace / "property-cases.json")
    outcomes = {}
    for label, case in produced.items():
        data = Path(case["data"])
        assert_no_live_captures(data)
        before = snapshot(data)
        migration = subprocess.run(
            [sys.executable, "-B", "-m", "alembic", "upgrade", "head"],
            cwd=args.root,
            env=environment(args.root, data),
            capture_output=True,
        )
        assert migration.returncode != 0
        assert "Can't locate revision identified by '0017'" in migration.stderr.decode()
        assert snapshot(data) == before, "Unknown0017 refusal changed the shared-schema store"
        client = client_for(args.root, data, args.expected_version)
        try:
            actual = project_state(client, case["project_id"])
            assert_molecular(actual, case["state"])
            assert actual["history"] == case["state"]["history"]
            response_ok(
                client.post(
                    f"/api/v1/projects/{case['project_id']}/save",
                    json={"expected_revision": actual["project"]["revision"]},
                ),
                200,
            )
            ordinary = response_ok(
                client.post(
                    f"/api/v1/projects/{case['project_id']}/jobs",
                    json={
                        "job_type": "molweave.demo.structure_statistics",
                        "parameters": {"step_count": 1},
                        "inputs": [{"role": "structure", "entry_id": case["anchor_entry_id"]}],
                    },
                ),
                201,
            )
            current = response_ok(client.get(f"/api/v1/projects/{case['project_id']}"), 200)
            deleted = response_ok(
                client.delete(
                    f"/api/v1/projects/{case['project_id']}/entries/{case['target_entry_id']}",
                    params={"expected_revision": current["revision"]},
                ),
                200,
            )
            post_delete = post_delete_archive_control(
                client,
                case,
                deleted,
                args.workspace / "old-post-delete-archives" / label,
                args.expected_version,
            )
            restored = response_ok(
                client.post(
                    f"/api/v1/projects/{case['project_id']}/history/undo",
                    json={"expected_revision": deleted["revision"]},
                ),
                200,
            )
            after_undo = project_state(client, case["project_id"])
            assert_molecular(after_undo, case["state"])
            output = args.workspace / "old-archives" / label
            output.mkdir(parents=True)
            archives = archive_roundtrip(client, restored, output, args.expected_version)
            with client.app.state.session_factory() as session:
                old_insert = session.get(Job, ordinary["id"])
                assert old_insert is not None
                columns = {column.name for column in Job.__table__.columns}
                assert "purpose" not in columns, "Old writer must use its actual pre-purpose ORM"
                default_purpose = session.execute(
                    text("SELECT purpose FROM jobs WHERE id=:id"), {"id": ordinary["id"]}
                ).scalar_one()
                assert default_purpose == "user"
            state_after = project_state(client, case["project_id"])
            # No public project-delete endpoint exists. One dedicated case deletes
            # the original claimed-capture project through the actual-old ORM.
            disposable = (
                case["project_id"]
                if label == "project-deleted"
                else archives[-1]["reimported_project"]
            )
            with client.app.state.session_factory() as session:
                row = session.get(Project, disposable)
                assert row is not None
                session.execute(delete(Project).where(Project.id == disposable))
                session.commit()
                assert session.get(Project, disposable) is None
            outcomes[label] = {
                "unknown_0017_migration": {
                    "exit": migration.returncode,
                    "stderr": migration.stderr.decode(),
                    "before": before,
                    "after": before,
                    "unchanged": True,
                },
                "api_read_save_entry_delete_undo": True,
                "post_delete_archive": post_delete,
                "ordinary_job_id": ordinary["id"],
                "both_suffixes": archives,
                "project_delete_probe": {
                    "kind": "actual-old ORM",
                    "project_id": disposable,
                    "deleted": True,
                },
                "state_after_old_write": state_after if label != "project-deleted" else None,
                "old_insert_server_default": default_purpose,
                "original_project_intentionally_deleted": label == "project-deleted",
            }
        finally:
            client.app.state.engine.dispose()
        outcomes[label]["snapshot_after"] = snapshot(data)
    dump(args.workspace / "old-property-outcomes.json", outcomes)
    return {"cases": outcomes, "case_labels": list(CASES), "same_original_stores": True}


def recovery_failure_control(client: Any) -> dict[str, Any]:
    """A synthetic wrong-group record must retain capture and signal nobody.

    The sleeping child is an explicitly owned guard specimen, never presented as
    a descriptor calculation. The actual calculation fixture is separate.
    """
    from neistra_api.ligand_property_process import recover_property_processes
    from neistra_api.models import LigandPropertyExecution
    from sqlalchemy import select

    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        identity = process_identity(child.pid)
        assert identity is not None and identity[1] != child.pid
        with client.app.state.session_factory() as session:
            execution = session.scalar(select(LigandPropertyExecution))
            assert execution is not None
            fields = ("reaped", "child_pid", "child_start_token", "group_confirmed")
            saved = {field: getattr(execution, field) for field in fields}
            captures = json.dumps(execution.captures, sort_keys=True)
            try:
                execution.reaped = False
                execution.child_pid = child.pid
                execution.child_start_token = identity[0]
                execution.group_confirmed = True
                session.commit()
                try:
                    recover_property_processes(session)
                except ValueError as error:
                    assert "process group identity changed" in str(error)
                else:
                    raise AssertionError("Unverifiable process group was accepted")
                session.refresh(execution)
                assert not execution.reaped and child.poll() is None
                assert json.dumps(execution.captures, sort_keys=True) == captures
            finally:
                for field, value in saved.items():
                    setattr(execution, field, value)
                session.commit()
        return {
            "kind": "owned non-calculation process guard",
            "explicit_failure": True,
            "capture_retained": True,
            "process_not_signalled": True,
        }
    finally:
        if child.poll() is None:
            child.terminate()
        child.wait(timeout=3)


def reconstruct_archives(
    client: Any, directory: Path, label: str, target_name: str, expected_hash: str | None = None
) -> list[dict[str, Any]]:
    from neistra_api.ligand_property_service import private_execution
    from neistra_api.models import Job
    from sqlalchemy import select

    imported = []
    for suffix in SUFFIXES:
        payload = (directory / f"reader.{suffix}.zip").read_bytes()
        tools = editing_tools()
        restored = tools["import_bytes"](
            client, payload, f".{suffix}.zip", f"current-reconstruct-{label}-{suffix}"
        )
        with client.app.state.session_factory() as session:
            rows = session.scalars(select(Job).where(Job.project_id == restored["id"])).all()
            assert all(
                row.purpose == "user" and private_execution(session, row) is None for row in rows
            )
            assert all(row.status not in {"running", "queued"} for row in rows), (
                "Imported history became executable"
            )
        targets = [entry for entry in restored["entries"] if entry["name"] == target_name]
        assert len(targets) == 1
        target_id = targets[0]["id"]
        owner = demand(client, restored, target_id)
        for _ in range(8):
            row = response_ok(read_properties(client, restored, target_id), 200)["entries"][0]
            if row["status"] == "ready":
                break
            assert worker(client).run_once()
        assert row["status"] == "ready" and row["report"]["model_status"] == "qualified"
        if expected_hash is None:
            expected_hash = row["report"]["input_hash"]
        assert row["report"]["input_hash"] == expected_hash
        imported.append(
            {
                "suffix": suffix,
                "project_id": restored["id"],
                "consumer_id": owner,
                "fresh_binding": row["source"],
                "input_hash": expected_hash,
                "imported_jobs_ordinary": True,
                "captured_ids_grant_no_authority": True,
            }
        )
    return imported


def verify_post_delete_archives(
    client: Any,
    directory: Path,
    case: dict[str, Any],
    evidence: dict[str, Any],
) -> list[dict[str, Any]]:
    """Reopen the old writer's missing-target archives without restoring authority."""
    from neistra_api.ligand_property_service import private_execution
    from neistra_api.models import Job
    from sqlalchemy import select

    tools = editing_tools()
    expected = evidence["state"]["molecular"]
    results = []
    for exported in evidence["both_suffixes"]:
        suffix = exported["suffix"]
        payload = (directory / f"reader.{suffix}.zip").read_bytes()
        assert digest(payload) == exported["reexport_sha256"]
        restored = tools["import_bytes"](
            client, payload, f".{suffix}.zip", f"current-post-delete-{suffix}"
        )
        assert [entry["name"] for entry in restored["entries"]] == [case["anchor_name"]]
        assert all(entry["id"] != case["target_entry_id"] for entry in restored["entries"])
        tools["assert_state"](tools["state"](client, restored), expected)
        with client.app.state.session_factory() as session:
            rows = session.scalars(select(Job).where(Job.project_id == restored["id"])).all()
            assert all(
                row.purpose == "user" and private_execution(session, row) is None for row in rows
            )
            assert all(row.status not in {"running", "queued"} for row in rows)
        before_jobs = job_state(client, restored["id"])
        refused = client.post(
            f"/api/v1/projects/{restored['id']}/ligand-properties/read",
            json={"entries": [case["target_source"]], "descriptor_ids": []},
        )
        assert refused.status_code == 404
        assert refused.json()["detail"]["code"] == "entry_not_found"
        assert job_state(client, restored["id"]) == before_jobs
        results.append(
            {
                "suffix": suffix,
                "project_id": restored["id"],
                "target_absent": True,
                "anchor_canonical_and_original_exact": True,
                "imported_jobs_ordinary": True,
                "no_imported_executable_state": True,
                "missing_target_http": 404,
                "no_property_work_created": True,
            }
        )
    return results


def reopen_properties(args: argparse.Namespace) -> dict[str, Any]:
    from neistra_api.ligand_property_service import private_execution
    from neistra_api.models import Job, LigandPropertyExecution
    from sqlalchemy import func, select

    produced = load(args.workspace / "property-cases.json")
    old = load(args.workspace / "old-property-outcomes.json")
    results = {}
    for label, case in produced.items():
        data = Path(case["data"])
        assert_no_live_captures(data)
        assert heads(data) == ["0017"]
        client = client_for(args.root, data, args.expected_version)
        try:
            deleted_archives = verify_post_delete_archives(
                client,
                args.workspace / "old-post-delete-archives" / label,
                case,
                old[label]["post_delete_archive"],
            )
            if label == "project-deleted":
                assert client.get(f"/api/v1/projects/{case['project_id']}").status_code == 404
                assert old[label]["original_project_intentionally_deleted"]
                assert old[label]["old_insert_server_default"] == "user"
                assert (
                    response_ok(client.get("/api/v1/workspace/ligand-property-preferences"), 200)
                    == case["preferences"]
                )
                recovered = worker(client).recover_abandoned()
                with client.app.state.session_factory() as session:
                    assert (
                        session.scalar(
                            select(func.count())
                            .select_from(LigandPropertyExecution)
                            .where(LigandPropertyExecution.project_id == case["project_id"])
                        )
                        == 0
                    )
                for relative, expected_file in case["snapshot"]["files"].items():
                    path = data / relative
                    assert path.is_file() and len(path.read_bytes()) == expected_file["bytes"]
                    assert digest(path.read_bytes()) == expected_file["sha256"]
                results[label] = {
                    "intentional_project_deletion": True,
                    "capture_reaped": True,
                    "originals_and_user_output_files_preserved": True,
                    "recovered_jobs": recovered,
                    "old_insert_defaults_to_user": True,
                    "post_delete_archive_rechecked": deleted_archives,
                    "both_suffixes_reconstructed": reconstruct_archives(
                        client, args.workspace / "old-archives" / label, label, case["target_name"]
                    ),
                }
                continue
            state = project_state(client, case["project_id"])
            assert_molecular(state, old[label]["state_after_old_write"])
            assert state["history"] == old[label]["state_after_old_write"]["history"]
            assert (
                response_ok(client.get("/api/v1/workspace/ligand-property-preferences"), 200)
                == case["preferences"]
            )
            with client.app.state.session_factory() as session:
                ordinary = session.get(Job, old[label]["ordinary_job_id"])
                assert ordinary is not None and ordinary.purpose == "user"
                assert private_execution(session, ordinary) is None
            guard = recovery_failure_control(client) if label == "started" else None
            recovered = worker(client).recover_abandoned()
            project = response_ok(client.get(f"/api/v1/projects/{case['project_id']}"), 200)
            # Explicit retry, rather than silently clearing a failed generation.
            consumer = demand(client, project, case["target_entry_id"])
            for _ in range(8):
                current = response_ok(
                    read_properties(client, project, case["target_entry_id"]), 200
                )["entries"][0]
                if current["status"] == "ready":
                    break
                assert worker(client).run_once()
            assert current["status"] == "ready", current
            assert current["report"]["model_status"] == "qualified"
            imported = reconstruct_archives(
                client,
                args.workspace / "old-archives" / label,
                label,
                case["target_name"],
                current["report"]["input_hash"],
            )
            final = project_state(client, case["project_id"])
            assert_molecular(final, state)
            user = response_ok(client.get(f"/api/v1/jobs/{case['user_job_id']}"), 200)
            assert user == case["user_job"]
            for item in user["results"]:
                assert (
                    output_sha(client, item["artifact"])
                    == case["user_output_hashes"][item["artifact"]["id"]]
                )
            results[label] = {
                "recovered_jobs": recovered,
                "failed_recovery_guard": guard,
                "old_insert_defaults_to_user": True,
                "post_delete_archive_rechecked": deleted_archives,
                "consumer_id": consumer,
                "current_input_hash": current["report"]["input_hash"],
                "canonical_history_originals_user_outputs_retained": True,
                "both_suffixes_reconstructed": imported,
            }
        finally:
            client.app.state.engine.dispose()
            if label in results:
                results[label]["snapshot_after"] = snapshot(data)
    return {"cases": results, "case_labels": list(CASES), "derived_reconstruction_exact": True}


def editing_actor(args: argparse.Namespace) -> dict[str, Any]:
    tools = editing_tools()
    work, phase = args.workspace, args.phase
    if phase == "produce-current":
        data = work / "current-produced"
        data.mkdir()
        migrate(args.root, data)
        client = client_for(args.root, data, args.expected_version)
        try:
            editing = tools["produce"](
                client, args.root, work / "current-exchange", args.expected_version
            )
            designation = tools["produce_designations"](
                client, args.root, work / "current-exchange", args.expected_version
            )
            return {"editing": editing, "designation": designation, "database_heads": heads(data)}
        finally:
            client.app.state.engine.dispose()
    if phase == "old-write":
        retained = work / "previous-retained"
        closed_copy(work / "current-produced", retained)
        client = client_for(args.root, retained, args.expected_version)
        try:
            controls = tools["consume"](
                client,
                work / "current-exchange",
                work / "previous-reexports",
                args.expected_version,
                retained=True,
            )
            reopen = tools["reopen_current"](
                client, work / "current-exchange", args.expected_version
            )
        finally:
            client.app.state.engine.dispose()
        previous = work / "previous-produced"
        previous.mkdir()
        migrate(args.root, previous)
        client = client_for(args.root, previous, args.expected_version)
        try:
            produced = tools["produce"](
                client, args.root, work / "previous-exchange", args.expected_version
            )
            designation = tools["produce_designations"](
                client, args.root, work / "previous-exchange", args.expected_version
            )
            return {
                "current_retention": controls,
                "current_reopen": reopen,
                "editing": produced,
                "designation": designation,
                "retained_database_heads": heads(retained),
                "database_heads": heads(previous),
            }
        finally:
            client.app.state.engine.dispose()
    reverse = work / "current-read-previous"
    closed_copy(work / "previous-produced", reverse)
    migrate(args.root, reverse)
    client = client_for(args.root, reverse, args.expected_version)
    try:
        controls = tools["consume"](
            client,
            work / "previous-exchange",
            work / "current-reexports",
            args.expected_version,
            retained=True,
            producer_scope="previous",
        )
        reopen = tools["reopen_current"](client, work / "previous-exchange", args.expected_version)
    finally:
        client.app.state.engine.dispose()
    copied = work / "current-read-old-reexports"
    closed_copy(work / "previous-retained", copied)
    client = client_for(args.root, copied, args.expected_version)
    try:
        reexports = tools["read_reexports"](
            client,
            work / "current-exchange",
            work / "previous-reexports",
            args.expected_version,
            args.previous_version,
        )
        original = tools["reopen_current"](client, work / "current-exchange", args.expected_version)
    finally:
        client.app.state.engine.dispose()
    return {
        "previous_retention": controls,
        "previous_reopen": reopen,
        "previous_reexports": reexports,
        "current_reopen": original,
        "database_heads": heads(reverse),
        "retained_database_heads": heads(copied),
    }


def validate_reports(reports: dict[str, dict[str, Any]], suite: str) -> None:
    assert set(reports) == set(PHASES)
    for phase, report in reports.items():
        assert report["protocol"] == PROTOCOL and report["phase"] == phase
        assert report["suite"] == suite and report["source_unchanged"] is True
        assert report["identity"]["module_paths"] and report["identity"]["source_files"]
    produced, old, reopened = (reports[phase]["results"] for phase in PHASES)
    if suite == "properties":
        for report in (produced, old, reopened):
            assert report["case_labels"] == list(CASES) and set(report["cases"]) == set(CASES)
        assert (
            produced["case_stores_isolated"]
            and produced["all_live_children_reaped_before_actor_exit"]
        )
        assert produced["cases"]["started"]["process_facts"]["actual_spawn_observation"][
            "observed_alive"
        ]
        assert not produced["cases"]["started"]["process_facts"]["live_child_after_fixture"]
        assert old["same_original_stores"] and reopened["derived_reconstruction_exact"]
        guard = reopened["cases"]["started"]["failed_recovery_guard"]
        assert (
            guard["explicit_failure"]
            and guard["capture_retained"]
            and guard["process_not_signalled"]
        )
        for label in CASES:
            fixture = produced["cases"][label]
            earlier, final = old["cases"][label], reopened["cases"][label]
            target_id, anchor_id = fixture["target_entry_id"], fixture["anchor_entry_id"]
            assert target_id != anchor_id and fixture["target_source"]["entry_id"] == target_id
            missing_target = earlier["post_delete_archive"]
            assert missing_target["target_id"] == target_id
            assert missing_target["anchor_id"] == anchor_id
            assert missing_target["before_undo"] is True
            assert missing_target["target_absent_during_all_roundtrips"] is True
            assert missing_target["original_project_unchanged_during_roundtrips"] is True
            assert missing_target["anchor_and_user_jobs_preserved"] is True
            assert [entry["id"] for entry in missing_target["state"]["project"]["entries"]] == [
                anchor_id
            ]
            ordinary = [
                row
                for row in missing_target["state"]["jobs"]
                if row["job_type"] != "ligand.properties"
            ]
            assert ordinary and all(row["input_entry_ids"] == [anchor_id] for row in ordinary)
            assert any(
                row["id"] == fixture["user_job_id"] and row["results"] > 0 for row in ordinary
            )
            assert len(missing_target["both_suffixes"]) == len(SUFFIXES)
            assert {row["suffix"] for row in missing_target["both_suffixes"]} == set(SUFFIXES)
            assert all(
                row["canonical_originals_exact"] and row["ordinary_private_inputs_results_absent"]
                for row in missing_target["both_suffixes"]
            )
            rechecked = final["post_delete_archive_rechecked"]
            assert len(rechecked) == len(SUFFIXES)
            assert {row["suffix"] for row in rechecked} == set(SUFFIXES)
            assert all(
                row["target_absent"]
                and row["anchor_canonical_and_original_exact"]
                and row["imported_jobs_ordinary"]
                and row["no_imported_executable_state"]
                and row["missing_target_http"] == 404
                and row["no_property_work_created"]
                for row in rechecked
            )
            refusal = earlier["unknown_0017_migration"]
            assert (
                refusal["exit"] != 0
                and refusal["unchanged"]
                and refusal["before"] == refusal["after"]
            )
            assert earlier["api_read_save_entry_delete_undo"]
            assert len(earlier["both_suffixes"]) == len(SUFFIXES)
            assert {row["suffix"] for row in earlier["both_suffixes"]} == set(SUFFIXES)
            if label == "project-deleted":
                assert earlier["original_project_intentionally_deleted"]
                assert final["intentional_project_deletion"] and final["capture_reaped"]
                assert final["originals_and_user_output_files_preserved"]
            else:
                assert final["canonical_history_originals_user_outputs_retained"]
            assert final["old_insert_defaults_to_user"]
            assert len(final["both_suffixes_reconstructed"]) == len(SUFFIXES)
            assert {row["suffix"] for row in final["both_suffixes_reconstructed"]} == set(SUFFIXES)
            assert all(
                row["imported_jobs_ordinary"] and row["captured_ids_grant_no_authority"]
                for row in final["both_suffixes_reconstructed"]
            )
    else:
        contracts = runpy.run_path(str(HERE.with_name("schema_boundary_evidence.py")))
        for producer in (produced, old):
            assert producer["editing"]["cases"] == 15 and producer["editing"]["transitions"] == 24
            assert producer["editing"]["case_labels"] == contracts["EDITING_CASES"]
            assert producer["designation"] == {
                "archives": 10,
                "cases": 5,
                "case_labels": contracts["DESIGNATION_CASES"],
            }
        assert produced["database_heads"] == reopened["database_heads"] == ["0017"]
        assert old["database_heads"] == ["0016"] and old["retained_database_heads"] == ["0017"]
        contracts["editing_controls"](old["current_retention"], retained_history=True)
        contracts["editing_controls"](reopened["previous_retention"], retained_history=True)
        for report in (
            old["current_reopen"],
            reopened["previous_reopen"],
            reopened["current_reopen"],
        ):
            assert (
                report["retained_editing_cases"] == 15 and report["retained_designation_cases"] == 5
            )
            assert report["archive_reads"] == report["reexport_reimports"] == 40
            assert report["designation_exact_provenance_membership_and_remaps"]
        assert reopened["previous_reexports"]["current_reads"] == 60
        assert reopened["previous_reexports"]["current_reexport_reimports"] == 60


def actor(args: argparse.Namespace) -> None:
    args.root, args.workspace = args.root.resolve(), args.workspace.resolve()
    authority = load(args.authorization.resolve())
    assert authority["wrapper_sha256"] == digest(HERE.read_bytes())
    current, previous = Path(authority["current_root"]), Path(authority["previous_root"])
    selected = previous if args.phase == "old-write" else current
    expected = (
        authority["previous_version"] if args.phase == "old-write" else authority["current_version"]
    )
    assert args.root == selected and args.expected_version == expected
    original_cwd = Path.cwd()
    try:
        os.chdir(current)
        verified = verify_predecessor(
            current,
            previous,
            Path(authority["previous_receipt"]),
            authority["previous_version"],
            authority["tag"],
            authority["commit"],
        )
        assert verified == authority["verified"]
    finally:
        os.chdir(original_cwd)
    assert original_cwd.resolve() == args.root
    if args.phase == "old-write":
        assert args.receipt is not None
        assert args.receipt.resolve() == Path(authority["previous_receipt"])
    if args.phase == "worker-once":
        client = client_for(args.root, args.data_dir.resolve(), args.expected_version)
        try:
            assert worker(client).run_once()
            dump(args.evidence, {"worker_run_once": True})
        finally:
            client.app.state.engine.dispose()
        return
    tools = editing_tools()
    identity = tools["identity"](
        args.root, args.expected_version, args.receipt, args.previous_tag, args.previous_commit
    )
    if args.suite == "editing":
        results = editing_actor(args)
    else:
        functions = {
            "produce-current": produce_properties,
            "old-write": old_properties,
            "reopen-current": reopen_properties,
        }
        results = functions[args.phase](args)
    tools["verify_source"](identity)
    dump(
        args.evidence,
        {
            "protocol": PROTOCOL,
            "phase": args.phase,
            "suite": args.suite,
            "identity": identity,
            "source_unchanged": True,
            "results": results,
            "wrapper_sha256": digest(HERE.read_bytes()),
        },
    )


def run(args: argparse.Namespace) -> None:
    root, previous = args.current_root.resolve(), args.previous_root.resolve()
    assert Path.cwd().resolve() == root and sys.flags.optimize == 0
    assert tuple(map(int, args.current_version.split("."))) > tuple(
        map(int, args.previous_version.split("."))
    )
    binding = verify_predecessor(
        root,
        previous,
        args.previous_receipt.resolve(),
        args.previous_version,
        args.previous_tag,
        args.previous_commit,
    )
    work = args.workspace.resolve()
    assert not work.exists() and not work.is_relative_to(root) and not work.is_relative_to(previous)
    work.mkdir(parents=True)
    authorization = work / "preceding-source.json"
    dump(
        authorization,
        {
            "wrapper_sha256": digest(HERE.read_bytes()),
            "current_root": str(root),
            "previous_root": str(previous),
            "previous_receipt": str(args.previous_receipt.resolve()),
            "previous_version": args.previous_version,
            "current_version": args.current_version,
            "tag": args.previous_tag,
            "commit": args.previous_commit,
            "verified": binding,
        },
    )
    suite = "editing" if args.command == "editing-run" else "properties"
    if suite == "editing":
        for name in (
            "current-exchange",
            "previous-exchange",
            "previous-reexports",
            "current-reexports",
        ):
            (work / name).mkdir()
    phases, reports = [], {}
    for phase, implementation, version in zip(
        PHASES,
        (root, previous, root),
        (args.current_version, args.previous_version, args.current_version),
        strict=True,
    ):
        report, log = work / f"{phase}.json", work / f"{phase}.log"
        command = [
            # Resolving the executable symlink would bypass its virtual environment.
            str(args.python.absolute()),
            "-B",
            str(HERE),
            "actor",
            phase,
            "--suite",
            suite,
            "--authorization",
            str(authorization),
            "--root",
            str(implementation),
            "--workspace",
            str(work),
            "--expected-version",
            version,
            "--evidence",
            str(report),
            "--previous-version",
            args.previous_version,
            "--previous-tag",
            args.previous_tag,
            "--previous-commit",
            args.previous_commit,
        ]
        if phase == "old-write":
            command += ["--receipt", str(args.previous_receipt.resolve())]
        env = environment(implementation, work / "actor-default-store")
        with log.open("wb") as stream:
            process = subprocess.run(
                command,
                cwd=implementation,
                env=env,
                stdout=stream,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                check=False,
            )
        phases.append(
            {
                "phase": phase,
                "version": version,
                "argv": command,
                "cwd": str(implementation),
                "exit_code": process.returncode,
                "log": str(log),
                "log_sha256": digest(log.read_bytes()),
                "report": str(report),
                "report_sha256": digest(report.read_bytes()) if report.exists() else None,
            }
        )
        dump(work / "phases.json", phases)
        assert process.returncode == 0, log.read_text()[-12000:]
        reports[phase] = load(report)
    validate_reports(reports, suite)
    dump(
        work / "summary.json",
        {
            "protocol": PROTOCOL,
            "suite": suite,
            "release_qualification": True,
            "current_version": args.current_version,
            "previous_version": args.previous_version,
            "previous_tag": args.previous_tag,
            "previous_commit": args.previous_commit,
            "preceding_source": binding,
            "phases": phases,
            "wrapper_sha256": digest(HERE.read_bytes()),
            "complete": True,
            "all_actor_reports_verified": True,
            "limitations": [
                "Archives omit live Undo history; owned live stores retain it.",
                (
                    "The interrupted-child fixture reports observed process facts "
                    "separately from retained database status."
                ),
                "Project deletion is an explicitly labelled actual-selected ORM probe.",
            ],
        },
    )
    print(f"COMPLETE {suite}: {work / 'summary.json'}", flush=True)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    sub = result.add_subparsers(dest="command", required=True)
    for mode in ("run", "editing-run"):
        selected = sub.add_parser(mode)
        for name in ("current-root", "previous-root", "previous-receipt", "python", "workspace"):
            selected.add_argument(f"--{name}", type=Path, required=True)
        for name in ("current-version", "previous-version", "previous-tag", "previous-commit"):
            selected.add_argument(f"--{name}", required=True)
    selected = sub.add_parser("actor")
    selected.add_argument("phase", choices=(*PHASES, "worker-once"))
    selected.add_argument("--suite", choices=("properties", "editing"), required=True)
    for name in ("root", "workspace", "evidence"):
        selected.add_argument(f"--{name}", type=Path, required=True)
    selected.add_argument("--authorization", type=Path, required=True)
    selected.add_argument("--expected-version", required=True)
    selected.add_argument("--receipt", type=Path)
    selected.add_argument("--data-dir", type=Path)
    selected.add_argument("--previous-version", default="0.36.0")
    selected.add_argument("--previous-tag", default="v0.36.0")
    selected.add_argument("--previous-commit", default="")
    return result


def main() -> None:
    args = parser().parse_args()
    actor(args) if args.command == "actor" else run(args)


if __name__ == "__main__":
    main()
