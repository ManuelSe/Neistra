"""Bounded, selection-driven edits of prepared molecular components.

Chemistry projections are temporary. Stable normalized identity and untouched
records survive the merge; unknown chemistry never reaches RDKit defaults.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from rdkit import Chem, rdBase
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.adapters.rdkit_common import normalized_to_mol
from molweave_core.components import derive_component_hierarchy
from molweave_core.editing.fragments import (
    FRAGMENT_CAP_SMILES,
    FRAGMENT_SEED,
    FragmentName,
    graft_fragment,
)
from molweave_core.editing.ligand import EditResult
from molweave_core.molecular import (
    Atom,
    Bond,
    Conformer,
    InferenceRecord,
    MolecularWarning,
    NormalizedStructureV1,
)

ELEMENTS = ("C", "N", "O", "S", "F", "Cl", "Br", "I")


class InvalidSelectionEdit(ValueError):
    pass


class Action(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ElementChange(Action):
    operation: Literal["atom.element"]
    element: Literal["C", "N", "O", "S", "F", "Cl", "Br", "I"]


class ChargeChange(Action):
    operation: Literal["atom.charge"]
    delta: Literal[-1, 1]


class AtomDelete(Action):
    operation: Literal["atom.delete"]


class HydrogenPrepare(Action):
    operation: Literal["hydrogens.prepare"]


class FragmentReplace(Action):
    operation: Literal["fragment.replace"]
    fragment: FragmentName


class BondCreate(Action):
    operation: Literal["bond.create"]


class BondDelete(Action):
    operation: Literal["bond.delete"]


class BondOrder(Action):
    operation: Literal["bond.order"]
    order: Literal[1, 2, 3]


SelectionAction = Annotated[
    ElementChange
    | ChargeChange
    | AtomDelete
    | HydrogenPrepare
    | FragmentReplace
    | BondCreate
    | BondDelete
    | BondOrder,
    Field(discriminator="operation"),
]


@dataclass(frozen=True)
class SelectionEditResult:
    edit: EditResult
    replacements: dict[int, int]


def warning(code: str, message: str, operation: str) -> MolecularWarning:
    return MolecularWarning(code=code, message=message, operation=operation, field="chemistry")


def component_projection(
    structure: NormalizedStructureV1,
    selected: list[int],
) -> NormalizedStructureV1:
    if not selected or len(set(selected)) != len(selected):
        raise InvalidSelectionEdit("Select a non-empty unique set of atoms in one component.")
    atoms = {a.id: a for a in structure.atoms}
    if not set(selected) <= atoms.keys():
        raise InvalidSelectionEdit("The selected atoms are no longer present.")
    hierarchy = derive_component_hierarchy(structure)
    residue_atoms: dict[int, set[int]] = {}
    for atom in structure.atoms:
        if atom.residue_id is not None:
            residue_atoms.setdefault(atom.residue_id, set()).add(atom.id)
    matches: list[set[int]] = []
    for component in hierarchy.components:
        members = set().union(*(residue_atoms.get(i, set()) for i in component.residue_ids))
        members.update(component.atom_ids)
        if members.intersection(selected):
            if component.category != "ligand":
                raise InvalidSelectionEdit("Select a prepared small-molecule ligand component.")
            matches.append(members)
    if len(matches) != 1 or not set(selected) <= matches[0]:
        raise InvalidSelectionEdit("Select atoms in exactly one small-molecule component.")
    members = matches[0]
    if any((b.atom_1_id in members) != (b.atom_2_id in members) for b in structure.bonds):
        raise InvalidSelectionEdit(
            "Covalent bonds cross this component boundary; editing is unsupported."
        )
    member_residues = {atoms[i].residue_id for i in members}
    projected = structure.model_copy(
        update={
            "structure_type": "ligand",
            "atoms": [a for a in structure.atoms if a.id in members],
            "bonds": [b for b in structure.bonds if b.atom_1_id in members],
            "residues": [r for r in structure.residues if r.id in member_residues],
            "conformers": [
                c.model_copy(
                    update={
                        "coordinates": [
                            p
                            for a, p in zip(structure.atoms, c.coordinates, strict=True)
                            if a.id in members
                        ]
                    }
                )
                for c in structure.conformers
            ],
        }
    )
    if len(projected.conformers) != 1:
        raise InvalidSelectionEdit("Component editing requires exactly one conformer.")
    if len(projected.atoms) > 1024 or sum(a.element != "H" for a in projected.atoms) > 256:
        raise InvalidSelectionEdit(
            "Component editing is limited to 256 heavy atoms and 1,024 atoms."
        )
    if any(a.element not in (*ELEMENTS, "H") or a.alternate_location for a in projected.atoms):
        raise InvalidSelectionEdit("Unsupported element or unresolved alternate site in component.")
    if any(a.formal_charge is None for a in projected.atoms) or any(
        b.order is None for b in projected.bonds
    ):
        raise InvalidSelectionEdit(
            "Known formal charges and bond orders are required; prepare source chemistry first."
        )
    if any(b.stereo not in {None, "NONE"} for b in projected.bonds):
        raise InvalidSelectionEdit(
            "This bond stereochemistry encoding is not supported for editing."
        )
    if any(
        b.order not in {1.0, 1.5, 2.0, 3.0} or (b.order == 1.5) != b.aromatic
        for b in projected.bonds
    ):
        raise InvalidSelectionEdit("Unsupported or contradictory bond order/aromaticity.")
    pairs = {frozenset((b.atom_1_id, b.atom_2_id)) for b in projected.bonds}
    if len(pairs) != len(projected.bonds):
        raise InvalidSelectionEdit("Duplicate component bond endpoints are ambiguous.")
    if any(a.stereo not in {None, "TETRAHEDRAL_CW", "TETRAHEDRAL_CCW"} for a in projected.atoms):
        raise InvalidSelectionEdit(
            "This atom stereochemistry encoding is not supported for editing."
        )
    if not np.isfinite(np.asarray(projected.active_coordinates)).all():
        raise InvalidSelectionEdit("Component coordinates must be finite.")
    return projected


def sanitized(mol: Any) -> None:
    try:
        mol.UpdatePropertyCache(strict=False)
        Chem.SanitizeMol(mol)
    except (ValueError, RuntimeError) as error:
        raise InvalidSelectionEdit(f"Invalid valence or aromaticity: {error}") from error
    if any(a.GetNumRadicalElectrons() for a in mol.GetAtoms()):
        raise InvalidSelectionEdit("Radical chemistry is unsupported.")
    if any(
        a.GetSymbol() == "S" and (a.GetFormalCharge() != 0 or a.GetTotalValence() != 2)
        for a in mol.GetAtoms()
    ):
        raise InvalidSelectionEdit("Only neutral divalent sulfur is supported.")


def indices(mol: Any) -> dict[int, int]:
    return {
        int(a.GetIntProp("_MolWeaveAtomId")): int(a.GetIdx())
        for a in mol.GetAtoms()
        if a.HasProp("_MolWeaveAtomId")
    }


def reconcile_hydrogens(mol: Any, affected: set[int]) -> Any:
    """Remove only excess terminal H, retain viable H identity, then fill deficits."""
    original = indices(mol)
    local_h: dict[int, list[int]] = {}
    for atom_id in affected:
        if atom_id not in original:
            continue
        atom = mol.GetAtomWithIdx(original[atom_id])
        if atom.GetSymbol() == "H":
            continue
        local_h[atom_id] = [int(n.GetIdx()) for n in atom.GetNeighbors() if n.GetSymbol() == "H"]
        for idx in local_h[atom_id]:
            h = mol.GetAtomWithIdx(idx)
            if h.GetDegree() != 1 or h.GetFormalCharge() != 0:
                raise InvalidSelectionEdit("Only neutral terminal hydrogens are supported.")
    probe = Chem.RWMol(mol)
    for idx in sorted({i for values in local_h.values() for i in values}, reverse=True):
        probe.RemoveAtom(idx)
    sanitized(probe)
    probe_ids = indices(probe)
    remove: set[int] = set()
    for atom_id, hydrogens in local_h.items():
        needed = int(probe.GetAtomWithIdx(probe_ids[atom_id]).GetNumImplicitHs())
        ordered = sorted(
            hydrogens, key=lambda i: mol.GetAtomWithIdx(i).GetIntProp("_MolWeaveAtomId")
        )
        remove.update(ordered[needed:])
    edited = Chem.RWMol(mol)
    for idx in sorted(remove, reverse=True):
        edited.RemoveAtom(idx)
    sanitized(edited)
    current = indices(edited)
    return Chem.AddHs(edited, addCoords=True, onlyOnAtoms=[current[i] for i in sorted(local_h)])


class SelectionMolecularEditor:
    def edit(
        self,
        structure: NormalizedStructureV1,
        selected: list[int],
        action: SelectionAction,
        *,
        next_atom_id: int,
        next_bond_id: int,
    ) -> SelectionEditResult:
        before = component_projection(structure, selected)
        if next_atom_id <= max(a.id for a in structure.atoms) or next_bond_id <= max(
            (b.id for b in structure.bonds),
            default=0,
        ):
            raise InvalidSelectionEdit("New identities must exceed all retained entry IDs.")
        mol = Chem.RWMol(normalized_to_mol(before))
        sanitized(mol)
        if len(Chem.GetMolFrags(mol)) != 1:
            raise InvalidSelectionEdit("The component must have complete connected topology.")
        ids = indices(mol)
        affected: set[int] = set()
        replacements: dict[int, int] = {}
        details = ""
        if isinstance(action, HydrogenPrepare):
            affected = {a.id for a in before.atoms if a.element != "H"}
        elif isinstance(action, FragmentReplace):
            if len(selected) != 1:
                raise InvalidSelectionEdit("Select one terminal H for fragment substitution.")
            atom = mol.GetAtomWithIdx(ids[selected[0]])
            if atom.GetSymbol() != "H" or atom.GetDegree() != 1:
                raise InvalidSelectionEdit("Select one terminal H for fragment substitution.")
            anchor_id = int(atom.GetNeighbors()[0].GetIntProp("_MolWeaveAtomId"))
            try:
                mol = graft_fragment(mol, selected[0], action.fragment, next_atom_id)
            except (ValueError, RuntimeError) as error:
                raise InvalidSelectionEdit(str(error)) from error
            replacements[selected[0]] = next_atom_id
            affected = {anchor_id, next_atom_id}
            details = (
                f"; fragment-v1={action.fragment}; "
                f"cap-smiles={FRAGMENT_CAP_SMILES[action.fragment]}"
                f"; ETKDGv3 seed={FRAGMENT_SEED}; six torsion candidates"
            )
        elif isinstance(action, (BondCreate, BondDelete, BondOrder)):
            if len(selected) != 2:
                raise InvalidSelectionEdit("Select exactly two heavy-atom endpoints.")
            first, second = [mol.GetAtomWithIdx(ids[i]) for i in selected]
            if any(a.GetSymbol() == "H" for a in (first, second)):
                raise InvalidSelectionEdit("Bond actions require two heavy atoms.")
            bond = mol.GetBondBetweenAtoms(first.GetIdx(), second.GetIdx())
            if bond is not None and bond.GetIsAromatic():
                raise InvalidSelectionEdit("Direct aromatic bond changes are unsupported.")
            if isinstance(action, BondCreate):
                if bond is not None:
                    raise InvalidSelectionEdit("A bond already joins the selected atoms.")
                table = Chem.GetPeriodicTable()
                ideal = table.GetRcovalent(first.GetAtomicNum()) + table.GetRcovalent(
                    second.GetAtomicNum()
                )
                distance = np.linalg.norm(
                    np.array(mol.GetConformer().GetAtomPosition(first.GetIdx()))
                    - np.array(mol.GetConformer().GetAtomPosition(second.GetIdx()))
                )
                if not 0.65 * ideal <= distance <= 1.35 * ideal:
                    raise InvalidSelectionEdit(
                        "Bond endpoints are too far apart or overlap; move them explicitly first."
                    )
                mol.AddBond(first.GetIdx(), second.GetIdx(), Chem.BondType.SINGLE)
            elif bond is None:
                raise InvalidSelectionEdit("No bond joins the selected endpoints.")
            elif isinstance(action, BondDelete):
                mol.RemoveBond(first.GetIdx(), second.GetIdx())
            else:
                if bond.GetBondTypeAsDouble() == action.order:
                    raise InvalidSelectionEdit("The bond already has this order.")
                bond.SetBondType(
                    {1: Chem.BondType.SINGLE, 2: Chem.BondType.DOUBLE, 3: Chem.BondType.TRIPLE}[
                        action.order
                    ]
                )
            affected = set(selected)
        elif isinstance(action, AtomDelete):
            if any(mol.GetAtomWithIdx(ids[i]).GetSymbol() == "H" for i in selected):
                raise InvalidSelectionEdit(
                    "Automatic saturation would restore deleted H; use advanced hydrogen removal."
                )
            if len(selected) >= sum(a.element != "H" for a in before.atoms):
                raise InvalidSelectionEdit("Cannot delete every heavy atom in the component.")
            remove = set(selected)
            for i in selected:
                for neighbor in mol.GetAtomWithIdx(ids[i]).GetNeighbors():
                    stable = int(neighbor.GetIntProp("_MolWeaveAtomId"))
                    if neighbor.GetSymbol() == "H":
                        remove.add(stable)
                    elif stable not in remove:
                        affected.add(stable)
            for idx in sorted([ids[i] for i in remove], reverse=True):
                mol.RemoveAtom(idx)
        else:
            if len(selected) != 1:
                raise InvalidSelectionEdit("Select exactly one atom for element or charge changes.")
            atom_id = selected[0]
            atom = mol.GetAtomWithIdx(ids[atom_id])
            if atom.GetIsAromatic():
                raise InvalidSelectionEdit(
                    "Direct aromatic element or charge changes are unsupported."
                )
            affected = {atom_id}
            if isinstance(action, ChargeChange):
                if atom.GetSymbol() == "H":
                    raise InvalidSelectionEdit("Select a heavy atom to change charge.")
                charge = atom.GetFormalCharge() + action.delta
                if not -1 <= charge <= 1:
                    raise InvalidSelectionEdit("Supported local charges are -1, 0 and +1.")
                atom.SetFormalCharge(charge)
            elif isinstance(action, ElementChange):
                if atom.GetSymbol() == action.element:
                    raise InvalidSelectionEdit("The atom already has this element.")
                if atom.GetSymbol() == "H":
                    if atom.GetDegree() != 1 or atom.GetFormalCharge() != 0:
                        raise InvalidSelectionEdit("Select one neutral terminal H.")
                    anchor = atom.GetNeighbors()[0]
                    bond = mol.GetBondBetweenAtoms(atom.GetIdx(), anchor.GetIdx())
                    if anchor.GetSymbol() == "H" or bond.GetBondType() != Chem.BondType.SINGLE:
                        raise InvalidSelectionEdit(
                            "H substitution requires a single bond to a heavy atom."
                        )
                    anchor_id = int(anchor.GetIntProp("_MolWeaveAtomId"))
                    conf = mol.GetConformer()
                    origin = np.array(conf.GetAtomPosition(anchor.GetIdx()))
                    direction = np.array(conf.GetAtomPosition(atom.GetIdx())) - origin
                    length = float(np.linalg.norm(direction))
                    if length < 0.5:
                        raise InvalidSelectionEdit("The attachment H has unusable geometry.")
                    table = Chem.GetPeriodicTable()
                    target_length = table.GetRcovalent(anchor.GetAtomicNum()) + table.GetRcovalent(
                        action.element
                    )
                    conf.SetAtomPosition(atom.GetIdx(), origin + direction / length * target_length)
                    atom.SetIntProp("_MolWeaveAtomId", next_atom_id)
                    # The H bond has changed identity with its endpoint.
                    bond.ClearProp("_MolWeaveBondId")
                    replacements[atom_id] = next_atom_id
                    affected = {anchor_id, next_atom_id}
                atom.SetAtomicNum(Chem.GetPeriodicTable().GetAtomicNumber(action.element))
        mol = reconcile_hydrogens(mol, affected)
        sanitized(mol)
        if isinstance(action, BondOrder) and action.order == 2:
            bond = mol.GetBondBetweenAtoms(indices(mol)[selected[0]], indices(mol)[selected[1]])
            if any(
                str(info.type) == "Bond_Double" and info.centeredOn == bond.GetIdx()
                for info in Chem.FindPotentialStereo(mol)
            ):
                raise InvalidSelectionEdit(
                    "This edit requires an E/Z stereochemistry decision; unsupported."
                )
        return self._finish(
            structure,
            before,
            mol,
            action.operation,
            affected,
            replacements,
            next_atom_id,
            next_bond_id,
            details,
        )

    def _finish(
        self,
        structure: NormalizedStructureV1,
        before: NormalizedStructureV1,
        mol: Any,
        operation: str,
        affected: set[int],
        replacements: dict[int, int],
        next_atom_id: int,
        next_bond_id: int,
        details: str = "",
    ) -> SelectionEditResult:
        before_atoms = {a.id: a for a in before.atoms}
        before_bonds = {b.id: b for b in before.bonds}
        created: list[int] = sorted(
            int(a.GetIntProp("_MolWeaveAtomId"))
            for a in mol.GetAtoms()
            if a.HasProp("_MolWeaveAtomId") and a.GetIntProp("_MolWeaveAtomId") not in before_atoms
        )
        atom_cursor = max([next_atom_id - 1, *created]) + 1
        for atom in mol.GetAtoms():
            if not atom.HasProp("_MolWeaveAtomId"):
                atom.SetIntProp("_MolWeaveAtomId", atom_cursor)
                created.append(atom_cursor)
                atom_cursor += 1
        created_bonds: list[int] = []
        for bond in mol.GetBonds():
            if not bond.HasProp("_MolWeaveBondId"):
                bond.SetIntProp("_MolWeaveBondId", next_bond_id + len(created_bonds))
                created_bonds.append(next_bond_id + len(created_bonds))
        if mol.GetNumAtoms() > 1024 or sum(a.GetSymbol() != "H" for a in mol.GetAtoms()) > 256:
            raise InvalidSelectionEdit("The result exceeds component edit limits.")
        conf = mol.GetConformer()
        rd_atoms = {int(a.GetIntProp("_MolWeaveAtomId")): a for a in mol.GetAtoms()}
        points = {
            i: tuple(float(v) for v in conf.GetAtomPosition(a.GetIdx()))
            for i, a in rd_atoms.items()
        }
        if not np.isfinite(np.asarray(list(points.values()))).all():
            raise InvalidSelectionEdit("Generated coordinates must be finite.")
        bonds: list[Bond] = []
        for b in mol.GetBonds():
            stable = int(b.GetIntProp("_MolWeaveBondId"))
            first = int(b.GetBeginAtom().GetIntProp("_MolWeaveAtomId"))
            second = int(b.GetEndAtom().GetIntProp("_MolWeaveAtomId"))
            bonds.append(
                Bond(
                    id=stable,
                    atom_1_id=first,
                    atom_2_id=second,
                    order=float(b.GetBondTypeAsDouble()),
                    aromatic=bool(b.GetIsAromatic()),
                    stereo=before_bonds[stable].stereo if stable in before_bonds else None,
                    inferred=before_bonds[stable].inferred if stable in before_bonds else True,
                )
            )
        # Validate generated bond geometry; retained heavy-atom geometry is not optimized.
        for b in bonds:
            if b.atom_1_id in created or b.atom_2_id in created:
                distance = np.linalg.norm(np.array(points[b.atom_1_id]) - points[b.atom_2_id])
                table = Chem.GetPeriodicTable()
                ideal = table.GetRcovalent(
                    rd_atoms[b.atom_1_id].GetAtomicNum()
                ) + table.GetRcovalent(rd_atoms[b.atom_2_id].GetAtomicNum())
                if not 0.65 * ideal <= distance <= 1.35 * ideal:
                    raise InvalidSelectionEdit(
                        "Generated bond geometry is outside supported bounds."
                    )
        created_set = set(created)
        for atom in mol.GetAtoms():
            center_id = int(atom.GetIntProp("_MolWeaveAtomId"))
            neighbors = list(atom.GetNeighbors())
            expected, tolerance = {"SP": (180.0, 20), "SP2": (120.0, 30)}.get(
                str(atom.GetHybridization()),
                (109.47, 35),
            )
            for left in range(len(neighbors)):
                for right in range(left + 1, len(neighbors)):
                    first = int(neighbors[left].GetIntProp("_MolWeaveAtomId"))
                    second = int(neighbors[right].GetIntProp("_MolWeaveAtomId"))
                    if not ({center_id, first, second} & created_set):
                        continue
                    u = np.array(points[first]) - points[center_id]
                    v = np.array(points[second]) - points[center_id]
                    cosine = np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v))
                    angle = float(np.degrees(np.arccos(np.clip(cosine, -1, 1))))
                    if abs(angle - expected) > tolerance:
                        raise InvalidSelectionEdit(
                            "Generated bond angles are outside supported bounds."
                        )
        members = set(before_atoms)
        remaining = [a for a in structure.atoms if a.id not in members]
        source_index = max(a.source_index for a in structure.atoms) + 1
        residue_id = before.atoms[0].residue_id
        for i, atom in rd_atoms.items():
            updates = {
                "element": atom.GetSymbol(),
                "formal_charge": int(atom.GetFormalCharge()),
                "coordinates": points[i],
            }
            if i in before_atoms:
                remaining.append(before_atoms[i].model_copy(update=updates))
            else:
                remaining.append(
                    Atom(
                        id=i,
                        name=f"{atom.GetSymbol()}{i}",
                        residue_id=residue_id,
                        source_index=source_index,
                        inferred_fields=["element", "coordinates", "chemistry"],
                        **updates,
                    )
                )
                source_index += 1
        remaining.sort(key=lambda a: a.id)
        all_points = np.asarray([a.coordinates for a in remaining])
        if created:
            tree = cKDTree(all_points)
            for idx, atom in enumerate(remaining):
                if atom.id in created and len(tree.query_ball_point(all_points[idx], 0.4)) > 1:
                    raise InvalidSelectionEdit(
                        "Generated atoms overlap another atom (less than 0.4 angstrom)."
                    )
        deleted = tuple(sorted(members - rd_atoms.keys()))
        deleted_bonds = tuple(sorted(before_bonds.keys() - {b.id for b in bonds}))
        warnings = [
            warning(
                "inferred_local_chemistry",
                "Local valence/H and coordinates are inferred, not protonation or pose validation; "
                "source labels describe the original molecule.",
                operation,
            )
        ]
        if operation != "hydrogens.prepare":
            warnings.append(
                warning(
                    "unoptimized_edit_geometry",
                    "Surviving heavy coordinates are retained; "
                    "bond geometry and environment need scientific review.",
                    operation,
                )
            )
        if len(Chem.GetMolFrags(mol)) > 1:
            warnings.append(
                warning(
                    "component_disconnected",
                    "The topology edit has disconnected the component; "
                    "subsequent building requires connected topology.",
                    operation,
                )
            )
        metadata = dict(structure.metadata)
        metadata.pop("canonical_smiles", None)
        inference = InferenceRecord(
            code="selection_edit",
            message=f"selection-edit-v1; RDKit {rdBase.rdkitVersion}; {operation}; "
            "local valence H; fixed heavy coordinates" + details,
            atom_ids=sorted(set(created) | affected),
            bond_ids=created_bonds,
        )
        after = structure.model_copy(
            update={
                "atoms": remaining,
                "bonds": sorted(
                    [b for b in structure.bonds if b.atom_1_id not in members] + bonds,
                    key=lambda b: b.id,
                ),
                "conformers": [
                    Conformer(
                        id=structure.active_conformer_id,
                        name=structure.conformers[0].name,
                        coordinates=[a.coordinates for a in remaining],
                    )
                ],
                "metadata": metadata,
                "warnings": [*structure.warnings, *warnings],
                "inferences": [*structure.inferences, inference],
            }
        )
        # Revalidate the complete normalized schema, including merge identity.
        after = NormalizedStructureV1.model_validate(after.model_dump())
        # Tetrahedral tags depend on neighbor ordering. Re-perceive retained
        # supplied centers in final normalized bond order from fixed 3D geometry.
        known_centers = {a.id for a in before.atoms if a.stereo is not None} & rd_atoms.keys()
        if known_centers:
            projected_after = before.model_copy(
                update={
                    "atoms": [a for a in after.atoms if a.id in rd_atoms],
                    "bonds": bonds,
                    "conformers": [
                        Conformer(
                            id=1,
                            name="Edited",
                            coordinates=[a.coordinates for a in after.atoms if a.id in rd_atoms],
                        )
                    ],
                    "active_conformer_id": 1,
                }
            )
            stereo_mol = normalized_to_mol(projected_after)
            sanitized(stereo_mol)
            Chem.AssignStereochemistryFrom3D(stereo_mol, replaceExistingTags=True)
            tags = {
                int(a.GetIntProp("_MolWeaveAtomId")): str(a.GetChiralTag()).removeprefix("CHI_")
                for a in stereo_mol.GetAtoms()
            }
            after = after.model_copy(
                update={
                    "atoms": [
                        a.model_copy(
                            update={
                                "stereo": tags[a.id] if tags[a.id] != "UNSPECIFIED" else None,
                            }
                        )
                        if a.id in known_centers
                        else a
                        for a in after.atoms
                    ]
                }
            )
            stereo_warning = warning(
                "stereochemistry_review",
                "Retained supplied centers use "
                "their fixed 3D orientation; edits may change CIP priorities or remove a center.",
                operation,
            )
            warnings.append(stereo_warning)
            after = after.model_copy(update={"warnings": [*after.warnings, stereo_warning]})
        if after.atoms == structure.atoms and after.bonds == structure.bonds:
            raise InvalidSelectionEdit("The edit did not change molecular state.")
        return SelectionEditResult(
            EditResult(
                structure=after,
                warnings=tuple(warnings),
                created_atom_ids=tuple(created),
                created_bond_ids=tuple(created_bonds),
                deleted_atom_ids=deleted,
                deleted_bond_ids=deleted_bonds,
                changed_atom_ids=tuple(sorted(affected & rd_atoms.keys())),
            ),
            replacements,
        )
