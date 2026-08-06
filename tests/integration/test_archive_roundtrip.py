from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Any, cast

import httpx
import pytest
from molweave_api.archive_service import APPLICATION_VERSION

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"


def create_project(client: ApiClient, name: str = "Portable study") -> dict[str, Any]:
    response = client.post(
        "/api/v1/projects",
        json={"name": name, "description": "Archive round-trip"},
    )
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


def upload(
    client: ApiClient,
    project_id: str,
    expected_revision: int,
    filenames: list[str],
) -> httpx.Response:
    return client.post(
        f"/api/v1/projects/{project_id}/imports",
        data={
            "expected_revision": expected_revision,
            "generate_3d": "true",
            "infer_bonds": "true",
        },
        files=[
            (
                "files",
                (
                    filename,
                    (FIXTURES / filename).read_bytes(),
                    "application/octet-stream",
                ),
            )
            for filename in filenames
        ],
    )


def build_rich_project(client: ApiClient) -> dict[str, Any]:
    project = create_project(client)
    project = upload(
        client,
        project["id"],
        project["revision"],
        ["protein_editing.pdb", "ethanol.mol"],
    ).json()["project"]
    protein = next(entry for entry in project["entries"] if entry["source_format"] == "pdb")
    ligand = next(entry for entry in project["entries"] if entry["source_format"] == "mol")
    project = client.post(
        f"/api/v1/projects/{project['id']}/groups",
        json={
            "expected_revision": project["revision"],
            "name": "Inputs",
            "entry_ids": [protein["id"], ligand["id"]],
        },
    ).json()
    project = client.post(
        f"/api/v1/projects/{project['id']}/entries/{protein['id']}/visibility",
        json={"expected_revision": project["revision"], "value": False},
    ).json()
    project = client.post(
        f"/api/v1/projects/{project['id']}/entries/{ligand['id']}/lock",
        json={"expected_revision": project["revision"], "value": True},
    ).json()
    selection = {
        "schema_version": 1,
        "atoms": [{"structure_id": ligand["id"], "atom_id": 1}],
        "granularity": "atom",
        "source": "inspector",
    }
    project = client.post(
        f"/api/v1/projects/{project['id']}/selections",
        json={
            "expected_revision": project["revision"],
            "name": "Ligand anchor",
            "selection": selection,
        },
    ).json()
    project = client.post(
        f"/api/v1/projects/{project['id']}/measurements",
        json={
            "expected_revision": project["revision"],
            "name": "Ligand span",
            "kind": "distance",
            "atom_references": [
                {"structure_id": ligand["id"], "atom_id": 1},
                {"structure_id": ligand["id"], "atom_id": 2},
            ],
        },
    ).json()
    project = client.post(
        f"/api/v1/projects/{project['id']}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "Archive view",
            "camera": {
                "mode": "orthographic",
                "position": [0, 0, 50],
                "target": [0, 0, 0],
                "up": [0, 1, 0],
                "radius": 20,
            },
            "selection": selection,
        },
    ).json()
    return cast(dict[str, Any], project)


