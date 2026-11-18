"""Offline command-contract controls, without Git mutations or qualification runs."""

from __future__ import annotations

import ast
import json
import runpy
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "docs/assets/ligand-properties"


@pytest.fixture
def recipe(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    root, old = tmp_path / "source", tmp_path / "actual-predecessor"
    root.mkdir()
    old.mkdir()
    (root / "docs/assets/ligand-properties").mkdir(parents=True)
    receipt = tmp_path / "preceding-receipt.json"
    receipt.write_text("{}\n")
    label = f"recipe-unit-{uuid4().hex}"
    workspace = Path("/tmp") / f"neistra159-{label}"
    assert not workspace.exists()
    monkeypatch.chdir(root)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "recipe",
            label,
            "--current-version",
            "0.37.0",
            "--previous-tag",
            "v0.36.0",
            "--previous-root",
            str(old),
            "--previous-receipt",
            str(receipt),
        ],
    )
    import subprocess

    def git_read(command: list[str], **kwargs: Any) -> str:
        assert command[0] == "git"
        if command[1] == "rev-parse":
            return "a" * 40 + "\n"
        assert command[1:] == ["cat-file", "-t", "v0.36.0"]
        return "tag\n"

    monkeypatch.setattr(subprocess, "check_output", git_read)
    runpy.run_path(str(ASSETS / "release-recipe.py.txt"), run_name="__main__")
    try:
        yield json.loads((root / f"docs/assets/ligand-properties/{label}-recipe.json").read_bytes())
    finally:
        # This contains no stores: generator-only offline unit fixture.
        workspace.rmdir()


def flag(command: list[str], key: str) -> str:
    return command[command.index(key) + 1]


def test_recipe_keeps_full43_independent_responsibilities(recipe: dict[str, Any]) -> None:
    steps = recipe["steps"]
    assert len(steps) == 43 and len({step["label"] for step in steps}) == 43
    assert recipe["compatibility_protocol"] == "private-derived-shared-schema-v1"
    assert recipe["require_clean"]
    for label in (
        "uv",
        "pnpm",
        "migration",
        "downgrade",
        "remigration",
        "ruff",
        "mypy",
        "reader-tool-types",
        "python",
        "lint",
        "types",
        "web",
        "supervisor",
        "build",
        "browser-inventory",
        "browser",
        "versions",
        "production",
        "legacy-cli",
        "editing-readers",
        "property-readers",
        "diff",
    ):
        assert any(step["label"] == label for step in steps)


@pytest.mark.parametrize("family", ["rich", "connectivity", "measurements"])
def test_every_existing_family_has_explicit_positive_compatibility(
    recipe: dict[str, Any],
    family: str,
) -> None:
    selected = {
        step["label"]: step for step in recipe["steps"] if step["label"].startswith(family + "-")
    }
    assert set(selected) == {
        f"{family}-{suffix}"
        for suffix in (
            "current-migration",
            "current-produce",
            "previous-migration-and-copy",
            "previous-read-current",
            "previous-produce",
            "current-read-previous",
            "current-reopen",
        )
    }
    old_read = selected[f"{family}-previous-read-current"]
    assert old_read["command"][3] == "read"
    assert flag(old_read["command"], "--expected-version") == "0.36.0"
    assert "previous-read-current" in flag(old_read["command"], "--data-dir")
    assert "--schema-boundary" not in old_read["command"]
    assert "refuse" not in old_read["command"]
    migrated = selected[f"{family}-current-read-previous"]["command"]
    assert migrated[1] == "-c" and "alembic" in migrated[2]
    assert flag(migrated, "--expected-version") == "0.37.0"
    copy = selected[f"{family}-previous-migration-and-copy"]["command"]
    assert "closed_copy" in copy[2] and copy[-1].endswith(
        "ligand_properties_reader_qualification.py"
    )


@pytest.mark.parametrize(
    "label, mode", [("editing-readers", "editing-run"), ("property-readers", "run")]
)
def test_actor_coordinators_require_actual_tag_and_extracted_source_receipt(
    recipe: dict[str, Any],
    label: str,
    mode: str,
) -> None:
    command = next(step["command"] for step in recipe["steps"] if step["label"] == label)
    assert command[2].endswith("ligand_properties_reader_qualification.py") and command[3] == mode
    assert flag(command, "--previous-tag") == "v0.36.0"
    assert flag(command, "--previous-commit") == "a" * 40
    assert flag(command, "--previous-receipt").endswith("preceding-receipt.json")
    assert "--diagnostic" not in command and "--schema-boundary" not in command


