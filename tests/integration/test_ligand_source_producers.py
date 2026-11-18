from __future__ import annotations

from typing import Any

import pytest
from neistra_api.artifact_errors import ArtifactNotFoundError
from neistra_api.import_export import ArtifactService
from neistra_api.models import Artifact, StructureEntry
from neistra_core.ligands.models import LigandDesignationV1

from tests.integration.test_ligand_designation import FIXTURE, candidates, imported
from tests.support.api_client import ApiClient


def operation(
    client: ApiClient, producer: str
) -> tuple[dict[str, Any], dict[str, Any], str, dict[str, Any]]:
    project = imported(client)
    if producer == "resolve":
        reply = client.post(
            f"/api/v1/projects/{project['id']}/imports",
            data={"expected_revision": project["revision"], "generate_3d": "true"},
            files=[
                ("files", ("second.mol", FIXTURE.read_bytes() + b"\n", "chemical/x-mdl-molfile"))
            ],
        )
        assert reply.status_code == 201, reply.text
        project = client.get(f"/api/v1/projects/{project['id']}").json()
        with client.app.state.session_factory() as session:
            for item in project["entries"]:
                entry = session.get(StructureEntry, item["id"])
                assert entry is not None
                entry.ligand_designation = LigandDesignationV1().model_dump(mode="json")
            session.commit()
        project = client.get(f"/api/v1/projects/{project['id']}").json()
        entry_data = project["entries"][-1]
        return (
            project,
            entry_data,
            f"/api/v1/projects/{project['id']}/ligand-designations/resolve",
            {
                "expected_revision": project["revision"],
                "entry_ids": [item["id"] for item in project["entries"]],
            },
        )
    entry_data = project["entries"][0]
    page = candidates(client, project)
    return (
        project,
        entry_data,
        f"/api/v1/projects/{project['id']}/entries/{entry_data['id']}/ligand-designation",
        {
            "expected_revision": project["revision"],
            "expected_artifact_id": entry_data["current_artifact_id"],
            "candidate_key": page["candidates"][0]["candidate_key"],
            "expected_input_hash": page["input_hash"],
        },
    )


@pytest.mark.parametrize("producer", ["designate", "resolve"])
@pytest.mark.parametrize("role", ["current", "original"])
@pytest.mark.parametrize("failure", ["corrupt_bytes", "missing_bytes", "missing_metadata"])
def test_write_producer_reports_only_its_exact_failed_molecular_input(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    producer: str,
    role: str,
    failure: str,
) -> None:
    project, entry, endpoint, payload = operation(client, producer)
    artifact_id = entry[f"{role}_artifact_id"]
    with client.app.state.session_factory() as session:
        artifact = session.get(Artifact, artifact_id)
        assert artifact is not None
        path = client.app.state.settings.data_dir / artifact.relative_path
    original = path.read_bytes()
    real_get = ArtifactService.get

    def lookup(service: ArtifactService, requested: str) -> Artifact:
        if requested == artifact_id:
            raise ArtifactNotFoundError(requested)
        return real_get(service, requested)

    try:
        if failure == "missing_metadata":
            monkeypatch.setattr(ArtifactService, "get", lookup)
        elif failure == "missing_bytes":
            path.unlink()
        else:
            path.write_bytes(original[:-1] + b"!")
        reply = client.request("PUT" if producer == "designate" else "POST", endpoint, json=payload)
        assert reply.status_code == (404 if failure == "missing_metadata" else 409), reply.text
        detail = reply.json()["detail"]
        assert detail["code"] == (
            "artifact_not_found" if failure == "missing_metadata" else "artifact_integrity_error"
        )
        assert detail["source_verification"] == role
        assert detail["source_identity"] == {
            "project_id": project["id"],
            "entry_id": entry["id"],
            "current_artifact_id": entry["current_artifact_id"],
            "original_artifact_id": entry["original_artifact_id"],
        }
    finally:
        path.write_bytes(original)
        monkeypatch.setattr(ArtifactService, "get", real_get)
    # A failed batch cannot commit an earlier member's tentative assessment.
    assert client.get(f"/api/v1/projects/{project['id']}").json() == project


@pytest.mark.parametrize("producer", ["designate", "resolve"])
def test_noncanonical_current_source_conflict_is_typed_and_source_bound(
    client: ApiClient,
    producer: str,
) -> None:
    project, entry, endpoint, payload = operation(client, producer)
    with client.app.state.session_factory() as session:
        artifact = session.get(Artifact, entry["current_artifact_id"])
        assert artifact is not None
        original_type = artifact.media_type
        artifact.media_type = "text/plain"
        session.commit()
    try:
        reply = client.request("PUT" if producer == "designate" else "POST", endpoint, json=payload)
        assert reply.status_code == 409, reply.text
        detail = reply.json()["detail"]
        assert detail["code"] == "structure_artifact_conflict"
        assert detail["source_verification"] == "current"
        assert detail["source_identity"]["entry_id"] == entry["id"]
        assert detail["source_identity"]["project_id"] == project["id"]
    finally:
        with client.app.state.session_factory() as session:
            artifact = session.get(Artifact, entry["current_artifact_id"])
            assert artifact is not None
            artifact.media_type = original_type
            session.commit()


def test_semantic_inventory_hash_rejection_has_no_physical_source_provenance(
    client: ApiClient,
) -> None:
    _, _, endpoint, payload = operation(client, "designate")
    payload["expected_input_hash"] = "0" * 64
    reply = client.request("PUT", endpoint, json=payload)
    assert reply.status_code == 409
    assert reply.json()["detail"]["code"] == "structure_artifact_conflict"
    assert "source_verification" not in reply.json()["detail"]
    assert "source_identity" not in reply.json()["detail"]


def test_clear_and_clear_noop_do_not_fabricate_molecular_read_proof(client: ApiClient) -> None:
    project, entry, endpoint, _ = operation(client, "designate")
    with client.app.state.session_factory() as session:
        artifact = session.get(Artifact, entry["current_artifact_id"])
        assert artifact is not None
        path = client.app.state.settings.data_dir / artifact.relative_path
    original = path.read_bytes()
    path.write_bytes(original[:-1] + b"!")
    try:
        first = client.request(
            "PUT",
            endpoint,
            json={
                "expected_revision": project["revision"],
                "expected_artifact_id": entry["current_artifact_id"],
                "clear": True,
            },
        )
        assert first.status_code == 200, first.text
        stored_first = client.get(f"/api/v1/projects/{project['id']}").json()
        second = client.request(
            "PUT",
            endpoint,
            json={
                "expected_revision": first.json()["revision"],
                "expected_artifact_id": entry["current_artifact_id"],
                "clear": True,
            },
        )
        assert second.status_code == 200 and second.json() == stored_first
    finally:
        path.write_bytes(original)


def test_expected_current_mismatch_is_typed_without_fabricating_old_identity(
    client: ApiClient,
) -> None:
    _, _, endpoint, payload = operation(client, "designate")
    payload["expected_artifact_id"] = "older-current-source"
    reply = client.request("PUT", endpoint, json=payload)
    assert reply.status_code == 409
    assert reply.json()["detail"]["source_verification"] == "current"
    assert "source_identity" not in reply.json()["detail"]
