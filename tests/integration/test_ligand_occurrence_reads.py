from __future__ import annotations

from typing import Any

import pytest
from neistra_api.import_export import ImportExportService, UploadPayload
from neistra_api.models import Artifact
from sqlalchemy import select

from tests.integration.test_ligand_depiction_bounds import retained
from tests.scientific.test_ligand_instances import cif
from tests.support.api_client import ApiClient


def imported(
    client: ApiClient, text: str = "CCO.CCO.CN", *, original: bytes | None = None,
    generate_3d: bool = False,
) -> dict[str, Any]:
    project = client.post("/api/v1/projects", json={"name": "Entry occurrence scope"}).json()
    with client.app.state.session_factory() as session:
        service = ImportExportService(session, client.app.state.settings)
        prepared = service.prepare([UploadPayload(
            "source.cif" if original else "same-label.smi",
            original if original else f"{text} same label\n".encode(),
            "application/octet-stream",
        )], generate_3d=generate_3d)
        service.commit_import(project["id"], project["revision"], prepared)
    return client.get(f"/api/v1/projects/{project['id']}").json()  # type: ignore[no-any-return]


def page(client: ApiClient, project: dict[str, Any], offset: int = 0) -> dict[str, Any]:
    entry = project["entries"][0]
    reply = client.get(
        f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-candidates",
        params={"expected_artifact_id": entry["current_artifact_id"], "offset": offset},
    )
    assert reply.status_code == 200, reply.text
    return reply.json()  # type: ignore[no-any-return]


