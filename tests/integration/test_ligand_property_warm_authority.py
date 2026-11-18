"""Current source bytes and sealed exact-source proof authorize every warm read."""

from __future__ import annotations

from typing import Any

import pytest
from neistra_api.ligand_property_service import LigandPropertyService
from neistra_api.models import (
    Artifact,
    Job,
    LigandPropertyBinding,
    LigandPropertyContent,
    LigandPropertyProof,
)
from sqlalchemy import delete, func, select

from tests.integration.test_ligand_property_lifecycle import (
    allocate,
    captured_result,
    demand,
    imported,
    read,
    source,
    worker,
)
from tests.support.api_client import ApiClient


def ready(client: ApiClient) -> tuple[dict[str, Any], str]:
    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    assert worker(client).run_once()
    assert read(client, project).json()["entries"][0]["status"] == "ready"
    return project, consumer


@pytest.mark.parametrize("kind", ["current_artifact_id", "original_artifact_id"])
@pytest.mark.parametrize("fault", ["missing", "corrupt_same_size", "grow"])
def test_warm_source_fault_retires_values_and_requires_valid_restore_retry(
    client: ApiClient,
    kind: str,
    fault: str,
) -> None:
    project, consumer = ready(client)
    with client.app.state.session_factory() as session:
        artifact = session.get(Artifact, project["entries"][0][kind])
        path = client.app.state.settings.data_dir / artifact.relative_path
        original = path.read_bytes()
    bad = original + b"extra" if fault == "grow" else b"x" * len(original)
    if fault == "missing":
        path.unlink()
    else:
        path.write_bytes(bad)
    reply = read(client, project)
    assert reply.status_code == 200, reply.text
    current = reply.json()["entries"][0]
    assert current["status"] == "failed" and current["report"] is None
    assert "integrity" in current["reason"] or "missing" in current["reason"]
    assert not worker(client).run_once()  # The failed generation cannot loop requalification.
    if fault != "missing":
        assert path.read_bytes() == bad  # No repair overwrites user sources.
    else:
        assert not path.exists()
    path.write_bytes(original)
    assert read(client, project).json()["entries"][0]["status"] == "failed"
    assert demand(client, project, consumer, 2).status_code == 200
    assert worker(client).run_once()
    restored = read(client, project).json()["entries"][0]
    assert restored["status"] == "ready"
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Job)) == 1  # Verified sealed reuse.
    assert path.read_bytes() == original


def two_sources(client: ApiClient) -> tuple[dict[str, Any], str, list[dict[str, Any]]]:
    project = imported(client)
    response = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": project["revision"], "generate_3d": "false"},
        files=[("files", ("ethylamine.smi", b"CCN\n", "text/plain"))],
    )
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    references = [source({"entries": [entry]}) for entry in project["entries"]]
    consumer = allocate(client, project)
    payload = {
        "sequence": 1,
        "entries": references,
        "descriptor_ids": [],
        "active_entry_id": references[0]["entry_id"],
    }
    response = client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
        json=payload,
    )
    assert response.status_code == 200, response.text
    assert worker(client).run_once()
    return project, consumer, references


def aggregate(client: ApiClient, project: dict[str, Any], refs: list[dict[str, Any]]) -> Any:
    return client.post(
        f"/api/v1/projects/{project['id']}/ligand-properties/read",
        json={"entries": refs, "descriptor_ids": []},
    )


def test_one_corrupt_source_does_not_hide_an_independent_valid_entry(client: ApiClient) -> None:
    project, _, refs = two_sources(client)
    with client.app.state.session_factory() as session:
        entry = next(entry for entry in project["entries"] if entry["id"] == refs[0]["entry_id"])
        artifact = session.get(Artifact, entry["original_artifact_id"])
        path = client.app.state.settings.data_dir / artifact.relative_path
        path.write_bytes(b"z" * artifact.size)
    reply = aggregate(client, project, refs)
    assert reply.status_code == 200, reply.text
    rows = {row["source"]["entry_id"]: row for row in reply.json()["entries"]}
    assert rows[refs[0]["entry_id"]]["status"] == "failed"
    assert rows[refs[0]["entry_id"]]["report"] is None
    assert rows[refs[1]["entry_id"]]["status"] == "ready"
    assert path.read_bytes() == b"z" * artifact.size


