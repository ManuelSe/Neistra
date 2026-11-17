"""Recipe generation against synthetic Git fixtures; no application qualification runs."""

from __future__ import annotations

import json
import os
import runpy
import shutil
import subprocess
import sys
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / (
    "docs/assets/ligand-designation/release-recipe.py.txt"
)


def git(root: Path, *arguments: str) -> str:
    return subprocess.check_output(["git", "-C", str(root), *arguments], text=True).strip()


@pytest.fixture
def synthetic_repository(tmp_path: Path) -> tuple[Path, Path, Path]:
    root = tmp_path / "synthetic-recipe-repository"
    root.mkdir()
    (root / "docs/assets/ligand-designation").mkdir(parents=True)
    git(root, "init", "-q")
    for version in ("9.7.2", "10.4.3"):
        (root / "synthetic-source.txt").write_text(f"Recipe-unit fixture only: {version}\n")
        git(root, "add", "synthetic-source.txt")
        git(root, "-c", "user.name=Recipe unit", "-c", "user.email=recipe@example.invalid",
            "commit", "-q", "-m", f"test: synthetic source {version}")
        git(root, "-c", "user.name=Recipe unit", "-c", "user.email=recipe@example.invalid",
            "tag", "-a", f"v{version}", "-m", "Synthetic recipe-unit tag")
    old = tmp_path / "synthetic-extracted-source"
    old.mkdir()
    # The recipe only carries this path. The real runner verifies its inventory.
    (old / "synthetic-source.txt").write_text(git(root, "show", "v9.7.2:synthetic-source.txt"))
    receipt = tmp_path / "synthetic-source-receipt.json"
    receipt.write_text(json.dumps({"synthetic_recipe_unit_only": True,
                                   "commit": git(root, "rev-parse", "v9.7.2^{}")}) + "\n")
    return root, old, receipt


@pytest.fixture
def invoke_recipe(
    synthetic_repository: tuple[Path, Path, Path],
) -> Iterator[Callable[..., tuple[subprocess.CompletedProcess[str], str, Path]]]:
    root, old, receipt = synthetic_repository
    owned_workspaces: list[Path] = []

    def invoke(*, label: str | None = None, tag: str = "v9.7.2",
               version: str = "11.0.0", extra: list[str] | None = None,
               ) -> tuple[subprocess.CompletedProcess[str], str, Path]:
        label = label or f"recipe-unit-{uuid4().hex}"
        workspace = Path("/tmp") / f"neistra158-{label}"
        if label.startswith("recipe-unit-") and "/" not in label:
            if workspace not in owned_workspaces:
                assert not workspace.exists(), "Never reuse or remove another session's workspace"
                owned_workspaces.append(workspace)
        if tag in {"v9.7.2", "v10.4.3"}:
            (old / "synthetic-source.txt").write_text(
                git(root, "show", f"{tag}:synthetic-source.txt")
            )
            receipt.write_text(json.dumps({
                "synthetic_recipe_unit_only": True,
                "commit": git(root, "rev-parse", f"{tag}^{{}}"),
            }) + "\n")
        result = subprocess.run([
            sys.executable, str(SCRIPT), label, "--current-version", version,
            "--previous-tag", tag, "--previous-root", str(old), "--previous-receipt", str(receipt),
            *(extra or []),
        ], cwd=root, text=True, capture_output=True, check=False)
        return result, label, workspace

    try:
        yield invoke
    finally:
        for workspace in owned_workspaces:
            if workspace.exists():
                shutil.rmtree(workspace)


def argument(command: list[str], name: str) -> str:
    return command[command.index(name) + 1]


def load_recipe(root: Path, label: str) -> dict[str, Any]:
    path = root / "docs/assets/ligand-designation" / f"{label}-recipe.json"
    result: dict[str, Any] = json.loads(path.read_text())
    return result


