from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from tests.support.api_client import ApiClient

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures/formats/ethanol.mol"


def imported(client: ApiClient, *, filename: str = "ethanol.mol") -> dict[str, Any]:
    project = client.post("/api/v1/projects", json={"name": "Exact ligand"}).json()
    reply = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": project["revision"], "generate_3d": "true"},
        files=[("files", (filename, FIXTURE.read_bytes(), "chemical/x-mdl-molfile"))],
    )
    assert reply.status_code == 201, reply.text
    return client.get(f"/api/v1/projects/{project['id']}").json()  # type: ignore[no-any-return]


def candidates(client: ApiClient, project: dict[str, Any]) -> dict[str, Any]:
    entry = project["entries"][0]
    reply = client.get(
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-candidates",
        params={"expected_artifact_id": entry["current_artifact_id"]},
    )
    assert reply.status_code == 200, reply.text
    return reply.json()  # type: ignore[no-any-return]


def clear(client: ApiClient, project: dict[str, Any]) -> dict[str, Any]:
    entry = project["entries"][0]
    reply = client.request(
        "PUT", f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-designation",
        json={"expected_revision": project["revision"],
              "expected_artifact_id": entry["current_artifact_id"], "clear": True},
    )
    assert reply.status_code == 200, reply.text
    return reply.json()  # type: ignore[no-any-return]


def test_import_designates_before_inspection_and_clear_undo_redo_preserve_exact_intent(
    client: ApiClient,
) -> None:
    project = imported(client)
    entry = project["entries"][0]
    assert project["schema_version"] == 3
    designation = entry["ligand_designation"]
    assert designation["status"] == "resolved"
    assert designation["origin"] == "automatic_single_candidate"
    assert designation["atom_ids"] == entry["atom_ids"]
    assert designation["source_artifact_id"] == entry["current_artifact_id"]
    original = client.get(
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original"
    ).content
    page = candidates(client, project)
    assert page["total"] == 1
    assert page["candidates"][0]["candidate_key"] in page["selectable_candidate_keys"]
    assert page["designated_candidate"]["atom_ids"] == designation["atom_ids"]
    cleared = clear(client, project)
    assert cleared["entries"][0]["ligand_designation"]["status"] == "cleared"
    restored = client.post(f"/api/v1/projects/{project['id']}/history/undo", json={
        "expected_revision": cleared["revision"],
    }).json()
    assert restored["entries"][0]["ligand_designation"] == designation
    cleared = client.post(f"/api/v1/projects/{project['id']}/history/redo", json={
        "expected_revision": restored["revision"],
    }).json()
    persisted_cleared = client.get(f"/api/v1/projects/{project['id']}").json()
    resolved = client.post(f"/api/v1/projects/{project['id']}/ligand-designations/resolve", json={
        "expected_revision": cleared["revision"], "entry_ids": [entry["id"]],
    })
    assert resolved.status_code == 200, resolved.text
    assert resolved.json() == persisted_cleared
    assert client.get(f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original").content \
        == original


def test_duplicate_has_independent_intent_and_stale_candidate_publication_is_refused(
    client: ApiClient,
) -> None:
    project = imported(client)
    entry = project["entries"][0]
    page = candidates(client, project)
    duplicate = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/duplicate",
        json={"expected_revision": project["revision"]},
    )
    assert duplicate.status_code == 200, duplicate.text
    updated = duplicate.json()
    copied = next(item for item in updated["entries"] if item["id"] != entry["id"])
    assert copied["ligand_designation"]["instance_id"] != entry["ligand_designation"]["instance_id"]
    assert copied["ligand_designation"]["atom_ids"] == entry["atom_ids"]
    assert copied["ligand_designation"]["origin"] == entry["ligand_designation"]["origin"]
    persisted_duplicate = client.get(f"/api/v1/projects/{project['id']}").json()
    reply = client.request(
        "PUT", f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-designation",
        json={"expected_revision": project["revision"],
              "expected_artifact_id": entry["current_artifact_id"],
              "candidate_key": page["candidates"][0]["candidate_key"],
              "expected_input_hash": page["input_hash"]},
    )
    assert reply.status_code == 409, reply.text
    assert client.get(f"/api/v1/projects/{project['id']}").json() == persisted_duplicate


