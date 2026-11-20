"""Source-context oracles for the separate selected-profile browser campaign.

The inherited disposable trial deliberately disables original recovery. Keep its
numerical oracle intact, and independently calculate the API's actual immutable-
original context instead of equating those different provenance-bearing hashes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from neistra_core.editing.model import DirectMolecularEditor, ModelElement
from neistra_core.ligand_properties import DescriptorReport, calculate_properties
from neistra_core.ligand_properties.registry import DESCRIPTOR_REGISTRY
from neistra_core.molecular import NormalizedStructureV1

from tests.support.ligand_property_performance_qualification import (
    dump,
    fixture_preflight,
)
from tests.support.ligand_property_performance_qualification import (
    source as entry_source,
)


def _sha(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def assert_vectors(actual: DescriptorReport, independent: DescriptorReport) -> None:
    """Compare chemistry independently of provenance, without weakening either hash."""
    assert actual.model_status == independent.model_status == "qualified"
    for field in ("implementation_version", "library_version", "policy_version"):
        assert getattr(actual, field) == getattr(independent, field), "Descriptor method changed"
    assert actual.contains_formally_charged_atoms == independent.contains_formally_charged_atoms
    assert actual.coverage == independent.coverage
    for left, right in zip(actual.values, independent.values, strict=True):
        assert left.descriptor_id == right.descriptor_id
        assert left.status == right.status == "ready"
        assert left.value is not None and right.value is not None
        assert math.isfinite(left.value) and math.isfinite(right.value)
        if DESCRIPTOR_REGISTRY[left.descriptor_id].value_type == "integer":
            assert type(left.value) is type(right.value) is int and left.value == right.value
        else:
            assert math.isclose(left.value, right.value, abs_tol=1e-10, rel_tol=0)


def source_context(output: Path, independent: dict[str, Any]) -> dict[str, Any]:
    """Use retained verified canonical/original bodies; never read API report values."""
    canonical = (output / "actual-source.json").read_bytes()
    original = (output / "actual-original.sdf").read_bytes()
    assert _sha(canonical) == independent["source_sha256"], "Canonical source changed"
    assert _sha(original) == independent["original_sha256"], "Immutable original changed"
    for filename, payload, artifact_id in (
        ("actual-source.json", canonical, independent["source"]["source_artifact_id"]),
        ("actual-original.sdf", original, independent["original_artifact_id"]),
    ):
        identity = json.loads((output / f"{filename}.identity.json").read_bytes())
        assert identity["sha256"] == _sha(payload) and identity["size"] == len(payload)
        assert identity["id"] == artifact_id
    source = independent["source"]
    entry = json.loads((output / "actual-entry.json").read_bytes())
    assert entry_source(entry) == source
    assert entry["original_artifact_id"] == independent["original_artifact_id"]
    structure = NormalizedStructureV1.from_bytes(canonical)
    members = sorted(atom.id for atom in structure.atoms)
    assert members == source["atom_ids"] == independent["source_atom_ids"]
    assert independent["original_recovery_disabled"] is True
    assert independent["no_shared_cache_or_API_descriptor_work"] is True
    edited = (
        DirectMolecularEditor()
        .edit(
            structure,
            [1],
            ModelElement(operation="atom.element", element="N"),
            next_atom_id=max(atom.id for atom in structure.atoms) + 1,
            next_bond_id=max(bond.id for bond in structure.bonds) + 1,
            hydrogen_policy="automatic",
        )
        .edit.structure
    )
    reports: dict[str, Any] = {}
    for phase, candidate in (("before", structure), ("after", edited)):
        ids = sorted(atom.id for atom in candidate.atoms)
        numerical = DescriptorReport.model_validate(independent[f"{phase}_report"])
        repeated = calculate_properties(candidate, ids, original_bytes=None)
        assert repeated.model_dump(exclude={"created_at"}) == numerical.model_dump(
            exclude={"created_at"}
        ), "Independent disposable trial was not reproduced"
        contextual = calculate_properties(candidate, ids, original_bytes=original)
        assert_vectors(contextual, numerical)
        expected_provenance = (
            ("exact_immutable_source_match",) if phase == "before" else ("current_explicit_graph",)
        )
        assert contextual.provenance == expected_provenance, "Unexpected input qualification"
        reports["before_report" if phase == "before" else "disposable_after_report"] = (
            contextual.model_dump(mode="json")
        )
    assert structure.to_bytes() == canonical, "Source context preparation mutated canonical data"
    (output / "disposable-edited-source.json").write_bytes(edited.to_bytes())
    return {
        "schema": "profile-performance-source-context-v1",
        "source": source,
        "original_artifact_id": independent["original_artifact_id"],
        "source_sha256": _sha(canonical),
        "original_sha256": _sha(original),
        "disposable_edited_source_sha256": _sha(edited.to_bytes()),
        "disposable_after_scope": "Numerical trial; actual service publication is checked later",
        "independent_no_original_vectors_reproduced": True,
        "context_vectors_match_independent_numerical_oracle": True,
        "no_shared_cache_or_API_descriptor_work": True,
        **reports,
    }


def preflight(database: Path, data: Path, requirements: Path, output: Path) -> dict[str, Any]:
    assert not output.exists(), "Preserve earlier qualification output"
    output.mkdir(parents=True)
    independent = fixture_preflight(database, data, requirements, output)
    dump(output / "independent-result.json", independent)
    context = source_context(output, independent)
    dump(output / "source-context.json", context)
    result = {
        "schema": "profile-performance-paired-preflight-v1",
        "independent_no_original": independent,
        "source_context": context,
        "independent_result_sha256": _sha((output / "independent-result.json").read_bytes()),
        "source_context_sha256": _sha((output / "source-context.json").read_bytes()),
    }
    dump(output / "result.json", result)
    return result


def current_context(
    database: Path, data: Path, request: dict[str, Any], output: Path
) -> dict[str, Any]:
    """Qualify actual published edit/history bytes after the measured READY response."""
    assert not output.exists(), "Preserve earlier current-source qualification"
    assert database.resolve().parent == data.resolve()
    assert database.name in {"neistra.db", "molweave.db"}
    initial = Path(request["preflight_directory"]) / "qualification"
    packet_bytes = (initial / "result.json").read_bytes()
    assert _sha(packet_bytes) == request["preflight_sha256"], "Preflight packet changed"
    packet = json.loads(packet_bytes)
    independent = packet["independent_no_original"]
    phase = request["phase"]
    assert phase in {"before", "after"}
    wanted = request["source"]
    assert wanted["entry_id"] == independent["source"]["entry_id"]
    assert request["original_artifact_id"] == independent["original_artifact_id"]
    with sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True, timeout=5) as db:
        db.row_factory = sqlite3.Row
        row = db.execute(
            "SELECT id,project_id,current_artifact_id,original_artifact_id,ligand_designation "
            "FROM structure_entries WHERE id=?",
            (wanted["entry_id"],),
        ).fetchone()
        assert row is not None
        entry = dict(row)
        entry["ligand_designation"] = json.loads(entry["ligand_designation"])
        assert entry["project_id"] == request["project_id"]
        assert entry_source(entry) == wanted, "Published source differs from accepted command"
        assert entry["original_artifact_id"] == request["original_artifact_id"]

        def read_artifact(identity: str) -> bytes:
            artifact = db.execute(
                "SELECT sha256,size,relative_path FROM artifacts WHERE id=?", (identity,)
            ).fetchone()
            assert artifact is not None and 0 < artifact["size"] <= 4 * 1024 * 1024
            relative_path = artifact["relative_path"]
            assert isinstance(relative_path, str)
            path = data / relative_path
            assert not path.is_symlink()
            assert path.resolve().is_relative_to((data / "artifacts").resolve())
            with path.open("rb") as handle:
                body = handle.read(4 * 1024 * 1024 + 1)
            assert len(body) == artifact["size"] and _sha(body) == artifact["sha256"]
            return body

        canonical = read_artifact(wanted["source_artifact_id"])
        original = read_artifact(entry["original_artifact_id"])
    assert _sha(original) == independent["original_sha256"], "Immutable original changed"
    assert original == (initial / "actual-original.sdf").read_bytes()
    if phase == "before":
        assert wanted == independent["source"], "Undo did not restore complete exact source"
        expected_canonical = (initial / "actual-source.json").read_bytes()
        assert canonical == expected_canonical, "Undo did not restore canonical bytes"
    else:
        assert wanted["source_artifact_id"] != independent["source"]["source_artifact_id"]
        assert wanted["instance_id"] == independent["source"]["instance_id"]
        expected_canonical = (initial / "disposable-edited-source.json").read_bytes()
        assert (
            _sha(expected_canonical) == packet["source_context"]["disposable_edited_source_sha256"]
        )
    structure = NormalizedStructureV1.from_bytes(canonical)
    expected = NormalizedStructureV1.from_bytes(expected_canonical)
    # Original protection may add source annotations before publication. Molecular
    # identities, graph, every coordinate and conformer must still match the trial.
    for field in ("atoms", "bonds", "conformers", "active_conformer_id", "residues", "chains"):
        assert getattr(structure, field) == getattr(expected, field), f"Published {field} differs"
    assert sorted(atom.id for atom in structure.atoms) == wanted["atom_ids"]
    if request.get("expected_canonical_sha256") is not None:
        assert _sha(canonical) == request["expected_canonical_sha256"], "Redo source changed"
    contextual = calculate_properties(structure, wanted["atom_ids"], original_bytes=original)
    numerical = DescriptorReport.model_validate(independent[f"{phase}_report"])
    assert_vectors(contextual, numerical)
    assert contextual.provenance == (
        ("exact_immutable_source_match",) if phase == "before" else ("current_explicit_graph",)
    )
    output.mkdir(parents=True)
    (output / "actual-source.json").write_bytes(canonical)
    (output / "actual-original.sdf").write_bytes(original)
    result = {
        "schema": "profile-performance-published-context-v1",
        "phase": phase,
        "source": wanted,
        "source_sha256": _sha(canonical),
        "original_sha256": _sha(original),
        "preflight_sha256": request["preflight_sha256"],
        "report": contextual.model_dump(mode="json"),
        "no_shared_cache_or_API_descriptor_work": True,
        "actual_published_graph_ids_coordinates_match_independent_trial": True,
    }
    dump(output / "result.json", result)
    return result


def consumer_state(database: Path, data: Path, projects: list[str]) -> dict[str, Any]:
    """Distinguish retained released lease records from actual live owned demand."""
    assert database.resolve().parent == data.resolve()
    assert database.name in {"neistra.db", "molweave.db"}
    assert projects and len(set(projects)) == len(projects)
    now = datetime.now(UTC)
    with sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True, timeout=5) as db:
        db.row_factory = sqlite3.Row
        total = db.execute("SELECT count(*) FROM ligand_property_consumers").fetchone()[0]
        rows = db.execute(
            "SELECT id,project_id,sequence,generation,released,expires_at "
            "FROM ligand_property_consumers ORDER BY id"
        ).fetchall()
    selected = []
    for row in rows:
        if row["project_id"] not in projects:
            continue
        item = dict(row)
        assert item["released"] in (0, 1)
        expires = datetime.fromisoformat(item["expires_at"])
        expires = expires.replace(tzinfo=UTC) if expires.tzinfo is None else expires.astimezone(UTC)
        item["live"] = item["released"] == 0 and expires > now
        item["expired"] = expires <= now
        selected.append(item)
    return {
        "schema": "profile-performance-consumer-state-v1",
        "database_access": "Read-only SQLite with committed WAL visibility",
        "observed_at": now.isoformat(),
        "project_ids": projects,
        "retained_total": total,
        "owned_records": selected,
        "owned_live_count": sum(item["live"] for item in selected),
        "retention_policy": "Released records remain until expiry/pruning; retained is not live",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    trial = commands.add_parser("preflight")
    trial.add_argument("--database", type=Path, required=True)
    trial.add_argument("--data-dir", type=Path, required=True)
    trial.add_argument("--requirements", type=Path, required=True)
    trial.add_argument("--output-dir", type=Path, required=True)
    published = commands.add_parser("current-context")
    published.add_argument("--database", type=Path, required=True)
    published.add_argument("--data-dir", type=Path, required=True)
    published.add_argument("--requirements", type=Path, required=True)
    published.add_argument("--output-dir", type=Path, required=True)
    consumers = commands.add_parser("consumer-state")
    consumers.add_argument("--database", type=Path, required=True)
    consumers.add_argument("--data-dir", type=Path, required=True)
    consumers.add_argument("--projects", type=Path, required=True)
    consumers.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "preflight":
        preflight(args.database, args.data_dir, args.requirements, args.output_dir)
    elif args.command == "current-context":
        current_context(
            args.database,
            args.data_dir,
            json.loads(args.requirements.read_bytes()),
            args.output_dir,
        )
    else:
        assert not args.output.exists(), "Preserve earlier consumer-state evidence"
        dump(
            args.output,
            consumer_state(args.database, args.data_dir, json.loads(args.projects.read_bytes())),
        )


if __name__ == "__main__":
    main()
