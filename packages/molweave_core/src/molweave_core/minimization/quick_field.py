"""Native force-field projection and explicit native geometric repair constraints."""

from __future__ import annotations

from itertools import combinations, product
from math import pi
from typing import Any

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.minimization.quick_model import QuickAssembly

all_chem: Any = AllChem
GEOMETRY_ELEMENTS = frozenset({1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 35, 53})


class LocalField:
    """Sum native fields with explicit mappings to the one disposable local model."""

    def __init__(self, size: int, parts: list[tuple[Any, list[int]]], offset: float = 0.0):
        self.size, self.parts = size, parts
        self.offset = offset
        self.direct = len(parts) == 1 and parts[0][1] == list(range(size))

    def CalcEnergy(self, positions: list[float]) -> float:
        if self.direct:
            return self.offset + float(self.parts[0][0].CalcEnergy(positions))
        xyz = np.asarray(positions).reshape((-1, 3))
        return self.offset + sum(
            float(ff.CalcEnergy(xyz[indices].reshape(-1).tolist())) for ff, indices in self.parts
        )

    def CalcGrad(self, positions: list[float]) -> Any:
        if self.direct:
            return np.asarray(self.parts[0][0].CalcGrad(positions))
        xyz = np.asarray(positions).reshape((-1, 3))
        gradient = np.zeros((self.size, 3))
        for ff, indices in self.parts:
            gradient[indices] += np.asarray(ff.CalcGrad(xyz[indices].reshape(-1).tolist())).reshape(
                (-1, 3)
            )
        return gradient.reshape(-1)


class ScaledField:
    """Signed native contribution for exact component inclusion-exclusion."""

    def __init__(self, field: Any, scale: float):
        self.field, self.scale = field, scale

    def CalcEnergy(self, positions: list[float]) -> float:
        return self.scale * float(self.field.CalcEnergy(positions))

    def CalcGrad(self, positions: list[float]) -> Any:
        return self.scale * np.asarray(self.field.CalcGrad(positions))


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


def native_field(mol: Any, indices: list[int], moving: set[int], mode: str) -> Any:
    Chem.GetSymmSSSR(mol)
    if mode == "MMFF94":
        props = all_chem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94")
        props.SetMMFFDielectricModel(2)
        props.SetMMFFDielectricConstant(4.0)
        ff = all_chem.MMFFGetMoleculeForceField(
            mol, props, nonBondedThresh=float("inf"), ignoreInterfragInteractions=False
        )
    else:
        ff = all_chem.UFFGetMoleculeForceField(
            mol, vdwThresh=float("inf"), ignoreInterfragInteractions=False
        )
    for index, global_index in enumerate(indices):
        if global_index not in moving:
            ff.AddFixedPoint(index)
    ff.Initialize()
    return ff


def active_native_parts(
    mol: Any, indices: list[int], moving: set[int]
) -> tuple[list[tuple[Any, list[int]]], bool]:
    """Exact MMFF moving forces, omitting repeated fixed-fragment pair work.

    Each pair field contains the complete moving components plus one chunk of
    complete fixed components. Remove duplicate moving self-terms; omit the
    fixed-only constant and report captured geometry as energy zero. No covalent
    boundary, nonbonded pair involving a mover, or native parameter is truncated.
    """
    groups = Chem.GetMolFrags(mol)
    active = sorted(
        i for group in groups if any(indices[k] in moving for k in group) for i in group
    )
    chunks: list[list[int]] = []
    chunk: list[int] = []
    for group in groups:
        if any(indices[k] in moving for k in group):
            continue
        if chunk and len(chunk) + len(group) > 128:
            chunks.append(chunk)
            chunk = []
        chunk.extend(group)
    if chunk:
        chunks.append(chunk)
    cost = len(active) ** 2 + sum((len(active) + len(c)) ** 2 for c in chunks)
    if len(chunks) < 2 or cost >= 0.65 * len(indices) ** 2:
        return [(native_field(mol, indices, moving, "MMFF94"), indices)], False
    parts = []
    for local in [active, *(sorted(active + c) for c in chunks)]:
        mapped = [indices[i] for i in local]
        ff = native_field(subset(mol, local), mapped, moving, "MMFF94")
        parts.append((ff, mapped))
    parts[0] = (ScaledField(parts[0][0], 1 - len(chunks)), parts[0][1])
    return parts, True


