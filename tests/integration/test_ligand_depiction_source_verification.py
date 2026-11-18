from __future__ import annotations

import hashlib
from typing import Any

import pytest
from neistra_api.artifact_errors import ArtifactNotFoundError
from neistra_api.import_export import ArtifactService
from neistra_api.models import Artifact, LigandDepictionBinding
from sqlalchemy import delete

from tests.integration.test_ligand_designation import candidates, imported
from tests.support.api_client import ApiClient


def depiction(client: ApiClient) -> tuple[dict[str, Any], str, dict[str, str]]:
    project = imported(client)
    entry = project["entries"][0]
    candidate = candidates(client, project)["candidates"][0]
    endpoint = (
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-candidates/"
        f"{candidate['candidate_key']}/depiction"
    )
    return entry, endpoint, {"expected_artifact_id": entry["current_artifact_id"]}


@pytest.mark.parametrize("warm", [False, True])
@pytest.mark.parametrize("role", ["current", "original"])
@pytest.mark.parametrize("failure", ["integrity", "missing"])
def test_depiction_marks_only_its_failed_molecular_input(
    client: ApiClient,
    warm: bool,
    role: str,
    failure: str,
) -> None:
    entry, endpoint, parameters = depiction(client)
    if warm:
        assert client.get(endpoint, params=parameters).json()["status"] == "ready"
    with client.app.state.session_factory() as session:
        artifact = session.get(Artifact, entry[f"{role}_artifact_id"])
        assert artifact is not None
        path = client.app.state.settings.data_dir / artifact.relative_path
    original = path.read_bytes()
    try:
        if failure == "integrity":
            path.write_bytes(original[:-1] + b"!")
        else:
            path.unlink()
        reply = client.get(endpoint, params=parameters)
        assert reply.status_code == 409, reply.text
        assert reply.json()["detail"]["code"] == "artifact_integrity_error"
        assert reply.json()["detail"]["source_verification"] == role
    finally:
        path.write_bytes(original)
    assert client.get(endpoint, params=parameters).json()["status"] == "ready"


@pytest.mark.parametrize("binding_miss", [False, True])
@pytest.mark.parametrize("failure", ["integrity", "missing"])
def test_derived_svg_failures_have_no_molecular_source_provenance(
    client: ApiClient,
    binding_miss: bool,
    failure: str,
) -> None:
    _, endpoint, parameters = depiction(client)
    ready = client.get(endpoint, params=parameters)
    assert ready.status_code == 200 and ready.json()["status"] == "ready"
    with client.app.state.session_factory() as session:
        artifact = session.get(Artifact, ready.json()["artifact"]["id"])
        assert artifact is not None
        path = client.app.state.settings.data_dir / artifact.relative_path
        if binding_miss:
            session.execute(delete(LigandDepictionBinding))
            session.commit()
    original = path.read_bytes()
    try:
        if failure == "integrity":
            path.write_bytes(original[:-1] + b"!")
        else:
            path.unlink()
        reply = client.get(endpoint, params=parameters)
        assert reply.status_code == 409, reply.text
        assert reply.json()["detail"]["code"] == "artifact_integrity_error"
        assert "source_verification" not in reply.json()["detail"]
    finally:
        path.write_bytes(original)
    assert client.get(endpoint, params=parameters).json()["status"] == "ready"


def test_malformed_normalized_input_is_a_current_source_failure(client: ApiClient) -> None:
    entry, endpoint, parameters = depiction(client)
    with client.app.state.session_factory() as session:
        artifact = session.get(Artifact, entry["current_artifact_id"])
        assert artifact is not None
        path = client.app.state.settings.data_dir / artifact.relative_path
        old_hash, old_size = artifact.sha256, artifact.size
        original = path.read_bytes()
        path.write_bytes(b"{}")
        artifact.sha256, artifact.size = hashlib.sha256(b"{}").hexdigest(), 2
        session.commit()
    try:
        reply = client.get(endpoint, params=parameters)
        assert reply.status_code == 409, reply.text
        assert reply.json()["detail"]["code"] == "artifact_integrity_error"
        assert reply.json()["detail"]["source_verification"] == "current"
    finally:
        path.write_bytes(original)
        with client.app.state.session_factory() as session:
            artifact = session.get(Artifact, entry["current_artifact_id"])
            assert artifact is not None
            artifact.sha256, artifact.size = old_hash, old_size
            session.commit()


def test_wrong_expected_artifact_keeps_the_existing_unambiguous_conflict(client: ApiClient) -> None:
    _, endpoint, _ = depiction(client)
    reply = client.get(endpoint, params={"expected_artifact_id": "different-current-source"})
    assert reply.status_code == 409
    assert reply.json()["detail"]["code"] == "structure_artifact_conflict"
    assert reply.json()["detail"]["source_verification"] == "current"
    assert "source_identity" not in reply.json()["detail"]


@pytest.mark.parametrize("warm", [False, True])
@pytest.mark.parametrize("role", ["current", "original", "derived"])
def test_missing_artifact_lookup_retains_404_and_marks_only_input_provenance(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
    warm: bool,
    role: str,
) -> None:
    entry, endpoint, parameters = depiction(client)
    if warm or role == "derived":
        ready = client.get(endpoint, params=parameters)
        assert ready.status_code == 200 and ready.json()["status"] == "ready"
    artifact_id = (
        ready.json()["artifact"]["id"] if role == "derived" else entry[f"{role}_artifact_id"]
    )
    real_get = ArtifactService.get

    def missing_lookup(service: ArtifactService, requested: str) -> Artifact:
        # Controlled repository absence at the real service boundary; no byte
        # failure is relabelled as404 and no foreign-key protection is disabled.
        if requested == artifact_id:
            raise ArtifactNotFoundError(requested)
        return real_get(service, requested)

    monkeypatch.setattr(ArtifactService, "get", missing_lookup)
    reply = client.get(endpoint, params=parameters)
    assert reply.status_code == 404, reply.text
    assert reply.json()["detail"]["code"] == "artifact_not_found"
    assert reply.json()["detail"]["message"] == f"Artifact {artifact_id} was not found"
    if role == "derived":
        assert "source_verification" not in reply.json()["detail"]
    else:
        assert reply.json()["detail"]["source_verification"] == role
