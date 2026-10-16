"""Qualify edited artifacts/history with an actual tagged preceding-release reader."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import molweave_api.main
import molweave_core
from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.support.api_client import ApiClient
from tests.support.navigation_reader_qualification import qualify_surfaces, surface_project
from tests.support.transform_reader_qualification import produce, structure


def produce_edits(client: ApiClient, data_dir: Path) -> dict[str, Any]:
    # Existing rich objects (scenes, selections, measurements, three surface
    # kinds) remain present. Add a genuinely prepared 3D ligand for new chemistry.
    from tests.integration.test_selection_edits import edit
    from tests.support.editing_fixture import FIXTURE

    project = surface_project(client)
    path = f"/api/v1/projects/{project['id']}"
    response = client.post(
        f"{path}/imports",
        data={"expected_revision": project["revision"]},
        files={
            "files": (
                "ethanol-3d.mol",
                (FIXTURE.parent / "ethanol-3d.mol").read_bytes(),
                "chemical/x-mdl-molfile",
            )
        },
    )
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    ligand = next(
        e for e in project["entries"] if e["id"] == response.json()["imported_entry_ids"][0]
    )
    protein = next(e for e in project["entries"] if e["source_format"] == "pdb")
    transitions = []

    def apply(entry_id: str, ids: list[int], action: dict[str, Any]) -> None:
        nonlocal project
        before = structure(client, project["id"], entry_id)
        response = edit(client, project, entry_id, ids, action)
        assert response.status_code == 200, response.text
        project = response.json()["project"]
        transitions.append(
            {
                "entry_id": entry_id,
                "before": before,
                "after": structure(client, project["id"], entry_id),
                "operation": action["operation"],
            }
        )

    apply(ligand["id"], [1], {"operation": "hydrogens.prepare"})
    prepared = structure(client, project["id"], ligand["id"])
    h = next(
        a["id"]
        for a in prepared["atoms"]
        if a["element"] == "H"
        and any({b["atom_1_id"], b["atom_2_id"]} == {a["id"], 1} for b in prepared["bonds"])
    )
    apply(ligand["id"], [h], {"operation": "fragment.replace", "fragment": "phenyl"})
    apply(ligand["id"], [3], {"operation": "atom.element", "element": "N"})
    apply(ligand["id"], [3], {"operation": "atom.charge", "delta": 1})
    peptide = structure(client, project["id"], protein["id"])
    apply(
        protein["id"],
        [a["id"] for a in peptide["atoms"] if a["residue_id"] == 1],
        {"operation": "residue.mutate", "target_name": "VAL"},
    )
    result = produce(client, data_dir, project)
    (data_dir / "editing-transitions.json").write_text(json.dumps(transitions))
    result.update(selection_edit_operations=[t["operation"] for t in transitions])
    return result


def read_edits(client: ApiClient, data_dir: Path, version: str) -> dict[str, Any]:
    result = qualify_surfaces(client, data_dir, version)
    state = json.loads((data_dir / "reader-expectations.json").read_text())
    transitions = json.loads((data_dir / "editing-transitions.json").read_text())
    path = f"/api/v1/projects/{state['project']['id']}"
    project = client.get(path).json()

    def history(direction: str) -> None:
        nonlocal project
        response = client.post(
            f"{path}/history/{direction}", json={"expected_revision": project["revision"]}
        )
        assert response.status_code == 200, response.text
        project = response.json()

    history("undo")  # generic qualifier transform
    history("undo")  # generic qualifier unlock command
    for transition in reversed(transitions):
        history("undo")
        assert structure(client, project["id"], transition["entry_id"]) == transition["before"]
    for transition in transitions:
        history("redo")
        assert structure(client, project["id"], transition["entry_id"]) == transition["after"]
    history("redo")  # unlock
    history("redo")  # transform
    for entry_id, after in state["after"].items():
        assert structure(client, project["id"], entry_id) == after
    assert client.get(f"{path}/jobs").json() == state["jobs"]
    result.update(edited_history_undo_redo_exact=True, selection_edit_commands=len(transitions))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--expected-reader", default="0.15.0")
    parser.add_argument("--reader-root", type=Path)
    args = parser.parse_args()
    if args.mode == "read":
        assert args.reader_root is not None
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
            produce_edits(client, data_dir)
            if args.mode == "produce"
            else read_edits(client, data_dir, args.expected_reader)
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
