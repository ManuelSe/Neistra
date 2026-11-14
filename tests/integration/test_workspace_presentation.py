from __future__ import annotations

import io
import json
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from math import inf, nan, pi
from pathlib import Path
from typing import Any

import pytest
from neistra_api.database import Base
from neistra_api.main import create_app
from neistra_api.models import WorkspacePresentation, utc_now
from neistra_api.settings import Settings
from neistra_api.workspace_presentation import SessionCamera
from pydantic import ValidationError
from sqlalchemy import MetaData, event, insert, inspect, select
from sqlalchemy.exc import IntegrityError

from tests.integration.test_archive_roundtrip import (
    build_rich_project,
    export_archive,
    import_archive,
)
from tests.integration.test_viewer_state import import_ligand
from tests.support.api_client import ApiClient

PATH = "/api/v1/workspace/presentation"
CAMERA: dict[str, Any] = {
    "mode": "perspective",
    "position": [31, -17, 80],
    "target": [3, 4, -2],
    "up": [0.2, 1, 0.1],
    "radius": 12,
    "fov": 0.9,
}


def put(client: ApiClient, revision: int, camera: dict[str, Any] | None = None):
    return client.request(
        "PUT",
        PATH,
        json={
            "expected_revision": revision,
            "camera": CAMERA if camera is None else camera,
        },
    )


def other_tables(client: ApiClient) -> dict[str, list[tuple[Any, ...]]]:
    engine = client.app.state.engine
    metadata = MetaData()
    result = {}
    with engine.connect() as connection:
        for name in inspect(engine).get_table_names():
            if name == "workspace_presentations":
                continue
            from sqlalchemy import Table

            table = Table(name, metadata, autoload_with=connection)
            result[name] = list(connection.execute(select(table).order_by(*table.primary_key)))
    return result


def test_missing_record_read_does_not_create_preference_or_touch_projects(
    client: ApiClient,
) -> None:
    before = other_tables(client)
    for _ in range(2):
        response = client.get(PATH)
        assert response.status_code == 200, response.text
        assert response.json() == {
            "schema_version": 1,
            "revision": 0,
            "camera": None,
            "updated_at": None,
        }
    assert other_tables(client) == before
    with client.app.state.engine.connect() as connection:
        assert (
            connection.exec_driver_sql("SELECT COUNT(*) FROM workspace_presentations").scalar() == 0
        )


@pytest.mark.parametrize("mode", ["perspective", "orthographic"])
def test_camera_noop_independent_revision_and_stale_equal_write(
    client: ApiClient, mode: str
) -> None:
    camera = {**CAMERA, "mode": mode, "radius": 1e-100}
    first = put(client, 0, camera)
    assert first.status_code == 200, first.text
    saved = first.json()
    assert saved["schema_version"] == 1 and saved["revision"] == 1
    assert saved["camera"] == camera
    assert saved["updated_at"].endswith("Z")
    assert client.get(PATH).json() == saved
    equal = put(client, 1, camera)
    assert equal.status_code == 200 and equal.json() == saved
    stale_equal = put(client, 0, camera)
    assert stale_equal.status_code == 409
    assert stale_equal.json()["detail"]["code"] == "presentation_revision_conflict"
    assert client.get(PATH).json() == saved
    changed = put(client, 1, {**camera, "fov": 1.1})
    assert changed.status_code == 200 and changed.json()["revision"] == 2
    assert changed.json()["camera"]["fov"] == 1.1


@pytest.mark.parametrize(
    "field,value",
    [
        ("mode", "oblique"),
        ("position", [1, 2]),
        ("position", [1, 2, 3, 4]),
        ("position", [True, 0, 10]),
        ("target", ["0", 0, 0]),
        ("radius", 0),
        ("radius", -1),
        ("radius", True),
        ("radius", "12"),
        ("fov", 0),
        ("fov", -1),
        ("fov", pi),
        ("fov", "0.9"),
        ("fov", True),
        ("fov", 5e-324),
        ("up", [0, 0, 0]),
    ],
)
def test_invalid_request_never_creates_preference(
    client: ApiClient,
    field: str,
    value: Any,
) -> None:
    response = put(client, 0, {**CAMERA, field: value})
    assert response.status_code == 422, response.text
    assert client.get(PATH).json()["revision"] == 0


