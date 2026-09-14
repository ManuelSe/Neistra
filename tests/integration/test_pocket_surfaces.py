from __future__ import annotations

import io
import json
import zipfile
from copy import deepcopy
from pathlib import Path

import pytest
from molweave_api.schemas import SelectionPocketSurface
from pydantic import ValidationError

from tests.integration.test_archive_roundtrip import export_archive, import_archive, upload
from tests.integration.test_ligand_edits import edit
from tests.integration.test_viewer_state import selection
from tests.support.api_client import ApiClient


def fixture(client: ApiClient):
    project = client.post("/api/v1/projects", json={"name": "Pocket definitions"}).json()
    project = upload(client, project["id"], 0, ["protein_editing.pdb", "ethanol.mol"]).json()[
        "project"
    ]
    receptor = next(e for e in project["entries"] if e["source_format"] == "pdb")
    ligand = next(e for e in project["entries"] if e["source_format"] == "mol")
    return project, receptor, ligand


def definition(*references: tuple[str, int], radius: float = 5):
    return {
        "profile": "pocket-v1",
        "radius": radius,
        "seed_atom_references": [
            {"structure_id": entry, "atom_id": atom} for entry, atom in sorted(references)
        ],
    }


def change(client: ApiClient, project, receptor_id: str, pocket=None):
    return client.post(
        f"/api/v1/projects/{project['id']}/selection-pocket-surface",
        json={
            "expected_revision": project["revision"],
            "receptor_entry_id": receptor_id,
            "action": "apply" if pocket is not None else "remove",
            "pocket": pocket,
        },
    )


def settings(project, entry_id: str):
    return next(e for e in project["entries"] if e["id"] == entry_id)["viewer_settings"]


