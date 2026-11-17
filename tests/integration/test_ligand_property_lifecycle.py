from __future__ import annotations

import copy
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from neistra_api.job_worker import JobWorker
from neistra_api.models import (
    Job,
    JobInput,
    JobResultArtifact,
    LigandPropertyContent,
    LigandPropertyExecution,
)
from sqlalchemy import func, select

from tests.support.api_client import ApiClient

FIXTURE = Path(__file__).parents[1] / "fixtures/formats/ethanol.mol"
PREFERENCES = "/api/v1/workspace/ligand-property-preferences"


def imported(client: ApiClient) -> dict[str, Any]:
    project = client.post("/api/v1/projects", json={"name": "Current descriptors"}).json()
    reply = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0, "generate_3d": "true"},
        files=[("files", ("ethanol.mol", FIXTURE.read_bytes(), "chemical/x-mdl-molfile"))],
    )
    assert reply.status_code == 201, reply.text
    return client.get(f"/api/v1/projects/{project['id']}").json()


def source(project: dict[str, Any]) -> dict[str, Any]:
    entry = project["entries"][0]
    designation = entry["ligand_designation"]
    return {
        "entry_id": entry["id"],
        "source_artifact_id": entry["current_artifact_id"],
        "instance_id": designation["instance_id"],
        "atom_ids": designation["atom_ids"],
    }


def body(project: dict[str, Any], *, sequence: int = 1) -> dict[str, Any]:
    return {
        "entries": [source(project)],
        "descriptor_ids": [],
        "sequence": sequence,
        "active_entry_id": project["entries"][0]["id"],
    }


def allocate(client: ApiClient, project: dict[str, Any]) -> str:
    reply = client.post(f"/api/v1/projects/{project['id']}/ligand-properties/consumers")
    assert reply.status_code == 200, reply.text
    return reply.json()["consumer_id"]


def demand(client: ApiClient, project: dict[str, Any], consumer: str, sequence: int = 1) -> Any:
    return client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
        json=body(project, sequence=sequence),
    )


def read(client: ApiClient, project: dict[str, Any]) -> Any:
    return client.post(
        f"/api/v1/projects/{project['id']}/ligand-properties/read",
        json={"entries": [source(project)], "descriptor_ids": []},
    )


def worker(client: ApiClient) -> JobWorker:
    return JobWorker(
        client.app.state.settings,
        client.app.state.session_factory,
        client.app.state.job_registry,
        "property-test-worker",
    )


def captured_result(parameters: dict[str, Any], children: tuple[Any, ...]) -> dict[str, Any]:
    from dataclasses import asdict
    from types import SimpleNamespace

    from neistra_api.ligand_property_plugin import PropertyExecutionParameters, plugin
    from neistra_core.jobs import InputArtifact

    context = SimpleNamespace(checkpoint=lambda: None, progress=lambda value, message: None)
    inputs = tuple(InputArtifact(**asdict(child)) for child in children)
    return plugin.execute(
        "ligand.properties", PropertyExecutionParameters.model_validate(parameters), inputs, context
    ).values


