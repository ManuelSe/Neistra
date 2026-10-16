from __future__ import annotations

from typing import Any

import pytest
from molweave_core.editing.protein import STANDARD_AMINO_ACIDS

from tests.integration.test_archive_roundtrip import import_archive
from tests.integration.test_ligand_edits import structure
from tests.integration.test_protein_edits import project_with_protein
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import FIXTURE, build_fixture


def project_with_ligand(client: ApiClient) -> tuple[dict[str, Any], str]:
    project = client.post("/api/v1/projects", json={"name": "Prepared editing"}).json()
    imported = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": 0},
        files={
            "files": (
                "ethanol-3d.mol",
                (FIXTURE.parent / "ethanol-3d.mol").read_bytes(),
                "chemical/x-mdl-molfile",
            )
        },
    )
    assert imported.status_code == 201, imported.text
    project = imported.json()["project"]
    return project, project["entries"][0]["id"]


def selection(entry_id: str, ids: list[int]) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "atoms": [{"structure_id": entry_id, "atom_id": i} for i in ids],
        "granularity": "atom",
        "source": "viewer",
    }


def edit(
    client: ApiClient,
    project: dict[str, Any],
    entry_id: str,
    ids: list[int],
    action: dict[str, Any],
):  # type: ignore[no-untyped-def]
    entry = next(e for e in project["entries"] if e["id"] == entry_id)
    return client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/selection-edits",
        json={
            "expected_revision": project["revision"],
            "expected_artifact_id": entry["current_artifact_id"],
            "selection": selection(entry_id, ids),
            "action": action,
        },
    )


@pytest.mark.parametrize("complex_entry", [False, True])
def test_atomic_prepare_substitute_undo_redo_and_original(
    client: ApiClient, complex_entry: bool
) -> None:
    if complex_entry:
        assert build_fixture() == FIXTURE.read_bytes()
        project = import_archive(client, FIXTURE.read_bytes())["project"]
        entry_id = project["entries"][0]["id"]
    else:
        project, entry_id = project_with_ligand(client)
    before = structure(client, project["id"], entry_id)
    target = next(
        a["id"] for a in before["atoms"] if a["element"] == "C" and a["formal_charge"] == 0
    )
    original = client.get(f"/api/v1/projects/{project['id']}/entries/{entry_id}/original").content
    prepared = edit(client, project, entry_id, [target], {"operation": "hydrogens.prepare"})
    assert prepared.status_code == 200, prepared.text
    first = prepared.json()
    assert first["project"]["revision"] == project["revision"] + 1
    prepared_structure = structure(client, project["id"], entry_id)
    assert all(a in prepared_structure["atoms"] for a in before["atoms"])
    h = next(
        a["id"]
        for a in prepared_structure["atoms"]
        if a["element"] == "H"
        and any(
            {b["atom_1_id"], b["atom_2_id"]} == {a["id"], target}
            for b in prepared_structure["bonds"]
        )
    )
    replaced = edit(
        client, first["project"], entry_id, [h], {"operation": "atom.element", "element": "C"}
    )
    assert replaced.status_code == 200, replaced.text
    result = replaced.json()
    assert result["replacements"][str(h)] in result["report"]["created_atom_ids"]
    assert result["project"]["revision"] == first["project"]["revision"] + 1
    after = structure(client, project["id"], entry_id)
    undo = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": result["project"]["revision"]},
    ).json()
    assert structure(client, project["id"], entry_id) == prepared_structure
    redo = client.post(
        f"/api/v1/projects/{project['id']}/history/redo",
        json={"expected_revision": undo["revision"]},
    ).json()
    assert structure(client, project["id"], entry_id) == after
    assert (
        client.get(f"/api/v1/projects/{project['id']}/entries/{entry_id}/original").content
        == original
    )
    assert redo["revision"] == undo["revision"] + 1


