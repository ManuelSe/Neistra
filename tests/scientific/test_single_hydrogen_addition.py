from itertools import combinations

import numpy as np
import pytest
from molweave_core.molecular import Conformer

from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_single_hydrogen_addition import single


@pytest.mark.parametrize(
    "smiles,charge,total_valence",
    [("N", 1, 4), ("O", 1, 3), ("S", 1, 3), ("[OH-]", 0, 2), ("[SH-]", 0, 2)],
)
def test_single_hydrogen_independent_charge_and_coordinate_evidence(
    smiles: str, charge: int, total_valence: int
) -> None:
    before = model(smiles)
    shifted = [(x + 8.0, y - 5.0, z + 2.0) for x, y, z in before.active_coordinates]
    before = before.model_copy(
        update={
            "conformers": [*before.conformers, Conformer(id=7, name="Shifted", coordinates=shifted)]
        }
    )
    after = single(before).edit.structure
    assert after.atoms[0].formal_charge == charge
    assert sum(b.order for b in after.bonds if 1 in {b.atom_1_id, b.atom_2_id}) == total_valence
    for old, new in zip(before.conformers, after.conformers, strict=True):
        assert new.coordinates[:-1] == old.coordinates
        length = np.linalg.norm(np.array(new.coordinates[-1]) - np.array(new.coordinates[0]))
        assert length == pytest.approx(
            {"N": 1.02, "O": 0.97, "S": 1.36}[before.atoms[0].element], abs=0.08
        )
    assert np.array(after.conformers[1].coordinates[-1]) - np.array(
        after.conformers[0].coordinates[-1]
    ) == pytest.approx([8.0, -5.0, 2.0])


def test_single_hydrogen_retained_tetrahedral_ammonium_has_independent_angles() -> None:
    before = model("N")
    points = [(0.0, 0.0, 0.0), (1.0, 1.0, 1.0), (1.0, -1.0, -1.0), (-1.0, 1.0, -1.0)]
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": points[n]}) for n, a in enumerate(before.atoms)
            ],
            "conformers": [before.conformers[0].model_copy(update={"coordinates": points})],
        }
    )
    after = single(before).edit.structure
    vec = np.array(after.active_coordinates[1:]) - np.array(after.active_coordinates[0])
    vec /= np.linalg.norm(vec, axis=1)[:, None]
    for a, b in combinations(vec, 2):
        assert float(a @ b) == pytest.approx(-1 / 3, abs=1e-6)
