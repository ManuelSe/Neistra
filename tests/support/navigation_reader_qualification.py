"""Qualify unchanged schema-2 surfaces against an actual tagged API/core reader.

Run this harness from the current checkout with reader API/core/plugin paths on
PYTHONPATH. --reader-root verifies the actual implementation is the tagged tree,
not the candidate with an altered version string. Use only fresh disposable data.
"""
from __future__ import annotations

import argparse
import json
from copy import deepcopy
from pathlib import Path
from typing import Any

import molweave_api.main
import molweave_core
from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.integration.test_archive_roundtrip import build_rich_project, import_archive
from tests.support.api_client import ApiClient
from tests.support.transform_reader_qualification import produce, read


def surface_project(client: ApiClient) -> dict[str, Any]:
    project = build_rich_project(client)
    receptor = next(e for e in project["entries"] if e["source_format"] == "pdb")
    ligand = next(e for e in project["entries"] if e["source_format"] == "mol")
    response = client.post(f"/api/v1/projects/{project['id']}/surfaces", json={
        "expected_revision": project["revision"], "surfaces": [
            {"entry_id": receptor["id"], "source": {"kind": "entry"}, "name": "Receptor"},
            {"entry_id": receptor["id"], "source": {"kind": "fragment", "atom_ids": [1, 2]},
             "name": "Fragment"},
            {"entry_id": receptor["id"], "name": "Pocket", "source": {
                "kind": "pocket", "radius": 5,
                "seed_atom_references": [{"structure_id": ligand["id"], "atom_id": 1}],
            }},
        ],
    })
    assert response.status_code == 200, response.text
    project = response.json()
    response = client.post(f"/api/v1/projects/{project['id']}/scenes", json={
        "expected_revision": project["revision"], "name": "Surface navigation baseline",
        "camera": project["scenes"][0]["camera"], "selection": project["scenes"][0]["selection"],
    })
    assert response.status_code == 201, response.text
    return dict(response.json())


def qualify_surfaces(client: ApiClient, data_dir: Path, expected_reader: str) -> dict[str, Any]:
    expected = json.loads((data_dir / "reader-expectations.json").read_text())
    path = f"/api/v1/projects/{expected['project']['id']}"
    before = client.get(path).json()
    assert before["schema_version"] == 2
    assert before["scenes"] == expected["project"]["scenes"]
    for entry in before["entries"]:
        original = next(e for e in expected["project"]["entries"] if e["id"] == entry["id"])
        assert entry["viewer_settings"] == original["viewer_settings"]
    assert sum(len(e["viewer_settings"]["surface_objects"]) for e in before["entries"]) == 3
    result = read(client, data_dir, expected_reader)
    after = client.get(path).json()
    assert after["scenes"] == before["scenes"]
    for entry in after["entries"]:
        original = next(e for e in before["entries"] if e["id"] == entry["id"])
        assert entry["viewer_settings"] == original["viewer_settings"]
    restored = import_archive(client, (data_dir / "moved.molweave.zip").read_bytes())["project"]
    mapping = {e["id"]: next(n["id"] for n in restored["entries"] if n["name"] == e["name"])
               for e in before["entries"]}
    for entry in restored["entries"]:
        original = next(e for e in before["entries"] if mapping[e["id"]] == entry["id"])
        settings = deepcopy(original["viewer_settings"])
        for surface in settings["surface_objects"]:
            if surface["source"]["kind"] == "pocket":
                for reference in surface["source"]["seed_atom_references"]:
                    reference["structure_id"] = mapping[reference["structure_id"]]
        assert entry["viewer_settings"] == settings
    assert len(restored["scenes"]) == len(before["scenes"])
    result.update(surface_objects_exact=True, scenes_exact=True,
                  archive_surface_seed_remapping=True, surface_objects=3)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--expected-reader", default="0.14.0")
    parser.add_argument("--reader-root", type=Path)
    args = parser.parse_args()
    if args.mode == "read":
        assert args.reader_root is not None, "An actual tagged reader path is required"
        assert Path(molweave_api.main.__file__).resolve().is_relative_to(args.reader_root.resolve())
        assert Path(molweave_core.__file__).resolve().is_relative_to(args.reader_root.resolve())
    data_dir = args.data_dir.resolve()
    client = ApiClient(create_app(Settings(data_dir=data_dir,
        database_url=f"sqlite:///{data_dir / 'molweave.db'}")))
    try:
        result = (produce(client, data_dir, surface_project(client)) if args.mode == "produce"
                  else qualify_surfaces(client, data_dir, args.expected_reader))
        result.update(
            api_module=molweave_api.main.__file__, core_module=molweave_core.__file__,
            application_version=APPLICATION_VERSION
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        client.app.state.engine.dispose()


if __name__ == "__main__":
    main()
