"""Only verified physical input failures acquire exact current-source authority."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from uuid import uuid4

import pytest
from neistra_api.ligand_property_service import LigandPropertyService
from neistra_api.models import Artifact, LigandPropertyConsumer

from tests.integration.test_ligand_property_lifecycle import allocate, imported, read, source
from tests.support.api_client import ApiClient


@contextmanager
def damaged(client: ApiClient, artifact_id: str, kind: str) -> Iterator[None]:
    with client.app.state.session_factory() as session:
        artifact = session.get(Artifact, artifact_id)
        assert artifact is not None
        path = client.app.state.settings.data_dir / artifact.relative_path
    original = path.read_bytes()
    engine = client.app.state.engine
    row = None
    if kind == "bytes":
        path.write_bytes(bytes([original[0] ^ 1]) + original[1:])
    elif kind == "file":
        path.unlink()
    else:
        assert kind == "metadata"
        # External corruption of a disposable store; application FK rules stay enabled.
        with sqlite3.connect(engine.url.database) as connection:
            connection.row_factory = sqlite3.Row
            row = dict(
                connection.execute("SELECT * FROM artifacts WHERE id=?", (artifact_id,)).fetchone()
            )
            connection.execute("DELETE FROM artifacts WHERE id=?", (artifact_id,))
    try:
        yield
    finally:
        path.write_bytes(original)
        if row is not None:
            with sqlite3.connect(engine.url.database) as connection:
                columns = list(row)
                connection.execute(
                    "INSERT INTO artifacts ("
                    + ",".join(columns)
                    + ") VALUES ("
                    + ",".join("?" for _ in columns)
                    + ")",
                    [row[column] for column in columns],
                )
        assert path.read_bytes() == original


def identity(project: dict[str, Any], entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_id": project["id"],
        "entry_id": entry["id"],
        "current_artifact_id": entry["current_artifact_id"],
        "original_artifact_id": entry["original_artifact_id"],
    }


@pytest.mark.parametrize("operation", ["read", "demand"])
@pytest.mark.parametrize("role", ["current", "original"])
@pytest.mark.parametrize("kind", ["bytes", "file", "metadata"])
def test_actual_physical_source_failure_preserves_public_result_and_exact_fact(
    client: ApiClient,
    operation: str,
    role: str,
    kind: str,
) -> None:
    project = imported(client)
    entry = project["entries"][0]
    baseline = read(client, project)
    assert baseline.status_code == 200
    assert baseline.json()["entries"][0]["status"] == "pending"
    assert baseline.json()["entries"][0]["source_failure"] is None
    consumer = allocate(client, project)
    with damaged(client, entry[f"{role}_artifact_id"], kind):
        if operation == "read":
            reply = read(client, project)
        else:
            reply = client.request(
                "PUT",
                f"/api/v1/projects/{project['id']}/ligand-properties/consumers/{consumer}",
                json={
                    "entries": [source(project)],
                    "descriptor_ids": [],
                    "sequence": 1,
                    "active_entry_id": entry["id"],
                },
            )
        assert reply.status_code == 200, reply.text
        result = reply.json()["entries"][0]
        assert result["status"] == "failed" and result["report"] is None
        assert "missing" in result["reason"] or "integrity" in result["reason"]
        assert result["source_failure"] == {
            "source_identity": identity(project, entry),
            "source_verification": role,
            "reason": "artifact_unavailable",
        }
    assert client.get(f"/api/v1/projects/{project['id']}").json() == project


@pytest.mark.parametrize("role", ["current", "original"])
def test_shared_artifact_failure_memo_is_attributed_to_each_aggregate_row(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    role: str,
) -> None:
    project = imported(client)
    initial = project["entries"][0]
    for _ in range(2):
        reply = client.post(
            f"/api/v1/projects/{project['id']}/entries/{initial['id']}/duplicate",
            json={"expected_revision": project["revision"]},
        )
        assert reply.status_code == 200, reply.text
        project = reply.json()
    refs = [source({"entries": [entry]}) for entry in project["entries"]]
    assert len({entry[f"{role}_artifact_id"] for entry in project["entries"]}) == 1
    calls: list[str] = []
    real_capture = LigandPropertyService._capture_bytes

    def capture(service: LigandPropertyService, snapshot: dict[str, Any]) -> bytes:
        calls.append(snapshot["id"])
        return real_capture(service, snapshot)

    monkeypatch.setattr(LigandPropertyService, "_capture_bytes", capture)
    with damaged(client, initial[f"{role}_artifact_id"], "bytes"):
        reply = client.post(
            f"/api/v1/projects/{project['id']}/ligand-properties/read",
            json={"entries": refs, "descriptor_ids": []},
        )
        assert reply.status_code == 200, reply.text
        rows = reply.json()["entries"]
        assert len(rows) == 3
        for entry, result in zip(project["entries"], rows, strict=True):
            assert result["status"] == "failed" and result["report"] is None
            assert result["source_failure"]["source_identity"] == identity(project, entry)
            assert result["source_failure"]["source_verification"] == role
    # One initial physical read plus one independent locked retirement recheck.
    assert calls.count(initial[f"{role}_artifact_id"]) == 2


@pytest.mark.parametrize("kind", ["capacity", "unsupported", "worker"])
def test_nonphysical_failures_do_not_fabricate_source_provenance(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    kind: str,
) -> None:
    project = imported(client)
    if kind == "capacity":
        monkeypatch.setattr("neistra_api.ligand_property_verification.SOURCE_VERIFICATION_BYTES", 0)
    elif kind == "unsupported":
        with client.app.state.session_factory() as session:
            artifact = session.get(Artifact, project["entries"][0]["current_artifact_id"])
            artifact.media_type = "text/plain"
            session.commit()
    else:
        consumer = allocate(client, project)
        from tests.integration.test_ligand_property_lifecycle import demand

        assert demand(client, project, consumer).status_code == 200
        key = read(client, project).json()["entries"][0]["binding_key"]
        with client.app.state.session_factory() as session:
            session.get(LigandPropertyConsumer, consumer).failures = {key: "worker_lost"}
            session.commit()
    reply = read(client, project)
    assert reply.status_code == 200, reply.text
    result = reply.json()["entries"][0]
    assert result["status"] == ("failed" if kind == "worker" else "unavailable")
    assert result["source_failure"] is None


@pytest.mark.parametrize("field", ["instance_id", "atom_ids", "source_artifact_id"])
def test_semantic_designation_rejection_is_not_a_physical_fact(
    client: ApiClient, field: str
) -> None:
    project = imported(client)
    ref = source(project)
    ref[field] = [999] if field == "atom_ids" else str(uuid4())
    reply = client.post(
        f"/api/v1/projects/{project['id']}/ligand-properties/read",
        json={"entries": [ref], "descriptor_ids": []},
    )
    assert reply.status_code == 409, reply.text
    assert reply.json()["detail"]["code"] == "structure_artifact_conflict"
    assert "source_failure" not in reply.json()["detail"]


def test_read_fact_retains_primitive_identity_before_locked_orm_refresh(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from neistra_api.models import StructureEntry

    project = imported(client)
    entry = project["entries"][0]
    expected = identity(project, entry)
    original_lock = LigandPropertyService._lock_retirement
    replacements: list[str] = []

    def lock(service: LigandPropertyService, project_id: str) -> None:
        # The later recheck observes a different original. The earlier failure must
        # retain the exact source it physically read, without consulting live ORM state.
        current = service.session.get(StructureEntry, entry["id"])
        replacements.append(current.original_artifact_id)
        current.original_artifact_id = entry["current_artifact_id"]
        service.session.flush()
        original_lock(service, project_id)

    monkeypatch.setattr(LigandPropertyService, "_lock_retirement", lock)
    with damaged(client, entry["original_artifact_id"], "bytes"):
        reply = read(client, project)
        assert reply.status_code == 200, reply.text
        fact = reply.json()["entries"][0]["source_failure"]
        assert fact["source_identity"] == expected
        assert fact["source_verification"] == "original"
    assert replacements == [entry["original_artifact_id"]]
