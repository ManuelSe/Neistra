"""Independent coordination/count controls for provisional authored aromatic C."""

from collections import Counter

import numpy as np
import pytest
from neistra_core.editing import reconciliation
from neistra_core.editing.geometry import covalent_length
from neistra_core.editing.model import (
    DirectMolecularEditor,
    InvalidModelEdit,
    ModelBondDelete,
    ModelBondSet,
)
from neistra_core.hydrogen_protection import protection_facts
from neistra_core.molecular import Conformer, NormalizedStructureV1

from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_automatic_hydrogens import automatic, hcounts


def attached(structure: NormalizedStructureV1, target: int) -> list[int]:
    atoms = {a.id: a for a in structure.atoms}
    return sorted(
        j
        for b in structure.bonds
        for i, j in [(b.atom_1_id, b.atom_2_id), (b.atom_2_id, b.atom_1_id)]
        if i == target and atoms[j].element == "H"
    )


def assert_fixed(before: NormalizedStructureV1, after: NormalizedStructureV1) -> None:
    old = {a.id: a for a in before.atoms}
    for index, atom in enumerate(after.atoms):
        if atom.id in old and atom.element != "H":
            assert atom == old[atom.id]
            old_index = next(n for n, a in enumerate(before.atoms) if a.id == atom.id)
            for first, second in zip(before.conformers, after.conformers, strict=True):
                assert second.coordinates[index] == first.coordinates[old_index]
    assert after.source == before.source
    for key, value in before.metadata.items():
        if key != "canonical_smiles":
            assert after.metadata[key] == value
    assert NormalizedStructureV1.from_bytes(after.to_bytes()) == after


@pytest.mark.parametrize(
    "smiles,targets,expected",
    [
        ("CC.O", [1, 2], {1: 2, 2: 2, 3: 2}),
        ("C1CCCCC1", [1, 2], {1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 2}),
    ],
)
def test_authored_aromatic_edge_updates_local_carbon_counts(
    smiles: str, targets: list[int], expected: dict[int, int]
) -> None:
    before = model(smiles)
    result = automatic(before, targets, ModelBondSet(operation="bond.set", order=1.5))
    after = result.edit.structure
    assert {i: hcounts(after)[i] for i in expected} == expected
    report = result.hydrogen_reconciliation_report
    assert report.status == "complete"
    assert report.removed_hydrogen_count == 2
    assert report.reason_counts["provisional_aromatic_carbon"] == 2
    assert all(
        site.geometry == "trigonal_planar" for site in report.sites if site.atom_id in targets
    )
    assert {a.id for a in before.atoms} - {a.id for a in after.atoms} == {
        attached(before, i)[-1] for i in targets
    }
    assert any(w.code == "model_aromaticity_unvalidated" for w in result.edit.warnings)
    method = next(
        w for w in result.edit.warnings if w.code == "model_hydrogen_provisional_aromatic_carbon"
    )
    assert "provisional" in method.message.lower() and "3" in method.message
    assert any("authored_sp2_carbon" in i.message for i in after.inferences)
    assert_fixed(before, after)


def test_sequential_ring_authoring_uses_one_h_per_carbon_and_not_fractional_valence() -> None:
    initial = model("C1CCCCC1")
    before = initial
    # Fixed C6 ring oracle: each ring carbon has two heavy neighbours and one H.
    for left, right in [(1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 1)]:
        result = automatic(before, [left, right], ModelBondSet(operation="bond.set", order=1.5))
        before = result.edit.structure
        assert result.hydrogen_reconciliation_report.skipped_count == 0
    assert hcounts(before) == Counter({i: 1 for i in range(1, 7)})
    assert all(b.order == 1.5 and b.aromatic for b in before.bonds if b.atom_2_id <= 6)
    assert_fixed(initial, before)


