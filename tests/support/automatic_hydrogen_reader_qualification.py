"""Actual v0.23.0/current retention for automatic H, +H and inherited appearance."""

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


def presentation(project: dict[str, Any]) -> dict[str, Any]:
    """Identity-independent durable scene/membership content, including native import."""
    entries = {e["id"]: e["name"] for e in project["entries"]}

    def selected(value: dict[str, Any]) -> dict[str, Any]:
        return {
            **value,
            "atoms": [
                {"entry": entries[a["structure_id"]], "atom_id": a["atom_id"]}
                for a in value["atoms"]
            ],
        }

    return {
        "settings": {e["name"]: e["viewer_settings"] for e in project["entries"]},
        "scenes": [
            {
                "name": s["name"],
                "camera": s["camera"],
                "selection": selected(s["selection"]),
                "states": {
                    entries[e["entry_id"]]: {
                        "visible": e["visible"],
                        "settings": e["viewer_settings"],
                    }
                    for e in s["entry_states"]
                },
            }
            for s in project["scenes"]
        ],
    }


def originals(client: ApiClient, project: dict[str, Any]) -> dict[str, str]:
    result = {}
    for entry in project["entries"]:
        response = client.get(f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original")
        assert response.status_code == 200, response.text
        result[entry["name"]] = hashlib.sha256(response.content).hexdigest()
    return result


def produce(client: ApiClient, data: Path, legacy: bool) -> dict[str, Any]:
    from molweave_core.molecular import Conformer

    from tests.integration.test_model_edits import edit
    from tests.integration.test_viewer_state import apply_style, color_selection, selection
    from tests.support.editing_fixture import build_fixture
    from tests.support.hydrogen_fixture import model

    baseline = produce_edits(client, data)
    states = []
    specimens = (
        []
        if legacy
        else [
            ("ammonium", "N", [1], {"operation": "hydrogens.add_one"}),
            ("hydronium", "O", [1], {"operation": "hydrogens.add_one"}),
            ("sulfonium", "CSC", [2], {"operation": "hydrogens.add_one"}),
            ("cascade", "CC", [1], {"operation": "atom.delete"}),
            ("closure", "CCCC", [1, 4], {"operation": "bond.set", "order": 1}),
            ("fragment", "CC", [1], {"operation": "fragment.attach", "fragment": "ethyl"}),
        ]
    )
    for label, smiles, ids, action in specimens:
        molecule = model(smiles)
        translated = [(x + 7, y - 4, z + 2) for x, y, z in molecule.active_coordinates]
        molecule = molecule.model_copy(
            update={
                "conformers": [
                    *molecule.conformers,
                    Conformer(id=9, name="Independent9", coordinates=translated),
                ],
                "active_conformer_id": 9,
                "atoms": [
                    a.model_copy(update={"coordinates": translated[i]})
                    for i, a in enumerate(molecule.atoms)
                ],
            }
        )
        project = import_archive(client, build_fixture(molecule))["project"]
        entry = project["entries"][0]
        path = f"/api/v1/projects/{project['id']}"
        project = apply_style(client, project, selection(entry["id"], ids[0]), "thick-stick").json()
        project = color_selection(client, project, selection(entry["id"], ids[0]), "#ad12ef").json()
        scene = client.post(
            f"{path}/scenes",
            json={
                "expected_revision": project["revision"],
                "name": "Before edit",
                "selection": selection(entry["id"], ids[0]),
                "camera": {
                    "mode": "perspective",
                    "position": [0, 0, 10],
                    "target": [0, 0, 0],
                    "up": [0, 1, 0],
                    "radius": 10,
                },
            },
        )
        assert scene.status_code == 201, scene.text
        project = scene.json()
        before = canonical(client, project)
        appearance_before = presentation(project)
        response = edit(
            client,
            project,
            entry["id"],
            ids,
            action,
            hydrogen_policy="preserve"
            if action["operation"] == "hydrogens.add_one"
            else "automatic",
        )
        assert response.status_code == 200, response.text
        result = response.json()
        project = result["project"]
        if action["operation"] == "hydrogens.add_one":
            assert len(result["report"]["created_atom_ids"]) == 1
        saved = client.post(f"{path}/save", json={"expected_revision": project["revision"]})
        assert saved.status_code == 200, saved.text
        project = saved.json()
        exported = export_archive(client, project["id"], f"automatic-{label}")
        archive = client.get(exported["artifact"]["download_url"]).content
        (data / f"automatic-{label}.molweave.zip").write_bytes(archive)
        states.append(
            {
                "label": label,
                "project": project,
                "before": before,
                "after": canonical(client, project),
                "appearance_before": appearance_before,
                "appearance_after": presentation(project),
                "originals": originals(client, project),
                "counters": allocation_counters(client, project),
                "archive_sha256": hashlib.sha256(archive).hexdigest(),
            }
        )
    (data / "automatic-expectations.json").write_text(json.dumps(states))
    return {"baseline": baseline, "producer": APPLICATION_VERSION, "automatic_cases": len(states)}


def read(client: ApiClient, data: Path, version: str) -> dict[str, Any]:
    baseline = read_edits(client, data, version)
    states = json.loads((data / "automatic-expectations.json").read_text())
    for state in states:
        path = f"/api/v1/projects/{state['project']['id']}"
        project = client.get(path).json()
        assert canonical(client, project) == state["after"]
        assert presentation(project) == state["appearance_after"]
        assert originals(client, project) == state["originals"]
        assert allocation_counters(client, project) == state["counters"]
        undone = client.post(
            f"{path}/history/undo", json={"expected_revision": project["revision"]}
        )
        assert undone.status_code == 200, undone.text
        assert canonical(client, undone.json()) == state["before"]
        assert presentation(undone.json()) == state["appearance_before"]
        redone = client.post(
            f"{path}/history/redo", json={"expected_revision": undone.json()["revision"]}
        )
        assert redone.status_code == 200, redone.text
        project = redone.json()
        assert canonical(client, project) == state["after"]
        assert presentation(project) == state["appearance_after"]
        saved = client.post(f"{path}/save", json={"expected_revision": project["revision"]})
        assert saved.status_code == 200, saved.text
        archive = (data / f"automatic-{state['label']}.molweave.zip").read_bytes()
        assert hashlib.sha256(archive).hexdigest() == state["archive_sha256"]
        reexport = export_archive(client, project["id"], f"reader-{state['label']}")
        for content in [archive, client.get(reexport["artifact"]["download_url"]).content]:
            restored = import_archive(client, content)["project"]
            assert canonical(client, restored) == state["after"]
            assert presentation(restored) == state["appearance_after"]
            assert originals(client, restored) == state["originals"]
            assert allocation_counters(client, restored) == state["counters"]
    return {
        "baseline": baseline,
        "reader": APPLICATION_VERSION,
        "automatic_cases": len(states),
        "canonical_all_conformers_and_appearance_exact": True,
        "undo_redo_save_archive_reexport_originals_and_counters_exact": True,
        "limitations": [
            "Old runtime retains generic history/data; automatic H and +H authoring "
            "need matching current client/API.",
            "Native archives retain current state, not portable history.",
            "Existing migration downgrade guards remain binding.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--legacy", action="store_true")
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--reader-root", type=Path, required=True)
    parser.add_argument("--expected-reader", required=True)
    args = parser.parse_args()
    assert APPLICATION_VERSION == args.expected_reader
    for module in [molweave_api.main, molweave_core]:
        assert Path(module.__file__).resolve().is_relative_to(args.reader_root.resolve())
    data = args.data_dir.resolve()
    data.mkdir(parents=True, exist_ok=True)
    app = create_app(Settings(data_dir=data, database_url=f"sqlite:///{data / 'molweave.db'}"))
    client = ApiClient(app)
    try:
        result = (
            produce(client, data, args.legacy)
            if args.mode == "produce"
            else read(client, data, args.expected_reader)
        )
        result.update(
            api_module=molweave_api.main.__file__,
            core_module=molweave_core.__file__,
            application_version=APPLICATION_VERSION,
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        app.state.engine.dispose()


if __name__ == "__main__":
    main()
