from tests.integration.test_archive_roundtrip import import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture
from tests.support.hydrogen_fixture import model


def test_optional_completion_is_one_command_with_originals_and_exact_undo(
    client: ApiClient,
) -> None:
    before = model("CC(C)C(=O)Nc1ccc(O)cc1", remove_h_on={1})
    # An explicit assignment, rather than a no-op, triggers post-edit completion.
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": None}) if a.id == 1 else a
                for a in before.atoms
            ]
        }
    )
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry_id}/original").content
    response = edit(
        client,
        project,
        entry_id,
        [1],
        {"operation": "atom.charge.set", "charge": 0},
        hydrogen_policy="complete_if_possible",
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["applied"] is True
    assert result["hydrogen_report"]["added_hydrogen_count"] == 3
    after = structure(client, project["id"], entry_id)
    assert result["project"]["revision"] == project["revision"] + 1
    assert [a["coordinates"] for a in after["atoms"][: len(before.atoms)]] == [
        list(a.coordinates) for a in before.atoms
    ]
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": result["project"]["revision"]}
    ).json()
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    client.post(f"{path}/history/redo", json={"expected_revision": undone["revision"]})
    assert structure(client, project["id"], entry_id) == after
    assert client.get(f"{path}/entries/{entry_id}/original").content == original


def preview(client, project, entry_id, ids, action, **options):  # type: ignore[no-untyped-def]
    from tests.integration.test_selection_edits import selection

    entry = next(e for e in project["entries"] if e["id"] == entry_id)
    return client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits/preview",
        json={
            "expected_revision": project["revision"],
            "expected_artifact_id": entry["current_artifact_id"],
            "selection": selection(entry_id, ids),
            "action": action,
            **options,
        },
    )


def test_standalone_preview_is_pure_apply_recomputes_and_noop_retains_redo(
    client: ApiClient,
) -> None:
    before = model("CC", remove_h_on={1})
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}"
    action = {"operation": "hydrogens.complete", "scope": "entry"}
    project = client.get(path).json()
    first = preview(client, project, entry_id, [], action)
    second = preview(client, project, entry_id, [], action)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert len(first.json()["atoms"]) == 3
    assert all(a["preview_id"].startswith("preview-") for a in first.json()["atoms"])
    assert client.get(path).json() == project
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    response = edit(client, project, entry_id, [], action)
    assert response.status_code == 200, response.text
    assert response.json()["applied"]
    project = client.get(path).json()
    after = structure(client, project["id"], entry_id)
    assert [a["coordinates"] for a in after["atoms"][-3:]] == [
        a["coordinates"] for a in first.json()["atoms"]
    ]
    noop = edit(client, project, entry_id, [], action)
    assert noop.status_code == 200, noop.text
    assert noop.json()["applied"] is False
    assert noop.json()["hydrogen_report"]["status"] == "unchanged"
    assert noop.json()["project"] == project
    assert client.get(path).json() == project
    assert structure(client, project["id"], entry_id) == after
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    undone = client.get(path).json()
    # Carbon 2 was already complete; this diagnostic-only request must retain Redo.
    noop = edit(client, undone, entry_id, [2], {"operation": "hydrogens.complete"})
    assert noop.status_code == 200
    assert noop.json()["project"] == undone
    redone = client.post(f"{path}/history/redo", json={"expected_revision": undone["revision"]})
    assert redone.status_code == 200, redone.text
    assert structure(client, project["id"], entry_id) == after


def test_explicit_add_count_works_with_unknown_chemistry_and_preserves_retained_values(
    client: ApiClient,
) -> None:
    before = model("CC", remove_h_on={1})
    before = before.model_copy(
        update={
            "atoms": [a.model_copy(update={"formal_charge": None}) for a in before.atoms],
            "bonds": [b.model_copy(update={"order": None}) for b in before.bonds],
        }
    )
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    for geometry, count in [("linear", 1), ("trigonal_planar", 2), ("tetrahedral", 3)]:
        action = {
            "operation": "hydrogens.add",
            "count": count,
            "geometry": geometry,
            "orientation": 2,
        }
        ghost = preview(client, project, entry_id, [1], action)
        assert ghost.status_code == 200, ghost.text
        assert len(ghost.json()["atoms"]) == count
        applied = edit(client, project, entry_id, [1], action)
        assert applied.status_code == 200, applied.text
        result = applied.json()
        assert result["applied"]
        after = structure(client, project["id"], entry_id)
        assert after["atoms"][: len(before.atoms)] == before.model_dump(mode="json")["atoms"]
        assert after["bonds"][: len(before.bonds)] == before.model_dump(mode="json")["bonds"]
        assert [a["coordinates"] for a in after["atoms"][-count:]] == [
            a["coordinates"] for a in ghost.json()["atoms"]
        ]
        project = client.post(
            f"/api/v1/projects/{project['id']}/history/undo",
            json={"expected_revision": result["project"]["revision"]},
        ).json()


def test_unresolved_is_noop_and_guards_do_not_publish(client: ApiClient) -> None:
    before = model("CC")
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    project = client.get(f"/api/v1/projects/{project['id']}").json()
    # A saturated site has no free tetrahedral vertex for one more H.
    action = {"operation": "hydrogens.add", "count": 1}
    response = edit(client, project, entry_id, [1], action)
    assert response.status_code == 200, response.text
    assert not response.json()["applied"]
    assert response.json()["hydrogen_report"]["reason_counts"] == {"geometry_capacity": 1}
    assert response.json()["project"] == project
    for ids, invalid in [
        ([], action),
        ([1, 2], action),
        ([3], action),
        ([9999], action),
        ([1], {**action, "count": 0}),
        ([1], {**action, "count": True}),
        ([1], {**action, "orientation": 6}),
        ([1], {**action, "geometry": "arbitrary"}),
    ]:
        failed = edit(client, project, entry_id, ids, invalid)
        assert failed.status_code == 422, failed.text
    failed = edit(client, project, entry_id, [1], action, hydrogen_policy="complete_if_possible")
    assert failed.status_code == 422
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