def test_depiction_cache_hit_needs_no_chemistry_or_layout_and_never_mutates_sources(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_service as module

    project = imported(client)
    entry = project["entries"][0]
    page = candidates(client, project)
    endpoint = (f"/api/v1/projects/{project['id']}/entries/{entry['id']}"
                f"/ligand-candidates/{page['candidates'][0]['candidate_key']}/depiction")
    parameters = {"expected_artifact_id": entry["current_artifact_id"]}
    structure_url = f"/api/v1/projects/{project['id']}/entries/{entry['id']}/structure"
    before = client.get(structure_url).content
    result = client.get(endpoint, params=parameters)
    assert result.status_code == 200, result.text
    result_data = result.json()
    assert result_data["status"] == "ready", result_data
    assert result_data["formula"] == "C2H6O"
    drawing = client.get(result_data["artifact"]["download_url"])
    assert drawing.status_code == 200 and b"<svg" in drawing.content

    def must_not_run(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("A matching immutable depiction must reuse its cached result")

    monkeypatch.setattr(module, "prepare_chemistry", must_not_run)
    monkeypatch.setattr(module, "resolve_candidates", must_not_run)
    monkeypatch.setattr(module, "depict_qualified", must_not_run)
    cached = client.get(endpoint, params=parameters)
    assert cached.status_code == 200, cached.text
    assert cached.json() == result_data
    assert client.get(f"/api/v1/projects/{project['id']}").json() == project
    assert client.get(structure_url).content == before


def test_current_artifact_is_required_for_candidate_reads_and_clear(
    client: ApiClient,
) -> None:
    project = imported(client)
    entry = project["entries"][0]
    endpoint = f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-candidates"
    assert client.get(endpoint, params={"expected_artifact_id": "obsolete"}).status_code == 409
    reply = client.request(
        "PUT", f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-designation",
        json={"expected_revision": project["revision"], "expected_artifact_id": "obsolete",
              "clear": True},
    )
    assert reply.status_code == 409, reply.text
    assert client.get(f"/api/v1/projects/{project['id']}").json() == project


def test_unavailable_chemistry_does_not_publish_observed_atom_charge_as_molecular_charge(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_service as module
    from neistra_core.ligands.chemistry import QualifiedLigandChemistry

    project = imported(client)
    qualified = candidates(client, project)["candidates"][0]
    assert qualified["chemistry_status"] == "qualified"
    assert qualified["formal_charge"] == 0

    class UnavailableChemistry:
        def qualify(self, _atom_ids: list[int]) -> QualifiedLigandChemistry:
            return QualifiedLigandChemistry("unavailable", reason="unknown_valence")

    monkeypatch.setattr(
        module, "prepare_chemistry", lambda *_args, **_kwargs: UnavailableChemistry(),
    )
    unavailable = candidates(client, project)
    assert unavailable["candidates"][0]["chemistry_status"] == "unavailable"
    assert unavailable["candidates"][0]["formal_charge"] is None
    assert unavailable["designated_candidate"]["formal_charge"] is None
    assert client.get(f"/api/v1/projects/{project['id']}").json() == project


def test_ineligible_card_does_not_expose_an_unqualified_molecular_charge(client: ApiClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Ion exclusion"}).json()
    imported_response = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": project["revision"], "generate_3d": "false"},
        files=[("files", ("ion.smi", b"[Na+] sodium\n", "chemical/x-daylight-smiles"))],
    )
    assert imported_response.status_code == 201, imported_response.text
    project = client.get(f"/api/v1/projects/{project['id']}").json()
    card = candidates(client, project)["candidates"][0]
    assert card["boundary_status"] == "ineligible"
    assert card["formal_charge"] is None


@pytest.mark.parametrize("first_replay", ["undo", "redo"])
@pytest.mark.parametrize("intent", ["resolved", "cleared", "unresolved"])
def test_legacy_molecular_history_materializes_both_intent_snapshots_once(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, first_replay: str, intent: str,
) -> None:
    from neistra_api.models import CommandRecord, StructureEntry
    from sqlalchemy import select

    project = imported(client)
    entry = project["entries"][0]
    if intent == "cleared":
        project = clear(client, project)
    moved = client.post(f"/api/v1/projects/{project['id']}/selection-transform", json={
        "expected_revision": project["revision"],
        "selection": {"atoms": [{"structure_id": entry["id"], "atom_id": 1}]},
        "rotation_matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        "translation": [1.0, 0.0, 0.0],
    })
    assert moved.status_code == 200, moved.text
    project = moved.json()
    if first_replay == "redo":
        undone = client.post(f"/api/v1/projects/{project['id']}/history/undo", json={
            "expected_revision": project["revision"],
        })
        assert undone.status_code == 200, undone.text
        project = undone.json()
    with client.app.state.session_factory() as session:
        command = session.scalars(select(CommandRecord).where(
            CommandRecord.project_id == project["id"],
        ).order_by(CommandRecord.position.desc())).first()
        assert command is not None
        for field in ("forward_actions", "inverse_actions"):
            setattr(command, field, [{key: value for key, value in action.items()
                                     if key != "ligand_designation"}
                                    for action in getattr(command, field)])
        if intent == "unresolved":
            owner = session.get(StructureEntry, entry["id"])
            assert owner is not None
            owner.ligand_designation = {"schema_version": 1, "status": "unresolved"}
        session.commit()
    before = client.get(f"/api/v1/projects/{project['id']}").json()["entries"][0][
        "ligand_designation"
    ]
    first = client.post(f"/api/v1/projects/{project['id']}/history/{first_replay}", json={
        "expected_revision": project["revision"],
    })
    assert first.status_code == 200, first.text
    project = first.json()
    after = project["entries"][0]["ligand_designation"]
    if intent != "cleared":
        assert after["status"] == "resolved"
        assert after["instance_id"]
    else:
        assert after["status"] == "cleared"

    def must_not_resolve(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("Materialized history must restore exact intent without resolving")

    monkeypatch.setattr("neistra_api.project_service.resolve_candidates", must_not_resolve)
    opposite = "redo" if first_replay == "undo" else "undo"
    for action, expected in [(opposite, before), (first_replay, after), (opposite, before)]:
        replayed = client.post(f"/api/v1/projects/{project['id']}/history/{action}", json={
            "expected_revision": project["revision"],
        })
        assert replayed.status_code == 200, replayed.text
        project = replayed.json()
        assert project["entries"][0]["ligand_designation"] == expected


def test_legacy_default_enrichment_preserves_all_200_history_records_and_redo_positions(
    client: ApiClient,
) -> None:
    from copy import deepcopy
    from uuid import uuid4

    from neistra_api.models import CommandRecord, Project, StructureEntry
    from neistra_core.ligands.models import RESOLVER_VERSION, LigandDesignationV1
    from sqlalchemy import select

    project = imported(client)
    entry_id = project["entries"][0]["id"]
    with client.app.state.session_factory() as session:
        owner = session.get(StructureEntry, entry_id)
        stored = session.get(Project, project["id"])
        assert owner is not None and stored is not None
        owner.ligand_designation = LigandDesignationV1().model_dump(mode="json")
        owner.name = "Name 100"
        stored.revision = 100
        for position in range(2, 201):
            session.add(CommandRecord(
                id=str(uuid4()), project_id=project["id"], position=position,
                command_type="entry.rename", description=f"Rename {position}",
                is_applied=position <= 100, affected_entry_ids=[entry_id], selection_snapshot=[],
                forward_actions=[{"kind": "entry.update", "entry_id": entry_id,
                                  "values": {"name": f"Name {position}"}}],
                inverse_actions=[{"kind": "entry.update", "entry_id": entry_id,
                                  "values": {"name": f"Name {position - 1}"}}],
            ))
        session.commit()
        checkpoint = deepcopy(stored.checkpoint_state)

    def history() -> list[Any]:
        with client.app.state.session_factory() as session:
            return session.execute(select(
                CommandRecord.id, CommandRecord.position, CommandRecord.is_applied,
                CommandRecord.forward_actions, CommandRecord.inverse_actions,
            ).where(CommandRecord.project_id == project["id"]).order_by(
                CommandRecord.position,
            )).all()

    before = history()
    assert len(before) == 200
    resolved = client.post(f"/api/v1/projects/{project['id']}/ligand-designations/resolve", json={
        "expected_revision": 100, "entry_ids": [entry_id],
    })
    assert resolved.status_code == 200, resolved.text
    result = resolved.json()
    designation = result["entries"][0]["ligand_designation"]
    assert designation["status"] == "resolved"
    assert designation["resolver_version"] == RESOLVER_VERSION
    assert designation["assessed_at"] and designation["assessed_revision"] == 101
    assert result["revision"] == 101
    assert history() == before
    with client.app.state.session_factory() as session:
        stored = session.get(Project, project["id"])
        assert stored is not None and stored.checkpoint_state == checkpoint
    no_op = client.post(f"/api/v1/projects/{project['id']}/ligand-designations/resolve", json={
        "expected_revision": 101, "entry_ids": [entry_id],
    })
    assert no_op.status_code == 200 and no_op.json()["revision"] == 101
    assert history() == before
    redone = client.post(f"/api/v1/projects/{project['id']}/history/redo", json={
        "expected_revision": 101,
    })
    assert redone.status_code == 200, redone.text
    assert redone.json()["entries"][0]["name"] == "Name 101"
    assert redone.json()["entries"][0]["ligand_designation"] == designation


@pytest.mark.parametrize("initially_absent", [False, True])
def test_legacy_entry_replay_persists_the_exact_enriched_creation_snapshot(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, initially_absent: bool,
) -> None:
    from neistra_api.models import CommandRecord, StructureEntry
    from neistra_core.ligands.models import LigandDesignationV1
    from sqlalchemy import select

    project = imported(client)
    entry_id = project["entries"][0]["id"]
    if initially_absent:
        reply = client.post(f"/api/v1/projects/{project['id']}/history/undo", json={
            "expected_revision": project["revision"],
        })
        assert reply.status_code == 200, reply.text
        project = reply.json()
    with client.app.state.session_factory() as session:
        command = session.scalars(select(CommandRecord).where(
            CommandRecord.project_id == project["id"],
        )).one()
        forward = [{**action, "entry": {**action["entry"],
                   "ligand_designation": LigandDesignationV1().model_dump(mode="json")},
                   "ligand_default_pending": True} for action in command.forward_actions]
        command.forward_actions = forward
        owner = session.get(StructureEntry, entry_id)
        if owner is not None:
            owner.ligand_designation = LigandDesignationV1().model_dump(mode="json")
        session.commit()
    if initially_absent:
        reply = client.post(f"/api/v1/projects/{project['id']}/history/redo", json={
            "expected_revision": project["revision"],
        })
    else:
        reply = client.post(f"/api/v1/projects/{project['id']}/ligand-designations/resolve", json={
            "expected_revision": project["revision"], "entry_ids": [entry_id],
        })
    assert reply.status_code == 200, reply.text
    project = reply.json()
    designation = project["entries"][0]["ligand_designation"]
    assert designation["status"] == "resolved"

    def must_not_resolve(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("Recorded legacy entry identity must survive replay without resolving")

    monkeypatch.setattr("neistra_api.project_service.resolve_candidates", must_not_resolve)
    for action in ("undo", "redo", "undo", "redo"):
        reply = client.post(f"/api/v1/projects/{project['id']}/history/{action}", json={
            "expected_revision": project["revision"],
        })
        assert reply.status_code == 200, reply.text
        project = reply.json()
        if action == "redo":
            assert project["entries"][0]["ligand_designation"] == designation


def test_controlled_resolution_rolls_back_prior_defaults_if_a_later_source_fails_integrity(
    client: ApiClient,
) -> None:
    from copy import deepcopy

    from neistra_api.models import Artifact, CommandRecord, Project, StructureEntry
    from neistra_core.ligands.models import LigandDesignationV1
    from sqlalchemy import select

    project = imported(client)
    first_id = project["entries"][0]["id"]
    duplicate = client.post(f"/api/v1/projects/{project['id']}/entries/{first_id}/duplicate", json={
        "expected_revision": project["revision"],
    })
    assert duplicate.status_code == 200, duplicate.text
    project = duplicate.json()
    # Two different immutable current sources ensure the first entry resolves
    # before the second corrupted input fails.
    second_id = next(entry["id"] for entry in project["entries"] if entry["id"] != first_id)
    moved = client.post(f"/api/v1/projects/{project['id']}/selection-transform", json={
        "expected_revision": project["revision"],
        "selection": {"atoms": [{"structure_id": second_id, "atom_id": 1}]},
        "rotation_matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]], "translation": [1, 0, 0],
    })
    assert moved.status_code == 200, moved.text
    project = moved.json()
    with client.app.state.session_factory() as session:
        for entry in session.scalars(select(StructureEntry).where(
            StructureEntry.project_id == project["id"],
        )):
            entry.ligand_designation = LigandDesignationV1().model_dump(mode="json")
        session.commit()
        second = session.get(StructureEntry, second_id)
        assert second is not None
        artifact = session.get(Artifact, second.current_artifact_id)
        assert artifact is not None
        path = client.app.state.settings.data_dir / artifact.relative_path
        retained_history = deepcopy(session.execute(select(
            CommandRecord.id, CommandRecord.forward_actions, CommandRecord.inverse_actions,
        ).where(CommandRecord.project_id == project["id"])).all())
    before = client.get(f"/api/v1/projects/{project['id']}").json()
    original = path.read_bytes()
    try:
        path.write_bytes(original[:-1] + b"!")
        reply = client.post(f"/api/v1/projects/{project['id']}/ligand-designations/resolve", json={
            "expected_revision": project["revision"], "entry_ids": [first_id, second_id],
        })
        assert reply.status_code == 409, reply.text
        assert reply.json()["detail"]["code"] == "artifact_integrity_error"
    finally:
        path.write_bytes(original)
    assert client.get(f"/api/v1/projects/{project['id']}").json() == before
    with client.app.state.session_factory() as session:
        stored = session.get(Project, project["id"])
        assert stored is not None and stored.revision == project["revision"]
        assert session.execute(select(
            CommandRecord.id, CommandRecord.forward_actions, CommandRecord.inverse_actions,
        ).where(CommandRecord.project_id == project["id"])).all() == retained_history