@pytest.mark.parametrize("tag", ["v9.7.2", "v10.4.3"])
def test_recipe_uses_the_selected_annotated_tag_commit_and_all_complete_gate_steps(
    synthetic_repository: tuple[Path, Path, Path], invoke_recipe: Callable[..., Any], tag: str,
) -> None:
    root, old, _receipt = synthetic_repository
    result, label, workspace = invoke_recipe(tag=tag)
    assert result.returncode == 0, result.stderr
    recipe = load_recipe(root, label)
    expected_commit = git(root, "rev-parse", f"{tag}^{{}}")
    assert expected_commit != git(root, "rev-parse", tag)
    assert recipe["preceding_reader"] == {
        "tag": tag, "version": tag[1:], "commit": expected_commit, "root": str(old),
    }
    assert recipe["application_version"] == "11.0.0"
    assert recipe["environment"]["NEISTRA_QUALIFICATION_BASE"] == expected_commit
    assert recipe["environment"]["NEISTRA_QUALIFICATION_VERSION"] == "11.0.0"
    assert recipe["require_clean"] is True
    assert recipe["compatibility_protocol"] == "schema-boundary-v1"
    labels = [step["label"] for step in recipe["steps"]]
    assert labels == [
        "uv", "pnpm", "migration", "downgrade", "remigration", "ruff", "mypy",
        "reader-tool-types", "python", "lint", "types", "web", "supervisor", "build",
        "browser-inventory", "browser", "versions", "production", "legacy-cli",
        *[f"{family}-{phase}" for family in ("rich", "connectivity", "measurements") for phase in (
            "current-migration", "current-produce", "previous-migration-and-copy",
            "previous-refuse-current", "previous-produce", "current-read-previous",
            "current-reopen",
        )],
        "editing-readers", "diff",
    ]
    assert len(labels) == len(set(labels)) == 42
    assert workspace.is_dir()


def test_schema_boundary_commands_keep_actual_old_processes_separate_from_current_sources(
    synthetic_repository: tuple[Path, Path, Path], invoke_recipe: Callable[..., Any],
) -> None:
    root, old, receipt = synthetic_repository
    result, label, workspace = invoke_recipe()
    assert result.returncode == 0, result.stderr
    recipe = load_recipe(root, label)
    steps = {step["label"]: step for step in recipe["steps"]}
    for family, filename, feature_flag in (
        ("rich", "rebranding_reader_qualification.py", "--expect-new-names"),
        ("connectivity", "current_connectivity_reader_qualification.py",
         "--expect-current-connectivity"),
        ("measurements", "measurement_reader_qualification.py", "--expect-ordered-measurements"),
    ):
        current, previous, refused = (workspace / f"{family}-{suffix}"
                                      for suffix in ("current", "previous", "refusal"))
        for suffix, mode, implementation, data, version in (
            ("current-produce", "produce", root, current, "11.0.0"),
            ("previous-refuse-current", "refuse", old, previous, "9.7.2"),
            ("previous-produce", "produce", old, previous, "9.7.2"),
            ("current-read-previous", "read", root, previous, "11.0.0"),
            ("current-reopen", "read", root, current, "11.0.0"),
        ):
            step = steps[f"{family}-{suffix}"]
            command, environment = step["command"], step["environment"]
            assert step["cwd"] == str(implementation)
            assert command[:4] == [str(root / ".venv/bin/python"), "-B",
                                   str(root / "tests/support" / filename), mode]
            assert argument(command, "--implementation-root") == str(implementation)
            assert argument(command, "--expected-version") == version
            assert argument(command, "--data-dir") == str(data)
            assert feature_flag in command
            assert environment["PYTHONPATH"].split(":") == [str(implementation / part) for part in (
                "apps/api/src", "packages/neistra_core/src", "packages/neistra_demo_plugin/src",
                ".",
            )]
            assert environment["NEISTRA_DATA_DIR"] == environment["MOLWEAVE_DATA_DIR"] == str(data)
            assert environment["NEISTRA_DATABASE_URL"] == environment["MOLWEAVE_DATABASE_URL"] \
                == f"sqlite:///{data}/molweave.db"
        refusal = steps[f"{family}-previous-refuse-current"]["command"]
        assert argument(refusal, "--refusal-data") == str(refused)
        assert argument(refusal, "--archives-dir") == str(current)
        prepare = steps[f"{family}-previous-migration-and-copy"]
        assert prepare["cwd"] == str(old)
        assert prepare["command"][-2:] == [str(current), str(refused)]
        assert prepare["environment"] == steps[f"{family}-previous-produce"]["environment"]
        assert "shutil.copytree(source, copied)" in prepare["command"][2]
        assert "not copied.exists()" in prepare["command"][2]
        assert "'alembic', 'upgrade', 'head'" in prepare["command"][2]
        assert "--schema-boundary" in steps[f"{family}-current-read-previous"]["command"]
        assert "--schema-boundary" not in steps[f"{family}-current-reopen"]["command"]
    editing = steps["editing-readers"]["command"]
    assert "--schema-boundary" in editing
    assert argument(editing, "--current-root") == str(root)
    assert argument(editing, "--previous-root") == str(old)
    assert argument(editing, "--previous-receipt") == str(receipt)
    assert argument(editing, "--previous-version") == "9.7.2"
    assert argument(editing, "--previous-tag") == "v9.7.2"
    assert argument(editing, "--previous-commit") == git(root, "rev-parse", "v9.7.2^{}")
    assert argument(editing, "--workspace") == str(workspace / "editing-readers")


