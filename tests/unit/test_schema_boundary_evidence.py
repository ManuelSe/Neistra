"""Adversarial checks of receipt acceptance, independent of any reader implementation."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest

from tests.support.schema_boundary_evidence import (
    archive_refusal,
    editing_boundary,
    editing_controls,
    store_refusal,
)

EDITING_LABELS = [
    f"fragment-{fragment}-{mode}"
    for fragment in ("cyclopropyl", "cyclobutyl", "cyclopentyl", "cyclohexyl", "methoxy")
    for mode in ("heavy", "H")
] + ["cut-mutation", "torsion", "aromatic-partial", "aromatic-ring", "attached-h-appearance"]
PRODUCE = "produce-current"
PREVIOUS = "refuse-current-produce-previous"
REOPEN = "read-previous-reopen-current"


def archive_receipt(pairs: int = 2) -> dict[str, Any]:
    snapshot = {"logical_sha256": "a" * 64, "files_sha256": "b" * 64,
                "retained_rows": {"history": 200}, "retained_files": ["original.mol"]}
    return {
        "before": snapshot, "after": deepcopy(snapshot), "archive_pairs": pairs,
        "both_suffixes": True,
        "archive_refusals": [
            {"path": f"specimen-{index}.zip", "sha256": f"{index:064x}", "suffix": suffix,
             "http": 422, "code": "unsupported_archive_schema", "unchanged": True,
             "logical_sha256": snapshot["logical_sha256"],
             "files_sha256": snapshot["files_sha256"]}
            for index in range(pairs) for suffix in ("neistra", "molweave")
        ],
    }


def store_receipt(*, operations: bool) -> dict[str, Any]:
    snapshot = {"history": ["old-command", "redo-command"], "files": {"original": "retained"}}
    report: dict[str, Any] = {
        "before": snapshot, "after": deepcopy(snapshot), "unchanged": True,
        "database_heads": ["0016"], "refusals": 6 if operations else 2,
    }
    if operations:
        report["operations"] = [
            {"operation": operation, "unchanged": True,
             "code": "unknown_revision_0016" if operation == "migration"
             else "missing_projects_table"}
            for operation in ("migration", "read", "save", "archive", "undo", "redo")
        ]
    else:
        report.update({"migration": {"code": "unknown_revision_0016"},
                       "api": {"code": "missing_projects_table"}})
    return report


def controls(*, history: bool) -> dict[str, Any]:
    return {
        "cases": 15, "case_labels": EDITING_LABELS.copy(), "archive_reads": 30,
        "archive_history_omission": True, "retained_history": history,
        "allocator_probe": {"reused": False, "first_id": 17, "after_undo_branch_id": 18},
        "deep_oracle_negative_controls": [
            "unknown_charge", "inactive_coordinates", "protection", "warnings", "allocator",
            "authored_exclusions",
        ],
        "corruption": [
            {"kind": kind, "suffix": suffix, "status": 422, "no_publication": True}
            for kind in ("payload", "manifest_hash", "schema")
            for suffix in (".neistra.zip", ".molweave.zip")
        ],
        "stale_guards": [{"kind": "revision", "status": 409, "no_publication": True},
                         {"kind": "artifact", "status": 422, "no_publication": True}],
    }


def boundary_receipt() -> dict[str, dict[str, Any]]:
    editing = {"cases": 15, "transitions": 24, "archives": 30, "case_labels": EDITING_LABELS}
    return {
        PRODUCE: {"protocol": "schema-boundary-v1", "database_heads_before": [],
                  "database_heads": ["0016"], "editing": deepcopy(editing),
                  "designation": {"archives": 10, "cases": 5, "case_labels": [
                      "designation-automatic", "designation-manual", "designation-cleared",
                      "designation-stale", "designation-default",
                  ]}, "controls": controls(history=False)},
        PREVIOUS: {"protocol": "schema-boundary-v1", "database_heads_before": [],
                   "database_heads": ["0015"], "editing": deepcopy(editing),
                   "controls": controls(history=True),
                   "current_store_refusal": store_receipt(operations=False),
                   "current_archive_refusal": archive_receipt(20)},
        REOPEN: {"protocol": "schema-boundary-v1", "database_heads_before": ["0015"],
                 "database_heads": ["0016"], "previous_retention": controls(history=True),
                 "previous_reexports": {"current_reads": 60, "current_reexport_reimports": 60,
                                        "current_writer_archives": 30,
                                        "previous_authored_cases": 15},
                 "previous_control_retention": {"exact_defaults_before_replay": True,
                                                "retained_allocator_history": True,
                                                "retained_imported_projects": 30},
                 "current_reopen": {"archive_reads": 40, "reexport_reimports": 40,
                                    "retained_designation_cases": 5, "retained_editing_cases": 15,
                                    "designation_exact_provenance_membership_and_remaps": True}},
    }


def changed(report: dict[str, Any], path: tuple[Any, ...], value: Any) -> dict[str, Any]:
    result = deepcopy(report)
    owner = result
    for part in path[:-1]:
        owner = owner[part]
    owner[path[-1]] = value
    return result


def test_complete_synthetic_receipts_are_accepted_without_mutation() -> None:
    archives = archive_receipt()
    store, boundary = store_receipt(operations=True), boundary_receipt()
    before = deepcopy((archives, store, boundary))
    archive_refusal(archives, pairs=2)
    store_refusal(store, operations=True)
    editing_boundary(boundary)
    assert (archives, store, boundary) == before


@pytest.mark.parametrize(("path", "value"), [
    (("archive_refusals", 1, "suffix"), "neistra"),
    (("archive_refusals", 1, "sha256"), "2" * 64),
    (("archive_refusals", 3, "sha256"), "0" * 64),
    (("archive_refusals", 0, "http"), 201),
    (("archive_refusals", 0, "code"), "invalid_archive_manifest"),
    (("archive_refusals", 0, "unchanged"), False),
    (("archive_refusals", 0, "logical_sha256"), "changed"),
    (("archive_refusals", 0, "files_sha256"), "changed"),
    (("after", "retained_rows", "history"), 199),
    (("after", "retained_files"), []),
    (("both_suffixes",), False),
    (("archive_pairs",), 3),
])
def test_archive_receipts_reject_false_refusal_or_incomplete_independent_coverage(
    path: tuple[Any, ...], value: Any,
) -> None:
    with pytest.raises(AssertionError):
        archive_refusal(changed(archive_receipt(), path, value), pairs=2)


def test_archive_receipts_cannot_count_duplicate_probes_or_zero_specimens() -> None:
    duplicate = archive_receipt()
    duplicate["archive_refusals"][1] = deepcopy(duplicate["archive_refusals"][0])
    for receipt, pairs in ((duplicate, 2), (archive_receipt(0), 0)):
        with pytest.raises(AssertionError):
            archive_refusal(receipt, pairs=pairs)


@pytest.mark.parametrize(("path", "value"), [
    (("after", "history"), ["old-command"]),
    (("after", "files", "original"), "changed"),
    (("unchanged",), False),
    (("database_heads",), ["0015"]),
    (("refusals",), 0),
    (("operations", 1, "operation"), "migration"),
    (("operations", 0, "code"), "missing_projects_table"),
    (("operations", 5, "code"), "success"),
    (("operations", 5, "unchanged"), False),
])
def test_store_refusal_requires_every_operation_and_retained_state(
    path: tuple[Any, ...], value: Any,
) -> None:
    with pytest.raises(AssertionError):
        store_refusal(changed(store_receipt(operations=True), path, value), operations=True)


def test_missing_store_operation_is_not_replaced_by_an_asserted_count() -> None:
    report = store_receipt(operations=True)
    report["operations"].pop()
    with pytest.raises(AssertionError):
        store_refusal(report, operations=True)


@pytest.mark.parametrize(("path", "value"), [
    (("migration", "code"), "missing_projects_table"),
    (("api", "code"), "unexpected_exception"),
    (("refusals",), 0),
    (("after", "history"), []),
])
def test_editing_store_refusal_still_requires_both_actual_failure_kinds(
    path: tuple[Any, ...], value: Any,
) -> None:
    with pytest.raises(AssertionError):
        store_refusal(changed(store_receipt(operations=False), path, value), operations=False)


@pytest.mark.parametrize(("path", "value"), [
    (("retained_history",), False),
    (("archive_history_omission",), False),
    (("archive_reads",), 0),
    (("case_labels",), EDITING_LABELS[:-1]),
    (("allocator_probe", "reused"), True),
    (("allocator_probe", "after_undo_branch_id"), 17),
    (("deep_oracle_negative_controls",), ["unknown_charge"] * 6),
    (("deep_oracle_negative_controls",), controls(history=True)["deep_oracle_negative_controls"]
     + ["unknown_charge"]),
    (("corruption", 0, "status"), 201),
    (("corruption", 0, "no_publication"), False),
    (("corruption", 1, "suffix"), ".neistra.zip"),
    (("stale_guards", 0, "status"), 422),
    (("stale_guards", 1, "no_publication"), False),
])
def test_editing_controls_require_real_history_and_every_negative_control(
    path: tuple[Any, ...], value: Any,
) -> None:
    with pytest.raises(AssertionError):
        editing_controls(changed(controls(history=True), path, value), retained_history=True)


@pytest.mark.parametrize(("path", "value"), [
    ((PRODUCE, "database_heads_before"), ["0016"]),
    ((PREVIOUS, "database_heads"), ["0016"]),
    ((REOPEN, "database_heads_before"), ["0016"]),
    ((REOPEN, "database_heads"), ["0015"]),
    ((PRODUCE, "editing", "transitions"), 23),
    ((PREVIOUS, "editing", "archives"), 29),
    ((PRODUCE, "designation", "cases"), 0),
    ((PRODUCE, "designation", "case_labels"), ["designation-automatic"] * 5),
    ((PREVIOUS, "current_store_refusal", "refusals"), 0),
    ((PREVIOUS, "current_archive_refusal", "archive_refusals"), []),
    ((REOPEN, "previous_retention", "retained_history"), False),
    ((REOPEN, "previous_reexports", "current_reads"), 0),
    ((REOPEN, "previous_reexports", "current_reexport_reimports"), 0),
    ((REOPEN, "previous_control_retention", "exact_defaults_before_replay"), False),
    ((REOPEN, "previous_control_retention", "retained_allocator_history"), False),
    ((REOPEN, "current_reopen", "archive_reads"), 39),
    ((REOPEN, "current_reopen", "retained_designation_cases"), 4),
    ((REOPEN, "current_reopen", "designation_exact_provenance_membership_and_remaps"), False),
    ((REOPEN, "protocol"), "retention-v1"),
])
def test_boundary_cannot_substitute_refusal_for_retention_or_omit_new_designation_states(
    path: tuple[Any, ...], value: Any,
) -> None:
    with pytest.raises(AssertionError):
        editing_boundary(changed(boundary_receipt(), path, value))


def test_boundary_requires_exactly_the_three_authorized_phases() -> None:
    report = boundary_receipt()
    report["unqualified-extra-phase"] = {"protocol": "schema-boundary-v1"}
    with pytest.raises(AssertionError):
        editing_boundary(report)
