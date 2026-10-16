"""Disposable projections must render drafts without certifying their chemistry."""

from rdkit import Chem

from molweave_core.adapters.rdkit_common import normalized_to_mol
from molweave_core.molecular import NormalizedStructureV1


def ligand_viewer_sdf(structure: NormalizedStructureV1) -> str:
    # The disposable writer cannot encode integers outside its C++ charge field.
    # Canonical records/inspection/archive retain the exact authored integer.
    display = structure.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": 0})
                if a.formal_charge is not None and not -(2**31) <= a.formal_charge < 2**31
                else a
                for a in structure.atoms
            ]
        }
    )
    mol = normalized_to_mol(display)
    active = next(
        i for i, c in enumerate(structure.conformers) if c.id == structure.active_conformer_id
    )
    return (
        Chem.MolToMolBlock(
            mol,
            confId=active,
            kekulize=False,
            forceV3000=len(structure.atoms) > 999
            or len(structure.bonds) > 999
            or any(abs(a.formal_charge or 0) > 9 for a in display.atoms),
        )
        + "\n$$$$\n"
    )