def test_refusals_leave_revision_artifact_and_allocator_unchanged(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    for ids, action in [
        ([], {"operation": "atom.delete"}),
        ([1, 2], {"operation": "atom.element", "element": "N"}),
        ([1], {"operation": "atom.element", "element": "C"}),
    ]:
        response = edit(client, project, entry_id, ids, action)
        assert response.status_code == 422, response.text
        assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline


@pytest.mark.parametrize(
    "fragment", ["methyl", "ethyl", "hydroxyl", "amino", "carboxylic_acid", "phenyl"]
)
def test_fragment_actions_publish_one_complete_reversible_command(
    client: ApiClient, fragment: str
) -> None:
    project, entry_id = project_with_ligand(client)
    first = edit(client, project, entry_id, [1], {"operation": "hydrogens.prepare"}).json()
    before = structure(client, project["id"], entry_id)
    h = next(
        a["id"]
        for a in before["atoms"]
        if a["element"] == "H"
        and any({b["atom_1_id"], b["atom_2_id"]} == {a["id"], 1} for b in before["bonds"])
    )
    response = edit(
        client,
        first["project"],
        entry_id,
        [h],
        {"operation": "fragment.replace", "fragment": fragment},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["project"]["revision"] == first["project"]["revision"] + 1
    after = structure(client, project["id"], entry_id)
    assert h not in {a["id"] for a in after["atoms"]}
    assert after["inferences"][-1]["bond_ids"] == result["report"]["created_bond_ids"]
    undone = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": result["project"]["revision"]},
    )
    assert undone.status_code == 200
    assert structure(client, project["id"], entry_id) == before


@pytest.mark.parametrize("target", sorted(STANDARD_AMINO_ACIDS))
def test_selection_mutation_preserves_backbone_and_selects_complete_result(
    client: ApiClient, target: str
) -> None:
    project, entry_id = project_with_protein(client)
    before = structure(client, project["id"], entry_id)
    residue = next(
        r for r in before["residues"] if r["name"] != target and r["component_type"] == "polymer"
    )
    selected = [a["id"] for a in before["atoms"] if a["residue_id"] == residue["id"]]
    response = edit(
        client, project, entry_id, selected, {"operation": "residue.mutate", "target_name": target}
    )
    assert response.status_code == 200, response.text
    result = response.json()
    after = structure(client, project["id"], entry_id)
    assert next(r for r in after["residues"] if r["id"] == residue["id"])["name"] == target
    backbone = [
        a
        for a in before["atoms"]
        if a["residue_id"] == residue["id"] and a["name"] in {"N", "CA", "C", "O"}
    ]
    assert all(a in after["atoms"] for a in backbone)
    assert all(a in after["atoms"] for a in before["atoms"] if a["residue_id"] != residue["id"])
    assert result["selection_after"]["atoms"] == [
        {"structure_id": entry_id, "atom_id": a["id"]}
        for a in after["atoms"]
        if a["residue_id"] == residue["id"]
    ]
    assert result["selection_after"]["granularity"] == "residue"
    undone = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": result["project"]["revision"]},
    )
    assert undone.status_code == 200
    assert structure(client, project["id"], entry_id) == before


def test_partial_residue_mutation_has_no_fallback_target(client: ApiClient) -> None:
    project, entry_id = project_with_protein(client)
    before = structure(client, project["id"], entry_id)
    response = edit(
        client, project, entry_id, [1], {"operation": "residue.mutate", "target_name": "VAL"}
    )
    assert response.status_code == 422
    assert "complete residue" in response.text
    assert structure(client, project["id"], entry_id) == before


@pytest.mark.parametrize("replacement", [False, True])
def test_deleted_id_reconciles_all_references_and_exact_inverse(
    client: ApiClient, replacement: bool
) -> None:
    from tests.integration.test_archive_roundtrip import export_archive

    project = import_archive(client, FIXTURE.read_bytes())["project"]
    entry_id = project["entries"][0]["id"]
    initial = structure(client, project["id"], entry_id)
    anchor = next(
        a["id"] for a in initial["atoms"] if a["element"] == "C" and a["formal_charge"] == 0
    )
    if replacement:
        project = edit(
            client, project, entry_id, [anchor], {"operation": "hydrogens.prepare"}
        ).json()["project"]
    before = structure(client, project["id"], entry_id)
    target = (
        next(a["id"] for a in before["atoms"] if a["element"] == "H")
        if replacement
        else next(
            a["id"] for a in before["atoms"] if a["element"] == "O" and a["formal_charge"] == 0
        )
    )
    refs = selection(entry_id, [anchor, target])
    single = selection(entry_id, [target])
    path = f"/api/v1/projects/{project['id']}"

    def command(suffix: str, **payload: Any) -> None:
        nonlocal project
        response = client.post(
            f"{path}/{suffix}", json={"expected_revision": project["revision"], **payload}
        )
        assert response.status_code in {200, 201}, response.text
        project = response.json()

    command("selections", name="Deleted identity", selection=single)
    command("measurements", name="Deleted span", kind="distance", atom_references=refs["atoms"])
    command("selection-representations", selection=refs, action="apply", style="thick-stick")
    if replacement:
        command(
            "selection-appearance",
            selection=single,
            property="nonpolar_hydrogens",
            action="set",
            show=False,
        )
    command("selection-atom-visibility", selection=single, action="hide")
    command(
        "surfaces",
        surfaces=[
            {"entry_id": entry_id, "source": {"kind": "fragment", "atom_ids": [anchor, target]}},
            {
                "entry_id": entry_id,
                "source": {"kind": "pocket", "radius": 5, "seed_atom_references": single["atoms"]},
            },
        ],
    )
    command(
        "scenes",
        name="Deleted identity view",
        selection=single,
        camera={
            "mode": "orthographic",
            "position": [0, 0, 50],
            "target": [0, 0, 0],
            "up": [0, 1, 0],
            "radius": 20,
        },
    )
    baseline = client.get(path).json()
    original = client.get(f"{path}/entries/{entry_id}/original").content
    action = (
        {"operation": "atom.element", "element": "C"}
        if replacement
        else {"operation": "atom.delete"}
    )
    response = edit(client, project, entry_id, [target], action)
    assert response.status_code == 200, response.text
    project = response.json()["project"]
    assert project["saved_selections"][0]["atom_references"] == []
    assert project["measurements"] == []
    assert project["scenes"][0]["selection"]["atoms"] == []
    settings = project["entries"][0]["viewer_settings"]
    assert settings["selection_hidden_atoms"] == []
    assert settings["selection_nonpolar_hydrogens"] == []
    assert settings["surface_objects"][0]["source"]["atom_ids"] == [anchor]
    assert len(settings["surface_objects"]) == 1  # deleted pocket seed removes surface
    assert all(target not in r["atom_ids"] for r in settings["selection_representations"])
    after = structure(client, project["id"], entry_id)
    command("history/undo")
    assert structure(client, project["id"], entry_id) == before
    for key in ["saved_selections", "measurements", "scenes"]:
        # Undo restores domain state; audit modification times advance.
        def content(value: Any) -> Any:
            if isinstance(value, dict):
                return {k: content(v) for k, v in value.items() if k != "modified_at"}
            return [content(v) for v in value] if isinstance(value, list) else value

        assert content(project[key]) == content(baseline[key])
    assert project["entries"][0]["viewer_settings"] == baseline["entries"][0]["viewer_settings"]
    command("history/redo")
    assert structure(client, project["id"], entry_id) == after
    command("save")
    archive = export_archive(client, project["id"], "edited-project")
    restored = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    restored_id = restored["entries"][0]["id"]
    assert structure(client, restored["id"], restored_id) == after
    assert (
        client.get(f"/api/v1/projects/{restored['id']}/entries/{restored_id}/original").content
        == original
    )
    assert restored["history"]["retained_commands"] == 0


