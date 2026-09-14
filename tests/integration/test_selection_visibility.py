from __future__ import annotations

import io
import json
import zipfile
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from molweave_api.schemas import ViewerSettings
from pydantic import ValidationError

from tests.integration.test_archive_roundtrip import export_archive, import_archive, upload
from tests.integration.test_viewer_state import import_ligand, selection, viewer_settings
from tests.support.api_client import ApiClient


def change(client: ApiClient, project: dict[str, Any], target: dict[str, Any], action="hide"):
    return client.post(
        f"/api/v1/projects/{project['id']}/selection-atom-visibility",
        json={"expected_revision": project["revision"], "selection": target, "action": action},
    )


def hidden(project: dict[str, Any]) -> list[int]:
    return project["entries"][0]["viewer_settings"]["selection_hidden_atoms"]


def test_exact_hide_show_noops_history_and_scientific_invariance(client: ApiClient) -> None:
    project = import_ligand(client)
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry['id']}/original").content
    structure = client.get(f"{path}/entries/{entry['id']}/structure").json()
    assert hidden(project) == []
    project = change(client, project, selection(entry["id"], 1, 2)).json()
    assert hidden(project) == [1, 2]
    persisted = client.get(path).json()
    assert change(client, project, selection(entry["id"], 1)).json() == persisted
    assert change(client, project, selection(entry["id"], 3), "show").json() == persisted
    project = change(client, project, selection(entry["id"], 2, 3)).json()
    assert hidden(project) == [1, 2, 3]
    project = change(client, project, selection(entry["id"], 2), "show").json()
    assert hidden(project) == [1, 3]
    project = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert hidden(project) == [1, 2, 3]
    project = client.post(
        f"{path}/history/redo", json={"expected_revision": project["revision"]}
    ).json()
    assert hidden(project) == [1, 3]
    project = change(client, project, selection(entry["id"], 1, 3), "show").json()
    assert project["entries"][0]["viewer_settings"] == entry["viewer_settings"]
    assert client.get(f"{path}/entries/{entry['id']}/original").content == original
    assert client.get(f"{path}/entries/{entry['id']}/structure").json() == structure
    assert project["entries"][0]["current_artifact_id"] == entry["current_artifact_id"]
    assert project["entries"][0]["warnings"] == entry["warnings"]


def test_multi_entry_atomicity_revision_validation_and_settings_guard(client: ApiClient) -> None:
    project = import_ligand(client)
    project = upload(client, project["id"], project["revision"], ["ethanol.mol"]).json()["project"]
    entries = project["entries"]
    target = {
        **selection(entries[0]["id"], 1),
        "atoms": sorted(
            [{"structure_id": e["id"], "atom_id": 1} for e in entries],
            key=lambda atom: atom["structure_id"],
        ),
    }
    path = f"/api/v1/projects/{project['id']}"
    invalid = deepcopy(target)
    invalid["atoms"][-1]["atom_id"] = 999999
    before = client.get(path).json()
    assert change(client, project, invalid).status_code == 422
    assert client.get(path).json() == before
    changed = change(client, project, target)
    assert changed.status_code == 200, changed.text
    assert change(client, project, target).status_code == 409
    assert changed.json()["revision"] == project["revision"] + 1
    project = changed.json()
    assert all(e["viewer_settings"]["selection_hidden_atoms"] == [1] for e in project["entries"])
    for invalid in [selection(entries[0]["id"]), {**target, "atoms": target["atoms"] * 2}]:
        assert change(client, project, invalid).status_code == 422
    assert change(client, project, target, "toggle").status_code == 422
    settings = deepcopy(project["entries"][0]["viewer_settings"])
    settings.pop("selection_hidden_atoms")
    url = f"{path}/entries/{entries[0]['id']}/viewer-settings"
    response = client.request(
        "PUT", url, json={"expected_revision": project["revision"], "settings": settings}
    )
    assert response.status_code == 200, response.text
    project = response.json()
    assert hidden(project) == [1]
    persisted = client.get(path).json()
    settings["selection_hidden_atoms"] = []
    assert (
        client.request(
            "PUT", url, json={"expected_revision": project["revision"], "settings": settings}
        ).status_code
        == 422
    )
    assert client.get(path).json() == persisted