def test_recipe_retains_all_tool_typechecks_native_inventory_and_environment_guards(
    synthetic_repository: tuple[Path, Path, Path], invoke_recipe: Callable[..., Any],
) -> None:
    root, _old, _receipt = synthetic_repository
    result, label, workspace = invoke_recipe()
    assert result.returncode == 0, result.stderr
    recipe = load_recipe(root, label)
    steps = {step["label"]: step for step in recipe["steps"]}
    tools = steps["reader-tool-types"]["command"]
    assert {Path(path).name for path in tools if path.endswith(".py")} == {
        "structure_editing_reader_qualification.py", "rebranding_reader_qualification.py",
        "current_connectivity_reader_qualification.py", "measurement_reader_qualification.py",
        "navigation_reader_qualification.py",
        "project_document_compatibility.py", "schema_boundary_refusal.py",
        "schema_boundary_evidence.py",
    }
    assert "--list" in steps["browser-inventory"]["command"]
    assert "--max-failures=1" in steps["browser"]["command"]
    assert "--grep" not in steps["browser"]["command"]
    assert "--retries" not in steps["browser"]["command"]
    assert steps["browser"]["environment"]["NEISTRA_E2E_DATA_DIR"] == str(workspace / "e2e")
    assert recipe["environment"]["NEISTRA_MINIMIZATION_EVIDENCE_DIR"] == str(workspace / "native")
    assert recipe["environment"]["NEISTRA_AMBERTOOLS_PREFIX"]
    assert recipe["environment"]["NEISTRA_PERFORMANCE"] == "0"
    database_keys = {
        "NEISTRA_DATA_DIR", "NEISTRA_DATABASE_URL", "MOLWEAVE_DATA_DIR",
        "MOLWEAVE_DATABASE_URL", "DATABASE_URL",
    }
    assert set(recipe["unset_environment"]) == database_keys
    assert database_keys.isdisjoint(recipe["environment"])
    assert database_keys.isdisjoint(steps["python"].get("environment", {}))
    # Exercise a real child with the runner's effective environment: pytest
    # fixtures own their stores even if the invoking shell has all DB aliases.
    inherited = {**os.environ, **{key: "unrelated-qualification-store" for key in database_keys}}
    inherited["NEISTRA_RECIPE_TEST_SENTINEL"] = "retained"
    sanitized = {key: value for key, value in inherited.items()
                 if key not in recipe["unset_environment"]}
    python_environment = {**sanitized, **recipe["environment"],
                          **steps["python"].get("environment", {})}
    observed = json.loads(subprocess.check_output([
        sys.executable, "-c",
        "import json, os, sys; print(json.dumps({key: os.environ.get(key) "
        "for key in sys.argv[1:]}))",
        *sorted(database_keys), "NEISTRA_RECIPE_TEST_SENTINEL",
    ], env=python_environment, text=True))
    assert all(observed[key] is None for key in database_keys)
    assert observed["NEISTRA_RECIPE_TEST_SENTINEL"] == "retained"
    # Dedicated migration and utility probes keep their explicit owned store;
    # the reader-family test above independently checks every reader binding.
    for name in ("migration", "downgrade", "remigration", "versions", "legacy-cli"):
        environment = steps[name]["environment"]
        assert environment["NEISTRA_DATA_DIR"] == environment["MOLWEAVE_DATA_DIR"] \
            == str(workspace / "database")
        assert environment["NEISTRA_DATABASE_URL"] == environment["MOLWEAVE_DATABASE_URL"] \
            == f"sqlite:///{workspace}/database/molweave.db"


