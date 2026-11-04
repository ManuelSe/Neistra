from __future__ import annotations

import pytest

from tests.integration.test_archive_roundtrip import archive_manifest, build_rich_project
from tests.support.api_client import ApiClient


def test_both_names_share_exact_archive_content_and_preserve_source(client: ApiClient) -> None:
    project = build_rich_project(client)
    path = f"/api/v1/projects/{project['id']}"
    before = client.get(path).json()
    exports = []
    for style in [None, "legacy", "neistra"]:
        payload = {"operation_id": f"name-{style}"}
        if style is not None:
            payload["filename_style"] = style
        response = client.post(f"{path}/archive", json=payload)
        assert response.status_code == 201, response.text
        artifact = response.json()["artifact"]
        suffix = ".neistra.zip" if style == "neistra" else ".molweave.zip"
        assert artifact["filename"].endswith(suffix)
        assert artifact["media_type"] == "application/vnd.molweave.project+zip"
        exports.append(client.get(artifact["download_url"]).content)
    assert exports[0] == exports[1] == exports[2]
    assert archive_manifest(exports[2])["schema_version"] == 2
    assert client.get(path).json() == before
    for filename in [
        "current.neistra.zip",
        "legacy.molweave.zip",
        "CURRENT.NEISTRA.ZIP",
        "LEGACY.MOLWEAVE.ZIP",
    ]:
        response = client.post(
            "/api/v1/projects/import-archive",
            files={
                "file": (filename, exports[2], "application/zip"),
            },
        )
        assert response.status_code == 201, response.text
        restored = response.json()["project"]
        assert restored["name"] == project["name"]
        assert len(restored["entries"]) == len(project["entries"])
        assert len(restored["saved_selections"]) == len(project["saved_selections"])


@pytest.mark.parametrize("style", ["../outside", "unknown", "", None])
def test_invalid_explicit_filename_style_rejected(client: ApiClient, style: object) -> None:
    project = client.post("/api/v1/projects", json={"name": "Unchanged"}).json()
    path = f"/api/v1/projects/{project['id']}"
    before = client.get(path).json()
    response = client.post(
        f"{path}/archive", json={"operation_id": "invalid", "filename_style": style}
    )
    assert response.status_code == 422
    assert client.get(path).json() == before


def test_new_suffix_keeps_archive_safety_validation(client: ApiClient) -> None:
    response = client.post(
        "/api/v1/projects/import-archive",
        files={
            "file": ("invalid.neistra.zip", b"not a ZIP", "application/zip"),
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] != "unsupported_project_archive_extension"


def test_api_metadata_uses_current_product_name(client: ApiClient) -> None:
    response = client.get("/api/v1/openapi.json")
    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Neistra API"
