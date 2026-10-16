"""Six fixed single-attachment templates, generated independently of the parent."""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

FragmentName = Literal["methyl", "ethyl", "hydroxyl", "amino", "carboxylic_acid", "phenyl"]
FRAGMENT_CAP_SMILES: dict[FragmentName, str] = {
    "methyl": "CC",
    "ethyl": "CCC",
    "hydroxyl": "CO",
    "amino": "CN",
    "carboxylic_acid": "CC(=O)O",
    "phenyl": "Cc1ccccc1",
}
FRAGMENT_SEED = 690
all_chem: Any = AllChem


@lru_cache(maxsize=6)
def fragment_template(fragment: FragmentName) -> Any:
    mol = Chem.AddHs(Chem.MolFromSmiles(FRAGMENT_CAP_SMILES[fragment]))
    params = all_chem.ETKDGv3()
    params.randomSeed = FRAGMENT_SEED
    params.maxIterations = 200
    if all_chem.EmbedMolecule(mol, params) != 0:
        raise ValueError("Fragment coordinate generation failed.")
    return mol


def graft_fragment(mol: Any, hydrogen_id: int, fragment: FragmentName, next_atom_id: int) -> Any:
    """Replace H by the template root. Six fixed torsions bound placement work."""
    ids = {int(a.GetIntProp("_MolWeaveAtomId")): a.GetIdx() for a in mol.GetAtoms()}
    h = mol.GetAtomWithIdx(ids[hydrogen_id])
    if h.GetSymbol() != "H" or h.GetDegree() != 1 or h.GetFormalCharge() != 0:
        raise ValueError("Fragment substitution requires one neutral terminal H.")
    anchor = h.GetNeighbors()[0]
    if (
        anchor.GetSymbol() == "H"
        or mol.GetBondBetweenAtoms(h.GetIdx(), anchor.GetIdx()).GetBondType()
        != Chem.BondType.SINGLE
    ):
        raise ValueError("Fragment H must have a single bond to a heavy atom.")
    anchor_id = int(anchor.GetIntProp("_MolWeaveAtomId"))
    conf = mol.GetConformer()
    origin = np.asarray(conf.GetAtomPosition(anchor.GetIdx()))
    direction = np.asarray(conf.GetAtomPosition(h.GetIdx())) - origin
    length = float(np.linalg.norm(direction))
    if length < 0.5:
        raise ValueError("Attachment H geometry is unusable.")
    direction /= length
    template = Chem.Mol(fragment_template(fragment))
    tc = template.GetConformer()
    cap = template.GetAtomWithIdx(0)
    root = template.GetAtomWithIdx(1)
    source_axis = np.asarray(tc.GetAtomPosition(1)) - np.asarray(tc.GetAtomPosition(0))
    source_axis /= np.linalg.norm(source_axis)

    # Proper rotation by an orthonormal frame; no reflection and no global embed.
    def frame(axis: Any) -> Any:
        reference = np.eye(3)[int(np.argmin(np.abs(axis)))]
        second = np.cross(axis, reference)
        second /= np.linalg.norm(second)
        return np.column_stack((axis, second, np.cross(axis, second)))

    rotation = frame(direction) @ frame(source_axis).T
    table = Chem.GetPeriodicTable()
    bond_length = table.GetRcovalent(anchor.GetAtomicNum()) + table.GetRcovalent(
        root.GetAtomicNum()
    )
    remove = {0, *[n.GetIdx() for n in cap.GetNeighbors() if n.GetSymbol() == "H"]}
    kept = [a.GetIdx() for a in template.GetAtoms() if a.GetIdx() not in remove]
    relative = (
        np.asarray(
            [np.asarray(tc.GetAtomPosition(i)) - np.asarray(tc.GetAtomPosition(1)) for i in kept]
        )
        @ rotation.T
    )
    neighbors = np.asarray(
        [
            np.asarray(conf.GetAtomPosition(a.GetIdx()))
            for a in mol.GetAtoms()
            if a.GetIdx() not in {h.GetIdx(), anchor.GetIdx()}
        ]
    )
    tree = cKDTree(neighbors) if len(neighbors) else None
    best = None
    best_score = -1.0
    for angle in np.arange(6) * np.pi / 3:
        cross = np.array(
            [
                [0, -direction[2], direction[1]],
                [direction[2], 0, -direction[0]],
                [-direction[1], direction[0], 0],
            ]
        )
        around = np.eye(3) + np.sin(angle) * cross + (1 - np.cos(angle)) * cross @ cross
        points = relative @ around.T + origin + direction * bond_length
        score = float(np.min(tree.query(points)[0])) if tree is not None else 10.0
        if score > best_score:
            best, best_score = points, score
    assert best is not None
    for idx, point in zip(kept, best, strict=True):
        tc.SetAtomPosition(idx, point)
    fragment_mol = Chem.RWMol(template)
    for idx in sorted(remove, reverse=True):
        fragment_mol.RemoveAtom(idx)
    for offset, atom in enumerate(fragment_mol.GetAtoms()):
        atom.SetIntProp("_MolWeaveAtomId", next_atom_id + offset)
    parent = Chem.RWMol(mol)
    parent.RemoveAtom(h.GetIdx())
    anchor_index = next(
        a.GetIdx() for a in parent.GetAtoms() if a.GetIntProp("_MolWeaveAtomId") == anchor_id
    )
    combined = Chem.RWMol(Chem.CombineMols(parent, fragment_mol))
    combined.AddBond(anchor_index, parent.GetNumAtoms(), Chem.BondType.SINGLE)
    return combined
