from __future__ import annotations

import argparse
import gzip
import io
import json
import runpy
import sqlite3
import stat
import subprocess
import zipfile
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "docs/assets/interaction-inspection/release-evidence.py.txt"


@pytest.fixture(scope="module")
def tools() -> dict[str, Any]:
    return runpy.run_path(str(SCRIPT))


def zipped(items: dict[str, bytes], manifest: Any = None) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in items.items():
            archive.writestr(name, content)
        if manifest is not None:
            archive.writestr("manifest.json", json.dumps(manifest))
    return output.getvalue()


@pytest.mark.parametrize("variant", ["flat-sha", "flat-size", "files-map", "project", "files-list"])
def test_verifies_supported_manifest_variants(tools: dict[str, Any], variant: str) -> None:
    data = b"preserved molecular specimen\n"
    sha = tools["sha"](data)
    row = {"path": "specimen.json", "size": len(data), "sha256": sha}
    manifests = {
        "flat-sha": {"specimen.json": sha},
        "flat-size": {"specimen.json": {"bytes": len(data), "sha256": sha}},
        "files-map": {"version": "0.33.0", "files": {"specimen.json": row}},
        "project": {"schema_version": 2, "files": [row]},
        "files-list": {"version": "0.33.0", "files": [row]},
    }
    result = tools["verify_layers"](zipped({"specimen.json": data}, manifests[variant]), variant)
    assert result == {
        "zip_archives": 1,
        "evidence_manifest_entries": 0 if variant == "project" else 1,
        "project_archive_files": 1 if variant == "project" else 0,
    }


def test_recursively_verifies_gzip_logs_and_nested_portable_archives(tools: dict[str, Any]) -> None:
    data = b"original artifact"
    project = zipped(
        {"original.mol": data},
        {
            "schema_version": 2,
            "files": [{"path": "original.mol", "size": len(data), "sha256": tools["sha"](data)}],
        },
    )
    inner = gzip.compress(project, mtime=0)
    outer = zipped({"specimen.zip.gz": inner}, {"specimen.zip.gz": tools["sha"](inner)})
    assert tools["verify_layers"](outer, "outer.zip") == {
        "zip_archives": 2,
        "evidence_manifest_entries": 1,
        "project_archive_files": 1,
    }


@pytest.mark.parametrize("variant", ["changed", "missing", "unexpected", "wrong-size", "bad-hash"])
def test_rejects_corrupted_or_incomplete_manifests(tools: dict[str, Any], variant: str) -> None:
    data = b"original"
    entries = {"specimen": data}
    expected = {"bytes": len(data), "sha256": tools["sha"](data)}
    manifest = {"specimen": expected}
    if variant == "changed":
        entries["specimen"] = b"modified"
    elif variant == "missing":
        entries = {}
    elif variant == "unexpected":
        entries["unlisted"] = b"extra"
    elif variant == "wrong-size":
        expected["bytes"] += 1
    else:
        expected["sha256"] = "0" * 64
    with pytest.raises(AssertionError):
        tools["verify_layers"](zipped(entries, manifest), variant)


@pytest.mark.parametrize("name", ["../escape", "/absolute", "a/../escape", "a\\escape", "./alias"])
def test_rejects_unsafe_archive_paths(tools: dict[str, Any], name: str) -> None:
    with pytest.raises(AssertionError):
        tools["verify_layers"](zipped({name: b"payload"}), "unsafe.zip")


def test_rejects_duplicate_archive_members(tools: dict[str, Any]) -> None:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("duplicate", b"first")
        with pytest.warns(UserWarning, match="Duplicate name"):
            archive.writestr("duplicate", b"second")
    with pytest.raises(AssertionError):
        tools["verify_layers"](output.getvalue(), "duplicate.zip")


def test_rejects_symlink_members_even_without_extracting(tools: dict[str, Any]) -> None:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        info = zipfile.ZipInfo("linked-resource")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, "../outside")
    with pytest.raises(AssertionError):
        tools["verify_layers"](output.getvalue(), "linked.zip")


