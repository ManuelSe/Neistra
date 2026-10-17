"""Scientific and capacity qualification of draft hydrogen building."""

from __future__ import annotations

import numpy as np
import pytest
from molweave_core.editing import hydrogen
from molweave_core.editing.hydrogen import HydrogenBuilder
from molweave_core.molecular import Atom, Bond, Conformer, NormalizedStructureV1, SourceFacts

from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_hydrogen_completion import materialize


def isolated(count: int, *, conformers: int = 1, element: str = "F") -> NormalizedStructureV1:
    points = [(float(i * 5), 0.0, 0.0) for i in range(count)]
    return NormalizedStructureV1(
        title="Capacity qualification",
        structure_type="unknown",
        source=SourceFacts(filename="synthetic", format="generated"),
        atoms=[
            Atom(
                id=i + 1,
                name=f"{element}{i + 1}",
                element=element,
                coordinates=point,
                formal_charge=0,
                source_index=i,
            )
            for i, point in enumerate(points)
        ],
        conformers=[
            Conformer(
                id=i + 1, name=str(i + 1), coordinates=[(x, y + float(i), z) for x, y, z in points]
            )
            for i in range(conformers)
        ],
    )


def test_real_site_hydrogen_and_diagnostic_budgets_are_explicit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = isolated(4097)
    calls = []
    conversions = []
    real_array = np.asarray

    def array(points, *args, **kwargs):  # type: ignore[no-untyped-def]
        if points is before.conformers[0].coordinates:
            conversions.append(1)
        return real_array(points, *args, **kwargs)

    monkeypatch.setattr(hydrogen.np, "asarray", array)
    real_tree = hydrogen.cKDTree

    def tree(points):  # type: ignore[no-untyped-def]
        calls.append(len(points))
        return real_tree(points)

    monkeypatch.setattr(hydrogen, "cKDTree", tree)
    builder = HydrogenBuilder(before)
    result = builder.propose(builder.targets([], entry=True))
    assert result.report.target_count == 4097
    assert result.report.completed_count == 4096
    assert result.report.added_hydrogen_count == 4096
    assert result.report.unprocessed_count == 1
    assert result.report.reason_counts["target_budget"] == 1
    assert result.report.reason_counts["orientation_underdetermined"] == 4096
    assert len(result.report.diagnostics) == 200 and result.report.diagnostics_truncated
    assert calls == [4097]
    assert conversions == [1]
    assert result.sites[0].parent_id == 1 and result.sites[-1].parent_id == 4096


def test_coordinate_budget_skips_whole_sites_across_conformers() -> None:
    before = isolated(900, conformers=5, element="C")
    result = HydrogenBuilder(before).propose(list(range(1, 901)))
    assert result.report.completed_count == 819
    assert result.report.added_hydrogen_count == 3276
    assert result.report.unprocessed_count == 81
    assert result.report.added_hydrogen_count * 5 == 16380
    assert all(
        len(site.frames) == 5 and all(len(frame) == 4 for frame in site.frames)
        for site in result.sites
    )


def test_over_budget_chemical_context_is_not_cut_or_converted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = isolated(1025, element="C")
    before = before.model_copy(
        update={
            "bonds": [
                Bond(id=i, atom_1_id=i, atom_2_id=i + 1, order=1.5, aromatic=True)
                for i in range(1, 1025)
            ]
        }
    )

    def forbidden(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("Oversized context reached chemical conversion")

    monkeypatch.setattr(hydrogen, "normalized_to_mol", forbidden)
    result = HydrogenBuilder(before).propose([1])
    assert not result.sites
    assert result.report.reason_counts == {"context_limit": 1}


def test_explicit_draft_placements_preserve_unknowns_existing_h_and_source() -> None:
    before = model("CC", remove_h_on={1})
    before = before.model_copy(
        update={
            "atoms": [a.model_copy(update={"formal_charge": None}) for a in before.atoms],
            "bonds": [b.model_copy(update={"order": None}) for b in before.bonds],
        }
    )
    snapshots = []
    for orientation in range(6):
        proposal = HydrogenBuilder(before).propose(
            [1], count=3, geometry="tetrahedral", orientation=orientation
        )
        after = materialize(before, proposal)
        assert after.atoms[: len(before.atoms)] == before.atoms
        assert after.bonds[: len(before.bonds)] == before.bonds
        assert after.source == before.source
        snapshots.append(tuple(after.conformers[0].coordinates[-3:]))
    assert len(set(snapshots)) == 6
    again = materialize(before, HydrogenBuilder(before).propose([1], count=3, orientation=0))
    assert tuple(again.conformers[0].coordinates[-3:]) == snapshots[0]


def test_geometry_first_conflicting_tag_is_reconciled_without_source_rewrite() -> None:
    before = model("C[C@H](O)F", remove_h_on={2})
    expected = materialize(before, HydrogenBuilder(before).propose([2]))
    correct = next(a for a in expected.atoms if a.id == 2).stereo
    wrong = "TETRAHEDRAL_CW" if correct == "TETRAHEDRAL_CCW" else "TETRAHEDRAL_CCW"
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"stereo": wrong}) if a.id == 2 else a for a in before.atoms
            ]
        }
    )
    after = materialize(before, HydrogenBuilder(before).propose([2]))
    assert next(a for a in after.atoms if a.id == 2).stereo == correct
    assert any(w.code == "model_hydrogen_stereo_reconciled" for w in after.warnings)
    assert after.source == before.source
    assert [a.coordinates for a in after.atoms[: len(before.atoms)]] == [
        a.coordinates for a in before.atoms
    ]