def test_entry_wide_counts_cross_pages_without_dirtying_or_merging_instances(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_service as module

    project = imported(client, ".".join(["CCO"] * 13 + ["CN"]))
    other = imported(client)
    before = retained(client)
    builds = 0
    original = module.build_occurrence_index

    def build(*args: Any, **kwargs: Any) -> Any:
        nonlocal builds
        builds += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(module, "build_occurrence_index", build)
    first, second = page(client, project), page(client, project, 12)
    assert builds == 1
    assert first["total"] == 14
    assert [item["occurrence_count"] for item in first["candidates"]] == [13] * 12
    assert [item["occurrence_count"] for item in second["candidates"]] == [13, 1]
    assert {item["occurrence_basis"] for item in first["candidates"]} == {
        "qualified_representation_v1",
    }
    all_items = first["candidates"] + second["candidates"]
    assert len({item["candidate_key"] for item in all_items}) == 14
    assert sum(map(len, (item["atom_ids"] for item in all_items))) == len(
        project["entries"][0]["atom_ids"],
    )
    assert [item["occurrence_count"] for item in page(client, other)["candidates"]] == [2, 2, 1]
    assert project["entries"][0]["ligand_designation"]["status"] == "selection_required"
    assert retained(client) == before
    assert client.get(f"/api/v1/projects/{project['id']}").json() == project


def test_verified_source_counts_do_not_require_qualified_depiction_chemistry(
    client: ApiClient,
) -> None:
    project = imported(client, original=cif(repeated=True))
    result = page(client, project)
    chosen = [item for item in result["candidates"]
              if item["candidate_key"] in result["selectable_candidate_keys"]]
    assert len(chosen) == 2
    assert [item["occurrence_count"] for item in chosen] == [2, 2]
    assert {item["occurrence_basis"] for item in chosen} == {"verified_source_entity_v1"}
    assert all(item["chemistry_status"] == "unavailable" for item in chosen)
    assert client.get(f"/api/v1/projects/{project['id']}").json() == project


def test_busy_counts_remain_selectable_retry_and_cached_counts_bypass_busy_slots(
    client: ApiClient,
) -> None:
    import neistra_api.ligand_service as module

    project = imported(client)
    before = retained(client)
    assert module._DEPICTION_WORK.acquire(blocking=False)
    assert module._DEPICTION_WORK.acquire(blocking=False)
    try:
        busy = page(client, project)
        assert len(busy["selectable_candidate_keys"]) == 3
        assert all(item["occurrence_count"] is None
                   and item["occurrence_reason"] == "occurrence_work_busy"
                   for item in busy["candidates"])
    finally:
        module._DEPICTION_WORK.release()
        module._DEPICTION_WORK.release()
    counted = page(client, project)
    assert [item["occurrence_count"] for item in counted["candidates"]] == [2, 2, 1]
    assert module._DEPICTION_WORK.acquire(blocking=False)
    assert module._DEPICTION_WORK.acquire(blocking=False)
    try:
        assert page(client, project) == counted
    finally:
        module._DEPICTION_WORK.release()
        module._DEPICTION_WORK.release()
    assert retained(client) == before


def test_mixed_water_resolver_counting_and_cards_share_one_preparation_and_original_parse(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_service as module
    import neistra_core.ligands.candidates as resolver
    import neistra_core.ligands.chemistry as chemistry

    project = imported(client, "CCO.O")
    counts = {"prepare": 0, "original": 0, "build": 0}
    prepare, original, build = (
        module.prepare_chemistry, chemistry._original_molecules, module.build_occurrence_index,
    )

    def prepare_once(*args: Any, **kwargs: Any) -> Any:
        counts["prepare"] += 1
        return prepare(*args, **kwargs)

    def original_once(*args: Any, **kwargs: Any) -> Any:
        counts["original"] += 1
        return original(*args, **kwargs)

    def build_once(*args: Any, **kwargs: Any) -> Any:
        counts["build"] += 1
        return build(*args, **kwargs)

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("The resolver must reuse the supplied source/context")

    monkeypatch.setattr(module, "prepare_chemistry", prepare_once)
    monkeypatch.setattr(chemistry, "_original_molecules", original_once)
    monkeypatch.setattr(module, "build_occurrence_index", build_once)
    monkeypatch.setattr(resolver, "prepare_chemistry", forbidden)
    monkeypatch.setattr(resolver, "assess_mmcif_source", forbidden)
    first = page(client, project)
    assert [item["occurrence_count"] for item in first["candidates"]] == [1, None]
    assert counts == {"prepare": 1, "original": 1, "build": 1}
    assert page(client, project) == first
    assert counts == {"prepare": 2, "original": 2, "build": 1}


def test_cached_count_verifies_original_bytes_before_hit(client: ApiClient) -> None:
    project = imported(client)
    before = page(client, project)
    entry = project["entries"][0]
    with client.app.state.session_factory() as session:
        artifact = session.scalar(select(Artifact).where(
            Artifact.id == entry["original_artifact_id"],
        ))
        assert artifact is not None
        path = client.app.state.settings.data_dir / artifact.relative_path
    original = path.read_bytes()
    path.write_bytes(original + b"changed")
    try:
        reply = client.get(
            f"/api/v1/projects/{project['id']}/entries/{entry['id']}/ligand-candidates",
            params={"expected_artifact_id": entry["current_artifact_id"]},
        )
        assert reply.status_code == 409
        assert reply.json()["detail"]["code"] == "artifact_integrity_error"
    finally:
        path.write_bytes(original)
    assert page(client, project) == before


def test_coordinate_only_source_change_reuses_exact_count_index_and_preserves_intent(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_service as module

    project = imported(client, "CCO.CCO", generate_3d=True)
    first = page(client, project)
    entry = project["entries"][0]
    reply = client.post(f"/api/v1/projects/{project['id']}/entries/{entry['id']}/transform", json={
        "expected_revision": project["revision"], "entry_id": entry["id"],
        "scope": "structure", "translation": [2.5, -1.0, 0.25],
    })
    assert reply.status_code == 200, reply.text
    changed = reply.json()
    assert changed["entries"][0]["current_artifact_id"] != entry["current_artifact_id"]

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("Only coordinates changed; whole counting must be reused")

    monkeypatch.setattr(module, "build_occurrence_index", forbidden)
    after = page(client, changed)
    assert after["artifact_id"] == changed["entries"][0]["current_artifact_id"]
    assert [item["occurrence_count"] for item in after["candidates"]] == [2, 2]
    assert [item["candidate_key"] for item in after["candidates"]] == [
        item["candidate_key"] for item in first["candidates"]
    ]
