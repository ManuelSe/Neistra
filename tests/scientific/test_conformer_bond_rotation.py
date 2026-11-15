from __future__ import annotations

from itertools import combinations
from math import atan2, degrees
from typing import Any

import numpy as np
import pytest
from neistra_core.editing import model as model_module
from neistra_core.editing.ligand import InvalidLigandEditError, RdkitLigandEditor
from neistra_core.editing.model import DirectMolecularEditor, InvalidModelEdit, ModelBondRotate
from neistra_core.molecular import Atom, Bond, Conformer, NormalizedStructureV1, SourceFacts
from pydantic import ValidationError

from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_ligand_editor import ligand


def conformer_ligand() -> NormalizedStructureV1:
    points = np.asarray([(0, 1, 0), (0, 0, 0), (1.5, 0, 0), (1.5, 1, 0), (9, 4, 2)])
    transforms = [
        (11, np.eye(3), np.zeros(3)),
        (25, np.asarray([[0, -1, 0], [1, 0, 0], [0, 0, 1]]), np.asarray([7, -3, 4])),
        (42, np.asarray([[0, 0, 1], [0, 1, 0], [-1, 0, 0]]), np.asarray([-8, 5, 2])),
    ]
    conformers = [
        Conformer(id=i, name=f"Frame {i}", coordinates=[tuple(row) for row in points @ r.T + t])
        for i, r, t in transforms
    ]
    ids = [10, 20, 30, 40, 99]
    return NormalizedStructureV1(
        title="Analytic butane and spectator",
        structure_type="ligand",
        source=SourceFacts(filename="analytic", format="generated"),
        atoms=[
            Atom(
                id=i,
                name=f"A{i}",
                element="O" if i == 99 else "C",
                formal_charge=0,
                source_index=n,
                coordinates=conformers[1].coordinates[n],
            )
            for n, i in enumerate(ids)
        ],
        bonds=[
            Bond(id=i, atom_1_id=a, atom_2_id=b, order=1.0)
            for i, a, b in [(50, 10, 20), (71, 20, 30), (99, 30, 40)]
        ],
        conformers=conformers,
        active_conformer_id=25,
        metadata={"fixture": "analytic, not experimental"},
        annotations=[{"kind": "fixture"}],
    )


def signed_dihedral(points: Any) -> float:
    p = np.asarray(points, dtype=np.float64)
    axis = p[2] - p[1]
    axis /= np.linalg.norm(axis)
    left, right = p[0] - p[1], p[3] - p[2]
    left -= np.dot(left, axis) * axis
    right -= np.dot(right, axis) * axis
    return degrees(atan2(float(np.dot(np.cross(left, right), axis)), float(np.dot(left, right))))


@pytest.mark.parametrize("moving", [[10, 20], [30, 40]])
@pytest.mark.parametrize("angle", [-73.0, 60.0])
def test_each_conformer_uses_its_own_axis_and_preserves_exact_fixed_material(
    moving: list[int],
    angle: float,
) -> None:
    before = conformer_ligand()
    snapshot = before.to_bytes()
    result = RdkitLigandEditor().rotate_bond(
        before,
        bond_id=71,
        movable_atom_ids=moving,
        angle_degrees=angle,
    )
    after = result.structure
    ids = [a.id for a in before.atoms]
    changed = set(moving) - {20, 30}
    for old, new in zip(before.conformers, after.conformers, strict=True):
        for index, atom_id in enumerate(ids):
            if atom_id not in changed:
                assert new.coordinates[index] == old.coordinates[index]
        delta = signed_dihedral(new.coordinates[:4]) - signed_dihedral(old.coordinates[:4])
        assert (delta - angle + 180) % 360 - 180 == pytest.approx(0, abs=1e-12)
        for side in [{10, 20}, {30, 40}, {20, 30}]:
            for a, b in combinations(side, 2):
                i, j = ids.index(a), ids.index(b)
                assert np.linalg.norm(
                    np.asarray(new.coordinates[i]) - new.coordinates[j]
                ) == pytest.approx(
                    np.linalg.norm(np.asarray(old.coordinates[i]) - old.coordinates[j]),
                    abs=1e-12,
                )
    for old_atom, new_atom in zip(before.atoms, after.atoms, strict=True):
        assert new_atom.model_copy(update={"coordinates": old_atom.coordinates}) == old_atom
        if old_atom.id not in changed:
            assert new_atom == old_atom
    assert after.bonds == before.bonds
    assert after.metadata == before.metadata and after.annotations == before.annotations
    assert after.source == before.source and after.inferences == before.inferences
    assert before.to_bytes() == snapshot
    inverse = (
        RdkitLigandEditor()
        .rotate_bond(
            after,
            bond_id=71,
            movable_atom_ids=moving,
            angle_degrees=-angle,
        )
        .structure
    )
    for old, new in zip(before.conformers, inverse.conformers, strict=True):
        assert np.asarray(new.coordinates) == pytest.approx(np.asarray(old.coordinates), abs=1e-12)