@pytest.mark.parametrize(
    "smiles,targets,expected",
    [
        ("c1ccccc1", [1, 2], {i: 1 for i in range(1, 7)}),
        ("Cc1ccccc1", [2, 3], {1: 3, 2: 0, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1}),
        ("c1ccc2ccccc2c1", [4, 9], {1: 1, 2: 1, 3: 1, 4: 0, 5: 1, 6: 1, 7: 1, 8: 1, 9: 0, 10: 1}),
    ],
)
def test_existing_aromatic_peripheral_substituted_and_fused_counts(
    smiles: str, targets: list[int], expected: dict[int, int]
) -> None:
    before = model(smiles)
    # An authored single edge in an otherwise aromatic graph forces a real edit.
    pair = set(targets)
    before = before.model_copy(
        update={
            "bonds": [
                b.model_copy(update={"order": 1.0, "aromatic": False})
                if {b.atom_1_id, b.atom_2_id} == pair
                else b
                for b in before.bonds
            ]
        }
    )
    result = automatic(before, targets, ModelBondSet(operation="bond.set", order=1.5))
    assert {i: hcounts(result.edit.structure)[i] for i in expected} == expected
    assert result.hydrogen_reconciliation_report.skipped_count == 0
    assert_fixed(before, result.edit.structure)


def test_aromatic_to_single_or_deleted_restores_ordinary_saturation_with_fresh_ids() -> None:
    initial = model("CC")
    authored = automatic(initial, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
    before = authored.edit.structure
    assert hcounts(before)[1] == hcounts(before)[2] == 2
    for action, expected in [
        (ModelBondSet(operation="bond.set", order=1.0), 3),
        (ModelBondDelete(operation="bond.delete"), 4),
    ]:
        result = automatic(before, [1, 2], action)
        after = result.edit.structure
        assert hcounts(after)[1] == hcounts(after)[2] == expected
        assert min(result.edit.created_atom_ids) >= 1000
        assert not set(result.edit.created_atom_ids) & {a.id for a in initial.atoms}
        assert all(protection_facts(after)[i].ordinary for i in result.edit.created_atom_ids)
        assert_fixed(before, after.model_copy(update={"metadata": before.metadata}))


def test_planar_geometry_all_frames_nonfirst_active_and_deterministic_identity() -> None:
    before = model("CC.O")
    points = [(z + 9, x - 4, y + 3) for x, y, z in before.active_coordinates]
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": points[n]}) for n, a in enumerate(before.atoms)
            ],
            "conformers": [*before.conformers, Conformer(id=7, name="Rotated", coordinates=points)],
            "active_conformer_id": 7,
        }
    )
    forward = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
    backward = automatic(before, [2, 1], ModelBondSet(operation="bond.set", order=1.5))
    assert forward == backward
    after = forward.edit.structure
    assert_fixed(before, after)
    indices = {a.id: n for n, a in enumerate(after.atoms)}
    for frame in after.conformers:
        coords = np.asarray(frame.coordinates, dtype=np.float64)
        for parent, neighbor in [(1, 2), (2, 1)]:
            positions = [neighbor, *attached(after, parent)]
            vectors = coords[[indices[i] for i in positions]] - coords[indices[parent]]
            norms = np.linalg.norm(vectors, axis=1)
            assert np.allclose(norms[1:], covalent_length("C", "H"), atol=1e-8, rtol=1e-6)
            unit = vectors / norms[:, None]
            # Exact analytic trigonal vertices: 120 degrees, zero signed volume.
            assert np.allclose(
                unit @ unit.T, np.full((3, 3), -0.5) + np.eye(3) * 1.5, atol=1e-8, rtol=0
            )
            assert abs(np.linalg.det(vectors)) < 1e-8
    assert [a.coordinates for a in after.atoms] == after.conformers[1].coordinates
    spectator = {3, *attached(before, 3)}
    assert [a for a in after.atoms if a.id in spectator] == [
        a for a in before.atoms if a.id in spectator
    ]