def force_field(assembly: QuickAssembly, positions: Any = None) -> tuple[Any, str]:
    assembly.field_center = (
        assembly.coordinates.copy() if positions is None else np.asarray(positions).copy()
    )
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
    offset = 0.0
    projected = False
    assembly.energy_reference = "model"
    # A native part with no optimizer variables is a constant. In mixed repair
    # models it supplies no ligand forces, and must not dominate solver stopping.
    if supported and moving & supported_set:
        mol = subset(assembly.molecule, supported)
        if native_mode == "MMFF94":
            native_parts, projected = active_native_parts(mol, supported, moving)
            parts.extend(native_parts)
        else:
            ff = native_field(mol, supported, moving, native_mode)
            assembly.warnings.append(
                "UFF fallback: electrostatic pocket interactions are not represented."
            )
            parts.append((ff, supported))
    if unsupported:
        ff = repair_field(assembly, unsupported, positions)
        parts.append((ff, list(range(len(modes)))))
        assembly.warnings.append(
            "Approximate repair: unsupported local chemistry uses geometric/steric constraints; "
            "unsupported site electrostatics and coordination are omitted."
        )
    if projected:
        original = assembly.coordinates
        offset = -sum(
            float(ff.CalcEnergy(original[indices].reshape(-1).tolist())) for ff, indices in parts
        )
        assembly.energy_reference = "captured_geometry"
        note = (
            "Objective energy uses captured geometry as zero; fixed-only native terms between "
            "calculation groups are omitted. Moving forces and energy changes remain native-exact."
        )
        if note not in assembly.assumptions:
            assembly.assumptions.append(note)
    return LocalField(len(modes), parts, offset), method


def repair_field(assembly: QuickAssembly, unsupported: set[int], positions: Any = None) -> Any:
    mol = assembly.molecule
    field = all_chem.CreateEmptyForceFieldForMol(mol)
    periodic = Chem.GetPeriodicTable()
    moving = set(assembly.movable)
    neighbors = {a.GetIdx(): {n.GetIdx() for n in a.GetNeighbors()} for a in mol.GetAtoms()}
    xyz = assembly.coordinates
    geometric = {a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() in GEOMETRY_ELEMENTS}
    for bond in mol.GetBonds():
        i, j = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if not {i, j} <= geometric or not {i, j} & unsupported or not {i, j} & moving:
            continue
        radius = sum(periodic.GetRcovalent(mol.GetAtomWithIdx(k).GetAtomicNum()) for k in (i, j))
        target = radius * {1.0: 1.0, 2.0: 0.87, 3.0: 0.78, 1.5: 0.93}.get(
            bond.GetBondTypeAsDouble(), 1.0
        )
        field.UFFAddDistanceConstraint(i, j, False, target, target, 100.0)
    for center in unsupported & geometric:
        for a, b in combinations(sorted(neighbors[center]), 2):
            if not {a, center, b} <= geometric or not {a, center, b} & moving:
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
            # RDKit constraint energies square degree errors. These strengths
            # are defined per radian squared, alongside angstrom bond penalties.
            field.UFFAddAngleConstraint(a, center, b, False, target, target, 20.0 * (pi / 180) ** 2)
    for bond in mol.GetBonds():
        i, j = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if (
            not {i, j} & unsupported
            or bond.GetBondTypeAsDouble() < 1.5
            or (bond.GetIsAromatic() and not bond.IsInRing())
        ):
            continue
        for a, b in product(sorted(neighbors[i] - {j}), sorted(neighbors[j] - {i})):
            if a == b or not {a, i, j, b} <= geometric or not {a, i, j, b} & moving:
                continue
            # Preserve which side of a planar draft each substituent occupies.
            first, second = (
                np.cross(xyz[a] - xyz[i], xyz[j] - xyz[i]),
                np.cross(xyz[j] - xyz[i], xyz[b] - xyz[j]),
            )
            if min(np.linalg.norm(first), np.linalg.norm(second)) < 1e-8:
                continue
            target = 180.0 if np.dot(first, second) >= 0 else 0.0
            field.UFFAddTorsionConstraint(a, i, j, b, False, target, target, 10.0 * (pi / 180) ** 2)
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