def test_preference_revision_and_defaults_are_installation_owned(client: ApiClient) -> None:
    project = imported(client)
    before = copy.deepcopy(project)
    initial = client.get(PREFERENCES).json()
    assert initial["revision"] == 0
    assert len(initial["enabled_categories"]) == 4
    saved = client.request(
        "PUT", PREFERENCES, json={"expected_revision": 0, "enabled_categories": ["polarity"]}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1
    conflict = client.request(
        "PUT", PREFERENCES, json={"expected_revision": 0, "enabled_categories": []}
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "property_preference_revision_conflict"
    restored = client.request(
        "PUT",
        PREFERENCES,
        json={"expected_revision": 1, "enabled_categories": initial["default_categories"]},
    )
    assert restored.status_code == 200
    assert client.get(f"/api/v1/projects/{project['id']}").json() == before


def test_read_alone_does_not_create_work_and_stale_sources_are_refused(client: ApiClient) -> None:
    project = imported(client)
    assert read(client, project).json()["entries"][0]["status"] == "pending"
    assert not worker(client).run_once()
    tampered = source(project)
    tampered["instance_id"] = str(uuid4())
    rejected = client.post(
        f"/api/v1/projects/{project['id']}/ligand-properties/read",
        json={"entries": [tampered], "descriptor_ids": []},
    )
    assert rejected.status_code == 409


def test_consumer_sequences_are_monotonic_and_release_cannot_cancel_new_request(
    client: ApiClient,
) -> None:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    assert demand(client, project, consumer).status_code == 200
    assert demand(client, project, consumer, 2).status_code == 200
    url = f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}"
    assert client.request("DELETE", url, params={"sequence": 1}).status_code == 409
    assert demand(client, project, consumer, 1).status_code == 409
    assert client.request("DELETE", url, params={"sequence": 3}).status_code == 200
    assert client.request("DELETE", url, params={"sequence": 3}).status_code == 200
    assert demand(client, project, consumer, 2).status_code == 409
    assert not worker(client).run_once()


def test_real_spawned_properties_preserve_project_and_have_no_ordinary_job_relationships(
    client: ApiClient,
) -> None:
    project = imported(client)
    before = copy.deepcopy(project)
    consumer = allocate(client, project)
    reply = demand(client, project, consumer)
    assert reply.status_code == 200, reply.text
    assert reply.json()["entries"][0]["status"] == "pending"
    runner = worker(client)
    assert runner.run_once()
    result = read(client, project)
    assert result.status_code == 200, result.text
    current = result.json()["entries"][0]
    assert current["status"] == "ready", current
    values = {value["descriptor_id"]: value for value in current["report"]["values"]}
    assert len(values) == 14
    assert values["heavy_atom_count"]["value"] == 3
    assert values["hbd"]["value"] == 1
    assert values["tpsa"]["value"] == pytest.approx(20.23)
    assert values["molecular_weight"]["value"] == pytest.approx(46.069)
    assert client.get(f"/api/v1/projects/{project['id']}").json() == before
    assert client.get(f"/api/v1/projects/{project['id']}/jobs").json() == []
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(JobInput)) == 0
        assert session.scalar(select(func.count()).select_from(JobResultArtifact)) == 0
        job = session.scalar(select(Job))
        assert job is not None and job.purpose == "ligand_properties" and job.status == "completed"
        assert session.scalar(select(LigandPropertyExecution)).reaped
        job_id = job.id
    assert client.get(f"/api/v1/jobs/{job_id}").status_code == 404
    assert not runner.run_once()


def test_one_consumer_release_preserves_shared_useful_demand(client: ApiClient) -> None:
    project = imported(client)
    first, second = allocate(client, project), allocate(client, project)
    assert demand(client, project, first).status_code == 200
    assert demand(client, project, second).status_code == 200
    url = f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{first}"
    assert client.request("DELETE", url, params={"sequence": 2}).status_code == 200
    assert worker(client).run_once()
    assert read(client, project).json()["entries"][0]["status"] == "ready"
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Job)) == 1


def test_corrupt_derived_content_retires_and_repairs_without_touching_originals(
    client: ApiClient,
) -> None:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    runner = worker(client)
    assert runner.run_once()
    original_url = (
        f"/api/v1/projects/{project['id']}/entries/{project['entries'][0]['id']}/original"
    )
    original = client.get(original_url).content
    with client.app.state.session_factory() as session:
        content = session.scalar(select(LigandPropertyContent))
        assert content is not None
        path = (
            client.app.state.settings.data_dir
            / "cache/ligand-properties-v1"
            / content.relative_path
        )
        path.write_bytes(b"corrupt derived content")
    assert read(client, project).json()["entries"][0]["status"] == "pending"
    assert runner.run_once()
    assert read(client, project).json()["entries"][0]["status"] == "ready"
    assert client.get(original_url).content == original


def test_release_before_initial_put_and_pruned_owner_never_resurrect_work(
    client: ApiClient,
) -> None:
    from datetime import timedelta

    from neistra_api.models import LigandPropertyConsumer, utc_now

    project = imported(client)
    consumer = allocate(client, project)
    url = f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}"
    assert client.request("DELETE", url, params={"sequence": 2}).status_code == 200
    assert demand(client, project, consumer, 1).status_code == 409
    with client.app.state.session_factory() as session:
        row = session.get(LigandPropertyConsumer, consumer)
        assert row is not None
        row.expires_at = utc_now() - timedelta(seconds=1)
        session.commit()
    allocate(client, project)  # Allocation prunes expired ownership records.
    late = demand(client, project, consumer, 100)
    assert late.status_code == 409
    assert late.json()["detail"]["code"] == "property_consumer_expired"
    assert client.request("DELETE", url, params={"sequence": 101}).status_code == 200
    assert not worker(client).run_once()


def translated(client: ApiClient, project: dict[str, Any]) -> dict[str, Any]:
    entry = project["entries"][0]
    response = client.post(
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
    assert response.status_code == 200, response.text
    return response.json()


def test_coordinate_change_retires_then_fresh_proof_reuses_content_without_new_job(
    client: ApiClient,
) -> None:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    runner = worker(client)
    assert runner.run_once()
    old_hash = read(client, project).json()["entries"][0]["report"]["input_hash"]
    changed = translated(client, project)
    assert changed["entries"][0]["current_artifact_id"] != source(project)["source_artifact_id"]
    assert read(client, changed).json()["entries"][0]["status"] == "pending"
    assert read(client, project).status_code == 409
    assert demand(client, changed, consumer, 2).status_code == 200
    assert runner.run_once()  # Worker prepares strict input and binds existing graph content.
    current = read(client, changed).json()["entries"][0]
    assert current["status"] == "ready"
    assert current["report"]["input_hash"] == old_hash
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Job)) == 1