@pytest.mark.parametrize(
    "style",
    [
        "line",
        "stick",
        "thick-stick",
        "ball-and-stick",
        "space-filling",
        "backbone",
        "cartoon",
        None,
    ],
)
def test_atomic_apply_and_reset_reveal_in_one_command_preserving_other_properties(
    client: ApiClient, style: str | None
) -> None:
    project = client.post("/api/v1/projects", json={"name": "Visibility channels"}).json()
    project = upload(client, project["id"], 0, ["protein_editing.pdb"]).json()["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    projection = client.get(f"{path}/entries/{entry['id']}/structure").json()
    residue = projection["structure"]["residues"][0]["id"]
    ids = [atom["id"] for atom in projection["structure"]["atoms"] if atom["residue_id"] == residue]
    target = selection(entry["id"], *ids)
    # Independent channels must survive every visibility/style operation.
    project = client.post(
        f"{path}/selection-surface",
        json={"expected_revision": project["revision"], "selection": target, "action": "add"},
    ).json()
    project = client.post(
        f"{path}/selection-appearance",
        json={
            "expected_revision": project["revision"],
            "selection": target,
            "property": "color",
            "action": "set",
            "color": "#ff0088",
        },
    ).json()
    project = change(client, project, target).json()
    before = deepcopy(project["entries"][0]["viewer_settings"])
    response = client.post(
        f"{path}/selection-representations",
        json={
            "expected_revision": project["revision"],
            "selection": target,
            "action": "reset" if style is None else "apply",
            "style": style,
        },
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["revision"] == project["revision"] + 1
    assert hidden(updated) == (ids if style in {"backbone", "cartoon"} else [])
    after = updated["entries"][0]["viewer_settings"]
    for field in [
        "selection_surface",
        "selection_colors",
        "selection_nonpolar_hydrogens",
        "components",
    ]:
        assert after[field] == before[field]
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": updated["revision"]}
    ).json()
    assert undone["entries"][0]["viewer_settings"] == before


@pytest.mark.parametrize("ids", [[0], [-1], [2, 1], [1, 1], [True], ["1"], [1.5], None, (1,)])
def test_hidden_membership_requires_strict_canonical_ids(ids: Any) -> None:
    with pytest.raises(ValidationError):
        ViewerSettings.model_validate({**viewer_settings(), "selection_hidden_atoms": ids})
    legacy = viewer_settings()
    legacy.pop("selection_hidden_atoms")
    assert ViewerSettings.model_validate(legacy).selection_hidden_atoms == []


def test_partial_reveal_reset_and_show_preserve_prior_assignments(client: ApiClient) -> None:
    project = import_ligand(client)
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    project = change(client, project, selection(entry["id"], 1, 2, 3)).json()
    project = client.post(
        f"{path}/selection-representations",
        json={
            "expected_revision": project["revision"],
            "selection": selection(entry["id"], 1),
            "action": "apply",
            "style": "stick",
        },
    ).json()
    assert hidden(project) == [2, 3]
    expected = deepcopy(project["entries"][0]["viewer_settings"]["selection_representations"])
    project = change(client, project, selection(entry["id"], 1)).json()
    project = change(client, project, selection(entry["id"], 1), "show").json()
    assert project["entries"][0]["viewer_settings"]["selection_representations"] == expected
    project = client.post(
        f"{path}/selection-representations",
        json={
            "expected_revision": project["revision"],
            "selection": selection(entry["id"], 1, 2),
            "action": "reset",
        },
    ).json()
    assert hidden(project) == [3]
    assert project["entries"][0]["viewer_settings"]["selection_representations"] == []


def test_visibility_scenes_archive_duplication_and_reversible_topology(client: ApiClient) -> None:
    from tests.integration.test_ligand_edits import edit

    project = import_ligand(client)
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    target = selection(entry["id"], 1, 2, 3)
    project = change(client, project, target).json()
    project = client.post(
        f"{path}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "Hidden atom detail",
            "selection": target,
            "camera": {
                "mode": "perspective",
                "position": [0, 0, 10],
                "target": [0, 0, 0],
                "up": [0, 1, 0],
                "radius": 10,
            },
        },
    ).json()
    project = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    assert not project["has_uncheckpointed_changes"]
    project = change(client, project, target, "show").json()
    project = client.post(
        f"{path}/scenes/{project['scenes'][0]['id']}/apply",
        json={"expected_revision": project["revision"]},
    ).json()
    assert hidden(project) == [1, 2, 3]
    exported = export_archive(client, project["id"], "visibility-roundtrip")
    archive = client.get(exported["artifact"]["download_url"]).content
    restored = import_archive(client, archive)["project"]
    assert restored["id"] != project["id"]
    assert restored["entries"][0]["id"] != entry["id"]
    assert hidden(restored) == [1, 2, 3]
    assert restored["scenes"][0]["entry_states"][0]["viewer_settings"][
        "selection_hidden_atoms"
    ] == [1, 2, 3]
    project = client.post(
        f"{path}/entries/{entry['id']}/duplicate", json={"expected_revision": project["revision"]}
    ).json()
    assert all(
        e["viewer_settings"]["selection_hidden_atoms"] == [1, 2, 3] for e in project["entries"]
    )
    result = edit(client, project, entry["id"], {"operation": "atom.delete", "atom_ids": [3]})
    project = result["project"]
    changed = next(e for e in project["entries"] if e["id"] == entry["id"])
    assert changed["viewer_settings"]["selection_hidden_atoms"] == [1, 2]
    assert project["scenes"][0]["entry_states"][0]["viewer_settings"]["selection_hidden_atoms"] == [
        1,
        2,
    ]
    project = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert all(
        e["viewer_settings"]["selection_hidden_atoms"] == [1, 2, 3] for e in project["entries"]
    )
    assert project["scenes"][0]["entry_states"][0]["viewer_settings"]["selection_hidden_atoms"] == [
        1,
        2,
        3,
    ]
    result = edit(
        client,
        project,
        entry["id"],
        {"operation": "atom.add", "element": "F", "coordinates": [3.5, 0, 0]},
    )
    assert result["report"]["created_atom_ids"] == [4]
    changed = next(e for e in result["project"]["entries"] if e["id"] == entry["id"])
    assert changed["viewer_settings"]["selection_hidden_atoms"] == [1, 2, 3]
    assert changed["atom_ids"] == [1, 2, 3, 4]