@pytest.mark.parametrize("field", ["input_hash", "source"])
def test_binding_metadata_cannot_substitute_a_valid_other_report(
    client: ApiClient, field: str
) -> None:
    project, _, refs = two_sources(client)
    with client.app.state.session_factory() as session:
        first = session.get(LigandPropertyBinding, refs[0]["entry_id"])
        second = session.get(LigandPropertyBinding, refs[1]["entry_id"])
        assert first.input_hash != second.input_hash
        if field == "input_hash":
            first.input_hash = second.input_hash
        else:
            first.source = second.source
        session.commit()
    reply = aggregate(client, project, refs)
    assert reply.status_code == 200, reply.text
    rows = reply.json()["entries"]
    assert rows[0]["status"] != "ready" and rows[0]["report"] is None
    assert rows[1]["status"] == "ready"
    assert worker(client).run_once()
    assert all(
        row["status"] == "ready" for row in aggregate(client, project, refs).json()["entries"]
    )
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Job)) == 1


def test_locator_eviction_cannot_revoke_a_retained_sealed_binding(client: ApiClient) -> None:
    project, _ = ready(client)
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(LigandPropertyProof)) == 1
        session.execute(delete(LigandPropertyProof))
        session.commit()
    assert read(client, project).json()["entries"][0]["status"] == "ready"
    assert not worker(client).run_once()
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Job)) == 1


def test_current_original_and_raw_proof_are_memoized_once_per_aggregate(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from neistra_api.import_export import ArtifactService

    project = imported(client)
    initial = project["entries"][0]["id"]
    for _ in range(4):
        reply = client.post(
            f"/api/v1/projects/{project['id']}/entries/{initial}/duplicate",
            json={"expected_revision": project["revision"]},
        )
        assert reply.status_code == 200
        project = reply.json()
    refs = [source({"entries": [entry]}) for entry in project["entries"]]
    consumer = allocate(client, project)
    payload = {"sequence": 1, "entries": refs, "descriptor_ids": [], "active_entry_id": initial}
    assert (
        client.request(
            "PUT",
            f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
            json=payload,
        ).status_code
        == 200
    )
    assert worker(client).run_once()
    calls = []
    original = ArtifactService.read_bounded_verified_bytes

    def counted(self, artifact_id: str, maximum: int) -> bytes:
        calls.append((artifact_id, maximum))
        return original(self, artifact_id, maximum)

    monkeypatch.setattr(ArtifactService, "read_bounded_verified_bytes", counted)
    assert all(
        row["status"] == "ready" for row in aggregate(client, project, refs).json()["entries"]
    )
    assert len(calls) == 2 and len({artifact for artifact, _ in calls}) == 2


@pytest.mark.parametrize("kind", ["current_artifact_id", "original_artifact_id"])
def test_held_child_cannot_install_binding_after_source_corruption(
    client: ApiClient, kind: str
) -> None:
    from neistra_api.job_service import JobService

    project = imported(client)
    consumer = allocate(client, project)
    assert demand(client, project, consumer).status_code == 200
    with client.app.state.session_factory() as session:
        service = LigandPropertyService(session, client.app.state.settings)
        job = service.materialize("held-source-authority")
        assert isinstance(job, Job)
        children, parameters, job_id = service.execution_inputs(job), dict(job.parameters), job.id
        artifact = session.get(Artifact, project["entries"][0][kind])
        path = client.app.state.settings.data_dir / artifact.relative_path
        path.write_bytes(b"y" * artifact.size)
    values = captured_result(parameters, children)
    with client.app.state.session_factory() as session:
        JobService(session, client.app.state.settings, client.app.state.job_registry).complete(
            job_id, (), values, [], "Held"
        )
        assert session.get(LigandPropertyBinding, project["entries"][0]["id"]) is None
        LigandPropertyService(session, client.app.state.settings).reaped(job_id)
    current = read(client, project).json()["entries"][0]
    assert current["status"] == "failed" and current["report"] is None
    assert path.read_bytes() == b"y" * artifact.size
    assert not worker(client).run_once()


def alias_project(client: ApiClient, count: int) -> dict[str, Any]:
    from tests.integration.test_ligand_property_lifecycle import FIXTURE

    project = client.post("/api/v1/projects", json={"name": "Distinct exact-source aliases"}).json()
    reply = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0, "generate_3d": "false"},
        files=[
            (
                "files",
                (f"same-chemistry-{index}.mol", FIXTURE.read_bytes(), "chemical/x-mdl-molfile"),
            )
            for index in range(count)
        ],
    )
    assert reply.status_code == 201, reply.text
    return reply.json()["project"]