def test_pytest_has_no_shared_database_and_native_keeps_no_retry_relaxation(
    recipe: dict[str, Any],
) -> None:
    python = next(step for step in recipe["steps"] if step["label"] == "python")
    assert "environment" not in python
    assert set(recipe["unset_environment"]) == {
        "NEISTRA_DATA_DIR",
        "NEISTRA_DATABASE_URL",
        "MOLWEAVE_DATA_DIR",
        "MOLWEAVE_DATABASE_URL",
        "DATABASE_URL",
    }
    browser = next(step["command"] for step in recipe["steps"] if step["label"] == "browser")
    assert "--max-failures=1" in browser
    assert "--retries" not in browser and "--grep-invert" not in browser


def test_native_gate_owns_the_trace_path_without_leaking_into_unit_stores(
    recipe: dict[str, Any],
) -> None:
    browser = next(step for step in recipe["steps"] if step["label"] == "browser")
    environment = browser["environment"]
    assert environment["NEISTRA_PROPERTY_WORKER_TRACE"] == str(
        Path(environment["NEISTRA_E2E_DATA_DIR"]) / "qualification/worker-turns.jsonl"
    )
    assert not Path(environment["NEISTRA_PROPERTY_WORKER_TRACE"]).exists()
    for step in recipe["steps"]:
        if step["label"] != "browser":
            assert "NEISTRA_PROPERTY_WORKER_TRACE" not in step.get("environment", {})


def test_all_six_new_helpers_are_syntactically_valid_and_source_qualified() -> None:
    names = {path.name for path in ASSETS.glob("*.py.txt")}
    assert len(names) == 6
    for name in names:
        ast.parse((ASSETS / name).read_bytes(), filename=name)
    runner = runpy.run_path(str(ASSETS / "qualification.py.txt"))
    for directory in (
        "viewer-information",
        "viewer-measurements",
        "ligand-designation",
        "ligand-properties",
    ):
        assert all(runner["selected"](f"docs/assets/{directory}/{name}") for name in names)
    assert not runner["selected"]("docs/assets/ligand-properties/c3-checkpoint.json")


def test_packager_keeps_actual_lifecycle_stores_and_protocol() -> None:
    text = (ASSETS / "release-evidence.py.txt").read_text()
    assert "== 43" in text and '"private-derived-shared-schema-v1"' in text
    assert '"property-reader-workspace"' in text
    assert '"retained_property_reader_workspace_files"' in text
    assert '"previous-read-current"' in text
    assert '"previous-refuse-current"' not in text


def test_packager_reader_workspace_preserves_private_and_user_payloads(tmp_path: Path) -> None:
    tools = runpy.run_path(str(ASSETS / "release-evidence.py.txt"))
    workspace = tmp_path / "owned-reader"
    workspace.mkdir()
    contents = {
        "molweave.db": b"Synthetic unit-owned database bytes",
        "artifacts/original.mol": b"original unit specimen",
        "cache/ligand-properties-v1/report.json": b'{"unit_fixture":true}',
        "user-output.json": b'{"user_output":true}',
        "actor.log": b"actual unit-owned log",
    }
    for relative, body in contents.items():
        path = workspace / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    cache = workspace / "__pycache__/fixture.pyc"
    cache.parent.mkdir()
    cache.write_bytes(b"named interpreter cache")
    items: dict[str, Any] = {}
    count, excluded = tools["add_reader_workspace"](items, workspace, "property-reader-workspace")
    assert count == 5 and excluded == ["__pycache__/fixture.pyc"]
    assert set(items) == {f"property-reader-workspace/{name}" for name in contents}
    packet = tools["archive"](items, tmp_path / "reader.zip")
    assert packet["outer_manifest_entries"] == 5
    assert packet["verification_counts"]["evidence_manifest_entries"] == 5


# Independent unit contract: these names are intentionally not read from the packager.
RELEASE_CHECKPOINT_CONTRACT = (
    "c1-checkpoint.json",
    "c2-startup-ownership-checkpoint.json",
    "c2-source-producer-checkpoint.json",
    "c2-prelaunch-recovery-checkpoint.json",
    "c3-reader-clock-checkpoint.json",
    "c3-all8-baseline-checkpoint.json",
    "c3-inspector-correction-checkpoint.json",
    "c3-desktop-profile-checkpoint.json",
    "c3-all8-remeasurement-checkpoint.json",
)


