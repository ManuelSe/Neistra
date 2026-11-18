"""Source-bound ordered-measurement producer/reader for actual release checkouts.

Run this wrapper by absolute path with cwd/PYTHONPATH selecting one implementation
before Python starts. API, core and shared helpers come from that implementation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import runpy
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any

from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.integration.test_archive_roundtrip import export_archive
from tests.support.api_client import ApiClient
from tests.support.rebranding_reader_qualification import (
    assert_portable_display,
    module_provenance,
)
from tests.support.transform_reader_qualification import original_hash, structure

JsonObject = dict[str, Any]


def boundary_tools() -> dict[str, Any]:
    """Current qualification oracles, with actual selected API/core imports."""
    return runpy.run_path(str(Path(__file__).with_name("rebranding_reader_qualification.py")))


def ordered_project(client: ApiClient) -> tuple[JsonObject, list[JsonObject]]:
    response = client.post("/api/v1/projects", json={"name": "Ordered measurement qualification"})
    assert response.status_code == 201, response.text
    project = response.json()
    path = f"/api/v1/projects/{project['id']}"
    # Independent noncoplanar analytic Cartesian points, with overlapping stable
    # atom IDs in two entries; source bytes are also qualified after reopening.
    points = ["0 0 1", "0 0 0", "1 0 0", "1 1 0"]
    files = []
    for name, offset in [("ordered-a.xyz", 0), ("ordered-b.xyz", 10)]:
        rows = [f"C {float(p.split()[0]) + offset} {' '.join(p.split()[1:])}" for p in points]
        data = ("4\nOrdered measurement points\n" + "\n".join(rows) + "\n").encode()
        files.append(("files", (name, data, "chemical/x-xyz")))
    response = client.post(
        f"{path}/imports", data={"expected_revision": project["revision"]}, files=files
    )
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    a, b = project["entries"]
    for entry, action in [(a, "visibility"), (b, "lock")]:
        response = client.post(
            f"{path}/entries/{entry['id']}/{action}",
            json={
                "expected_revision": project["revision"],
                "value": action == "lock",
            },
        )
        assert response.status_code == 200, response.text
        project = response.json()

    def ref(entry: JsonObject, atom: int) -> JsonObject:
        return {"structure_id": entry["id"], "atom_id": atom}

    for kind, refs in [
        ("distance", [ref(b, 4), ref(a, 1)]),
        ("angle", [ref(b, 3), ref(a, 2), ref(a, 1)]),
        ("dihedral", [ref(b, 4), ref(a, 2), ref(b, 3), ref(a, 1)]),
    ]:
        response = client.post(
            f"{path}/measurements",
            json={
                "expected_revision": project["revision"],
                "name": f"Ordered {kind}",
                "kind": kind,
                "atom_references": refs,
            },
        )
        assert response.status_code == 201, response.text
        project = response.json()
        assert project["measurements"][-1]["atom_references"] == refs
    before_update = client.get(path).json()["measurements"]
    angle = next(m for m in before_update if m["kind"] == "angle")
    response = client.patch(
        f"{path}/measurements/{angle['id']}",
        json={
            "expected_revision": project["revision"],
            "name": "Ordered \N{GREEK SMALL LETTER ALPHA} angle — complete retained name "
            + "x" * 70,
            "visible": False,
        },
    )
    assert response.status_code == 200, response.text
    return response.json(), before_update


def assert_ordered_state(actual: JsonObject, expected: JsonObject) -> dict[str, str]:
    mapping = assert_portable_display(actual, expected)
    assert [m["kind"] for m in actual["measurements"]] == ["distance", "angle", "dihedral"]
    assert (
        len({r["structure_id"] for m in actual["measurements"] for r in m["atom_references"]}) == 2
    )
    assert next(m for m in actual["measurements"] if m["kind"] == "angle")["visible"] is False
    return mapping


def negative_controls(actual: JsonObject, expected: JsonObject) -> list[str]:
    rejected = []
    for label in ["ordered_targets", "visibility", "full_name"]:
        changed = deepcopy(actual)
        angle = next(m for m in changed["measurements"] if m["kind"] == "angle")
        if label == "ordered_targets":
            angle["atom_references"][0], angle["atom_references"][1] = (
                angle["atom_references"][1],
                angle["atom_references"][0],
            )
        elif label == "visibility":
            angle["visible"] = True
        else:
            angle["name"] = angle["name"][:-1]
        try:
            assert_ordered_state(changed, expected)
        except AssertionError:
            rejected.append(label)
        else:
            raise AssertionError(f"Ordered comparison accepted {label}")
    return rejected


def produce_ordered(client: ApiClient, data: Path) -> JsonObject:
    project, before_update = ordered_project(client)
    path = f"/api/v1/projects/{project['id']}"
    response = client.post(f"{path}/save", json={"expected_revision": project["revision"]})
    assert response.status_code == 200, response.text
    project = client.get(path).json()
    assert project["has_uncheckpointed_changes"] is False
    entries = project["entries"]
    expected = {
        "producer": APPLICATION_VERSION,
        "project": project,
        "before_update": before_update,
        "structures": {e["id"]: structure(client, project["id"], e["id"]) for e in entries},
        "originals": {e["id"]: original_hash(client, project["id"], e["id"]) for e in entries},
    }
    exported = export_archive(client, project["id"], "ordered-producer")
    archive = client.get(exported["artifact"]["download_url"]).content
    (data / "ordered.neistra.zip").write_bytes(archive)
    (data / "ordered-expectations.json").write_text(json.dumps(expected, indent=2) + "\n")
    return {
        "producer": APPLICATION_VERSION,
        "ordered_cross_entry_records": 3,
        "archive_sha256": hashlib.sha256(archive).hexdigest(),
        "negative_controls_rejected": negative_controls(project, project),
    }


def assert_history_records(actual: list[JsonObject], expected: list[JsonObject]) -> None:
    assert len(actual) == len(expected)
    for observed, previous in zip(actual, expected, strict=True):
        assert {k: v for k, v in observed.items() if k != "modified_at"} == {
            k: v for k, v in previous.items() if k != "modified_at"
        }
        # History is a new command: its modification timestamp advances while all
        # IDs, ordered references, names, visibility and creation dates restore.
        assert datetime.fromisoformat(observed["modified_at"]) >= datetime.fromisoformat(
            previous["modified_at"]
        )


def read_ordered(client: ApiClient, data: Path) -> JsonObject:
    expected = json.loads((data / "ordered-expectations.json").read_text())
    original = boundary_tools()["selected_expected_project"](expected["project"])
    path = f"/api/v1/projects/{original['id']}"
    project = client.get(path).json()
    assert project == original
    for entry in project["entries"]:
        entry_id = entry["id"]
        assert structure(client, project["id"], entry_id) == expected["structures"][entry_id]
        assert original_hash(client, project["id"], entry_id) == expected["originals"][entry_id]
    response = client.post(f"{path}/history/undo", json={"expected_revision": project["revision"]})
    assert response.status_code == 200, response.text
    undone = response.json()
    assert_history_records(undone["measurements"], expected["before_update"])
    response = client.post(f"{path}/history/redo", json={"expected_revision": undone["revision"]})
    assert response.status_code == 200, response.text
    project = response.json()
    assert_history_records(project["measurements"], original["measurements"])
    for actual, baseline in zip(project["entries"], original["entries"], strict=True):
        assert actual.get("ligand_designation") == baseline.get("ligand_designation")
    response = client.post(f"{path}/save", json={"expected_revision": project["revision"]})
    assert response.status_code == 200, response.text
    assert response.json()["has_uncheckpointed_changes"] is False
    project = client.get(path).json()
    reexport = export_archive(client, project["id"], "ordered-reader")
    reexported = client.get(reexport["artifact"]["download_url"]).content
    checks = []
    for origin, archive in [
        ("producer", (data / "ordered.neistra.zip").read_bytes()),
        ("reader", reexported),
    ]:
        for suffix in ["molweave", "neistra"]:
            response = client.post(
                "/api/v1/projects/import-archive",
                files={
                    "file": (f"ordered-{origin}.{suffix}.zip", archive, "application/zip"),
                },
            )
            assert response.status_code == 201, response.text
            restored = response.json()["project"]
            source_project = original if origin == "producer" else project
            mapping = assert_ordered_state(restored, source_project)
            assert restored["history"]["retained_commands"] == 0
            assert restored["has_uncheckpointed_changes"] is False
            for old, new in mapping.items():
                assert structure(client, restored["id"], new) == expected["structures"][old]
                assert original_hash(client, restored["id"], new) == expected["originals"][old]
            checks.append(
                {
                    "origin": origin,
                    "suffix": suffix,
                    "http": 201,
                    "all_records_order_names_visibility_sources_exact": True,
                    "negative_controls_rejected": negative_controls(restored, source_project),
                }
            )
    return {
        "producer": expected["producer"],
        "reader": APPLICATION_VERSION,
        "live_store_all_records_exact": True,
        "last_update_undo_redo_content_exact_modified_time_monotonic": True,
        "both_suffixes_import_and_reexport": checks,
        "archive_history_contract": "Current-state snapshots omit live command history",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read", "refuse"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--implementation-root", type=Path, required=True)
    parser.add_argument("--expected-version", required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--schema-boundary", action="store_true")
    parser.add_argument("--refusal-data", type=Path)
    parser.add_argument("--archives-dir", type=Path)
    parser.add_argument("--expect-ordered-measurements", action="store_true")
    args = parser.parse_args()
    implementation, data = args.implementation_root.resolve(), args.data_dir.resolve()
    assert APPLICATION_VERSION == args.expected_version
    module_provenance(implementation)
    common = boundary_tools()
    common_path = Path(__file__).with_name("rebranding_reader_qualification.py")
    tool_identity = {"path": str(common_path),
                     "sha256": hashlib.sha256(common_path.read_bytes()).hexdigest()}
    if args.mode == "refuse":
        assert args.refusal_data is not None and args.archives_dir is not None
        archive_root = args.archives_dir.resolve()
        specimen = json.loads((archive_root / "ordered-expectations.json").read_text())
        result = common["boundary_refuse"](
            implementation, args.refusal_data.resolve(), data, specimen["project"],
            [archive_root / "ordered.neistra.zip"],
        )
        result.update(
            mode="refuse", application_version=APPLICATION_VERSION,
            implementation_root=str(implementation),
            imported_module_provenance=module_provenance(implementation),
            wrapper_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            common_wrapper=tool_identity,
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
        return
    before_heads = common["boundary_prepare_read"](implementation, data, args.schema_boundary)
    app = create_app(Settings(data_dir=data, database_url=f"sqlite:///{data / 'molweave.db'}"))
    assert app.version == args.expected_version
    client = ApiClient(app)
    try:
        result = (
            produce_ordered(client, data) if args.mode == "produce" else read_ordered(client, data)
        )
        result.update(
            application_version=APPLICATION_VERSION, mode=args.mode,
            protocol="schema-boundary-v1" if args.schema_boundary else "retention-v1",
            database_heads_before=before_heads, database_heads=common["boundary_heads"](data),
            wrapper_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            implementation_root=str(implementation),
            imported_module_provenance=module_provenance(implementation),
            common_wrapper=tool_identity,
            exact_migrated_designation_defaults=args.schema_boundary,
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        app.state.engine.dispose()


if __name__ == "__main__":
    main()
