"""Run against each checkout's real API, core and existing rich reader harness.

Invoke this current wrapper by absolute path, with cwd and PYTHONPATH selecting
one implementation before Python starts. Imports below deliberately use that
implementation's helpers, not copies of its implementation or fixture builders.
"""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, cast

import molweave_api.main
import molweave_core.molecular
from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.integration.test_archive_roundtrip import FIXTURES
from tests.support.api_client import ApiClient
from tests.support.selection_reader_qualification import gesture_project, read_gestures
from tests.support.transform_reader_qualification import original_hash, produce, structure

JsonObject = dict[str, Any]


def styled_project(client: ApiClient) -> JsonObject:
    """Use only APIs shared by the actual 0.29.0 and current implementations."""
    project = gesture_project(client)
    path = f"/api/v1/projects/{project['id']}"
    protein = next(e for e in project["entries"] if e["source_format"] == "pdb")
    ligand = next(e for e in project["entries"] if e["source_format"] == "mol")
    chosen = next(s for s in project["saved_selections"] if s["name"] == "Gesture range")
    mixed = {
        "schema_version": 1,
        "atoms": chosen["atom_references"],
        "granularity": chosen["granularity"],
        "source": "inspector",
    }
    polymer = {
        **mixed,
        "atoms": [r for r in mixed["atoms"] if r["structure_id"] == protein["id"]],
    }
    atomic = {
        **mixed,
        "atoms": [{"structure_id": ligand["id"], "atom_id": 2}],
        "granularity": "atom",
    }
    # Keep the inherited Thick-stick assignment and add a distinct atomic style
    # and a complete-residue polymer assignment. Native geometry has its own gate.
    for target, style in [(atomic, "stick"), (polymer, "cartoon")]:
        response = client.post(f"{path}/selection-representations", json={
            "expected_revision": project["revision"], "selection": target,
            "action": "apply", "style": style,
        })
        assert response.status_code == 200, response.text
        project = response.json()
    response = client.post(f"{path}/selection-appearance", json={
        "expected_revision": project["revision"], "selection": mixed,
        "property": "color", "action": "set", "color": "#74bc90",
    })
    assert response.status_code == 200, response.text
    project = response.json()

    # The original rich fixture has no explicit H. Import an existing small
    # fixture so this is a real persisted override, rather than an empty target.
    response = client.post(f"{path}/imports", data={"expected_revision": project["revision"]},
        files={"files": (
            "reader-hydrogens.mol",
            (FIXTURES.parent / "hydrogens" / "polar_hydrogens_ligand.mol").read_bytes(),
            "chemical/x-mdl-molfile",
        )})
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    hydrogen_entry = next(e for e in project["entries"]
                          if e["original_filename"] == "reader-hydrogens.mol")
    hydrogen_target = {
        **atomic,
        "atoms": [{"structure_id": hydrogen_entry["id"], "atom_id": 2}],
    }
    response = client.post(f"{path}/selection-appearance", json={
        "expected_revision": project["revision"], "selection": hydrogen_target,
        "property": "nonpolar_hydrogens", "action": "set", "show": False,
    })
    assert response.status_code == 200, response.text
    project = response.json()
    actual_hydrogens = next(e for e in project["entries"] if e["id"] == hydrogen_entry["id"])
    assert actual_hydrogens["viewer_settings"]["selection_nonpolar_hydrogens"] == [
        {"show": False, "atom_ids": [2]},
    ]

    appearances = {
        "entry": {"mode": "mesh", "color_by": "custom", "custom_color": "#ab437f",
                  "opacity": 0.31, "inherit_atom_colors": False},
        "fragment": {"mode": "solid", "color_by": "chain", "custom_color": "#2468ac",
                     "opacity": 0.67, "inherit_atom_colors": True},
        "pocket": {"mode": "mesh", "color_by": "custom", "custom_color": "#d58b2f",
                   "opacity": 0.53, "inherit_atom_colors": True},
    }
    surfaces = protein["viewer_settings"]["surface_objects"]
    assert {s["source"]["kind"] for s in surfaces} == set(appearances)
    for surface in surfaces:
        response = client.patch(f"{path}/entries/{protein['id']}/surfaces/{surface['id']}", json={
            "expected_revision": project["revision"],
            "appearance": appearances[surface["source"]["kind"]],
        })
        assert response.status_code == 200, response.text
        project = response.json()
    protein_settings = next(e["viewer_settings"] for e in project["entries"]
                            if e["id"] == protein["id"])
    ligand_settings = next(e["viewer_settings"] for e in project["entries"]
                           if e["id"] == ligand["id"])
    assert protein_settings["selection_representations"] == [
        {"style": "cartoon", "atom_ids": [r["atom_id"] for r in polymer["atoms"]]},
    ]
    assert {s["style"] for s in ligand_settings["selection_representations"]} == {
        "stick", "thick-stick",
    }
    assert protein_settings["selection_colors"] and ligand_settings["selection_colors"]
    for surface in protein_settings["surface_objects"]:
        assert surface["appearance"] == appearances[surface["source"]["kind"]]
    response = client.post(f"{path}/scenes", json={
        "expected_revision": project["revision"], "name": "Styled surfaces portable view",
        "camera": {"mode": "perspective", "position": [17, -9, 43], "target": [2, 3, -1],
                   "up": [0.25, 1, 0], "radius": 23.5},
        "selection": mixed,
    })
    assert response.status_code == 201, response.text
    return cast(JsonObject, response.json())


