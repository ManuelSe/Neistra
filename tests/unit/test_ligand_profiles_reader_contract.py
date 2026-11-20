"""Independent offline controls for explicit same-schema source qualification."""

from __future__ import annotations

import argparse
import copy
import sqlite3
import subprocess
import time
from pathlib import Path
from typing import Any

import pytest

from tests.support import ligand_profiles_reader_qualification as reader
from tests.unit.test_ligand_properties_reader_contract import property_reports as v1_reports

IDS = [
    "molecular_weight",
    "heavy_atom_count",
    "heteroatom_count",
    "carbon_count",
    "formal_charge",
    "hbd",
    "hba",
    "tpsa",
    "calculated_logp",
    "rotatable_bond_count",
]
METHOD = {
    "implementation_version": "ligand-properties-v1",
    "library_version": "2026.03.4",
    "policy_version": "strict-current-graph-terminal-h-cip-v2",
}
ETHANOL = [46.069, 3, 1, 2, 0, 1, 1, 20.23, -0.0014, 0]


def report(label: str = "completed") -> dict[str, Any]:
    known = {"heavy_atom_count": 3, "heteroatom_count": 2, "carbon_count": 1, "formal_charge": 0}
    values = []
    for name, number in zip(IDS, ETHANOL, strict=True):
        absent = label == "stale" and name not in known
        values.append(
            {
                "descriptor_id": name,
                "status": "unavailable" if absent else "ready",
                "value": None if absent else known[name] if label == "stale" else number,
                "reason": "hydrogen_semantics_unavailable" if absent else None,
            }
        )
    return {
        "schema_version": 1,
        "input_hash": ("b" if label == "stale" else "a") * 64,
        **METHOD,
        "model_status": "unavailable" if label == "stale" else "qualified",
        "model_reason": "hydrogen_semantics_unavailable" if label == "stale" else None,
        "contains_formally_charged_atoms": False,
        "coverage": list(IDS),
        "values": values,
    }


def schema_snapshot() -> dict[str, Any]:
    return {
        "tables": {"alembic_version": {"rows": 1, "rows_sha256": "actual0017"}},
        "files": {"original": {"sha256": "original"}},
        "logical_sha256": "logical",
    }


def origin_reports(origin: str) -> dict[str, dict[str, Any]]:
    """Reuse the established lifecycle fixture, with independent v2 value inputs."""
    reports = copy.deepcopy(v1_reports())
    produced, consumed, final = (reports[phase]["results"] for phase in reader.PHASES)
    for phase in reader.PHASES:
        reports[phase]["protocol"] = "private-derived-same-schema-v2"
    for label in reader.CASES:
        fixture = produced["cases"][label]
        available = label not in {"pending", "captured", "started", "cancelled", "project-deleted"}
        fixture.update(
            producer_origin=origin,
            producer_version="0.38.0" if origin == "current" else "0.37.0",
            producer_report=report() if available else None,
            producer_result={
                "status": "ready",
                "source": fixture["target_source"],
                "report": report(),
            }
            if available
            else None,
            produced_current_state={
                "status": "ready" if label in {"completed", "forged"} else "pending"
            },
        )
        fixture["private_projection"] = {
            "private_ids": [f"{origin}-{label}-private"],
            "ordinary_ids": [f"{origin}-{label}-user"],
            "ordinary_projection_exact": True,
            "private_detail_refused": True,
        }
        consumed["cases"][label]["private_projection"] = copy.deepcopy(
            fixture["private_projection"]
        )
        migration = consumed["cases"][label].pop("unknown_0017_migration")
        migration.update(
            exit=0,
            before=schema_snapshot(),
            after=schema_snapshot(),
            schema_before=[["table", "jobs"]],
            schema_after=[["table", "jobs"]],
            heads_before=["0017"],
            heads_after=["0017"],
        )
        consumed["cases"][label].update(
            same_schema_migration=migration,
            ordinary_job_purpose_aware_api=True,
            omitted_purpose_server_default="user",
        )
        target = final["cases"][label]
        value = report(label)
        target.update(
            property_report=value,
            semantic_outcome=reader.fixture_property_outcome(
                value, label, fixture.get("pre_edit_input_hash")
            ),
            current_input_hash=value["input_hash"],
        )
        for row in target["both_suffixes_reconstructed"]:
            row.update(
                property_report=copy.deepcopy(value),
                semantic_outcome=copy.deepcopy(target["semantic_outcome"]),
                input_hash=value["input_hash"],
            )
        target["producer_comparison"] = reader.producer_comparison(
            value, fixture, produced["cases"]["completed"]
        )
        for row in target["both_suffixes_reconstructed"]:
            row["producer_comparison"] = copy.deepcopy(target["producer_comparison"])
    for label in reader.CASES:
        fixture = produced["cases"][label]
        fixture.update(
            project_id=f"{origin}-{label}",
            data=f"/offline/data/{origin}/{label}",
            producer_root=f"/offline/{origin}",
        )
        target = final["cases"][label]
        target["producer_comparison"] = reader.producer_comparison(
            target["property_report"], fixture, produced["cases"]["completed"]
        )
        for row in target["both_suffixes_reconstructed"]:
            row["producer_comparison"] = copy.deepcopy(target["producer_comparison"])
    consumer_slot = "previous" if origin == "current" else "current"
    consumer_version = "0.37.0" if consumer_slot == "previous" else "0.38.0"
    consumed.update(
        consumer_slot=consumer_slot,
        consumer_root=f"/offline/{consumer_slot}",
        consumer_version=consumer_version,
    )
    for label in reader.CASES:
        consumed["cases"][label]["project_delete_probe"] = {
            "kind": "actual-selected purpose-aware ORM",
            "deleted": True,
            "implementation_root": f"/offline/{consumer_slot}",
            "implementation_version": consumer_version,
        }
    produced["cases"]["started"]["process_facts"].update(
        observed_stage="owned_spawned_descriptor_child",
        calculation_entry_observed=False,
        worker_provenance={
            "worker_slot": origin,
            "method": METHOD,
            "root": f"/offline/{origin}",
            "module_paths": {
                name: {"path": f"/offline/{origin}/{relative}", "sha256": "a" * 64}
                for name, relative in reader.WORKER_MODULES.items()
            },
        },
    )
    return reports