def test_opposite_conformers_do_not_acquire_one_universal_stereo_tag() -> None:
    before = model("C[C@H](O)F", remove_h_on={2})
    second = Conformer(
        id=7, name="Mirror", coordinates=[(-x, y, z) for x, y, z in before.active_coordinates]
    )
    before = before.model_copy(update={"conformers": [*before.conformers, second]})
    after = materialize(before, HydrogenBuilder(before).propose([2]))
    assert next(a for a in after.atoms if a.id == 2).stereo is None
    assert any(w.code == "model_hydrogen_stereo_disagreement" for w in after.warnings)
    assert all(
        new.coordinates[: len(before.atoms)] == old.coordinates
        for old, new in zip(before.conformers, after.conformers, strict=True)
    )


def test_planar_new_tetrahedral_configuration_requires_explicit_choice() -> None:
    before = model("C[C@H](O)F", remove_h_on={2})
    coordinates = [(x, y, 0.0) for x, y, _ in before.active_coordinates]
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": coordinates[i]})
                for i, a in enumerate(before.atoms)
            ],
            "conformers": [Conformer(id=1, name="Planar", coordinates=coordinates)],
        }
    )
    automatic = HydrogenBuilder(before).propose([2])
    assert automatic.report.reason_counts == {"undetermined_configuration": 1}
    explicit = HydrogenBuilder(before).propose([2], count=1, orientation=0)
    assert explicit.report.added_hydrogen_count == 1


def test_proper_fit_keeps_coordinate_defined_tetrahedral_volume_and_disconnected_tag() -> None:
    before = model("C[C@H](O)F.C[C@@H](O)F", remove_h_on={2})
    other = next(a for a in before.atoms if a.id == 6)
    after = materialize(before, HydrogenBuilder(before).propose([2]))
    assert next(a for a in after.atoms if a.id == 6) == other
    center = np.array(next(a for a in before.atoms if a.id == 2).coordinates)
    neighbors = sorted(
        b.atom_2_id if b.atom_1_id == 2 else b.atom_1_id
        for b in before.bonds
        if 2 in {b.atom_1_id, b.atom_2_id}
    )
    vectors = np.array(
        [
            np.array(next(a for a in before.atoms if a.id == i).coordinates) - center
            for i in neighbors
        ]
    )
    h = np.array(after.atoms[-1].coordinates) - center
    assert np.linalg.det(vectors) != 0
    assert np.dot(h, np.sum(vectors / np.linalg.norm(vectors, axis=1)[:, None], axis=0)) < 0


def test_unresolvable_floating_point_placement_is_diagnostic_not_coincident_h() -> None:
    before = isolated(1, element="C")
    point = (1e100, 1e100, 1e100)
    before = before.model_copy(
        update={
            "atoms": [before.atoms[0].model_copy(update={"coordinates": point})],
            "conformers": [Conformer(id=1, name="Large", coordinates=[point])],
        }
    )
    result = HydrogenBuilder(before).propose([1])
    assert not result.sites
    assert result.report.reason_counts == {"coordinate_precision": 1}


