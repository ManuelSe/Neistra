from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from molweave_api.models import Artifact, CommandRecord, StructureEntry
from sqlalchemy import func, select

from tests.integration import test_selection_edits as legacy
from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.integration.test_molecule_creation import create
from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures/formats"


def imported(client: ApiClient, filename: str) -> tuple[dict[str, Any], str]:
    project = client.post("/api/v1/projects", json={"name": "Direct format qualification"}).json()
    response = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0},
        files={"files": (filename, (FIXTURES / filename).read_bytes(), "application/octet-stream")},
    )
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    return project, project["entries"][0]["id"]


@pytest.mark.parametrize(
    "filename",
    [
        "ethanol.mol",
        "molecules.sdf",
        "molecules.smi",
        "tripos_benzene.mol2",
        "water.xyz",
        "protein_models_altloc.pdb",
        "protein_models.cif",
    ],
)
def test_loaded_formats_remain_directly_editable_without_preparation(
    client: ApiClient, filename: str
) -> None:
    project, entry_id = imported(client, filename)
    before = structure(client, project["id"], entry_id)
    original = client.get(f"/api/v1/projects/{project['id']}/entries/{entry_id}/original").content
    target = before["atoms"][0]
    response = edit(
        client, project, entry_id, [target["id"]], {"operation": "atom.element", "element": "P"}
    )
    assert response.status_code == 200, response.text
    after = structure(client, project["id"], entry_id)
    assert after["atoms"][0]["element"] == "P"
    assert after["atoms"][0]["formal_charge"] == target["formal_charge"]
    assert after["atoms"][0]["coordinates"] == target["coordinates"]
    neighbors = {
        i
        for b in before["bonds"]
        if target["id"] in {b["atom_1_id"], b["atom_2_id"]}
        for i in (b["atom_1_id"], b["atom_2_id"])
    }
    for old, new in zip(before["atoms"][1:], after["atoms"][1:], strict=True):
        if old["id"] in neighbors and old["stereo"] not in {None, "NONE"}:
            assert new == {
                **old,
                "stereo": None,
                "inferred_fields": [f for f in old["inferred_fields"] if f != "stereo"],
            }
            assert any(w["code"] == "model_stereo_unassigned" for w in after["warnings"])
        else:
            assert new == old
    assert after["conformers"] == before["conformers"]
    assert after["source"] == before["source"]
    assert after["structure_type"] == before["structure_type"]
    assert (
        client.get(f"/api/v1/projects/{project['id']}/entries/{entry_id}/original").content
        == original
    )


def test_all_conformer_topology_literal_altloc_and_empty_protein_roundtrip(
    client: ApiClient,
) -> None:
    project, entry_id = imported(client, "protein_models_altloc.pdb")
    path = f"/api/v1/projects/{project['id']}"
    before = structure(client, project["id"], entry_id)
    alternate = next(a for a in before["atoms"] if a["alternate_location"] == "A")
    response = edit(
        client, project, entry_id, [alternate["id"]], {"operation": "atom.add", "element": "P"}
    )
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    added = structure(client, project["id"], entry_id)
    assert added["atoms"][:-1] == before["atoms"]
    assert added["atoms"][-1]["residue_id"] == alternate["residue_id"]
    assert added["atoms"][-1]["alternate_location"] == "A"
    for old, new in zip(before["conformers"], added["conformers"], strict=True):
        assert new["coordinates"][:-1] == old["coordinates"]
    remove_id = next(a["id"] for a in before["atoms"] if a["alternate_location"] == "B")
    response = edit(client, project, entry_id, [remove_id], {"operation": "atom.delete"})
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    after = structure(client, project["id"], entry_id)
    assert alternate in after["atoms"]
    assert all(a["id"] != remove_id for a in after["atoms"])
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": project["revision"]}
    ).json()
    assert structure(client, project["id"], entry_id) == added
    response = edit(
        client, undone, entry_id, [a["id"] for a in added["atoms"]], {"operation": "atom.delete"}
    )
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    empty = structure(client, project["id"], entry_id)
    assert empty["atoms"] == [] and empty["bonds"] == []
    assert len(empty["conformers"]) == len(before["conformers"]) == 2
    assert all(not c["coordinates"] for c in empty["conformers"])
    archive = export_archive(client, project["id"], "empty-protein")
    restored = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    assert structure(client, restored["id"], restored["entries"][0]["id"]) == empty


@pytest.mark.parametrize("replacement", [False, True])
def test_direct_deletion_or_fragment_replacement_reconciles_all_references(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, replacement: bool
) -> None:
    old_edit = legacy.edit

    def operation(client, project, entry_id, ids, action):  # type: ignore[no-untyped-def]
        if action["operation"] == "hydrogens.prepare":
            return old_edit(client, project, entry_id, ids, action)
        if action["operation"] == "atom.element":
            action = {"operation": "fragment.attach", "fragment": "methyl"}
        return edit(client, project, entry_id, ids, action)

    monkeypatch.setattr(legacy, "edit", operation)
    legacy.test_deleted_id_reconciles_all_references_and_exact_inverse(client, replacement)


def test_preview_does_not_publish_artifacts_commands_or_allocator_changes(
    client: ApiClient,
) -> None:
    result = create(client)
    project, entry_id = result["project"], result["entry_id"]
    engine = client.app.state.engine

    def snapshot() -> tuple[Any, ...]:
        with engine.connect() as connection:
            return (
                connection.execute(select(func.count()).select_from(Artifact)).scalar_one(),
                connection.execute(select(func.count()).select_from(CommandRecord)).scalar_one(),
                connection.execute(
                    select(StructureEntry.next_atom_id, StructureEntry.next_bond_id).where(
                        StructureEntry.id == entry_id
                    )
                ).one(),
            )

    before = snapshot()
    for direction in range(6):
        response = client.post(
            f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits/preview",
            json={
                "expected_revision": project["revision"],
                "expected_artifact_id": project["entries"][0]["current_artifact_id"],
                "selection": result["selection_after"],
                "action": {
                    "operation": "fragment.attach",
                    "fragment": "phenyl",
                    "direction": direction,
                    "rotation": direction,
                },
            },
        )
        assert response.status_code == 200, response.text
        assert snapshot() == before


def test_draft_export_requires_loss_acknowledgement_and_preserves_canonical_values(
    client: ApiClient,
) -> None:
    project, entry_id = imported(client, "water.xyz")
    before = structure(client, project["id"], entry_id)
    path = f"/api/v1/projects/{project['id']}/entries/{entry_id}"
    response = client.post(f"{path}/exports", json={"format": "sdf", "acknowledge_losses": False})
    assert response.status_code == 409, response.text
    assert "unknown_formal_charges_mapped" in response.text
    response = client.post(f"{path}/exports", json={"format": "sdf", "acknowledge_losses": True})
    assert response.status_code == 201, response.text
    assert any(w["code"] == "unknown_bond_orders_mapped" for w in response.json()["warnings"])
    assert structure(client, project["id"], entry_id) == before
    response = client.post(f"{path}/exports", json={"format": "smiles", "acknowledge_losses": True})
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "incomplete_chemistry"
    assert structure(client, project["id"], entry_id) == before
