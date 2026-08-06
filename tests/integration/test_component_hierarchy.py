from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any, cast

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures"


def _create_project(client: ApiClient, name: str) -> dict[str, Any]:
    response = client.post("/api/v1/projects", json={"name": name})
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


def _import(
    client: ApiClient,
    project_id: str,
    revision: int,
    path: Path,
) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/projects/{project_id}/imports",
        data={"expected_revision": revision},
        files={"files": (path.name, path.read_bytes(), "application/octet-stream")},
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _projection(client: ApiClient, project_id: str, entry_id: str) -> dict[str, Any]:
    response = client.get(
        f"/api/v1/projects/{project_id}/entries/{entry_id}/structure"
    )
    assert response.status_code == 200
    return cast(dict[str, Any], response.json())


def _component_members(
    projection: dict[str, Any], component: dict[str, Any]
) -> list[int]:
    residue_ids = set(component["residue_ids"])
    atom_ids = set(component["atom_ids"])
    return sorted(
        atom["id"]
        for atom in projection["structure"]["atoms"]
        if atom["id"] in atom_ids or atom["residue_id"] in residue_ids
    )


def _identity(projection: dict[str, Any]) -> dict[str, tuple[str, list[int]]]:
    return {
        component["id"]: (
            component["category"],
            _component_members(projection, component),
        )
        for component in projection["hierarchy"]["components"]
    }


def test_complex_hierarchy_selection_and_coordinate_identity_are_durable(
    client: ApiClient,
) -> None:
    fixture = FIXTURES / "complex" / "component_hierarchy.pdb"
    project = _create_project(client, "Component integration")
    imported = _import(client, project["id"], 0, fixture)
    entry_id = imported["imported_entry_ids"][0]
    before_project = cast(dict[str, Any], imported["project"])
    before = _projection(client, project["id"], entry_id)

    assert Counter(
        component["category"] for component in before["hierarchy"]["components"]
    ) == {
        "protein": 1,
        "ligand": 1,
        "water": 1,
        "solvent": 1,
        "ion": 1,
        "other_heterogen": 1,
    }
    members = [
        atom_id
        for component in before["hierarchy"]["components"]
        for atom_id in _component_members(before, component)
    ]
    assert sorted(members) == list(range(1, 11))
    assert len(members) == len(set(members))
    ligand = next(
        component
        for component in before["hierarchy"]["components"]
        if component["category"] == "ligand"
    )
    assert _component_members(before, ligand) == [5, 6]
    assert any(
        {bond["atom_1_id"], bond["atom_2_id"]} == {3, 5}
        for bond in before["structure"]["bonds"]
    )

    saved = client.post(
        f"/api/v1/projects/{project['id']}/selections",
        json={
            "expected_revision": before_project["revision"],
            "name": "Putative ligand component",
            "selection": {
                "schema_version": 1,
                "atoms": [
                    {"structure_id": entry_id, "atom_id": atom_id}
                    for atom_id in _component_members(before, ligand)
                ],
                "granularity": "residue",
                "source": "project",
            },
        },
    )
    assert saved.status_code == 201
    transformed = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/transform",
        json={
            "expected_revision": saved.json()["revision"],
            "entry_id": entry_id,
            "scope": "structure",
            "translation": [2.0, -1.0, 0.5],
            "rotation_degrees": [0.0, 0.0, 0.0],
            "pivot_mode": "structure_centroid",
        },
    )
    assert transformed.status_code == 200, transformed.text
    after = _projection(client, project["id"], entry_id)
    assert _identity(after) == _identity(before)
    assert after["structure"]["atoms"][0]["coordinates"] != before["structure"]["atoms"][0][
        "coordinates"
    ]
    reopened = client.get(f"/api/v1/projects/{project['id']}")
    assert reopened.status_code == 200
    assert reopened.json()["saved_selections"][0]["atom_references"] == [
        {"structure_id": entry_id, "atom_id": 5},
        {"structure_id": entry_id, "atom_id": 6},
    ]
    assert _identity(_projection(client, project["id"], entry_id)) == _identity(before)
    assert client.get(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/original"
    ).content == fixture.read_bytes()


def test_ligand_topology_edits_regenerate_current_component_membership(
    client: ApiClient,
) -> None:
    fixture = FIXTURES / "formats" / "ethanol.mol"
    project = _create_project(client, "Topology hierarchy")
    imported = _import(client, project["id"], 0, fixture)
    entry_id = imported["imported_entry_ids"][0]
    before = _projection(client, project["id"], entry_id)
    component_id = before["hierarchy"]["components"][0]["id"]

    added = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/ligand-edits",
        json={
            "expected_revision": imported["project"]["revision"],
            "operation": "atom.add",
            "element": "F",
            "coordinates": [3.5, 0.0, 0.0],
        },
    )
    assert added.status_code == 200, added.text
    with_atom = _projection(client, project["id"], entry_id)
    component = with_atom["hierarchy"]["components"][0]
    assert component["id"] == component_id
    assert _component_members(with_atom, component) == [1, 2, 3, 4]

    deleted = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/ligand-edits",
        json={
            "expected_revision": added.json()["project"]["revision"],
            "operation": "atom.delete",
            "atom_ids": [2],
        },
    )
    assert deleted.status_code == 200, deleted.text
    after = _projection(client, project["id"], entry_id)
    component = after["hierarchy"]["components"][0]
    assert component["id"] == component_id
    assert _component_members(after, component) == [1, 3, 4]
    assert 2 not in {
        atom_id
        for item in after["hierarchy"]["components"]
        for atom_id in _component_members(after, item)
    }
