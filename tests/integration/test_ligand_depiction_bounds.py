from __future__ import annotations

import hashlib
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from typing import Any

import pytest
from neistra_api.models import Artifact, LigandDepictionBinding, LigandDepictionCache
from sqlalchemy import delete, select

from tests.integration.test_ligand_designation import candidates
from tests.support.api_client import ApiClient


def source(client: ApiClient, smiles: str) -> tuple[dict[str, Any], str, dict[str, Any]]:
    project = client.post("/api/v1/projects", json={"name": smiles}).json()
    reply = client.post(f"/api/v1/projects/{project['id']}/imports",
                        data={"expected_revision": project["revision"], "generate_3d": "true"},
                        files=[("files", ("candidate.smi", f"{smiles} candidate\n".encode(),
                                          "chemical/x-daylight-smiles"))])
    assert reply.status_code == 201, reply.text
    project = client.get(f"/api/v1/projects/{project['id']}").json()
    entry = project["entries"][0]
    inventory = candidates(client, project)
    endpoint = (f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-candidates/"
                f"{inventory['candidates'][0]['candidate_key']}/depiction")
    return project, endpoint, {"expected_artifact_id": entry["current_artifact_id"]}


def retained(client: ApiClient) -> tuple[Any, ...]:
    with client.app.state.session_factory() as session:
        artifacts = session.execute(select(Artifact.id, Artifact.sha256, Artifact.size).order_by(
            Artifact.id,
        )).all()
        cache = session.execute(select(LigandDepictionCache.cache_key).order_by(
            LigandDepictionCache.cache_key,
        )).all()
        bindings = session.execute(select(LigandDepictionBinding.request_key).order_by(
            LigandDepictionBinding.request_key,
        )).all()
    directory = client.app.state.settings.data_dir / "artifacts"
    files = {str(path.relative_to(directory)): hashlib.sha256(path.read_bytes()).hexdigest()
             for path in directory.rglob("*") if path.is_file()}
    return artifacts, cache, bindings, files, client.get("/api/v1/projects").json()


@pytest.mark.parametrize("bound", ["count", "aggregate", "single_svg"])
def test_depiction_capacity_refusal_publishes_no_artifact_file_binding_or_project_change(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, bound: str,
) -> None:
    import neistra_api.ligand_service as module

    first, first_url, first_parameters = source(client, "CCO")
    second, second_url, second_parameters = source(client, "CCN")
    admitted = client.get(first_url, params=first_parameters)
    assert admitted.status_code == 200 and admitted.json()["status"] == "ready"
    if bound == "count":
        monkeypatch.setattr(module, "MAX_CONTENT_CACHE", 1)
    elif bound == "aggregate":
        monkeypatch.setattr(module, "MAX_RETAINED_DEPICTION_BYTES", 1)
    else:
        monkeypatch.setattr(module, "MAX_DEPICTION_BYTES", 1)
    before = retained(client)
    refused = client.get(second_url, params=second_parameters)
    assert refused.status_code == 200, refused.text
    assert refused.json()["status"] == "unavailable"
    assert refused.json()["reason"] == (
        "depiction_output_too_large" if bound == "single_svg" else "depiction_cache_capacity"
    )
    assert retained(client) == before
    assert client.get(first_url, params=first_parameters).json() == admitted.json()
    # A source-binding miss for existing content is still usable at capacity.
    with client.app.state.session_factory() as session:
        session.execute(delete(LigandDepictionBinding))
        session.commit()
    assert client.get(first_url, params=first_parameters).json() == admitted.json()
    for project in (first, second):
        assert client.get(f"/api/v1/projects/{project['id']}").json() == project


def test_simultaneous_new_depictions_cannot_exceed_one_remaining_content_slot(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_service as module

    _, first_url, first_parameters = source(client, "CCO")
    _, second_url, second_parameters = source(client, "CCN")
    monkeypatch.setattr(module, "MAX_CONTENT_CACHE", 1)
    barrier = Barrier(2)
    real_draw = module.depict_qualified

    def synchronized_draw(*args: Any, **kwargs: Any) -> Any:
        result = real_draw(*args, **kwargs)
        barrier.wait(timeout=10)
        return result

    monkeypatch.setattr(module, "depict_qualified", synchronized_draw)
    before = retained(client)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(
            lambda item: client.get(item[0], params=item[1]),
            [(first_url, first_parameters), (second_url, second_parameters)],
        ))
    assert all(reply.status_code == 200 for reply in results)
    assert sorted(reply.json()["status"] for reply in results) == ["ready", "unavailable"]
    assert [reply.json()["reason"] for reply in results if reply.json()["status"] != "ready"] \
        == ["depiction_cache_capacity"]
    after = retained(client)
    assert len(after[0]) == len(before[0]) + 1
    assert len(after[1]) == len(after[2]) == 1
    assert len(after[3]) == len(before[3]) + 1
    assert after[4] == before[4]