@pytest.mark.parametrize("invalid", ["coincident", "nan", "overflow"])
def test_one_invalid_inactive_frame_refuses_rotation_atomically(invalid: str) -> None:
    before = conformer_ligand()
    rows = list(before.conformers[-1].coordinates)
    if invalid == "coincident":
        rows[2] = rows[1]
    elif invalid == "nan":
        rows[-1] = (float("nan"), 0, 0)
    else:
        rows[1], rows[2] = (1e308, 0, 0), (-1e308, 0, 0)
    before = before.model_copy(
        update={
            "conformers": [
                *before.conformers[:-1],
                before.conformers[-1].model_copy(update={"coordinates": rows}),
            ]
        }
    )
    snapshot = before.to_bytes()
    with pytest.raises(InvalidLigandEditError, match="Conformer 42"):
        RdkitLigandEditor().rotate_bond(
            before,
            bond_id=71,
            movable_atom_ids=[30, 40],
            angle_degrees=60,
        )
    with pytest.raises(InvalidModelEdit, match="Conformer 42"):
        DirectMolecularEditor().edit(
            before,
            [20, 30],
            ModelBondRotate(
                operation="bond.rotate",
                moving_endpoint_id=30,
                angle_degrees=0,
            ),
            next_atom_id=200,
            next_bond_id=200,
        )
    assert before.to_bytes() == snapshot


