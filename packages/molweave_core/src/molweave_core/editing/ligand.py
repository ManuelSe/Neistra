from __future__ import annotations

from dataclasses import dataclass
from math import cos, isfinite, radians, sin
from typing import Any, Literal, Protocol

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem

from molweave_core.adapters.rdkit_common import normalized_to_mol
from molweave_core.molecular import (
    Atom,
    Bond,
    Conformer,
    InferenceRecord,
    MolecularWarning,
    NormalizedStructureV1,
)

ForceFieldName = Literal["auto", "mmff", "uff"]
all_chem: Any = AllChem


class InvalidLigandEditError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ForceFieldReport:
    force_field: Literal["MMFF", "UFF"]
    converged: bool
    iterations: int


@dataclass(frozen=True, slots=True)
class EditResult:
    structure: NormalizedStructureV1
    warnings: tuple[MolecularWarning, ...] = ()
    created_atom_ids: tuple[int, ...] = ()
    created_bond_ids: tuple[int, ...] = ()
    deleted_atom_ids: tuple[int, ...] = ()
    deleted_bond_ids: tuple[int, ...] = ()
    changed_atom_ids: tuple[int, ...] = ()
    force_field: ForceFieldReport | None = None


class MolecularEditor(Protocol):
    def add_atom(
        self,
        structure: NormalizedStructureV1,
        *,
        atom_id: int,
        element: str,
        formal_charge: int,
        coordinates: tuple[float, float, float],
    ) -> EditResult: ...


def _warning(
    code: str,
    message: str,
    operation: str,
    field: str,
    *,
    severity: Literal["info", "warning", "error"] = "warning",
) -> MolecularWarning:
    return MolecularWarning(
        code=code,
        message=message,
        operation=operation,
        field=field,
        severity=severity,
    )


class StructureValidator:
    def validate(
        self, structure: NormalizedStructureV1, operation: str
    ) -> tuple[MolecularWarning, ...]:
        if structure.structure_type != "ligand":
            raise InvalidLigandEditError("Ligand editing requires a ligand entry")
        mol = normalized_to_mol(structure)
        try:
            Chem.SanitizeMol(mol)
        except (ValueError, RuntimeError) as error:
            raise InvalidLigandEditError(
                f"Invalid valence or aromaticity after {operation}: {error}"
            ) from error
        warnings: list[MolecularWarning] = []
        coordinates = np.asarray(structure.active_coordinates, dtype=np.float64)
        if not np.all(np.isfinite(coordinates)):
            raise InvalidLigandEditError("Ligand coordinates must be finite")
        if len(coordinates) > 1:
            distances = np.linalg.norm(
                coordinates[:, np.newaxis, :] - coordinates[np.newaxis, :, :],
                axis=2,
            )
            np.fill_diagonal(distances, np.inf)
            if float(np.min(distances)) < 0.4:
                warnings.append(
                    _warning(
                        "severe_atomic_clash",
                        "Two atoms are closer than 0.4 angstrom after this edit.",
                        operation,
                        "coordinates",
                    )
                )
        return tuple(warnings)

    @staticmethod
    def stereochemistry(structure: NormalizedStructureV1) -> dict[int, str]:
        mol = normalized_to_mol(structure)
        Chem.SanitizeMol(mol)
        Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
        result: dict[int, str] = {}
        for atom, normalized_atom in zip(mol.GetAtoms(), structure.atoms, strict=True):
            if atom.HasProp("_CIPCode"):
                result[normalized_atom.id] = atom.GetProp("_CIPCode")
        return result

    def stereo_warnings(
        self,
        before: NormalizedStructureV1,
        after: NormalizedStructureV1,
        operation: str,
    ) -> tuple[MolecularWarning, ...]:
        before_stereo = self.stereochemistry(before)
        after_stereo = self.stereochemistry(after)
        common = set(before_stereo) & set(after_stereo)
        changed = sorted(
            atom_id for atom_id in common if before_stereo[atom_id] != after_stereo[atom_id]
        )
        lost = sorted(set(before_stereo) - set(after_stereo))
        gained = sorted(set(after_stereo) - set(before_stereo))
        if not (changed or lost or gained):
            return ()
        details = []
        if changed:
            details.append(f"changed centers {changed}")
        if lost:
            details.append(f"lost centers {lost}")
        if gained:
            details.append(f"new centers {gained}")
        return (
            _warning(
                "stereochemistry_changed",
                "Stereochemistry changed: " + "; ".join(details) + ".",
                operation,
                "stereochemistry",
            ),
        )