def remap_references(
    references: list[JsonObject], mapping: dict[str, str], *, canonical: bool = True,
) -> list[JsonObject]:
    remapped = [{**reference, "structure_id": mapping[reference["structure_id"]]}
                for reference in references]
    # Selection/pocket references are canonical sets; measurement order is semantic.
    if canonical:
        return sorted(
            remapped, key=lambda reference: (reference["structure_id"], reference["atom_id"]),
        )
    return remapped


def remap_settings(settings: JsonObject, mapping: dict[str, str]) -> JsonObject:
    """Only pocket entry references change; surface identities remain exact."""
    expected = deepcopy(settings)
    for surface in expected["surface_objects"]:
        source = surface["source"]
        if source["kind"] == "pocket":
            source["seed_atom_references"] = remap_references(
                source["seed_atom_references"], mapping,
            )
    return expected


def assert_portable_display(actual: JsonObject, expected: JsonObject) -> dict[str, str]:
    """Compare full settings/scenes, changing only documented archive identities."""
    actual_entries = {entry["name"]: entry for entry in actual["entries"]}
    expected_entries = {entry["name"]: entry for entry in expected["entries"]}
    assert len(actual_entries) == len(actual["entries"]) == len(expected["entries"])
    assert actual_entries.keys() == expected_entries.keys()
    mapping = {entry["id"]: actual_entries[name]["id"]
               for name, entry in expected_entries.items()}
    assert len(set(mapping.values())) == len(mapping)
    for name, entry in expected_entries.items():
        restored = actual_entries[name]
        for field in (
            "description", "structure_type", "original_filename", "source_format", "atom_count",
            "atom_ids", "bond_count", "residue_count", "conformer_count", "warnings", "visible",
            "locked", "user_metadata",
        ):
            assert restored[field] == entry[field], (name, field)
        assert restored["viewer_settings"] == remap_settings(
            entry["viewer_settings"], mapping,
        ), name

    actual_scenes = {scene["name"]: scene for scene in actual["scenes"]}
    expected_scenes = {scene["name"]: scene for scene in expected["scenes"]}
    assert len(actual_scenes) == len(actual["scenes"]) == len(expected["scenes"])
    assert actual_scenes.keys() == expected_scenes.keys()
    for name, scene in expected_scenes.items():
        restored_scene = actual_scenes[name]
        remapped = deepcopy(scene)
        remapped["id"] = restored_scene["id"]
        for state in remapped["entry_states"]:
            state["entry_id"] = mapping[state["entry_id"]]
            state["viewer_settings"] = remap_settings(state["viewer_settings"], mapping)
        remapped["selection"]["atoms"] = remap_references(scene["selection"]["atoms"], mapping)
        assert set(scene["camera"]) == {"mode", "position", "target", "up", "radius"}
        assert restored_scene == remapped, name

    for field, references in [("saved_selections", "atom_references"),
                              ("measurements", "atom_references")]:
        restored_items = {item["name"]: item for item in actual[field]}
        assert len(restored_items) == len(actual[field]) == len(expected[field])
        assert restored_items.keys() == {item["name"] for item in expected[field]}
        for item in expected[field]:
            remapped = {**item, "id": restored_items[item["name"]]["id"],
                        references: remap_references(
                            item[references], mapping, canonical=field == "saved_selections",
                        )}
            assert restored_items[item["name"]] == remapped, (field, item["name"])
    return mapping


