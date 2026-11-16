from __future__ import annotations

import hashlib
import json
from typing import Any

import pytest
from neistra_api.import_export import ImportExportService, UploadPayload
from neistra_api.models import LigandDepictionBinding
from rdkit import Chem, rdBase

from tests.integration.test_ligand_depiction_bounds import retained, source
from tests.integration.test_ligand_designation import candidates
from tests.support.api_client import ApiClient


def query_source(client: ApiClient, pattern: str) -> tuple[dict[str, Any], bytes]:
    if pattern == "*C":
        original = b"*C placeholder\n"
        filename, media = "placeholder.smi", "chemical/x-daylight-smiles"
    else:
        original = Chem.MolToMolBlock(Chem.MolFromSmarts(pattern), forceV3000=True).encode()
        filename, media = "query.mol", "chemical/x-mdl-molfile"
    project = client.post("/api/v1/projects", json={"name": "Query qualification"}).json()
    with client.app.state.session_factory() as session:
        service = ImportExportService(session, client.app.state.settings)
        prepared = service.prepare([UploadPayload(filename, original, media)], generate_3d=False)
        service.commit_import(project["id"], project["revision"], prepared)
    return client.get(f"/api/v1/projects/{project['id']}").json(), original


@pytest.mark.parametrize("pattern", ["*C", "[C;H3]", "C-,=C", "C~C"])
def test_query_import_exposes_selection_without_guessed_formula_mass_or_depiction(
    client: ApiClient, pattern: str,
) -> None:
    project, original = query_source(client, pattern)
    entry = project["entries"][0]
    base = f"/api/v1/projects/{project['id']}/entries/{entry['id']}"
    before = client.get(base + "/structure").content
    page = candidates(client, project)
    candidate = page["candidates"][0]
    assert candidate["candidate_key"] in page["selectable_candidate_keys"]
    assert entry["ligand_designation"]["status"] == "resolved"
    assert candidate["chemistry_status"] == "unavailable"
    assert candidate["chemistry_reason"] == "query_or_dummy_representation_unsupported"
    for field in ("formula", "molecular_weight", "formal_charge", "chemical_input_hash"):
        assert candidate[field] is None
    drawing = client.get(
        base + f"/ligand-candidates/{candidate['candidate_key']}/depiction",
        params={"expected_artifact_id": entry["current_artifact_id"]},
    )
    assert drawing.status_code == 200, drawing.text
    data = drawing.json()
    assert data["status"] == "unavailable"
    assert data["reason"] == "query_or_dummy_representation_unsupported"
    empty_fields = ("artifact", "formula", "molecular_weight", "formal_charge")
    assert all(data[field] is None for field in empty_fields)
    assert client.get(base + "/original").content == original
    assert client.get(base + "/structure").content == before
    assert client.get(f"/api/v1/projects/{project['id']}").json() == project


def test_previous_policy_binding_cannot_bypass_query_requalification(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_service as module

    _, valid_url, valid_parameters = source(client, "CCO")
    valid = client.get(valid_url, params=valid_parameters)
    assert valid.status_code == 200 and valid.json()["status"] == "ready"
    project, _ = query_source(client, "*C")
    entry = project["entries"][0]
    candidate = candidates(client, project)["candidates"][0]
    # A deliberately misleading retained row under prior policy stamps must
    # not qualify a current request, regardless of its cached drawing bytes.
    old_request_key = hashlib.sha256(json.dumps([
        entry["current_artifact_id"], entry["original_artifact_id"], candidate["candidate_key"],
        "ligand-instance-v1", "ligand-exact-representation-v1", module.DEPICTION_POLICY,
        rdBase.rdkitVersion, 240, 180,
    ], separators=(",", ":")).encode()).hexdigest()
    with client.app.state.session_factory() as session:
        session.add(LigandDepictionBinding(
            request_key=old_request_key, cache_key=valid.json()["cache_key"],
            summary={"formula": "CH3*", "molecular_weight": 15.035, "formal_charge": 0,
                     "provenance": "prior_policy_negative_control"},
        ))
        session.commit()
    calls = 0
    prepare = module.prepare_chemistry

    def checked_prepare(*args: Any, **kwargs: Any) -> Any:
        nonlocal calls
        calls += 1
        return prepare(*args, **kwargs)

    monkeypatch.setattr(module, "prepare_chemistry", checked_prepare)
    before = retained(client)
    endpoint = (f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-candidates/"
                f"{candidate['candidate_key']}/depiction")
    reply = client.get(endpoint, params={"expected_artifact_id": entry["current_artifact_id"]})
    assert reply.status_code == 200, reply.text
    assert reply.json()["status"] == "unavailable"
    assert reply.json()["reason"] == "query_or_dummy_representation_unsupported"
    assert calls > 0
    assert retained(client) == before
    with client.app.state.session_factory() as session:
        assert session.get(LigandDepictionBinding, old_request_key) is not None