def test_late_captured_result_cannot_publish_after_new_source_and_demand_generation(
    client: ApiClient,
) -> None:

    from neistra_api.job_service import JobService
    from neistra_api.ligand_property_service import LigandPropertyService

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    with client.app.state.session_factory() as session:
        service = LigandPropertyService(session, client.app.state.settings)
        job = service.materialize("held-test")
        assert isinstance(job, Job)
        captured_inputs = service.execution_inputs(job)
        parameters = dict(job.parameters)
        job_id = job.id
    changed = translated(client, project)
    assert demand(client, changed, consumer, 2).status_code == 200
    values = captured_result(parameters, captured_inputs)
    with client.app.state.session_factory() as session:
        JobService(session, client.app.state.settings, client.app.state.job_registry).complete(
            job_id, (), values, [], "Held result"
        )
        LigandPropertyService(session, client.app.state.settings).reaped(job_id)
    assert read(client, changed).json()["entries"][0]["status"] == "pending"
    assert worker(client).run_once()
    assert read(client, changed).json()["entries"][0]["status"] == "ready"


def test_failed_source_read_is_terminal_until_explicit_new_request(client: ApiClient) -> None:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    from neistra_api.models import Artifact

    with client.app.state.session_factory() as session:
        artifact = session.get(Artifact, project["entries"][0]["original_artifact_id"])
        assert artifact is not None
        path = client.app.state.settings.data_dir / artifact.relative_path
        original = path.read_bytes()
        path.write_bytes(b"invalid original")
    runner = worker(client)
    assert runner.run_once()
    failed = read(client, project).json()["entries"][0]
    assert failed["status"] == "failed" and failed["reason"]
    assert not runner.run_once()
    path.write_bytes(original)
    assert not runner.run_once()  # Repair alone does not erase the failure generation.
    assert demand(client, project, consumer, 2).status_code == 200
    assert runner.run_once()
    assert read(client, project).json()["entries"][0]["status"] == "ready"


def test_forged_or_archived_markers_never_grant_private_execution_or_cleanup_authority(
    client: ApiClient,
) -> None:
    from neistra_api.archive_service import (
        ArchiveLimits,
        ProjectArchiveService,
        build_project_archive,
        read_project_archive,
    )
    from neistra_api.ligand_property_service import LigandPropertyService, private_execution
    from uuid6 import uuid7

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    runner = worker(client)
    assert runner.run_once()
    settings = client.app.state.settings
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
            status_message="Historical marker",
        )
        session.add(forged)
        session.commit()
        forged_id = forged.id
        assert private_execution(session, forged) is None
        # Current export omits true private work but preserves the ordinary marker.
        archive = build_project_archive(
            ProjectArchiveService(session, settings).export_source(project["id"])
        )
        prepared = read_project_archive(archive, ArchiveLimits.from_settings(settings))
        assert [job.id for job in prepared.manifest.jobs] == [forged_id]
        imported_project = ProjectArchiveService(session, settings).import_archive(prepared).project
        restored_jobs = list(
            session.scalars(select(Job).where(Job.project_id == imported_project.id)).all()
        )
        assert len(restored_jobs) == 1
        restored = restored_jobs[0]
        assert restored.purpose == "user"
        assert restored.id != forged_id
        assert restored.parameters["execution_id"] == execution.id
        assert private_execution(session, restored) is None
        service = LigandPropertyService(session, settings)
        service.prune_executions()
        session.commit()
        assert session.get(Job, forged_id) is not None
        assert session.get(Job, restored.id) is not None
    assert client.get(f"/api/v1/jobs/{forged_id}").status_code == 200


def test_deleted_entry_during_private_capture_cannot_rebind_and_remains_archivable(
    client: ApiClient,
) -> None:
    from neistra_api.archive_service import ProjectArchiveService, build_project_archive
    from neistra_api.ligand_property_service import LigandPropertyService

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    with client.app.state.session_factory() as session:
        service = LigandPropertyService(session, client.app.state.settings)
        job = service.materialize("held-delete-test")
        assert isinstance(job, Job)
        job_id = job.id
        assert not job.inputs and not job.results
    deleted = client.request(
        "DELETE",
        f"/api/v1/projects/{project['id']}/entries/{source(project)['entry_id']}",
        params={"expected_revision": project["revision"]},
    )
    assert deleted.status_code == 200, deleted.text
    with client.app.state.session_factory() as session:
        service = LigandPropertyService(session, client.app.state.settings)
        job = session.get(Job, job_id)
        assert job is not None and not service.execution_live(job)
        with pytest.raises(ValueError, match="ownership"):
            service.execution_inputs(job)
        assert build_project_archive(
            ProjectArchiveService(session, client.app.state.settings).export_source(project["id"])
        )


