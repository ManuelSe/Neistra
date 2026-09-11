from __future__ import annotations

import io
import json
import zipfile
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from molweave_api.schemas import SelectionSurface
from pydantic import ValidationError

from tests.integration.test_archive_roundtrip import export_archive, import_archive, upload
from tests.integration.test_viewer_state import import_ligand, selection
from tests.support.api_client import ApiClient


def change(client: ApiClient, project: dict[str, Any], target: dict[str, Any], action="add"):
    return client.post(
        f"/api/v1/projects/{project['id']}/selection-surface",
        json={"expected_revision": project["revision"], "selection": target, "action": action},
    )


def surface(project: dict[str, Any]):
    return project["entries"][0]["viewer_settings"]["selection_surface"]


def test_surface_union_remove_noop_history_and_molecular_invariance(client: ApiClient) -> None:
    project = import_ligand(client)
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry['id']}/original").content
    normalized = client.get(f"{path}/entries/{entry['id']}/structure").json()
    assert surface(project) is None
    old_settings = deepcopy(entry["viewer_settings"])
    project = change(client, project, selection(entry["id"], 1, 2)).json()
    assert surface(project) == {"profile": "molecular-v1", "atom_ids": [1, 2]}
    before_noop = client.get(path).json()
    assert change(client, project, selection(entry["id"], 1)).json() == before_noop
    assert change(client, project, selection(entry["id"], 3), "remove").json() == before_noop
    project = change(client, project, selection(entry["id"], 2, 3)).json()
    assert surface(project)["atom_ids"] == [1, 2, 3]
    before_remove = deepcopy(project)
    project = change(client, project, selection(entry["id"], 2), "remove").json()
    assert surface(project)["atom_ids"] == [1, 3]
    project = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert surface(project) == surface(before_remove)
    project = client.post(
        f"{path}/history/redo", json={"expected_revision": project["revision"]}
    ).json()
    assert surface(project)["atom_ids"] == [1, 3]
    project = change(client, project, selection(entry["id"], 1, 3), "remove").json()
    assert surface(project) is None
    assert project["entries"][0]["viewer_settings"] == old_settings
    assert client.get(f"{path}/entries/{entry['id']}/structure").json() == normalized
    assert client.get(f"{path}/entries/{entry['id']}/original").content == original
    assert project["entries"][0]["current_artifact_id"] == entry["current_artifact_id"]


def test_surface_validation_atomicity_and_entry_update_guard(client: ApiClient) -> None:
    project = import_ligand(client)
    project = upload(client, project["id"], project["revision"], ["ethanol.mol"]).json()["project"]
    entries = project["entries"]
    refs = sorted(
        [{"structure_id": e["id"], "atom_id": 1} for e in entries],
        key=lambda item: item["structure_id"],
    )
    target = {**selection(entries[0]["id"], 1), "atoms": refs}
    invalid = deepcopy(target)
    invalid["atoms"][-1]["atom_id"] = 99999
    path = f"/api/v1/projects/{project['id']}"
    persisted = client.get(path).json()
    assert change(client, project, invalid).status_code == 422
    assert client.get(path).json() == persisted
    changed = change(client, project, target)
    assert changed.status_code == 200, changed.text
    changed_project = changed.json()
    assert changed_project["revision"] == project["revision"] + 1
    assert all(
        e["viewer_settings"]["selection_surface"]["atom_ids"] == [1]
        for e in changed_project["entries"]
    )
    assert change(client, project, target).status_code == 409
    project = changed_project
    for invalid_target in [selection(entries[0]["id"]), {**target, "atoms": refs + refs}]:
        assert change(client, project, invalid_target).status_code == 422
    settings = deepcopy(project["entries"][0]["viewer_settings"])
    settings.pop("selection_surface")
    url = f"{path}/entries/{project['entries'][0]['id']}/viewer-settings"
    updated = client.request(
        "PUT", url, json={"expected_revision": project["revision"], "settings": settings}
    )
    assert updated.status_code == 200, updated.text
    project = updated.json()
    assert surface(project)["atom_ids"] == [1]
    persisted = client.get(path).json()
    settings["selection_surface"] = None
    assert (
        client.request(
            "PUT", url, json={"expected_revision": project["revision"], "settings": settings}
        ).status_code
        == 422
    )
    assert client.get(path).json() == persisted


