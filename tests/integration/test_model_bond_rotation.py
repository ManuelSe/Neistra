"""The compact rotation API preserves scientific identities across spawned computation."""

from __future__ import annotations

import json
from dataclasses import replace
from typing import Any
from uuid import uuid4

import numpy as np
import pytest
from neistra_api.edit_computation import needs_original_protection
from neistra_api.models import Artifact, CommandRecord, StructureEntry
from neistra_api.schemas import ModelEditCreate
from neistra_core.editing.ligand import RdkitLigandEditor
from neistra_core.molecular import Conformer, NormalizedStructureV1
from sqlalchemy import func, select

from tests.integration.test_archive_roundtrip import import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_selection_edits import selection
from tests.scientific.test_conformer_bond_rotation import conformer_ligand
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture
from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_ligand_editor import ligand


def operand(
    project: dict[str, Any], entry_id: str, moving: int, angle: float,
    axis: tuple[int, int] = (20, 30),
) -> dict[str, Any]:
    return {
        "expected_revision": project["revision"],
        "expected_artifact_id": project["entries"][0]["current_artifact_id"],
        "selection": selection(entry_id, list(axis)),
        "hydrogen_policy": "automatic",
        "action": {"operation": "bond.rotate", "moving_endpoint_id": moving,
                   "angle_degrees": angle},
    }


def durable_state(client: ApiClient, project_id: str, entry_id: str) -> tuple[Any, ...]:
    with client.app.state.engine.connect() as connection:
        counts = tuple(connection.execute(select(func.count()).select_from(table)).scalar_one()
                       for table in (Artifact, CommandRecord))
        identities = tuple(connection.execute(select(
            StructureEntry.next_atom_id, StructureEntry.next_bond_id,
            StructureEntry.current_artifact_id, StructureEntry.viewer_settings,
        ).where(StructureEntry.id == entry_id)).one())
    root = client.app.state.edit_execution.settings.data_dir / "artifacts"
    files = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
    return client.get(f"/api/v1/projects/{project_id}").json(), counts, identities, files


def setup_model(
    client: ApiClient, before: NormalizedStructureV1,
) -> tuple[dict[str, Any], str, str]:
    project = import_archive(client, build_fixture(before))["project"]
    entry_id = project["entries"][0]["id"]
    path = f"/api/v1/projects/{project['id']}/entries/{entry_id}/model-edits"
    return project, entry_id, path


@pytest.mark.parametrize("moving", [20, 30])
@pytest.mark.parametrize("angle", [-90.0, 90.0])
def test_preview_and_apply_follow_analytic_quarter_turn_in_every_frame(
    client: ApiClient, moving: int, angle: float,
) -> None:
    before = conformer_ligand()
    project, entry_id, path = setup_model(client, before)
    payload = operand(project, entry_id, moving, angle)
    # No source evidence is present in this fixture: automatic graph editing
    # would request recovery, whereas this coordinate-only action must skip it.
    assert needs_original_protection(before, ModelEditCreate.model_validate(payload)) is False
    baseline = durable_state(client, project["id"], entry_id)
    original = client.get(path.removesuffix("/model-edits") + "/original").content
    response = client.post(path + "/preview", json=payload)
    assert response.status_code == 200, response.text
    preview = response.json()
    changed = 10 if moving == 20 else 40
    assert preview["rotation"] == {
        "axis_atom_ids": [30, 20] if moving == 20 else [20, 30],
        "moving_endpoint_id": moving, "angle_degrees": angle,
        "rotating_atom_count": 1, "fixed_atom_count": 4, "no_op": False,
    }
    assert [row["atom_id"] for row in preview["moved_atoms"]] == [changed]
    assert preview["hydrogen_report"] is None
    assert preview["hydrogen_reconciliation_report"] is None
    assert durable_state(client, project["id"], entry_id) == baseline
    applied = client.post(path, json=payload)
    assert applied.status_code == 200, applied.text
    result = applied.json()
    assert result["applied"] is True
    assert result["hydrogen_report"] is None
    assert result["hydrogen_reconciliation_report"] is None
    after = NormalizedStructureV1.model_validate(structure(client, project["id"], entry_id))
    # These are closed-form quarter-turn positions in the fixture's three known
    # reference frames, independent of the rotation implementation/matrix helper.
    sign = 1 if angle > 0 else -1
    local = (0.0, 0.0, -sign) if moving == 20 else (1.5, 0.0, sign)
    expected = {11: local, 25: (7-local[1], -3+local[0], 4+local[2]),
                42: (-8+local[2], 5+local[1], 2-local[0])}
    index = [a.id for a in before.atoms].index(changed)
    for old, new in zip(before.conformers, after.conformers, strict=True):
        assert new.coordinates[index] == pytest.approx(expected[old.id], abs=1e-12)
        for row, atom in enumerate(before.atoms):
            if atom.id != changed:
                assert new.coordinates[row] == old.coordinates[row]
    assert preview["moved_atoms"][0]["after"] == list(after.atoms[index].coordinates)
    for old, new in zip(before.atoms, after.atoms, strict=True):
        assert new.model_copy(update={"coordinates": old.coordinates}) == old
    assert after.bonds == before.bonds
    assert after.annotations == before.annotations and after.metadata == before.metadata
    assert after.source == before.source and after.inferences == before.inferences
    assert after.active_conformer_id == before.active_conformer_id
    assert client.get(path.removesuffix("/model-edits") + "/original").content == original
    undone = client.post(f"/api/v1/projects/{project['id']}/history/undo",
                         json={"expected_revision": result["project"]["revision"]})
    assert undone.status_code == 200, undone.text
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    redone = client.post(f"/api/v1/projects/{project['id']}/history/redo",
                         json={"expected_revision": undone.json()["revision"]})
    assert redone.status_code == 200, redone.text
    assert structure(client, project["id"], entry_id) == after.model_dump(mode="json")


