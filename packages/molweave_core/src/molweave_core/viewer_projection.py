"""Disposable projections must render drafts without certifying their chemistry."""

from rdkit import Chem

from molweave_core.adapters.rdkit_common import normalized_to_mol
from molweave_core.molecular import NormalizedStructureV1


def ligand_viewer_sdf(structure: NormalizedStructureV1) -> str:
    mol = normalized_to_mol(structure)
    active = next(
        i for i, c in enumerate(structure.conformers) if c.id == structure.active_conformer_id
    )
    return (
        Chem.MolToMolBlock(
            mol,
            confId=active,
            kekulize=False,
            forceV3000=len(structure.atoms) > 999 or len(structure.bonds) > 999,
        )
        + "\n$$$$\n"
    )