def test_contradictory_aromatic_order_is_not_silently_interpreted() -> None:
    before = model("c1ccccc1", remove_h_on={1})
    before = before.model_copy(
        update={
            "bonds": [b.model_copy(update={"order": 1.0}) if b.id == 1 else b for b in before.bonds]
        }
    )
    result = HydrogenBuilder(before).propose([1])
    assert not result.sites
    assert result.report.reason_counts == {"contradictory_bond_order": 1}


def test_temporary_stereo_hydrogens_share_the_coordinate_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = model("C" * 20, remove_h_on=set(range(1, 21)))
    before = before.model_copy(
        update={
            "conformers": [
                Conformer(id=i + 1, name=str(i + 1), coordinates=list(before.active_coordinates))
                for i in range(500)
            ]
        }
    )
    conversions = []
    real_conversion = hydrogen.normalized_to_mol

    def convert(projection):  # type: ignore[no-untyped-def]
        conversions.append(len(projection.conformers))
        return real_conversion(projection)

    monkeypatch.setattr(hydrogen, "normalized_to_mol", convert)

    def forbidden(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("Out-of-budget virtual H generation")

    monkeypatch.setattr(hydrogen.Chem, "AddHs", forbidden)
    proposal = HydrogenBuilder(before).propose([1])
    assert proposal.report.added_hydrogen_count == 3
    after = materialize(before, proposal)
    assert len(after.atoms) == len(before.atoms) + 3
    assert conversions == [1]
    assert any(w.code == "model_hydrogen_stereo_unresolved" for w in after.warnings)
    assert all(
        new.coordinates[: len(before.atoms)] == old.coordinates
        for old, new in zip(before.conformers, after.conformers, strict=True)
    )


def test_count_and_stereo_perception_share_one_context_atom_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = model("c1ccccc1", remove_h_on=set(range(1, 7)))
    monkeypatch.setattr(hydrogen, "MAX_ANALYZED", 12)
    proposal = HydrogenBuilder(before).propose([1])
    assert proposal.analyzed_atom_count == 6
    after = materialize(before, proposal)
    assert len(after.atoms) == 7
    assert any(w.code == "model_hydrogen_stereo_unresolved" for w in after.warnings)


def test_aromatic_context_does_not_default_remote_contradictory_orders() -> None:
    before = model("c1ccccc1", remove_h_on={1})
    before = before.model_copy(
        update={
            "bonds": [b.model_copy(update={"order": 1.0}) if b.id == 3 else b for b in before.bonds]
        }
    )
    proposal = HydrogenBuilder(before).propose([1])
    assert not proposal.sites
    assert proposal.report.reason_counts == {"context_contradictory": 1}


def test_sparse_identities_active_conformer_and_alternate_membership_are_preserved() -> None:
    before = model("CC", remove_h_on={1})
    atom_ids = {a.id: a.id * 11 + 3 for a in before.atoms}
    points = [(x + 10.0, y - 5.0, z + 2.0) for x, y, z in before.active_coordinates]
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(
                    update={
                        "id": atom_ids[a.id],
                        "coordinates": points[i],
                        "alternate_location": "A",
                    }
                )
                for i, a in enumerate(before.atoms)
            ],
            "bonds": [
                b.model_copy(
                    update={
                        "id": 200 + b.id * 17,
                        "atom_1_id": atom_ids[b.atom_1_id],
                        "atom_2_id": atom_ids[b.atom_2_id],
                    }
                )
                for b in before.bonds
            ],
            "conformers": [
                *before.conformers,
                Conformer(id=9, name="Active translated", coordinates=points),
            ],
            "active_conformer_id": 9,
        }
    )
    proposal = HydrogenBuilder(before).propose([atom_ids[1]])
    after = materialize(before, proposal)
    assert after.atoms[: len(before.atoms)] == before.atoms
    assert after.bonds[: len(before.bonds)] == before.bonds
    assert all(
        a.coordinates == point
        for a, point in zip(after.atoms[-3:], after.conformers[1].coordinates[-3:], strict=True)
    )
    assert all(
        a.alternate_location == "A" and a.residue_id == before.atoms[0].residue_id
        for a in after.atoms[-3:]
    )
    assert all(atom_ids[1] in {b.atom_1_id, b.atom_2_id} for b in after.bonds[-3:])