def test_preparation_copies_the_current_specimen_and_migrates_only_the_fresh_old_store(
    synthetic_repository: tuple[Path, Path, Path], invoke_recipe: Callable[..., Any],
) -> None:
    root, old, _receipt = synthetic_repository
    result, label, workspace = invoke_recipe()
    assert result.returncode == 0, result.stderr
    prepare = next(step for step in load_recipe(root, label)["steps"]
                   if step["label"] == "rich-previous-migration-and-copy")
    source, copied = (Path(path) for path in prepare["command"][-2:])
    original = {"synthetic.db": b"closed specimen", "artifacts/original.mol": b"retained\x00bytes"}
    for relative, payload in original.items():
        target = source / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
    stub = old / "alembic"
    stub.mkdir()
    (stub / "__init__.py").write_text("")
    (stub / "__main__.py").write_text(
        "import json, os, pathlib, sys\n"
        "data = pathlib.Path(os.environ['NEISTRA_DATA_DIR'])\n"
        "assert not data.exists(), 'Old store must start independently empty'\n"
        "data.mkdir(parents=True)\n"
        "(data / 'stub-migration.json').write_text(json.dumps({'argv': sys.argv[1:], "
        "'cwd': str(pathlib.Path.cwd())}))\n"
    )
    command = [sys.executable, *prepare["command"][1:]]
    environment = {**os.environ, **prepare["environment"]}
    executed = subprocess.run(command, cwd=old, env=environment, text=True,
                              capture_output=True, check=False)
    assert executed.returncode == 0, executed.stderr
    for relative, payload in original.items():
        assert (copied / relative).read_bytes() == (source / relative).read_bytes() == payload
    previous = workspace / "rich-previous"
    assert json.loads((previous / "stub-migration.json").read_text()) == {
        "argv": ["upgrade", "head"], "cwd": str(old),
    }
    sentinel = copied / "prior-refusal-evidence"
    sentinel.write_bytes(b"preserve")
    repeated = subprocess.run(command, cwd=old, env=environment, text=True,
                              capture_output=True, check=False)
    assert repeated.returncode != 0
    assert sentinel.read_bytes() == b"preserve"
    assert not (source / "stub-migration.json").exists()
    assert not (copied / "stub-migration.json").exists()


def test_fresh_labels_get_distinct_owned_paths_and_duplicate_label_preserves_prior_evidence(
    synthetic_repository: tuple[Path, Path, Path], invoke_recipe: Callable[..., Any],
) -> None:
    root, _old, _receipt = synthetic_repository
    first, first_label, first_workspace = invoke_recipe()
    second, second_label, second_workspace = invoke_recipe()
    assert first.returncode == second.returncode == 0
    assert first_workspace != second_workspace
    original = (root / "docs/assets/ligand-designation" / f"{first_label}-recipe.json").read_bytes()
    sentinel = first_workspace / "prior-evidence"
    sentinel.write_bytes(b"Retain earlier qualification attempt")
    duplicate, _label, _workspace = invoke_recipe(label=first_label)
    assert duplicate.returncode != 0
    assert "Use a fresh label; preserve earlier evidence" in duplicate.stderr
    assert sentinel.read_bytes() == b"Retain earlier qualification attempt"
    assert (root / "docs/assets/ligand-designation" / f"{first_label}-recipe.json").read_bytes() \
        == original
    assert load_recipe(root, first_label)["environment"]["PLAYWRIGHT_JSON_OUTPUT_FILE"] \
        != load_recipe(root, second_label)["environment"]["PLAYWRIGHT_JSON_OUTPUT_FILE"]


