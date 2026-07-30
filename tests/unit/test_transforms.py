from __future__ import annotations

import math

import pytest
from molweave_core.molecular import Atom, Conformer, NormalizedStructureV1, SourceFacts
from molweave_core.transforms import (
    InvalidTransformError,
    centroid,
    euler_rotation_matrix,
    transform_structure,
)


def structure() -> NormalizedStructureV1:
    first = [
        (0.0, 0.0, 0.0),
        (2.0, 0.0, 0.0),
        (0.0, 2.0, 0.0),
        (0.0, 0.0, 2.0),
    ]
    second = [(x + 10.0, y - 2.0, z + 1.0) for x, y, z in first]
    return NormalizedStructureV1(
        title="Transform fixture",
        structure_type="ligand",
        source=SourceFacts(filename="fixture.xyz", format="xyz"),
        atoms=[
            Atom(
                id=index,
                name=f"A{index}",
                element="C",
                coordinates=point,
                source_index=index - 1,
            )
            for index, point in enumerate(first, start=1)
        ],
        conformers=[
            Conformer(id=1, name="Active", coordinates=first),
            Conformer(id=2, name="Second", coordinates=second),
        ],
    )


def test_selected_translation_updates_every_conformer_and_active_atoms() -> None:
    original = structure()
    changed = transform_structure(
        original,
        [1, 3],
        translation=(1.5, -2.0, 0.25),
    )

    assert changed.conformers[0].coordinates == [
        (1.5, -2.0, 0.25),
        (2.0, 0.0, 0.0),
        (1.5, 0.0, 0.25),
        (0.0, 0.0, 2.0),
    ]
    assert changed.conformers[1].coordinates[0] == (11.5, -4.0, 1.25)
    assert changed.conformers[1].coordinates[2] == (11.5, -2.0, 1.25)
    assert [atom.coordinates for atom in changed.atoms] == changed.active_coordinates
    assert original.atoms[0].coordinates == (0.0, 0.0, 0.0)


def test_whole_structure_rotation_uses_explicit_centroid() -> None:
    original = structure()
    pivot = centroid(original)
    changed = transform_structure(
        original,
        [atom.id for atom in original.atoms],
        rotation_degrees=(0.0, 0.0, 90.0),
        pivot=pivot,
    )

    assert changed.active_coordinates[0] == pytest.approx((1.0, 0.0, 0.0), abs=1e-12)
    assert changed.active_coordinates[1] == pytest.approx((1.0, 2.0, 0.0), abs=1e-12)
    assert changed.active_coordinates[2] == pytest.approx((-1.0, 0.0, 0.0), abs=1e-12)
    assert changed.active_coordinates[3] == pytest.approx((1.0, 0.0, 2.0), abs=1e-12)


def test_euler_rotation_composes_x_then_y_then_z() -> None:
    rotation = euler_rotation_matrix((90.0, 90.0, 0.0))
    transformed = rotation @ [0.0, 1.0, 0.0]
    assert transformed == pytest.approx((1.0, 0.0, 0.0), abs=1e-12)
    assert math.isclose(float(rotation.__array__().dtype.itemsize), 8.0)


@pytest.mark.parametrize(
    ("atom_ids", "translation", "rotation", "pivot", "message"),
    [
        ([], (1, 0, 0), (0, 0, 0), (0, 0, 0), "at least one"),
        ([1, 1], (1, 0, 0), (0, 0, 0), (0, 0, 0), "unique"),
        ([99], (1, 0, 0), (0, 0, 0), (0, 0, 0), "missing"),
        ([1], (0, 0, 0), (0, 0, 0), (0, 0, 0), "change"),
        ([1], (math.inf, 0, 0), (0, 0, 0), (0, 0, 0), "finite"),
        ([1], (0, 0, 0), (math.nan, 0, 0), (0, 0, 0), "finite"),
        ([1], (0, 0, 0), (0, 0, 90), (0, math.inf, 0), "finite"),
    ],
)
def test_invalid_transforms_are_rejected(
    atom_ids: list[int],
    translation: tuple[float, float, float],
    rotation: tuple[float, float, float],
    pivot: tuple[float, float, float],
    message: str,
) -> None:
    with pytest.raises(InvalidTransformError, match=message):
        transform_structure(
            structure(),
            atom_ids,
            translation=translation,
            rotation_degrees=rotation,
            pivot=pivot,
        )
