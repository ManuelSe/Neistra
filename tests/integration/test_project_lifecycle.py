from __future__ import annotations

from pathlib import Path

from molweave_api.database import Base
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.support.api_client import ApiClient


def test_project_survives_api_restart_and_recovers_uncheckpointed_changes(
    tmp_path: Path,
) -> None:
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'durable.db'}",
        auto_create_schema=True,
    )
    first_app = create_app(settings)
    Base.metadata.create_all(first_app.state.engine)
    first_client = ApiClient(first_app)
    created = first_client.post("/api/v1/projects", json={"name": "Durable project"}).json()
    project_id = created["id"]
    changed = first_client.patch(
        f"/api/v1/projects/{project_id}",
        json={
            "expected_revision": 0,
            "name": "Recovered project",
            "description": "Stored before interruption",
        },
    ).json()
    assert changed["has_uncheckpointed_changes"] is True
    first_app.state.engine.dispose()

    second_app = create_app(settings)
    second_client = ApiClient(second_app)
    recovered = second_client.get(f"/api/v1/projects/{project_id}").json()
    assert recovered["name"] == "Recovered project"
    assert recovered["has_uncheckpointed_changes"] is True
    assert recovered["history"]["can_undo"] is True

    saved = second_client.post(
        f"/api/v1/projects/{project_id}/save",
        json={"expected_revision": recovered["revision"]},
    ).json()
    assert saved["checkpoint_revision"] == saved["revision"]
    assert saved["has_uncheckpointed_changes"] is False
    second_app.state.engine.dispose()

    third_app = create_app(settings)
    third_client = ApiClient(third_app)
    reopened = third_client.get(f"/api/v1/projects/{project_id}").json()
    assert reopened["name"] == "Recovered project"
    assert reopened["has_uncheckpointed_changes"] is False
    third_app.state.engine.dispose()


def test_appearance_duplicate_atomicity_checkpoint_and_restart(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'appearance.db'}",
        auto_create_schema=True,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    client = ApiClient(app)
    project = client.post("/api/v1/projects", json={"name": "Durable appearance"}).json()
    path = f"/api/v1/projects/{project['id']}"
    fixture = Path(__file__).parents[1] / "fixtures/hydrogens/polar_hydrogens_ligand.mol"
    project = client.post(
        f"{path}/imports",
        data={"expected_revision": 0},
        files=[
            ("files", ("hydrogens.mol", fixture.read_bytes(), "chemical/x-mdl-molfile")),
        ],
    ).json()["project"]
    entry_id = project["entries"][0]["id"]
    target = {
        "atoms": [{"structure_id": entry_id, "atom_id": 2}],
        "granularity": "atom",
        "source": "inspector",
    }
    for value in [
        {"property": "color", "color": "#112233"},
        {"property": "nonpolar_hydrogens", "show": False},
    ]:
        response = client.post(
            f"{path}/selection-appearance",
            json={
                "expected_revision": project["revision"],
                "selection": target,
                "action": "set",
                **value,
            },
        )
        assert response.status_code == 200, response.text
        project = response.json()
    expected = project["entries"][0]["viewer_settings"]
    project = client.post(
        f"{path}/entries/{entry_id}/duplicate", json={"expected_revision": project["revision"]}
    ).json()
    assert len(project["entries"]) == 2
    assert all(entry["viewer_settings"] == expected for entry in project["entries"])
    target["atoms"] = [{"structure_id": entry["id"], "atom_id": 2} for entry in project["entries"]]
    project = client.get(path).json()
    invalid = {**target, "atoms": [*target["atoms"], {"structure_id": entry_id, "atom_id": 999}]}
    rejected = client.post(
        f"{path}/selection-appearance",
        json={
            "expected_revision": project["revision"],
            "selection": invalid,
            "action": "set",
            "property": "nonpolar_hydrogens",
            "show": True,
        },
    )
    assert rejected.status_code == 422
    assert client.get(path).json() == project
    project = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    assert not project["has_uncheckpointed_changes"]
    project = client.post(
        f"{path}/selection-appearance",
        json={
            "expected_revision": project["revision"],
            "selection": target,
            "action": "reset",
            "property": "nonpolar_hydrogens",
        },
    ).json()
    assert all(
        entry["viewer_settings"]["selection_nonpolar_hydrogens"] == []
        for entry in project["entries"]
    )
    project = client.get(path).json()
    app.state.engine.dispose()
    restarted = create_app(settings)
    client = ApiClient(restarted)
    recovered = client.get(path).json()
    assert recovered["has_uncheckpointed_changes"]
    assert recovered["entries"] == project["entries"]
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": recovered["revision"]}
    ).json()
    assert all(entry["viewer_settings"] == expected for entry in undone["entries"])
    assert not undone["has_uncheckpointed_changes"]
    redone = client.post(
        f"{path}/history/redo", json={"expected_revision": undone["revision"]}
    ).json()
    assert all(
        entry["viewer_settings"]["selection_nonpolar_hydrogens"] == []
        for entry in redone["entries"]
    )
    assert all(
        entry["viewer_settings"]["selection_colors"] == expected["selection_colors"]
        for entry in redone["entries"]
    )
    restarted.state.engine.dispose()
