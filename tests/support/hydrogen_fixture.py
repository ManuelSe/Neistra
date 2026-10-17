"""Synthetic hydrogen qualification models; no user data."""

from typing import Any

from molweave_core.adapters.rdkit_common import mol_to_normalized
from molweave_core.molecular import NormalizedStructureV1
from rdkit import Chem
from rdkit.Chem import AllChem

all_chem: Any = AllChem


def model(smiles: str, *, remove_h_on: set[int] | None = None) -> NormalizedStructureV1:
    mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
    parameters = all_chem.ETKDGv3()
    parameters.randomSeed = 77
    assert all_chem.EmbedMolecule(mol, parameters) == 0
    before = mol_to_normalized(mol, filename="synthetic.sdf", format_name="sdf")
    remove = {
        b.atom_2_id if b.atom_1_id in (remove_h_on or set()) else b.atom_1_id
        for b in before.bonds
        if bool({b.atom_1_id, b.atom_2_id} & (remove_h_on or set()))
        and any(a.id in {b.atom_1_id, b.atom_2_id} and a.element == "H" for a in before.atoms)
    }
    retained = [i for i, a in enumerate(before.atoms) if a.id not in remove]
    return before.model_copy(
        update={
            "atoms": [before.atoms[i] for i in retained],
            "bonds": [b for b in before.bonds if not {b.atom_1_id, b.atom_2_id} & remove],
            "conformers": [
                c.model_copy(update={"coordinates": [c.coordinates[i] for i in retained]})
                for c in before.conformers
            ],
        }
    )