@pytest.mark.parametrize(
    ("element", "charge", "count"),
    [
        ("C", 0, 4),
        ("N", 0, 3),
        ("N", 1, 4),
        ("O", 0, 2),
        ("O", -1, 1),
        ("O", 1, 3),
        ("S", 0, 2),
        ("F", 0, 1),
        ("Cl", 0, 1),
        ("Br", 0, 1),
        ("I", 0, 1),
    ],
)
def test_initial_isolated_atom_profile_is_explicit(element: str, charge: int, count: int) -> None:
    before = isolated(1, element=element)
    before = before.model_copy(
        update={"atoms": [before.atoms[0].model_copy(update={"formal_charge": charge})]}
    )
    proposal = HydrogenBuilder(before).propose([1])
    assert proposal.report.added_hydrogen_count == count
    after = materialize(before, proposal)
    assert after.atoms[0] == before.atoms[0]
    assert len(after.atoms) == 1 + count


@pytest.mark.parametrize(("element", "charge"), [("P", 0), ("S", 2), ("N", -1), ("C", None)])
def test_unsupported_automatic_states_remain_explicitly_buildable(
    element: str, charge: int | None
) -> None:
    before = isolated(1, element=element)
    before = before.model_copy(
        update={"atoms": [before.atoms[0].model_copy(update={"formal_charge": charge})]}
    )
    automatic = HydrogenBuilder(before).propose([1])
    assert not automatic.sites
    assert automatic.report.status == "unresolved"
    explicit = HydrogenBuilder(before).propose([1], count=1, geometry="linear")
    after = materialize(before, explicit)
    assert len(after.atoms) == 2
    assert after.atoms[0] == before.atoms[0]


def test_many_targets_do_not_rescan_a_shared_high_degree_neighbor() -> None:
    before = isolated(501, element="N")
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"element": "C"}) if a.id == 1 else a for a in before.atoms
            ],
            "bonds": [Bond(id=i, atom_1_id=1, atom_2_id=i + 1, order=1.0) for i in range(1, 501)],
        }
    )
    builder = HydrogenBuilder(before)
    scans = []

    class CountedNeighbors(list):
        def __iter__(self):  # type: ignore[no-untyped-def]
            scans.append(1)
            return super().__iter__()

    builder.adjacency[1] = CountedNeighbors(builder.adjacency[1])
    proposal = builder.propose(list(range(2, 502)))
    assert proposal.report.completed_count == 500
    assert proposal.report.added_hydrogen_count == 1000
    assert scans == []


def test_failed_sites_still_consume_the_bounded_generation_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = model("CC", remove_h_on={1, 2})
    before = before.model_copy(
        update={
            "conformers": [
                *[
                    Conformer(
                        id=i + 1, name=str(i + 1), coordinates=list(before.active_coordinates)
                    )
                    for i in range(3)
                ],
                Conformer(
                    id=4,
                    name="Coincident last frame",
                    coordinates=[(0.0, 0.0, 0.0), (0.0, 0.0, 0.0)],
                ),
            ]
        }
    )
    monkeypatch.setattr(hydrogen, "MAX_COORDINATES", 12)
    proposal = HydrogenBuilder(before).propose([1, 2])
    assert not proposal.sites
    assert proposal.report.skipped_count == 1
    assert proposal.report.unprocessed_count == 1
    assert proposal.generated_coordinate_rows == 12
    assert proposal.report.reason_counts == {"addition_budget": 1, "degenerate_geometry": 1}


def test_oversized_context_failure_is_cached_for_the_complete_connected_graph() -> None:
    before = isolated(3000, element="C")
    before = before.model_copy(
        update={
            "bonds": [
                Bond(id=i, atom_1_id=i, atom_2_id=i + 1, order=1.5, aromatic=True)
                for i in range(1, 3000)
            ]
        }
    )
    builder = HydrogenBuilder(before)
    first = builder.propose([1])
    assert first.report.reason_counts == {"context_limit": 1}
    assert len(builder.contexts) == 3000
    remaining = builder.propose(list(range(2, 3001)))
    assert remaining.report.reason_counts == {"context_limit": 2999}
    assert builder.analyzed == 0


def test_virtual_analysis_h_does_not_invent_neighbor_stereo_from_planar_retained_atoms() -> None:
    before = model("C[C@H](O)F", remove_h_on={1, 2})
    points = [(x, y, 0.0) for x, y, _ in before.active_coordinates]
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": points[i]}) for i, a in enumerate(before.atoms)
            ],
            "conformers": [Conformer(id=1, name="Planar", coordinates=points)],
        }
    )
    proposal = HydrogenBuilder(before).propose([1])
    assert proposal.report.added_hydrogen_count == 3
    after = materialize(before, proposal)
    assert next(a for a in after.atoms if a.id == 2).stereo is None
    assert any(w.code == "model_hydrogen_stereo_geometry_unresolved" for w in after.warnings)