@pytest.mark.parametrize("mode", ["legacy", "missing-atom", "invalid-mask"])
def test_visibility_archive_compatibility_and_validation(client: ApiClient, mode: str) -> None:
    project = import_ligand(client)
    project = change(client, project, selection(project["entries"][0]["id"], 1)).json()
    exported = export_archive(client, project["id"], "visibility-compatibility")
    archive = client.get(exported["artifact"]["download_url"]).content
    result = io.BytesIO()
    with (
        zipfile.ZipFile(io.BytesIO(archive)) as source,
        zipfile.ZipFile(result, "w") as destination,
    ):
        for info in source.infolist():
            data = source.read(info)
            if info.filename == "manifest.json":
                manifest = json.loads(data)
                settings = manifest["entries"][0]["viewer_settings"]
                if mode == "legacy":
                    settings.pop("selection_hidden_atoms")
                    manifest["application_version"] = "0.7.0"
                else:
                    settings["selection_hidden_atoms"] = (
                        [99999] if mode == "missing-atom" else [True]
                    )
                data = json.dumps(manifest).encode()
            destination.writestr(info, data)
    if mode == "legacy":
        assert hidden(import_archive(client, result.getvalue())["project"]) == []
    else:
        response = client.post(
            "/api/v1/projects/import-archive",
            data={"operation_id": "invalid-visibility"},
            files={"file": ("invalid.molweave.zip", result.getvalue(), "application/zip")},
        )
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == (
            "invalid_archive_atom_reference"
            if mode == "missing-atom"
            else "invalid_archive_manifest"
        )


def test_visibility_checkpoint_restart_and_clean_undo(tmp_path: Path) -> None:
    from molweave_api.database import Base
    from molweave_api.main import create_app
    from molweave_api.settings import Settings

    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'visibility.db'}",
        auto_create_schema=True,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    client = ApiClient(app)
    project = import_ligand(client)
    target = selection(project["entries"][0]["id"], 1, 2)
    path = f"/api/v1/projects/{project['id']}"
    project = change(client, project, target).json()
    project = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    project = change(client, project, target, "show").json()
    app.state.engine.dispose()
    restarted = create_app(settings)
    client = ApiClient(restarted)
    recovered = client.get(path).json()
    assert hidden(recovered) == []
    assert recovered["has_uncheckpointed_changes"]
    restored = client.post(
        f"{path}/history/undo", json={"expected_revision": recovered["revision"]}
    ).json()
    assert hidden(restored) == [1, 2]
    assert not restored["has_uncheckpointed_changes"]
    restarted.state.engine.dispose()


def test_hidden_atoms_preserve_supplied_conformers_and_warnings(client: ApiClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Visibility conformers"}).json()
    project = upload(client, project["id"], 0, ["protein_models_altloc.pdb"]).json()["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}/entries/{entry['id']}"
    before = client.get(f"{path}/structure").json()
    original = client.get(f"{path}/original").content
    assert len(before["structure"]["conformers"]) == 2
    assert any(atom["alternate_location"] for atom in before["structure"]["atoms"])
    response = change(client, project, selection(entry["id"], *entry["atom_ids"]))
    assert response.status_code == 200, response.text
    assert hidden(response.json()) == entry["atom_ids"]
    assert response.json()["entries"][0]["warnings"] == entry["warnings"]
    assert client.get(f"{path}/structure").json() == before
    assert client.get(f"{path}/original").content == original


def test_hide_mask_has_no_surface_atom_capacity_limit() -> None:
    value = list(range(1, 100_002))
    assert (
        ViewerSettings.model_validate(
            {**viewer_settings(), "selection_hidden_atoms": value}
        ).selection_hidden_atoms
        == value
    )