def requested(
    client: ApiClient,
    project: dict[str, Any],
    refs: list[dict[str, Any]],
    consumer: str,
    sequence: int,
) -> Any:
    return client.request(
        "PUT",
        f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
        json={
            "sequence": sequence,
            "entries": refs,
            "descriptor_ids": [],
            "active_entry_id": refs[0]["entry_id"],
        },
    )


def test_33_distinct_raw_aliases_finish_and_stay_ready_without_proof_eviction_thrash(
    client: ApiClient,
) -> None:
    import json

    project = alias_project(client, 33)
    refs = [source({"entries": [entry]}) for entry in project["entries"]]
    consumer = allocate(client, project)
    assert requested(client, project, refs, consumer, 1).status_code == 200
    runner = worker(client)
    for _ in range(8):
        if all(
            row["status"] == "ready" for row in aggregate(client, project, refs).json()["entries"]
        ):
            break
        assert runner.run_once()
    else:
        pytest.fail("Admitted aliases did not make bounded progress")
    for _ in range(3):
        assert all(
            row["status"] == "ready" for row in aggregate(client, project, refs).json()["entries"]
        )
        assert not runner.run_once()
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(LigandPropertyContent)) == 1
        content = session.scalar(select(LigandPropertyContent))
        path = (
            client.app.state.settings.data_dir
            / "cache/ligand-properties-v1"
            / content.relative_path
        )
        sealed = json.loads(path.read_bytes())
        assert len(sealed["semantic_fingerprints"]) == 33
        assert content.size <= 128 * 1024
        assert session.scalar(select(func.count()).select_from(Job)) <= 8