def test_collinear_alkene_needs_explicit_placement_and_cannot_certify_ez() -> None:
    before = model("C/C=C/C", remove_h_on={2, 3})
    points = [(float(i), 0.0, 0.0) for i in range(4)] + before.active_coordinates[4:]
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": points[i]}) for i, a in enumerate(before.atoms)
            ],
            "conformers": [Conformer(id=1, name="Collinear", coordinates=points)],
        }
    )
    automatic = HydrogenBuilder(before).propose([2, 3])
    assert automatic.report.added_hydrogen_count == 0
    assert automatic.report.reason_counts == {"undetermined_configuration": 2}
    explicit = HydrogenBuilder(before).propose([2], count=1, geometry="trigonal_planar")
    after = materialize(before, explicit)
    assert len(after.atoms) == len(before.atoms) + 1
    assert next(b for b in after.bonds if b.order == 2.0).stereo is None
    assert any(w.code == "model_hydrogen_stereo_geometry_unresolved" for w in after.warnings)


def test_stereo_analysis_budget_includes_each_conformer_visit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = model("C" * 20, remove_h_on={1})
    before = before.model_copy(
        update={
            "conformers": [
                Conformer(id=i + 1, name=str(i + 1), coordinates=list(before.active_coordinates))
                for i in range(500)
            ]
        }
    )

    def forbidden(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("Over-budget repeated conformer stereo analysis")

    monkeypatch.setattr(hydrogen.Chem, "AddHs", forbidden)
    proposal = HydrogenBuilder(before).propose([1])
    after = materialize(before, proposal)
    assert len(after.atoms) == len(before.atoms) + 3
    assert any(w.code == "model_hydrogen_stereo_unresolved" for w in after.warnings)


def test_covalently_attached_ligand_counts_cross_boundary_bonds_despite_unknown_protein() -> None:
    from molweave_core.molecular import Chain, Residue

    before = model("CNC", remove_h_on={1})
    before = before.model_copy(
        update={
            "structure_type": "complex",
            "chains": [Chain(id=1, name="A")],
            "residues": [
                Residue(id=1, chain_id=1, name="LIG", component_type="ligand"),
                Residue(id=2, chain_id=1, name="ALA", component_type="polymer"),
            ],
            "atoms": [
                a.model_copy(
                    update={
                        "residue_id": 1 if a.id == 1 else 2,
                        "formal_charge": None if a.id == 2 else a.formal_charge,
                    }
                )
                for a in before.atoms
            ],
        }
    )
    proposal = HydrogenBuilder(before).propose([1])
    assert proposal.report.added_hydrogen_count == 3
    after = materialize(before, proposal)
    assert after.atoms[: len(before.atoms)] == before.atoms
    assert after.bonds[: len(before.bonds)] == before.bonds
    assert all(a.residue_id == 1 for a in after.atoms[-3:])
    assert after.source == before.source


def test_selected_terminal_h_maps_to_its_incomplete_heavy_parent() -> None:
    from molweave_core.editing.model import DirectMolecularEditor, ModelDelete

    before = model("CC")
    children = [
        b.atom_2_id
        for b in before.bonds
        if b.atom_1_id == 1 and next(a for a in before.atoms if a.id == b.atom_2_id).element == "H"
    ]
    before = (
        DirectMolecularEditor()
        .edit(
            before,
            [children[0]],
            ModelDelete(operation="atom.delete"),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit.structure
    )
    builder = HydrogenBuilder(before)
    targets = builder.targets([children[1]])
    assert targets == [1]
    proposal = builder.propose(targets)
    assert proposal.report.added_hydrogen_count == 1
    after = materialize(before, proposal)
    assert after.atoms[: len(before.atoms)] == before.atoms


def test_isolated_h_is_preserved_and_does_not_select_an_invented_parent() -> None:
    before = isolated(1, element="H")
    builder = HydrogenBuilder(before)
    with pytest.raises(ValueError, match="one heavy parent"):
        builder.targets([1])
    proposal = builder.propose(builder.targets([], entry=True))
    assert proposal.report.target_count == 0
    assert proposal.report.status == "unchanged"
    assert materialize(before, proposal) is before