def library_record(root: Path) -> dict[str, Any]:
    return {
        "distribution": "rdkit",
        "distribution_version": "2026.3.4",
        "native_version": "2026.03.4",
        "module_path": str(root / ".venv/lib/python3.12/site-packages/rdkit/__init__.py"),
        "module_sha256": "d" * 64,
        "native_module_path": str(root / ".venv/lib/python3.12/site-packages/rdkit/rdBase.so"),
        "native_module_sha256": "e" * 64,
    }


def reports() -> dict[str, dict[str, Any]]:
    current, previous = origin_reports("current"), origin_reports("previous")
    result = copy.deepcopy(current)
    for phase, item in result.items():
        slot = "previous" if phase == "old-write" else "current"
        item["worker_provenance"] = {
            "protocol": "private-derived-same-schema-v2",
            "worker_slot": slot,
            "version": "0.37.0" if slot == "previous" else "0.38.0",
            "method": METHOD,
            "before_worker_run_once": True,
        }
    for item in result.values():
        proof = item["worker_provenance"]
        root = Path("/offline") / proof["worker_slot"]
        proof.update(
            root=str(root),
            python_executable=str(root / ".venv/bin/python"),
            python_prefix=str(root / ".venv"),
            module_paths={
                name: {"path": str(root / relative), "sha256": "a" * 64}
                for name, relative in reader.WORKER_MODULES.items()
            },
        )
        proof.update(
            installed_library=library_record(root),
            receipt=str(root / "receipt.json") if proof["worker_slot"] == "previous" else None,
            receipt_sha256="b" * 64 if proof["worker_slot"] == "previous" else None,
        )
        item["identity"].update(
            root=str(root),
            versions={"api": proof["version"]},
            source_files={relative: "a" * 64 for relative in reader.WORKER_MODULES.values()},
            previous_receipt={"receipt_sha256": "b" * 64}
            if proof["worker_slot"] == "previous"
            else None,
            installed_versions={"rdkit": "2026.3.4"},
            python_executable=proof["python_executable"],
            python_prefix=proof["python_prefix"],
        )
    result["produce-current"]["results"] = {
        "origins": {"current": current["produce-current"]["results"]}
    }
    result["old-write"]["results"] = {
        "origins": {
            "current": current["old-write"]["results"],
            "previous": previous["produce-current"]["results"],
        }
    }
    result["reopen-current"]["results"] = {
        "origins": {
            "current": current["reopen-current"]["results"],
            "previous": {
                "consumed": previous["old-write"]["results"],
                "reopened": previous["reopen-current"]["results"],
            },
        }
    }
    result["produce-current"]["results"]["origins"]["current"]["cases"]["started"]["process_facts"][
        "worker_provenance"
    ] = copy.deepcopy(result["produce-current"]["worker_provenance"])
    result["old-write"]["results"]["origins"]["previous"]["cases"]["started"]["process_facts"][
        "worker_provenance"
    ] = copy.deepcopy(result["old-write"]["worker_provenance"])
    for origin, phase in (("current", "produce-current"), ("previous", "old-write")):
        fixture = result[phase]["results"]["origins"][origin]["cases"]["started"]
        facts = fixture["process_facts"]
        proof = facts["worker_provenance"]
        data = Path(fixture["data"])
        facts.update(
            actual_spawn_observation={
                "pid": 12345 if origin == "current" else 12346,
                "pgid": 12345 if origin == "current" else 12346,
                "start_token": "87654321",
                "state": "S",
                "observed_alive": True,
            },
            coordinator_exit=-15,
            log_sha256="f" * 64,
            scope="Offline retained observation fixture; no actual OS observation claimed",
            argv=[
                proof["python_executable"],
                "-B",
                str(reader.HERE),
                "actor",
                "worker-once",
                "--compatibility-protocol",
                "private-derived-same-schema-v2",
                "--worker-slot",
                origin,
                "--root",
                proof["root"],
                "--workspace",
                str(data.parent),
                "--data-dir",
                str(data),
                "--expected-version",
                proof["version"],
                "--suite",
                "properties",
                "--evidence",
                str(data / "worker-once.json"),
                "--authorization",
                "/offline/authorization.json",
                "--previous-version",
                "0.37.0",
                "--previous-tag",
                "v0.37.0",
                "--previous-commit",
                "a" * 40,
            ]
            + (["--receipt", proof["receipt"]] if origin == "previous" else []),
        )
    return result


