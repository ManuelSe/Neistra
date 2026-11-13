"""Real mixed moving models retain exact publication masks and source data."""

from __future__ import annotations

from typing import Any

import pytest
from neistra_api.models import StructureEntry
from neistra_core.minimization.quick_contracts import QuickEffectiveField
from neistra_core.molecular import Conformer, NormalizedStructureV1

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_coordinate_commands import _structure
from tests.integration.test_job_lifecycle import _worker
from tests.integration.test_minimization_apply import seeded_project
from tests.integration.test_quick_minimization import apply_quick
from tests.support.api_client import ApiClient
from tests.support.minimization import molecule, translated


def sparse_active(source: NormalizedStructureV1) -> NormalizedStructureV1:
    coordinates = [(x + 1, y + 2, z + 3) for x, y, z in source.active_coordinates]
    return source.model_copy(
        update={
            "title": "Mixed native",
            "atoms": [
                atom.model_copy(update={"id": atom.id * 10 + 1, "coordinates": coordinates[i]})
                for i, atom in enumerate(source.atoms)
            ],
            "bonds": [
                bond.model_copy(
                    update={
                        "atom_1_id": bond.atom_1_id * 10 + 1,
                        "atom_2_id": bond.atom_2_id * 10 + 1,
                    }
                )
                for bond in source.bonds
            ],
            "conformers": [
                source.conformers[0],
                Conformer(id=7, name="Active7", coordinates=coordinates),
            ],
            "active_conformer_id": 7,
            "annotations": [],
            "metadata": {"retain": "mixed qualification"},
        }
    )


def allocation_floors(client: ApiClient, project: dict[str, Any]) -> dict[str, tuple[int, int]]:
    with client.app.state.session_factory() as session:
        result = {}
        for entry in project["entries"]:
            row = session.get(StructureEntry, entry["id"])
            assert row is not None
            result[entry["name"]] = (row.next_atom_id, row.next_bond_id)
        return result


