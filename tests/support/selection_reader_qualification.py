"""Qualify canonical gesture results with actual tagged/current implementations.

Run produce/read in separate processes on disposable migrated data. This reuses
existing rich-project, surface, archive, job and generic-history qualification;
it does not claim an older UI implements the new gestures.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import molweave_api.main
import molweave_core
import molweave_demo_plugin
from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings
from molweave_core.selection import AtomReference, selection

from tests.integration.test_archive_roundtrip import import_archive
from tests.support.api_client import ApiClient
from tests.support.navigation_reader_qualification import qualify_surfaces, surface_project
from tests.support.transform_reader_qualification import produce


def gesture_project(client: ApiClient) -> dict[str, Any]:
    project = surface_project(client)
    path = f"/api/v1/projects/{project['id']}"
    protein = next(e for e in project["entries"] if e["source_format"] == "pdb")
    ligand = next(e for e in project["entries"] if e["source_format"] == "mol")
    payload = client.get(f"{path}/entries/{protein['id']}/structure").json()
    molecular = payload["structure"]
    component = next(c for c in payload["hierarchy"]["components"] if c["category"] == "protein")
    residues = [r for r in molecular["residues"] if r["id"] in component["residue_ids"]]
    residue_ids = {r["id"] for r in residues[:3]}
    # A representative canonical range plus unrelated ligand reference. Native
    # browser tests independently prove that gestures yield these wire shapes.
    chosen = selection(
        [
            AtomReference(structure_id=protein["id"], atom_id=a["id"])
            for a in molecular["atoms"] if a["residue_id"] in residue_ids
        ] + [AtomReference(structure_id=ligand["id"], atom_id=1)],
        granularity="residue", source="viewer",
    ).model_dump(mode="json")
    response = client.post(f"{path}/selections", json={
        "expected_revision": project["revision"], "name": "Gesture range", "selection": chosen,
    })
    assert response.status_code == 201, response.text
    project = response.json()
    response = client.post(f"{path}/scenes", json={
        "expected_revision": project["revision"], "name": "Gesture range view",
        "camera": project["scenes"][0]["camera"], "selection": chosen,
    })
    assert response.status_code == 201, response.text
    return dict(response.json())


def read_gestures(client: ApiClient, data: Path, expected_reader: str) -> dict[str, Any]:
    expected = json.loads((data / "reader-expectations.json").read_text())
    project = expected["project"]
    result = qualify_surfaces(client, data, expected_reader)
    current = client.get(f"/api/v1/projects/{project['id']}").json()
    assert current["saved_selections"] == project["saved_selections"]
    assert current["scenes"] == project["scenes"]
    restored = import_archive(client, (data / "moved.molweave.zip").read_bytes())["project"]
    by_name = {e["name"]: e["id"] for e in restored["entries"]}
    mapping = {e["id"]: by_name[e["name"]] for e in project["entries"]}

    def remap(atoms: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(
            [{**a, "structure_id": mapping[a["structure_id"]]} for a in atoms],
            key=lambda a: (a["structure_id"], a["atom_id"]),
        )

    for saved in project["saved_selections"]:
        actual = next(s for s in restored["saved_selections"] if s["name"] == saved["name"])
        assert actual["atom_references"] == remap(saved["atom_references"])
        assert actual["granularity"] == saved["granularity"]
    for scene in project["scenes"]:
        actual = next(s for s in restored["scenes"] if s["name"] == scene["name"])
        assert actual["selection"] == {
            **scene["selection"], "atoms": remap(scene["selection"]["atoms"]),
        }
    for value in [current, restored]:
        serialized = json.dumps(value)
        for transient in ['"rangeAnchor"', '"range_anchor"', '"projectEpoch"']:
            assert transient not in serialized
    result.update(named_selections_exact=True, gesture_scene_exact=True,
                  archive_selection_remapping=True, transient_anchor_absent=True)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--implementation-root", type=Path, required=True)
    parser.add_argument("--expected-version", required=True)
    args = parser.parse_args()
    implementation = args.implementation_root.resolve()
    assert APPLICATION_VERSION == args.expected_version
    for module in [molweave_api.main, molweave_core, molweave_demo_plugin]:
        assert Path(module.__file__).resolve().is_relative_to(implementation)
    data = args.data_dir.resolve()
    client = ApiClient(create_app(Settings(
        data_dir=data, database_url=f"sqlite:///{data / 'molweave.db'}",
    )))
    try:
        result = (produce(client, data, gesture_project(client)) if args.mode == "produce"
                  else read_gestures(client, data, args.expected_version))
        result.update(
            api_module=molweave_api.main.__file__, core_module=molweave_core.__file__,
            application_version=APPLICATION_VERSION, implementation_root=str(implementation),
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        client.app.state.engine.dispose()


if __name__ == "__main__":
    main()
