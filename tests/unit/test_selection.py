from __future__ import annotations

import pytest
from molweave_core.molecular import (
    Atom,
    Chain,
    Conformer,
    NormalizedStructureV1,
    Residue,
    SourceFacts,
)
from molweave_core.selection import (
    AtomReference,
    SelectionV1,
    combine,
    expand,
    invert,
    select_by_predicate,
    selection,
    valid_references,
    within_distance,
)


def _structure() -> NormalizedStructureV1:
    coordinates = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (5.0, 0.0, 0.0)]
    return NormalizedStructureV1(
        title="Selection fixture",
        structure_type="protein",
        source=SourceFacts(filename="fixture.pdb", format="pdb"),
        chains=[Chain(id=1, name="A"), Chain(id=2, name="B")],
        residues=[
            Residue(
                id=1,
                chain_id=1,
                name="GLY",
                author_number=10,
                label_number=1,
                component_type="polymer",
            ),
            Residue(
                id=2,
                chain_id=2,
                name="ALA",
                author_number=20,
                label_number=2,
                component_type="polymer",
            ),
        ],
        atoms=[
            Atom(
                id=1,
                name="CA",
                element="C",
                coordinates=coordinates[0],
                residue_id=1,
                source_index=0,
            ),
            Atom(
                id=2,
                name="N",
                element="N",
                coordinates=coordinates[1],
                residue_id=1,
                source_index=1,
            ),
            Atom(
                id=3,
                name="CA",
                element="C",
                coordinates=coordinates[2],
                residue_id=2,
                source_index=2,
            ),
        ],
        conformers=[Conformer(id=1, name="Model 1", coordinates=coordinates)],
    )


def _refs(*atom_ids: int) -> SelectionV1:
    return selection(AtomReference(structure_id="protein", atom_id=atom_id) for atom_id in atom_ids)


def test_selection_is_canonical_and_algebra_is_deterministic() -> None:
    unsorted = [
        AtomReference(structure_id="protein", atom_id=3),
        AtomReference(structure_id="protein", atom_id=1),
        AtomReference(structure_id="protein", atom_id=3),
    ]
    canonical = selection(unsorted, granularity="structure", source="project")
    assert [item.atom_id for item in canonical.atoms] == [1, 3]
    assert canonical.granularity == "structure"
    assert canonical.source == "project"

    assert combine(_refs(1, 2), _refs(2, 3), "replace") == _refs(2, 3)
    assert combine(_refs(1, 2), _refs(2, 3), "add") == _refs(1, 2, 3)
    assert combine(_refs(1, 2), _refs(2, 3), "subtract") == _refs(1)
    assert combine(_refs(1), selection([]), "replace").atoms == []


def test_invalid_noncanonical_selection_is_rejected() -> None:
    with pytest.raises(ValueError, match="canonically ordered"):
        SelectionV1(
            atoms=[
                AtomReference(structure_id="protein", atom_id=2),
                AtomReference(structure_id="protein", atom_id=1),
            ]
        )


def test_invert_and_expansion_share_atom_reference_representation() -> None:
    structures = {"protein": _structure()}
    assert [item.atom_id for item in invert(_refs(1), structures).atoms] == [2, 3]
    assert [item.atom_id for item in expand(_refs(1), structures, "residue").atoms] == [1, 2]
    assert [item.atom_id for item in expand(_refs(1), structures, "chain").atoms] == [1, 2]
    assert [item.atom_id for item in expand(_refs(1), structures, "structure").atoms] == [
        1,
        2,
        3,
    ]


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("atom_name", "ca", [1, 3]),
        ("element", "N", [2]),
        ("residue_name", "gly", [1, 2]),
        ("residue_number", "20", [3]),
        ("chain", "b", [3]),
        ("structure", "PROTEIN", [1, 2, 3]),
    ],
)
def test_predicate_selection(field: str, value: str, expected: list[int]) -> None:
    result = select_by_predicate({"protein": _structure()}, field, value)  # type: ignore[arg-type]
    assert [item.atom_id for item in result.atoms] == expected


def test_distance_selection_supports_atoms_and_whole_residues() -> None:
    structures = {"protein": _structure()}
    atom_result = within_distance(_refs(1), structures, 1.1)
    residue_result = within_distance(_refs(1), structures, 1.1, granularity="residue")
    assert [item.atom_id for item in atom_result.atoms] == [1, 2]
    assert [item.atom_id for item in residue_result.atoms] == [1, 2]
    with pytest.raises(ValueError, match="non-negative"):
        within_distance(_refs(1), structures, -1)


def test_reference_reconciliation_reports_removed_count() -> None:
    reconciled, removed = valid_references(
        _refs(1, 2, 3),
        {"protein": {1, 3}},
        source="saved",
    )
    assert [item.atom_id for item in reconciled.atoms] == [1, 3]
    assert reconciled.source == "saved"
    assert removed == 1