@pytest.fixture
def release_context(tmp_path: Path) -> Any:
    import hashlib
    import io
    import zipfile

    root = tmp_path / "synthetic-release-context"
    assets = root / "docs/assets/ligand-properties"
    assets.mkdir(parents=True)
    expected: dict[str, bytes] = {}

    def put(relative: str, body: bytes, archive_name: str) -> None:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        expected[archive_name] = body

    def raw_packet(label: str) -> bytes:
        body = f"Synthetic unit fixture only: {label}\n".encode()
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as packet:
            packet.writestr("fixture.log", body)
            packet.writestr(
                "manifest.json",
                json.dumps(
                    {
                        "fixture.log": {
                            "bytes": len(body),
                            "sha256": hashlib.sha256(body).hexdigest(),
                        }
                    }
                ),
            )
        return output.getvalue()

    for name in RELEASE_CHECKPOINT_CONTRACT:
        put(
            f"docs/assets/ligand-properties/{name}",
            b'{"scope":"synthetic offline unit metadata; no actual workflow result"}\n',
            f"checkpoints/{name}",
        )
    packet = raw_packet("full synthetic packet")
    packet_relative = "docs/assets/ligand-properties/c3-all8-remeasurement-evidence.zip"
    put(packet_relative, packet, "checkpoints/c3-all8-remeasurement-evidence.zip")
    final = {
        "scope": "Synthetic offline unit fixture; never actual workflow qualification",
        "complete": True,
        "all8workflow_cases_passed": True,
        "actual_runner_wait_exit": 0,
        "skips_failures_flakes_retries": 0,
        "packet": packet_relative,
        "bytes": len(packet),
        "sha256": hashlib.sha256(packet).hexdigest(),
        "all_regular_input_bodies_crc_and_exact_union_verified": True,
    }
    put(
        "docs/assets/ligand-properties/c3-all8-remeasurement-checkpoint.json",
        (json.dumps(final) + "\n").encode(),
        "checkpoints/c3-all8-remeasurement-checkpoint.json",
    )
    put(
        "docs/assets/ligand-properties/c1-original-evidence.zip",
        raw_packet("earlier synthetic checkpoint"),
        "checkpoints/c1-original-evidence.zip",
    )
    put(
        "docs/assets/ligand-properties/c2-extra-retained/nested/raw.log",
        b"Synthetic earlier failure is preserved as failure\n",
        "checkpoints/c2-extra-retained/nested/raw.log",
    )
    for relative in (
        "docs/plans/issue-159-live-ligand-properties.md",
        "docs/plans/issue-11-ligand-information.md",
        "docs/SCIENTIFIC_LIMITATIONS.md",
        "docs/PERFORMANCE.md",
        "docs/DEVELOPMENT.md",
    ):
        put(relative, f"Synthetic document: {relative}\n".encode(), relative)
    for name in (
        "qualification.py.txt",
        "release-recipe.py.txt",
        "versions.py.txt",
        "production-audit.py.txt",
        "qualification-summary.py.txt",
        "release-evidence.py.txt",
    ):
        put(
            f"docs/assets/ligand-properties/{name}",
            f"Synthetic tool bytes: {name}\n".encode(),
            f"tools/{name}",
        )
    tools = runpy.run_path(str(ASSETS / "release-evidence.py.txt"))
    return root, tools, expected


def test_release_context_keeps_exact_checkpoint_document_and_raw_union(
    release_context: Any, tmp_path: Path
) -> None:
    import zipfile

    root, tools, expected = release_context
    items: dict[str, Any] = {}
    tools["add_release_context_members"](items, root)
    assert set(items) == set(expected)
    assert all(items[name].read_bytes() == body for name, body in expected.items())
    output = tmp_path / "synthetic-context.zip"
    receipt = tools["archive"](items, output)
    assert receipt["outer_manifest_entries"] == len(expected)
    with zipfile.ZipFile(output) as packet:
        assert packet.testzip() is None
        assert set(packet.namelist()) == set(expected) | {"manifest.json"}
        assert all(packet.read(name) == body for name, body in expected.items())


@pytest.mark.parametrize("name", RELEASE_CHECKPOINT_CONTRACT)
def test_release_context_rejects_each_missing_actual_checkpoint(
    release_context: Any, name: str
) -> None:
    root, tools, _ = release_context
    (root / "docs/assets/ligand-properties" / name).unlink()
    with pytest.raises(AssertionError):
        tools["add_release_context_members"]({}, root)


def test_release_context_rejects_missing_approved_plan(release_context: Any) -> None:
    root, tools, _ = release_context
    (root / "docs/plans/issue-159-live-ligand-properties.md").unlink()
    with pytest.raises(AssertionError):
        tools["add_release_context_members"]({}, root)


