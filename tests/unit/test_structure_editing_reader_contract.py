from __future__ import annotations

import json
import runpy
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

from tests.support import structure_editing_reader_qualification as reader

CURRENT = "0.33.0"
PREVIOUS = "0.32.0"
COMMIT = "b8ecfdea49610d2d9ab611d4d68d86afc0c277c5"


def receipt() -> dict[str, Any]:
    return {"tag": f"v{PREVIOUS}", "commit": COMMIT, "files": {"file.py": "a" * 64}}


def test_historical_reader_defaults_are_preserved() -> None:
    args = reader.parser().parse_args(
        [
            "run",
            "--current-root",
            "/current",
            "--previous-root",
            "/previous",
            "--previous-receipt",
            "/receipt.json",
            "--python",
            "/python",
            "--workspace",
            "/work",
        ]
    )
    assert args.current_version == "0.32.0"
    assert args.previous_version == "0.31.0"
    assert args.previous_tag == "v0.31.0"
    assert args.previous_commit == reader.PREVIOUS_COMMIT


@pytest.mark.parametrize(
    ("change", "version", "tag", "commit"),
    [
        ({"tag": "v0.31.0"}, PREVIOUS, f"v{PREVIOUS}", COMMIT),
        ({"commit": "c" * 40}, PREVIOUS, f"v{PREVIOUS}", COMMIT),
        ({"files": {}}, PREVIOUS, f"v{PREVIOUS}", COMMIT),
        ({}, "0.32.0-beta", "v0.32.0-beta", COMMIT),
        ({}, PREVIOUS, "v0.31.0", COMMIT),
        ({}, PREVIOUS, f"v{PREVIOUS}", "b8ecfde"),
    ],
)
def test_preceding_identity_cannot_be_relabelled(
    change: dict[str, Any], version: str, tag: str, commit: str
) -> None:
    with pytest.raises(AssertionError):
        reader.verify_previous_receipt({**receipt(), **change}, version, tag, commit)


