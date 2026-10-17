from __future__ import annotations

import pytest

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_hydrogen_completion import preview
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture
from tests.support.hydrogen_fixture import model


@pytest.mark.parametrize(
    "smiles,targets,action,added,removed",
    [
        ("CCCC", [1, 4], {"operation": "bond.set", "order": 1.0}, 0, 2),
        ("C=C", [1, 2], {"operation": "bond.set", "order": 1.0}, 2, 0),
        ("CC", [1, 2], {"operation": "bond.delete"}, 2, 0),
    ],
)
def test_reconciliation_preview_apply_exact_undo_redo_and_archive(
    client: ApiClient, smiles: str, targets: list[int], action: dict, added: int, removed: int
) -> None:
    before = model(smiles)
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry['id']}/original").content
    inspected = preview(
        client, project, entry["id"], targets, action, hydrogen_policy="reconcile_if_possible"
    )
    assert inspected.status_code == 200, inspected.text
    report = inspected.json()["hydrogen_reconciliation_report"]
    assert (report["added_hydrogen_count"], report["removed_hydrogen_count"]) == (added, removed)
    assert client.get(path).json()["revision"] == project["revision"]
    assert structure(client, project["id"], entry["id"]) == before.model_dump(mode="json")
    assert len(inspected.json()["removed_atoms"]) == removed
    assert inspected.json()["moved_atoms"]
    response = edit(
        client, project, entry["id"], targets, action, hydrogen_policy="reconcile_if_possible"
    )
    assert response.status_code == 200, response.text
    assert response.json()["hydrogen_reconciliation_report"] == report
    current = response.json()["project"]
    assert current["revision"] == project["revision"] + 1
    after = structure(client, project["id"], entry["id"])
    for movement in inspected.json()["moved_atoms"]:
        assert (
            next(a for a in after["atoms"] if a["id"] == movement["atom_id"])["coordinates"]
            == movement["after"]
        )
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": current["revision"]}
    ).json()
    assert structure(client, project["id"], entry["id"]) == before.model_dump(mode="json")
    # Rejected repeated input/preview must retain Redo and original artifact.
    repeated = preview(
        client,
        undone,
        entry["id"],
        targets,
        {"operation": "bond.set", "order": 1.0},
        hydrogen_policy="reconcile_if_possible",
    )
    if smiles == "CC":
        assert repeated.status_code == 422
    redone = client.post(
        f"{path}/history/redo", json={"expected_revision": undone["revision"]}
    ).json()
    assert structure(client, project["id"], entry["id"]) == after
    assert client.get(f"{path}/entries/{entry['id']}/original").content == original
    archive = export_archive(client, project["id"], "reconciled")
    reopened = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    assert structure(client, reopened["id"], reopened["entries"][0]["id"]) == after
    assert redone["revision"] > current["revision"]


def test_preserve_default_and_additive_policy_keep_existing_h_literal(client: ApiClient) -> None:
    before = model("CC")
    for options in [
        {},
        {"hydrogen_policy": "preserve"},
        {"hydrogen_policy": "complete_if_possible"},
    ]:
        project = import_archive(client, build_fixture(before))["project"]
        entry = project["entries"][0]
        response = edit(
            client, project, entry["id"], [1, 2], {"operation": "bond.set", "order": 2.0}, **options
        )
        assert response.status_code == 200, response.text
        after = structure(client, project["id"], entry["id"])
        assert after["conformers"] == before.model_dump(mode="json")["conformers"]
        assert len(after["atoms"]) == len(before.atoms)
        assert response.json()["hydrogen_reconciliation_report"] is None


def test_partial_h_reconciliation_and_stale_or_invalid_calls_do_not_overwrite(
    client: ApiClient,
) -> None:
    before = model("CC")
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": None}) if a.id == 1 else a
                for a in before.atoms
            ]
        }
    )
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    action = {"operation": "bond.set", "order": 2.0}
    response = edit(
        client, project, entry["id"], [1, 2], action, hydrogen_policy="reconcile_if_possible"
    )
    assert response.status_code == 200
    assert response.json()["hydrogen_reconciliation_report"]["status"] == "partial"
    after = structure(client, project["id"], entry["id"])
    assert (
        edit(
            client, project, entry["id"], [1, 2], action, hydrogen_policy="reconcile_if_possible"
        ).status_code
        == 409
    )
    current = response.json()["project"]
    invalid = edit(
        client,
        current,
        entry["id"],
        [1],
        {"operation": "atom.delete"},
        hydrogen_policy="reconcile_if_possible",
    )
    assert invalid.status_code == 422
    assert structure(client, project["id"], entry["id"]) == after