def history(client: ApiClient, project, action: str):
    response = client.post(
        f"/api/v1/projects/{project['id']}/history/{action}",
        json={"expected_revision": project["revision"]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def save_scene(client: ApiClient, project, seeds):
    response = client.post(
        f"/api/v1/projects/{project['id']}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "Pocket view",
            "selection": {"atoms": seeds},
            "camera": {
                "mode": "perspective",
                "position": [0, 0, 10],
                "target": [0, 0, 0],
                "up": [0, 1, 0],
                "radius": 10,
            },
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_revisioned_pockets_noops_hidden_seeds_and_independent_channels(client: ApiClient):
    project, receptor, ligand = fixture(client)
    path = f"/api/v1/projects/{project['id']}"
    originals = {
        e["id"]: client.get(f"{path}/entries/{e['id']}/original").content
        for e in project["entries"]
    }
    structures = {
        e["id"]: client.get(f"{path}/entries/{e['id']}/structure").json()
        for e in project["entries"]
    }
    initial = client.get(path).json()
    assert change(client, project, receptor["id"]).json() == initial
    project = client.post(
        f"{path}/entries/{ligand['id']}/visibility",
        json={"expected_revision": project["revision"], "value": False},
    ).json()
    project = client.post(
        f"{path}/selection-atom-visibility",
        json={
            "expected_revision": project["revision"],
            "selection": selection(ligand["id"], 1, 2, 3),
            "action": "hide",
        },
    ).json()
    value = definition((ligand["id"], 1), (receptor["id"], 2), radius=5.5)
    before = deepcopy(settings(project, receptor["id"]))
    response = change(client, project, receptor["id"], value)
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["revision"] == project["revision"] + 1
    assert settings(updated, receptor["id"]) == {**before, "selection_pocket_surface": value}
    assert change(client, project, receptor["id"], value).status_code == 409
    persisted = client.get(path).json()
    assert change(client, updated, receptor["id"], value).json() == persisted
    project = history(client, updated, "undo")
    assert settings(project, receptor["id"])["selection_pocket_surface"] is None
    project = history(client, project, "redo")
    assert settings(project, receptor["id"])["selection_pocket_surface"] == value
    for action, style in [("apply", "line"), ("reset", None)]:
        project = client.post(
            f"{path}/selection-representations",
            json={
                "expected_revision": project["revision"],
                "selection": selection(receptor["id"], 1),
                "action": action,
                "style": style,
            },
        ).json()
        assert settings(project, receptor["id"])["selection_pocket_surface"] == value
    for action in ["add", "remove"]:
        project = client.post(
            f"{path}/selection-surface",
            json={
                "expected_revision": project["revision"],
                "selection": selection(receptor["id"], 1),
                "action": action,
            },
        ).json()
        assert settings(project, receptor["id"])["selection_pocket_surface"] == value
    copied = deepcopy(settings(project, receptor["id"]))
    copied.pop("selection_pocket_surface")
    project = client.request(
        "PUT",
        f"{path}/entries/{receptor['id']}/viewer-settings",
        json={"expected_revision": project["revision"], "settings": copied},
    ).json()
    assert settings(project, receptor["id"])["selection_pocket_surface"] == value
    copied["selection_pocket_surface"] = None
    assert (
        client.request(
            "PUT",
            f"{path}/entries/{receptor['id']}/viewer-settings",
            json={"expected_revision": project["revision"], "settings": copied},
        ).status_code
        == 422
    )
    project = change(client, project, receptor["id"]).json()
    assert settings(project, receptor["id"])["selection_pocket_surface"] is None
    for entry_id in originals:
        assert client.get(f"{path}/entries/{entry_id}/original").content == originals[entry_id]
        assert client.get(f"{path}/entries/{entry_id}/structure").json() == structures[entry_id]


def test_invalid_definitions_reject_before_any_mutation(client: ApiClient):
    project, receptor, ligand = fixture(client)
    path = f"/api/v1/projects/{project['id']}"
    before = client.get(path).json()
    for value in [
        definition((ligand["id"], 1), (ligand["id"], 99999)),
        definition(("missing", 1)),
        definition((ligand["id"], 1), radius=2.1),
    ]:
        assert change(client, project, receptor["id"], value).status_code == 422
        assert client.get(path).json() == before
    assert change(client, project, ligand["id"], definition((ligand["id"], 1))).status_code == 422
    assert change(client, project, "missing", definition((ligand["id"], 1))).status_code == 404
    for action, value in [("apply", None), ("remove", definition((ligand["id"], 1)))]:
        assert (
            client.post(
                f"{path}/selection-pocket-surface",
                json={
                    "expected_revision": project["revision"],
                    "receptor_entry_id": receptor["id"],
                    "action": action,
                    "pocket": value,
                },
            ).status_code
            == 422
        )
    assert client.get(path).json() == before


@pytest.mark.parametrize("radius", [2, 2.5, 5, 12])
def test_radius_endpoints_and_half_steps(radius):
    assert (
        SelectionPocketSurface.model_validate(definition(("e", 1), radius=radius)).radius == radius
    )


@pytest.mark.parametrize(
    "patch",
    [
        {"radius": True},
        {"radius": "5"},
        {"radius": 1.5},
        {"radius": 12.5},
        {"radius": 2.1},
        {"profile": "molecular-v1"},
        {"seed_atom_references": []},
        {"seed_atom_references": None},
        {"seed_atom_references": [{"structure_id": "e", "atom_id": True}]},
        {"seed_atom_references": [{"structure_id": "e", "atom_id": "1"}]},
        {"seed_atom_references": [{"structure_id": "e", "atom_id": 1, "extra": 2}]},
        {"seed_atom_references": [{"structure_id": "e", "atom_id": 1}] * 2},
        {
            "seed_atom_references": [
                {"structure_id": "z", "atom_id": 1},
                {"structure_id": "a", "atom_id": 1},
            ]
        },
    ],
)
def test_strict_canonical_pocket_schema(patch):
    with pytest.raises(ValidationError):
        SelectionPocketSurface.model_validate({**definition(("e", 1)), **patch})


def test_topology_cross_entry_pruning_scene_history_and_new_atoms(client: ApiClient):
    project, receptor, ligand = fixture(client)
    path = f"/api/v1/projects/{project['id']}"
    value = definition((ligand["id"], 1), (ligand["id"], 3))
    project = change(client, project, receptor["id"], value).json()
    project = save_scene(client, project, value["seed_atom_references"])
    scene_id = project["scenes"][0]["id"]
    result = edit(client, project, ligand["id"], {"operation": "atom.delete", "atom_ids": [3]})
    project = result["project"]
    pruned = definition((ligand["id"], 1))
    assert settings(project, receptor["id"])["selection_pocket_surface"] == pruned
    scene_state = next(
        s for s in project["scenes"][0]["entry_states"] if s["entry_id"] == receptor["id"]
    )
    assert scene_state["viewer_settings"]["selection_pocket_surface"] == pruned
    project = history(client, project, "undo")
    assert settings(project, receptor["id"])["selection_pocket_surface"] == value
    project = history(client, project, "redo")
    assert settings(project, receptor["id"])["selection_pocket_surface"] == pruned
    project = edit(
        client,
        project,
        ligand["id"],
        {"operation": "atom.add", "element": "F", "coordinates": [4, 0, 0]},
    )["project"]
    assert settings(project, receptor["id"])["selection_pocket_surface"] == pruned
    project = client.post(
        f"{path}/scenes/{scene_id}/apply", json={"expected_revision": project["revision"]}
    ).json()
    assert settings(project, receptor["id"])["selection_pocket_surface"] == pruned
    project = edit(client, project, ligand["id"], {"operation": "atom.delete", "atom_ids": [1]})[
        "project"
    ]
    assert settings(project, receptor["id"])["selection_pocket_surface"] is None
    assert (
        next(s for s in project["scenes"][0]["entry_states"] if s["entry_id"] == receptor["id"])[
            "viewer_settings"
        ]["selection_pocket_surface"]
        is None
    )
    project = history(client, project, "undo")
    assert settings(project, receptor["id"])["selection_pocket_surface"] == pruned


def test_receptor_duplication_and_seed_entry_deletion_are_exactly_reversible(client: ApiClient):
    project, receptor, ligand = fixture(client)
    path = f"/api/v1/projects/{project['id']}"
    value = definition((ligand["id"], 1), (receptor["id"], 2))
    project = change(client, project, receptor["id"], value).json()
    project = save_scene(client, project, value["seed_atom_references"])
    project = client.post(
        f"{path}/entries/{receptor['id']}/duplicate",
        json={"expected_revision": project["revision"]},
    ).json()
    copied = next(e for e in project["entries"] if e["id"] not in {receptor["id"], ligand["id"]})
    assert settings(project, copied["id"])["selection_pocket_surface"] == definition(
        (copied["id"], 2), (ligand["id"], 1)
    )
    before = {e["id"]: deepcopy(e["viewer_settings"]) for e in project["entries"]}
    before_scenes = deepcopy(project["scenes"])
    response = client.request(
        "DELETE", f"{path}/entries/{ligand['id']}?expected_revision={project['revision']}"
    )
    assert response.status_code == 200, response.text
    project = response.json()
    for owner in [receptor, copied]:
        assert settings(project, owner["id"])["selection_pocket_surface"] == definition(
            (owner["id"], 2)
        )
    project = history(client, project, "undo")
    assert {e["id"]: e["viewer_settings"] for e in project["entries"]} == before
    assert [
        {k: v for k, v in scene.items() if k != "modified_at"} for scene in project["scenes"]
    ] == [{k: v for k, v in scene.items() if k != "modified_at"} for scene in before_scenes]
    project = client.request(
        "DELETE", f"{path}/entries/{receptor['id']}?expected_revision={project['revision']}"
    ).json()
    assert all(e["id"] != receptor["id"] for e in project["entries"])
    project = history(client, project, "undo")
    assert settings(project, receptor["id"])["selection_pocket_surface"] == value


@pytest.mark.parametrize("mode", ["roundtrip", "legacy", "entry-atom", "scene-entry", "profile"])
def test_archive_remaps_all_exported_paths_and_validates_atomically(client: ApiClient, mode):
    project, receptor, ligand = fixture(client)
    value = definition((ligand["id"], 1), (receptor["id"], 2))
    project = change(client, project, receptor["id"], value).json()
    project = save_scene(client, project, value["seed_atom_references"])
    # Scene carries a pocket even when the live definition has been removed.
    if mode == "scene-entry":
        project = change(client, project, receptor["id"]).json()
    exported = export_archive(client, project["id"], f"pocket-{mode}")
    archive = client.get(exported["artifact"]["download_url"]).content
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(archive)) as source, zipfile.ZipFile(output, "w") as dest:
        for info in source.infolist():
            data = source.read(info)
            if info.filename == "manifest.json":
                manifest = json.loads(data)
                owner = next(e for e in manifest["entries"] if e["id"] == receptor["id"])
                scene = next(
                    s
                    for s in manifest["scenes"][0]["entry_states"]
                    if s["entry_id"] == receptor["id"]
                )
                if mode == "legacy":
                    for entry in manifest["entries"]:
                        entry["viewer_settings"].pop("selection_pocket_surface")
                    for state in manifest["scenes"][0]["entry_states"]:
                        state["viewer_settings"].pop("selection_pocket_surface")
                    manifest["application_version"] = "0.8.0"
                elif mode == "entry-atom":
                    owner["viewer_settings"]["selection_pocket_surface"] = definition(
                        (ligand["id"], 99999)
                    )
                elif mode == "scene-entry":
                    scene["viewer_settings"]["selection_pocket_surface"] = definition(("absent", 1))
                elif mode == "profile":
                    owner["viewer_settings"]["selection_pocket_surface"]["profile"] = "unknown"
                data = json.dumps(manifest).encode()
            dest.writestr(info, data)
    before = client.get("/api/v1/projects").json()
    if mode in {"roundtrip", "legacy"}:
        restored = import_archive(client, output.getvalue())["project"]
        entries = {e["source_format"]: e for e in restored["entries"]}
        expected = (
            None
            if mode == "legacy"
            else definition((entries["mol"]["id"], 1), (entries["pdb"]["id"], 2))
        )
        assert settings(restored, entries["pdb"]["id"])["selection_pocket_surface"] == expected
        state = next(
            s
            for s in restored["scenes"][0]["entry_states"]
            if s["entry_id"] == entries["pdb"]["id"]
        )
        assert state["viewer_settings"]["selection_pocket_surface"] == expected
        assert not restored["has_uncheckpointed_changes"]
        assert all(e["id"] not in {receptor["id"], ligand["id"]} for e in restored["entries"])
        if expected is not None:
            changed = change(client, restored, entries["pdb"]["id"]).json()
            undone = history(client, changed, "undo")
            assert settings(undone, entries["pdb"]["id"])["selection_pocket_surface"] == expected
            assert not undone["has_uncheckpointed_changes"]
    else:
        response = client.post(
            "/api/v1/projects/import-archive",
            data={"operation_id": f"pocket-invalid-{mode}"},
            files={"file": ("invalid.molweave.zip", output.getvalue(), "application/zip")},
        )
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == (
            "invalid_archive_manifest" if mode == "profile" else "invalid_archive_atom_reference"
        )
        assert client.get("/api/v1/projects").json() == before


def test_checkpoint_and_cross_entry_undo_survive_restart(tmp_path: Path):
    from molweave_api.database import Base
    from molweave_api.main import create_app
    from molweave_api.settings import Settings

    config = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'pocket.db'}",
        auto_create_schema=True,
    )
    app = create_app(config)
    Base.metadata.create_all(app.state.engine)
    client = ApiClient(app)
    project, receptor, ligand = fixture(client)
    value = definition((ligand["id"], 1))
    project = change(client, project, receptor["id"], value).json()
    path = f"/api/v1/projects/{project['id']}"
    project = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    project = client.request(
        "DELETE", f"{path}/entries/{ligand['id']}?expected_revision={project['revision']}"
    ).json()
    assert settings(project, receptor["id"])["selection_pocket_surface"] is None
    app.state.engine.dispose()
    restarted = create_app(config)
    client = ApiClient(restarted)
    recovered = client.get(path).json()
    assert recovered["has_uncheckpointed_changes"]
    restored = history(client, recovered, "undo")
    assert settings(restored, receptor["id"])["selection_pocket_surface"] == value
    assert not restored["has_uncheckpointed_changes"]
    restarted.state.engine.dispose()


