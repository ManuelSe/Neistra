"""Spawned direct rotation refuses unknown canonical axes without publication."""

import pytest
from neistra_core.molecular import NormalizedStructureV1

from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_bond_rotation import durable_state, operand, setup_model
from tests.scientific.test_conformer_bond_rotation import conformer_ligand
from tests.support.api_client import ApiClient

ADMISSION_MESSAGE = "Choose a nonaromatic single bond with known order."


def axis_model(order: float | None, aromatic: bool = False) -> NormalizedStructureV1:
    before = conformer_ligand()
    return before.model_copy(
        update={
            "bonds": [
                b.model_copy(update={"order": order, "aromatic": aromatic}) if b.id == 71 else b
                for b in before.bonds
            ]
        }
    )


@pytest.mark.parametrize("angle", [0.0, 60.0])
@pytest.mark.parametrize("suffix", ["/preview", ""])
@pytest.mark.parametrize(
    "order,aromatic",
    [(None, False), (2.0, False), (3.0, False), (1.5, True), (1.0, True), (1.5, False)],
)
def test_spawned_rotation_rejects_ineligible_canonical_axis_without_publication(
    client: ApiClient, order: float | None, aromatic: bool, angle: float, suffix: str
) -> None:
    before = axis_model(order, aromatic)
    project, entry_id, path = setup_model(client, before)
    baseline = durable_state(client, project["id"], entry_id)
    original_path = path.removesuffix("/model-edits") + "/original"
    original = client.get(original_path).content
    result = client.post(path + suffix, json=operand(project, entry_id, 30, angle))
    assert result.status_code == 422, result.text
    assert result.json()["detail"]["code"] == "invalid_project_operation"
    if order is None:
        assert result.json()["detail"]["message"] == ADMISSION_MESSAGE
    assert durable_state(client, project["id"], entry_id) == baseline
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    assert client.get(original_path).content == original
    controller = client.app.state.edit_execution
    assert not controller.active and not list(controller.work_root.iterdir())


@pytest.mark.parametrize("angle", [0.0, 60.0])
@pytest.mark.parametrize("suffix", ["/preview", ""])
def test_spawned_known_single_axis_remains_eligible(
    client: ApiClient, angle: float, suffix: str
) -> None:
    before = axis_model(1.0)
    project, entry_id, path = setup_model(client, before)
    baseline = durable_state(client, project["id"], entry_id)
    original_path = path.removesuffix("/model-edits") + "/original"
    original = client.get(original_path).content
    result = client.post(path + suffix, json=operand(project, entry_id, 30, angle))
    assert result.status_code == 200, result.text
    if suffix or angle == 0:
        assert durable_state(client, project["id"], entry_id) == baseline
    else:
        assert result.json()["applied"] is True
        assert result.json()["project"]["revision"] == project["revision"] + 1
    assert client.get(original_path).content == original
    controller = client.app.state.edit_execution
    assert not controller.active and not list(controller.work_root.iterdir())