def test_restart_reaps_only_verified_owned_process_and_keeps_failure_explicit(
    client: ApiClient,
) -> None:
    import subprocess
    import sys

    from neistra_api.ligand_property_process import record_process
    from neistra_api.ligand_property_service import LigandPropertyService

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    with client.app.state.session_factory() as session:
        job = LigandPropertyService(session, client.app.state.settings).materialize("lost-worker")
        assert isinstance(job, Job)
        job_id = job.id
    child = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(30)"], start_new_session=True
    )
    try:
        with client.app.state.session_factory() as session:
            record_process(session, job_id, child.pid)
        runner = worker(client)
        assert runner.recover_abandoned() == 1
        assert child.wait(timeout=3) == -9
        with client.app.state.session_factory() as session:
            job = session.get(Job, job_id)
            assert job is not None and job.status == "failed"
            execution = session.scalar(select(LigandPropertyExecution))
            assert execution is not None and execution.reaped
        assert read(client, project).json()["entries"][0]["status"] == "failed"
        assert not runner.run_once()
        assert demand(client, project, consumer, 2).status_code == 200
        assert runner.run_once()
        assert read(client, project).json()["entries"][0]["status"] == "ready"
    finally:
        if child.poll() is None:
            child.kill()
        child.wait(timeout=3)


def test_process_id_reuse_never_authorizes_signalling(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import neistra_api.ligand_property_process as module
    from neistra_api.ligand_property_service import LigandPropertyService

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    with client.app.state.session_factory() as session:
        job = LigandPropertyService(session, client.app.state.settings).materialize("lost-worker")
        assert isinstance(job, Job)
        execution = session.scalar(select(LigandPropertyExecution))
        assert execution is not None
        execution.child_pid = 999_999_999
        execution.child_start_token = "old-owned-start"
        execution.group_confirmed = True
        session.commit()
        monkeypatch.setattr(
            module, "process_identity", lambda pid: ("new-unrelated-start", pid, "S")
        )
        signals = []
        monkeypatch.setattr(module.os, "killpg", lambda *args: signals.append(args))
        module.recover_property_processes(session)
        assert signals == []
        assert execution.reaped


def test_old_writer_style_insert_defaults_to_user_and_cannot_acquire_private_capture(
    client: ApiClient,
) -> None:
    from neistra_api.ligand_property_service import private_execution
    from sqlalchemy import text
    from uuid6 import uuid7

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    assert worker(client).run_once()
    with client.app.state.session_factory() as session:
        original = session.scalar(select(Job))
        assert original is not None
        ordinary_id = str(uuid7())
        columns = [
            column.name for column in Job.__table__.columns if column.name not in {"id", "purpose"}
        ]
        statement = (
            "INSERT INTO jobs (id,"
            + ",".join(columns)
            + ") SELECT :newid,"
            + ",".join(columns)
            + " FROM jobs WHERE id = :oldid"
        )
        session.execute(text(statement), {"newid": ordinary_id, "oldid": original.id})
        session.commit()
        restored = session.get(Job, ordinary_id)
        assert restored is not None and restored.purpose == "user"
        assert restored.parameters == original.parameters
        assert private_execution(session, restored) is None


def test_project_deletion_keeps_capture_until_verified_child_reap(client: ApiClient) -> None:
    import subprocess
    import sys

    from neistra_api.ligand_property_process import record_process
    from neistra_api.ligand_property_service import LigandPropertyService
    from neistra_api.models import Artifact, Project
    from sqlalchemy import delete

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    with client.app.state.session_factory() as session:
        service = LigandPropertyService(session, client.app.state.settings)
        job = service.materialize("lost-project-worker")
        assert isinstance(job, Job)
        job_id = job.id
        artifact = session.get(Artifact, project["entries"][0]["original_artifact_id"])
        original_path = client.app.state.settings.data_dir / artifact.relative_path
        original = original_path.read_bytes()
    child = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(30)"], start_new_session=True
    )
    try:
        with client.app.state.session_factory() as session:
            record_process(session, job_id, child.pid)
            session.execute(delete(Project).where(Project.id == project["id"]))
            session.commit()
            assert session.get(Job, job_id) is None
            execution = session.scalar(select(LigandPropertyExecution))
            assert execution is not None and not execution.reaped
        assert worker(client).recover_abandoned() == 0
        assert child.wait(timeout=3) == -9
        with client.app.state.session_factory() as session:
            assert session.scalar(select(func.count()).select_from(LigandPropertyExecution)) == 0
        assert original_path.read_bytes() == original
    finally:
        if child.poll() is None:
            child.kill()
        child.wait(timeout=3)


