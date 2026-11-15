"""Eleven fixed single-attachment templates, generated independently of the parent."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from neistra_core.hydrogen_protection import protection_facts
from neistra_core.molecular import Bond, NormalizedStructureV1

FragmentName = Literal[
    "methyl", "ethyl", "hydroxyl", "amino", "carboxylic_acid", "phenyl",
    "cyclopropyl", "cyclobutyl", "cyclopentyl", "cyclohexyl", "methoxy",
]
FRAGMENT_CAP_SMILES: dict[FragmentName, str] = {
    "methyl": "CC",
    "ethyl": "CCC",
    "hydroxyl": "CO",
    "amino": "CN",
    "carboxylic_acid": "CC(=O)O",
    "phenyl": "Cc1ccccc1",
    "cyclopropyl": "CC1CC1",
    "cyclobutyl": "CC1CCC1",
    "cyclopentyl": "CC1CCCC1",
    "cyclohexyl": "CC1CCCCC1",
    "methoxy": "COC",
}
FRAGMENT_SEED = 690
all_chem: Any = AllChem
PRESERVED_TEMPLATE_FRAGMENTS: frozenset[FragmentName] = frozenset({
    "cyclopropyl", "cyclobutyl", "cyclopentyl", "cyclohexyl", "methoxy",
})


@dataclass(frozen=True)
class TemplatePlacementEvidence:
    """Transient evidence from actual construction, never molecular metadata."""

    fragment: FragmentName
    template_indices: tuple[int, ...]
    atom_ids: tuple[int, ...]
    conformer_ids: tuple[int, ...]
    coordinates: tuple[tuple[tuple[float, float, float], ...], ...]


def require_proper_local_rotation(matrix: Any) -> None:
    if (
        np.shape(matrix) != (3, 3)
        or not np.isfinite(matrix).all()
        or not np.allclose(matrix.T @ matrix, np.eye(3), rtol=0, atol=1e-12)
        or abs(float(np.linalg.det(matrix)) - 1.0) > 1e-12
    ):
        raise ValueError("Fixed fragment placement requires a finite proper local rotation.")


def qualified_template_atom_ids(
    before: NormalizedStructureV1,
    draft: NormalizedStructureV1,
    fragment: FragmentName,
    evidence: TemplatePlacementEvidence | None,
) -> frozenset[int]:
    """Validate template ownership; precision warnings remain separate from it."""
    if (
        fragment not in PRESERVED_TEMPLATE_FRAGMENTS
        or evidence is None
        or evidence.fragment != fragment
    ):
        raise ValueError("Fixed fragment construction evidence is missing or incompatible.")
    old_ids = {a.id for a in before.atoms}
    atoms = {a.id: a for a in draft.atoms}
    created = atoms.keys() - old_ids
    template = fragment_template(fragment)
    cap = template.GetAtomWithIdx(0)
    removed = {0, *[a.GetIdx() for a in cap.GetNeighbors() if a.GetSymbol() == "H"]}
    kept = tuple(a.GetIdx() for a in template.GetAtoms() if a.GetIdx() not in removed)
    if (
        evidence.template_indices != kept
        or evidence.atom_ids != tuple(sorted(created))
        or len(created) != len(kept)
    ):
        raise ValueError("Fixed fragment atoms do not match the actual fresh template mapping.")
    mapping = dict(zip(kept, evidence.atom_ids, strict=True))
    facts = protection_facts(draft)
    for template_index, atom_id in mapping.items():
        atom = atoms[atom_id]
        fact = facts.get(atom_id)
        if (
            atom.element != template.GetAtomWithIdx(template_index).GetSymbol()
            or atom.element not in {"C", "O", "H"}
            or atom.formal_charge != 0
            or atom.stereo not in {None, "NONE"}
            or not fact or not fact.matches(atom) or not fact.ordinary
        ):
            raise ValueError(
                f"Fixed fragment atom {atom_id} lacks ordinary neutral template identity."
            )
    expected_bonds = {
        frozenset((mapping[b.GetBeginAtomIdx()], mapping[b.GetEndAtomIdx()])):
            (float(b.GetBondTypeAsDouble()), bool(b.GetIsAromatic()))
        for b in template.GetBonds()
        if b.GetBeginAtomIdx() in mapping and b.GetEndAtomIdx() in mapping
    }
    internal = [b for b in draft.bonds if {b.atom_1_id, b.atom_2_id} <= created]
    actual_bonds = {frozenset((b.atom_1_id, b.atom_2_id)): (b.order, b.aromatic) for b in internal}
    if actual_bonds != expected_bonds or len(internal) != len(expected_bonds):
        raise ValueError(
            "Fixed fragment internal connectivity differs from its qualified template."
        )
    external = [b for b in draft.bonds if len({b.atom_1_id, b.atom_2_id} & created) == 1]
    if (
        len(external) != 1 or mapping[1] not in {external[0].atom_1_id, external[0].atom_2_id}
        or external[0].order != 1.0 or external[0].aromatic
    ):
        raise ValueError("Fixed fragment requires exactly one external single bond at its root.")
    root = atoms[mapping[1]]
    parent_id = next(i for i in (external[0].atom_1_id, external[0].atom_2_id) if i not in created)
    parent = atoms[parent_id]
    if (
        parent_id not in old_ids or parent.element in {"H", "D", "T"}
        or parent.alternate_location not in {None, "", root.alternate_location}
    ):
        raise ValueError("Fixed fragment root does not have one compatible existing heavy parent.")
    neighbors: dict[int, list[tuple[int, Bond]]] = {i: [] for i in created}
    for bond in [*internal, *external]:
        for i, j in [(bond.atom_1_id, bond.atom_2_id), (bond.atom_2_id, bond.atom_1_id)]:
            if i in neighbors:
                neighbors[i].append((j, bond))
    valences = {"C": 4.0, "O": 2.0, "H": 1.0}
    for atom_id, incident in neighbors.items():
        atom = atoms[atom_id]
        if sum(b.order or 0 for _, b in incident) != valences[atom.element]:
            raise ValueError(f"Fixed fragment atom {atom_id} has incomplete template valence.")
        if atom.element == "H" and (
            len(incident) != 1 or atoms[incident[0][0]].element not in {"C", "O"}
            or atom.alternate_location not in {None, "", atoms[incident[0][0]].alternate_location}
        ):
            raise ValueError(
                f"Fixed fragment H {atom_id} has incompatible ownership or alternate identity."
            )
    if (
        evidence.conformer_ids != tuple(c.id for c in draft.conformers)
        or len(set(evidence.conformer_ids)) != len(evidence.conformer_ids)
    ):
        raise ValueError("Fixed fragment construction does not cover all current conformers.")
    if len(evidence.coordinates) != len(draft.conformers):
        raise ValueError("Fixed fragment construction lacks complete conformer coordinates.")
    indices = {a.id: i for i, a in enumerate(draft.atoms)}
    for conformer, captured in zip(draft.conformers, evidence.coordinates, strict=True):
        current = tuple(conformer.coordinates[indices[i]] for i in evidence.atom_ids)
        if current != captured or not np.isfinite(np.asarray(current)).all():
            raise ValueError(
                "Fixed fragment coordinates changed after construction in "
                f"conformer {conformer.id}."
            )
        if conformer.id == draft.active_conformer_id and current != tuple(
            atoms[i].coordinates for i in evidence.atom_ids
        ):
            raise ValueError(
                "Fixed fragment active atom coordinates differ from the constructed frame."
            )
    return frozenset(created)


@lru_cache(maxsize=11)
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
    ids = {int(a.GetIntProp("_NeistraAtomId")): a.GetIdx() for a in mol.GetAtoms()}
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
    anchor_id = int(anchor.GetIntProp("_NeistraAtomId"))
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
        atom.SetIntProp("_NeistraAtomId", next_atom_id + offset)
    parent = Chem.RWMol(mol)
    parent.RemoveAtom(h.GetIdx())
    anchor_index = next(
        a.GetIdx() for a in parent.GetAtoms() if a.GetIntProp("_NeistraAtomId") == anchor_id
    )
    combined = Chem.RWMol(Chem.CombineMols(parent, fragment_mol))
    combined.AddBond(anchor_index, parent.GetNumAtoms(), Chem.BondType.SINGLE)
    return combined
