"""Actual preceding-reader qualification for additive hydrogen artifacts and history."""

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
from tests.support.modeling_reader_qualification import allocation_counters, canonical


def produce_hydrogens(client: ApiClient, data_dir: Path) -> dict[str, Any]:
    from molweave_core.molecular import Conformer

    from tests.integration.test_model_edits import edit
    from tests.support.editing_fixture import build_fixture
    from tests.support.hydrogen_fixture import model

    baseline = produce_edits(client, data_dir)
    structure = model("CC(C)C(=O)Nc1ccc(O)cc1.C[C@H](O)F", remove_h_on={1, 15})
    # Independently translated conformer and inherited alternate label.
    structure = structure.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"alternate_location": "A"}) if a.id == 1 else a
                for a in structure.atoms
            ],
            "conformers": [
                *structure.conformers,
                Conformer(
                    id=9,
                    name="Translated",
                    coordinates=[
                        (x + 10.0, y - 5.0, z + 2.0) for x, y, z in structure.active_coordinates
                    ],
                ),
            ],
        }
    )
    project = import_archive(client, build_fixture(structure))["project"]
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry_id}/original").content
    transitions = []
    actions = [
        ([1], {"operation": "hydrogens.complete", "scope": "selection"}),
        (
            [15],
            {"operation": "hydrogens.add", "count": 1, "geometry": "tetrahedral", "orientation": 2},
        ),
    ]
    for ids, action in actions:
        before = canonical(client, project)
        response = edit(client, project, entry_id, ids, action)
        assert response.status_code == 200, response.text
        assert response.json()["applied"] and response.json()["report"]["created_atom_ids"]
        project = response.json()["project"]
        transitions.append({"before": before, "after": canonical(client, project)})
    project = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    archive = export_archive(client, project["id"], "hydrogen-reader")
    archive_bytes = client.get(archive["artifact"]["download_url"]).content
    (data_dir / "hydrogens.molweave.zip").write_bytes(archive_bytes)
    state = {
        "producer": APPLICATION_VERSION,
        "project": project,
        "entry_id": entry_id,
        "canonical": canonical(client, project),
        "transitions": transitions,
        "counters": allocation_counters(client, project),
        "original_sha256": hashlib.sha256(original).hexdigest(),
    }
    (data_dir / "hydrogen-expectations.json").write_text(json.dumps(state))
    return {
        "baseline": baseline,
        "producer": APPLICATION_VERSION,
        "hydrogen_commands": len(transitions),
        "archive_sha256": hashlib.sha256(archive_bytes).hexdigest(),
    }


def read_hydrogens(client: ApiClient, data_dir: Path, version: str) -> dict[str, Any]:
    baseline = read_edits(client, data_dir, version)
    state = json.loads((data_dir / "hydrogen-expectations.json").read_text())
    path = f"/api/v1/projects/{state['project']['id']}"
    project = client.get(path).json()
    assert canonical(client, project) == state["canonical"]
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
    assert allocation_counters(client, project) == state["counters"]
    assert (
        hashlib.sha256(
            client.get(f"{path}/entries/{state['entry_id']}/original").content
        ).hexdigest()
        == state["original_sha256"]
    )
    project = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    restored = import_archive(client, (data_dir / "hydrogens.molweave.zip").read_bytes())["project"]
    assert canonical(client, restored) == state["canonical"]
    assert allocation_counters(client, restored) == state["counters"]
    reexport = export_archive(client, project["id"], "preceding-hydrogen-reexport")
    again = import_archive(client, client.get(reexport["artifact"]["download_url"]).content)[
        "project"
    ]
    assert canonical(client, again) == state["canonical"]
    return {
        "baseline": baseline,
        "producer": state["producer"],
        "reader": APPLICATION_VERSION,
        "hydrogen_artifacts_annotations_inferences_exact": True,
        "all_conformer_coordinates_exact": True,
        "original_bytes_exact": True,
        "hydrogen_history_undo_redo_exact": True,
        "allocation_counters_exact": True,
        "save_archive_reexport_exact": True,
        "limitations": [
            "The preceding runtime does not implement the new completion actions or "
            "controls; use the current version for continued hydrogen building.",
            "Existing schema downgrade guards remain in force.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--reader-root", type=Path)
    parser.add_argument("--expected-reader", default="0.17.0")
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
            produce_hydrogens(client, data_dir)
            if args.mode == "produce"
            else read_hydrogens(client, data_dir, args.expected_reader)
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