@pytest.mark.parametrize(("tag", "version"), [
    ("v99.99.99", "11.0.0"), ("9.7.2", "11.0.0"), ("v9.7.2/unsafe", "11.0.0"),
    ("v9.7.2", "11.0"), ("v9.7.2", "next"),
])
def test_invalid_or_missing_tag_and_invalid_version_cannot_create_a_recipe_or_workspace(
    synthetic_repository: tuple[Path, Path, Path], invoke_recipe: Callable[..., Any],
    tag: str, version: str,
) -> None:
    root, _old, _receipt = synthetic_repository
    result, label, workspace = invoke_recipe(tag=tag, version=version)
    assert result.returncode != 0
    assert not workspace.exists()
    assert not (root / "docs/assets/ligand-designation" / f"{label}-recipe.json").exists()


@pytest.mark.parametrize("label", ["Uppercase", "with.dot", "bad_label"])
def test_invalid_label_cannot_write_outside_the_accepted_evidence_naming_contract(
    synthetic_repository: tuple[Path, Path, Path], invoke_recipe: Callable[..., Any], label: str,
) -> None:
    root, _old, _receipt = synthetic_repository
    result, _label, workspace = invoke_recipe(label=label)
    assert result.returncode != 0
    assert not workspace.exists()
    assert not (root / "docs/assets/ligand-designation" / f"{label}-recipe.json").exists()


@pytest.mark.parametrize("option", ["--previous-root", "--previous-receipt"])
def test_missing_extracted_source_or_receipt_is_not_silently_accepted(
    synthetic_repository: tuple[Path, Path, Path], invoke_recipe: Callable[..., Any], option: str,
) -> None:
    root, _old, _receipt = synthetic_repository
    result, label, workspace = invoke_recipe(extra=[option, str(root / "not-present")])
    assert result.returncode != 0
    assert not workspace.exists()
    assert not (root / "docs/assets/ligand-designation" / f"{label}-recipe.json").exists()


def test_source_inventory_freezes_both_released_viewer_tool_families_and_new_ligand_tools(
    synthetic_repository: tuple[Path, Path, Path], monkeypatch: pytest.MonkeyPatch,
) -> None:
    root, _old, _receipt = synthetic_repository
    directories = ("viewer-information", "viewer-measurements", "ligand-designation")
    names = ("qualification.py.txt", "release-recipe.py.txt", "versions.py.txt",
             "production-audit.py.txt", "qualification-summary.py.txt", "release-evidence.py.txt")
    expected = set()
    for directory in directories:
        for name in names:
            relative = f"docs/assets/{directory}/{name}"
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(f"Synthetic source identity: {directory}/{name}\n")
            expected.add(relative)
    git(root, "add", "docs/assets")
    git(root, "-c", "user.name=Recipe unit", "-c", "user.email=recipe@example.invalid",
        "commit", "-q", "-m", "test: source inventory scopes")
    helpers = runpy.run_path(str(SCRIPT.with_name("qualification.py.txt")))
    monkeypatch.chdir(root)
    tagged = helpers["tagged_identities"]("HEAD")
    assert set(tagged) == expected
    assert helpers["current_identities"](root) == tagged
    target = root / "docs/assets/viewer-measurements/qualification-summary.py.txt"
    target.write_text("Changed prior qualification oracle\n")
    assert helpers["current_identities"](root) != tagged