def assert_negative_controls(actual: JsonObject, expected: JsonObject) -> list[str]:
    """Demonstrate that deep comparison detects copied corruption, never API writes."""
    rejected = []
    for control in ["scene_camera", "scene_surface_appearance", "entry_surface_appearance"]:
        tampered = deepcopy(actual)
        if control == "scene_camera":
            tampered["scenes"][-1]["camera"]["radius"] += 1
        else:
            owners = (tampered["scenes"][-1]["entry_states"]
                      if control == "scene_surface_appearance" else tampered["entries"])
            settings = next(owner["viewer_settings"] for owner in owners
                            if owner["viewer_settings"]["surface_objects"])
            appearance = settings["surface_objects"][0]["appearance"]
            appearance["opacity"] = 0.99 if appearance["opacity"] != 0.99 else 0.01
        try:
            assert_portable_display(tampered, expected)
        except AssertionError:
            rejected.append(control)
        else:
            raise AssertionError(f"Comparison accepted tampered {control}")
    return rejected


def module_provenance(implementation: Path) -> dict[str, str]:
    """Check lazy imports too; the intentionally current __main__ is not a helper."""
    prefixes = (
        "molweave_api", "neistra_api", "molweave_core", "neistra_core",
        "molweave_demo_plugin", "neistra_demo_plugin", "tests",
    )
    paths = {}
    for name, module in sorted(sys.modules.items()):
        if name.split(".", 1)[0] not in prefixes:
            continue
        filename = getattr(module, "__file__", None)
        assert filename is not None, f"Missing provenance for {name}"
        path = Path(filename).resolve()
        assert path.is_relative_to(implementation), (name, str(path), str(implementation))
        paths[name] = str(path)
    assert paths
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--implementation-root", type=Path, required=True)
    parser.add_argument("--expected-version", required=True)
    parser.add_argument("--expect-new-names", action="store_true")
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    implementation = args.implementation_root.resolve()
    assert APPLICATION_VERSION == args.expected_version
    module_provenance(implementation)
    data = args.data_dir.resolve()
    app = create_app(Settings(data_dir=data, database_url=f"sqlite:///{data / 'molweave.db'}"))
    assert app.version == args.expected_version
    client = ApiClient(app)
    try:
        result = (
            produce(client, data, styled_project(client))
            if args.mode == "produce"
            else read_gestures(client, data, args.expected_version)
        )
        expected = json.loads((data / "reader-expectations.json").read_text())
        archive = (data / "moved.molweave.zip").read_bytes()
        archive_checks: dict[str, JsonObject] = {}
        for suffix in ["molweave", "neistra"]:
            response = client.post(
                "/api/v1/projects/import-archive",
                files={"file": (f"qualification.{suffix}.zip", archive, "application/zip")},
            )
            status = 201 if suffix == "molweave" or args.expect_new_names else 422
            assert response.status_code == status, response.text
            if status == 422:
                assert response.json()["detail"]["code"] == "unsupported_project_archive_extension"
                archive_checks[suffix] = {"http": status}
                continue
            restored = response.json()["project"]
            mapping = assert_portable_display(restored, expected["project"])
            assert restored["history"]["retained_commands"] == 0
            for source_id, restored_id in mapping.items():
                assert structure(client, restored["id"], restored_id) == (
                    expected["after"][source_id]
                )
                assert original_hash(client, restored["id"], restored_id) == (
                    expected["originals"][source_id]
                )
            archive_checks[suffix] = {
                "http": status, "entry_settings_exact": True, "scene_records_exact": True,
                "selection_measurement_records_exact": True,
                "canonical_structures_and_originals_exact": True,
                "negative_controls_rejected": assert_negative_controls(
                    restored, expected["project"],
                ),
            }
        result.update(
            application_version=APPLICATION_VERSION,
            implementation_root=str(implementation),
            api_module=molweave_api.main.__file__,
            core_module=molweave_core.molecular.__file__,
            legacy_suffix_http=archive_checks["molweave"]["http"],
            new_suffix_http=archive_checks["neistra"]["http"],
            expect_new_names=args.expect_new_names,
            imported_module_provenance=module_provenance(implementation),
            archive_display_checks=archive_checks,
            representative_atomic_polymer_color_hydrogen_settings=True,
            nondefault_surface_appearance_kinds=["entry", "fragment", "pocket"],
            portable_scene_camera_has_no_fov=True,
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        app.state.engine.dispose()


if __name__ == "__main__":
    main()