def test_surface_scene_checkpoint_archive_and_topology_reconciliation(client: ApiClient) -> None:
    project = import_ligand(client)
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    target = selection(entry["id"], 1, 2, 3)
    project = change(client, project, target).json()
    project = client.post(
        f"{path}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "Fragment",
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
    expected = deepcopy(surface(project))
    project = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    assert not project["has_uncheckpointed_changes"]
    assert surface(client.get(path).json()) == expected
    project = change(client, project, target, "remove").json()
    assert surface(project) is None
    project = client.post(
        f"{path}/scenes/{project['scenes'][0]['id']}/apply",
        json={"expected_revision": project["revision"]},
    ).json()
    assert surface(project) == expected
    exported = export_archive(client, project["id"], "surface-roundtrip")
    archive = client.get(exported["artifact"]["download_url"]).content
    restored = import_archive(client, archive)["project"]
    assert restored["id"] != project["id"]
    assert restored["entries"][0]["id"] != entry["id"]
    assert surface(restored) == expected
    assert (
        restored["scenes"][0]["entry_states"][0]["viewer_settings"]["selection_surface"] == expected
    )
    duplicate = client.post(
        f"{path}/entries/{entry['id']}/duplicate", json={"expected_revision": project["revision"]}
    )
    assert duplicate.status_code == 200, duplicate.text
    project = duplicate.json()
    assert all(e["viewer_settings"]["selection_surface"] == expected for e in project["entries"])
    edited = client.post(
        f"{path}/entries/{entry['id']}/ligand-edits",
        json={
            "expected_revision": project["revision"],
            "operation": "atom.delete",
            "atom_ids": [3],
        },
    )
    assert edited.status_code == 200, edited.text
    project = edited.json()["project"]
    changed = next(e for e in project["entries"] if e["id"] == entry["id"])
    assert changed["viewer_settings"]["selection_surface"]["atom_ids"] == [1, 2]
    assert project["scenes"][0]["entry_states"][0]["viewer_settings"]["selection_surface"][
        "atom_ids"
    ] == [1, 2]
    project = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert all(e["viewer_settings"]["selection_surface"] == expected for e in project["entries"])
    assert (
        project["scenes"][0]["entry_states"][0]["viewer_settings"]["selection_surface"] == expected
    )


@pytest.mark.parametrize("ids", [[], [0], [-1], [2, 1], [1, 1], [True], ["1"], [1.5]])
def test_surface_schema_rejects_invalid_ids(ids: list[Any]) -> None:
    with pytest.raises(ValidationError):
        SelectionSurface.model_validate({"profile": "molecular-v1", "atom_ids": ids})


def test_surface_schema_rejects_unknown_profile_and_extra_fields() -> None:
    for payload in [
        {"profile": "solvent-accessible", "atom_ids": [1]},
        {"profile": "molecular-v1", "atom_ids": [1], "probe_radius": 2},
    ]:
        with pytest.raises(ValidationError):
            SelectionSurface.model_validate(payload)


@pytest.mark.parametrize("mode", ["legacy", "missing-atom", "unknown-profile"])
def test_surface_archive_compatibility_and_referential_validation(
    client: ApiClient, mode: str
) -> None:
    project = import_ligand(client)
    project = change(client, project, selection(project["entries"][0]["id"], 1)).json()
    exported = export_archive(client, project["id"], "surface-compatibility")
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
                    settings.pop("selection_surface")
                    manifest["application_version"] = "0.6.1"
                elif mode == "missing-atom":
                    settings["selection_surface"]["atom_ids"] = [99999]
                else:
                    settings["selection_surface"]["profile"] = "unknown"
                data = json.dumps(manifest).encode()
            destination.writestr(info, data)
    if mode == "legacy":
        assert surface(import_archive(client, result.getvalue())["project"]) is None
    else:
        response = client.post(
            "/api/v1/projects/import-archive",
            data={"operation_id": "surface-invalid"},
            files={
                "file": ("invalid.molweave.zip", result.getvalue(), "application/zip"),
            },
        )
        assert response.status_code == 422, response.text
        expected_code = (
            "invalid_archive_atom_reference"
            if mode == "missing-atom"
            else "invalid_archive_manifest"
        )
        assert response.json()["detail"]["code"] == expected_code


def test_surface_checkpoint_survives_restart_and_undo_restores_clean_state(tmp_path: Path) -> None:
    from molweave_api.database import Base
    from molweave_api.main import create_app
    from molweave_api.settings import Settings

    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'surface.db'}",
        auto_create_schema=True,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    client = ApiClient(app)
    project = import_ligand(client)
    target = selection(project["entries"][0]["id"], 1, 2)
    path = f"/api/v1/projects/{project['id']}"
    project = change(client, project, target).json()
    expected = deepcopy(surface(project))
    project = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    project = change(client, project, target, "remove").json()
    assert project["has_uncheckpointed_changes"]
    app.state.engine.dispose()
    restarted = create_app(settings)
    client = ApiClient(restarted)
    recovered = client.get(path).json()
    assert surface(recovered) is None
    assert recovered["has_uncheckpointed_changes"]
    restored = client.post(
        f"{path}/history/undo", json={"expected_revision": recovered["revision"]}
    ).json()
    assert surface(restored) == expected
    assert not restored["has_uncheckpointed_changes"]
    restarted.state.engine.dispose()
