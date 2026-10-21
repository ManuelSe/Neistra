"""Native force-field projection and explicit native geometric repair constraints."""

from __future__ import annotations

from itertools import combinations, product
from typing import Any

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.minimization.quick_model import QuickAssembly

all_chem: Any = AllChem


class LocalField:
    """Sum native fields with explicit mappings to the one disposable local model."""

    def __init__(self, size: int, parts: list[tuple[Any, list[int]]]):
        self.size, self.parts = size, parts

    def CalcEnergy(self, positions: list[float]) -> float:
        xyz = np.asarray(positions).reshape((-1, 3))
        return sum(
            float(ff.CalcEnergy(xyz[indices].reshape(-1).tolist())) for ff, indices in self.parts
        )

    def CalcGrad(self, positions: list[float]) -> Any:
        xyz = np.asarray(positions).reshape((-1, 3))
        gradient = np.zeros((self.size, 3))
        for ff, indices in self.parts:
            gradient[indices] += np.asarray(ff.CalcGrad(xyz[indices].reshape(-1).tolist())).reshape(
                (-1, 3)
            )
        return gradient.reshape(-1)


def subset(mol: Any, indices: list[int]) -> Any:
    if len(indices) == mol.GetNumAtoms():
        return mol
    rw = Chem.RWMol(mol)
    keep = set(indices)
    for i in reversed(range(mol.GetNumAtoms())):
        if i not in keep:
            rw.RemoveAtom(i)
    result = rw.GetMol()
    Chem.SanitizeMol(result)
    return result


def force_field(assembly: QuickAssembly, positions: Any = None) -> tuple[Any, str]:
    modes = assembly.modes
    moving = set(assembly.movable)
    moving_modes = {modes[i] for i in moving}
    native_mode = "UFF" if "UFF" in moving_modes else "MMFF94"
    supported = [
        i
        for i, mode in enumerate(modes)
        if mode == "MMFF94" or (native_mode == "UFF" and mode == "UFF")
    ]
    supported_set = set(supported)
    unsupported = set(range(len(modes))) - supported_set
    approximate_moving = bool(moving & unsupported)
    method = "geometry_repair" if approximate_moving else native_mode
    parts = []
    if supported:
        mol = subset(assembly.molecule, supported)
        if native_mode == "MMFF94":
            props = all_chem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94")
            props.SetMMFFDielectricModel(2)
            props.SetMMFFDielectricConstant(4.0)
            ff = all_chem.MMFFGetMoleculeForceField(
                mol, props, nonBondedThresh=100.0, ignoreInterfragInteractions=False
            )
        else:
            ff = all_chem.UFFGetMoleculeForceField(mol, ignoreInterfragInteractions=False)
            assembly.warnings.append(
                "UFF fallback: electrostatic pocket interactions are not represented."
            )
        for index, global_index in enumerate(supported):
            if global_index not in moving:
                ff.AddFixedPoint(index)
        ff.Initialize()
        parts.append((ff, supported))
    if unsupported:
        ff = repair_field(assembly, unsupported, positions)
        parts.append((ff, list(range(len(modes)))))
        assembly.warnings.append(
            "Approximate repair: unsupported local chemistry uses geometric/steric constraints; "
            "unsupported site electrostatics and coordination are omitted."
        )
    return LocalField(len(modes), parts), method


def repair_field(assembly: QuickAssembly, unsupported: set[int], positions: Any = None) -> Any:
    mol = assembly.molecule
    field = all_chem.CreateEmptyForceFieldForMol(mol)
    periodic = Chem.GetPeriodicTable()
    moving = set(assembly.movable)
    neighbors = {a.GetIdx(): {n.GetIdx() for n in a.GetNeighbors()} for a in mol.GetAtoms()}
    xyz = assembly.coordinates
    for bond in mol.GetBonds():
        i, j = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if not {i, j} & unsupported or not {i, j} & moving:
            continue
        radius = sum(periodic.GetRcovalent(mol.GetAtomWithIdx(k).GetAtomicNum()) for k in (i, j))
        target = radius * {1.0: 1.0, 2.0: 0.87, 3.0: 0.78, 1.5: 0.93}.get(
            bond.GetBondTypeAsDouble(), 1.0
        )
        field.UFFAddDistanceConstraint(i, j, False, target, target, 100.0)
    for center in unsupported:
        for a, b in combinations(sorted(neighbors[center]), 2):
            if not {a, center, b} & moving:
                continue
            orders = [
                mol.GetBondBetweenAtoms(center, n).GetBondTypeAsDouble() for n in neighbors[center]
            ]
            target = (
                180.0
                if 3.0 in orders
                else 120.0
                if any(o >= 1.5 for o in orders)
                else 104.5
                if mol.GetAtomWithIdx(center).GetAtomicNum() == 8
                else 109.47
            )
            field.UFFAddAngleConstraint(a, center, b, False, target, target, 20.0)
    for bond in mol.GetBonds():
        i, j = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if (
            not {i, j} & unsupported
            or bond.GetBondTypeAsDouble() < 1.5
            or (bond.GetIsAromatic() and not bond.IsInRing())
        ):
            continue
        for a, b in product(sorted(neighbors[i] - {j}), sorted(neighbors[j] - {i})):
            if a == b or not {a, i, j, b} & moving:
                continue
            # Preserve which side of a planar draft each substituent occupies.
            first, second = (
                np.cross(xyz[a] - xyz[i], xyz[j] - xyz[i]),
                np.cross(xyz[j] - xyz[i], xyz[b] - xyz[j]),
            )
            target = 0.0 if np.dot(first, second) >= 0 else 180.0
            field.UFFAddTorsionConstraint(a, i, j, b, False, target, target, 10.0)
    radii = [periodic.GetRvdw(a.GetAtomicNum()) for a in mol.GetAtoms()]
    discovery = xyz if positions is None else positions
    tree = cKDTree(discovery)
    added = set()
    for i in moving:
        for j in tree.query_ball_point(discovery[i], 2 * max(radii) * 0.75 + 2.0):
            pair = tuple(sorted((i, j)))
            if (
                pair in added
                or i == j
                or j in neighbors[i]
                or neighbors[i] & neighbors[j]
                or not {i, j} & unsupported
            ):
                continue
            added.add(pair)
            distance = 0.75 * (radii[i] + radii[j])
            field.UFFAddDistanceConstraint(i, j, False, distance, 1e6, 20.0)
    for i in range(mol.GetNumAtoms()):
        if i not in moving:
            field.AddFixedPoint(i)
    field.Initialize()
    return field