def test_release_context_does_not_require_obsolete_generic_receipts(release_context: Any) -> None:
    root, tools, expected = release_context
    assets = root / "docs/assets/ligand-properties"
    assert not (assets / "c2-checkpoint.json").exists()
    assert not (assets / "c3-checkpoint.json").exists()
    items: dict[str, Any] = {}
    tools["add_release_context_members"](items, root)
    assert set(items) == set(expected)


@pytest.mark.parametrize(
    "key, value",
    [
        ("complete", False),
        ("complete", 1),
        ("all8workflow_cases_passed", False),
        ("all8workflow_cases_passed", 1),
        ("actual_runner_wait_exit", 1),
        ("actual_runner_wait_exit", False),
        ("actual_runner_wait_exit", 0.0),
        ("skips_failures_flakes_retries", 1),
        ("skips_failures_flakes_retries", False),
        ("skips_failures_flakes_retries", 0.0),
        ("packet", "docs/assets/ligand-properties/c3-all8-baseline-evidence.zip"),
        ("packet", "/tmp/unrelated.zip"),
        ("bytes", 1),
        ("bytes", False),
        ("sha256", "0" * 64),
        ("all_regular_input_bodies_crc_and_exact_union_verified", False),
        ("all_regular_input_bodies_crc_and_exact_union_verified", 1),
    ],
)
def test_release_context_rejects_false_incomplete_or_malformed_final_all8(
    release_context: Any, key: str, value: Any
) -> None:
    root, tools, _ = release_context
    receipt = root / "docs/assets/ligand-properties/c3-all8-remeasurement-checkpoint.json"
    record = json.loads(receipt.read_bytes())
    record[key] = value
    receipt.write_text(json.dumps(record))
    with pytest.raises(AssertionError):
        tools["add_release_context_members"]({}, root)


@pytest.mark.parametrize(
    "key",
    [
        "complete",
        "all8workflow_cases_passed",
        "actual_runner_wait_exit",
        "skips_failures_flakes_retries",
        "packet",
        "bytes",
        "sha256",
        "all_regular_input_bodies_crc_and_exact_union_verified",
    ],
)
def test_release_context_rejects_missing_final_all8_proof_fields(
    release_context: Any, key: str
) -> None:
    root, tools, _ = release_context
    receipt = root / "docs/assets/ligand-properties/c3-all8-remeasurement-checkpoint.json"
    record = json.loads(receipt.read_bytes())
    del record[key]
    receipt.write_text(json.dumps(record))
    with pytest.raises(KeyError):
        tools["add_release_context_members"]({}, root)


def test_release_context_rejects_missing_final_packet(release_context: Any) -> None:
    root, tools, _ = release_context
    (root / "docs/assets/ligand-properties/c3-all8-remeasurement-evidence.zip").unlink()
    with pytest.raises(AssertionError):
        tools["add_release_context_members"]({}, root)


def test_release_context_rejects_packet_bytes_changed_after_receipt(release_context: Any) -> None:
    root, tools, _ = release_context
    packet = root / "docs/assets/ligand-properties/c3-all8-remeasurement-evidence.zip"
    body = packet.read_bytes()
    packet.write_bytes(bytes([body[0] ^ 1]) + body[1:])
    with pytest.raises(AssertionError):
        tools["add_release_context_members"]({}, root)


def test_release_context_keeps_private_forensic_payload_outside_main_members(
    release_context: Any,
) -> None:
    root, tools, expected = release_context
    private = root / ".issue-11-evidence/synthetic-profile-preservation"
    private.mkdir(parents=True)
    forensic = private / "neistra-v0.37.0-desktop-profiling-diagnostics.zip"
    forensic.write_bytes(b"Tiny private synthetic fixture; no large asset is copied or allocated")
    public = root / "docs/assets/ligand-properties/c3-desktop-profile-checkpoint.json"
    metadata = {"scope": "Synthetic private reference only", "private_packet_path": str(forensic)}
    public.write_text(json.dumps(metadata))
    items: dict[str, Any] = {}
    tools["add_release_context_members"](items, root)
    assert set(items) == set(expected)
    assert all(path != forensic for path in items.values())
    assert items["checkpoints/c3-desktop-profile-checkpoint.json"] == public
    assert json.loads(public.read_bytes()) == metadata


def test_release_context_rejects_accidental_public_forensic_rebundle(release_context: Any) -> None:
    root, tools, _ = release_context
    forbidden = root / "docs/assets/ligand-properties/c3-desktop-profile-evidence.zip"
    forbidden.write_bytes(b"Synthetic negative control only")
    with pytest.raises(AssertionError, match="separate release asset"):
        tools["add_release_context_members"]({}, root)