@pytest.mark.parametrize("case", ["zero", "full", "negative_full", "collinear"])
def test_qualified_no_change_has_preview_counts_but_no_durable_publication(
    client: ApiClient, case: str,
) -> None:
    before = conformer_ligand()
    angle = {"zero": 0.0, "full": 360.0, "negative_full": -360.0, "collinear": 90.0}[case]
    if case == "collinear":
        frames = []
        for frame in before.conformers:
            rows = list(frame.coordinates)
            rows[3] = tuple(2*b-a for a, b in zip(rows[1], rows[2], strict=True))
            frames.append(frame.model_copy(update={"coordinates": rows}))
        before = before.model_copy(update={
            "conformers": frames,
            "atoms": [a.model_copy(update={"coordinates": frames[1].coordinates[n]})
                      for n, a in enumerate(before.atoms)],
        })
    project, entry_id, path = setup_model(client, before)
    payload = operand(project, entry_id, 30, angle)
    baseline = durable_state(client, project["id"], entry_id)
    preview = client.post(path + "/preview", json=payload)
    assert preview.status_code == 200, preview.text
    assert preview.json()["rotation"] == {
        "axis_atom_ids": [20, 30], "moving_endpoint_id": 30, "angle_degrees": angle,
        "rotating_atom_count": 1, "fixed_atom_count": 4, "no_op": True,
    }
    assert preview.json()["moved_atoms"] == []
    assert durable_state(client, project["id"], entry_id) == baseline
    token = str(uuid4())
    result = client.post(path, json=payload, headers={"X-Neistra-Edit-Attempt": token})
    assert result.status_code == 200, result.text
    assert result.json()["applied"] is False
    assert result.json()["selection_after"] == payload["selection"]
    assert durable_state(client, project["id"], entry_id) == baseline
    receipt = client.get(f"/api/v1/projects/{project['id']}/edit-attempts/{token}").json()
    assert receipt["phase"] == "finished" and receipt["outcome"] == "not_applied"
    assert receipt["reason"] == "no_change"
    assert receipt["committed_revision"] is None and receipt["committed_artifact_id"] is None
    assert not list(client.app.state.edit_execution.work_root.iterdir())