def test_private_cache_failure_is_explicit_and_does_not_block_ordinary_user_work(
    client: ApiClient,
) -> None:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    cache_root = client.app.state.settings.data_dir / "cache/ligand-properties-v1"
    cache_root.parent.mkdir(parents=True, exist_ok=True)
    cache_root.symlink_to(
        client.app.state.settings.data_dir / "artifacts", target_is_directory=True
    )
    runner = worker(client)
    assert runner.run_once()
    assert read(client, project).json()["entries"][0]["status"] == "failed"
    assert not runner.run_once()
    # Existing public job architecture remains usable while derived cache repair is needed.
    reply = client.post(
        f"/api/v1/projects/{project['id']}/jobs",
        json={
            "job_type": "molweave.demo.structure_statistics",
            "parameters": {},
            "inputs": [{"role": "structure", "entry_id": source(project)["entry_id"]}],
        },
    )
    assert reply.status_code == 201, reply.text
    assert runner.run_once()
    assert client.get(f"/api/v1/jobs/{reply.json()['id']}").json()["status"] == "completed"
    cache_root.unlink()
    assert demand(client, project, consumer, 2).status_code == 200
    assert runner.run_once()
    assert read(client, project).json()["entries"][0]["status"] == "ready"


def test_disabled_descriptor_plugin_is_explicit_and_does_not_requeue(client: ApiClient) -> None:
    from neistra_core.jobs import PluginRegistry

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    registry = PluginRegistry.load(
        allowlist=("molweave.demo", "molweave.minimization"),
        configured_targets=(
            "neistra_demo_plugin.plugin:plugin",
            "neistra_core.minimization.plugin:plugin",
        ),
        discover_installed=False,
    )
    runner = JobWorker(
        client.app.state.settings,
        client.app.state.session_factory,
        registry,
        "disabled-property-worker",
    )
    assert runner.run_once()
    failed = read(client, project).json()["entries"][0]
    assert failed["status"] == "failed" and "disabled" in failed["reason"]
    assert not runner.run_once()
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Job)) == 0


def test_late_failure_does_not_overwrite_new_consumer_generation(client: ApiClient) -> None:
    from neistra_api import ligand_property_service as service_module
    from neistra_api.ligand_property_schemas import LigandPropertySource
    from neistra_api.ligand_property_service import LigandPropertyService
    from neistra_api.models import LigandPropertyConsumer, StructureEntry

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    with client.app.state.session_factory() as held:
        row = held.get(LigandPropertyConsumer, consumer)
        entry = held.get(StructureEntry, source(project)["entry_id"])
        assert row is not None and entry is not None
        service = LigandPropertyService(held, client.app.state.settings)
        reference = LigandPropertySource.model_validate(source(project))
        target = service._read_target(
            project["id"],
            reference,
            service_module.source_key(reference, entry.original_artifact_id),
            [row],
        )
        assert demand(client, project, consumer, 2).status_code == 200
        service._lock_retirement(project["id"])
        service._fail_target(target, "obsolete failure")
        held.commit()
    assert read(client, project).json()["entries"][0]["status"] == "pending"
    assert worker(client).run_once()
    assert read(client, project).json()["entries"][0]["status"] == "ready"


