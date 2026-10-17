"""Bounded local draft placement; only the fixed fragment template is embedded."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any

import numpy as np
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.editing.fragments import FRAGMENT_SEED, FragmentName, fragment_template
from molweave_core.editing.geometry import covalent_length as _length
from molweave_core.editing.geometry import covalent_radius as _radius
from molweave_core.editing.geometry import local_frame as _frame
from molweave_core.hydrogen_protection import ordinary_generated
from molweave_core.molecular import (
    Atom,
    Bond,
    InferenceRecord,
    MolecularWarning,
    NormalizedStructureV1,
)


@dataclass(frozen=True)
class Placement:
    structure: NormalizedStructureV1
    replacements: dict[int, int]
    touched: set[int]
    warnings: tuple[MolecularWarning, ...] = ()


def _unit(vector: Any) -> Any:
    length = float(np.linalg.norm(vector))
    return vector / length if length > 1e-8 else np.array([1.0, 0.0, 0.0])


def _direction(
    structure: NormalizedStructureV1, anchor: int, points: Any, index: int, replaced: int | None
) -> Any:
    indices = {a.id: i for i, a in enumerate(structure.atoms)}
    center = points[indices[anchor]]
    neighbors = []
    for bond in structure.bonds:
        if anchor in {bond.atom_1_id, bond.atom_2_id}:
            other = bond.atom_2_id if bond.atom_1_id == anchor else bond.atom_1_id
            neighbors.append(_unit(points[indices[other]] - center))
    preferred = (
        _unit(points[indices[replaced]] - center)
        if replaced is not None
        else _unit(-np.sum(neighbors, axis=0))
        if neighbors
        else np.array([1.0, 0.0, 0.0])
    )
    frame = _frame(preferred)
    # Six explicit local candidates; no whole-parent coordinate generation.
    candidates = [preferred, -preferred, frame[:, 1], -frame[:, 1], frame[:, 2], -frame[:, 2]]
    return candidates[index]


def _radius_warning(element: str, operation: str) -> tuple[MolecularWarning, ...]:
    return (
        MolecularWarning(
            code="model_placement_radius_unknown",
            message=f"Attachment radius for {element} is unknown; local placement used an "
            "unoptimized 1.5 angstrom distance. Review the proposal.",
            operation=f"model.{operation}",
            field="coordinates",
        ),
    )


def _residue(structure: NormalizedStructureV1, anchor: Atom | None) -> int | None:
    valid = {r.id for r in structure.residues}
    if anchor is not None:
        return anchor.residue_id if anchor.residue_id in valid else None
    if not structure.atoms and len(structure.residues) == 1:
        return structure.residues[0].id
    return None


def _assemble(
    before: NormalizedStructureV1,
    new_atoms: list[Atom],
    new_bonds: list[Bond],
    frames: list[list[tuple[float, float, float]]],
    removed: int | None,
    message: str,
) -> NormalizedStructureV1:
    retained = [i for i, a in enumerate(before.atoms) if a.id != removed]
    if not all(isfinite(value) for frame in frames for point in frame for value in point):
        raise ValueError("Generated coordinates must be finite.")
    return before.model_copy(
        update={
            "annotations": [*before.annotations, ordinary_generated(new_atoms)],
            "atoms": [before.atoms[i] for i in retained] + new_atoms,
            "bonds": [b for b in before.bonds if removed not in {b.atom_1_id, b.atom_2_id}]
            + new_bonds,
            "conformers": [
                c.model_copy(update={"coordinates": [c.coordinates[i] for i in retained] + frame})
                for c, frame in zip(before.conformers, frames, strict=True)
            ],
            "inferences": [
                *before.inferences,
                InferenceRecord(
                    code="model_local_placement",
                    message=message,
                    atom_ids=[a.id for a in new_atoms],
                    bond_ids=[b.id for b in new_bonds],
                ),
            ],
        }
    )


def place_atom(
    before: NormalizedStructureV1,
    selected: list[int],
    *,
    element: str,
    charge: int | None,
    direction: int,
    coordinates: tuple[float, float, float] | None,
    next_atom_id: int,
    next_bond_id: int,
) -> Placement:
    atoms = {a.id: a for a in before.atoms}
    if len(selected) > 1 or (before.atoms and not selected and coordinates is None):
        raise ValueError("Select one attachment atom, or explicitly position a disconnected atom.")
    anchor = atoms[selected[0]] if selected else None
    indices = {a.id: i for i, a in enumerate(before.atoms)}
    frames = []
    for conformer in before.conformers:
        if coordinates is not None:
            point = coordinates
        elif anchor is None:
            point = (0.0, 0.0, 0.0)
        else:
            points = np.asarray(conformer.coordinates)
            point = tuple(
                points[indices[anchor.id]]
                + _direction(before, anchor.id, points, direction, None)
                * _length(anchor.element, element)
            )
        frames.append([point])
    active = next(i for i, c in enumerate(before.conformers) if c.id == before.active_conformer_id)
    new_atom = Atom(
        id=next_atom_id,
        name=f"{element}{next_atom_id}",
        element=element,
        coordinates=frames[active][0],
        formal_charge=charge,
        residue_id=_residue(before, anchor),
        alternate_location=anchor.alternate_location if anchor is not None else None,
        source_index=max((a.source_index for a in before.atoms), default=-1) + 1,
        inferred_fields=[] if coordinates is not None else ["coordinates"],
    )
    bonds = (
        []
        if anchor is None
        else [Bond(id=next_bond_id, atom_1_id=anchor.id, atom_2_id=next_atom_id, order=1.0)]
    )
    after = _assemble(
        before,
        [new_atom],
        bonds,
        frames,
        None,
        "Direct atom placement v1: explicit coordinates, origin or "
        f"local direction{direction} of six; "
        "unoptimized covalent-radii or explicitly warned fallback distance in each "
        "conformer; no parent embedding/minimization.",
    )
    return Placement(
        after,
        {},
        {next_atom_id, *selected},
        _radius_warning(anchor.element, "atom.add")
        if anchor is not None and coordinates is None and _radius(anchor.element) is None
        else (),
    )


def place_fragment(
    before: NormalizedStructureV1,
    selected: list[int],
    *,
    fragment: FragmentName,
    direction: int,
    rotation: int,
    next_atom_id: int,
    next_bond_id: int,
) -> Placement:
    if len(selected) != 1:
        raise ValueError("Select one heavy atom to attach, or one terminal H to replace.")
    atom_map = {a.id: a for a in before.atoms}
    target = atom_map[selected[0]]
    replaced: int | None = None
    anchor = target
    if target.element == "H":
        incident = [b for b in before.bonds if target.id in {b.atom_1_id, b.atom_2_id}]
        if len(incident) != 1:
            raise ValueError(
                "Fragment replacement needs one terminal H with an explicit heavy parent."
            )
        bond = incident[0]
        anchor = atom_map[bond.atom_2_id if bond.atom_1_id == target.id else bond.atom_1_id]
        if anchor.element == "H":
            raise ValueError(
                "Fragment replacement requires a heavy parent; use direct atom tools otherwise."
            )
        replaced = target.id
    template = fragment_template(fragment)  # Read only; the cached template is never modified.
    tc = template.GetConformer()
    cap = template.GetAtomWithIdx(0)
    remove = {0, *[n.GetIdx() for n in cap.GetNeighbors() if n.GetSymbol() == "H"]}
    kept = [a.GetIdx() for a in template.GetAtoms() if a.GetIdx() not in remove]
    mapping = {idx: next_atom_id + i for i, idx in enumerate(kept)}
    source_axis = _unit(np.asarray(tc.GetAtomPosition(1)) - np.asarray(tc.GetAtomPosition(0)))
    relative = np.asarray(
        [np.asarray(tc.GetAtomPosition(i)) - np.asarray(tc.GetAtomPosition(1)) for i in kept]
    )
    parent_indices = {a.id: i for i, a in enumerate(before.atoms)}
    frames: list[list[tuple[float, float, float]]] = []
    for conformer in before.conformers:
        points = np.asarray(conformer.coordinates)
        origin = points[parent_indices[anchor.id]]
        axis = _direction(before, anchor.id, points, direction, replaced)
        aligned = relative @ (_frame(axis) @ _frame(source_axis).T).T
        retained_points = np.asarray(
            [points[i] for i, a in enumerate(before.atoms) if a.id not in {anchor.id, replaced}]
        )
        tree = cKDTree(retained_points) if len(retained_points) else None
        cross = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
        candidates = []
        scores = []
        for turn in range(6):
            angle = turn * np.pi / 3
            around = np.eye(3) + np.sin(angle) * cross + (1 - np.cos(angle)) * cross @ cross
            generated = (
                aligned @ around.T
                + origin
                + axis * _length(anchor.element, template.GetAtomWithIdx(1).GetSymbol())
            )
            candidates.append(generated)
            scores.append(float(np.min(tree.query(generated)[0])) if tree is not None else 10.0)
        best = max(range(6), key=lambda i: scores[i])
        frames.append([tuple(point) for point in candidates[(best + rotation) % 6]])
    active = next(i for i, c in enumerate(before.conformers) if c.id == before.active_conformer_id)
    source_index = max((a.source_index for a in before.atoms), default=-1) + 1
    new_atoms = [
        Atom(
            id=mapping[idx],
            name=f"{template.GetAtomWithIdx(idx).GetSymbol()}{mapping[idx]}",
            element=template.GetAtomWithIdx(idx).GetSymbol(),
            formal_charge=template.GetAtomWithIdx(idx).GetFormalCharge(),
            coordinates=frames[active][i],
            residue_id=_residue(before, anchor),
            alternate_location=(target.alternate_location or anchor.alternate_location)
            if replaced is not None
            else anchor.alternate_location,
            source_index=source_index + i,
            inferred_fields=["coordinates"],
        )
        for i, idx in enumerate(kept)
    ]
    new_bonds = [Bond(id=next_bond_id, atom_1_id=anchor.id, atom_2_id=mapping[1], order=1.0)]
    for bond in template.GetBonds():
        a, b = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if a in mapping and b in mapping:
            new_bonds.append(
                Bond(
                    id=next_bond_id + len(new_bonds),
                    atom_1_id=mapping[a],
                    atom_2_id=mapping[b],
                    order=float(bond.GetBondTypeAsDouble()),
                    aromatic=bool(bond.GetIsAromatic()),
                )
            )
    after = _assemble(
        before,
        new_atoms,
        new_bonds,
        frames,
        replaced,
        f"Direct fragment placement v1: {fragment}; methyl-capped template ETKDGv3 "
        f"seed{FRAGMENT_SEED}, max200 iterations, six local directions/six60-degree "
        f"torsions, direction{direction} and user turn{rotation}; "
        "rigid transforms in each conformer, "
        "no parent embedding/minimization or protonation determination.",
    )
    return Placement(
        after,
        {} if replaced is None else {replaced: mapping[1]},
        {anchor.id, *[a.id for a in new_atoms]},
        _radius_warning(anchor.element, "fragment.attach")
        if _radius(anchor.element) is None
        else (),
    )