@pytest.mark.parametrize(
    ("partner_smiles", "expected_methods"),
    [
        ("[CH3]", {"MMFF94", "geometry_repair"}),
        ("B", {"UFF"}),
    ],
)
def test_mixed_movers_publish_one_exact_coordinate_command(
    client: ApiClient,
    partner_smiles: str,
    expected_methods: set[str],
):
    native = sparse_active(molecule())
    partner = translated(molecule(partner_smiles), (7, 2, 3))
    points = list(partner.active_coordinates)
    hydrogen = next(i for i, atom in enumerate(partner.atoms) if atom.element == "H")
    points[hydrogen] = (points[hydrogen][0] + 0.65, *points[hydrogen][1:])
    partner = partner.model_copy(
        update={
            "title": "Mixed partner",
            "atoms": [
                atom.model_copy(update={"coordinates": points[i]})
                for i, atom in enumerate(partner.atoms)
            ],
            "conformers": [Conformer(id=1, name="Distorted", coordinates=points)],
        }
    )
    remote = translated(molecule(), (50, 50, 50)).model_copy(update={"title": "Remote fixed"})
    project = seeded_project(client, native, partner, remote)
    assert len({entry["name"] for entry in project["entries"]}) == 3
    native_entry, partner_entry, remote_entry = project["entries"]
    path = f"/api/v1/projects/{project['id']}"
    before = {
        entry["id"]: _structure(client, project["id"], entry["id"]) for entry in project["entries"]
    }
    artifacts = {
        entry["current_artifact_id"]: client.get(
            f"/api/v1/artifacts/{entry['current_artifact_id']}"
        ).content
        for entry in project["entries"]
    }
    originals = {
        entry["id"]: client.get(f"{path}/entries/{entry['id']}/original").content
        for entry in project["entries"]
    }
    floors = allocation_floors(client, project)
    selected = {(native_entry["id"], 31)} | {
        (partner_entry["id"], atom_id) for atom_id in partner_entry["atom_ids"]
    }
    response = client.post(
        f"{path}/quick-minimizations",
        json={
            "expected_revision": project["revision"],
            "expand_hydrogens": False,
            "selection": {
                "atoms": [
                    {"structure_id": entry_id, "atom_id": atom_id}
                    for entry_id, atom_id in sorted(selected)
                ]
            },
        },
    )
    assert response.status_code == 201, response.text
    queued = response.json()
    assert _worker(client).run_once()
    response = client.get(f"{path}/quick-minimizations/{queued['id']}/proposal")
    assert response.status_code == 200, response.text
    proposal = response.json()
    assert proposal["applicable"], proposal
    assert proposal["report"]["coverage"] == "approximate"
    assert proposal["report"]["movable_count"] == len(selected)
    assert proposal["report"]["fixed_count"] == len(native.atoms) - 1
    assert remote_entry["id"] not in proposal["report"]["modeled_atoms"]
    assert {
        (entry["entry_id"], atom_id)
        for entry in proposal["entries"]
        for atom_id in entry["atom_ids"]
    } == selected
    completed = client.get(f"/api/v1/jobs/{queued['id']}").json()
    field = QuickEffectiveField.model_validate(completed["result_values"]["effective_field"])
    assert {component.method for component in field.components} == expected_methods
    assert {
        (component.entry_id, atom_id)
        for component in field.components
        for atom_id in component.atom_ids
    } == {
        (entry_id, atom_id)
        for entry_id, atom_ids in proposal["report"]["modeled_atoms"].items()
        for atom_id in atom_ids
    }
    for entry in project["entries"]:
        assert _structure(client, project["id"], entry["id"]) == before[entry["id"]]
    response = apply_quick(client, project, queued, proposal)
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["revision"] == project["revision"] + 1
    assert updated["history"]["retained_commands"] == project["history"]["retained_commands"] + 1
    after = {
        entry["id"]: _structure(client, project["id"], entry["id"]) for entry in updated["entries"]
    }
    changed: set[tuple[str, int]] = set()
    for entry_id, old in before.items():
        current = after[entry_id]
        for key in ("source", "metadata", "bonds", "residues", "chains", "active_conformer_id"):
            assert current[key] == old[key]
        for first, second in zip(old["atoms"], current["atoms"], strict=True):
            assert {key: value for key, value in first.items() if key != "coordinates"} == {
                key: value for key, value in second.items() if key != "coordinates"
            }
            if first["coordinates"] != second["coordinates"]:
                changed.add((entry_id, first["id"]))
        for conformer in old["conformers"]:
            if conformer["id"] != old["active_conformer_id"]:
                assert conformer == next(
                    c for c in current["conformers"] if c["id"] == conformer["id"]
                )
        assert client.get(f"{path}/entries/{entry_id}/original").content == originals[entry_id]
    assert changed <= selected
    assert {entry_id for entry_id, _ in changed} == {native_entry["id"], partner_entry["id"]}
    assert after[remote_entry["id"]] == before[remote_entry["id"]]
    assert allocation_floors(client, updated) == floors
    for artifact_id, data in artifacts.items():
        assert client.get(f"/api/v1/artifacts/{artifact_id}").content == data
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": updated["revision"]}
    ).json()
    assert {
        entry["id"]: _structure(client, project["id"], entry["id"]) for entry in undone["entries"]
    } == before
    assert apply_quick(client, undone, queued, proposal).status_code == 409
    redone = client.post(
        f"{path}/history/redo", json={"expected_revision": undone["revision"]}
    ).json()
    assert {
        entry["id"]: _structure(client, project["id"], entry["id"]) for entry in redone["entries"]
    } == after
    assert allocation_floors(client, redone) == floors
    exported = export_archive(client, project["id"], "mixed-current-model")
    restored = import_archive(client, client.get(exported["artifact"]["download_url"]).content)[
        "project"
    ]
    assert {
        entry["name"]: _structure(client, restored["id"], entry["id"])
        for entry in restored["entries"]
    } == {entry["name"]: after[entry["id"]] for entry in redone["entries"]}
    assert allocation_floors(client, restored) == floors