def test_both_genuine_origins_have_complete_state_and_archive_coverage() -> None:
    reader.validate_reports(reports(), "properties")


@pytest.mark.parametrize("origin", ["current", "previous"])
@pytest.mark.parametrize(
    "mutation",
    [
        "missing_origin",
        "wrong_origin",
        "missing_case",
        "missing_suffix",
        "refused_upgrade",
        "changed_schema",
        "changed_rows",
        "changed_original",
        "invented_entry",
        "prewarmed_pending",
        "missing_vector",
        "wrong_vector",
        "fractional_integer",
        "missing_logp",
        "wrong_library",
        "wrong_hash",
        "false_comparison",
    ],
)
def test_dropped_or_invented_coverage_never_passes(origin: str, mutation: str) -> None:
    data = reports()
    produced = (
        data["produce-current"]["results"]["origins"]["current"]
        if origin == "current"
        else data["old-write"]["results"]["origins"]["previous"]
    )
    consumed = (
        data["old-write"]["results"]["origins"]["current"]
        if origin == "current"
        else data["reopen-current"]["results"]["origins"]["previous"]["consumed"]
    )
    final = (
        data["reopen-current"]["results"]["origins"]["current"]
        if origin == "current"
        else data["reopen-current"]["results"]["origins"]["previous"]["reopened"]
    )
    if mutation == "missing_origin":
        data["old-write"]["results"]["origins"].pop(origin)
    elif mutation == "wrong_origin":
        produced["cases"]["completed"]["producer_origin"] = "foreign"
    elif mutation == "missing_case":
        produced["cases"].pop("captured")
    elif mutation == "missing_suffix":
        final["cases"]["completed"]["both_suffixes_reconstructed"].pop()
    elif mutation == "refused_upgrade":
        consumed["cases"]["completed"]["same_schema_migration"]["exit"] = 1
    elif mutation == "changed_schema":
        consumed["cases"]["completed"]["same_schema_migration"]["schema_after"].append(
            ["table", "unapproved"]
        )
    elif mutation == "changed_rows":
        consumed["cases"]["completed"]["same_schema_migration"]["after"]["logical_sha256"] = (
            "changed"
        )
    elif mutation == "changed_original":
        consumed["cases"]["completed"]["same_schema_migration"]["after"]["files"]["original"][
            "sha256"
        ] = "changed"
    elif mutation == "invented_entry":
        produced["cases"]["started"]["process_facts"]["calculation_entry_observed"] = True
    elif mutation == "prewarmed_pending":
        produced["cases"]["pending"]["produced_current_state"]["status"] = "ready"
    elif mutation == "missing_vector":
        produced["cases"]["completed"]["producer_report"] = None
    elif mutation == "wrong_vector":
        produced["cases"]["completed"]["producer_report"]["values"][0]["value"] = 99.0
        produced["cases"]["completed"]["producer_result"]["report"]["values"][0]["value"] = 99.0
        final["cases"]["completed"]["property_report"]["values"][0]["value"] = 99.0
    elif mutation == "fractional_integer":
        produced["cases"]["completed"]["producer_report"]["values"][1]["value"] = 3.0
        produced["cases"]["completed"]["producer_result"]["report"]["values"][1]["value"] = 3.0
    elif mutation == "missing_logp":
        final["cases"]["completed"]["property_report"]["coverage"].remove("calculated_logp")
    elif mutation == "wrong_library":
        final["cases"]["completed"]["property_report"]["library_version"] = "wrong"
    elif mutation == "wrong_hash":
        final["cases"]["stale"]["property_report"]["input_hash"] = "a" * 64
    elif mutation == "false_comparison":
        final["cases"]["stale"]["producer_comparison"]["compared"] = True
    with pytest.raises((AssertionError, KeyError, TypeError)):
        reader.validate_reports(data, "properties")


