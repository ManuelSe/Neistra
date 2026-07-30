from __future__ import annotations

import numpy as np
import pytest
from molweave_core.molecular import (
    Atom,
    Chain,
    Conformer,
    NormalizedStructureV1,
    Residue,
    SourceFacts,
)
from molweave_core.superposition import (
    InvalidSuperpositionError,
    kabsch_fit,
    superpose_backbone,
    superpose_selected,
)


def protein(
    coordinates: list[tuple[float, float, float]],
    *,
    names: list[str] | None = None,
    structure_type: str = "protein",
) -> NormalizedStructureV1:
    atom_names = names or ["N", "CA", "C", "O"]
    return NormalizedStructureV1(
        title="Protein",
        structure_type=structure_type,  # type: ignore[arg-type]
        source=SourceFacts(filename="protein.pdb", format="pdb"),
        chains=[Chain(id=1, name="A", entity_type="polymer")],
        residues=[
            Residue(
                id=1,
                chain_id=1,
                name="GLY",
                author_number=1,
                label_number=1,
                component_type="polymer",
            )
        ],
        atoms=[
            Atom(
                id=index,
                name=atom_name,
                element=atom_name[0],
                coordinates=point,
                residue_id=1,
                source_index=index - 1,
            )
            for index, (atom_name, point) in enumerate(
                zip(atom_names, coordinates, strict=True), start=1
            )
        ],
        conformers=[Conformer(id=1, name="Model 1", coordinates=coordinates)],
    )


REFERENCE = [
    (0.0, 0.0, 0.0),
    (2.0, 0.0, 0.0),
    (0.0, 1.0, 0.0),
    (0.0, 0.0, 1.0),
]
MOVING = [
    (4.0, -3.0, 2.0),
    (4.0, -1.0, 2.0),
    (3.0, -3.0, 2.0),
    (4.0, -3.0, 3.0),
]


def test_kabsch_fit_reports_proper_rotation_and_rmsd() -> None:
    fit = kabsch_fit(MOVING, REFERENCE)
    assert fit.atom_count == 4
    assert fit.rmsd == pytest.approx(0.0, abs=1e-12)
    determinant = (
        fit.rotation[0][0]
        * (fit.rotation[1][1] * fit.rotation[2][2] - fit.rotation[1][2] * fit.rotation[2][1])
        - fit.rotation[0][1]
        * (fit.rotation[1][0] * fit.rotation[2][2] - fit.rotation[1][2] * fit.rotation[2][0])
        + fit.rotation[0][2]
        * (fit.rotation[1][0] * fit.rotation[2][1] - fit.rotation[1][1] * fit.rotation[2][0])
    )
    assert determinant == pytest.approx(1.0, abs=1e-12)


def test_selected_and_backbone_superposition_match_by_identity() -> None:
    moving = protein(MOVING)
    reference = protein(REFERENCE)

    selected = superpose_selected(moving, reference, [4, 2, 1, 3], [1, 2, 3, 4])
    backbone = superpose_backbone(moving, reference)

    assert selected.fit.rmsd == pytest.approx(0.0, abs=1e-12)
    np.testing.assert_allclose(
        selected.structure.active_coordinates, REFERENCE, atol=1e-12
    )
    np.testing.assert_allclose(
        backbone.structure.active_coordinates, REFERENCE, atol=1e-12
    )
    assert [identity[5] for identity in selected.identities] == ["C", "CA", "N", "O"]


def test_superposition_rejects_non_corresponding_and_unequal_selections() -> None:
    moving = protein(MOVING)
    reference = protein(REFERENCE, names=["N", "CA", "CB", "O"])

    with pytest.raises(InvalidSuperpositionError, match="equal protein identities"):
        superpose_selected(moving, reference, [1, 2, 3], [1, 2, 3])
    with pytest.raises(InvalidSuperpositionError, match="equal protein identities"):
        superpose_selected(moving, protein(REFERENCE), [1, 2, 3], [1, 2, 3, 4])


def test_superposition_rejects_missing_ambiguous_or_nonprotein_identity() -> None:
    moving = protein(MOVING)
    missing_hierarchy = moving.model_copy(
        update={
            "atoms": [
                moving.atoms[0].model_copy(update={"residue_id": None}),
                *moving.atoms[1:],
            ]
        }
    )
    duplicate = protein(MOVING, names=["N", "N", "C", "O"])

    with pytest.raises(InvalidSuperpositionError, match="lacks protein"):
        superpose_selected(missing_hierarchy, protein(REFERENCE), [1, 2, 3], [1, 2, 3])
    with pytest.raises(InvalidSuperpositionError, match="duplicated"):
        superpose_selected(duplicate, protein(REFERENCE), [1, 2, 3], [1, 2, 3])
    with pytest.raises(InvalidSuperpositionError, match="protein or complex"):
        superpose_selected(
            protein(MOVING, structure_type="ligand"),
            protein(REFERENCE),
            [1, 2, 3],
            [1, 2, 3],
        )


def test_kabsch_rejects_collinear_reflection_and_nonfinite_geometry() -> None:
    line = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (2.0, 0.0, 0.0)]
    with pytest.raises(InvalidSuperpositionError, match="underdetermined"):
        kabsch_fit(line, line)

    reflected = [(-x, y, z) for x, y, z in REFERENCE]
    with pytest.raises(InvalidSuperpositionError, match="reflection"):
        kabsch_fit(REFERENCE, reflected)

    with pytest.raises(InvalidSuperpositionError, match="finite"):
        kabsch_fit(
            [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, float("nan"), 0.0)],
            REFERENCE[:3],
        )