@pytest.mark.parametrize(
    "invalid",
    [
        {"position": [nan, 0, 10]},
        {"target": [0, inf, 0]},
        {"up": [0, 1, -inf]},
        {"radius": inf},
        {"fov": nan},
        {"position": [1e308, 0, 0], "target": [-1e308, 0, 0]},
        {"position": [0, 0, 1e200], "target": [0, 0, 0]},
        {"position": [0, 0, 0], "target": [0, 0, 0]},
        {"position": [0, 0, 0.999e-6], "target": [0, 0, 0]},
        {"position": [0, 0, 10], "target": [0, 0, 0], "up": [0, 0, 2]},
        {"position": [0, 0, 10], "target": [0, 0, 0], "up": [0, 1e-200, 0]},
        {"position": [0, 0, 10], "target": [0, 0, 0], "up": [0, 1e200, 0]},
        {"position": [1.7e308, 1.7e308, 10], "target": [1.7e308, 1.7e308, 0], "up": [1, 1, 0]},
        {"renderer_snapshot": {}},
    ],
)
def test_rejects_nonfinite_and_native_degenerate_poses(invalid: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        SessionCamera.model_validate({**CAMERA, **invalid})


def test_native_epsilon_boundary_and_harmless_up_component_are_accepted() -> None:
    for values in [
        {"position": [0, 0, 1e-6], "target": [0, 0, 0]},
        {"position": [0, 0, 10], "target": [0, 0, 0], "up": [0, 1, 1e308]},
        {"position": [0, 0, 10], "target": [0, 0, 0], "up": [1e-100, 0, 1], "radius": 5e-324},
    ]:
        assert SessionCamera.model_validate({**CAMERA, **values}).model_dump(mode="json") == {
            **CAMERA,
            **values,
        }


@pytest.mark.parametrize("revision", [True, "0", -1, 0.5, None])
def test_revision_is_a_strict_nonnegative_integer(client: ApiClient, revision: Any) -> None:
    response = client.request("PUT", PATH, json={"expected_revision": revision, "camera": CAMERA})
    assert response.status_code == 422


def test_put_requires_complete_camera_and_rejects_unrestricted_snapshot(client: ApiClient) -> None:
    for body in [
        {"expected_revision": 0},
        {"expected_revision": 0, "camera": None},
        {"expected_revision": 0, "camera": CAMERA, "project_id": "ignored"},
    ]:
        assert client.request("PUT", PATH, json=body).status_code == 422
    incomplete = deepcopy(CAMERA)
    del incomplete["fov"]
    assert put(client, 0, incomplete).status_code == 422


@pytest.mark.parametrize("invalid", [{"id": 2}, {"schema_version": 2}, {"revision": 0}])
def test_database_rejects_extra_singletons_and_unsupported_record_versions(
    client: ApiClient, invalid: dict[str, int]
) -> None:
    with pytest.raises(IntegrityError), client.app.state.engine.begin() as connection:
        connection.execute(
            insert(WorkspacePresentation).values(
                **{
                    "id": 1,
                    "schema_version": 1,
                    "revision": 1,
                    "camera": CAMERA,
                    "updated_at": utc_now(),
                    **invalid,
                }
            )
        )
    assert client.get(PATH).json()["revision"] == 0


@pytest.mark.parametrize("starting_revision", [0, 1])
def test_simultaneous_first_insert_and_compare_and_swap_have_one_winner(
    client: ApiClient,
    starting_revision: int,
) -> None:
    if starting_revision:
        assert put(client, 0).status_code == 200
    barrier = threading.Barrier(2)
    lock = threading.Lock()
    seen: set[int] = set()

    def synchronize_reads(*args: Any) -> None:
        statement = args[2]
        if (
            not statement.lstrip().upper().startswith("SELECT")
            or "workspace_presentations" not in statement
        ):
            return
        thread = threading.get_ident()
        with lock:
            if thread in seen:
                return
            seen.add(thread)
        barrier.wait(timeout=5)

    engine = client.app.state.engine
    event.listen(engine, "after_cursor_execute", synchronize_reads)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            cameras = [{**CAMERA, "fov": 0.7}, {**CAMERA, "fov": 1.2}]
            responses = list(
                pool.map(lambda camera: put(client, starting_revision, camera), cameras)
            )
    finally:
        event.remove(engine, "after_cursor_execute", synchronize_reads)
    assert sorted(response.status_code for response in responses) == [200, 409]
    failure = next(response for response in responses if response.status_code == 409)
    assert failure.json()["detail"]["code"] == "presentation_revision_conflict"
    saved = client.get(PATH).json()
    assert saved["revision"] == starting_revision + 1
    assert saved["camera"] == next(
        response.json()["camera"] for response in responses if response.status_code == 200
    )


def test_camera_writes_leave_checkpoint_redo_originals_and_all_other_tables_unchanged(
    client: ApiClient,
) -> None:
    project = import_ligand(client)
    path = f"/api/v1/projects/{project['id']}"
    project = client.post(f"{path}/save", json={"expected_revision": project["revision"]}).json()
    changed = client.patch(
        path, json={"expected_revision": project["revision"], "name": "Temporary"}
    ).json()
    restored = client.post(
        f"{path}/history/undo", json={"expected_revision": changed["revision"]}
    ).json()
    assert restored["history"]["can_redo"] and not restored["has_uncheckpointed_changes"]
    reopened = client.get(path).json()
    before = other_tables(client)
    for revision in range(3):
        assert put(client, revision, {**CAMERA, "fov": 0.8 + revision / 10}).status_code == 200
    assert other_tables(client) == before
    assert client.get(path).json() == reopened
    redone = client.post(f"{path}/history/redo", json={"expected_revision": restored["revision"]})
    assert redone.status_code == 200 and redone.json()["name"] == "Temporary"


def test_saved_camera_survives_api_restart_and_is_not_project_navigation(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, database_url=f"sqlite:///{tmp_path / 'presentation.db'}")
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    client = ApiClient(app)
    saved = put(client, 0).json()
    first = client.post("/api/v1/projects", json={"name": "One"}).json()
    second = client.post("/api/v1/projects", json={"name": "Two"}).json()
    assert client.get(PATH).json() == saved
    app.state.engine.dispose()
    restarted = create_app(settings)
    try:
        recovered = ApiClient(restarted)
        assert recovered.get(PATH).json() == saved
        assert {project["id"] for project in recovered.get("/api/v1/projects").json()} == {
            first["id"],
            second["id"],
        }
        assert put(recovered, 1, {**CAMERA, "mode": "orthographic"}).json()["revision"] == 2
    finally:
        restarted.state.engine.dispose()


def test_camera_is_excluded_from_archives_and_import_does_not_replace_it(client: ApiClient) -> None:
    project = build_rich_project(client)
    saved = put(client, 0).json()
    exported = export_archive(client, project["id"], "camera-exclusion")
    data = client.get(exported["artifact"]["download_url"]).content
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        manifest_text = archive.read("manifest.json").decode()
        manifest = json.loads(manifest_text)
        assert manifest["schema_version"] == 2
        assert '"fov"' not in manifest_text
        assert "workspace_presentations" not in manifest_text
        assert "workspace_presentation" not in manifest_text
    restored = import_archive(client, data)["project"]
    assert restored["schema_version"] == 2
    assert restored["scenes"][0]["camera"] == project["scenes"][0]["camera"]
    assert client.get(PATH).json() == saved