def test_finite_proof_capacity_refuses_only_new_alias_without_losing_prior_proofs(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_property_cache as module

    project = alias_project(client, 3)
    refs = [source({"entries": [entry]}) for entry in project["entries"]]
    consumer = allocate(client, project)
    monkeypatch.setattr(module, "MAX_PROOFS_PER_CONTENT", 2)
    assert requested(client, project, refs[:2], consumer, 1).status_code == 200
    runner = worker(client)
    assert runner.run_once()
    with client.app.state.session_factory() as session:
        content = session.scalar(select(LigandPropertyContent))
        digest, location = content.sha256, content.relative_path
        path = client.app.state.settings.data_dir / "cache/ligand-properties-v1" / location
        original_envelope = path.read_bytes()
    assert requested(client, project, refs, consumer, 2).status_code == 200
    assert runner.run_once()
    rows = aggregate(client, project, refs).json()["entries"]
    assert [row["status"] for row in rows] == ["ready", "ready", "failed"]
    assert "capacity" in rows[2]["reason"]
    for _ in range(3):
        assert not runner.run_once()
    assert path.read_bytes() == original_envelope
    with client.app.state.session_factory() as session:
        assert session.scalar(select(LigandPropertyContent)).sha256 == digest
        assert session.scalar(select(func.count()).select_from(Job)) == 2


def test_all_live_content_pinned_capacity_refuses_new_work_then_releases_safely(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_property_cache as module

    project, consumer = ready(client)
    first = source(project)
    with client.app.state.session_factory() as session:
        content = session.scalar(select(LigandPropertyContent))
        path = (
            client.app.state.settings.data_dir
            / "cache/ligand-properties-v1"
            / content.relative_path
        )
        prior_bytes = path.read_bytes()
    imported_second = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": project["revision"], "generate_3d": "false"},
        files=[("files", ("amine.smi", b"CCN\n", "text/plain"))],
    )
    assert imported_second.status_code == 201
    project = imported_second.json()["project"]
    refs = [source({"entries": [entry]}) for entry in project["entries"]]
    second = next(reference for reference in refs if reference["entry_id"] != first["entry_id"])
    monkeypatch.setattr(module, "MAX_CONTENT_RECORDS", 1)
    assert requested(client, project, [first, second], consumer, 2).status_code == 200
    runner = worker(client)
    assert runner.run_once()
    rows = aggregate(client, project, [first, second]).json()["entries"]
    assert rows[0]["status"] == "ready" and rows[1]["status"] == "failed"
    assert "currently requested" in rows[1]["reason"]
    assert not runner.run_once()
    assert path.read_bytes() == prior_bytes
    assert (
        client.request(
            "DELETE",
            f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
            params={"sequence": 3},
        ).status_code
        == 200
    )
    replacement = allocate(client, project)
    assert requested(client, project, [second], replacement, 1).status_code == 200
    assert runner.run_once()
    assert aggregate(client, project, [second]).json()["entries"][0]["status"] == "ready"


@pytest.mark.parametrize("kind", ["io", "database"])
def test_cleanup_failure_does_not_turn_successful_publication_into_failed_demand(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    kind: str,
) -> None:
    from neistra_api.ligand_property_cache import LigandPropertyCache

    project = alias_project(client, 2)
    refs = [source({"entries": [entry]}) for entry in project["entries"]]
    consumer = allocate(client, project)
    assert requested(client, project, refs[:1], consumer, 1).status_code == 200
    runner = worker(client)
    assert runner.run_once()
    clean = LigandPropertyCache.cleanup_retired
    blocked = []

    def fail_after_publication(self) -> int:
        if self._retired:
            blocked.extend(self._retired)
            if kind == "database":
                from sqlalchemy.exc import OperationalError

                raise OperationalError("cleanup", {}, OSError("Controlled cleanup failure"))
            raise OSError("Controlled cleanup failure")
        return clean(self)

    monkeypatch.setattr(LigandPropertyCache, "cleanup_retired", fail_after_publication)
    assert requested(client, project, refs, consumer, 2).status_code == 200
    assert runner.run_once()
    assert all(
        row["status"] == "ready" for row in aggregate(client, project, refs).json()["entries"]
    )
    assert blocked and "cleanup deferred" in caplog.text
    with client.app.state.session_factory() as session:
        jobs = session.scalars(select(Job).order_by(Job.created_at)).all()
        assert all(job.status == "completed" for job in jobs)
        from neistra_api.job_service import JobService
        from neistra_api.models import LigandPropertyConsumer

        service = JobService(session, client.app.state.settings, client.app.state.job_registry)
        service.fail(jobs[-1].id, "late_cleanup", "Late housekeeping failure")
        service.cancelled(jobs[-1].id, "Late cancellation")
        session.commit()
        assert not session.get(LigandPropertyConsumer, consumer).failures
    monkeypatch.setattr(LigandPropertyCache, "cleanup_retired", clean)
    assert runner.recover_abandoned() == 0
    assert all(
        row["status"] == "ready" for row in aggregate(client, project, refs).json()["entries"]
    )


def test_aggregate_source_budget_is_explicit_and_does_not_destroy_valid_bindings(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_property_verification as module

    project, _, refs = two_sources(client)
    with client.app.state.session_factory() as session:
        sizes = []
        for entry in project["entries"]:
            sizes.append(
                sum(
                    session.get(Artifact, entry[key]).size
                    for key in ("current_artifact_id", "original_artifact_id")
                )
            )
    normal_budget = module.SOURCE_VERIFICATION_BYTES
    monkeypatch.setattr(module, "SOURCE_VERIFICATION_BYTES", max(sizes))
    rows = aggregate(client, project, refs).json()["entries"]
    assert rows[0]["status"] == "ready"
    assert rows[1]["status"] == "unavailable" and rows[1]["report"] is None
    assert "Aggregate" in rows[1]["reason"] and "budget" in rows[1]["reason"]
    monkeypatch.setattr(module, "SOURCE_VERIFICATION_BYTES", normal_budget)
    assert all(
        row["status"] == "ready" for row in aggregate(client, project, refs).json()["entries"]
    )
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Job)) == 1