def test_each_materialization_bounds_source_proofs_and_coalesces_matching_inputs(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_core.ligand_properties as kernel
    from neistra_api.job_service import JobService
    from neistra_api.ligand_property_service import LigandPropertyService

    project = imported(client)
    initial_id = project["entries"][0]["id"]
    for _ in range(8):
        reply = client.post(
            f"/api/v1/projects/{project['id']}/entries/{initial_id}/duplicate",
            json={"expected_revision": project["revision"]},
        )
        assert reply.status_code == 200, reply.text
        project = reply.json()
    consumer = allocate(client, project)
    references = [source({"entries": [entry]}) for entry in project["entries"]]
    active = references[-1]["entry_id"]
    reply = client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
        json={
            "sequence": 1,
            "entries": references,
            "descriptor_ids": [],
            "active_entry_id": active,
        },
    )
    assert reply.status_code == 200, reply.text
    calls = []
    import neistra_api.ligand_property_verification as module

    original_prepare = module.raw_source_fingerprint

    def counted(*args: Any, **kwargs: Any) -> Any:
        calls.append(True)
        return original_prepare(*args, **kwargs)

    monkeypatch.setattr(module, "raw_source_fingerprint", counted)

    def forbidden(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("The coordinator must not prepare native chemistry")

    monkeypatch.setattr(kernel, "prepare_descriptor_input", forbidden)
    with client.app.state.session_factory() as session:
        service = LigandPropertyService(session, client.app.state.settings)
        job = service.materialize("bounded-source-test")
        assert isinstance(job, Job)
        execution = session.scalar(select(LigandPropertyExecution))
        assert execution is not None
        assert len(calls) == 1
        assert len(execution.captures) == 1
        assert len(execution.captures[0]["targets"]) == 8
        assert execution.captures[0]["targets"][0]["source"]["entry_id"] == active
        JobService(session, client.app.state.settings, client.app.state.job_registry).cancelled(
            job.id
        )
        service.reaped(job.id)


def test_bulk_descriptor_work_yields_to_user_job_and_then_continues(client: ApiClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Bounded fairness"}).json()
    reply = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0, "generate_3d": "false"},
        files=[
            ("files", (f"chain-{count}.smi", ("C" * count + "\n").encode(), "text/plain"))
            for count in range(1, 34)
        ],
    )
    assert reply.status_code == 201, reply.text
    project = reply.json()["project"]
    references = [source({"entries": [entry]}) for entry in project["entries"]]
    assert len(references) == 33
    consumer = allocate(client, project)
    reply = client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
        json={
            "sequence": 1,
            "entries": references,
            "descriptor_ids": [],
            "active_entry_id": references[-1]["entry_id"],
        },
    )
    assert reply.status_code == 200, reply.text
    submitted = client.post(
        f"/api/v1/projects/{project['id']}/jobs",
        json={
            "job_type": "molweave.demo.structure_statistics",
            "parameters": {},
            "inputs": [{"role": "structure", "entry_id": references[0]["entry_id"]}],
        },
    )
    assert submitted.status_code == 201, submitted.text
    ordinary_id = submitted.json()["id"]
    runner = worker(client)
    for _ in range(4):
        assert runner.run_once()
    assert client.get(f"/api/v1/jobs/{ordinary_id}").json()["status"] == "queued"
    assert runner.run_once()
    assert client.get(f"/api/v1/jobs/{ordinary_id}").json()["status"] == "completed"
    with client.app.state.session_factory() as session:
        assert (
            session.scalar(
                select(func.count()).select_from(Job).where(Job.purpose == "ligand_properties")
            )
            == 4
        )
    assert runner.run_once()
    all_values = client.post(
        f"/api/v1/projects/{project['id']}/ligand-properties/read",
        json={"entries": references, "descriptor_ids": []},
    )
    assert all_values.status_code == 200, all_values.text
    assert all(value["status"] == "ready" for value in all_values.json()["entries"])


def test_warm_alias_turns_yield_to_user_job_without_new_descriptor_children(
    client: ApiClient,
) -> None:
    from neistra_api.models import LigandPropertyBinding

    project = client.post("/api/v1/projects", json={"name": "Warm fairness"}).json()
    reply = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0, "generate_3d": "false"},
        files=[("files", ("ethanol.mol", FIXTURE.read_bytes(), "chemical/x-mdl-molfile"))]
        * 41,
    )
    assert reply.status_code == 201, reply.text
    project = reply.json()["project"]
    references = [source({"entries": [entry]}) for entry in project["entries"]]
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    assert worker(client).run_once()
    assert read(client, project).json()["entries"][0]["status"] == "ready"

    reply = client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
        json={"sequence": 2, "entries": references, "descriptor_ids": [],
              "active_entry_id": references[-1]["entry_id"]},
    )
    assert reply.status_code == 200, reply.text
    submitted = client.post(
        f"/api/v1/projects/{project['id']}/jobs",
        json={"job_type": "molweave.demo.structure_statistics", "parameters": {},
              "inputs": [{"role": "structure", "entry_id": references[0]["entry_id"]}]},
    )
    assert submitted.status_code == 201, submitted.text
    ordinary_id = submitted.json()["id"]
    runner = worker(client)
    for _ in range(4):
        assert runner.run_once()
        assert runner.property_metrics["warm_bindings"] > 0
        assert runner.property_metrics["child_reports"] == 0
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Job).where(
            Job.purpose == "ligand_properties")) == 1
        assert session.scalar(select(func.count()).select_from(LigandPropertyBinding)) < 41
    assert client.get(f"/api/v1/jobs/{ordinary_id}").json()["status"] == "queued"
    assert runner.run_once()
    assert client.get(f"/api/v1/jobs/{ordinary_id}").json()["status"] == "completed"
    for _ in range(3):
        runner.run_once()
    values = client.post(
        f"/api/v1/projects/{project['id']}/ligand-properties/read",
        json={"entries": references, "descriptor_ids": []},
    )
    assert values.status_code == 200, values.text
    assert all(item["status"] == "ready" for item in values.json()["entries"])
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Job).where(
            Job.purpose == "ligand_properties")) == 1