def test_archive_bytes_are_deterministic_and_existing_outputs_are_immutable(
    tools: dict[str, Any], tmp_path: Path
) -> None:
    first, second = tmp_path / "first.zip", tmp_path / "second.zip"
    items = {"b.txt": b"second", "a.txt": b"first"}
    first_receipt = tools["archive"](items, first)
    tools["archive"](dict(reversed(list(items.items()))), second)
    assert first.read_bytes() == second.read_bytes()
    assert first_receipt["sha256"] == tools["sha"](first.read_bytes())
    assert first_receipt["bytes"] == len(first.read_bytes())
    with zipfile.ZipFile(first) as archive:
        assert archive.namelist() == ["a.txt", "b.txt", "manifest.json"]
        assert all(item.date_time == (1980, 1, 1, 0, 0, 0) for item in archive.infolist())
        assert archive.testzip() is None
    original = first.read_bytes()
    with pytest.raises(AssertionError):
        tools["archive"]({"replacement": b"changed"}, first)
    assert first.read_bytes() == original
    partial_target = tmp_path / "partial.zip"
    partial = tmp_path / "partial.zip.part"
    partial.write_bytes(b"retained failed attempt")
    with pytest.raises(AssertionError):
        tools["archive"](items, partial_target)
    assert partial.read_bytes() == b"retained failed attempt"
    assert not partial_target.exists()


def test_reader_workspace_retains_live_history_stores_and_artifacts_only_excludes_caches(
    tools: dict[str, Any], tmp_path: Path
) -> None:
    work = tmp_path / "editing-readers"
    store = work / "previous-retained"
    store.mkdir(parents=True)
    database = store / "neistra.db"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE history (entry TEXT, command TEXT)")
        connection.execute("INSERT INTO history VALUES ('ligand', 'retained edit')")
    artifact = store / "artifacts/original.mol"
    artifact.parent.mkdir()
    artifact.write_bytes(b"immutable original")
    cache = work / "bytecode-cache/module.pyc"
    cache.parent.mkdir()
    cache.write_bytes(b"cache only")
    items: dict[str, Any] = {}
    count, excluded = tools["add_reader_workspace"](items, work)
    assert count == 2 and excluded == ["bytecode-cache/module.pyc"]
    assert set(items) == {
        "editing-workspace/previous-retained/neistra.db",
        "editing-workspace/previous-retained/artifacts/original.mol",
    }
    output = tmp_path / "retained.zip"
    tools["archive"](items, output)
    with zipfile.ZipFile(output) as archive:
        assert (
            archive.read("editing-workspace/previous-retained/neistra.db") == database.read_bytes()
        )
        assert (
            archive.read("editing-workspace/previous-retained/artifacts/original.mol")
            == b"immutable original"
        )
    with pytest.raises(AssertionError):
        tools["add"]({}, "unscoped.db", database)


def test_rejects_symlinked_evidence_sources(tools: dict[str, Any], tmp_path: Path) -> None:
    original = tmp_path / "original.txt"
    original.write_text("outside source")
    directory = tmp_path / "evidence"
    directory.mkdir()
    link = directory / "linked.txt"
    link.symlink_to(original)
    with pytest.raises(AssertionError):
        tools["add_tree"]({}, "evidence", directory)
    with pytest.raises(AssertionError):
        tools["archive"]({"linked.txt": link}, tmp_path / "unsafe.zip")
    assert not (tmp_path / "unsafe.zip").exists()


def source_snapshot(tools: dict[str, Any], tmp_path: Path) -> tuple[Path, dict[str, Any]]:
    """Small source-set fixture only; never a simulated completed release gate."""
    source = tmp_path / "source"
    source.mkdir()
    subprocess.run(
        ["git", "init", "--quiet", str(source)],
        check=True,
        capture_output=True,
    )
    destination = source / "docs/assets/interaction-inspection"
    destination.mkdir(parents=True)
    for name in tools["TOOL_NAMES"]:
        (destination / name).write_bytes(
            (ROOT / "docs/assets/interaction-inspection" / name).read_bytes()
        )
    application = source / "apps/qualified.py"
    application.parent.mkdir()
    application.write_text("value = 1\n")
    helpers = runpy.run_path(str(destination / "qualification.py.txt"))
    snapshot = helpers["current_identities"](source)
    return source, {"source_before": snapshot, "source_after": snapshot.copy()}


@pytest.mark.parametrize("extra", ["apps/unqualified.py", "tests/unqualified.py", "package.json"])
def test_packaging_source_guard_rejects_added_qualifying_inputs_before_output(
    tools: dict[str, Any], tmp_path: Path, extra: str
) -> None:
    source, snapshot = source_snapshot(tools, tmp_path)
    added = source / extra
    added.parent.mkdir(parents=True, exist_ok=True)
    added.write_text("unqualified input\n")
    output = tmp_path / "unpublished-evidence.zip"
    with pytest.raises(AssertionError, match="source inventory"):
        tools["check_source"](source, snapshot)
        tools["archive"]({"unreachable": b"must not publish"}, output)
    assert not output.exists() and not output.with_name(output.name + ".part").exists()