@pytest.mark.parametrize("index", range(10))
def test_consistently_wrong_finite_vectors_cannot_self_validate(index: int) -> None:
    value = report()
    value["values"][index]["value"] += 1
    fixture = {
        "producer_report": value,
        "producer_origin": "previous",
        "producer_version": "0.37.0",
    }
    with pytest.raises(AssertionError):
        reader.producer_comparison(copy.deepcopy(value), fixture, fixture)


@pytest.mark.parametrize("name", ["implementation_version", "library_version", "policy_version"])
def test_matching_wrong_methods_do_not_supply_an_oracle(name: str) -> None:
    value = report()
    value[name] = "wrong"
    fixture = {"producer_report": value, "producer_origin": "current", "producer_version": "0.38.0"}
    with pytest.raises(AssertionError):
        reader.producer_comparison(copy.deepcopy(value), fixture, fixture)


def test_nonready_origins_do_not_invent_producer_vectors() -> None:
    fixture = {"producer_report": None, "producer_origin": "previous", "producer_version": "0.37.0"}
    missing = reader.producer_comparison(report(), fixture, fixture)
    assert missing["compared"] is False
    completed = {**fixture, "producer_report": report()}
    matched = reader.producer_comparison(report(), fixture, completed)
    assert matched["compared"] and matched["basis"] == "same-origin-completed-control"
    changed = report()
    changed["input_hash"] = "c" * 64
    assert reader.producer_comparison(changed, fixture, completed)["compared"] is False


@pytest.mark.parametrize("index", range(10))
def test_stale_partial_values_preserve_known_counts_and_unavailable_models(index: int) -> None:
    value = report("stale")
    assert (
        reader.fixture_property_outcome(value, "stale", "a" * 64)["model_status"] == "unavailable"
    )
    value["values"][index]["value"] = 123
    with pytest.raises(AssertionError):
        reader.fixture_property_outcome(value, "stale", "a" * 64)