@pytest.mark.parametrize("turns", [("warm", "cold", "warm", "failure"), ("failure",) * 4])
def test_mixed_and_cache_failure_progress_obeys_ordinary_and_bulk_turn_bounds(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, turns: tuple[str, ...],
) -> None:
    from neistra_api.ligand_property_cache import PropertyCacheError
    from neistra_api.ligand_property_service import LigandPropertyService

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    submitted = client.post(
        f"/api/v1/projects/{project['id']}/jobs",
        json={"job_type": "molweave.demo.structure_statistics", "parameters": {},
              "inputs": [{"role": "structure", "entry_id": project["entries"][0]["id"]}]},
    )
    assert submitted.status_code == 201, submitted.text
    ordinary_id = submitted.json()["id"]
    original = LigandPropertyService.materialize
    remaining = iter(turns)
    bulk_choices: list[bool] = []

    def materialize(self: LigandPropertyService, worker_id: str, *,
                    prefer_bulk: bool = False, implementation_enabled: bool = True,
                    ) -> Job | bool | None:
        bulk_choices.append(prefer_bulk)
        kind = next(remaining, "idle")
        if kind == "cold":
            return original(self, worker_id, prefer_bulk=prefer_bulk,
                            implementation_enabled=implementation_enabled)
        if kind == "failure":
            raise PropertyCacheError("Controlled unavailable cache")
        return True if kind == "warm" else None

    monkeypatch.setattr(LigandPropertyService, "materialize", materialize)
    runner = worker(client)
    for _ in turns:
        assert runner.run_once()
    assert client.get(f"/api/v1/jobs/{ordinary_id}").json()["status"] == "queued"
    assert runner.run_once()
    assert client.get(f"/api/v1/jobs/{ordinary_id}").json()["status"] == "completed"
    assert len(bulk_choices) == 4
    assert not runner.run_once()
    assert bulk_choices == [False, False, False, False, True]


def test_slow_pending_heartbeat_and_priority_change_keep_scientific_generation(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from datetime import timedelta

    import neistra_api.ligand_property_service as module
    from neistra_api.job_service import JobService
    from neistra_api.models import LigandPropertyConsumer, utc_now

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    with client.app.state.session_factory() as session:
        service = module.LigandPropertyService(session, client.app.state.settings)
        job = service.materialize("controlled-slow-child")
        assert isinstance(job, Job)
        captured_inputs, parameters, job_id = (
            service.execution_inputs(job),
            dict(job.parameters),
            job.id,
        )
        JobService(session, client.app.state.settings, client.app.state.job_registry).progress(
            job.id, 33, "Held pending"
        )
        row = session.get(LigandPropertyConsumer, consumer)
        generation, queue_age = row.generation, row.updated_at
    # Simulate a legitimate >20s pending batch without sleeping or changing any deadline.
    advanced = utc_now() + timedelta(seconds=21)
    monkeypatch.setattr(module, "utc_now", lambda: advanced)
    heartbeat = demand(client, project, consumer, 1)
    assert heartbeat.status_code == 200, heartbeat.text
    assert heartbeat.json()["entries"][0]["status"] == "pending"
    assert heartbeat.json()["entries"][0]["progress"] == 33
    assert heartbeat.json()["expires_at"].endswith(("Z", "+00:00"))
    priority = body(project, sequence=2)
    priority["active_entry_id"] = None
    changed = client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
        json=priority,
    )
    assert changed.status_code == 200, changed.text
    with client.app.state.session_factory() as session:
        row = session.get(LigandPropertyConsumer, consumer)
        assert row.sequence == 2 and row.generation == generation and row.updated_at == queue_age
    values = captured_result(parameters, captured_inputs)
    with client.app.state.session_factory() as session:
        JobService(session, client.app.state.settings, client.app.state.job_registry).complete(
            job_id, (), values, [], "Ready"
        )
        module.LigandPropertyService(session, client.app.state.settings).reaped(job_id)
    assert read(client, project).json()["entries"][0]["status"] == "ready"


def test_priority_heartbeat_preserve_failure_but_explicit_retry_retires_old_generation(
    client: ApiClient,
) -> None:
    from neistra_api.ligand_property_schemas import LigandPropertySource
    from neistra_api.ligand_property_service import source_key
    from neistra_api.models import LigandPropertyConsumer, StructureEntry

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    with client.app.state.session_factory() as session:
        row = session.get(LigandPropertyConsumer, consumer)
        entry = session.get(StructureEntry, source(project)["entry_id"])
        key = source_key(
            LigandPropertySource.model_validate(source(project)), entry.original_artifact_id
        )
        row.failures = {key: "retained failure"}
        generation, queue_age = row.generation, row.updated_at
        session.commit()
    assert demand(client, project, consumer, 1).status_code == 200
    priority = body(project, sequence=2)
    priority["active_entry_id"] = None
    url = f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}"
    assert client.request("PUT", url, json=priority).status_code == 200
    with client.app.state.session_factory() as session:
        row = session.get(LigandPropertyConsumer, consumer)
        assert row.generation == generation and row.failures[key] == "retained failure"
        assert row.updated_at == queue_age
    retry = {**priority, "sequence": 3}
    assert client.request("PUT", url, json=retry).status_code == 200
    with client.app.state.session_factory() as session:
        row = session.get(LigandPropertyConsumer, consumer)
        assert row.generation == generation + 1 and not row.failures
    assert worker(client).run_once()
    assert read(client, project).json()["entries"][0]["status"] == "ready"