@pytest.mark.parametrize(
    "smiles,targets,reason",
    [
        ("[2H]CC", [2, 3], "protected_identity"),
        ("[CH2]C", [1, 2], "protected_identity"),
        ("[13CH3]C", [1, 2], "protected_identity"),
        ("CN", [1, 2], "aromatic_carbon_required"),
        ("CO", [1, 2], "aromatic_carbon_required"),
        ("CS", [1, 2], "unsupported_sulfur"),
    ],
)
def test_unsupported_or_protected_endpoint_is_retained_while_ordinary_carbon_finishes(
    smiles: str, targets: list[int], reason: str
) -> None:
    before = model(smiles)
    result = automatic(before, targets, ModelBondSet(operation="bond.set", order=1.5))
    report = result.hydrogen_reconciliation_report
    assert report.status == "partial"
    assert reason in report.reason_counts
    skipped = next(s.atom_id for s in report.sites if s.status == "skipped")
    finished = next(s.atom_id for s in report.sites if s.status == "complete")
    assert hcounts(result.edit.structure)[skipped] == hcounts(before)[skipped]
    assert hcounts(result.edit.structure)[finished] == 2
    for h in attached(before, skipped):
        assert next(a for a in result.edit.structure.atoms if a.id == h) == next(
            a for a in before.atoms if a.id == h
        )


@pytest.mark.parametrize(
    "charge,reason", [(None, "unknown_charge"), (1, "unsupported_state"), (-1, "unsupported_state")]
)
def test_unknown_and_charged_aromatic_carbon_keep_whole_site(
    charge: int | None, reason: str
) -> None:
    before = model("CC")
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": charge}) if a.id == 1 else a
                for a in before.atoms
            ]
        }
    )
    result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
    assert reason in result.hydrogen_reconciliation_report.reason_counts
    assert hcounts(result.edit.structure)[1] == 3
    assert hcounts(result.edit.structure)[2] == 2


@pytest.mark.parametrize(
    "order,aromatic,reason",
    [
        (None, False, "unknown_bond_order"),
        (2.0, False, "aromatic_mixed_coordination"),
        (3.0, False, "aromatic_mixed_coordination"),
        (1.0, True, "contradictory_bond_order"),
        (1.5, False, "contradictory_bond_order"),
    ],
)
def test_unknown_multiple_or_contradictory_neighbor_edges_are_not_reinterpreted(
    order: float | None, aromatic: bool, reason: str
) -> None:
    before = model("CCC")
    before = before.model_copy(
        update={
            "bonds": [
                b.model_copy(update={"order": order, "aromatic": aromatic})
                if {b.atom_1_id, b.atom_2_id} == {2, 3}
                else b
                for b in before.bonds
            ]
        }
    )
    result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
    assert reason in result.hydrogen_reconciliation_report.reason_counts
    assert hcounts(result.edit.structure)[1] == 2
    assert hcounts(result.edit.structure)[2] == 2
    assert result.edit.structure.bonds[1] == before.bonds[1]


def test_degree_four_carbon_and_incompatible_alternate_keep_h() -> None:
    before = model("CC(C)(C)C")
    result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
    assert "aromatic_coordination_degree" in result.hydrogen_reconciliation_report.reason_counts
    assert hcounts(result.edit.structure)[1] == 2
    assert hcounts(result.edit.structure)[2] == 0
    before = model("CCC")
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"alternate_location": "B"}) if a.id == 3 else a
                for a in before.atoms
            ]
        }
    )
    result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
    assert "alternate_context" in result.hydrogen_reconciliation_report.reason_counts
    assert hcounts(result.edit.structure)[1] == 2
    assert hcounts(result.edit.structure)[2] == 2


@pytest.mark.parametrize("bad", ["coincident", "nonfinite", "retained_h"])
def test_bad_inactive_frame_keeps_whole_aromatic_site_in_every_frame(bad: str) -> None:
    before = model("CC")
    points = list(before.active_coordinates)
    if bad == "coincident":
        points[1] = points[0]
    elif bad == "nonfinite":
        points[1] = (float("nan"), 0.0, 0.0)
    else:
        points[2] = (float("nan"), 0.0, 0.0)
    before = before.model_copy(
        update={
            "conformers": [*before.conformers, Conformer(id=7, name="Invalid", coordinates=points)]
        }
    )
    if bad != "coincident":
        with pytest.raises(InvalidModelEdit, match="nonfinite affected coordinates"):
            automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
        return
    result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
    site = next(s for s in result.hydrogen_reconciliation_report.sites if s.atom_id == 1)
    assert site.status == "skipped"
    assert "degenerate_geometry" in result.hydrogen_reconciliation_report.reason_counts
    after = result.edit.structure
    assert attached(after, 1) == attached(before, 1)
    for h in attached(before, 1):
        old_index = next(n for n, a in enumerate(before.atoms) if a.id == h)
        new_index = next(n for n, a in enumerate(after.atoms) if a.id == h)
        for first, second in zip(before.conformers, after.conformers, strict=True):
            assert np.array_equal(
                first.coordinates[old_index], second.coordinates[new_index], equal_nan=True
            )


