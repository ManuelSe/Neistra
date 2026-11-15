from __future__ import annotations

from copy import deepcopy
from dataclasses import replace

import numpy as np
import pytest
from neistra_core.editing.fragments import (
    FragmentName,
    qualified_template_atom_ids,
    require_proper_local_rotation,
)
from neistra_core.editing.model import DirectMolecularEditor, ModelAtomAdd, ModelElement
from neistra_core.editing.placement import place_atom, place_fragment
from neistra_core.molecular import Bond

from tests.scientific.test_fixed_fragment_geometry import parent


@pytest.mark.parametrize(
    "fragment", ["cyclopropyl", "cyclobutyl", "cyclopentyl", "cyclohexyl", "methoxy"]
)
def test_actual_fixed_template_construction_has_exact_fresh_owned_mapping(
    fragment: FragmentName,
) -> None:
    before = parent()
    placement = place_fragment(
        before,
        [1],
        fragment=fragment,
        direction=0,
        rotation=0,
        next_atom_id=1000,
        next_bond_id=1000,
    )
    ids = qualified_template_atom_ids(
        before, placement.structure, fragment, placement.template_evidence
    )
    assert ids == {a.id for a in placement.structure.atoms if a.id >= 1000}


@pytest.mark.parametrize(
    "failure",
    [
        "incomplete_valence",
        "external_order",
        "non_template_ownership",
        "charged",
        "isotope",
        "alternate_h",
        "reflected",
        "permuted_h",
        "displaced_h",
        "wrong_mapping",
    ],
)
def test_corrupted_construction_evidence_cannot_preserve_hydrogens_as_a_trusted_template(
    failure: str,
) -> None:
    before = parent()
    placement = place_fragment(
        before,
        [1],
        fragment="cyclopropyl",
        direction=0,
        rotation=0,
        next_atom_id=1000,
        next_bond_id=1000,
    )
    draft, evidence = placement.structure, placement.template_evidence
    assert evidence is not None
    hydrogen_ids = [a.id for a in draft.atoms if a.id >= 1000 and a.element == "H"]
    if failure == "incomplete_valence":
        draft = draft.model_copy(
            update={
                "bonds": [
                    b for b in draft.bonds if hydrogen_ids[0] not in {b.atom_1_id, b.atom_2_id}
                ]
            }
        )
    elif failure == "external_order":
        draft = draft.model_copy(
            update={
                "bonds": [
                    b.model_copy(update={"order": 2.0}) if b.id == 1000 else b for b in draft.bonds
                ]
            }
        )
    elif failure == "non_template_ownership":
        draft = draft.model_copy(
            update={
                "bonds": [
                    *draft.bonds,
                    Bond(id=2000, atom_1_id=2, atom_2_id=1000, order=1.0),
                ]
            }
        )
    elif failure in {"charged", "alternate_h"}:
        change = {"formal_charge": 1} if failure == "charged" else {"alternate_location": "Z"}
        draft = draft.model_copy(
            update={
                "atoms": [
                    a.model_copy(update=change) if a.id == hydrogen_ids[0] else a
                    for a in draft.atoms
                ]
            }
        )
    elif failure == "isotope":
        annotations = deepcopy(draft.annotations)
        for record in annotations:
            if record.get("kind") == "neistra_hydrogen_protection":
                for fact in record["atoms"]:
                    if fact["atom_id"] == hydrogen_ids[0]:
                        fact["isotope"] = 2
        draft = draft.model_copy(update={"annotations": annotations})
    elif failure == "wrong_mapping":
        evidence = replace(evidence, template_indices=tuple(reversed(evidence.template_indices)))
    else:
        indices = {a.id: n for n, a in enumerate(draft.atoms)}
        frames = []
        for frame in draft.conformers:
            rows = list(frame.coordinates)
            if failure == "reflected":
                root = np.asarray(rows[indices[1000]])
                for atom_id in evidence.atom_ids:
                    point = np.asarray(rows[indices[atom_id]]) - root
                    point[0] *= -1
                    rows[indices[atom_id]] = tuple(point + root)
            elif failure == "permuted_h":
                i, j = indices[hydrogen_ids[0]], indices[hydrogen_ids[1]]
                rows[i], rows[j] = rows[j], rows[i]
            else:
                i = indices[hydrogen_ids[0]]
                rows[i] = (rows[i][0] + 0.1, rows[i][1], rows[i][2])
            frames.append(frame.model_copy(update={"coordinates": rows}))
        active = next(c for c in frames if c.id == draft.active_conformer_id)
        draft = draft.model_copy(
            update={
                "conformers": frames,
                "atoms": [
                    a.model_copy(update={"coordinates": active.coordinates[n]})
                    for n, a in enumerate(draft.atoms)
                ],
            }
        )
    with pytest.raises(ValueError, match="Fixed fragment"):
        qualified_template_atom_ids(before, draft, "cyclopropyl", evidence)


def test_imported_atoms_and_forged_metadata_are_not_fresh_construction_evidence() -> None:
    before = parent()
    placement = place_fragment(
        before,
        [1],
        fragment="cyclopropyl",
        direction=0,
        rotation=0,
        next_atom_id=1000,
        next_bond_id=1000,
    )
    imported = placement.structure.model_copy(
        update={
            "metadata": {
                "qualified_fragment_atom_ids": list(range(1000, 1008)),
            }
        }
    )
    with pytest.raises(ValueError, match="fresh template mapping"):
        qualified_template_atom_ids(imported, imported, "cyclopropyl", placement.template_evidence)
    parent_with_forged_flags = before.model_copy(
        update={
            "metadata": {
                "qualified_fragment_atom_ids": [1],
                "preserve_template_hydrogens": True,
            }
        }
    )
    result = DirectMolecularEditor().edit(
        parent_with_forged_flags,
        [1],
        ModelElement(operation="atom.element", element="N"),
        next_atom_id=1000,
        next_bond_id=1000,
        hydrogen_policy="automatic",
    )
    assert result.hydrogen_reconciliation_report is not None
    site = next(s for s in result.hydrogen_reconciliation_report.sites if s.atom_id == 1)
    assert site.status == "complete" and site.geometry == "tetrahedral"


def test_direct_atom_addition_keeps_the_normal_automatic_hydrogen_path() -> None:
    before = parent()
    addition = place_atom(
        before,
        [1],
        element="C",
        charge=0,
        direction=0,
        coordinates=None,
        next_atom_id=1000,
        next_bond_id=1000,
    )
    assert addition.template_evidence is None
    result = DirectMolecularEditor().edit(
        before,
        [1],
        ModelAtomAdd(operation="atom.add", element="C"),
        next_atom_id=1000,
        next_bond_id=1000,
        hydrogen_policy="automatic",
    )
    assert result.hydrogen_reconciliation_report is not None
    site = next(s for s in result.hydrogen_reconciliation_report.sites if s.atom_id == 1000)
    assert site.status == "complete" and site.geometry == "tetrahedral"
    assert len(site.added_hydrogen_ids) == 3


@pytest.mark.parametrize(
    "matrix", [np.diag([-1, 1, 1]), np.diag([2, 1, 1]), np.full((3, 3), np.nan)]
)
def test_local_transform_evidence_refuses_reflection_scale_or_nonfinite_matrices(
    matrix: object,
) -> None:
    with pytest.raises(ValueError, match="proper local rotation"):
        require_proper_local_rotation(matrix)
    require_proper_local_rotation(np.asarray([[0, -1, 0], [1, 0, 0], [0, 0, 1]]))
