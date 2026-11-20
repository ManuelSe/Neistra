"""Offline reader-contract corruption controls; no application or process starts."""

from __future__ import annotations

import argparse
import copy
import json
import runpy
import sqlite3
import subprocess
from pathlib import Path
from typing import Any

import pytest

from tests.support import ligand_properties_reader_qualification as reader


@pytest.mark.parametrize("mode", ["run", "editing-run"])
@pytest.mark.parametrize("relative_interpreter", [False, True])
def test_actor_launch_preserves_explicit_virtual_environment_interpreter(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    relative_interpreter: bool,
) -> None:
    current, previous = tmp_path / "current", tmp_path / "previous"
    current.mkdir()
    previous.mkdir()
    interpreter = current / ".venv/bin/python"
    interpreter.parent.mkdir(parents=True)
    base_interpreter = tmp_path / "base-python"
    base_interpreter.write_text("not executed")
    interpreter.symlink_to(base_interpreter)
    monkeypatch.chdir(current)
    supplied_interpreter = interpreter.relative_to(current) if relative_interpreter else interpreter
    monkeypatch.setattr(reader, "verify_predecessor", lambda *args: {"offline_binding": True})
    reports = editing_reports() if mode == "editing-run" else property_reports()
    observed_phases = []

    def capture_actor(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[bytes]:
        phase = command[4]
        selected = previous if phase == "old-write" else current
        assert command[0] == str(interpreter)
        assert command[0] != str(interpreter.resolve())
        assert kwargs["cwd"] == selected
        assert kwargs["env"]["PYTHONPATH"].split(":")[0] == str(selected / "apps/api/src")
        assert kwargs["start_new_session"] is True
        reader.dump(Path(command[command.index("--evidence") + 1]), reports[phase])
        observed_phases.append(phase)
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(subprocess, "run", capture_actor)
    work = tmp_path / "work"
    reader.run(
        argparse.Namespace(
            command=mode,
            current_root=current,
            previous_root=previous,
            previous_receipt=tmp_path / "receipt.json",
            python=supplied_interpreter,
            workspace=work,
            current_version="0.37.0",
            previous_version="0.36.0",
            previous_tag="v0.36.0",
            previous_commit="a" * 40,
        )
    )
    assert observed_phases == list(reader.PHASES)
    summary = reader.load(work / "summary.json")
    assert summary["complete"] and summary["all_actor_reports_verified"]


def store(path: Path, *, pid: int | None = None, token: str | None = None) -> Path:
    path.mkdir()
    with sqlite3.connect(path / "molweave.db") as connection:
        connection.execute("CREATE TABLE alembic_version(version_num TEXT)")
        connection.execute("INSERT INTO alembic_version VALUES ('0017')")
        connection.execute(
            "CREATE TABLE ligand_property_executions(child_pid INTEGER, "
            "child_start_token TEXT, reaped BOOLEAN)"
        )
        connection.execute("INSERT INTO ligand_property_executions VALUES (?, ?, 0)", (pid, token))
    return path


@pytest.mark.parametrize("identity", [("owned-start", 321, "S"), ("owned-start", 321, "R")])
def test_closed_copy_refuses_positive_live_identity(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    identity: tuple[str, int, str],
) -> None:
    source = store(tmp_path / "source", pid=321, token="owned-start")
    monkeypatch.setattr(reader, "process_identity", lambda pid: identity)
    with pytest.raises(AssertionError, match="Never copy a live"):
        reader.closed_copy(source, tmp_path / "copy")
    assert not (tmp_path / "copy").exists()


def test_closed_copy_refuses_unreaped_orphan_group(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = store(tmp_path / "source", pid=321, token="owned-start")
    monkeypatch.setattr(reader, "process_identity", lambda pid: None)
    monkeypatch.setattr(reader, "live_group_members", lambda group: ["322"])
    with pytest.raises(AssertionError, match="orphan process group"):
        reader.closed_copy(source, tmp_path / "copy")


@pytest.mark.parametrize(
    "identity", [None, ("later-unrelated-start", 321, "S"), ("owned-start", 321, "Z")]
)
def test_closed_copy_accepts_only_nonliving_owned_metadata(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    identity: tuple[str, int, str] | None,
) -> None:
    source = store(tmp_path / "source", pid=321, token="owned-start")
    (source / "original.dat").write_bytes(b"preserve original")
    monkeypatch.setattr(reader, "process_identity", lambda pid: identity)
    monkeypatch.setattr(reader, "live_group_members", lambda group: [])
    reader.closed_copy(source, tmp_path / "copy")
    assert (tmp_path / "copy/original.dat").read_bytes() == b"preserve original"
    assert reader.heads(tmp_path / "copy") == ["0017"]


def test_closed_copy_rejects_symlinks_and_overlapping_destination(tmp_path: Path) -> None:
    source = store(tmp_path / "source")
    with pytest.raises(AssertionError):
        reader.closed_copy(source, source / "nested-copy")
    (source / "foreign").symlink_to(tmp_path / "foreign")
    with pytest.raises(AssertionError):
        reader.closed_copy(source, tmp_path / "copy")


def test_ambiguous_database_is_not_selected(tmp_path: Path) -> None:
    source = store(tmp_path / "source")
    (source / "neistra.db").write_bytes(b"ambiguous")
    with pytest.raises(AssertionError, match="unambiguous"):
        reader.database(source)


@pytest.mark.parametrize(
    "row",
    [
        {"job_type": "ligand.properties", "inputs": 1, "results": 0},
        {"job_type": "ligand.properties", "inputs": 0, "results": 1},
    ],
)
def test_private_shell_never_gains_ordinary_relationships(row: dict[str, Any]) -> None:
    with pytest.raises(AssertionError, match="ordinary data"):
        reader.assert_private_shells([row])


def fixture_report(label: str) -> dict[str, Any]:
    known = {"heavy_atom_count": 3, "heteroatom_count": 2, "carbon_count": 1, "formal_charge": 0}
    ethanol = {
        "molecular_weight": 46.069,
        "heavy_atom_count": 3,
        "heteroatom_count": 1,
        "carbon_count": 2,
        "formal_charge": 0,
        "hbd": 1,
        "hba": 1,
        "tpsa": 20.23,
    }
    values = []
    for name, number in ethanol.items():
        unavailable = label == "stale" and name not in known
        values.append(
            {
                "descriptor_id": name,
                "status": "unavailable" if unavailable else "ready",
                "value": None if unavailable else known[name] if label == "stale" else number,
                "reason": "hydrogen_semantics_unavailable" if unavailable else None,
            }
        )
    return {
        "schema_version": 1,
        "input_hash": ("b" if label == "stale" else "a") * 64,
        "implementation_version": "fixture-implementation",
        "library_version": "fixture-library",
        "policy_version": "fixture-policy",
        "created_at": "2026-11-18T00:00:00Z",
        "model_status": "unavailable" if label == "stale" else "qualified",
        "model_reason": "hydrogen_semantics_unavailable" if label == "stale" else None,
        "contains_formally_charged_atoms": False,
        "coverage": list(ethanol),
        "values": values,
    }


@pytest.mark.parametrize("label", ["stale", "completed"])
def test_exact_fixture_chemistry_distinguishes_partial_from_qualified(label: str) -> None:
    report = fixture_report(label)
    result = reader.fixture_property_outcome(report, label, "a" * 64)
    assert result["input_hash"] == report["input_hash"]
    assert "created_at" not in result


@pytest.mark.parametrize(
    "mutation",
    [
        "qualified_stale",
        "wrong_model_reason",
        "wrong_count",
        "unknown_charge",
        "charged_atom",
        "unavailable_number",
        "missing_value_reason",
        "missing_descriptor",
        "duplicate_descriptor",
        "old_hash",
        "missing_origin",
        "invalid_hash",
    ],
)
def test_stale_fixture_oracle_rejects_invented_or_lost_chemistry(mutation: str) -> None:
    report = fixture_report("stale")
    origin: str | None = "a" * 64
    if mutation == "qualified_stale":
        report["model_status"], report["model_reason"] = "qualified", None
    elif mutation == "wrong_model_reason":
        report["model_reason"] = "unrelated_error"
    elif mutation == "wrong_count":
        report["values"][2]["value"] = 1
    elif mutation == "unknown_charge":
        report["values"][4]["value"] = None
    elif mutation == "charged_atom":
        report["contains_formally_charged_atoms"] = True
    elif mutation == "unavailable_number":
        report["values"][0]["value"] = 46.069
    elif mutation == "missing_value_reason":
        report["values"][0]["reason"] = None
    elif mutation == "missing_descriptor":
        report["coverage"].pop()
        report["values"].pop()
    elif mutation == "duplicate_descriptor":
        report["coverage"][-1] = report["coverage"][0]
        report["values"][-1] = copy.deepcopy(report["values"][0])
    elif mutation == "old_hash":
        report["input_hash"] = origin
    elif mutation == "missing_origin":
        origin = None
    elif mutation == "invalid_hash":
        report["input_hash"] = "not-a-scientific-hash"
    with pytest.raises(AssertionError):
        reader.fixture_property_outcome(report, "stale", origin)


def property_reports() -> dict[str, dict[str, Any]]:
    reports: dict[str, dict[str, Any]] = {}
    for phase in reader.PHASES:
        reports[phase] = {
            "protocol": reader.PROTOCOL,
            "phase": phase,
            "suite": "properties",
            "source_unchanged": True,
            "identity": {
                "module_paths": {"actual": "source"},
                "source_files": {"actual.py": "identity"},
            },
            "results": {
                "case_labels": list(reader.CASES),
                "cases": {name: {} for name in reader.CASES},
            },
        }
    produced, old, final = (reports[phase]["results"] for phase in reader.PHASES)
    produced.update(case_stores_isolated=True, all_live_children_reaped_before_actor_exit=True)
    produced["cases"]["started"]["process_facts"] = {
        "actual_spawn_observation": {"observed_alive": True},
        "live_child_after_fixture": False,
    }
    old["same_original_stores"] = True
    final["derived_reconstruction_exact"] = True
    for name in reader.CASES:
        target_id, anchor_id, user_job_id = f"target-{name}", f"anchor-{name}", f"user-{name}"
        report = fixture_report(name)
        origin_hash = "a" * 64 if name == "stale" else None
        semantic = reader.fixture_property_outcome(report, name, origin_hash)
        produced["cases"][name].update(
            target_entry_id=target_id,
            anchor_entry_id=anchor_id,
            target_source={"entry_id": target_id},
            pre_edit_input_hash=origin_hash,
            user_job_id=user_job_id,
        )
        old["cases"][name] = {
            "unknown_0017_migration": {
                "exit": 1,
                "unchanged": True,
                "before": {"sql": "actual"},
                "after": {"sql": "actual"},
            },
            "api_read_save_entry_delete_undo": True,
            "post_delete_archive": {
                "target_id": target_id,
                "anchor_id": anchor_id,
                "before_undo": True,
                "target_absent_during_all_roundtrips": True,
                "original_project_unchanged_during_roundtrips": True,
                "anchor_and_user_jobs_preserved": True,
                "state": {
                    "project": {"entries": [{"id": anchor_id}]},
                    "jobs": [
                        {
                            "id": user_job_id,
                            "job_type": "molweave.demo.structure_statistics",
                            "input_entry_ids": [anchor_id],
                            "results": 1,
                        }
                    ],
                },
                "both_suffixes": [
                    {
                        "suffix": suffix,
                        "canonical_originals_exact": True,
                        "ordinary_private_inputs_results_absent": True,
                    }
                    for suffix in reader.SUFFIXES
                ],
            },
            "both_suffixes": [{"suffix": suffix} for suffix in reader.SUFFIXES],
        }
        final["cases"][name] = {
            "fresh_binding": {"entry_id": target_id},
            "property_report": copy.deepcopy(report),
            "semantic_outcome": copy.deepcopy(semantic),
            "current_input_hash": report["input_hash"],
            "canonical_history_originals_user_outputs_retained": True,
            "old_insert_defaults_to_user": True,
            "post_delete_archive_rechecked": [
                {
                    "suffix": suffix,
                    "target_absent": True,
                    "anchor_canonical_and_original_exact": True,
                    "imported_jobs_ordinary": True,
                    "no_imported_executable_state": True,
                    "missing_target_http": 404,
                    "no_property_work_created": True,
                }
                for suffix in reader.SUFFIXES
            ],
            "both_suffixes_reconstructed": [
                {
                    "suffix": suffix,
                    "fresh_binding": {"entry_id": f"remapped-{name}-{suffix}"},
                    "requested_source": {"entry_id": f"remapped-{name}-{suffix}"},
                    "property_report": copy.deepcopy(report),
                    "semantic_outcome": copy.deepcopy(semantic),
                    "input_hash": report["input_hash"],
                    "imported_jobs_ordinary": True,
                    "captured_ids_grant_no_authority": True,
                }
                for suffix in reader.SUFFIXES
            ],
        }
    old["cases"]["project-deleted"]["original_project_intentionally_deleted"] = True
    final["cases"]["project-deleted"].update(
        intentional_project_deletion=True,
        capture_reaped=True,
        originals_and_user_output_files_preserved=True,
    )
    final["cases"]["started"]["failed_recovery_guard"] = {
        "explicit_failure": True,
        "capture_retained": True,
        "process_not_signalled": True,
    }
    return reports


def test_full_private_reader_contract_accepts_complete_results() -> None:
    reader.validate_reports(property_reports(), "properties")


@pytest.mark.parametrize(
    "mutation",
    [
        "missing_report",
        "foreign_source",
        "old_hash",
        "archive_method_change",
        "archive_source_change",
        "archive_outcome_change",
    ],
)
def test_actor_reports_reject_lost_or_inconsistent_scientific_reconstruction(mutation: str) -> None:
    reports = property_reports()
    stale = reports["reopen-current"]["results"]["cases"]["stale"]
    archived = stale["both_suffixes_reconstructed"][0]
    if mutation == "missing_report":
        stale.pop("property_report")
    elif mutation == "foreign_source":
        stale["fresh_binding"]["entry_id"] = "foreign"
    elif mutation == "old_hash":
        stale["property_report"]["input_hash"] = "a" * 64
    elif mutation == "archive_method_change":
        archived["property_report"]["library_version"] = "different"
        archived["semantic_outcome"]["library_version"] = "different"
    elif mutation == "archive_source_change":
        archived["fresh_binding"]["entry_id"] = "foreign"
    elif mutation == "archive_outcome_change":
        archived["property_report"]["values"][0]["value"] = 46.069
    with pytest.raises((AssertionError, KeyError)):
        reader.validate_reports(reports, "properties")


@pytest.mark.parametrize(
    "mutation",
    [
        "missing_phase",
        "changed_source",
        "empty_identity",
        "wrong_protocol",
        "missing_case",
        "invented_running",
        "still_alive",
        "copied_live_store",
        "migration_succeeded",
        "migration_mutated",
        "missing_suffix",
        "duplicate_old_suffix",
        "duplicate_reconstructed_suffix",
        "missing_original_retention",
        "forged_authority",
        "old_insert_not_user",
        "recovery_not_explicit",
        "capture_dropped",
        "foreign_signal",
    ],
)
def test_private_contract_rejects_incomplete_or_false_evidence(mutation: str) -> None:
    reports = property_reports()
    produced, old, final = (reports[phase]["results"] for phase in reader.PHASES)
    if mutation == "missing_phase":
        del reports["old-write"]
    elif mutation == "changed_source":
        reports["old-write"]["source_unchanged"] = False
    elif mutation == "empty_identity":
        reports["old-write"]["identity"]["module_paths"] = {}
    elif mutation == "wrong_protocol":
        reports["old-write"]["protocol"] = "schema-boundary-v1"
    elif mutation == "missing_case":
        del produced["cases"]["stale"]
    elif mutation == "invented_running":
        produced["cases"]["started"]["process_facts"]["actual_spawn_observation"][
            "observed_alive"
        ] = False
    elif mutation == "still_alive":
        produced["cases"]["started"]["process_facts"]["live_child_after_fixture"] = True
    elif mutation == "copied_live_store":
        old["same_original_stores"] = False
    elif mutation == "migration_succeeded":
        old["cases"]["pending"]["unknown_0017_migration"]["exit"] = 0
    elif mutation == "migration_mutated":
        old["cases"]["pending"]["unknown_0017_migration"]["after"] = {"sql": "changed"}
    elif mutation == "missing_suffix":
        old["cases"]["pending"]["both_suffixes"].pop()
    elif mutation == "duplicate_old_suffix":
        old["cases"]["pending"]["both_suffixes"].append({"suffix": "neistra"})
    elif mutation == "duplicate_reconstructed_suffix":
        final["cases"]["pending"]["both_suffixes_reconstructed"].append(
            copy.deepcopy(final["cases"]["pending"]["both_suffixes_reconstructed"][0])
        )
    elif mutation == "missing_original_retention":
        final["cases"]["stale"]["canonical_history_originals_user_outputs_retained"] = False
    elif mutation == "forged_authority":
        final["cases"]["forged"]["both_suffixes_reconstructed"][0][
            "captured_ids_grant_no_authority"
        ] = False
    elif mutation == "old_insert_not_user":
        final["cases"]["completed"]["old_insert_defaults_to_user"] = False
    elif mutation == "recovery_not_explicit":
        final["cases"]["started"]["failed_recovery_guard"]["explicit_failure"] = False
    elif mutation == "capture_dropped":
        final["cases"]["started"]["failed_recovery_guard"]["capture_retained"] = False
    else:
        final["cases"]["started"]["failed_recovery_guard"]["process_not_signalled"] = False
    with pytest.raises((AssertionError, KeyError)):
        reader.validate_reports(reports, "properties")


def test_all_actor_cli_entrypoints_require_predecessor_authorization() -> None:
    with pytest.raises(SystemExit):
        reader.parser().parse_args(
            [
                "actor",
                "worker-once",
                "--suite",
                "properties",
                "--root",
                "/source",
                "--workspace",
                "/owned",
                "--evidence",
                "/owned/report",
                "--expected-version",
                "0.37.0",
            ]
        )


@pytest.mark.parametrize("kind", ["commit", "blob"])
def test_predecessor_lightweight_or_non_tag_is_refused_before_actor_imports(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    kind: str,
) -> None:
    monkeypatch.setattr(subprocess, "check_output", lambda *args, **kwargs: kind)
    with pytest.raises(AssertionError, match="annotated"):
        reader.verify_predecessor(
            tmp_path, tmp_path, tmp_path / "missing", "0.36.0", "v0.36.0", "a" * 40
        )


@pytest.mark.parametrize("tag, version", [("v0.35.0", "0.36.0"), ("candidate", "0.36.0")])
def test_version_tag_mismatch_is_refused(tmp_path: Path, tag: str, version: str) -> None:
    with pytest.raises(AssertionError):
        reader.verify_predecessor(tmp_path, tmp_path, tmp_path / "missing", version, tag, "a" * 40)


def test_environment_removes_all_foreign_database_and_optimization_settings(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for key in (
        "NEISTRA_DATA_DIR",
        "MOLWEAVE_DATA_DIR",
        "MOLWEAVE_DATABASE_URL",
        "NEISTRA_DATABASE_URL",
        "DATABASE_URL",
        "PYTHONOPTIMIZE",
    ):
        monkeypatch.setenv(key, "foreign")
    env = reader.environment(tmp_path, tmp_path / "owned")
    assert env["NEISTRA_DATA_DIR"] == str(tmp_path / "owned")
    assert env["NEISTRA_DATABASE_URL"] == f"sqlite:///{tmp_path / 'owned/molweave.db'}"
    assert (
        not {"MOLWEAVE_DATA_DIR", "MOLWEAVE_DATABASE_URL", "DATABASE_URL", "PYTHONOPTIMIZE"}
        & env.keys()
    )


def test_reports_are_json_finite_and_deep_mutations_do_not_touch_other_cases(
    tmp_path: Path,
) -> None:
    original = property_reports()
    copied = copy.deepcopy(original)
    copied["old-write"]["results"]["cases"]["pending"]["api_read_save_entry_delete_undo"] = False
    reader.validate_reports(original, "properties")
    with pytest.raises(AssertionError):
        reader.validate_reports(copied, "properties")
    with pytest.raises(ValueError):
        reader.dump(tmp_path / "report.json", {"value": float("nan")})
    reader.dump(tmp_path / "valid.json", original)
    assert json.loads((tmp_path / "valid.json").read_bytes()) == original


@pytest.mark.parametrize(
    "mutation",
    [
        "none",
        "wrong_commit",
        "wrong_tag",
        "missing_file",
        "different_tag_inventory",
        "different_extracted_bytes",
        "not_ancestor",
    ],
)
def test_predecessor_receipt_binds_tag_inventory_and_actual_extracted_bytes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mutation: str,
) -> None:
    current, previous = tmp_path / "current", tmp_path / "previous"
    current.mkdir()
    previous.mkdir()
    monkeypatch.chdir(current)
    expected = {"apps/api/src/actual.py": "actual-qualified-digest"}
    record = {"commit": "a" * 40, "tag": "v0.36.0", "files": dict(expected)}
    if mutation == "wrong_commit":
        record["commit"] = "b" * 40
    elif mutation == "wrong_tag":
        record["tag"] = "v0.35.0"
    elif mutation == "missing_file":
        record["files"] = {}
    elif mutation == "different_tag_inventory":
        record["files"] = {"foreign.py": "other"}
    receipt = tmp_path / "receipt.json"
    reader.dump(receipt, record)

    def git_read(command: list[str], **kwargs: Any) -> str:
        return "tag\n" if command[1] == "cat-file" else "a" * 40 + "\n"

    monkeypatch.setattr(subprocess, "check_output", git_read)

    def ancestry(command: list[str], **kwargs: Any) -> None:
        if mutation == "not_ancestor":
            raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(subprocess, "run", ancestry)
    extracted = (
        {"apps/api/src/actual.py": "changed"}
        if mutation == "different_extracted_bytes"
        else expected
    )
    monkeypatch.setattr(
        runpy,
        "run_path",
        lambda path: {
            "tagged_identities": lambda tag: expected,
            "extracted_identities": lambda root, files: extracted,
        },
    )
    if mutation == "none":
        result = reader.verify_predecessor(
            current, previous, receipt, "0.36.0", "v0.36.0", "a" * 40
        )
        assert result["annotated_tag"] and result["files"] == 1
        assert result["receipt_sha256"] == reader.digest(receipt.read_bytes())
    else:
        with pytest.raises((AssertionError, subprocess.CalledProcessError)):
            reader.verify_predecessor(current, previous, receipt, "0.36.0", "v0.36.0", "a" * 40)


def editing_reports() -> dict[str, dict[str, Any]]:
    contracts = runpy.run_path(str(reader.HERE.with_name("schema_boundary_evidence.py")))
    producer = {"cases": 15, "transitions": 24, "case_labels": contracts["EDITING_CASES"]}
    designation = {"cases": 5, "archives": 10, "case_labels": contracts["DESIGNATION_CASES"]}
    control = {
        "cases": 15,
        "case_labels": contracts["EDITING_CASES"],
        "archive_reads": 30,
        "archive_history_omission": True,
        "retained_history": True,
        "allocator_probe": {"reused": False, "first_id": 7, "after_undo_branch_id": 8},
        "deep_oracle_negative_controls": [
            "unknown_charge",
            "inactive_coordinates",
            "protection",
            "warnings",
            "allocator",
            "authored_exclusions",
        ],
        "corruption": [
            {"kind": kind, "suffix": suffix, "status": 422, "no_publication": True}
            for kind in ("payload", "manifest_hash", "schema")
            for suffix in (".neistra.zip", ".molweave.zip")
        ],
        "stale_guards": [
            {"kind": "revision", "status": 409, "no_publication": True},
            {"kind": "artifact", "status": 422, "no_publication": True},
        ],
    }
    reopened = {
        "retained_editing_cases": 15,
        "retained_designation_cases": 5,
        "archive_reads": 40,
        "reexport_reimports": 40,
        "designation_exact_provenance_membership_and_remaps": True,
    }
    reports = {
        phase: {
            "protocol": reader.PROTOCOL,
            "phase": phase,
            "suite": "editing",
            "source_unchanged": True,
            "identity": {
                "module_paths": {"actual": "source"},
                "source_files": {"actual.py": "identity"},
            },
            "results": {},
        }
        for phase in reader.PHASES
    }
    reports["produce-current"]["results"] = {
        "editing": producer,
        "designation": designation,
        "database_heads": ["0017"],
    }
    reports["old-write"]["results"] = {
        "editing": copy.deepcopy(producer),
        "designation": copy.deepcopy(designation),
        "current_retention": control,
        "current_reopen": reopened,
        "database_heads": ["0016"],
        "retained_database_heads": ["0017"],
    }
    reports["reopen-current"]["results"] = {
        "previous_retention": copy.deepcopy(control),
        "previous_reopen": copy.deepcopy(reopened),
        "current_reopen": copy.deepcopy(reopened),
        "database_heads": ["0017"],
        "previous_reexports": {"current_reads": 60, "current_reexport_reimports": 60},
    }
    return reports


def test_same_schema_editing_contract_requires_all_existing_responsibilities() -> None:
    reader.validate_reports(editing_reports(), "editing")


@pytest.mark.parametrize(
    "mutation",
    [
        "current_cases",
        "old_transitions",
        "old_designation",
        "wrong_old_head",
        "missing_corruption",
        "stale_publication",
        "dropped_history",
        "missing_reopen",
        "missing_reverse_read",
    ],
)
def test_editing_contract_rejects_lost_or_mislabelled_responsibilities(mutation: str) -> None:
    reports = editing_reports()
    produced, old, final = (reports[phase]["results"] for phase in reader.PHASES)
    if mutation == "current_cases":
        produced["editing"]["cases"] = 14
    elif mutation == "old_transitions":
        old["editing"]["transitions"] = 23
    elif mutation == "old_designation":
        old["designation"]["cases"] = 4
    elif mutation == "wrong_old_head":
        old["database_heads"] = ["0017"]
    elif mutation == "missing_corruption":
        old["current_retention"]["corruption"].pop()
    elif mutation == "stale_publication":
        final["previous_retention"]["stale_guards"][0]["no_publication"] = False
    elif mutation == "dropped_history":
        old["current_retention"]["retained_history"] = False
    elif mutation == "missing_reopen":
        final["current_reopen"]["retained_designation_cases"] = 4
    else:
        final["previous_reexports"]["current_reads"] = 59
    with pytest.raises(AssertionError):
        reader.validate_reports(reports, "editing")


@pytest.mark.parametrize(
    "mutation",
    [
        "missing_proof",
        "after_undo",
        "target_restored",
        "anchor_is_target",
        "ordinary_dangling_target",
        "missing_suffix",
        "missing_reopen_proof",
        "target_values_published",
    ],
)
def test_private_contract_requires_post_delete_archives_before_undo(mutation: str) -> None:
    reports = property_reports()
    produced, old, final = (reports[phase]["results"] for phase in reader.PHASES)
    evidence = old["cases"]["captured"]["post_delete_archive"]
    if mutation == "missing_proof":
        del old["cases"]["captured"]["post_delete_archive"]
    elif mutation == "after_undo":
        evidence["before_undo"] = False
    elif mutation == "target_restored":
        evidence["state"]["project"]["entries"].append({"id": "target-captured"})
    elif mutation == "anchor_is_target":
        produced["cases"]["captured"]["anchor_entry_id"] = "target-captured"
    elif mutation == "ordinary_dangling_target":
        evidence["state"]["jobs"][0]["input_entry_ids"] = ["target-captured"]
    elif mutation == "missing_suffix":
        evidence["both_suffixes"].pop()
    elif mutation == "missing_reopen_proof":
        del final["cases"]["captured"]["post_delete_archive_rechecked"]
    else:
        final["cases"]["captured"]["post_delete_archive_rechecked"][0]["missing_target_http"] = 200
    with pytest.raises((AssertionError, KeyError)):
        reader.validate_reports(reports, "properties")


def deleted_fixture() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    case = {
        "project_id": "project",
        "target_entry_id": "target",
        "anchor_entry_id": "anchor",
        "user_job_id": "user",
    }
    deleted = {"id": "project", "revision": 2, "entries": [{"id": "anchor"}]}
    state = {
        "project": copy.deepcopy(deleted),
        "jobs": [
            {
                "id": "user",
                "job_type": "molweave.demo.structure_statistics",
                "input_entry_ids": ["anchor"],
                "results": 1,
            }
        ],
    }
    return case, deleted, state


def test_post_delete_archive_control_observes_absence_around_roundtrip_call(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    case, deleted, state = deleted_fixture()
    events = []

    def observe(client: Any, project_id: str) -> dict[str, Any]:
        events.append("observe")
        return copy.deepcopy(state)

    def archive(
        client: Any, project: dict[str, Any], output: Path, version: str
    ) -> list[dict[str, Any]]:
        assert project == deleted
        events.append("export-import-reexport")
        return [{"suffix": suffix} for suffix in reader.SUFFIXES]

    monkeypatch.setattr(reader, "project_state", observe)
    monkeypatch.setattr(reader, "archive_roundtrip", archive)
    result = reader.post_delete_archive_control(
        None, case, deleted, tmp_path / "archives", "0.36.0"
    )
    assert events == ["observe", "export-import-reexport", "observe"]
    assert result["before_undo"] and result["target_absent_during_all_roundtrips"]
    assert result["target_id"] != result["anchor_id"]


@pytest.mark.parametrize(
    "mutation", ["already_undone", "ordinary_target_input", "restored_during_roundtrip"]
)
def test_post_delete_archive_control_rejects_invalid_order_or_fixture(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mutation: str,
) -> None:
    case, deleted, state = deleted_fixture()
    if mutation == "already_undone":
        state["project"]["entries"].append({"id": "target"})
    elif mutation == "ordinary_target_input":
        state["jobs"][0]["input_entry_ids"] = ["target"]

    def archive(
        client: Any, project: dict[str, Any], output: Path, version: str
    ) -> list[dict[str, Any]]:
        assert mutation == "restored_during_roundtrip", "Invalid fixture reached export"
        state["project"]["entries"].append({"id": "target"})
        return [{"suffix": suffix} for suffix in reader.SUFFIXES]

    monkeypatch.setattr(reader, "project_state", lambda *args: copy.deepcopy(state))
    monkeypatch.setattr(reader, "archive_roundtrip", archive)
    with pytest.raises(AssertionError):
        reader.post_delete_archive_control(None, case, deleted, tmp_path / "archives", "0.36.0")


def test_descriptor_source_uses_recorded_target_uuid_and_never_the_anchor_fallback() -> None:
    project = {
        "entries": [
            {
                "id": "anchor",
                "current_artifact_id": "anchor-source",
                "ligand_designation": {
                    "status": "resolved",
                    "instance_id": "anchor-instance",
                    "atom_ids": [1, 2, 3],
                },
            },
            {
                "id": "target",
                "current_artifact_id": "target-source",
                "ligand_designation": {
                    "status": "resolved",
                    "instance_id": "target-instance",
                    "atom_ids": [1, 2, 3],
                },
            },
        ]
    }
    assert reader.source(project, "target")["source_artifact_id"] == "target-source"
    project["entries"].pop()
    with pytest.raises(AssertionError, match="exact fixture target"):
        reader.source(project, "target")