def test_disjoint_shared_coverage_needs_only_one_surviving_consumer(client: ApiClient) -> None:
    from neistra_api.job_service import JobService
    from neistra_api.ligand_property_service import LigandPropertyService

    project = imported(client)
    assert (
        client.request(
            "PUT", PREFERENCES, json={"expected_revision": 0, "enabled_categories": []}
        ).status_code
        == 200
    )
    first, second = allocate(client, project), allocate(client, project)
    for consumer, descriptor in ((first, "hbd"), (second, "molecular_weight")):
        payload = {**body(project), "descriptor_ids": [descriptor]}
        response = client.request(
            "PUT",
            f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
            json=payload,
        )
        assert response.status_code == 200, response.text
    with client.app.state.session_factory() as session:
        service = LigandPropertyService(session, client.app.state.settings)
        job = service.materialize("shared-subset-child")
        assert isinstance(job, Job)
        children, parameters, job_id = service.execution_inputs(job), dict(job.parameters), job.id
        execution = session.scalar(select(LigandPropertyExecution))
        assert len(execution.captures) == 1
        assert set(execution.captures[0]["descriptor_ids"]) == {"hbd", "molecular_weight"}
    url = f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{first}"
    assert client.request("DELETE", url, params={"sequence": 2}).status_code == 200
    values = captured_result(parameters, children)
    with client.app.state.session_factory() as session:
        JobService(session, client.app.state.settings, client.app.state.job_registry).complete(
            job_id, (), values, [], "Shared ready"
        )
        LigandPropertyService(session, client.app.state.settings).reaped(job_id)
    response = client.post(
        f"/api/v1/projects/{project['id']}/ligand-properties/read",
        json={
            "entries": [source(project)],
            "descriptor_ids": ["molecular_weight"],
        },
    )
    current = response.json()["entries"][0]
    assert current["status"] == "ready"
    assert set(current["report"]["coverage"]) == {"hbd", "molecular_weight"}


def test_child_qualifies_once_while_coordinator_uses_only_raw_proof(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_property_plugin as module
    import neistra_core.ligand_properties as kernel
    from neistra_api.ligand_property_service import LigandPropertyService

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    calls = []
    preparing = module.prepare_descriptor_input

    def counted(*args: Any, **kwargs: Any) -> Any:
        calls.append(True)
        return preparing(*args, **kwargs)

    def forbidden(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("Native preparation in coordinator is forbidden")

    monkeypatch.setattr(module, "prepare_descriptor_input", counted)
    monkeypatch.setattr(kernel, "prepare_descriptor_input", forbidden)
    with client.app.state.session_factory() as session:
        service = LigandPropertyService(session, client.app.state.settings)
        job = service.materialize("native-boundary-test")
        assert isinstance(job, Job)
        assert calls == []
        assert service.last_metrics["source_proofs"] == 1
        assert service.last_metrics["coordinator_native_preparations"] == 0
        children = service.execution_inputs(job)
        assert calls == []
        result = captured_result(dict(job.parameters), children)
        assert len(calls) == 1
        assert len(result["stage_timings"]) == 1
        service.complete(job, result)
        service.reaped(job.id)
    assert read(client, project).json()["entries"][0]["status"] == "ready"


def test_entry_order_only_heartbeat_is_canonical_and_does_not_change_generation(
    client: ApiClient,
) -> None:
    from neistra_api.models import LigandPropertyConsumer

    project = imported(client)
    reply = client.post(
        f"/api/v1/projects/{project['id']}/entries/{source(project)['entry_id']}/duplicate",
        json={"expected_revision": project["revision"]},
    )
    assert reply.status_code == 200
    project = reply.json()
    refs = [source({"entries": [entry]}) for entry in project["entries"]]
    consumer = allocate(client, project)
    payload = {"sequence": 1, "entries": refs, "descriptor_ids": [], "active_entry_id": None}
    url = f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}"
    assert client.request("PUT", url, json=payload).status_code == 200
    with client.app.state.session_factory() as session:
        row = session.get(LigandPropertyConsumer, consumer)
        generation, queue_age = row.generation, row.updated_at
    assert (
        client.request("PUT", url, json={**payload, "entries": list(reversed(refs))}).status_code
        == 200
    )
    with client.app.state.session_factory() as session:
        row = session.get(LigandPropertyConsumer, consumer)
        assert row.generation == generation and row.updated_at == queue_age
