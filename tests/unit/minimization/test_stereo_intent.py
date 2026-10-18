from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.optimize import geometry_stereo, validate_stereo_intent
from molweave_core.minimization.preflight import isolated_preflight

from tests.support.minimization import capture, molecule


@pytest.mark.parametrize("smiles", ["F/C=C/F", "C[C@H](O)C(=O)O"])
def test_current_geometry_and_supplied_stereo_agree(smiles: str) -> None:
    parameters, inputs = capture(molecule(smiles))
    value = isolated_preflight(parameters, inputs)
    current = geometry_stereo(value.molecule, np.asarray(value.structure.active_coordinates))
    validate_stereo_intent(value, current)


def test_conflicting_double_bond_intent_is_refused_before_optimization() -> None:
    parameters, inputs = capture(molecule("F/C=C/F"))
    value = isolated_preflight(parameters, inputs)
    current = geometry_stereo(value.molecule, np.asarray(value.structure.active_coordinates))
    changed = value.structure.model_copy(
        update={
            "bonds": [
                b.model_copy(update={"stereo": "Z"}) if b.stereo == "E" else b
                for b in value.structure.bonds
            ]
        }
    )
    with pytest.raises(CalculationError, match="E/Z intent"):
        validate_stereo_intent(replace(value, structure=changed), current)


def test_conflicting_tetrahedral_intent_is_refused_before_optimization() -> None:
    parameters, inputs = capture(molecule("C[C@H](O)C(=O)O"))
    value = isolated_preflight(parameters, inputs)
    current = geometry_stereo(value.molecule, np.asarray(value.structure.active_coordinates))
    opposite = {"TETRAHEDRAL_CW": "TETRAHEDRAL_CCW", "TETRAHEDRAL_CCW": "TETRAHEDRAL_CW"}
    changed = value.structure.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"stereo": opposite[a.stereo]}) if a.stereo else a
                for a in value.structure.atoms
            ]
        }
    )
    with pytest.raises(CalculationError, match="tetrahedral intent"):
        validate_stereo_intent(replace(value, structure=changed), current)