def export_archive(client: ApiClient, project_id: str, operation_id: str) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/projects/{project_id}/archive",
        json={"operation_id": operation_id},
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def import_archive(client: ApiClient, data: bytes) -> dict[str, Any]:
    response = client.post(
        "/api/v1/projects/import-archive",
        data={"operation_id": "archive-import"},
        files={
            "file": (
                "portable-study.molweave.zip",
                data,
                "application/vnd.molweave.project+zip",
            )
        },
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def archive_manifest(data: bytes) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return cast(dict[str, Any], json.loads(archive.read("manifest.json")))


def with_application_version(data: bytes, version: str) -> bytes:
    source = zipfile.ZipFile(io.BytesIO(data))
    output = io.BytesIO()
    with source, zipfile.ZipFile(output, "w") as target:
        for info in source.infolist():
            payload = source.read(info)
            if info.filename == "manifest.json":
                manifest = json.loads(payload)
                manifest["application_version"] = version
                payload = (
                    json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
                    + b"\n"
                )
            target.writestr(info, payload)
    return output.getvalue()


@pytest.mark.parametrize("archive_version", ["0.1.0", "0.1.1", "0.2.0"])
def test_archive_round_trip_preserves_project_and_originals(
    client: ApiClient,
    archive_version: str,
) -> None:
    source = build_rich_project(client)
    first = export_archive(client, source["id"], "archive-first")
    second = export_archive(client, source["id"], "archive-second")
    assert first["manifest_schema_version"] == 1
    assert first["source_revision"] == source["revision"]
    assert first["artifact"]["filename"] == "Portable_study.molweave.zip"
    assert first["artifact"]["sha256"] == second["artifact"]["sha256"]
    first_bytes = client.get(first["artifact"]["download_url"]).content
    second_bytes = client.get(second["artifact"]["download_url"]).content
    assert first_bytes == second_bytes
    assert archive_manifest(first_bytes)["application_version"] == APPLICATION_VERSION

    legacy_bytes = with_application_version(first_bytes, archive_version)
    assert archive_manifest(legacy_bytes)["application_version"] == archive_version
    restored_result = import_archive(client, legacy_bytes)
    restored = restored_result["project"]
    assert restored_result["source_project_id"] == source["id"]
    assert restored_result["source_revision"] == source["revision"]
    assert restored["id"] != source["id"]
    assert restored["revision"] == restored["checkpoint_revision"] == 0
    assert restored["has_uncheckpointed_changes"] is False
    assert restored["history"]["retained_commands"] == 0
    assert restored["name"] == source["name"]
    assert restored["description"] == source["description"]

    source_by_name = {entry["name"]: entry for entry in source["entries"]}
    restored_by_name = {entry["name"]: entry for entry in restored["entries"]}
    assert set(restored_by_name) == set(source_by_name)
    assert all(
        restored_by_name[name]["id"] != source_by_name[name]["id"]
        for name in source_by_name
    )
    for name, source_entry in source_by_name.items():
        restored_entry = restored_by_name[name]
        for field in (
            "structure_type",
            "original_filename",
            "source_format",
            "atom_count",
            "atom_ids",
            "bond_count",
            "residue_count",
            "conformer_count",
            "warnings",
            "viewer_settings",
            "visible",
            "locked",
            "user_metadata",
        ):
            assert restored_entry[field] == source_entry[field]
        source_structure = client.get(
            f"/api/v1/projects/{source['id']}/entries/{source_entry['id']}/structure"
        ).json()["structure"]
        restored_structure = client.get(
            f"/api/v1/projects/{restored['id']}/entries/"
            f"{restored_entry['id']}/structure"
        ).json()["structure"]
        assert restored_structure == source_structure
        source_original = client.get(
            f"/api/v1/projects/{source['id']}/entries/{source_entry['id']}/original"
        ).content
        restored_original = client.get(
            f"/api/v1/projects/{restored['id']}/entries/"
            f"{restored_entry['id']}/original"
        ).content
        assert restored_original == source_original

    assert [group["name"] for group in restored["groups"]] == ["Inputs"]
    assert {entry["group_id"] for entry in restored["entries"]} == {
        restored["groups"][0]["id"]
    }
    restored_ligand = restored_by_name["Ethanol"]
    assert restored["saved_selections"][0]["atom_references"] == [
        {"structure_id": restored_ligand["id"], "atom_id": 1}
    ]
    assert restored["measurements"][0]["atom_references"] == [
        {"structure_id": restored_ligand["id"], "atom_id": 1},
        {"structure_id": restored_ligand["id"], "atom_id": 2},
    ]
    assert restored["scenes"][0]["selection"]["atoms"] == [
        {"structure_id": restored_ligand["id"], "atom_id": 1}
    ]
    assert {state["entry_id"] for state in restored["scenes"][0]["entry_states"]} == {
        entry["id"] for entry in restored["entries"]
    }

    second_restore = import_archive(client, legacy_bytes)["project"]
    assert second_restore["id"] not in {source["id"], restored["id"]}
    assert {
        entry["id"] for entry in second_restore["entries"]
    }.isdisjoint({entry["id"] for entry in restored["entries"]})


def test_cancelled_archive_export_does_not_publish(client: ApiClient) -> None:
    source = build_rich_project(client)
    cancelled = client.post("/api/v1/exports/cancel-archive/cancel")
    assert cancelled.status_code == 200

    response = client.post(
        f"/api/v1/projects/{source['id']}/archive",
        json={"operation_id": "cancel-archive"},
    )

    assert response.status_code == 499
    assert response.json()["detail"]["code"] == "export_cancelled"