@pytest.mark.parametrize("caller", ["foreground", "scheduler"])
@pytest.mark.parametrize("transition", ["B", "ABA", "retry", "absent", "restored"])
def test_delayed_source_failure_cannot_retire_new_binding_or_owner(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    caller: str,
    transition: str,
) -> None:
    """Pause a real old-byte failure until a newer actor publishes, then resume it."""
    from neistra_api import ligand_property_service as service_module
    from neistra_api.ligand_property_schemas import LigandPropertyReadRequest
    from neistra_api.ligand_property_service import utc
    from neistra_api.ligand_property_verification import (
        PropertySourceFailure,
        PropertySourceVerification,
    )
    from neistra_api.models import LigandPropertyConsumer, utc_now

    from tests.integration.test_ligand_property_lifecycle import translated

    if transition == "absent":
        project = imported(client)
        consumer = allocate(client, project)
        assert demand(client, project, consumer).status_code == 200
    else:
        project, consumer = ready(client)
    with client.app.state.session_factory() as inspection:
        binding = inspection.get(LigandPropertyBinding, project["entries"][0]["id"])
        old_nonce = binding.incarnation if binding is not None else None
        frozen_time = utc(binding.created_at) if binding is not None else utc_now()
        artifact = inspection.get(Artifact, project["entries"][0]["current_artifact_id"])
        path = client.app.state.settings.data_dir / artifact.relative_path
        preserved = path.read_bytes()
    # Every actual B/ABA install has the SAME wall timestamp as A. Identity must
    # therefore come from the incarnation, not created_at or source/hash equality.
    monkeypatch.setattr(service_module, "utc_now", lambda: frozen_time)
    newer: dict[str, Any] = {}
    original = PropertySourceVerification.fingerprint
    held = False
    with client.app.state.session_factory() as old_session:
        old_service = LigandPropertyService(old_session, client.app.state.settings)

        def delayed(self: Any, entry: Any, reference: Any) -> Any:
            nonlocal held
            if self.service is not old_service or held:
                return original(self, entry, reference)
            held = True
            path.write_bytes(b"!" * len(preserved))
            try:
                original(self, entry, reference)
            except PropertySourceFailure as error:
                old_failure = error
            else:
                pytest.fail("The held old verification must really fail source integrity")
            finally:
                path.write_bytes(preserved)
            current = project
            if transition in {"B", "ABA"}:
                current = translated(client, project)
            if transition != "restored":
                assert demand(client, current, consumer, 2).status_code == 200
            if transition not in {"retry", "restored"}:
                assert worker(client).run_once()
            if transition == "ABA":
                reply = client.post(
                    f"/api/v1/projects/{project['id']}/history/undo",
                    json={"expected_revision": current["revision"]},
                )
                assert reply.status_code == 200, reply.text
                current = reply.json()
                assert source(current) == source(project)
                assert demand(client, current, consumer, 3).status_code == 200
                assert worker(client).run_once()
            with client.app.state.session_factory() as inspection:
                published = inspection.get(LigandPropertyBinding, source(current)["entry_id"])
                owner = inspection.get(LigandPropertyConsumer, consumer)
                newer.update(
                    project=current,
                    nonce=published.incarnation,
                    input_hash=published.input_hash,
                    source_key=published.source_key,
                    source=published.source,
                    created_at=utc(published.created_at),
                    generation=owner.generation,
                    failures=dict(owner.failures),
                )
                assert newer["created_at"] == frozen_time
                assert not newer["failures"]
                if transition in {"retry", "restored"}:
                    assert newer["nonce"] == old_nonce  # No artificial cache-hit reinstallation.
                else:
                    assert newer["nonce"] != old_nonce
            raise old_failure

        monkeypatch.setattr(PropertySourceVerification, "fingerprint", delayed)
        if caller == "foreground":
            reply = old_service.read(
                project["id"],
                LigandPropertyReadRequest(entries=(source(project),), descriptor_ids=()),
            )
            assert reply.entries[0].status == "failed"  # Only this old request's result.
        else:
            assert old_service.materialize("delayed-old-verification") is True
        assert held and newer
    with client.app.state.session_factory() as inspection:
        current = inspection.get(LigandPropertyBinding, source(newer["project"])["entry_id"])
        owner = inspection.get(LigandPropertyConsumer, consumer)
        assert current.incarnation == newer["nonce"]
        assert current.input_hash == newer["input_hash"]
        assert current.source_key == newer["source_key"] and current.source == newer["source"]
        assert owner.generation == newer["generation"] and owner.failures == newer["failures"]
    current_read = read(client, newer["project"]).json()["entries"][0]
    assert current_read["status"] == "ready"
    assert current_read["report"]["input_hash"] == newer["input_hash"]
    assert path.read_bytes() == preserved


