"""Offline command-contract controls, without Git mutations or qualification runs."""

from __future__ import annotations

import ast
import gzip
import hashlib
import json
import runpy
import shutil
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "docs/assets/ligand-profiles"


@pytest.fixture
def recipe(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    root, old = tmp_path / "source", tmp_path / "actual-predecessor"
    root.mkdir()
    old.mkdir()
    (root / "docs/assets/ligand-profiles").mkdir(parents=True)
    receipt = tmp_path / "preceding-receipt.json"
    receipt.write_text("{}\n")
    label = f"recipe-unit-{uuid4().hex}"
    workspace = Path("/tmp") / f"neistra160-{label}"
    assert not workspace.exists()
    monkeypatch.chdir(root)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "recipe",
            label,
            "--compatibility-protocol",
            "private-derived-same-schema-v2",
            "--current-version",
            "0.38.0",
            "--previous-tag",
            "v0.37.0",
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
        assert command[1:] == ["cat-file", "-t", "v0.37.0"]
        return "tag\n"

    monkeypatch.setattr(subprocess, "check_output", git_read)
    runpy.run_path(str(ASSETS / "release-recipe.py.txt"), run_name="__main__")
    try:
        yield json.loads((root / f"docs/assets/ligand-profiles/{label}-recipe.json").read_bytes())
    finally:
        # This contains no stores: generator-only offline unit fixture.
        workspace.rmdir()


def flag(command: list[str], key: str) -> str:
    return command[command.index(key) + 1]


def test_recipe_keeps_full43_independent_responsibilities(recipe: dict[str, Any]) -> None:
    steps = recipe["steps"]
    assert len(steps) == 43 and len({step["label"] for step in steps}) == 43
    assert recipe["compatibility_protocol"] == "private-derived-same-schema-v2"
    assert recipe["require_clean"]
    assert recipe["preceding_reader"]["schema_head"] == "0017"
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
    assert old_read["command"][0].endswith("actual-predecessor/.venv/bin/python")
    assert flag(old_read["command"], "--expected-version") == "0.37.0"
    assert "previous-read-current" in flag(old_read["command"], "--data-dir")
    assert "--schema-boundary" not in old_read["command"]
    assert "refuse" not in old_read["command"]
    migrated = selected[f"{family}-current-read-previous"]["command"]
    assert migrated[1] == "-c" and "alembic" in migrated[2]
    assert flag(migrated, "--expected-version") == "0.38.0"
    copy = selected[f"{family}-previous-migration-and-copy"]["command"]
    assert "closed_copy" in copy[2] and copy[-1].endswith("ligand_profiles_reader_qualification.py")


@pytest.mark.parametrize(
    "label, mode", [("editing-readers", "editing-run"), ("property-readers", "run")]
)
def test_actor_coordinators_require_actual_tag_and_extracted_source_receipt(
    recipe: dict[str, Any],
    label: str,
    mode: str,
) -> None:
    command = next(step["command"] for step in recipe["steps"] if step["label"] == label)
    assert command[2].endswith("ligand_profiles_reader_qualification.py") and command[3] == mode
    assert flag(command, "--compatibility-protocol") == "private-derived-same-schema-v2"
    assert flag(command, "--previous-tag") == "v0.37.0"
    assert flag(command, "--previous-commit") == "a" * 40
    assert flag(command, "--previous-receipt").endswith("preceding-receipt.json")
    assert "--diagnostic" not in command and "--schema-boundary" not in command


def test_pytest_has_no_shared_database_and_native_keeps_no_retry_relaxation(
    recipe: dict[str, Any],
) -> None:
    python = next(step for step in recipe["steps"] if step["label"] == "python")
    assert set(python["environment"]) == {"NEISTRA_FIXTURE_QUALIFICATION_EVIDENCE"}
    assert python["environment"]["NEISTRA_FIXTURE_QUALIFICATION_EVIDENCE"].endswith(
        "/profile-fixtures"
    )
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


def test_release_helpers_and_published_context_have_explicit_source_qualification() -> None:
    helpers = {
        "production-audit.py.txt",
        "qualification-summary.py.txt",
        "qualification.py.txt",
        "release-evidence.py.txt",
        "release-recipe.py.txt",
        "versions.py.txt",
    }
    published = {path.name for path in ASSETS.glob("*.py.txt")}
    assert helpers <= published
    for name in published:
        ast.parse((ASSETS / name).read_bytes(), filename=name)
    runner = runpy.run_path(str(ASSETS / "qualification.py.txt"))
    directories = (
        "viewer-information",
        "viewer-measurements",
        "ligand-designation",
        "ligand-properties",
        "ligand-profiles",
    )
    expected_paths = {
        f"docs/assets/{directory}/{name}" for directory in directories for name in helpers
    }
    assert runner["TOOLS"] == expected_paths
    assert all(runner["selected"](path) for path in expected_paths)
    for name in published - helpers:
        assert not runner["selected"](f"docs/assets/ligand-profiles/{name}")
    assert not runner["selected"]("docs/assets/ligand-profiles/c3-checkpoint.json")


def test_packager_keeps_both_origin_private_and_user_payloads(tmp_path: Path) -> None:
    tools = runpy.run_path(str(ASSETS / "release-evidence.py.txt"))
    workspace = tmp_path / "owned-reader"
    workspace.mkdir()
    contents = {
        f"origins/{origin}/{name}": body
        for origin in ("current", "previous")
        for name, body in {
            "molweave.db": b"Synthetic unit-only database bytes, not a real store",
            "artifacts/original.mol": b"original synthetic specimen",
            "cache/ligand-properties-v1/report.json": b'{"unit_fixture":true}',
            "user-output.json": b'{"user_output":true}',
            "actor.log": b"synthetic actor log",
        }.items()
    }
    for name, body in contents.items():
        path = workspace / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    cache = workspace / "__pycache__/fixture.pyc"
    cache.parent.mkdir()
    cache.write_bytes(b"named interpreter cache")
    items: dict[str, Any] = {}
    count, excluded = tools["add_reader_workspace"](items, workspace, "property-reader-workspace")
    assert count == 10 and excluded == ["__pycache__/fixture.pyc"]
    assert set(items) == {f"property-reader-workspace/{name}" for name in contents}
    packet = tools["archive"](items, tmp_path / "reader.zip")
    assert packet["outer_manifest_entries"] == 10
    assert packet["verification_counts"]["evidence_manifest_entries"] == 10


def test_diff_stage_covers_committed_candidate_including_new_files(recipe: dict[str, Any]) -> None:
    command = next(step["command"] for step in recipe["steps"] if step["label"] == "diff")
    assert command == ["git", "diff", "--check", "a" * 40, "HEAD"]


@pytest.mark.parametrize("protocol", [None, "private-derived-shared-schema-v1", "unknown"])
def test_generator_rejects_missing_or_other_protocol_before_any_work(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    protocol: str | None,
) -> None:
    monkeypatch.chdir(tmp_path)
    argv = [
        "recipe",
        "rejected",
        "--current-version",
        "0.38.0",
        "--previous-tag",
        "v0.37.0",
        "--previous-root",
        str(tmp_path / "missing-old"),
        "--previous-receipt",
        str(tmp_path / "missing-receipt"),
    ]
    if protocol is not None:
        argv += ["--compatibility-protocol", protocol]
    monkeypatch.setattr(sys, "argv", argv)
    with pytest.raises(SystemExit) as error:
        runpy.run_path(str(ASSETS / "release-recipe.py.txt"), run_name="__main__")
    assert error.value.code == 2
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize(
    "directory",
    [
        "viewer-information",
        "viewer-measurements",
        "ligand-designation",
        "ligand-properties",
        "ligand-profiles",
    ],
)
def test_catalogue_rejects_context_scripts_and_nearby_unrecognized_names(directory: str) -> None:
    selected = runpy.run_path(str(ASSETS / "qualification.py.txt"))["selected"]
    for name in (
        "c1-analysis.py.txt",
        "qualification.py.txt.backup",
        "context/qualification.py.txt",
        "qualification.py",
        "release-context.json",
        "previous-qualification.py.txt",
    ):
        assert not selected(f"docs/assets/{directory}/{name}")


def test_new_runner_rejects_legacy_recipe_before_creating_gate(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recipe = tmp_path / "recipe.json"
    recipe.write_text(json.dumps({"compatibility_protocol": "private-derived-shared-schema-v1"}))
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "argv", ["qualification", str(recipe)])
    with pytest.raises(AssertionError):
        runpy.run_path(str(ASSETS / "qualification.py.txt"), run_name="__main__")
    assert sorted(p.name for p in tmp_path.iterdir()) == ["recipe.json"]


@pytest.mark.parametrize(
    "corruption",
    [
        "protocol",
        "schema",
        "actor",
        "missing-selector",
        "selector",
        "mode",
        "missing-stage",
        "missing-fixture-evidence",
    ],
)
def test_runner_rejects_inconsistent_recipe_before_launching_commands(
    recipe: dict[str, Any],
    corruption: str,
) -> None:
    contract = runpy.run_path(str(ASSETS / "qualification.py.txt"))["validate_recipe_contract"]
    candidate = deepcopy(recipe)
    command = next(s["command"] for s in candidate["steps"] if s["label"] == "property-readers")
    root = Path(flag(command, "--current-root"))
    contract(candidate, root)
    if corruption == "protocol":
        candidate["compatibility_protocol"] = "private-derived-shared-schema-v1"
    elif corruption == "schema":
        candidate["preceding_reader"]["schema_head"] = "0016"
    elif corruption == "actor":
        command[2] = str(root / "tests/support/ligand_properties_reader_qualification.py")
    elif corruption == "missing-selector":
        position = command.index("--compatibility-protocol")
        del command[position : position + 2]
    elif corruption == "selector":
        command[command.index("--compatibility-protocol") + 1] = "private-derived-shared-schema-v1"
    elif corruption == "mode":
        command[3] = "editing-run"
    elif corruption == "missing-fixture-evidence":
        next(s for s in candidate["steps"] if s["label"] == "python").pop("environment")
    else:
        candidate["steps"].pop()
    with pytest.raises((AssertionError, ValueError)):
        contract(candidate, root)


def test_packager_rejects_legacy_protocol_before_accepting_a_gate(tmp_path: Path) -> None:
    tools = runpy.run_path(str(ASSETS / "release-evidence.py.txt"))
    assets = tmp_path / "docs/assets/ligand-profiles"
    assets.mkdir(parents=True)
    for name in ("gate", "recipe"):
        (assets / f"unit-{name}.json").write_text(
            json.dumps(
                {
                    "compatibility_protocol": "private-derived-shared-schema-v1",
                }
            )
        )
    (assets / "unit-summary.json").write_text("{}\n")
    with pytest.raises(AssertionError):
        tools["gate_items"](tmp_path, "unit")


def test_release_context_retains_actual_profile_preparation_and_current_contract() -> None:
    tools = runpy.run_path(str(ASSETS / "release-evidence.py.txt"))
    items: dict[str, Any] = {}
    tools["add_release_context_members"](items, ROOT)
    expected = {
        "c1-domain-checkpoint.json",
        "c1-domain-evidence.zip",
        "c2-checkpoint.json",
        "c2-evidence.zip",
        "c2-source-recovery-checkpoint.json",
        "c2-source-recovery-evidence.zip",
        "c2-inspector-scaling-checkpoint.json",
        "c2-inspector-scaling-evidence.zip",
        "c3-same-schema-acceptance.json",
        "c3-released159-integration-checkpoint.json",
    }
    assert {"checkpoints/" + name for name in expected} <= set(items)
    assert "docs/plans/issue-160-physicochemical-profiles.md" in items
    assert "docs/plans/issue-11-ligand-information.md" in items
    assert not any("c3-all8-remeasurement" in name for name in items)


@pytest.mark.parametrize("corruption", [None, "missing", "duplicate", "hash", "authority"])
def test_persisted_worker_sources_bind_to_actual_qualified_bodies(corruption: str | None) -> None:
    tools = runpy.run_path(str(ASSETS / "qualification.py.txt"))
    relative_paths = (
        "apps/api/src/neistra_api/job_worker.py",
        "apps/api/src/neistra_api/ligand_property_process.py",
        "apps/api/src/neistra_api/ligand_property_plugin.py",
        "packages/neistra_core/src/neistra_core/ligand_properties/input.py",
        "packages/neistra_core/src/neistra_core/ligand_properties/calculate.py",
        "packages/neistra_core/src/neistra_core/ligand_properties/registry.py",
    )
    identities = {
        name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in relative_paths
    }
    proof = {
        "module_paths": {
            name: {"path": str(ROOT / name), "sha256": identities[name]} for name in relative_paths
        }
    }
    first = relative_paths[0]
    if corruption == "missing":
        proof["module_paths"].pop(first)
    elif corruption == "duplicate":
        proof["module_paths"]["duplicate"] = dict(proof["module_paths"][first])
    elif corruption == "hash":
        proof["module_paths"][first]["sha256"] = "0" * 64
    elif corruption == "authority":
        identities[first] = "0" * 64
    if corruption is None:
        tools["verify_worker_sources"](proof, ROOT, identities)
    else:
        with pytest.raises(AssertionError):
            tools["verify_worker_sources"](proof, ROOT, identities)


@pytest.mark.parametrize("corruption", [None, "native-version", "module-hash", "native-hash"])
def test_persisted_library_proof_rechecks_selected_environment_bodies(
    corruption: str | None,
) -> None:
    from importlib.metadata import version

    import rdkit
    from rdkit import rdBase

    assert rdkit.__file__ is not None and rdBase.__file__ is not None
    module, native = Path(rdkit.__file__).resolve(), Path(rdBase.__file__).resolve()
    library = {
        "distribution": "rdkit",
        "distribution_version": version("rdkit"),
        "native_version": rdBase.rdkitVersion,
        "module_path": str(module),
        "module_sha256": hashlib.sha256(module.read_bytes()).hexdigest(),
        "native_module_path": str(native),
        "native_module_sha256": hashlib.sha256(native.read_bytes()).hexdigest(),
    }
    proof = {
        "root": str(ROOT),
        "python_prefix": str(ROOT / ".venv"),
        "method": {"library_version": "2026.03.4"},
        "installed_library": library,
    }
    if corruption == "native-version":
        library["native_version"] = "0.0.0"
    elif corruption == "module-hash":
        library["module_sha256"] = "0" * 64
    elif corruption == "native-hash":
        library["native_module_sha256"] = "0" * 64
    verify = runpy.run_path(str(ASSETS / "qualification.py.txt"))["verify_worker_library"]
    if corruption is None:
        verify(proof)
    else:
        with pytest.raises(AssertionError):
            verify(proof)


@pytest.mark.parametrize(
    "change",
    [
        None,
        "missing-case",
        "partial",
        "source",
        "fixture-hash",
        "missing-store",
        "missing-database",
        "missing-artifact",
    ],
)
def test_owned_fixture_evidence_requires_all_44_complete_source_bound_cases(
    tmp_path: Path,
    change: str | None,
) -> None:
    from tests.support.ligand_profiles_fixture_qualification import qualification_provenance

    provenance = qualification_provenance(
        ROOT / "tests/fixtures/ligand-properties-performance/editable"
    )
    directory = tmp_path / "synthetic-unit-evidence"
    ids = sorted(provenance["fixtures"])
    for name in ids:
        path = directory / name / "results.json"
        path.parent.mkdir(parents=True)
        result = {
            "complete": True,
            "count": 1,
            "provenance": provenance,
            "cases": [
                {
                    "id": name,
                    "sha256": provenance["fixtures"][name]["sha256"],
                    "history": {
                        "original_preserved": True,
                        "original_sha256": provenance["fixtures"][name]["sha256"],
                        "canonical_bytes_ids_graph_coordinates_restored": True,
                        "before_artifact_id": "synthetic-before",
                        "restored_artifact_id": "synthetic-before",
                        "edited_artifact_id": "synthetic-edit",
                    },
                }
            ],
        }
        path.write_text(json.dumps(result))
        store = path.parent / name
        store.mkdir()
        (store / "history.db").write_bytes(b"SQLite format 3\0Synthetic unit bytes only")
        original = ROOT / "tests/fixtures/ligand-properties-performance/editable" / (name + ".sdf")
        for payload in (original.read_bytes(), b"synthetic-before", b"synthetic-edited"):
            content_hash = hashlib.sha256(payload).hexdigest()
            artifact = store / "artifacts/sha256" / content_hash[:2] / content_hash
            artifact.parent.mkdir(parents=True, exist_ok=True)
            artifact.write_bytes(payload)
    first = directory / ids[0] / "results.json"
    if change == "missing-case":
        first.unlink()
    elif change in {"missing-store", "missing-database", "missing-artifact"}:
        import shutil

        store = first.parent / ids[0]
        if change == "missing-store":
            shutil.rmtree(store)
        elif change == "missing-database":
            (store / "history.db").unlink()
        else:
            artifact = next(p for p in (store / "artifacts/sha256").rglob("*") if p.is_file())
            artifact.unlink()
    elif change is not None:
        result = json.loads(first.read_bytes())
        if change == "partial":
            result["complete"] = False
        elif change == "source":
            result["provenance"]["qualification_driver"]["sha256"] = "0" * 64
        else:
            result["cases"][0]["sha256"] = "0" * 64
        first.write_text(json.dumps(result))
    recipe = {
        "steps": [
            {
                "label": "python",
                "environment": {
                    "NEISTRA_FIXTURE_QUALIFICATION_EVIDENCE": str(directory),
                },
            }
        ]
    }
    collect = runpy.run_path(str(ASSETS / "qualification.py.txt"))["fixture_qualification_reports"]
    if change is None:
        evidence = collect(recipe, ROOT)
        assert evidence["count"] == len(evidence["reports"]) == 44
    else:
        with pytest.raises(AssertionError):
            collect(recipe, ROOT)


def preceding_release() -> dict[str, str]:
    return {
        "tag": "v0.37.0",
        "version": "0.37.0",
        "commit": "9f77410389c4e8738fdf94d3e69e7c8550fbc70c",
    }


def test_published_preceding_browser_data_is_original_complete_and_source_frozen() -> None:
    tools = runpy.run_path(str(ASSETS / "qualification.py.txt"))
    proof = tools["preceding_browser_baseline"](ROOT, preceding_release())
    assert proof["browser_inventory_count"] == 640
    assert proof["browser_passed"] == 565
    assert proof["browser_exclusions"] == len(proof["excluded_identities"]) == 75
    assert len(set(proof["excluded_identities"])) == 75
    assert set(proof["data_files"]) == tools["DATA"]
    assert len(tools["DATA"]) == 3 and tools["DATA"].isdisjoint(tools["TOOLS"])
    assert all(tools["selected"](name) for name in tools["DATA"])
    assert not tools["selected"](tools["BASELINE_DIRECTORY"] + "unlisted.json")
    identities = tools["current_identities"](ROOT)
    for name, record in proof["data_files"].items():
        assert identities[name] == record["sha256"]
    assert proof["data_files"][proof["browser"]] == {
        "bytes": 19164695,
        "sha256": "fa35647586745cb95461f8368d3ae6c9f6f72c01543d0c7f7bb5877918980445",
    }


@pytest.mark.parametrize(
    "key, value", [("tag", "v0.36.0"), ("version", "0.36.0"), ("commit", "0" * 40)]
)
def test_preceding_browser_data_rejects_another_requested_release(key: str, value: str) -> None:
    tools = runpy.run_path(str(ASSETS / "qualification.py.txt"))
    preceding = preceding_release()
    preceding[key] = value
    with pytest.raises(AssertionError, match="actual requested preceding release"):
        tools["preceding_browser_baseline"](ROOT, preceding)


@pytest.mark.parametrize(
    "corruption",
    [
        "missing-summary",
        "missing-browser",
        "missing-provenance",
        "swapped-bodies",
        "changed-summary",
        "truncated-gzip",
        "changed-exclusions-same-count",
        "broken-public-asset",
        "broken-outer-member",
        "broken-nested-manifest",
        "broken-payload-membership",
        "wrong-provenance-commit",
        "summary-symlink",
    ],
)
def test_preceding_baseline_rejects_missing_swapped_or_rewritten_public_evidence(
    tmp_path: Path, corruption: str
) -> None:
    tools = runpy.run_path(str(ASSETS / "qualification.py.txt"))
    directory = tmp_path / tools["BASELINE_DIRECTORY"]
    shutil.copytree(ASSETS / "preceding-v0.37.0", directory)
    summary = directory / "c5-master1-summary.json"
    browser = directory / "c5-master1-browser.json.gz"
    provenance = directory / "provenance.json"
    if corruption.startswith("missing-"):
        {"summary": summary, "browser": browser, "provenance": provenance}[
            corruption.removeprefix("missing-")
        ].unlink()
    elif corruption == "swapped-bodies":
        summary_body, browser_body = summary.read_bytes(), browser.read_bytes()
        summary.write_bytes(browser_body)
        browser.write_bytes(summary_body)
    elif corruption == "changed-summary":
        record = json.loads(summary.read_bytes())
        record["commit"] = "0" * 40
        summary.write_text(json.dumps(record))
    elif corruption == "truncated-gzip":
        browser.write_bytes(browser.read_bytes()[:-8])
    elif corruption == "changed-exclusions-same-count":
        record = json.loads(gzip.decompress(browser.read_bytes()))
        tests = []

        def collect(suite: dict[str, Any]) -> None:
            for spec in suite.get("specs", []):
                tests.extend(spec["tests"])
            for child in suite.get("suites", []):
                collect(child)

        for suite in record["suites"]:
            collect(suite)
        passed = next(t for t in tests if t["results"][-1]["status"] == "passed")
        skipped = next(t for t in tests if t["results"][-1]["status"] == "skipped")
        passed["expectedStatus"] = passed["results"][-1]["status"] = "skipped"
        skipped["expectedStatus"] = skipped["results"][-1]["status"] = "passed"
        browser.write_bytes(gzip.compress(json.dumps(record).encode(), mtime=0))
    elif corruption == "summary-symlink":
        summary.unlink()
        summary.symlink_to(ASSETS / "preceding-v0.37.0/c5-master1-summary.json")
    else:
        record = json.loads(provenance.read_bytes())
        if corruption == "broken-public-asset":
            record["public_asset"]["sha256"] = "0" * 64
        elif corruption == "broken-outer-member":
            record["outer_manifest"]["member"]["path"] = "complete-gates/candidate/other.zip"
        elif corruption == "broken-nested-manifest":
            record["nested_archive"]["manifest_sha256"] = "0" * 64
        elif corruption == "broken-payload-membership":
            del record["nested_archive"]["members"]["gate/c5-master1-browser.json.gz"]
        else:
            record["predecessor"]["commit"] = "0" * 40
        provenance.write_text(json.dumps(record))
    with pytest.raises(AssertionError):
        tools["preceding_browser_baseline"](tmp_path, preceding_release())


def synthetic_preceding_browser() -> tuple[dict[str, Any], dict[str, Any]]:
    """A small synthetic report tests semantic rejection without mutating real evidence."""
    summary = json.loads((ASSETS / "preceding-v0.37.0/c5-master1-summary.json").read_bytes())
    specs = []
    for index in range(640):
        status = "passed" if index < 565 else "skipped"
        specs.append(
            {
                "file": "synthetic.spec.ts",
                "title": f"synthetic-{index}",
                "tests": [
                    {
                        "projectName": "synthetic",
                        "expectedStatus": status,
                        "results": [{"status": status}],
                    }
                ],
            }
        )
    browser = {
        "errors": [],
        "stats": {"expected": 565, "skipped": 75, "unexpected": 0, "flaky": 0},
        "suites": [{"title": "synthetic", "specs": specs}],
    }
    return browser, summary


@pytest.mark.parametrize(
    "corruption",
    [
        None,
        "duplicate",
        "missing",
        "retry",
        "no-result",
        "failed",
        "unexpected",
        "flaky",
        "count",
        "partial",
    ],
)
def test_preceding_report_requires_complete_unique_observed_no_retry_identities(
    corruption: str | None,
) -> None:
    tools = runpy.run_path(str(ASSETS / "qualification.py.txt"))
    browser, summary = synthetic_preceding_browser()
    specs = browser["suites"][0]["specs"]
    test = specs[0]["tests"][0]
    if corruption == "duplicate":
        specs[1]["title"] = specs[0]["title"]
    elif corruption == "missing":
        specs.pop()
    elif corruption == "retry":
        test["results"].append({"status": "passed"})
    elif corruption == "no-result":
        test["results"].clear()
    elif corruption == "failed":
        test["results"][0]["status"] = "failed"
    elif corruption in {"unexpected", "flaky"}:
        browser["stats"][corruption] = 1
    elif corruption == "count":
        summary["browser_inventory_count"] = 639
    elif corruption == "partial":
        summary["complete_browser_inventory_executed"] = False
    if corruption is None:
        assert (
            tools["validate_preceding_browser_report"](browser, summary)["browser_exclusions"] == 75
        )
    else:
        with pytest.raises(AssertionError):
            tools["validate_preceding_browser_report"](browser, summary)


def test_missing_preceding_data_stops_runner_before_any_gate_or_command(
    recipe: dict[str, Any], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    command = next(s["command"] for s in recipe["steps"] if s["label"] == "property-readers")
    root = Path(flag(command, "--current-root"))
    path = tmp_path / "valid-recipe-missing-baseline.json"
    path.write_text(json.dumps(recipe))
    monkeypatch.chdir(root)
    monkeypatch.setattr(sys, "argv", ["qualification", str(path)])

    def forbidden(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("No Git or command launch is needed before baseline rejection")

    import subprocess

    monkeypatch.setattr(subprocess, "check_output", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    with pytest.raises(AssertionError, match="Missing baseline data"):
        runpy.run_path(str(ASSETS / "qualification.py.txt"), run_name="__main__")
    assert not list((root / "docs/assets/ligand-profiles").glob("*-gate.json"))


def test_gate_and_release_packaging_retain_all_three_validated_baseline_inputs() -> None:
    tools = runpy.run_path(str(ASSETS / "release-evidence.py.txt"))
    items: dict[str, Any] = {}
    proof = tools["add_preceding_browser_baseline"](items, ROOT, preceding_release())
    assert set(items) == {
        "preceding-browser-baseline/c5-master1-summary.json",
        "preceding-browser-baseline/c5-master1-browser.json.gz",
        "preceding-browser-baseline/provenance.json",
    }
    assert set(proof["data_files"]) == {str(path.relative_to(ROOT)) for path in items.values()}
    release_items: dict[str, Any] = {}
    release_proof = tools["add_release_context_members"](release_items, ROOT)
    assert release_proof == proof
    assert items.items() <= release_items.items()