def test_counts_include_hidden_explicit_hydrogens_and_automatic_policy_preserves_them(
    client: ApiClient,
) -> None:
    before = model("CCCC.O")
    project, entry_id, path = setup_model(client, before)
    # Visibility is presentation state; the qualified graph operand contains all H.
    with client.app.state.session_factory() as session:
        entry = session.get(StructureEntry, entry_id)
        assert entry is not None
        settings = json.loads(json.dumps(entry.viewer_settings))
        settings["components"]["hydrogens"] = False
        settings["components"]["nonpolar_hydrogens"] = False
        entry.viewer_settings = settings
        session.commit()
    payload = operand(project, entry_id, 3, 0, axis=(2, 3))
    assert needs_original_protection(before, ModelEditCreate.model_validate(payload)) is False
    preview = client.post(path + "/preview", json=payload)
    assert preview.status_code == 200, preview.text
    assert preview.json()["rotation"]["rotating_atom_count"] == 6
    assert preview.json()["rotation"]["fixed_atom_count"] == 11
    payload["action"]["angle_degrees"] = 45
    applied = client.post(path, json=payload)
    assert applied.status_code == 200, applied.text
    after = structure(client, project["id"], entry_id)
    for old, new in zip(before.model_dump(mode="json")["atoms"], after["atoms"], strict=True):
        assert {**new, "coordinates": old["coordinates"]} == old
    assert after["annotations"] == before.model_dump(mode="json")["annotations"]
    assert after["bonds"] == before.model_dump(mode="json")["bonds"]
    assert applied.json()["hydrogen_report"] is None
    assert applied.json()["hydrogen_reconciliation_report"] is None
    assert applied.json()["project"]["entries"][0]["viewer_settings"] == settings


def test_coordinate_rotation_preserves_supplied_stereo_and_annotations(client: ApiClient) -> None:
    before = ligand("CC[C@H](F)CO.O")
    extra = [tuple(row) for row in np.asarray(before.active_coordinates) + np.asarray((7, -3, 4))]
    before = before.model_copy(update={
        "conformers": [*before.conformers, Conformer(id=9, name="Translated", coordinates=extra)],
        "annotations": [*before.annotations, {"kind": "authored-note", "value": "retain"}],
    })
    assert any(a.stereo not in {None, "NONE"} for a in before.atoms)
    project, entry_id, path = setup_model(client, before)
    applied = client.post(path, json=operand(project, entry_id, 3, 45, axis=(2, 3)))
    assert applied.status_code == 200, applied.text
    after = structure(client, project["id"], entry_id)
    for old, new in zip(before.model_dump(mode="json")["atoms"], after["atoms"], strict=True):
        assert {**new, "coordinates": old["coordinates"]} == old
    assert after["annotations"] == before.model_dump(mode="json")["annotations"]
    assert after["bonds"] == before.model_dump(mode="json")["bonds"]
    assert after["metadata"] == before.metadata


def test_invalid_inactive_frame_refuses_even_zero_setup_without_mutation(client: ApiClient) -> None:
    before = conformer_ligand()
    frame = before.conformers[-1]
    rows = list(frame.coordinates)
    rows[2] = rows[1]
    before = before.model_copy(update={"conformers": [
        *before.conformers[:-1], frame.model_copy(update={"coordinates": rows}),
    ]})
    project, entry_id, path = setup_model(client, before)
    baseline = durable_state(client, project["id"], entry_id)
    for suffix, angle in [("/preview", 0.0), ("", 90.0)]:
        result = client.post(path + suffix, json=operand(project, entry_id, 30, angle))
        assert result.status_code == 422, result.text
        assert "Conformer 42" in result.json()["detail"]["message"]
        assert durable_state(client, project["id"], entry_id) == baseline


@pytest.mark.parametrize("change", ["revision", "artifact"])
def test_captured_preview_target_cannot_apply_to_newer_structure(
    client: ApiClient, change: str,
) -> None:
    project, entry_id, path = setup_model(client, conformer_ligand())
    captured = operand(project, entry_id, 30, 90)
    preview = client.post(path + "/preview", json=captured)
    assert preview.status_code == 200, preview.text
    if change == "revision":
        updated = client.patch(path.removesuffix("/model-edits"),
                               json={"expected_revision": project["revision"], "name": "Renamed"})
        assert updated.status_code == 200, updated.text
    else:
        updated = client.post(path, json=captured)
        assert updated.status_code == 200, updated.text
        captured["expected_revision"] = updated.json()["project"]["revision"]
    baseline = durable_state(client, project["id"], entry_id)
    for suffix in ["/preview", ""]:
        result = client.post(path + suffix, json=captured)
        assert result.status_code == (409 if change == "revision" else 422), result.text
        assert durable_state(client, project["id"], entry_id) == baseline


def test_other_preview_operation_has_no_rotation_details(client: ApiClient) -> None:
    project, entry_id, path = setup_model(client, conformer_ligand())
    payload = operand(project, entry_id, 30, 90)
    payload["action"] = {"operation": "bond.delete"}
    payload["hydrogen_policy"] = "preserve"
    preview = client.post(path + "/preview", json=payload)
    assert preview.status_code == 200, preview.text
    assert preview.json()["rotation"] is None


