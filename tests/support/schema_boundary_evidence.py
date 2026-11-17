"""Strict receipt contracts for the first project-schema boundary qualification."""

from __future__ import annotations

from typing import Any

EDITING_CASES = [
    f"fragment-{fragment}-{mode}"
    for fragment in ("cyclopropyl", "cyclobutyl", "cyclopentyl", "cyclohexyl", "methoxy")
    for mode in ("heavy", "H")
] + ["cut-mutation", "torsion", "aromatic-partial", "aromatic-ring", "attached-h-appearance"]
DESIGNATION_CASES = [
    "designation-automatic", "designation-manual", "designation-cleared",
    "designation-stale", "designation-default",
]


def archive_refusal(report: dict[str, Any], *, pairs: int) -> None:
    assert type(pairs) is int and pairs > 0
    assert report["before"] == report["after"]
    assert report["archive_pairs"] == pairs and report["both_suffixes"] is True
    rows = report["archive_refusals"]
    assert len(rows) == pairs * 2
    specimens: dict[str, set[str]] = {}
    probes: set[tuple[str, str]] = set()
    for row in rows:
        assert row["http"] == 422 and row["code"] == "unsupported_archive_schema"
        assert row["unchanged"] is True
        assert row["logical_sha256"] == report["before"]["logical_sha256"]
        assert row["files_sha256"] == report["before"]["files_sha256"]
        probe = row["path"], row["suffix"]
        assert probe not in probes
        probes.add(probe)
        specimens.setdefault(row["sha256"], set()).add(row["suffix"])
    assert len(specimens) == pairs
    assert all(suffixes == {"neistra", "molweave"} for suffixes in specimens.values())


def store_refusal(report: dict[str, Any], *, operations: bool) -> None:
    assert report["unchanged"] is True and report["before"] == report["after"]
    assert report["database_heads"] == ["0016"]
    if operations:
        rows = report["operations"]
        assert report["refusals"] == len(rows) == 6
        assert [row["operation"] for row in rows] == [
            "migration", "read", "save", "archive", "undo", "redo",
        ]
        for row in rows:
            assert row["unchanged"] is True
            assert row["code"] == (
                "unknown_revision_0016" if row["operation"] == "migration"
                else "missing_projects_table"
            )
    else:
        assert report["refusals"] == 2
        assert report["migration"]["code"] == "unknown_revision_0016"
        assert report["api"]["code"] == "missing_projects_table"


def editing_controls(report: dict[str, Any], *, retained_history: bool) -> None:
    assert report["cases"] == 15 and report["case_labels"] == EDITING_CASES
    assert report["archive_reads"] == 30 and report["archive_history_omission"] is True
    assert report["retained_history"] is retained_history
    assert report["allocator_probe"]["reused"] is False
    assert report["allocator_probe"]["after_undo_branch_id"] > report["allocator_probe"]["first_id"]
    assert len(report["deep_oracle_negative_controls"]) == 6
    assert set(report["deep_oracle_negative_controls"]) == {
        "unknown_charge", "inactive_coordinates", "protection", "warnings", "allocator",
        "authored_exclusions",
    }
    corrupt = report["corruption"]
    assert len(corrupt) == 6
    assert {(row["kind"], row["suffix"]) for row in corrupt} == {
        (kind, suffix) for kind in ("payload", "manifest_hash", "schema")
        for suffix in (".neistra.zip", ".molweave.zip")
    }
    assert all(row["status"] == 422 and row["no_publication"] is True for row in corrupt)
    stale = report["stale_guards"]
    assert len(stale) == 2
    assert {(row["kind"], row["status"]) for row in stale} == {("revision", 409), ("artifact", 422)}
    assert all(row["no_publication"] is True for row in stale)


def editing_boundary(reports: dict[str, dict[str, Any]]) -> None:
    assert set(reports) == {
        "produce-current", "refuse-current-produce-previous", "read-previous-reopen-current",
    }
    produced = reports["produce-current"]
    previous = reports["refuse-current-produce-previous"]
    final = reports["read-previous-reopen-current"]
    for report in reports.values():
        assert report["protocol"] == "schema-boundary-v1"
    assert produced["database_heads_before"] == previous["database_heads_before"] == []
    assert produced["database_heads"] == final["database_heads"] == ["0016"]
    assert previous["database_heads"] == final["database_heads_before"] == ["0015"]
    for report in (produced, previous):
        editing = report["editing"]
        assert editing["cases"] == 15 and editing["transitions"] == 24
        assert editing["archives"] == 30 and editing["case_labels"] == EDITING_CASES
    assert produced["designation"] == {
        "archives": 10, "cases": 5, "case_labels": DESIGNATION_CASES,
    }
    editing_controls(produced["controls"], retained_history=False)
    editing_controls(previous["controls"], retained_history=True)
    store_refusal(previous["current_store_refusal"], operations=False)
    archive_refusal(previous["current_archive_refusal"], pairs=20)
    editing_controls(final["previous_retention"], retained_history=True)
    assert final["previous_reexports"] == {
        "current_reads": 60, "current_reexport_reimports": 60,
        "current_writer_archives": 30, "previous_authored_cases": 15,
    }
    assert final["previous_control_retention"] == {
        "exact_defaults_before_replay": True, "retained_allocator_history": True,
        "retained_imported_projects": 30,
    }
    assert final["current_reopen"] == {
        "archive_reads": 40, "designation_exact_provenance_membership_and_remaps": True,
        "reexport_reimports": 40, "retained_designation_cases": 5,
        "retained_editing_cases": 15,
    }


def ordered_measurements(
    report: dict[str, Any], *, mode: str, schema_boundary: bool,
) -> None:
    """Require the ordered-state oracle independently of schema refusal receipts."""
    assert mode in {"produce", "read"}
    controls = {"ordered_targets", "visibility", "full_name"}
    assert report["exact_migrated_designation_defaults"] is schema_boundary
    if mode == "produce":
        assert schema_boundary is False
        assert report["ordered_cross_entry_records"] == 3
        assert len(report["archive_sha256"]) == 64
        assert set(report["negative_controls_rejected"]) == controls
        assert len(report["negative_controls_rejected"]) == 3
        return
    assert report["live_store_all_records_exact"] is True
    assert report["last_update_undo_redo_content_exact_modified_time_monotonic"] is True
    assert report["archive_history_contract"] == "Current-state snapshots omit live command history"
    rows = report["both_suffixes_import_and_reexport"]
    assert len(rows) == 4
    assert {(row["origin"], row["suffix"]) for row in rows} == {
        (origin, suffix) for origin in ("producer", "reader")
        for suffix in ("neistra", "molweave")
    }
    for row in rows:
        assert row["http"] == 201
        assert row["all_records_order_names_visibility_sources_exact"] is True
        assert set(row["negative_controls_rejected"]) == controls
        assert len(row["negative_controls_rejected"]) == 3
