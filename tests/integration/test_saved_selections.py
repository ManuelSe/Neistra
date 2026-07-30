from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from molweave_api.database import Base
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"


def _import_structure(client: ApiClient, project_id: str) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/projects/{project_id}/imports",
        data={"expected_revision": 0},
        files=[
            (
                "files",
                (
                    "ethanol.mol",
                    (FIXTURES / "ethanol.mol").read_bytes(),
                    "chemical/x-mdl-molfile",
                ),
            )
        ],
    )
    assert response.status_code == 201
    return cast(dict[str, Any], response.json()["project"])


def _save_selection(client: ApiClient, project: dict[str, Any]) -> dict[str, Any]:
    entry_id = project["entries"][0]["id"]
    response = client.post(
        f"/api/v1/projects/{project['id']}/selections",
        json={
            "expected_revision": project["revision"],
            "name": "Carbon pair",
            "selection": {
                "schema_version": 1,
                "atoms": [
                    {"structure_id": entry_id, "atom_id": 1},
                    {"structure_id": entry_id, "atom_id": 2},
                ],
                "granularity": "atom",
                "source": "inspector",
            },
        },
    )
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


def test_saved_selection_persists_and_is_undoable_across_restart(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'saved.db'}",
        auto_create_schema=True,
    )
    first_app = create_app(settings)
    Base.metadata.create_all(first_app.state.engine)
    client = ApiClient(first_app)
    project = client.post("/api/v1/projects", json={"name": "Selections"}).json()
    project = _import_structure(client, project["id"])
    saved = _save_selection(client, project)
    assert saved["saved_selections"][0]["name"] == "Carbon pair"
    assert saved["history"]["undo_description"] == "Save selection Carbon pair"
    first_app.state.engine.dispose()

    second_app = create_app(settings)
    reopened_client = ApiClient(second_app)
    reopened = reopened_client.get(f"/api/v1/projects/{project['id']}").json()
    assert len(reopened["saved_selections"][0]["atom_references"]) == 2
    undone = reopened_client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": reopened["revision"]},
    ).json()
    assert undone["saved_selections"] == []
    redone = reopened_client.post(
        f"/api/v1/projects/{project['id']}/history/redo",
        json={"expected_revision": undone["revision"]},
    ).json()
    assert redone["saved_selections"][0]["name"] == "Carbon pair"
    second_app.state.engine.dispose()


def test_entry_deletion_prunes_saved_references_with_warning_and_undo_restores(
    client: ApiClient,
) -> None:
    project = client.post("/api/v1/projects", json={"name": "Reconcile"}).json()
    project = _import_structure(client, project["id"])
    saved = _save_selection(client, project)
    entry_id = saved["entries"][0]["id"]

    deleted = client.delete(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}",
        params={"expected_revision": saved["revision"]},
    ).json()
    selection = deleted["saved_selections"][0]
    assert selection["atom_references"] == []
    assert selection["warnings"][0]["code"] == "invalid_selection_references_removed"
    assert "2 atom references were removed" in selection["warnings"][0]["message"]

    restored = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": deleted["revision"]},
    ).json()
    assert len(restored["saved_selections"][0]["atom_references"]) == 2
    assert restored["saved_selections"][0]["warnings"] == []


def test_invalid_and_duplicate_saved_selection_requests_are_atomic(client: ApiClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Validation"}).json()
    project = _import_structure(client, project["id"])
    saved = _save_selection(client, project)
    entry_id = saved["entries"][0]["id"]

    duplicate = client.post(
        f"/api/v1/projects/{project['id']}/selections",
        json={
            "expected_revision": saved["revision"],
            "name": "carbon pair",
            "selection": {
                "atoms": [{"structure_id": entry_id, "atom_id": 1}],
                "granularity": "atom",
                "source": "inspector",
            },
        },
    )
    assert duplicate.status_code == 422
    invalid = client.post(
        f"/api/v1/projects/{project['id']}/selections",
        json={
            "expected_revision": saved["revision"],
            "name": "Invalid",
            "selection": {
                "atoms": [{"structure_id": entry_id, "atom_id": 999}],
                "granularity": "atom",
                "source": "inspector",
            },
        },
    )
    assert invalid.status_code == 422
    unchanged = client.get(f"/api/v1/projects/{project['id']}").json()
    assert unchanged["revision"] == saved["revision"]
    assert len(unchanged["saved_selections"]) == 1
