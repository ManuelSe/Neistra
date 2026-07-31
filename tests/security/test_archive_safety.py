from __future__ import annotations

import io
import json
import stat
import warnings
import zipfile
from dataclasses import replace
from pathlib import Path
from typing import Any, cast

import pytest
from molweave_api.archive_service import (
    ArchiveLimits,
    ArchiveValidationError,
    read_project_archive,
)

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"
LIMITS = ArchiveLimits(
    max_archive_bytes=10 * 1024 * 1024,
    max_uncompressed_bytes=20 * 1024 * 1024,
    max_members=100,
    max_compression_ratio=100,
)


def valid_archive(client: ApiClient) -> bytes:
    project = client.post("/api/v1/projects", json={"name": "Safety"}).json()
    imported = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0},
        files={
            "files": (
                "ethanol.mol",
                (FIXTURES / "ethanol.mol").read_bytes(),
                "chemical/x-mdl-molfile",
            )
        },
    ).json()
    exported = client.post(
        f"/api/v1/projects/{project['id']}/archive",
        json={"operation_id": "security-source"},
    )
    assert exported.status_code == 201
    assert imported["project"]["entries"]
    return client.get(exported.json()["artifact"]["download_url"]).content


def members(data: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return {info.filename: archive.read(info) for info in archive.infolist()}


def write_zip(
    payloads: list[tuple[str, bytes]],
    *,
    compression: int = zipfile.ZIP_STORED,
    symlink: str | None = None,
) -> bytes:
    output = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        with zipfile.ZipFile(output, "w", compression=compression) as archive:
            for name, payload in payloads:
                info = zipfile.ZipInfo(name)
                info.compress_type = compression
                if name == symlink:
                    info.create_system = 3
                    info.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(info, payload)
    return output.getvalue()


def mutate_manifest(data: bytes, update: Any) -> bytes:
    payloads = members(data)
    manifest = json.loads(payloads["manifest.json"])
    update(manifest)
    payloads["manifest.json"] = (
        json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode() + b"\n"
    )
    return write_zip(sorted(payloads.items()))


@pytest.mark.parametrize(
    "unsafe_path",
    [
        "../escape",
        "/absolute",
        "C:/windows",
        "artifacts\\backslash",
        "artifacts//empty",
        "artifacts/./dot",
    ],
)
def test_rejects_unsafe_member_paths(client: ApiClient, unsafe_path: str) -> None:
    payloads = list(members(valid_archive(client)).items())
    payloads.append((unsafe_path, b"bad"))

    with pytest.raises(ArchiveValidationError) as raised:
        read_project_archive(write_zip(payloads), LIMITS)

    assert raised.value.code == "unsafe_archive_path"


def test_rejects_symlinks_and_duplicate_paths(client: ApiClient) -> None:
    payloads = list(members(valid_archive(client)).items())
    with pytest.raises(ArchiveValidationError) as symlink_error:
        read_project_archive(
            write_zip(payloads, symlink=payloads[0][0]),
            LIMITS,
        )
    assert symlink_error.value.code == "archive_symlink_rejected"

    duplicated = [*payloads, payloads[0]]
    with pytest.raises(ArchiveValidationError) as duplicate_error:
        read_project_archive(write_zip(duplicated), LIMITS)
    assert duplicate_error.value.code == "duplicate_archive_path"


def test_rejects_decompression_ratio_and_size_limits(client: ApiClient) -> None:
    payloads = list(members(valid_archive(client)).items())
    payloads.append(("bomb", b"A" * 1_000_000))
    with pytest.raises(ArchiveValidationError) as bomb_error:
        read_project_archive(
            write_zip(payloads, compression=zipfile.ZIP_DEFLATED),
            LIMITS,
        )
    assert bomb_error.value.code == "archive_compression_ratio_exceeded"

    with pytest.raises(ArchiveValidationError) as size_error:
        read_project_archive(
            valid_archive(client),
            replace(LIMITS, max_uncompressed_bytes=10),
        )
    assert size_error.value.code == "archive_uncompressed_limit_exceeded"
    assert size_error.value.status_code == 413


def test_rejects_unsupported_schema_hash_and_member_mismatch(
    client: ApiClient,
) -> None:
    source = valid_archive(client)
    unsupported = mutate_manifest(
        source,
        lambda manifest: manifest.__setitem__("schema_version", 999),
    )
    with pytest.raises(ArchiveValidationError) as schema_error:
        read_project_archive(unsupported, LIMITS)
    assert schema_error.value.code == "unsupported_archive_schema"

    corrupted_payloads = members(source)
    artifact_path = next(path for path in corrupted_payloads if path != "manifest.json")
    corrupted_payloads[artifact_path] += b"tampered"
    with pytest.raises(ArchiveValidationError) as hash_error:
        read_project_archive(write_zip(sorted(corrupted_payloads.items())), LIMITS)
    assert hash_error.value.code in {"archive_hash_mismatch", "archive_size_mismatch"}

    missing_payloads = members(source)
    missing_payloads.pop(artifact_path)
    with pytest.raises(ArchiveValidationError) as missing_error:
        read_project_archive(write_zip(sorted(missing_payloads.items())), LIMITS)
    assert missing_error.value.code == "archive_member_mismatch"


def test_api_rejects_invalid_archive_without_creating_project(client: ApiClient) -> None:
    source = valid_archive(client)
    corrupted = mutate_manifest(
        source,
        lambda manifest: manifest["entries"][0].__setitem__("atom_count", 99),
    )
    before = cast(list[dict[str, Any]], client.get("/api/v1/projects").json())

    response = client.post(
        "/api/v1/projects/import-archive",
        data={"operation_id": "invalid-archive"},
        files={
            "file": (
                "invalid.molweave.zip",
                corrupted,
                "application/vnd.molweave.project+zip",
            )
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_archive_manifest"
    after = cast(list[dict[str, Any]], client.get("/api/v1/projects").json())
    assert [item["id"] for item in after] == [item["id"] for item in before]


def test_rejects_invalid_zip_and_extension(client: ApiClient) -> None:
    with pytest.raises(ArchiveValidationError) as invalid:
        read_project_archive(b"not a zip", LIMITS)
    assert invalid.value.code == "invalid_project_archive"

    response = client.post(
        "/api/v1/projects/import-archive",
        files={"file": ("project.zip", valid_archive(client), "application/zip")},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unsupported_project_archive_extension"
