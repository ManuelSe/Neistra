from __future__ import annotations

import json
import subprocess
from copy import deepcopy
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from neistra_core.ligands.models import LigandDesignationV1

from tests.support import structure_editing_reader_qualification as reader
from tests.unit.test_structure_editing_reader_contract import COMMIT, invocation


def snapshot() -> dict[str, Any]:
    designation = LigandDesignationV1(
        status="resolved",
        source_artifact_id="old-artifact",
        instance_id=str(uuid4()),
        atom_ids=[4, 5, 6],
        origin="manual",
        selected_at="2026-11-16T12:00:00Z",
        assessed_at="2026-11-16T12:00:00Z",
        assessed_revision=42,
        resolver_version="test-policy",
    ).model_dump(mode="json")
    return {
        "ligand_designations": {"repeated": designation},
        "ids": {"repeated": {"current_artifact_id": "old-artifact"}},
    }


def test_boundary_uses_three_isolated_actual_source_phases(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    args = invocation(tmp_path)
    args.schema_boundary = True
    monkeypatch.setattr(subprocess, "check_output", lambda *_a, **_kw: COMMIT)
    commands = []

    def complete(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        commands.append((command, kwargs))
        kwargs["stdout"].write(b"isolated schema-boundary orchestration\n")
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(subprocess, "run", complete)
    reader.run(args)
    modes = ["produce-current", "refuse-current-produce-previous", "read-previous-reopen-current"]
    assert [command[4] for command, _ in commands] == modes
    for (command, kwargs), root in zip(
        commands, (args.current_root, args.previous_root, args.current_root), strict=True
    ):
        assert kwargs["cwd"] == root
        assert kwargs["env"]["PYTHONPATH"].split(":") == [
            str(root / path)
            for path in (
                "apps/api/src",
                "packages/neistra_core/src",
                "packages/neistra_demo_plugin/src",
                ".",
            )
        ]
        assert "--previous-tag" in command and "--previous-commit" in command
    old = commands[1][0]
    assert old[old.index("--refusal-data") + 1].endswith("previous-refused")
    assert old[old.index("--output") + 1].endswith("previous-exchange")
    assert "--receipt" in old and "--receipt" not in commands[0][0]
    current = commands[2][0]
    assert current[current.index("--reopen-data") + 1].endswith("current-produced")
    result = json.loads((args.workspace / "summary.json").read_text())
    assert result["protocol"] == "schema-boundary-v1"
    assert not any("retained current-authored seeds" in item for item in result["limitations"])


def test_import_remaps_only_current_artifact_and_independent_intent_uuid() -> None:
    expected = snapshot()
    actual = deepcopy(expected)
    actual["ids"]["repeated"]["current_artifact_id"] = "new-artifact"
    actual["ligand_designations"]["repeated"].update(
        source_artifact_id="new-artifact", instance_id=str(uuid4())
    )
    reader.assert_designations(actual, expected, retained=False)
    with pytest.raises(AssertionError):
        reader.assert_designations(actual, expected, retained=True)
    assert expected["ligand_designations"]["repeated"]["source_artifact_id"] == "old-artifact"


@pytest.mark.parametrize(
    "field,value",
    [
        ("instance_id", None),
        ("source_artifact_id", "unrelated"),
        ("atom_ids", [1, 2, 3]),
        ("origin", "automatic_single_candidate"),
        ("assessed_revision", 0),
        ("assessed_at", None),
        ("selected_at", None),
        ("resolver_version", "other"),
        ("status", "stale"),
        ("reason_code", "lost_anchors"),
    ],
)
def test_import_oracle_rejects_loss_of_exact_intent(field: str, value: Any) -> None:
    expected = snapshot()
    actual = deepcopy(expected)
    actual["ids"]["repeated"]["current_artifact_id"] = "new-artifact"
    actual["ligand_designations"]["repeated"].update(
        source_artifact_id="new-artifact", instance_id=str(uuid4())
    )
    actual["ligand_designations"]["repeated"][field] = value
    with pytest.raises((AssertionError, TypeError)):
        reader.assert_designations(actual, expected, retained=False)


def test_import_oracle_requires_new_uuid_and_keeps_stale_old_anchors() -> None:
    expected = snapshot()
    expected["ligand_designations"]["repeated"].update(
        status="stale", atom_ids=[99999], reason_code="lost_anchors"
    )
    with pytest.raises(AssertionError, match="independent imported intent"):
        reader.assert_designations(expected, expected, retained=False)
    actual = deepcopy(expected)
    actual["ligand_designations"]["repeated"]["instance_id"] = str(uuid4())
    reader.assert_designations(actual, expected, retained=False)


def test_defaults_are_exact_and_preserve_preceding_entry_fields() -> None:
    value = {
        "entries": {"a": {"user_metadata": {"ligand_designation": "user data"}}},
        "ligand_designations": {"a": LigandDesignationV1().model_dump(mode="json")},
    }
    reader._default_designations(value)
    value["ligand_designations"]["a"]["reason_code"] = "automatically_enriched"
    with pytest.raises(AssertionError, match="exact unresolved defaults"):
        reader._default_designations(value)


def old_history() -> list[dict[str, Any]]:
    return [
        {
            "id": "command",
            "forward_actions": [
                {
                    "kind": "entry.create",
                    "entry": {
                        "name": "seed",
                        "user_metadata": {"ligand_designation": "preceding user-owned data"},
                    },
                },
                {"kind": "entry.molecule", "current_artifact_id": "exact-bytes"},
            ],
            "inverse_actions": [
                {
                    "kind": "entry.metadata",
                    "values": {"user_metadata": {"ligand_designation": "also user data"}},
                }
            ],
        }
    ]


def test_history_projection_accepts_only_added_typed_fields_without_mutation() -> None:
    expected = old_history()
    actual = deepcopy(expected)
    actual[0]["forward_actions"][0]["entry"]["ligand_designation"] = {"status": "unresolved"}
    actual[0]["forward_actions"][0]["ligand_default_pending"] = True
    actual[0]["forward_actions"][1]["ligand_designation"] = {"status": "resolved"}
    original = deepcopy(actual)
    reader._assert_preceding_history(actual, expected)
    assert actual == original


@pytest.mark.parametrize("change", ["metadata", "artifact", "row", "unknown"])
def test_history_projection_rejects_preceding_data_loss(change: str) -> None:
    expected = old_history()
    actual = deepcopy(expected)
    if change == "metadata":
        del actual[0]["forward_actions"][0]["entry"]["user_metadata"]["ligand_designation"]
    elif change == "artifact":
        actual[0]["forward_actions"][1]["current_artifact_id"] = "other"
    elif change == "row":
        actual[0]["id"] = "changed-command"
    else:
        actual[0]["forward_actions"][1]["new_unapproved_field"] = "cannot silently strip"
    with pytest.raises(AssertionError):
        reader._assert_preceding_history(actual, expected)


def test_refusal_helper_is_stdlib_and_loaded_without_current_application_imports() -> None:
    helper = reader.boundary_helper()
    assert callable(helper["snapshot"]) and callable(helper["refuse_archives"])
    source = Path(helper["__file__"]).read_text()
    compile(source, helper["__file__"], "exec")
    assert "import neistra_" not in source and "from neistra_" not in source