def authority_and_proof(tmp_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    root = tmp_path / "previous"
    selected = {
        "root": str(root),
        "version": "0.37.0",
        "python": str(root / ".venv/bin/python"),
        "receipt": None,
        "receipt_sha256": None,
        "worker_modules": {
            name: {"path": str(root / relative), "sha256": "a" * 64}
            for name, relative in reader.WORKER_MODULES.items()
        },
        "method": METHOD,
        "installed_library": library_record(root),
    }
    authority = {
        "protocol": "private-derived-same-schema-v2",
        "worker_slots": {"previous": selected},
    }
    proof = {
        "protocol": "private-derived-same-schema-v2",
        "worker_slot": "previous",
        "root": str(root),
        "version": "0.37.0",
        "python_executable": selected["python"],
        "python_prefix": str(root / ".venv"),
        "receipt": None,
        "receipt_sha256": None,
        "module_paths": copy.deepcopy(selected["worker_modules"]),
        "method": METHOD,
        "installed_library": library_record(root),
        "before_worker_run_once": True,
    }
    return authority, proof


def test_exact_predecessor_worker_identity_is_required_before_work(tmp_path: Path) -> None:
    authority, proof = authority_and_proof(tmp_path)
    reader.validate_worker_proof(proof, authority, "previous")


@pytest.mark.parametrize(
    "field",
    [
        "protocol",
        "worker_slot",
        "root",
        "version",
        "python_executable",
        "python_prefix",
        "receipt",
        "receipt_sha256",
        "module_paths",
        "method",
        "before_worker_run_once",
    ],
)
def test_wrong_worker_slot_source_or_method_is_rejected(tmp_path: Path, field: str) -> None:
    authority, proof = authority_and_proof(tmp_path)
    proof[field] = False if field == "before_worker_run_once" else "wrong"
    with pytest.raises((AssertionError, KeyError, TypeError)):
        reader.validate_worker_proof(proof, authority, "previous")


def test_v2_requires_explicit_selector_and_preserves_literal_legacy_default() -> None:
    from tests.support import ligand_properties_reader_qualification as legacy

    assert legacy.PROTOCOL == "private-derived-shared-schema-v1"
    assert reader.PROTOCOL == "private-derived-same-schema-v2"
    with pytest.raises(SystemExit):
        reader.parser().parse_args(["run"])
    with pytest.raises(SystemExit):
        reader.parser().parse_args(
            ["actor", "worker-once", "--compatibility-protocol", legacy.PROTOCOL]
        )


def authorized_actor(tmp_path: Path) -> tuple[argparse.Namespace, dict[str, Any]]:
    current, previous = tmp_path / "current", tmp_path / "previous"
    current.mkdir()
    previous.mkdir()
    work = tmp_path / "owned-work"
    work.mkdir()
    receipt = tmp_path / "receipt.json"
    receipt.write_text("actual source receipt")
    slots = {}
    for slot, root, version in (("current", current, "0.38.0"), ("previous", previous, "0.37.0")):
        slots[slot] = {
            "root": str(root),
            "version": version,
            "python": str(root / ".venv/bin/python"),
            "receipt": str(receipt) if slot == "previous" else None,
            "receipt_sha256": reader.digest(receipt.read_bytes()) if slot == "previous" else None,
        }
    authority = {
        "protocol": "private-derived-same-schema-v2",
        "workspace": str(work),
        "current_root": str(current),
        "previous_root": str(previous),
        "current_version": "0.38.0",
        "previous_version": "0.37.0",
        "previous_receipt": str(receipt),
        "tag": "v0.37.0",
        "commit": "a" * 40,
        "worker_slots": slots,
        "verified": {"actual": "source"},
        "wrapper_sha256": reader.digest(reader.HERE.read_bytes()),
    }
    args = argparse.Namespace(
        compatibility_protocol="private-derived-same-schema-v2",
        phase="old-write",
        worker_slot="previous",
        root=previous,
        workspace=work,
        expected_version="0.37.0",
        previous_version="0.37.0",
        previous_tag="v0.37.0",
        previous_commit="a" * 40,
        receipt=receipt,
    )
    return args, authority


def test_actual_predecessor_slot_authorization_is_explicit(tmp_path: Path) -> None:
    args, authority = authorized_actor(tmp_path)
    assert reader.validate_authorized_actor(args, authority) == "previous"


@pytest.mark.parametrize(
    "mutation",
    [
        "protocol",
        "worker_slot",
        "root",
        "expected_version",
        "receipt",
        "receipt_body",
        "previous_tag",
        "previous_commit",
        "workspace",
        "wrapper",
    ],
)
def test_actor_refuses_wrong_authorization_before_application_work(
    tmp_path: Path, mutation: str
) -> None:
    args, authority = authorized_actor(tmp_path)
    if mutation == "protocol":
        args.compatibility_protocol = "private-derived-shared-schema-v1"
    elif mutation == "worker_slot":
        args.worker_slot = "current"
    elif mutation == "root":
        args.root = tmp_path / "foreign"
    elif mutation == "expected_version":
        args.expected_version = "0.36.0"
    elif mutation == "receipt":
        args.receipt = None
    elif mutation == "receipt_body":
        args.receipt.write_text("changed receipt")
    elif mutation == "previous_tag":
        args.previous_tag = "v0.36.0"
    elif mutation == "previous_commit":
        args.previous_commit = "b" * 40
    elif mutation == "workspace":
        args.workspace = tmp_path / "foreign"
    elif mutation == "wrapper":
        authority["wrapper_sha256"] = "b" * 64
    with pytest.raises((AssertionError, KeyError)):
        reader.validate_authorized_actor(args, authority)


def test_worker_once_cannot_return_before_source_and_method_proof(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    args, authority = authorized_actor(tmp_path)
    args.phase = "worker-once"
    args.authorization = tmp_path / "authority.json"
    reader.dump(args.authorization, authority)
    args.data_dir = args.workspace / "worker-data"
    args.data_dir.mkdir()
    args.evidence = args.workspace / "worker.json"
    monkeypatch.chdir(args.root)
    monkeypatch.setattr(reader, "verify_predecessor", lambda *unused: authority["verified"])
    events: list[str] = []

    def identity(*unused: Any) -> dict[str, str]:
        events.append("identity")
        return {"actual": "source"}

    monkeypatch.setattr(reader, "editing_tools", lambda: {"identity": identity})

    def refuse_proof(*unused: Any) -> None:
        events.append("proof")
        raise AssertionError("wrong scientific worker source")

    monkeypatch.setattr(reader, "worker_provenance", refuse_proof)
    monkeypatch.setattr(
        reader, "client_for", lambda *unused: pytest.fail("Application opened before source proof")
    )
    with pytest.raises(AssertionError, match="wrong scientific worker source"):
        reader.actor(args)
    assert events == ["identity", "proof"]
    assert not args.evidence.exists()


@pytest.mark.parametrize("phase", ["produce-current", "old-write", "reopen-current"])
def test_real_phase_dispatch_preserves_reverse_production_without_prewarming(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, phase: str
) -> None:
    events: list[tuple[str, str, str]] = []

    def action(kind: str) -> Any:
        def execute(args: argparse.Namespace) -> dict[str, str]:
            assert args.workspace == tmp_path / "origins" / args.origin
            events.append((kind, args.origin, args.worker_slot))
            return {"actual_action": kind, "origin": args.origin}

        return execute

    monkeypatch.setattr(reader, "produce_properties", action("produce"))
    monkeypatch.setattr(reader, "old_properties", action("consume"))
    monkeypatch.setattr(reader, "reopen_properties", action("reopen"))
    args = argparse.Namespace(
        phase=phase,
        workspace=tmp_path,
        worker_slot="previous" if phase == "old-write" else "current",
    )
    result = reader.property_actor(args)
    if phase == "produce-current":
        assert events == [("produce", "current", "current")]
        assert set(result["origins"]) == {"current"}
    elif phase == "old-write":
        assert events == [("consume", "current", "previous"), ("produce", "previous", "previous")]
        assert result["origins"]["previous"]["actual_action"] == "produce"
    else:
        assert events == [
            ("consume", "previous", "current"),
            ("reopen", "current", "current"),
            ("reopen", "previous", "current"),
        ]
        assert set(result["origins"]["previous"]) == {"consumed", "reopened"}


@pytest.mark.parametrize("field", ["project_id", "data"])
def test_relabelled_copies_cannot_count_as_independent_origin_production(field: str) -> None:
    data = reports()
    current = data["produce-current"]["results"]["origins"]["current"]["cases"]
    previous = data["old-write"]["results"]["origins"]["previous"]["cases"]
    for label in reader.CASES:
        previous[label][field] = current[label][field]
    with pytest.raises(AssertionError, match="independently produced"):
        reader.validate_reports(data, "properties")


@pytest.mark.parametrize("phase", ["produce-current", "old-write", "reopen-current"])
def test_report_cannot_drop_worker_module_identity(phase: str) -> None:
    data = reports()
    data[phase]["worker_provenance"]["module_paths"].pop("neistra_core.ligand_properties.calculate")
    with pytest.raises(AssertionError, match="Incomplete worker"):
        reader.validate_reports(data, "properties")


def test_source_migration_contract_rejects_new_or_changed_migration(tmp_path: Path) -> None:
    roots = [tmp_path / "current", tmp_path / "previous"]
    for root in roots:
        directory = root / "apps/api/migrations/versions"
        directory.mkdir(parents=True)
        for number in range(1, 18):
            (directory / f"{number:04}.py").write_text(f"revision = '{number:04}'")
    assert len(reader.verify_migration_sources(*roots)) == 17
    changed = roots[0] / "apps/api/migrations/versions/0017.py"
    changed.write_text("revision = 'changed'")
    with pytest.raises(AssertionError):
        reader.verify_migration_sources(*roots)
    changed.write_text("revision = '0017'")
    (changed.parent / "0018.py").write_text("new profile schema")
    with pytest.raises(AssertionError):
        reader.verify_migration_sources(*roots)


@pytest.mark.parametrize("phase", ["produce-current", "old-write", "reopen-current"])
def test_persisted_worker_hash_must_match_phase_qualified_source(phase: str) -> None:
    data = reports()
    data[phase]["worker_provenance"]["module_paths"]["neistra_core.ligand_properties.calculate"][
        "sha256"
    ] = "c" * 64
    with pytest.raises(AssertionError, match="differs from qualified source"):
        reader.validate_reports(data, "properties")


@pytest.mark.parametrize("origin", ["current", "previous"])
def test_interrupted_worker_hash_must_match_that_genuine_producer(origin: str) -> None:
    data = reports()
    phase = "produce-current" if origin == "current" else "old-write"
    facts = data[phase]["results"]["origins"][origin]["cases"]["started"]["process_facts"]
    facts["worker_provenance"]["module_paths"]["neistra_api.ligand_property_plugin"]["sha256"] = (
        "c" * 64
    )
    with pytest.raises(AssertionError, match="differs from qualified source"):
        reader.validate_reports(data, "properties")


@pytest.mark.parametrize(
    "field",
    [
        "distribution_version",
        "native_version",
        "native_module_path",
        "native_module_sha256",
        "module_path",
        "module_sha256",
    ],
)
def test_selected_native_library_identity_cannot_be_substituted(tmp_path: Path, field: str) -> None:
    authority, proof = authority_and_proof(tmp_path)
    proof["installed_library"][field] = "wrong"
    with pytest.raises((AssertionError, ValueError)):
        reader.validate_worker_proof(proof, authority, "previous")


def test_persisted_installed_version_must_match_phase_distribution() -> None:
    data = reports()
    data["old-write"]["identity"]["installed_versions"]["rdkit"] = "2025.9.1"
    with pytest.raises(AssertionError):
        reader.validate_reports(data, "properties")


def test_ready_reconstruction_cannot_skip_comparison_after_input_hash_substitution() -> None:
    original, reconstructed = report(), report()
    reconstructed["input_hash"] = "c" * 64
    fixture = {
        "producer_report": original,
        "producer_origin": "previous",
        "producer_version": "0.37.0",
    }
    with pytest.raises(AssertionError, match="actual producer scientific identity"):
        reader.producer_comparison(reconstructed, fixture, fixture)


@pytest.mark.parametrize("charge_fact", [None, True, 0])
def test_net_zero_never_substitutes_for_qualified_uncharged_atom_fact(charge_fact: Any) -> None:
    value = report()
    value["contains_formally_charged_atoms"] = charge_fact
    assert value["values"][4]["value"] == 0
    with pytest.raises(AssertionError):
        reader.fixture_property_outcome(value, "completed")


@pytest.mark.parametrize("origin", ["current", "previous"])
@pytest.mark.parametrize("field", ["consumer_slot", "consumer_root", "consumer_version"])
def test_consumer_source_cannot_be_relabelled(origin: str, field: str) -> None:
    data = reports()
    consumed = (
        data["old-write"]["results"]["origins"]["current"]
        if origin == "current"
        else data["reopen-current"]["results"]["origins"]["previous"]["consumed"]
    )
    consumed[field] = "foreign"
    with pytest.raises(AssertionError):
        reader.validate_reports(data, "properties")


@pytest.mark.parametrize("origin", ["current", "previous"])
@pytest.mark.parametrize("field", ["pid", "pgid", "start_token", "state", "observed_alive"])
def test_retained_spawn_observation_requires_every_field(origin: str, field: str) -> None:
    data = reports()
    phase = "produce-current" if origin == "current" else "old-write"
    facts = data[phase]["results"]["origins"][origin]["cases"]["started"]["process_facts"]
    facts["actual_spawn_observation"].pop(field)
    with pytest.raises((AssertionError, KeyError)):
        reader.validate_reports(data, "properties")


@pytest.mark.parametrize("origin", ["current", "previous"])
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("pid", True),
        ("pid", 0),
        ("pid", -1),
        ("pid", 12345.0),
        ("pid", "12345"),
        ("pgid", True),
        ("pgid", 0),
        ("pgid", 12345.0),
        ("pgid", "12345"),
        ("start_token", "forged"),
        ("start_token", ""),
        ("start_token", "-1"),
        ("start_token", "1.5"),
        ("start_token", " 123"),
        ("start_token", "\uff11\uff12\uff13"),
        ("start_token", 123),
        ("start_token", True),
        ("start_token", None),
        ("state", "Z"),
        ("state", "X"),
        ("state", "x"),
        ("state", "forged"),
        ("state", ""),
        ("state", True),
        ("state", None),
        ("observed_alive", False),
        ("observed_alive", 1),
        ("observed_alive", "true"),
    ],
)
def test_retained_spawn_observation_rejects_forged_facts(
    origin: str, field: str, value: Any
) -> None:
    data = reports()
    phase = "produce-current" if origin == "current" else "old-write"
    facts = data[phase]["results"]["origins"][origin]["cases"]["started"]["process_facts"]
    facts["actual_spawn_observation"][field] = value
    with pytest.raises((AssertionError, TypeError)):
        reader.validate_reports(data, "properties")


