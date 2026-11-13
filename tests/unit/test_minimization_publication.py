"""Infrastructure invariants shared by otherwise independent calculation policies."""

from __future__ import annotations

from collections.abc import Iterator
from math import nextafter
from pathlib import Path

import pytest
from neistra_api.database import Base, create_database_engine, create_session_factory
from neistra_api.import_export import ArtifactService
from neistra_api.job_service import JobConflictError
from neistra_api.minimization_publication import (
    get_entry,
    get_project,
    lock_coordinate_publication,
    parse_calculation_source,
    read_verified_artifact,
    replace_selected_coordinates,
)
from neistra_api.models import Project, StructureEntry
from neistra_api.project_service import (
    EntryNotFoundError,
    ProjectNotFoundError,
    RevisionConflictError,
)
from neistra_core.artifacts import LocalArtifactStore
from neistra_core.molecular import Atom, Conformer, NormalizedStructureV1, SourceFacts
from sqlalchemy.orm import Session


@pytest.fixture
def storage(tmp_path: Path) -> Iterator[tuple[Session, ArtifactService]]:
    engine = create_database_engine(f"sqlite:///{tmp_path / 'publication.db'}")
    Base.metadata.create_all(engine)
    with create_session_factory(engine)() as session:
        yield session, ArtifactService(session, LocalArtifactStore(tmp_path / "artifacts"))
    engine.dispose()


def source() -> NormalizedStructureV1:
    points = [(0.0, 0.0, 0.0), (2.0, 3.0, 4.0), (5.0, 6.0, 7.0)]
    return NormalizedStructureV1(
        title="Sparse coordinate rows",
        structure_type="ligand",
        source=SourceFacts(filename="source.mol", format="mol"),
        atoms=[
            Atom(
                id=atom_id,
                name=f"C{atom_id}",
                element="C",
                coordinates=point,
                source_index=i,
                formal_charge=0,
            )
            for i, (atom_id, point) in enumerate(zip([11, 47, 100], points, strict=True))
        ],
        conformers=[
            Conformer(id=1, name="Inactive", coordinates=[(9, 8, 7)] * 3),
            Conformer(id=7, name="Active7", coordinates=points),
        ],
        active_conformer_id=7,
        metadata={"retained": ["metadata"]},
        annotations=[{"kind": "retained", "nested": {"value": [1, 2]}}],
    )


def test_replacement_preserves_sparse_row_order_fixed_facts_and_inactive_conformer():
    before = source()
    original = before.to_bytes()
    updates = {100: (5.0, 7.0, 7.0), 11: (-1.0, 0.0, 0.0)}
    after = replace_selected_coordinates(before, updates, 7)
    assert after is not None
    assert before.to_bytes() == original
    assert [atom.id for atom in after.atoms] == [11, 47, 100]
    assert after.atoms[1] == before.atoms[1]
    for old, new in zip(before.atoms, after.atoms, strict=True):
        assert old.model_dump(exclude={"coordinates"}) == new.model_dump(exclude={"coordinates"})
        assert new.coordinates == updates.get(old.id, old.coordinates)
    assert after.conformers[0] == before.conformers[0]
    assert after.conformers[1].coordinates == [
        updates[11],
        before.atoms[1].coordinates,
        updates[100],
    ]
    assert after.model_dump(exclude={"atoms", "conformers"}) == before.model_dump(
        exclude={"atoms", "conformers"}
    )
    # The replacement is a valid canonical document, not a detached coordinate array.
    assert NormalizedStructureV1.from_bytes(after.to_bytes()) == after


@pytest.mark.parametrize(
    "updates",
    [
        {},
        {47: (2.0, 3.0, 4.0)},
        {11: (1e-9, 0.0, 0.0)},
        {11: (-1e-9, 0.0, 0.0)},
        {11: (nextafter(1e-9, 0.0), 0.0, 0.0)},
        {11: (0.8e-9, 0.8e-9, 0.8e-9)},
    ],
)
def test_empty_or_componentwise_noop_does_not_construct_a_change(updates):
    before = source()
    original = before.to_bytes()
    assert replace_selected_coordinates(before, updates, 7) is None
    assert before.to_bytes() == original


@pytest.mark.parametrize("axis", [0, 1, 2])
def test_first_representable_value_above_threshold_changes_each_axis(axis):
    before = source()
    point = [0.0, 0.0, 0.0]
    point[axis] = nextafter(1e-9, float("inf"))
    after = replace_selected_coordinates(before, {11: tuple(point)}, 7)
    assert after is not None
    assert after.atoms[0].coordinates == tuple(point)
    assert after.conformers[1].coordinates[0] == tuple(point)
    assert before.atoms[0].coordinates == (0.0, 0.0, 0.0)


def test_project_and_entry_lookup_preserve_not_found_and_revision_conflicts(storage):
    session, _ = storage
    project = Project(id="project", name="Project", revision=4)
    entry = StructureEntry(id="entry", name="Entry")
    project.entries.append(entry)
    session.add(project)
    session.commit()
    assert get_project(session, project.id, 4) is project
    assert get_entry(project, entry.id) is entry
    with pytest.raises(ProjectNotFoundError):
        get_project(session, "missing")
    with pytest.raises(RevisionConflictError) as conflict:
        get_project(session, project.id, 3)
    assert conflict.value.current_revision == 4
    with pytest.raises(EntryNotFoundError):
        get_entry(project, "missing")


def test_verified_read_and_normalized_parse_retain_exact_stored_source(storage):
    _, artifacts = storage
    before = source()
    data = before.to_bytes()
    artifact = artifacts.publish(data, "source.normalized.json", "application/json")
    assert read_verified_artifact(artifacts, artifact.id) == (artifact, data)
    assert parse_calculation_source(data).to_bytes() == data


@pytest.mark.parametrize("corruption", ["size", "hash"])
def test_verified_read_rejects_corrupted_stored_integrity_metadata(storage, corruption):
    _, artifacts = storage
    artifact = artifacts.publish(source().to_bytes(), "source.json", "application/json")
    if corruption == "size":
        artifact.size += 1
    else:
        artifact.sha256 = "0" * 64
    with pytest.raises(JobConflictError, match="Stored calculation data failed integrity checks"):
        read_verified_artifact(artifacts, artifact.id)


@pytest.mark.parametrize("data", [b"not JSON", b'{"schema_version":99}', b"\xff"])
def test_invalid_normalized_source_preserves_conflict_mapping(data):
    with pytest.raises(JobConflictError, match="Canonical source data is invalid"):
        parse_calculation_source(data)


def test_publication_lock_does_not_commit_or_rollback_callers_transaction(storage):
    session, _ = storage
    project = Project(id="project", name="Before")
    session.add(project)
    session.commit()
    lock_coordinate_publication(session, project.id)
    project.name = "Rolled back"
    session.flush()
    session.rollback()
    assert get_project(session, project.id).name == "Before"
