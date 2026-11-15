from __future__ import annotations

import pytest
from neistra_api.models import Artifact, CommandRecord, StructureEntry
from neistra_core.adapters.rdkit_common import normalized_to_mol
from neistra_core.editing.fragments import FragmentName
from neistra_core.molecular import NormalizedStructureV1
from rdkit import Chem
from rdkit.Chem.rdMolDescriptors import CalcMolFormula
from sqlalchemy import func, select

from tests.integration.test_archive_roundtrip import import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_model_edits import edit
from tests.integration.test_selection_edits import selection
from tests.scientific.test_fixed_fragment_geometry import PROFILES, parent
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture


@pytest.mark.parametrize("fragment", PROFILES)
@pytest.mark.parametrize("replace_h", [False, True])
def test_five_fragments_preview_apply_history_reload_and_original_are_coherent(
    client: ApiClient,
    fragment: FragmentName,
    replace_h: bool,
) -> None:
    before = parent()
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    entry_id = entry["id"]
    path = f"/api/v1/projects/{project['id']}"
    original = client.get(f"{path}/entries/{entry_id}/original").content
    selected = next(a.id for a in before.atoms if a.element == "H") if replace_h else 1
    action = {"operation": "fragment.attach", "fragment": fragment, "direction": 0, "rotation": 0}

    def persistence_snapshot() -> tuple[object, ...]:
        with client.app.state.engine.connect() as connection:
            return (
                connection.execute(select(func.count()).select_from(Artifact)).scalar_one(),
                connection.execute(select(func.count()).select_from(CommandRecord)).scalar_one(),
                connection.execute(
                    select(StructureEntry.next_atom_id, StructureEntry.next_bond_id).where(
                        StructureEntry.id == entry_id
                    )
                ).one(),
            )

    baseline = persistence_snapshot()
    preview = client.post(
        f"{path}/entries/{entry_id}/model-edits/preview",
        json={
            "expected_revision": project["revision"],
            "expected_artifact_id": entry["current_artifact_id"],
            "selection": selection(entry_id, [selected]),
            "action": action,
            "hydrogen_policy": "automatic",
        },
    )
    assert preview.status_code == 200, preview.text
    assert persistence_snapshot() == baseline
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    response = edit(client, project, entry_id, [selected], action, hydrogen_policy="automatic")
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["project"]["revision"] == project["revision"] + 1
    after = structure(client, project["id"], entry_id)
    molecule = normalized_to_mol(NormalizedStructureV1.model_validate(after))
    Chem.SanitizeMol(molecule)
    _, _, expected_smiles, formula = PROFILES[fragment]
    assert Chem.MolToSmiles(Chem.RemoveHs(molecule)) == Chem.MolToSmiles(
        Chem.MolFromSmiles(expected_smiles)
    )
    assert CalcMolFormula(molecule) == formula
    created = set(result["report"]["created_atom_ids"])
    assert len(preview.json()["atoms"]) == len(created)
    for old, current in zip(before.conformers, after["conformers"], strict=True):
        for index, atom in enumerate(before.atoms):
            if atom.element != "H":
                current_index = next(n for n, a in enumerate(after["atoms"]) if a["id"] == atom.id)
                assert current["coordinates"][current_index] == list(old.coordinates[index])
    undone = client.post(
        f"{path}/history/undo",
        json={
            "expected_revision": result["project"]["revision"],
        },
    )
    assert undone.status_code == 200, undone.text
    assert structure(client, project["id"], entry_id) == before.model_dump(mode="json")
    redone = client.post(
        f"{path}/history/redo",
        json={
            "expected_revision": undone.json()["revision"],
        },
    )
    assert redone.status_code == 200, redone.text
    assert structure(client, project["id"], entry_id) == after
    assert client.get(path).json()["revision"] == redone.json()["revision"]
    assert client.get(f"{path}/entries/{entry_id}/original").content == original