class RdkitLigandEditor:
    def __init__(self, validator: StructureValidator | None = None) -> None:
        self.validator = validator or StructureValidator()

    def add_atom(
        self,
        structure: NormalizedStructureV1,
        *,
        atom_id: int,
        element: str,
        formal_charge: int = 0,
        coordinates: tuple[float, float, float],
    ) -> EditResult:
        self._validate_new_id(structure, atom_id, is_atom=True)
        if not all(isfinite(value) for value in coordinates):
            raise InvalidLigandEditError("New atom coordinates must be finite")
        try:
            rd_atom = Chem.Atom(element)
        except RuntimeError as error:
            raise InvalidLigandEditError(f"Unknown chemical element: {element}") from error
        rd_atom.SetFormalCharge(formal_charge)
        rd_atom.SetIntProp("_MolWeaveAtomId", atom_id)
        mol = Chem.RWMol(normalized_to_mol(structure))
        index = int(mol.AddAtom(rd_atom))
        edited = mol.GetMol()
        for conformer in edited.GetConformers():
            conformer.SetAtomPosition(index, coordinates)
        return self._finish(
            structure,
            edited,
            "atom.add",
            created_atom_ids=(atom_id,),
        )

    def delete_atoms(
        self, structure: NormalizedStructureV1, atom_ids: list[int]
    ) -> EditResult:
        selected = self._atom_indices(structure, atom_ids)
        if len(selected) == len(structure.atoms):
            raise InvalidLigandEditError("A ligand edit cannot delete every atom")
        deleted_bonds = tuple(
            bond.id
            for bond in structure.bonds
            if bond.atom_1_id in atom_ids or bond.atom_2_id in atom_ids
        )
        mol = Chem.RWMol(normalized_to_mol(structure))
        for index in sorted(selected.values(), reverse=True):
            mol.RemoveAtom(index)
        return self._finish(
            structure,
            mol.GetMol(),
            "atom.delete",
            deleted_atom_ids=tuple(sorted(atom_ids)),
            deleted_bond_ids=deleted_bonds,
        )

    def add_bond(
        self,
        structure: NormalizedStructureV1,
        *,
        bond_id: int,
        atom_1_id: int,
        atom_2_id: int,
        order: float,
    ) -> EditResult:
        self._validate_new_id(structure, bond_id, is_atom=False)
        indices = self._atom_indices(structure, [atom_1_id, atom_2_id])
        if atom_1_id == atom_2_id:
            raise InvalidLigandEditError("Bond endpoints must differ")
        mol = Chem.RWMol(normalized_to_mol(structure))
        first, second = indices[atom_1_id], indices[atom_2_id]
        if mol.GetBondBetweenAtoms(first, second) is not None:
            raise InvalidLigandEditError("A bond already exists between those atoms")
        mol.AddBond(first, second, self._bond_type(order))
        bond = mol.GetBondBetweenAtoms(first, second)
        bond.SetIntProp("_MolWeaveBondId", bond_id)
        return self._finish(
            structure,
            mol.GetMol(),
            "bond.add",
            created_bond_ids=(bond_id,),
        )

    def delete_bond(self, structure: NormalizedStructureV1, bond_id: int) -> EditResult:
        bond = self._bond(structure, bond_id)
        indices = self._atom_indices(structure, [bond.atom_1_id, bond.atom_2_id])
        mol = Chem.RWMol(normalized_to_mol(structure))
        mol.RemoveBond(indices[bond.atom_1_id], indices[bond.atom_2_id])
        return self._finish(
            structure,
            mol.GetMol(),
            "bond.delete",
            deleted_bond_ids=(bond_id,),
        )

    def change_bond_order(
        self, structure: NormalizedStructureV1, bond_id: int, order: float
    ) -> EditResult:
        bond = self._bond(structure, bond_id)
        indices = self._atom_indices(structure, [bond.atom_1_id, bond.atom_2_id])
        mol = Chem.RWMol(normalized_to_mol(structure))
        rd_bond = mol.GetBondBetweenAtoms(indices[bond.atom_1_id], indices[bond.atom_2_id])
        rd_bond.SetBondType(self._bond_type(order))
        rd_bond.SetIsAromatic(order == 1.5)
        return self._finish(structure, mol.GetMol(), "bond.order")

    def change_element(
        self, structure: NormalizedStructureV1, atom_id: int, element: str
    ) -> EditResult:
        index = self._atom_indices(structure, [atom_id])[atom_id]
        try:
            atomic_number = Chem.GetPeriodicTable().GetAtomicNumber(element)
        except RuntimeError as error:
            raise InvalidLigandEditError(f"Unknown chemical element: {element}") from error
        mol = Chem.RWMol(normalized_to_mol(structure))
        mol.GetAtomWithIdx(index).SetAtomicNum(atomic_number)
        return self._finish(
            structure,
            mol.GetMol(),
            "atom.element",
            changed_atom_ids=(atom_id,),
        )

    def change_formal_charge(
        self, structure: NormalizedStructureV1, atom_id: int, formal_charge: int
    ) -> EditResult:
        index = self._atom_indices(structure, [atom_id])[atom_id]
        mol = Chem.RWMol(normalized_to_mol(structure))
        mol.GetAtomWithIdx(index).SetFormalCharge(formal_charge)
        return self._finish(
            structure,
            mol.GetMol(),
            "atom.charge",
            changed_atom_ids=(atom_id,),
        )

    def add_hydrogens(
        self,
        structure: NormalizedStructureV1,
        *,
        next_atom_id: int,
        next_bond_id: int,
        atom_ids: list[int] | None = None,
    ) -> EditResult:
        requested = atom_ids or [atom.id for atom in structure.atoms if atom.element != "H"]
        indices = self._atom_indices(structure, requested)
        mol = self._sanitized_mol(structure)
        before_count = mol.GetNumAtoms()
        before_bonds = mol.GetNumBonds()
        edited = Chem.AddHs(
            mol,
            addCoords=True,
            onlyOnAtoms=[indices[atom_id] for atom_id in requested],
        )
        created_atom_ids = tuple(
            range(next_atom_id, next_atom_id + edited.GetNumAtoms() - before_count)
        )
        created_bond_ids = tuple(
            range(next_bond_id, next_bond_id + edited.GetNumBonds() - before_bonds)
        )
        for atom, stable_id in zip(
            list(edited.GetAtoms())[before_count:], created_atom_ids, strict=True
        ):
            atom.SetIntProp("_MolWeaveAtomId", stable_id)
        original_bond_count = len(structure.bonds)
        for bond, stable_id in zip(
            list(edited.GetBonds())[original_bond_count:], created_bond_ids, strict=True
        ):
            bond.SetIntProp("_MolWeaveBondId", stable_id)
        if not created_atom_ids:
            raise InvalidLigandEditError("The selected atoms do not need additional hydrogens")
        inference = InferenceRecord(
            code="hydrogens_added",
            message="RDKit inferred explicit hydrogens from sanitized valence.",
            atom_ids=list(created_atom_ids),
            bond_ids=list(created_bond_ids),
        )
        return self._finish(
            structure,
            edited,
            "hydrogen.add",
            created_atom_ids=created_atom_ids,
            created_bond_ids=created_bond_ids,
            inference=inference,
        )

    def remove_hydrogens(
        self,
        structure: NormalizedStructureV1,
        atom_ids: list[int] | None = None,
    ) -> EditResult:
        hydrogens = [
            atom.id
            for atom in structure.atoms
            if atom.element == "H" and (atom_ids is None or atom.id in atom_ids)
        ]
        if not hydrogens:
            raise InvalidLigandEditError("No explicit hydrogens are selected for removal")
        return self.delete_atoms(structure, hydrogens)

    def rotate_bond(
        self,
        structure: NormalizedStructureV1,
        *,
        bond_id: int,
        movable_atom_ids: list[int],
        angle_degrees: float,
    ) -> EditResult:
        if not isfinite(angle_degrees) or angle_degrees % 360 == 0:
            raise InvalidLigandEditError("Bond rotation angle must be finite and non-zero")
        bond = self._bond(structure, bond_id)
        mol = self._sanitized_mol(structure)
        indices = self._atom_indices(structure, [bond.atom_1_id, bond.atom_2_id])
        rd_bond = mol.GetBondBetweenAtoms(indices[bond.atom_1_id], indices[bond.atom_2_id])
        if rd_bond.GetBondType() != Chem.BondType.SINGLE or rd_bond.GetIsAromatic():
            raise InvalidLigandEditError("Only non-aromatic single bonds can rotate")
        if rd_bond.IsInRing():
            raise InvalidLigandEditError("Ring bonds cannot rotate")
        components = self._cut_components(structure, bond)
        if any(len(component) <= 1 for component in components):
            raise InvalidLigandEditError("Terminal bond rotation is ambiguous")
        movable = set(movable_atom_ids)
        if movable not in components:
            raise InvalidLigandEditError(
                "The movable selection must define exactly one side of the cut bond"
            )
        first, second = bond.atom_1_id, bond.atom_2_id
        if first in movable:
            fixed_id, moving_axis_id = second, first
        else:
            fixed_id, moving_axis_id = first, second
        index_by_id = {atom.id: index for index, atom in enumerate(structure.atoms)}
        axis_start = np.asarray(
            structure.active_coordinates[index_by_id[fixed_id]], dtype=np.float64
        )
        axis_end = np.asarray(
            structure.active_coordinates[index_by_id[moving_axis_id]], dtype=np.float64
        )
        direction = axis_end - axis_start
        norm = float(np.linalg.norm(direction))
        if norm < 1e-12:
            raise InvalidLigandEditError("Bond axis has coincident endpoints")
        rotation = self._axis_rotation(direction / norm, radians(angle_degrees))
        conformers: list[Conformer] = []
        for conformer in structure.conformers:
            coordinates = np.asarray(conformer.coordinates, dtype=np.float64)
            conformer_start = coordinates[index_by_id[fixed_id]]
            for atom_id in movable:
                atom_index = index_by_id[atom_id]
                coordinates[atom_index] = (
                    rotation @ (coordinates[atom_index] - conformer_start)
                ) + conformer_start
            conformers.append(
                conformer.model_copy(
                    update={
                        "coordinates": [
                            tuple(float(value) for value in point) for point in coordinates
                        ]
                    }
                )
            )
        active = next(
            item.coordinates
            for item in conformers
            if item.id == structure.active_conformer_id
        )
        atoms = [
            atom.model_copy(update={"coordinates": active[index]})
            for index, atom in enumerate(structure.atoms)
        ]
        edited = structure.model_copy(update={"atoms": atoms, "conformers": conformers})
        warnings = (
            *self.validator.validate(edited, "bond.rotate"),
            *self.validator.stereo_warnings(structure, edited, "bond.rotate"),
        )
        return EditResult(
            structure=self._with_warnings(edited, warnings),
            warnings=warnings,
            changed_atom_ids=tuple(sorted(movable)),
        )

    def cleanup(
        self,
        structure: NormalizedStructureV1,
        *,
        force_field: ForceFieldName,
        max_iterations: int,
        atom_ids: list[int] | None = None,
    ) -> EditResult:
        if max_iterations < 1 or max_iterations > 10_000:
            raise InvalidLigandEditError("Cleanup iterations must be between 1 and 10000")
        selected_ids = atom_ids or [atom.id for atom in structure.atoms]
        selected_indices = set(self._atom_indices(structure, selected_ids).values())
        mol = self._sanitized_mol(structure)
        chosen: Literal["MMFF", "UFF"]
        properties: Any | None = None
        if force_field in {"auto", "mmff"} and all_chem.MMFFHasAllMoleculeParams(mol):
            chosen = "MMFF"
            properties = all_chem.MMFFGetMoleculeProperties(mol)
        elif force_field == "mmff":
            raise InvalidLigandEditError("MMFF parameters are unavailable for this ligand")
        elif force_field in {"auto", "uff"} and all_chem.UFFHasAllMoleculeParams(mol):
            chosen = "UFF"
        else:
            requested = "UFF" if force_field == "uff" else "MMFF and UFF"
            raise InvalidLigandEditError(f"{requested} parameters are unavailable for this ligand")
        warnings: list[MolecularWarning] = []
        if force_field == "auto" and chosen == "UFF":
            warnings.append(
                _warning(
                    "force_field_fallback",
                    "MMFF parameters were unavailable; cleanup used UFF.",
                    "coordinates.cleanup",
                    "force_field",
                    severity="info",
                )
            )
        converged = True
        for conformer in mol.GetConformers():
            if chosen == "MMFF":
                field = all_chem.MMFFGetMoleculeForceField(
                    mol, properties, confId=conformer.GetId()
                )
            else:
                field = all_chem.UFFGetMoleculeForceField(
                    mol, confId=conformer.GetId()
                )
            for index in range(mol.GetNumAtoms()):
                if index not in selected_indices:
                    field.AddFixedPoint(index)
            field.Initialize()
            if int(field.Minimize(maxIts=max_iterations)) != 0:
                converged = False
        if not converged:
            warnings.append(
                _warning(
                    "minimization_not_converged",
                    f"{chosen} did not converge within {max_iterations} iterations.",
                    "coordinates.cleanup",
                    "coordinates",
                )
            )
        result = self._finish(
            structure,
            mol,
            "coordinates.cleanup",
            extra_warnings=tuple(warnings),
            changed_atom_ids=tuple(sorted(selected_ids)),
        )
        return EditResult(
            structure=result.structure,
            warnings=result.warnings,
            changed_atom_ids=result.changed_atom_ids,
            force_field=ForceFieldReport(chosen, converged, max_iterations),
        )

    def _finish(
        self,
        before: NormalizedStructureV1,
        mol: Any,
        operation: str,
        *,
        created_atom_ids: tuple[int, ...] = (),
        created_bond_ids: tuple[int, ...] = (),
        deleted_atom_ids: tuple[int, ...] = (),
        deleted_bond_ids: tuple[int, ...] = (),
        changed_atom_ids: tuple[int, ...] = (),
        inference: InferenceRecord | None = None,
        extra_warnings: tuple[MolecularWarning, ...] = (),
    ) -> EditResult:
        after = self._from_mol(before, mol, inference)
        warnings = (
            *self.validator.validate(after, operation),
            *self.validator.stereo_warnings(before, after, operation),
            *extra_warnings,
        )
        after = self._with_warnings(after, warnings)
        return EditResult(
            structure=after,
            warnings=warnings,
            created_atom_ids=created_atom_ids,
            created_bond_ids=created_bond_ids,
            deleted_atom_ids=deleted_atom_ids,
            deleted_bond_ids=deleted_bond_ids,
            changed_atom_ids=changed_atom_ids,
        )

    @staticmethod
    def _sanitized_mol(structure: NormalizedStructureV1) -> Any:
        mol = normalized_to_mol(structure)
        try:
            Chem.SanitizeMol(mol)
        except (ValueError, RuntimeError) as error:
            raise InvalidLigandEditError(
                f"The current ligand has invalid valence or aromaticity: {error}"
            ) from error
        return mol

    @staticmethod
    def _from_mol(
        before: NormalizedStructureV1,
        mol: Any,
        inference: InferenceRecord | None,
    ) -> NormalizedStructureV1:
        Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
        before_atoms = {atom.id: atom for atom in before.atoms}
        before_bonds = {bond.id: bond for bond in before.bonds}
        atom_ids: list[int] = []
        for atom in mol.GetAtoms():
            if not atom.HasProp("_MolWeaveAtomId"):
                raise InvalidLigandEditError("Edited atom is missing a stable identity")
            atom_ids.append(int(atom.GetIntProp("_MolWeaveAtomId")))
        order = sorted(range(len(atom_ids)), key=atom_ids.__getitem__)
        conformers = [
            Conformer(
                id=index + 1,
                name=(
                    before.conformers[index].name
                    if index < len(before.conformers)
                    else f"Conformer {index + 1}"
                ),
                coordinates=[
                    tuple(
                        float(value)
                        for value in (
                            rd_conformer.GetAtomPosition(rd_index).x,
                            rd_conformer.GetAtomPosition(rd_index).y,
                            rd_conformer.GetAtomPosition(rd_index).z,
                        )
                    )
                    for rd_index in order
                ],
            )
            for index, rd_conformer in enumerate(mol.GetConformers())
        ]
        if not conformers:
            conformers = [
                Conformer(
                    id=1,
                    name="Missing coordinates",
                    coordinates=[(0.0, 0.0, 0.0) for _ in atom_ids],
                )
            ]
        active_index = min(before.active_conformer_id - 1, len(conformers) - 1)
        active = conformers[active_index].coordinates
        new_atom_residue_id = (
            before.residues[0].id
            if before.structure_type == "ligand" and len(before.residues) == 1
            else None
        )
        atoms: list[Atom] = []
        for sorted_index, rd_index in enumerate(order):
            rd_atom = mol.GetAtomWithIdx(rd_index)
            atom_id = atom_ids[rd_index]
            existing = before_atoms.get(atom_id)
            chiral = str(rd_atom.GetChiralTag())
            atoms.append(
                Atom(
                    id=atom_id,
                    name=existing.name if existing else f"{rd_atom.GetSymbol()}{atom_id}",
                    element=rd_atom.GetSymbol(),
                    coordinates=active[sorted_index],
                    residue_id=(
                        existing.residue_id if existing else new_atom_residue_id
                    ),
                    formal_charge=int(rd_atom.GetFormalCharge()),
                    source_index=(
                        existing.source_index
                        if existing
                        else max((item.source_index for item in before.atoms), default=-1)
                        + sorted_index
                        + 1
                    ),
                    alternate_location=existing.alternate_location if existing else None,
                    occupancy=existing.occupancy if existing else None,
                    b_factor=existing.b_factor if existing else None,
                    stereo=(
                        chiral.removeprefix("CHI_")
                        if chiral != "CHI_UNSPECIFIED"
                        else None
                    ),
                    inferred_fields=(
                        existing.inferred_fields if existing else ["element", "coordinates"]
                    ),
                )
            )
        bonds: list[Bond] = []
        for rd_bond in mol.GetBonds():
            if not rd_bond.HasProp("_MolWeaveBondId"):
                raise InvalidLigandEditError("Edited bond is missing a stable identity")
            bond_id = int(rd_bond.GetIntProp("_MolWeaveBondId"))
            existing_bond = before_bonds.get(bond_id)
            stereo = str(rd_bond.GetStereo())
            bonds.append(
                Bond(
                    id=bond_id,
                    atom_1_id=atom_ids[rd_bond.GetBeginAtomIdx()],
                    atom_2_id=atom_ids[rd_bond.GetEndAtomIdx()],
                    order=float(rd_bond.GetBondTypeAsDouble()),
                    aromatic=bool(rd_bond.GetIsAromatic()),
                    stereo=(
                        stereo.removeprefix("STEREO")
                        if stereo != "STEREONONE"
                        else None
                    ),
                    inferred=existing_bond.inferred if existing_bond else inference is not None,
                )
            )
        bonds.sort(key=lambda item: item.id)
        metadata = dict(before.metadata)
        metadata["canonical_smiles"] = Chem.MolToSmiles(
            mol, canonical=True, isomericSmiles=True
        )
        return before.model_copy(
            update={
                "active_conformer_id": active_index + 1,
                "atoms": atoms,
                "bonds": bonds,
                "conformers": conformers,
                "metadata": metadata,
                "inferences": [
                    *before.inferences,
                    *([inference] if inference is not None else []),
                ],
            }
        )

    @staticmethod
    def _with_warnings(
        structure: NormalizedStructureV1, warnings: tuple[MolecularWarning, ...]
    ) -> NormalizedStructureV1:
        return structure.model_copy(update={"warnings": [*structure.warnings, *warnings]})

    @staticmethod
    def _atom_indices(
        structure: NormalizedStructureV1, atom_ids: list[int]
    ) -> dict[int, int]:
        if not atom_ids or len(atom_ids) != len(set(atom_ids)):
            raise InvalidLigandEditError("Atom IDs must be a non-empty unique list")
        index_by_id = {atom.id: index for index, atom in enumerate(structure.atoms)}
        missing = sorted(set(atom_ids) - set(index_by_id))
        if missing:
            raise InvalidLigandEditError(f"Atom IDs are missing from the ligand: {missing}")
        return {atom_id: index_by_id[atom_id] for atom_id in atom_ids}

    @staticmethod
    def _bond(structure: NormalizedStructureV1, bond_id: int) -> Bond:
        bond = next((item for item in structure.bonds if item.id == bond_id), None)
        if bond is None:
            raise InvalidLigandEditError(f"Bond {bond_id} is missing from the ligand")
        return bond

    @staticmethod
    def _bond_type(order: float) -> Any:
        types = {
            1.0: Chem.BondType.SINGLE,
            1.5: Chem.BondType.AROMATIC,
            2.0: Chem.BondType.DOUBLE,
            3.0: Chem.BondType.TRIPLE,
        }
        if order not in types:
            raise InvalidLigandEditError("Bond order must be 1, 1.5, 2, or 3")
        return types[order]

    @staticmethod
    def _validate_new_id(
        structure: NormalizedStructureV1, stable_id: int, *, is_atom: bool
    ) -> None:
        existing = structure.atoms if is_atom else structure.bonds
        label = "Atom" if is_atom else "Bond"
        if stable_id < 1 or any(item.id == stable_id for item in existing):
            raise InvalidLigandEditError(f"{label} ID must be new and positive")
        if existing and stable_id <= max(item.id for item in existing):
            raise InvalidLigandEditError(f"{label} ID must increase monotonically")

    @staticmethod
    def _cut_components(structure: NormalizedStructureV1, cut: Bond) -> list[set[int]]:
        adjacency: dict[int, set[int]] = {
            atom.id: set() for atom in structure.atoms
        }
        for bond in structure.bonds:
            if bond.id == cut.id:
                continue
            adjacency[bond.atom_1_id].add(bond.atom_2_id)
            adjacency[bond.atom_2_id].add(bond.atom_1_id)

        def component(seed: int) -> set[int]:
            found: set[int] = set()
            pending = [seed]
            while pending:
                atom_id = pending.pop()
                if atom_id in found:
                    continue
                found.add(atom_id)
                pending.extend(adjacency[atom_id] - found)
            return found

        sides = [component(cut.atom_1_id), component(cut.atom_2_id)]
        if sides[0] & sides[1]:
            raise InvalidLigandEditError("Ring bonds cannot rotate")
        return sides

    @staticmethod
    def _axis_rotation(axis: np.ndarray[Any, np.dtype[np.float64]], angle: float) -> np.ndarray:
        x, y, z = axis
        c = cos(angle)
        s = sin(angle)
        one_minus_c = 1 - c
        return np.asarray(
            [
                [c + x * x * one_minus_c, x * y * one_minus_c - z * s, x * z * one_minus_c + y * s],
                [y * x * one_minus_c + z * s, c + y * y * one_minus_c, y * z * one_minus_c - x * s],
                [z * x * one_minus_c - y * s, z * y * one_minus_c + x * s, c + z * z * one_minus_c],
            ],
            dtype=np.float64,
        )