def test_actual_tag_mismatch_is_rejected_before_any_child(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    args = invocation(tmp_path)
    monkeypatch.setattr(reader.subprocess, "check_output", lambda *_a, **_kw: "c" * 40)
    invoked: list[Any] = []
    monkeypatch.setattr(reader.subprocess, "run", lambda *a, **_kw: invoked.append(a))
    with pytest.raises(AssertionError, match="actual Git tag"):
        reader.run(args)
    assert invoked == []
    assert not args.workspace.exists()


def invocation(tmp_path: Path) -> Any:
    current = tmp_path / "current"
    previous = tmp_path / "previous"
    current.mkdir()
    previous.mkdir()
    previous_receipt = tmp_path / "previous.json"
    previous_receipt.write_text(json.dumps(receipt()))
    return reader.parser().parse_args(
        [
            "run",
            "--current-root",
            str(current),
            "--previous-root",
            str(previous),
            "--previous-receipt",
            str(previous_receipt),
            "--python",
            "/owned/python",
            "--workspace",
            str(tmp_path / "work"),
            "--current-version",
            CURRENT,
            "--previous-version",
            PREVIOUS,
            "--previous-tag",
            f"v{PREVIOUS}",
            "--previous-commit",
            COMMIT,
        ]
    )


def test_all_three_children_receive_the_exact_preceding_identity(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    args = invocation(tmp_path)
    monkeypatch.setattr(reader.subprocess, "check_output", lambda *_a, **_kw: COMMIT)
    commands: list[tuple[list[str], dict[str, Any]]] = []

    def complete(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        commands.append((command, kwargs))
        kwargs["stdout"].write(b"isolated orchestration test\n")
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(reader.subprocess, "run", complete)
    reader.run(args)
    assert [command[4] for command, _ in commands] == ["produce", "consume", "read-reexports"]
    for (command, kwargs), version, root in zip(
        commands,
        (CURRENT, PREVIOUS, CURRENT),
        (args.current_root, args.previous_root, args.current_root),
        strict=True,
    ):
        assert command[command.index("--version") + 1] == version
        assert command[command.index("--previous-version") + 1] == PREVIOUS
        assert command[command.index("--previous-tag") + 1] == f"v{PREVIOUS}"
        assert command[command.index("--previous-commit") + 1] == COMMIT
        assert kwargs["cwd"] == root
        assert all(
            str(root / p) in kwargs["env"]["PYTHONPATH"]
            for p in (
                "apps/api/src",
                "packages/neistra_core/src",
                "packages/neistra_demo_plugin/src",
            )
        )
    summary = json.loads((args.workspace / "summary.json").read_text())
    assert summary["previous_version"] == PREVIOUS
    assert summary["previous_tag"] == f"v{PREVIOUS}"
    assert summary["previous_commit"] == COMMIT
    assert summary["release_qualification"] is True


def test_reexports_reject_another_writer_before_reading_projects(tmp_path: Path) -> None:
    exchange = tmp_path / "exchange"
    output = tmp_path / "output"
    exchange.mkdir()
    output.mkdir()
    (exchange / "expectations.json").write_text('{"cases": []}')
    (output / "reexports.json").write_text('{"writer_version": "0.31.0"}')
    with pytest.raises(AssertionError):
        reader.read_reexports(None, exchange, output, CURRENT, previous_version=PREVIOUS)


def test_issue152_recipe_preserves_the_full_gate_and_actual_reader_contract(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = Path(__file__).resolve().parents[2]
    script = root / "docs/assets/interaction-inspection/release-recipe.py.txt"
    label = f"tooling-{uuid4().hex}"
    out = tmp_path / "docs/assets/interaction-inspection"
    out.mkdir(parents=True)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "argv", [str(script), label, "--current-version", CURRENT])
    monkeypatch.setattr(subprocess, "check_output", lambda *_a, **_kw: COMMIT)
    original_is_dir = Path.is_dir
    monkeypatch.setattr(
        Path,
        "is_dir",
        lambda path: str(path) == "/tmp/neistra152-reader-0320" or original_is_dir(path),
    )
    workspace = Path("/tmp") / f"neistra152-{label}"
    try:
        runpy.run_path(str(script))
        recipe = json.loads((out / f"{label}-recipe.json").read_text())
        assert recipe["application_version"] == CURRENT
        assert recipe["preceding_reader"] == {
            "tag": f"v{PREVIOUS}",
            "version": PREVIOUS,
            "commit": COMMIT,
            "root": "/tmp/neistra152-reader-0320",
        }
        labels = [step["label"] for step in recipe["steps"]]
        assert len(labels) == len(set(labels)) == 35
        assert set(labels[:15]) == {
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
        }
        assert "browser" in labels and "versions" in labels and "production" in labels
        assert "legacy-cli" in labels and labels[-1] == "diff"
        for family in ("rich", "connectivity"):
            for direction in ("forward", "reverse"):
                assert f"{family}-{direction}-produce" in labels
                assert f"{family}-{direction}-read" in labels
        command = next(s["command"] for s in recipe["steps"] if s["label"] == "editing-readers")
        assert command[command.index("--current-version") + 1] == CURRENT
        assert command[command.index("--previous-version") + 1] == PREVIOUS
        assert command[command.index("--previous-tag") + 1] == f"v{PREVIOUS}"
        assert command[command.index("--previous-commit") + 1] == COMMIT
        assert recipe["require_clean"] is True
        assert recipe["environment"]["NEISTRA_PERFORMANCE"] == "0"
        assert recipe["environment"]["NEISTRA_E2E_API_PORT"] == "8230"
        assert recipe["environment"]["NEISTRA_E2E_WORKER_PORT"] == "8231"
        assert recipe["environment"]["NEISTRA_E2E_WEB_PORT"] == "5393"
    finally:
        if workspace.exists():
            shutil.rmtree(workspace)


@pytest.mark.parametrize(
    "name",
    [
        "qualification.py.txt",
        "release-recipe.py.txt",
        "versions.py.txt",
        "production-audit.py.txt",
        "qualification-summary.py.txt",
        "release-evidence.py.txt",
    ],
)
def test_issue152_qualification_tools_compile_without_execution(name: str) -> None:
    root = Path(__file__).resolve().parents[2]
    script = root / "docs/assets/interaction-inspection" / name
    compile(script.read_bytes(), str(script), "exec")