@pytest.mark.parametrize("policy", [None, "reconcile_if_possible", "complete_if_possible"])
def test_legacy_and_additive_policies_do_not_gain_destructive_aromatic_completion(
    policy: str | None,
) -> None:
    before = model("CC")
    options = {} if policy is None else {"hydrogen_policy": policy}
    result = DirectMolecularEditor().edit(
        before,
        [1, 2],
        ModelBondSet(operation="bond.set", order=1.5),
        next_atom_id=1000,
        next_bond_id=1000,
        **options,
    )
    assert result.edit.structure.atoms == before.atoms
    assert result.edit.structure.conformers == before.conformers
    assert hcounts(result.edit.structure)[1] == hcounts(result.edit.structure)[2] == 3


@pytest.mark.parametrize(
    "smiles,targets",
    [
        ("c1ccncc1", [3, 4]),
        ("c1cc[nH]c1", [3, 4]),
        ("c1ccoc1", [3, 4]),
        ("c1ccsc1", [3, 4]),
    ],
)
def test_heteroaromatic_sites_do_not_choose_hydrogen_or_protonation(
    smiles: str, targets: list[int]
) -> None:
    before = model(smiles)
    before = before.model_copy(
        update={
            "bonds": [
                b.model_copy(update={"order": 1.0, "aromatic": False})
                if {b.atom_1_id, b.atom_2_id} == set(targets)
                else b
                for b in before.bonds
            ]
        }
    )
    result = automatic(before, targets, ModelBondSet(operation="bond.set", order=1.5))
    site = next(s for s in result.hydrogen_reconciliation_report.sites if s.atom_id == 4)
    assert site.status == "skipped"
    assert attached(result.edit.structure, 4) == attached(before, 4)
    for h in attached(before, 4):
        assert next(a for a in result.edit.structure.atoms if a.id == h) == next(
            a for a in before.atoms if a.id == h
        )
    assert result.edit.structure.atoms[3].formal_charge == before.atoms[3].formal_charge


def test_protected_terminal_h_and_unknown_identity_keep_whole_site() -> None:
    for unknown in [False, True]:
        before = model("CC")
        before = before.model_copy(
            update={
                "atoms": [
                    a.model_copy(update={"formal_charge": 1}) if a.id == 3 else a
                    for a in before.atoms
                ],
                **({"annotations": []} if unknown else {}),
            }
        )
        result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
        reason = "protection_unknown" if unknown else "protected_hydrogen"
        assert reason in result.hydrogen_reconciliation_report.reason_counts
        assert attached(result.edit.structure, 1) == attached(before, 1)
        for h in attached(before, 1):
            assert next(a for a in result.edit.structure.atoms if a.id == h) == next(
                a for a in before.atoms if a.id == h
            )


def test_aromatic_reconciliation_respects_whole_site_work_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = model("CC")
    monkeypatch.setattr(reconciliation, "MAX_HYDROGENS", 3)
    result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
    assert hcounts(result.edit.structure)[1] == 2
    assert hcounts(result.edit.structure)[2] == 3
    assert "reconciliation_budget" in result.hydrogen_reconciliation_report.reason_counts
    assert result.hydrogen_reconciliation_report.status == "partial"
    for h in attached(before, 2):
        assert next(a for a in result.edit.structure.atoms if a.id == h) == next(
            a for a in before.atoms if a.id == h
        )


def test_explicit_aromatic_h_endpoint_is_literal_and_never_recreated() -> None:
    before = model("C")
    result = automatic(before, [1, 2], ModelBondSet(operation="bond.set", order=1.5))
    assert result.edit.structure.atoms == before.atoms
    assert result.edit.structure.conformers == before.conformers
    assert "explicit_hydrogen_edit" in result.hydrogen_reconciliation_report.reason_counts
