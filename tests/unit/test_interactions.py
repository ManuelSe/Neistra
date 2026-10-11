from __future__ import annotations

import pytest
from molweave_core.interactions import (
    AnalysisInput,
    AnalysisLimits,
    InteractionInputIdentity,
    InteractionLimitError,
    analyze_interactions,
)
from molweave_core.molecular import Atom, Bond, Conformer, NormalizedStructureV1, SourceFacts


def molecule(
    points: list[tuple[float, float, float]], edges: list[tuple[int, int]] | None = None
) -> NormalizedStructureV1:
    return NormalizedStructureV1(
        title="controlled interaction fixture",
        structure_type="ligand",
        source=SourceFacts(filename="fixture.sdf", format="sdf"),
        atoms=[
            Atom(
                id=i,
                name=f"C{i}",
                element="C",
                formal_charge=0,
                coordinates=point,
                source_index=i - 1,
            )
            for i, point in enumerate(points, 1)
        ],
        bonds=[
            Bond(id=i, atom_1_id=a, atom_2_id=b, order=1) for i, (a, b) in enumerate(edges or [], 1)
        ],
        conformers=[Conformer(id=1, name="active", coordinates=points)],
    )


def source(structure: NormalizedStructureV1, entry: str = "entry") -> AnalysisInput:
    return AnalysisInput(
        InteractionInputIdentity(entry_id=entry, artifact_id=f"artifact-{entry}"), structure
    )


def test_clash_threshold_scope_identity_and_immutable_coordinates() -> None:
    structure = molecule([(0, 0, 0), (3, 0, 0), (7, 0, 0)])
    before = structure.to_bytes()
    result = analyze_interactions([source(structure)])
    assert len(result.records) == 1
    record = result.records[0]
    assert record.scope == "inter"  # disconnected molecules in a single entry
    assert record.geometry["overlap"] == pytest.approx(0.4)
    assert record.participants[0][0].atom_id == 1
    assert record.endpoints == [(0, 0, 0), (3, 0, 0)]
    assert structure.to_bytes() == before
    assert analyze_interactions([source(structure)]) == result


def test_clashes_exclude_three_bonds_but_retain_remote_intra_contact() -> None:
    structure = molecule([(0, 0, 0)] * 5, [(1, 2), (2, 3), (3, 4), (4, 5)])
    records = analyze_interactions([source(structure)]).records
    assert len(records) == 1
    assert records[0].scope == "intra"
    assert [group[0].atom_id for group in records[0].participants] == [1, 5]


def test_cross_entry_contacts_and_input_order_are_deterministic() -> None:
    a, b = source(molecule([(0, 0, 0)]), "a"), source(molecule([(2, 0, 0)]), "b")
    result = analyze_interactions([a, b])
    assert result.records[0].scope == "inter"
    assert result == analyze_interactions([b, a])


@pytest.mark.parametrize(
    "limits", [AnalysisLimits(atoms=1), AnalysisLimits(candidates=1), AnalysisLimits(records=0)]
)
def test_resource_limits_never_return_truncated_results(limits: AnalysisLimits) -> None:
    with pytest.raises(InteractionLimitError):
        analyze_interactions([source(molecule([(0, 0, 0), (1, 0, 0)]))], limits)


def test_nonfinite_coordinates_are_rejected() -> None:
    with pytest.raises(ValueError, match="finite"):
        analyze_interactions([source(molecule([(float("nan"), 0, 0)]))])


def test_unknown_connectivity_and_metals_report_partial_coverage() -> None:
    structure = molecule([(0, 0, 0), (1, 0, 0)], [(1, 2)])
    structure = structure.model_copy(
        update={"source": SourceFacts(filename="unknown.xyz", format="xyz")}
    )
    result = analyze_interactions([source(structure)])
    assert result.coverage["clash"].status == "partial"
    assert any(w.code == "incomplete_connectivity" for w in result.warnings)
    metal = structure.model_copy(
        update={"atoms": [a.model_copy(update={"element": "Zn"}) for a in structure.atoms]}
    )
    result = analyze_interactions([source(metal)])
    assert not result.records
    assert result.coverage["clash"].skipped_atoms == 2
