"""Exercise current draft persistence with an actual tagged preceding API/core.

This intentionally distinguishes canonical retention from old renderer support.
Run produce and read in separate processes with explicit implementation PYTHONPATHs.
Only use freshly migrated disposable data, never a user's managed directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import molweave_api.main
import molweave_core
from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.support.api_client import ApiClient
from tests.support.editing_reader_qualification import produce_edits, read_edits


def canonical(client: ApiClient, project: dict[str, Any]) -> dict[str, Any]:
    result = {}
    for entry in project["entries"]:
        response = client.get(f"/api/v1/artifacts/{entry['current_artifact_id']}")
        assert response.status_code == 200, response.text
        result[entry["name"]] = response.json()
    return result


def allocation_counters(client: ApiClient, project: dict[str, Any]) -> dict[str, list[int]]:
    from molweave_api.models import StructureEntry

    with client.app.state.session_factory() as session:
        result = {}
        for entry in project["entries"]:
            row = session.get(StructureEntry, entry["id"])
            assert row is not None
            result[entry["name"]] = [row.next_atom_id, row.next_bond_id]
        return result


def produce_models(client: ApiClient, data_dir: Path) -> dict[str, Any]:
    from tests.integration.test_direct_modeling_qualification import imported
    from tests.integration.test_model_edits import edit
    from tests.support.editing_fixture import build_fixture
    from tests.support.modeling_fixture import paracetamol

    baseline = produce_edits(client, data_dir)
    project = import_archive(client, build_fixture(paracetamol(orphan_h=True)))["project"]
    path = f"/api/v1/projects/{project['id']}"
    transitions = []

    def apply(entry_id: str, ids: list[int], action: dict[str, Any]) -> None:
        nonlocal project
        before = canonical(client, project)
        response = edit(client, project, entry_id, ids, action)
        assert response.status_code == 200, response.text
        project = response.json()["project"]
        transitions.append({"before": before, "after": canonical(client, project)})

    entry_id = project["entries"][0]["id"]
    original = client.get(f"{path}/entries/{entry_id}/original").content
    bond = next(
        b
        for b in canonical(client, project)[project["entries"][0]["name"]]["bonds"]
        if b["aromatic"]
    )
    apply(entry_id, [bond["atom_1_id"], bond["atom_2_id"]], {"operation": "bond.delete"})
    apply(entry_id, [1], {"operation": "atom.charge.set", "charge": None})
    apply(entry_id, [1], {"operation": "atom.add", "element": "P", "charge": None})
    before = canonical(client, project)
    response = client.post(
        f"{path}/molecules",
        json={
            "expected_revision": project["revision"],
            "name": "Generated empty",
            "element": "C",
            "charge": 0,
        },
    )
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    generated_id = response.json()["entry_id"]
    transitions.append({"before": before, "after": canonical(client, project)})
    apply(generated_id, [1], {"operation": "atom.add", "element": "N", "charge": None})
    apply(generated_id, [1, 2], {"operation": "atom.delete"})
    saved = client.post(f"{path}/save", json={"expected_revision": project["revision"]})
    assert saved.status_code == 200, saved.text
    project = saved.json()
    archive = export_archive(client, project["id"], "direct-modeling-reader")
    archive_bytes = client.get(archive["artifact"]["download_url"]).content
    (data_dir / "drafts.molweave.zip").write_bytes(archive_bytes)
    # A separately imported real multi-model/alternate-site structure tests new
    # topology while preserving retained coordinates in all models.
    multi, multi_id = imported(client, "protein_models_altloc.pdb")
    atom = next(
        a
        for a in canonical(client, multi)[multi["entries"][0]["name"]]["atoms"]
        if a["alternate_location"] == "A"
    )
    response = edit(
        client, multi, multi_id, [atom["id"]], {"operation": "atom.add", "element": "P"}
    )
    assert response.status_code == 200, response.text
    multi = response.json()["project"]
    state = {
        "producer": APPLICATION_VERSION,
        "project": project,
        "canonical": canonical(client, project),
        "allocation_counters": allocation_counters(client, project),
        "transitions": transitions,
        "original_sha256": hashlib.sha256(original).hexdigest(),
        "original_entry": entry_id,
        "multiconformer_project": multi,
        "multiconformer_canonical": canonical(client, multi),
    }
    (data_dir / "modeling-expectations.json").write_text(json.dumps(state))
    return {
        "baseline": baseline,
        "producer": APPLICATION_VERSION,
        "direct_transitions": len(transitions),
        "draft_archive_sha256": hashlib.sha256(archive_bytes).hexdigest(),
    }


def read_models(client: ApiClient, data_dir: Path, version: str) -> dict[str, Any]:
    baseline = read_edits(client, data_dir, version)
    state = json.loads((data_dir / "modeling-expectations.json").read_text())
    path = f"/api/v1/projects/{state['project']['id']}"
    project = client.get(path).json()
    assert canonical(client, project) == state["canonical"]
    original = client.get(f"{path}/entries/{state['original_entry']}/original").content
    assert hashlib.sha256(original).hexdigest() == state["original_sha256"]
    for direction, transitions in [
        ("undo", reversed(state["transitions"])),
        ("redo", state["transitions"]),
    ]:
        for transition in transitions:
            response = client.post(
                f"{path}/history/{direction}", json={"expected_revision": project["revision"]}
            )
            assert response.status_code == 200, response.text
            project = response.json()
            assert (
                canonical(client, project)
                == transition["before" if direction == "undo" else "after"]
            )
    restored = import_archive(client, (data_dir / "drafts.molweave.zip").read_bytes())["project"]
    assert canonical(client, restored) == state["canonical"]
    assert allocation_counters(client, project) == state["allocation_counters"]
    assert allocation_counters(client, restored) == state["allocation_counters"]
    empty = next(e for e in restored["entries"] if e["name"] == "Generated empty")
    assert empty["atom_count"] == 0 and empty["original_artifact_id"] is None
    assert empty["source_format"] is None
    old_export = export_archive(client, project["id"], "old-reader-draft-reexport")
    again = import_archive(client, client.get(old_export["artifact"]["download_url"]).content)[
        "project"
    ]
    assert canonical(client, again) == state["canonical"]
    multi = client.get(f"/api/v1/projects/{state['multiconformer_project']['id']}").json()
    assert canonical(client, multi) == state["multiconformer_canonical"]
    # Actual old ligand projection tries to kekulize the broken aromatic graph.
    # This expected refusal must never be disguised as full runtime rollback.
    try:
        response = client.get(f"{path}/entries/{state['original_entry']}/structure")
    except (RuntimeError, ValueError) as error:
        limitation = {"type": type(error).__name__, "message": str(error)}
    else:
        assert response.status_code >= 400, "Update rollback evidence if old rendering changes."
        limitation = {"http_status": response.status_code, "message": response.text}
    from tests.integration.test_selection_edits import edit as helper_edit

    before_helper = canonical(client, project)
    refusal = helper_edit(
        client, project, state["original_entry"], [1], {"operation": "hydrogens.prepare"}
    )
    assert refusal.status_code == 422, refusal.text
    assert canonical(client, client.get(path).json()) == before_helper
    return {
        "old_helper_draft_refusal_http_status": refusal.status_code,
        "baseline": baseline,
        "producer": state["producer"],
        "reader": APPLICATION_VERSION,
        "canonical_drafts_unknowns_exclusions_exact": True,
        "direct_history_undo_redo_exact": True,
        "recreated_entry_allocator_floors_exact": True,
        "generated_empty_archive_reexport_exact": True,
        "multiconformer_altloc_exact": True,
        "original_bytes_exact": True,
        "expected_old_aromatic_renderer_refusal": limitation,
        "runtime_rollback_supported": False,
        "additional_limitations": [
            "The old UI lacks native authored-bond overlay/exclusions and the new builder.",
            "Old chemistry helpers retain prepared-component prerequisites.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--reader-root", type=Path)
    parser.add_argument("--expected-reader", default="0.16.0")
    args = parser.parse_args()
    if args.mode == "read":
        assert args.reader_root is not None and APPLICATION_VERSION == args.expected_reader
        for module in [molweave_api.main, molweave_core]:
            assert Path(module.__file__).resolve().is_relative_to(args.reader_root.resolve())
    data_dir = args.data_dir.resolve()
    client = ApiClient(
        create_app(
            Settings(data_dir=data_dir, database_url=f"sqlite:///{data_dir / 'molweave.db'}")
        )
    )
    try:
        result = (
            produce_models(client, data_dir)
            if args.mode == "produce"
            else read_models(client, data_dir, args.expected_reader)
        )
        result.update(
            api_module=molweave_api.main.__file__,
            core_module=molweave_core.__file__,
            application_version=APPLICATION_VERSION,
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        client.app.state.engine.dispose()


if __name__ == "__main__":
    main()
