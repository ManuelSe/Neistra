from __future__ import annotations

from math import isfinite

import numpy as np
import pytest
from neistra_core.editing import model as model_module
from neistra_core.editing.model import (
    DirectMolecularEditor,
    InvalidModelEdit,
    ModelAtomAdd,
    ModelCharge,
)
from neistra_core.molecular import Atom, Bond, Conformer, NormalizedStructureV1, SourceFacts

from tests.support.hydrogen_fixture import model


def frames(lengths: list[float], *, active: int = 1) -> NormalizedStructureV1:
    conformers = [
        Conformer(id=i, name=f"Frame {i}", coordinates=[(0, 0, 0), (length, 0, 0), (12, 0, 0)])
        for i, length in enumerate(lengths, start=1)
    ]
    active_points = conformers[active - 1].coordinates
    return NormalizedStructureV1(
        title="Affected bond frames",
        structure_type="ligand",
        source=SourceFacts(filename="generated", format="generated"),
        atoms=[
            Atom(
                id=i,
                name=f"C{i}",
                element="C",
                formal_charge=0,
                source_index=n,
                coordinates=active_points[n],
            )
            for n, i in enumerate([10, 20, 30])
        ],
        bonds=[
            Bond(id=91, atom_1_id=10, atom_2_id=20, order=1.0),
            Bond(id=92, atom_1_id=20, atom_2_id=30, order=1.0),
        ],
        conformers=conformers,
        active_conformer_id=active,
    )


def edit(before: NormalizedStructureV1):  # type: ignore[no-untyped-def]
    return (
        DirectMolecularEditor()
        .edit(
            before,
            [10],
            ModelCharge(operation="atom.charge.set", charge=1),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit
    )


def test_inactive_geometry_warning_uses_exact_frame_bond_and_atom_identities() -> None:
    before = frames([0.2, 1.4], active=2)
    snapshot = before.to_bytes()
    result = edit(before)
    details = [w for w in result.warnings if w.code == "model_bond_geometry"]
    assert len(details) == 1
    assert details[0].field == "bonds.91"
    assert "Conformer 1, bond 91 (atoms 10, 20)" in details[0].message
    assert "0.200 angstrom" in details[0].message
    assert "bond 92" not in details[0].message
    assert before.to_bytes() == snapshot
    assert result.structure.conformers == before.conformers
    assert result.structure.atoms[0].formal_charge == 1
    assert details[0] in result.structure.warnings
    assert NormalizedStructureV1.from_bytes(result.structure.to_bytes()) == result.structure


@pytest.mark.parametrize(
    "length,expected",
    [(np.nextafter(0.4, 0), True), (0.4, False), (3.0, False), (np.nextafter(3.0, np.inf), True)],
)
def test_every_frame_uses_the_existing_strict_geometry_thresholds(
    length: float,
    expected: bool,
) -> None:
    result = edit(frames([1.4, length]))
    assert any(w.code == "model_bond_geometry" for w in result.warnings) == expected


def test_diagnostic_limit_discloses_full_counts_after_scanning_every_frame() -> None:
    result = edit(frames([4.0] * 110))
    details = [w for w in result.warnings if w.code == "model_bond_geometry"]
    summary = [w for w in result.warnings if w.code == "model_bond_geometry_summary"]
    assert len(details) == 100
    assert len(summary) == 1
    assert "110 affected bond/conformer measurements" in summary[0].message
    assert "all 110 conformers: 110" in summary[0].message
    assert "on 1 bonds" in summary[0].message
    assert "Showing 100 details; 10 details omitted (detail limit reached)" in summary[0].message
    late_only = edit(frames([1.4] * 109 + [4.0]))
    assert any("Conformer 110," in w.message for w in late_only.warnings)


@pytest.mark.parametrize("invalid", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_affected_inactive_geometry_refuses_the_entire_edit(invalid: float) -> None:
    before = frames([1.4, 1.4])
    rows = list(before.conformers[1].coordinates)
    rows[1] = (invalid, 0, 0)
    before = before.model_copy(
        update={
            "conformers": [
                before.conformers[0],
                before.conformers[1].model_copy(update={"coordinates": rows}),
            ]
        }
    )
    with pytest.raises(InvalidModelEdit, match=r"Conformer 2, atom 20.*nonfinite"):
        edit(before)
    assert before.atoms[0].formal_charge == 0
    assert not isfinite(before.conformers[1].coordinates[1][0])


@pytest.mark.parametrize("automatic", [False, True])
def test_finite_endpoints_with_unrepresentable_distance_refuse_atomically(automatic: bool) -> None:
    before = frames([1.4, 1.4])
    rows = list(before.conformers[1].coordinates)
    rows[0], rows[1] = (1e308, 0, 0), (-1e308, 0, 0)
    assert all(isfinite(v) for point in rows for v in point)
    before = before.model_copy(
        update={
            "conformers": [
                before.conformers[0],
                before.conformers[1].model_copy(update={"coordinates": rows}),
            ]
        }
    )
    snapshot = before.to_bytes()
    with pytest.raises(
        InvalidModelEdit,
        match=r"Conformer 2, bond 91 \(atoms 10, 20\).*nonfinite derived length",
    ):
        DirectMolecularEditor().edit(
            before,
            [10],
            ModelCharge(operation="atom.charge.set", charge=1),
            next_atom_id=100,
            next_bond_id=100,
            hydrogen_policy="automatic" if automatic else "preserve",
        )
    assert before.to_bytes() == snapshot


@pytest.mark.parametrize("automatic", [False, True])
@pytest.mark.parametrize("invalid", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_affected_addition_refuses_before_optional_library_work(
    automatic: bool,
    invalid: float,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = model("CC")
    rows = list(before.active_coordinates)
    rows[1] = (invalid, 0, 0)
    before = before.model_copy(
        update={
            "conformers": [
                before.conformers[0],
                Conformer(id=9, name="Bad inactive", coordinates=rows),
            ]
        }
    )
    snapshot = before.to_bytes()

    def unexpected_reconciliation(*args: object, **kwargs: object) -> None:
        pytest.fail("Nonfinite affected input reached optional hydrogen reconciliation")

    monkeypatch.setattr(model_module, "reconcile_hydrogens", unexpected_reconciliation)
    with pytest.raises(InvalidModelEdit, match=r"Conformer 9, atom 2.*nonfinite"):
        DirectMolecularEditor().edit(
            before,
            [1],
            ModelAtomAdd(operation="atom.add", element="C"),
            next_atom_id=100,
            next_bond_id=100,
            hydrogen_policy="automatic" if automatic else "preserve",
        )
    assert before.to_bytes() == snapshot


@pytest.mark.parametrize("automatic", [False, True])
def test_nonfinite_disconnected_placement_query_context_has_a_typed_refusal(
    automatic: bool,
) -> None:
    before = model("C.O")
    rows = list(before.active_coordinates)
    rows[1] = (float("nan"), 0, 0)
    before = before.model_copy(
        update={
            "conformers": [
                before.conformers[0],
                Conformer(id=9, name="Bad inactive", coordinates=rows),
            ]
        }
    )
    snapshot = before.to_bytes()
    with pytest.raises(
        InvalidModelEdit,
        match=r"Conformer 9, atom 2.*nonfinite placement clash-check",
    ):
        DirectMolecularEditor().edit(
            before,
            [1],
            ModelAtomAdd(operation="atom.add", element="C"),
            next_atom_id=100,
            next_bond_id=100,
            hydrogen_policy="automatic" if automatic else "preserve",
        )
    assert before.to_bytes() == snapshot