@pytest.mark.parametrize("moving_endpoint", [20, 30])
def test_direct_axis_action_reuses_the_exact_graph_side_without_hydrogen_maintenance(
    moving_endpoint: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = conformer_ligand()

    def unexpected(*args: object, **kwargs: object) -> None:
        pytest.fail("Coordinate-only rotation invoked hydrogen reconciliation")

    monkeypatch.setattr(model_module, "reconcile_hydrogens", unexpected)
    result = DirectMolecularEditor().edit(
        before,
        [30, 20],
        ModelBondRotate(
            operation="bond.rotate",
            moving_endpoint_id=moving_endpoint,
            angle_degrees=60,
        ),
        next_atom_id=200,
        next_bond_id=200,
        hydrogen_policy="automatic",
    )
    expected_side = [10, 20] if moving_endpoint == 20 else [30, 40]
    legacy = RdkitLigandEditor().rotate_bond(
        before,
        bond_id=71,
        movable_atom_ids=expected_side,
        angle_degrees=60,
    )
    assert result.edit == legacy
    assert result.hydrogen_report is None and result.hydrogen_reconciliation_report is None
    assert result.appearance_sources == {} and result.replacements == {}
    assert not result.no_op and result.rotation is not None
    assert result.rotation.axis_atom_ids == ((30, 20) if moving_endpoint == 20 else (20, 30))
    assert result.rotation.rotating_atom_ids == ((10,) if moving_endpoint == 20 else (40,))
    assert 99 in result.rotation.fixed_atom_ids
    assert {20, 30} <= set(result.rotation.fixed_atom_ids)
    assert set(result.rotation.fixed_atom_ids).isdisjoint(result.rotation.rotating_atom_ids)


@pytest.mark.parametrize("selection,endpoint", [([20], 20), ([20, 40], 20), ([20, 30], 99)])
def test_compact_rotation_refuses_an_ambiguous_or_nonbond_axis(
    selection: list[int],
    endpoint: int,
) -> None:
    with pytest.raises(InvalidModelEdit):
        DirectMolecularEditor().edit(
            conformer_ligand(),
            selection,
            ModelBondRotate(
                operation="bond.rotate",
                moving_endpoint_id=endpoint,
                angle_degrees=60,
            ),
            next_atom_id=200,
            next_bond_id=200,
        )


@pytest.mark.parametrize("endpoint", [True, "20", 0, -1])
def test_moving_endpoint_is_a_strict_positive_identity(endpoint: Any) -> None:
    with pytest.raises(ValidationError):
        ModelBondRotate(operation="bond.rotate", moving_endpoint_id=endpoint, angle_degrees=60)


def test_coordinate_rotation_preserves_supplied_stereo_annotations() -> None:
    before = ligand("CC[C@H](F)CO.O")
    rotation = np.asarray([[0, -1, 0], [1, 0, 0], [0, 0, 1]])
    extra = [tuple(row) for row in np.asarray(before.active_coordinates) @ rotation.T + [7, -3, 4]]
    before = before.model_copy(
        update={
            "conformers": [
                *before.conformers,
                Conformer(id=9, name="Reoriented", coordinates=extra),
            ]
        }
    )
    assert any(a.stereo not in {None, "NONE"} for a in before.atoms)
    bond = next(b for b in before.bonds if {b.atom_1_id, b.atom_2_id} == {2, 3})
    after = (
        RdkitLigandEditor()
        .rotate_bond(
            before,
            bond_id=bond.id,
            movable_atom_ids=[3, 4, 5, 6],
            angle_degrees=45,
        )
        .structure
    )
    assert {a.id: a.stereo for a in after.atoms} == {a.id: a.stereo for a in before.atoms}
    assert after.bonds == before.bonds
    assert after.metadata == before.metadata and after.annotations == before.annotations
    assert after.inferences == before.inferences


@pytest.mark.parametrize("angle", [0.0, 360.0, -360.0])
def test_zero_turn_setup_is_qualified_without_a_molecular_change(angle: float) -> None:
    before = conformer_ligand()
    result = DirectMolecularEditor().edit(
        before,
        [20, 30],
        ModelBondRotate(
            operation="bond.rotate",
            moving_endpoint_id=30,
            angle_degrees=angle,
        ),
        next_atom_id=200,
        next_bond_id=200,
        hydrogen_policy="automatic",
    )
    assert result.no_op and result.edit.structure is before
    assert result.edit.warnings == () and result.edit.changed_atom_ids == ()
    assert result.rotation is not None
    assert result.rotation.axis_atom_ids == (20, 30)
    assert result.rotation.rotating_atom_ids == (40,)
    assert result.rotation.fixed_atom_ids == (10, 20, 30, 99)
    assert result.rotation.angle_degrees == angle
    assert "rotation" not in result.edit.structure.model_dump()
    with pytest.raises(InvalidLigandEditError, match="non-zero"):
        RdkitLigandEditor().rotate_bond(
            before,
            bond_id=71,
            movable_atom_ids=[30, 40],
            angle_degrees=angle,
        )


def test_zero_angle_cannot_describe_an_unsupported_complex_as_an_eligible_ligand() -> None:
    before = conformer_ligand().model_copy(update={"structure_type": "complex"})
    with pytest.raises(InvalidModelEdit, match="ligand entry"):
        DirectMolecularEditor().edit(
            before,
            [20, 30],
            ModelBondRotate(
                operation="bond.rotate",
                moving_endpoint_id=30,
                angle_degrees=0,
            ),
            next_atom_id=200,
            next_bond_id=200,
        )


def test_zero_angle_reports_existing_overlap_without_changing_the_original_model() -> None:
    before = conformer_ligand()
    active = before.conformers[1]
    rows = list(active.coordinates)
    rows[-1] = rows[0]
    before = before.model_copy(
        update={
            "conformers": [
                before.conformers[0],
                active.model_copy(update={"coordinates": rows}),
                before.conformers[2],
            ],
            "atoms": [
                a.model_copy(update={"coordinates": rows[n]}) for n, a in enumerate(before.atoms)
            ],
        }
    )
    snapshot = before.to_bytes()
    result = DirectMolecularEditor().edit(
        before,
        [20, 30],
        ModelBondRotate(
            operation="bond.rotate",
            moving_endpoint_id=30,
            angle_degrees=0,
        ),
        next_atom_id=200,
        next_bond_id=200,
    )
    assert result.no_op and result.edit.structure is before
    assert any(w.code == "severe_atomic_clash" for w in result.edit.warnings)
    assert before.to_bytes() == snapshot and before.warnings == []


def test_qualified_zero_angle_counts_include_explicit_hydrogens_and_exclude_spectators() -> None:
    before = model("CCCC.O")
    result = DirectMolecularEditor().edit(
        before,
        [2, 3],
        ModelBondRotate(
            operation="bond.rotate",
            moving_endpoint_id=3,
            angle_degrees=0,
        ),
        next_atom_id=100,
        next_bond_id=100,
    )
    plan = result.rotation
    assert result.no_op and plan is not None
    assert plan.axis_atom_ids == (2, 3)
    assert len(plan.rotating_atom_ids) == 6 and len(plan.fixed_atom_ids) == 11
    atoms = {a.id: a for a in before.atoms}
    assert sum(atoms[i].element == "H" for i in plan.rotating_atom_ids) == 5
    assert 4 in plan.rotating_atom_ids and {2, 3, 5} <= set(plan.fixed_atom_ids)
    assert result.edit.changed_atom_ids == () and result.edit.structure is before


@pytest.mark.parametrize("angle", [0.0, 60.0])
def test_rotation_keeps_the_configured_atom_limit_even_for_setup(angle: float) -> None:
    before = conformer_ligand()
    snapshot = before.to_bytes()
    with pytest.raises(InvalidModelEdit, match="The result exceeds the entry limit of 4 atoms"):
        DirectMolecularEditor().edit(
            before, [20, 30],
            ModelBondRotate(operation="bond.rotate", moving_endpoint_id=30, angle_degrees=angle),
            next_atom_id=200, next_bond_id=200, atom_limit=4,
        )
    assert before.to_bytes() == snapshot


@pytest.mark.parametrize("angle", [1e12, -1e12, 1e20, -1e20, 1e308, -1e308])
@pytest.mark.parametrize("endpoint", [20, 30])
def test_finite_angle_periodicity_uses_the_exact_input_float(
    angle: float, endpoint: int,
) -> None:
    before = conformer_ligand()
    # Integer arithmetic defines the degree-periodicity oracle independently of
    # floating-point radians/trig reduction, including the actual float 1e308.
    numerator, denominator = angle.as_integer_ratio()
    equivalent = (numerator % (360 * denominator)) / denominator
    side = [10, 20] if endpoint == 20 else [30, 40]
    editor = RdkitLigandEditor()
    expected = editor.rotate_bond(
        before, bond_id=71, movable_atom_ids=side, angle_degrees=equivalent,
    ).structure
    actual = editor.rotate_bond(
        before, bond_id=71, movable_atom_ids=side, angle_degrees=angle,
    ).structure
    compact = DirectMolecularEditor().edit(
        before, [20, 30],
        ModelBondRotate(operation="bond.rotate", moving_endpoint_id=endpoint, angle_degrees=angle),
        next_atom_id=200, next_bond_id=200,
    )
    assert compact.rotation is not None and compact.rotation.angle_degrees == angle
    fixed = {20, 30, 99, 40 if endpoint == 20 else 10}
    for original, bounded, legacy, direct in zip(
        before.conformers, expected.conformers, actual.conformers,
        compact.edit.structure.conformers, strict=True,
    ):
        assert np.asarray(legacy.coordinates) == pytest.approx(
            np.asarray(bounded.coordinates), abs=1e-12,
        )
        assert np.asarray(direct.coordinates) == pytest.approx(
            np.asarray(bounded.coordinates), abs=1e-12,
        )
        for index, atom in enumerate(before.atoms):
            if atom.id in fixed:
                assert legacy.coordinates[index] == original.coordinates[index]
                assert direct.coordinates[index] == original.coordinates[index]
    inverse = editor.rotate_bond(
        actual, bond_id=71, movable_atom_ids=side, angle_degrees=-angle,
    ).structure
    for old, restored in zip(before.conformers, inverse.conformers, strict=True):
        assert np.asarray(restored.coordinates) == pytest.approx(
            np.asarray(old.coordinates), abs=1e-12,
        )


@pytest.mark.parametrize("angle", [0.0, 60.0])
def test_rotation_reports_inactive_bond_geometry_without_rewriting_noop(angle: float) -> None:
    before = conformer_ligand()
    rows = list(before.conformers[-1].coordinates)
    rows[3] = (rows[2][0], rows[2][1] + 4, rows[2][2])
    before = before.model_copy(update={"conformers": [
        *before.conformers[:-1], before.conformers[-1].model_copy(update={"coordinates": rows}),
    ]})
    snapshot = before.to_bytes()
    result = DirectMolecularEditor().edit(
        before, [20, 30],
        ModelBondRotate(operation="bond.rotate", moving_endpoint_id=30, angle_degrees=angle),
        next_atom_id=200, next_bond_id=200,
    )
    details = [w for w in result.edit.warnings if w.code == "model_bond_geometry"]
    assert len(details) == 1
    assert "Conformer 42, bond 99 (atoms 30, 40) is 4.000 angstrom" in details[0].message
    summary = [w for w in result.edit.warnings if w.code == "model_bond_geometry_summary"]
    assert len(summary) == 1 and "across all 3 conformers: 1" in summary[0].message
    assert before.to_bytes() == snapshot and before.warnings == []
    if angle == 0:
        assert result.no_op and result.edit.structure is before
    else:
        assert all(w in result.edit.structure.warnings for w in [*details, *summary])


def test_rotation_geometry_details_stay_bounded_without_omitting_late_frames() -> None:
    before = conformer_ligand()
    rows = list(before.conformers[-1].coordinates)
    rows[3] = (rows[2][0], rows[2][1] + 4, rows[2][2])
    before = before.model_copy(update={"conformers": [
        before.conformers[1],
        *[Conformer(id=1000+i, name=f"Inactive {i}", coordinates=rows) for i in range(110)],
    ]})
    result = DirectMolecularEditor().edit(
        before, [20, 30],
        ModelBondRotate(operation="bond.rotate", moving_endpoint_id=30, angle_degrees=0),
        next_atom_id=200, next_bond_id=200,
    )
    details = [w for w in result.edit.warnings if w.code == "model_bond_geometry"]
    summary = [w for w in result.edit.warnings if w.code == "model_bond_geometry_summary"]
    assert len(details) == 100 and len(summary) == 1
    assert "across all 111 conformers: 110" in summary[0].message
    assert "Showing 100 details; 10 details omitted (detail limit reached)" in summary[0].message
    assert result.no_op and result.edit.structure is before and before.warnings == []


def test_rotation_checks_distal_bonds_throughout_the_moving_side() -> None:
    before = ligand("CCCCCC.O")
    rows = list(before.active_coordinates)
    rows[5] = (rows[4][0] + 4, rows[4][1], rows[4][2])
    before = before.model_copy(update={"conformers": [
        *before.conformers, Conformer(id=42, name="Inactive distal bond", coordinates=rows),
    ]})
    distal = next(b for b in before.bonds if {b.atom_1_id, b.atom_2_id} == {5, 6})
    result = DirectMolecularEditor().edit(
        before, [2, 3],
        ModelBondRotate(operation="bond.rotate", moving_endpoint_id=3, angle_degrees=0),
        next_atom_id=200, next_bond_id=200,
    )
    assert any(
        w.code == "model_bond_geometry" and f"Conformer 42, bond {distal.id}" in w.message
        and "atoms 5, 6" in w.message and "4.000 angstrom" in w.message
        for w in result.edit.warnings
    )
    assert result.no_op and result.edit.structure is before and before.warnings == []
