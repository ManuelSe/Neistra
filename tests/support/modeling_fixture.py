"""Deterministic synthetic molecular modeling regression fixtures."""

from typing import Any

from molweave_core.adapters.rdkit_common import mol_to_normalized
from molweave_core.molecular import NormalizedStructureV1
from rdkit import Chem
from rdkit.Chem import AllChem

all_chem: Any = AllChem


def paracetamol(*, orphan_h: bool = False) -> NormalizedStructureV1:
    mol = Chem.AddHs(Chem.MolFromSmiles("CC(=O)Nc1ccc(O)cc1"))
    parameters = all_chem.ETKDGv3()
    parameters.randomSeed = 690
    assert all_chem.EmbedMolecule(mol, parameters) == 0
    structure = mol_to_normalized(mol, filename="paracetamol.sdf", format_name="sdf")
    hydrogen_ids = {a.id for a in structure.atoms if a.element == "H"}
    orphans = set(sorted(hydrogen_ids)[-3:]) if orphan_h else set()
    return structure.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"residue_id": None}) if a.id in orphans else a
                for a in structure.atoms
            ]
        }
    )


if __name__ == "__main__":
    from pathlib import Path

    from tests.support.editing_fixture import build_fixture

    destination = Path("tests/fixtures/modeling/paracetamol-orphan-h.molweave.zip")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(build_fixture(paracetamol(orphan_h=True), application_version="0.16.0"))
