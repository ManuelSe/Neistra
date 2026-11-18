from __future__ import annotations

import io
import json
import zipfile
from collections.abc import Callable
from typing import Any

import pytest
from neistra_core.ligands.models import LigandDesignationV1

from tests.integration.test_archive_roundtrip import (
    archive_manifest,
    export_archive,
    import_archive,
)
from tests.integration.test_ligand_designation import candidates, clear, imported
from tests.support.api_client import ApiClient


def rewritten(data: bytes, change: Callable[[dict[str, Any]], None]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(output, "w") as target:
        for info in source.infolist():
            payload = source.read(info)
            if info.filename == "manifest.json":
                manifest = json.loads(payload)
                change(manifest)
                payload = json.dumps(manifest).encode()
            target.writestr(info, payload)
    return output.getvalue()


def exported(client: ApiClient, project: dict[str, Any]) -> bytes:
    reply = export_archive(client, project["id"], "ligand-archive")
    assert reply["manifest_schema_version"] == 3
    return client.get(reply["artifact"]["download_url"]).content


@pytest.mark.parametrize("intent", ["automatic", "manual", "cleared", "unresolved", "stale"])
def test_archive_retains_exact_intent_and_remaps_entry_artifact_and_instance_ownership(
    client: ApiClient, intent: str,
) -> None:
    from neistra_api.models import StructureEntry

    project = imported(client)
    entry = project["entries"][0]
    if intent == "manual":
        inventory = candidates(client, project)
        reply = client.request(
            "PUT", f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-designation",
            json={"expected_revision": project["revision"],
                  "expected_artifact_id": entry["current_artifact_id"],
                  "candidate_key": inventory["candidates"][0]["candidate_key"],
                  "expected_input_hash": inventory["input_hash"]},
        )
        assert reply.status_code == 200, reply.text
    elif intent == "cleared":
        clear(client, project)
    elif intent in {"unresolved", "stale"}:
        # Retained historical intent is meaningful even when old anchors are gone.
        with client.app.state.session_factory() as session:
            owner = session.get(StructureEntry, entry["id"])
            assert owner is not None
            designation = LigandDesignationV1.model_validate(owner.ligand_designation)
            owner.ligand_designation = (
                LigandDesignationV1().model_dump(mode="json") if intent == "unresolved" else
                designation.model_copy(update={
                    "status": "stale", "atom_ids": [999999], "reason_code": "lost_anchors",
                }).model_dump(mode="json")
            )
            session.commit()
    project = client.get(f"/api/v1/projects/{project['id']}").json()
    before = project["entries"][0]["ligand_designation"]
    archive = exported(client, project)
    manifest = archive_manifest(archive)
    assert manifest["schema_version"] == 3
    archived_entry = manifest["entries"][0]
    assert archived_entry["ligand_designation"] == before
    assert archived_entry["designation_source_file"] == (
        archived_entry["current_file"] if before["source_artifact_id"] else None
    )
    restored = import_archive(client, archive)["project"]
    copied = restored["entries"][0]
    actual = copied["ligand_designation"]
    assert restored["id"] != project["id"] and copied["id"] != entry["id"]
    expected = {**before, "source_artifact_id": copied["current_artifact_id"]
                if before["source_artifact_id"] else None}
    if before["instance_id"]:
        assert actual["instance_id"] != before["instance_id"]
        expected["instance_id"] = actual["instance_id"]
    assert actual == expected
    for suffix in ("original", "structure"):
        old_url = f"/api/v1/projects/{project['id']}/entries/{entry['id']}/{suffix}"
        new_url = f"/api/v1/projects/{restored['id']}/entries/{copied['id']}/{suffix}"
        if suffix == "original":
            assert client.get(old_url).content == client.get(new_url).content
        else:
            assert client.get(old_url).json()["structure"] == (
                client.get(new_url).json()["structure"]
            )


def test_v2_manifest_is_validated_before_unresolved_default_is_added(client: ApiClient) -> None:
    project = imported(client)
    data = exported(client, project)

    def v2(manifest: dict[str, Any]) -> None:
        manifest["schema_version"] = 2
        for entry in manifest["entries"]:
            del entry["ligand_designation"]
            del entry["designation_source_file"]

    legacy = rewritten(data, v2)
    restored = import_archive(client, legacy)["project"]
    designation = restored["entries"][0]["ligand_designation"]
    assert designation == LigandDesignationV1().model_dump(mode="json")

    def unknown(manifest: dict[str, Any]) -> None:
        manifest["entries"][0]["unknown_retained_state"] = {"intent": "must not disappear"}

    malformed = client.post("/api/v1/projects/import-archive", data={"operation_id": "invalid-v2"},
                            files={"file": ("legacy.neistra.zip", rewritten(legacy, unknown),
                                            "application/vnd.neistra.project+zip")})
    assert malformed.status_code == 422, malformed.text


@pytest.mark.parametrize("corruption", ["missing_source", "other_source", "partial_instance"])
def test_archive_refuses_invalid_designation_before_project_publication(
    client: ApiClient, corruption: str,
) -> None:
    project = imported(client)
    data = exported(client, project)
    before = client.get("/api/v1/projects").json()

    def corrupt(manifest: dict[str, Any]) -> None:
        entry = manifest["entries"][0]
        if corruption == "missing_source":
            entry["designation_source_file"] = None
        elif corruption == "other_source":
            entry["designation_source_file"] = entry["original_file"]
        else:
            entry["ligand_designation"]["atom_ids"] = [entry["atom_ids"][0]]

    reply = client.post("/api/v1/projects/import-archive", data={"operation_id": "invalid-ligand"},
                        files={"file": ("invalid.neistra.zip", rewritten(data, corrupt),
                                        "application/vnd.neistra.project+zip")})
    assert reply.status_code == 422, reply.text
    assert client.get("/api/v1/projects").json() == before