@pytest.mark.parametrize("angle", [0.0, 60.0])
@pytest.mark.parametrize("suffix", ["/preview", ""])
def test_configured_limit_refuses_rotation_before_publication(
    client: ApiClient, angle: float, suffix: str,
) -> None:
    project, entry_id, path = setup_model(client, conformer_ligand())
    controller = client.app.state.edit_execution
    controller.settings = replace(controller.settings, atom_hard_limit=4)
    baseline = durable_state(client, project["id"], entry_id)
    token = str(uuid4())
    result = client.post(path + suffix, json=operand(project, entry_id, 30, angle),
                         headers={"X-Neistra-Edit-Attempt": token})
    assert result.status_code == 422, result.text
    assert result.json()["detail"]["code"] == "invalid_project_operation"
    assert result.json()["detail"]["message"] == "The result exceeds the entry limit of 4 atoms."
    assert durable_state(client, project["id"], entry_id) == baseline
    if not suffix:
        receipt = client.get(f"/api/v1/projects/{project['id']}/edit-attempts/{token}").json()
        assert receipt["phase"] == "finished" and receipt["outcome"] == "not_applied"


@pytest.mark.parametrize("angle", [1e20, -1e308])
@pytest.mark.parametrize("moving", [20, 30])
def test_finite_angle_periodicity_survives_spawn_and_preserves_requested_metadata(
    client: ApiClient, angle: float, moving: int,
) -> None:
    before = conformer_ligand()
    project, entry_id, path = setup_model(client, before)
    numerator, denominator = angle.as_integer_ratio()
    equivalent = (numerator % (360 * denominator)) / denominator
    expected = RdkitLigandEditor().rotate_bond(
        before, bond_id=71, movable_atom_ids=[10, 20] if moving == 20 else [30, 40],
        angle_degrees=equivalent,
    ).structure
    payload = operand(project, entry_id, moving, angle)
    preview = client.post(path + "/preview", json=payload)
    assert preview.status_code == 200, preview.text
    assert preview.json()["rotation"]["angle_degrees"] == angle
    assert preview.json()["rotation"]["no_op"] is False
    applied = client.post(path, json=payload)
    assert applied.status_code == 200, applied.text
    actual = NormalizedStructureV1.model_validate(structure(client, project["id"], entry_id))
    for original, bounded, current in zip(
        before.conformers, expected.conformers, actual.conformers, strict=True,
    ):
        assert np.asarray(current.coordinates) == pytest.approx(
            np.asarray(bounded.coordinates), abs=1e-12,
        )
        for index, atom in enumerate(before.atoms):
            if atom.id in {20, 30, 99, 40 if moving == 20 else 10}:
                assert current.coordinates[index] == original.coordinates[index]


@pytest.mark.parametrize("angle", [0.0, 60.0])
def test_inactive_geometry_diagnostics_reach_preview_and_durable_apply(
    client: ApiClient, angle: float,
) -> None:
    before = conformer_ligand()
    rows = list(before.conformers[-1].coordinates)
    rows[3] = (rows[2][0], rows[2][1] + 4, rows[2][2])
    before = before.model_copy(update={"conformers": [
        *before.conformers[:-1], before.conformers[-1].model_copy(update={"coordinates": rows}),
    ]})
    project, entry_id, path = setup_model(client, before)
    baseline = durable_state(client, project["id"], entry_id)
    payload = operand(project, entry_id, 30, angle)
    preview = client.post(path + "/preview", json=payload)
    assert preview.status_code == 200, preview.text
    warnings = preview.json()["warnings"]
    assert any(w["code"] == "model_bond_geometry" and "Conformer 42, bond 99" in w["message"]
               for w in warnings)
    assert any(w["code"] == "model_bond_geometry_summary" and "all 3 conformers: 1" in w["message"]
               for w in warnings)
    assert durable_state(client, project["id"], entry_id) == baseline
    applied = client.post(path, json=payload)
    assert applied.status_code == 200, applied.text
    if angle == 0:
        assert applied.json()["applied"] is False
        assert durable_state(client, project["id"], entry_id) == baseline
    else:
        after = structure(client, project["id"], entry_id)
        assert any(w["code"] == "model_bond_geometry" and "Conformer 42, bond 99" in w["message"]
                   for w in after["warnings"])