def test_receptor_topology_preserves_context_intent_and_prunes_self_seeds(client: ApiClient):
    from tests.integration.test_protein_edits import edit as protein_edit

    project, receptor, ligand = fixture(client)
    value = definition((receptor["id"], 7), (ligand["id"], 1))
    project = change(client, project, receptor["id"], value).json()
    added = protein_edit(
        client, project, receptor["id"], {"operation": "protein.hydrogen.add", "ph": 7.0}
    )
    assert added["report"]["created_atom_ids"]
    project = added["project"]
    assert settings(project, receptor["id"])["selection_pocket_surface"] == value
    deleted = protein_edit(
        client, project, receptor["id"], {"operation": "protein.residue.delete", "residue_ids": [2]}
    )
    assert 7 in deleted["report"]["deleted_atom_ids"]
    project = deleted["project"]
    assert settings(project, receptor["id"])["selection_pocket_surface"] == definition(
        (ligand["id"], 1)
    )
    project = history(client, project, "undo")
    assert settings(project, receptor["id"])["selection_pocket_surface"] == value


def test_pockets_preserve_conformers_warnings_and_originals(client: ApiClient):
    project = client.post("/api/v1/projects", json={"name": "Pocket conformer context"}).json()
    project = upload(client, project["id"], 0, ["protein_models_altloc.pdb"]).json()["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}/entries/{entry['id']}"
    normalized = client.get(f"{path}/structure").json()
    original = client.get(f"{path}/original").content
    assert len(normalized["structure"]["conformers"]) == 2
    assert any(a.get("alternate_location") for a in normalized["structure"]["atoms"])
    response = change(client, project, entry["id"], definition((entry["id"], 1)))
    assert response.status_code == 200, response.text
    assert response.json()["entries"][0]["warnings"] == entry["warnings"]
    assert client.get(f"{path}/structure").json() == normalized
    assert client.get(f"{path}/original").content == original


def test_empty_protein_context_keeps_seed_intent_until_explicit_removal(client: ApiClient):
    from tests.integration.test_protein_edits import edit as protein_edit

    project, receptor, ligand = fixture(client)
    value = definition((ligand["id"], 1))
    project = change(client, project, receptor["id"], value).json()
    deleted = protein_edit(
        client,
        project,
        receptor["id"],
        {"operation": "protein.residue.delete", "residue_ids": [1, 2, 3, 4]},
    )
    project = deleted["project"]
    remaining = next(e for e in project["entries"] if e["id"] == receptor["id"])
    assert remaining["atom_ids"] == [21, 22]
    assert settings(project, receptor["id"])["selection_pocket_surface"] == value
    assert change(client, project, receptor["id"], value).status_code == 422
    exported = export_archive(client, project["id"], "empty-context-pocket")
    restored = import_archive(client, client.get(exported["artifact"]["download_url"]).content)[
        "project"
    ]
    assert any(e["viewer_settings"]["selection_pocket_surface"] for e in restored["entries"])
    removed = change(client, project, receptor["id"])
    assert removed.status_code == 200, removed.text
    assert settings(removed.json(), receptor["id"])["selection_pocket_surface"] is None
    project = history(client, removed.json(), "undo")
    project = history(client, project, "undo")
    assert settings(project, receptor["id"])["selection_pocket_surface"] == value
    assert (
        next(e for e in project["entries"] if e["id"] == receptor["id"])["atom_ids"]
        == receptor["atom_ids"]
    )
