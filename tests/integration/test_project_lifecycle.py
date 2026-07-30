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