@pytest.mark.parametrize("origin", ["current", "previous"])
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("coordinator_exit", None),
        ("coordinator_exit", False),
        ("coordinator_exit", "-15"),
        ("coordinator_exit", -15.0),
        ("coordinator_exit", 256),
        ("coordinator_exit", -999),
        ("live_child_after_fixture", True),
        ("live_child_after_fixture", 0),
        ("live_child_after_fixture", None),
        ("log_sha256", "forged"),
        ("scope", ""),
    ],
)
def test_retained_spawn_observation_requires_completed_cleanup(
    origin: str, field: str, value: Any
) -> None:
    data = reports()
    phase = "produce-current" if origin == "current" else "old-write"
    facts = data[phase]["results"]["origins"][origin]["cases"]["started"]["process_facts"]
    facts[field] = value
    with pytest.raises((AssertionError, TypeError)):
        reader.validate_reports(data, "properties")


@pytest.mark.parametrize("origin", ["current", "previous"])
@pytest.mark.parametrize(
    "mutation",
    [
        "wrong_group",
        "reviewer_reproduction",
        "missing_exit",
        "missing_cleanup",
        "missing_argv",
        "wrong_python",
        "wrong_wrapper",
        "wrong_slot",
        "wrong_root",
        "wrong_version",
        "wrong_data",
        "wrong_workspace",
        "wrong_evidence",
        "wrong_protocol",
        "wrong_receipt",
        "duplicate_option",
    ],
)
def test_retained_spawn_observation_is_bound_to_producer_command(
    origin: str, mutation: str
) -> None:
    data = reports()
    phase = "produce-current" if origin == "current" else "old-write"
    facts = data[phase]["results"]["origins"][origin]["cases"]["started"]["process_facts"]
    if mutation == "wrong_group":
        facts["actual_spawn_observation"]["pgid"] += 1
    elif mutation == "reviewer_reproduction":
        facts["actual_spawn_observation"] = {
            "observed_alive": True,
            "pid": 12345,
            "pgid": 0,
            "start_token": "forged",
            "state": "Z",
        }
    elif mutation.startswith("missing_"):
        facts.pop(
            {
                "missing_exit": "coordinator_exit",
                "missing_cleanup": "live_child_after_fixture",
                "missing_argv": "argv",
            }[mutation]
        )
    elif mutation == "wrong_python":
        facts["argv"][0] = "/foreign/.venv/bin/python"
    elif mutation == "wrong_wrapper":
        facts["argv"][2] = "/foreign/actor.py"
    elif mutation == "duplicate_option":
        facts["argv"] += ["--worker-slot", origin]
    elif mutation == "wrong_receipt" and origin == "current":
        facts["argv"] += ["--receipt", "/foreign/receipt.json"]
    else:
        option = {
            "wrong_slot": "--worker-slot",
            "wrong_root": "--root",
            "wrong_version": "--expected-version",
            "wrong_data": "--data-dir",
            "wrong_workspace": "--workspace",
            "wrong_evidence": "--evidence",
            "wrong_protocol": "--compatibility-protocol",
            "wrong_receipt": "--receipt",
        }[mutation]
        facts["argv"][facts["argv"].index(option) + 1] = "forged"
    with pytest.raises((AssertionError, KeyError, TypeError)):
        reader.validate_reports(data, "properties")