def test_stale_revision_artifact_lock_and_branching_allocators(client: ApiClient) -> None:
    project, entry_id = project_with_ligand(client)
    path = f"/api/v1/projects/{project['id']}"
    prepared = edit(client, project, entry_id, [1], {"operation": "hydrogens.prepare"})
    assert prepared.status_code == 200, prepared.text
    created = prepared.json()["report"]["created_atom_ids"]
    current = prepared.json()["project"]
    assert edit(client, project, entry_id, [1], {"operation": "atom.delete"}).status_code == 409
    stale = client.post(
        f"{path}/entries/{entry_id}/selection-edits",
        json={
            "expected_revision": current["revision"],
            "expected_artifact_id": project["entries"][0]["current_artifact_id"],
            "selection": selection(entry_id, [1]),
            "action": {"operation": "atom.delete"},
        },
    )
    assert stale.status_code == 422, stale.text
    assert client.get(path).json()["revision"] == current["revision"]
    assert (
        client.get(path).json()["entries"][0]["current_artifact_id"]
        == current["entries"][0]["current_artifact_id"]
    )
    undone = client.post(
        f"{path}/history/undo", json={"expected_revision": current["revision"]}
    ).json()
    branched = edit(client, undone, entry_id, [1], {"operation": "hydrogens.prepare"})
    assert branched.status_code == 200, branched.text
    assert min(branched.json()["report"]["created_atom_ids"]) > max(created)
    current = branched.json()["project"]
    locked = client.post(
        f"{path}/entries/{entry_id}/lock",
        json={"expected_revision": current["revision"], "value": True},
    ).json()
    baseline_locked = client.get(path).json()
    rejected = edit(client, locked, entry_id, [3], {"operation": "atom.delete"})
    assert rejected.status_code == 422, rejected.text
    assert client.get(path).json() == baseline_locked


def test_explicit_residue_crosslink_refuses_atomic_mutation(client: ApiClient) -> None:
    from molweave_core.molecular import Bond

    from tests.support.editing_fixture import prepared_complex

    source = prepared_complex()
    side_chain = next(a for a in source.atoms if a.name == "CB")
    ligand = next(a for a in source.atoms if a.formal_charge == 0)
    linked = source.model_copy(
        update={
            "bonds": [
                *source.bonds,
                Bond(
                    id=max(b.id for b in source.bonds) + 1,
                    atom_1_id=side_chain.id,
                    atom_2_id=ligand.id,
                    order=1,
                ),
            ]
        }
    )
    project = import_archive(client, build_fixture(linked))["project"]
    entry_id = project["entries"][0]["id"]
    baseline = client.get(f"/api/v1/projects/{project['id']}").json()
    selected = [a.id for a in source.atoms if a.residue_id == side_chain.residue_id]
    response = edit(
        client, project, entry_id, selected, {"operation": "residue.mutate", "target_name": "VAL"}
    )
    assert response.status_code == 422, response.text
    assert "crosslinks" in response.text
    assert client.get(f"/api/v1/projects/{project['id']}").json() == baseline
    assert structure(client, project["id"], entry_id) == linked.model_dump(mode="json")
