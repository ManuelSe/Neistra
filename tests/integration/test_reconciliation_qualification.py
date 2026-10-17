from __future__ import annotations

from pathlib import Path

from molweave_api.import_export import NORMALIZED_MEDIA_TYPE, ArtifactService
from molweave_api.models import StructureEntry
from molweave_core.artifacts import LocalArtifactStore
from molweave_core.hydrogen_protection import protection_facts
from molweave_core.molecular import NormalizedStructureV1

from tests.integration.test_archive_roundtrip import import_archive
from tests.integration.test_hydrogen_completion import preview
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture
from tests.support.hydrogen_fixture import model
from tests.support.modeling_reader_qualification import allocation_counters


def test_removed_h_references_restore_exactly_with_one_command(client: ApiClient) -> None:
    before = model("CCCC")
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}"
    chosen = {
        "atoms": [{"structure_id": entry["id"], "atom_id": 7}],
        "source": "inspector",
        "granularity": "atom",
    }
    project = client.post(
        f"{path}/selections",
        json={"expected_revision": project["revision"], "name": "H to remove", "selection": chosen},
    ).json()
    project = client.post(
        f"{path}/measurements",
        json={
            "expected_revision": project["revision"],
            "name": "CH",
            "kind": "distance",
            "atom_references": [{"structure_id": entry["id"], "atom_id": 1}, *chosen["atoms"]],
        },
    ).json()
    project = client.post(
        f"{path}/selection-representations",
        json={
            "expected_revision": project["revision"],
            "selection": chosen,
            "action": "apply",
            "style": "space-filling",
        },
    ).json()
    project = client.post(
        f"{path}/scenes",
        json={
            "expected_revision": project["revision"],
            "name": "H view",
            "selection": chosen,
            "camera": {
                "mode": "perspective",
                "position": [0, 0, 10],
                "target": [0, 0, 0],
                "up": [0, 1, 0],
                "radius": 10,
            },
        },
    ).json()
    response = edit(
        client,
        project,
        entry["id"],
        [1, 4],
        {"operation": "bond.set", "order": 1.0},
        hydrogen_policy="reconcile_if_possible",
    )
    assert response.status_code == 200, response.text
    changed = response.json()["project"]
    assert changed["saved_selections"][0]["atom_references"] == []
    assert changed["measurements"] == []
    assert changed["scenes"][0]["selection"]["atoms"] == []
    assert changed["entries"][0]["viewer_settings"]["selection_representations"] == []
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": changed["revision"]}
    ).json()
    assert undone["saved_selections"][0]["atom_references"] == chosen["atoms"]
    assert [{k: v for k, v in m.items() if k != "modified_at"} for m in undone["measurements"]] == [
        {k: v for k, v in m.items() if k != "modified_at"} for m in project["measurements"]
    ]
    assert undone["scenes"][0]["selection"] == project["scenes"][0]["selection"]
    assert undone["entries"][0]["viewer_settings"] == project["entries"][0]["viewer_settings"]
    assert structure(client, project["id"], entry["id"]) == before.model_dump(mode="json")


def test_old_import_recovers_protection_from_original_only_on_publication(
    client: ApiClient,
) -> None:
    project = client.post("/api/v1/projects", json={"name": "Historical source recovery"}).json()
    source = Path("tests/fixtures/hydrogens/butane-reconciliation.mol").read_bytes()
    path = f"/api/v1/projects/{project['id']}"
    imported = client.post(
        f"{path}/imports",
        data={
            "expected_revision": project["revision"],
            "generate_3d": "false",
            "infer_bonds": "false",
        },
        files={"files": ("butane.mol", source, "chemical/x-mdl-molfile")},
    )
    assert imported.status_code == 201, imported.text
    project = client.get(path).json()
    entry = project["entries"][0]
    before = NormalizedStructureV1.model_validate(structure(client, project["id"], entry["id"]))
    legacy = before.model_copy(update={"annotations": []})
    with client.app.state.session_factory() as session:
        artifacts = ArtifactService(session, LocalArtifactStore(client.app.state.settings.data_dir))
        artifact = artifacts.publish(
            legacy.to_bytes(), "legacy.normalized.json", NORMALIZED_MEDIA_TYPE
        )
        row = session.get(StructureEntry, entry["id"])
        row.current_artifact_id = artifact.id
        session.commit()
    project = client.get(path).json()
    counters = allocation_counters(client, project)
    action = {"operation": "bond.set", "order": 1.0}
    inspected = preview(
        client, project, entry["id"], [1, 4], action, hydrogen_policy="reconcile_if_possible"
    )
    assert inspected.status_code == 200, inspected.text
    assert inspected.json()["hydrogen_reconciliation_report"]["removed_hydrogen_count"] == 2
    assert structure(client, project["id"], entry["id"]) == legacy.model_dump(mode="json")
    assert allocation_counters(client, project) == counters
    response = edit(
        client, project, entry["id"], [1, 4], action, hydrogen_policy="reconcile_if_possible"
    )
    assert response.status_code == 200, response.text
    after = NormalizedStructureV1.model_validate(structure(client, project["id"], entry["id"]))
    assert protection_facts(after)
    assert after.source == before.source
    assert client.get(f"{path}/entries/{entry['id']}/original").content == source
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": response.json()["project"]["revision"]}
    )
    assert undone.status_code == 200
    assert structure(client, project["id"], entry["id"]) == legacy.model_dump(mode="json")