@pytest.mark.parametrize("state", ["R", "S", "D", "T", "t", "P", "I"])
def test_retained_spawn_observation_accepts_kernel_live_states(state: str) -> None:
    data = reports()
    fixture = data["produce-current"]["results"]["origins"]["current"]["cases"]["started"]
    fixture["process_facts"]["actual_spawn_observation"]["state"] = state
    reader.validate_reports(data, "properties")


@pytest.mark.parametrize("state", ["Z", "X", "x", "forged"])
def test_observation_loop_skips_dead_or_invalid_states_without_launching_processes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, state: str
) -> None:
    class Coordinator:
        returncode: int | None = None

        def poll(self) -> int | None:
            return self.returncode

        def terminate(self) -> None:
            self.returncode = -15

        def wait(self, *, timeout: int) -> int | None:
            assert timeout == 5
            return self.returncode

    class Connection:
        def __enter__(self) -> Connection:
            return self

        def __exit__(self, *unused: Any) -> None:
            pass

        def execute(self, query: str) -> Connection:
            assert "child_start_token" in query
            return self

        def fetchall(self) -> list[tuple[int, str, int]]:
            return [(12345, "87654321", 1)]

    monkeypatch.setattr(reader, "database", lambda unused: tmp_path / "offline.db")
    identities = iter([("87654321", 12345, state), ("87654321", 12345, "S"), None, None])
    monkeypatch.setattr(reader, "process_identity", lambda unused: next(identities))
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: Coordinator())
    monkeypatch.setattr(sqlite3, "connect", lambda *args, **kwargs: Connection())
    monkeypatch.setattr(time, "sleep", lambda unused: None)
    monkeypatch.setattr(reader, "assert_no_live_captures", lambda unused: None)
    monkeypatch.setattr(reader, "validate_worker_proof", lambda *unused: None)
    monkeypatch.setattr(
        reader,
        "load",
        lambda unused: {
            "previous_version": "0.37.0",
            "tag": "v0.37.0",
            "commit": "a" * 40,
        },
    )
    facts = reader.actual_started(tmp_path, tmp_path, "0.38.0", tmp_path / "authority", "current")
    assert facts["actual_spawn_observation"] == {
        "pid": 12345,
        "pgid": 12345,
        "start_token": "87654321",
        "state": "S",
        "observed_alive": True,
    }
    assert facts["coordinator_exit"] == -15 and facts["live_child_after_fixture"] is False
