import pytest

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.integration.test_viewer_state import apply_style, color_selection, selection
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture
from tests.support.hydrogen_fixture import model


@pytest.mark.parametrize(
    "action,replace_h",
    [
        ({"operation": "atom.add", "element": "N"}, False),
        ({"operation": "fragment.attach", "fragment": "ethyl"}, False),
        ({"operation": "fragment.attach", "fragment": "methyl"}, True),
    ],
)
def test_appearance_inheritance_and_deleted_reference_pruning_are_atomic(
    client: ApiClient, action: dict, replace_h: bool
) -> None:
    before = model("CC.O")
    h = max(b.atom_2_id for b in before.bonds if b.atom_1_id == 1)
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    project = apply_style(client, project, selection(entry["id"], 1, h), "stick").json()
    project = color_selection(client, project, selection(entry["id"], 1, h), "#ad12ef").json()
    original_settings = project["entries"][0]["viewer_settings"]
    response = edit(
        client, project, entry["id"], [h if replace_h else 1], action, hydrogen_policy="automatic"
    )
    assert response.status_code == 200, response.text
    data = response.json()
    current = data["project"]
    created = data["report"]["created_atom_ids"]
    deleted = set(data["report"]["deleted_atom_ids"])
    assert h in deleted
    expected = sorted(({1, h} | set(created)) - deleted)
    settings = current["entries"][0]["viewer_settings"]
    assert settings["selection_representations"] == [{"style": "stick", "atom_ids": expected}]
    assert settings["selection_colors"] == [{"color": "#ad12ef", "atom_ids": expected}]
    assert current["revision"] == project["revision"] + 1
    after = structure(client, project["id"], entry["id"])
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": current["revision"]}
    ).json()
    assert undone["entries"][0]["viewer_settings"] == original_settings
    assert structure(client, project["id"], entry["id"]) == before.model_dump(mode="json")
    redone = client.post(
        f"{path}/history/redo", json={"expected_revision": undone["revision"]}
    ).json()
    assert redone["entries"][0]["viewer_settings"] == settings
    assert structure(client, project["id"], entry["id"]) == after


@pytest.mark.parametrize("color", ["#ff00ff", "element"])
def test_appearance_inheritance_single_h_scenes_save_and_archive(
    client: ApiClient, color: str
) -> None:
    before = model("N")
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    project = apply_style(client, project, selection(entry["id"], 1), "thick-stick").json()
    if color == "element":
        result = client.post(
            f"{path}/selection-appearance",
            json={
                "expected_revision": project["revision"],
                "selection": selection(entry["id"], 1),
                "property": "color",
                "action": "set",
                "color": "#ff00ff",
                "color_mode": "carbon",
            },
        )
        assert result.status_code == 200, result.text
        project = result.json()
    else:
        project = color_selection(client, project, selection(entry["id"], 1), color).json()
    scene = client.post(
        f"{path}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "Before H",
            "selection": selection(entry["id"], 1),
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
    scene_before = project["scenes"][0]["entry_states"]
    response = edit(client, project, entry["id"], [1], {"operation": "hydrogens.add_one"})
    assert response.status_code == 200, response.text
    current = response.json()["project"]
    added = response.json()["report"]["created_atom_ids"][0]
    settings = current["entries"][0]["viewer_settings"]
    assert settings["selection_representations"] == [
        {"style": "thick-stick", "atom_ids": [1, added]}
    ]
    assert settings["selection_colors"] == [{"color": color, "atom_ids": [1, added]}]
    assert current["scenes"][0]["entry_states"] == scene_before
    saved = client.post(f"{path}/save", json={"expected_revision": current["revision"]})
    assert saved.status_code == 200
    archive = export_archive(client, project["id"], "appearance-inheritance")
    restored = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    assert restored["entries"][0]["viewer_settings"] == settings
    assert (
        restored["scenes"][0]["entry_states"][0]["viewer_settings"]
        == scene_before[0]["viewer_settings"]
    )
    assert structure(client, restored["id"], restored["entries"][0]["id"]) == structure(
        client, project["id"], entry["id"]
    )