def test_delayed_invalid_binding_cleanup_preserves_a_new_valid_install(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from neistra_api.ligand_property_schemas import LigandPropertyReadRequest
    from neistra_api.models import LigandPropertyConsumer

    project, consumer, refs = two_sources(client)
    with client.app.state.session_factory() as inspection:
        first = inspection.get(LigandPropertyBinding, refs[0]["entry_id"])
        first.input_hash = inspection.get(LigandPropertyBinding, refs[1]["entry_id"]).input_hash
        old_nonce = first.incarnation
        inspection.commit()
    with client.app.state.session_factory() as old_session:
        service = LigandPropertyService(old_session, client.app.state.settings)
        original = service.cache.read_associated
        newer: dict[str, Any] = {}

        def delayed(input_hash: str, fingerprint: str) -> Any:
            invalid = original(input_hash, fingerprint)
            assert invalid is None  # A real other-report substitution failed its sealed proof.
            assert worker(client).run_once()  # The valid source proof installs a fresh incarnation.
            with client.app.state.session_factory() as inspection:
                binding = inspection.get(LigandPropertyBinding, refs[0]["entry_id"])
                owner = inspection.get(LigandPropertyConsumer, consumer)
                newer.update(nonce=binding.incarnation, failures=dict(owner.failures))
                assert newer["nonce"] != old_nonce
            return None

        monkeypatch.setattr(service.cache, "read_associated", delayed)
        service.read(
            project["id"], LigandPropertyReadRequest(entries=(refs[0],), descriptor_ids=())
        )
    with client.app.state.session_factory() as inspection:
        assert inspection.get(LigandPropertyBinding, refs[0]["entry_id"]).incarnation == newer[
            "nonce"
        ]
        assert inspection.get(LigandPropertyConsumer, consumer).failures == newer["failures"]
    assert all(
        row["status"] == "ready" for row in aggregate(client, project, refs).json()["entries"]
    )


def test_retirement_reuses_writer_transaction_and_rollback_restores_exact_incarnation(
    client: ApiClient,
) -> None:
    from neistra_api.ligand_property_schemas import LigandPropertyReadRequest, LigandPropertySource
    from neistra_api.ligand_property_service import source_key
    from neistra_api.models import LigandPropertyConsumer
    from sqlalchemy import update

    project, consumer = ready(client)
    reference = LigandPropertySource.model_validate(source(project))
    with client.app.state.session_factory() as session:
        service = LigandPropertyService(session, client.app.state.settings)
        observed = service._binding_stamp(reference.entry_id)
        assert observed is not None
        # A previous cache verification has already acquired the SQLite writer.
        session.execute(update(LigandPropertyContent).values(used_at=LigandPropertyContent.used_at))
        service._lock_retirement(project["id"])
        assert service._drop_binding(observed)
        target = {
            "source": reference.model_dump(mode="json"),
            "source_key": observed.source_key,
        }
        service._bind(target, observed.input_hash)
        session.flush()
        replacement = service._binding_stamp(reference.entry_id)
        assert replacement.incarnation != observed.incarnation
        assert not service._drop_binding(observed)  # SQL CAS itself rejects an old incarnation.
        assert service._binding_stamp(reference.entry_id) == replacement
        session.rollback()
        assert service._binding_stamp(reference.entry_id) == observed
        assert not service._drop_binding(None)  # Absence never grants deletion authority.
        assert service._binding_stamp(reference.entry_id) == observed
        artifact = session.get(Artifact, project["entries"][0]["current_artifact_id"])
        path = client.app.state.settings.data_dir / artifact.relative_path
        preserved = path.read_bytes()
        path.write_bytes(b"?" * len(preserved))
        session.execute(update(LigandPropertyContent).values(used_at=LigandPropertyContent.used_at))
        try:
            # The foreground failure reuses the held writer; no nested BEGIN/commit is needed.
            result = service.read(
                project["id"], LigandPropertyReadRequest(entries=(reference,), descriptor_ids=())
            )
            assert result.entries[0].status == "failed"
            assert service._binding_stamp(reference.entry_id) is None
            owner = session.get(LigandPropertyConsumer, consumer)
            key = source_key(reference, project["entries"][0]["original_artifact_id"])
            assert key in owner.failures
        finally:
            path.write_bytes(preserved)