def test_source_inventory_uses_explicit_root_and_allows_generated_document_evidence(
    tools: dict[str, Any], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source, snapshot = source_snapshot(tools, tmp_path)
    document = source / "docs/assets/interaction-inspection/unit-summary.json"
    document.write_text('{"scope": "source-guard unit observation only"}\n')
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.chdir(outside)
    tools["check_source"](source, snapshot)


@pytest.mark.parametrize("change", ["edit", "known-symlink", "new-dangling-symlink"])
def test_source_guard_rejects_edited_or_symlinked_source(
    tools: dict[str, Any], tmp_path: Path, change: str
) -> None:
    source, snapshot = source_snapshot(tools, tmp_path)
    path = source / "apps/qualified.py"
    if change == "edit":
        path.write_text("value = 2\n")
    elif change == "known-symlink":
        same_bytes = source / "docs/same-bytes.txt"
        same_bytes.write_bytes(path.read_bytes())
        path.unlink()
        path.symlink_to(same_bytes)
    else:
        (source / "apps/unqualified.py").symlink_to(source / "missing.py")
    with pytest.raises(AssertionError):
        tools["check_source"](source, snapshot)


@pytest.mark.parametrize(
    "filename",
    [
        "c1-native-observations.zip",
        "c1-corrected-native-observations.zip",
        "c2-checkpoint-native.zip",
        "c2-workflow-attempts.zip",
        "c2-initial-diagnostic-native.zip",
        "c3-native.zip",
        "c3-performance.zip",
    ],
)
def test_verifies_actual_checkpoint_archives(tools: dict[str, Any], filename: str) -> None:
    result = tools["verify_layers"](
        ROOT / "docs/assets/interaction-inspection" / filename, filename
    )
    assert result["zip_archives"] >= 1
    if filename.startswith(("c2-", "c3-")) and filename != "c2-initial-diagnostic-native.zip":
        assert result["evidence_manifest_entries"] > 0


def test_local_verification_rejects_replaced_package(tools: dict[str, Any], tmp_path: Path) -> None:
    output = tmp_path / "asset.zip"
    record = tools["archive"]({"payload": b"original"}, output)
    receipt = tmp_path / "package.json"
    receipt.write_bytes(tools["encoded"]({"kind": "release asset", "archive": record}))
    tools["verify_local"](argparse.Namespace(archive=output, receipt=receipt))
    output.write_bytes(zipped({"payload": b"replacement"}))
    with pytest.raises(AssertionError):
        tools["verify_local"](argparse.Namespace(archive=output, receipt=receipt))


def test_anonymous_readback_checks_exact_asset_and_refuses_overwrite(
    tools: dict[str, Any], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "asset.zip"
    record = tools["archive"]({"payload": b"released evidence"}, source)
    receipt = tmp_path / "package.json"
    receipt.write_bytes(
        tools["encoded"](
            {
                "kind": "release asset",
                "version": "0.33.0",
                "archive": record,
                "qualified_master": "a" * 40,
                "all_archive_hashes_and_crc_verified": True,
            }
        )
    )
    requests = []

    class Response(io.BytesIO):
        status = 200

    def response(request: Any, *, timeout: int) -> Response:
        requests.append(request)
        assert timeout == 60 and not request.has_header("Authorization")
        return Response(source.read_bytes())

    monkeypatch.setattr(tools["urllib"].request, "urlopen", response)
    output = tmp_path / "download/asset.zip"
    args = argparse.Namespace(
        receipt=receipt,
        output=output,
        url="https://github.com/ManuelSe/Neistra/releases/download/v0.33.0/asset.zip",
    )
    tools["download_public"](args)
    assert len(requests) == 1 and output.read_bytes() == source.read_bytes()
    proof = json.loads(output.with_name("asset.zip.verification.json").read_bytes())
    assert proof["anonymous_request_without_authorization_header"] is True
    assert proof["matches_local_release_asset"] is True
    with pytest.raises(AssertionError):
        tools["download_public"](args)
    assert len(requests) == 1
