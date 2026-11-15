"""Provisional aromatic maintenance travels through the bounded atomic edit path."""

from __future__ import annotations

import asyncio
from typing import Any, cast

import pytest
from fastapi import Request
from neistra_api.edit_execution import EditExecutionController
from neistra_api.edit_execution_data import EditOutput
from neistra_api.schemas import ModelEditCreate
from neistra_core.molecular import Conformer, NormalizedStructureV1

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_edit_execution import OwnedRequest, canonical_files
from tests.integration.test_hydrogen_completion import preview
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.integration.test_selection_edits import selection
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture
from tests.support.hydrogen_fixture import model
from tests.support.modeling_reader_qualification import allocation_counters
from tests.unit.editing.test_automatic_hydrogens import hcounts


def test_aromatic_preview_apply_history_reload_archive_and_monotonic_h(client: ApiClient) -> None:
    before = model("CC.O")
    points = [(z + 9, x - 4, y + 3) for x, y, z in before.active_coordinates]
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": points[n]}) for n, a in enumerate(before.atoms)
            ],
            "conformers": [*before.conformers, Conformer(id=7, name="Active", coordinates=points)],
            "active_conformer_id": 7,
            "metadata": {
                **before.metadata,
                "authored_note": "preserve",
                "neistra_modeling": {"schema_version": 1, "excluded_bonds": [[1, 3]]},
            },
        }
    )
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}"
    project = client.get(path).json()
    original = client.get(f"{path}/entries/{entry_id}/original").content
    counts = allocation_counters(client, project)
    action = {"operation": "bond.set", "order": 1.5}
    inspected = preview(client, project, entry_id, [1, 2], action, hydrogen_policy="automatic")
    assert inspected.status_code == 200, inspected.text
    report = inspected.json()["hydrogen_reconciliation_report"]
    assert report["removed_hydrogen_count"] == 2
    assert report["reason_counts"]["provisional_aromatic_carbon"] == 2
    assert len(inspected.json()["removed_atoms"]) == 2
    assert inspected.json()["moved_atoms"]
    assert allocation_counters(client, project) == counts
    assert client.get(path).json() == project
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    response = edit(client, project, entry_id, [1, 2], action, hydrogen_policy="automatic")
    assert response.status_code == 200, response.text
    assert response.json()["hydrogen_reconciliation_report"] == report
    project = response.json()["project"]
    after = structure(client, project["id"], entry_id)
    parsed = NormalizedStructureV1.model_validate(after)
    assert hcounts(parsed)[1] == hcounts(parsed)[2] == 2
    assert parsed.metadata["authored_note"] == "preserve"
    assert parsed.metadata["neistra_modeling"]["excluded_bonds"] == [[1, 3]]
    for movement in inspected.json()["moved_atoms"]:
        assert (
            next(a for a in after["atoms"] if a["id"] == movement["atom_id"])["coordinates"]
            == movement["after"]
        )
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    project = client.post(
        f"{path}/history/redo", json={"expected_revision": undone["revision"]}
    ).json()
    assert structure(client, project["id"], entry_id) == after
    assert client.get(f"{path}/entries/{entry_id}/original").content == original
    assert client.get(path).json()["revision"] == project["revision"]
    archive = export_archive(client, project["id"], "aromatic-automatic")
    reopened = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    assert structure(client, reopened["id"], reopened["entries"][0]["id"]) == after

    # An isolated authored aromatic edge becomes ordinary ethane, then disconnected
    # methane sites; all replacement H use fresh monotonic identities.
    created: list[int] = []
    for next_action, expected in [
        ({"operation": "bond.set", "order": 1.0}, 3),
        ({"operation": "bond.delete"}, 4),
    ]:
        response = edit(client, project, entry_id, [1, 2], next_action, hydrogen_policy="automatic")
        assert response.status_code == 200, response.text
        new_ids = response.json()["report"]["created_atom_ids"]
        assert new_ids and min(new_ids) > max([a.id for a in before.atoms] + created)
        created.extend(new_ids)
        project = response.json()["project"]
        current = NormalizedStructureV1.model_validate(structure(client, project["id"], entry_id))
        assert hcounts(current)[1] == hcounts(current)[2] == expected
        assert current.source == before.source
        assert client.get(f"{path}/entries/{entry_id}/original").content == original
    assert not client.app.state.edit_execution.active
    assert not list(client.app.state.edit_execution.work_root.iterdir())


@pytest.mark.parametrize("kind", ["preview", "model"])
def test_cancel_completed_spawned_aromatic_computation_before_publication(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    before = model("CC")
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}"
    project = client.get(path).json()
    counts = allocation_counters(client, project)
    controller: EditExecutionController = client.app.state.edit_execution
    files = canonical_files(controller)
    original_run = controller._run_child
    payload = ModelEditCreate.model_validate(
        {
            "expected_revision": project["revision"],
            "expected_artifact_id": project["entries"][0]["current_artifact_id"],
            "selection": selection(entry_id, [1, 2]),
            "action": {"operation": "bond.set", "order": 1.5},
            "hydrogen_policy": "automatic",
        }
    )

    async def run() -> None:
        ready, release = asyncio.Event(), asyncio.Event()

        async def held_result(*args: Any) -> EditOutput:
            result = await original_run(*args)
            ready.set()
            await release.wait()
            return result

        monkeypatch.setattr(controller, "_run_child", held_result)
        task = asyncio.create_task(
            controller.execute(
                cast(Any, kind), project["id"], entry_id, payload, cast(Request, OwnedRequest())
            )
        )
        try:
            await asyncio.wait_for(ready.wait(), 10)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        finally:
            release.set()

    asyncio.run(run())
    assert client.get(path).json() == project
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    assert allocation_counters(client, project) == counts
    assert canonical_files(controller) == files
    assert not controller.active and not list(controller.work_root.iterdir())
