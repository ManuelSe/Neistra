from __future__ import annotations

from dataclasses import dataclass
from io import StringIO
from math import isfinite
from typing import Any, Literal

import numpy as np
from openmm import Platform, unit
from pdbfixer import PDBFixer

from molweave_core.adapters.macromolecular import PdbAdapter
from molweave_core.molecular import (
    Atom,
    Bond,
    Chain,
    Conformer,
    InferenceRecord,
    MolecularWarning,
    NormalizedStructureV1,
    Residue,
)

STANDARD_AMINO_ACIDS = frozenset(
    {
        "ALA",
        "ARG",
        "ASN",
        "ASP",
        "CYS",
        "GLN",
        "GLU",
        "GLY",
        "HIS",
        "ILE",
        "LEU",
        "LYS",
        "MET",
        "PHE",
        "PRO",
        "SER",
        "THR",
        "TRP",
        "TYR",
        "VAL",
    }
)
BACKBONE_ATOMS = frozenset({"N", "CA", "C", "O"})
ProteinComponent = Literal["water", "ion"]


class InvalidProteinEditError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ProteinEditResult:
    structure: NormalizedStructureV1
    warnings: tuple[MolecularWarning, ...] = ()
    created_atom_ids: tuple[int, ...] = ()
    created_bond_ids: tuple[int, ...] = ()
    deleted_atom_ids: tuple[int, ...] = ()
    deleted_bond_ids: tuple[int, ...] = ()
    changed_atom_ids: tuple[int, ...] = ()
    changed_residue_ids: tuple[int, ...] = ()
    deleted_residue_ids: tuple[int, ...] = ()
    changed_chain_ids: tuple[int, ...] = ()
    deleted_chain_ids: tuple[int, ...] = ()


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


class ProteinStructureValidator:
    def validate(
        self,
        structure: NormalizedStructureV1,
        operation: str,
    ) -> tuple[MolecularWarning, ...]:
        if structure.structure_type not in {"protein", "complex"}:
            raise InvalidProteinEditError(
                "Protein editing requires an entry classified as protein or complex"
            )
        coordinates = np.asarray(structure.active_coordinates, dtype=np.float64)
        if not np.all(np.isfinite(coordinates)):
            raise InvalidProteinEditError("Protein coordinates must be finite")
        residue_by_id = {residue.id: residue for residue in structure.residues}
        chain_by_id = {chain.id: chain for chain in structure.chains}
        seen: set[tuple[str, int | None, str, str, str]] = set()
        for atom in structure.atoms:
            residue = residue_by_id.get(atom.residue_id or -1)
            if residue is None:
                raise InvalidProteinEditError(
                    f"Atom {atom.id} has no valid residue hierarchy"
                )
            chain = chain_by_id.get(residue.chain_id)
            if chain is None:
                raise InvalidProteinEditError(
                    f"Residue {residue.id} has no valid chain hierarchy"
                )
            identity = (
                chain.name,
                residue.author_number,
                residue.insertion_code or "",
                atom.name,
                atom.alternate_location or "",
            )
            if identity in seen:
                raise InvalidProteinEditError(
                    "Protein hierarchy contains an ambiguous duplicate atom identity"
                )
            seen.add(identity)

        warnings: list[MolecularWarning] = []
        unsupported = sorted(
            {
                residue.name
                for residue in structure.residues
                if residue.component_type == "polymer"
                and residue.name.upper() not in STANDARD_AMINO_ACIDS
            }
        )
        if unsupported:
            warnings.append(
                _warning(
                    "unsupported_protein_residues",
                    "Unsupported polymer residues remain present: "
                    + ", ".join(unsupported)
                    + ".",
                    operation,
                    "residues.name",
                )
            )
        if len(coordinates) > 1:
            distances = np.linalg.norm(
                coordinates[:, np.newaxis, :] - coordinates[np.newaxis, :, :],
                axis=2,
            )
            np.fill_diagonal(distances, np.inf)
            minimum = float(np.min(distances))
            if minimum < 0.4:
                warnings.append(
                    _warning(
                        "severe_atomic_clash",
                        (
                            "Two protein atoms are closer than 0.4 angstrom "
                            f"after {operation}."
                        ),
                        operation,
                        "coordinates",
                    )
                )
        return tuple(warnings)


class PdbfixerProteinEditor:
    def __init__(
        self,
        validator: ProteinStructureValidator | None = None,
    ) -> None:
        self.validator = validator or ProteinStructureValidator()

    def delete_atoms(
        self,
        structure: NormalizedStructureV1,
        atom_ids: list[int],
    ) -> ProteinEditResult:
        requested = self._atom_ids(structure, atom_ids)
        return self._delete(structure, requested, "protein.atom.delete")

    def delete_residues(
        self,
        structure: NormalizedStructureV1,
        residue_ids: list[int],
    ) -> ProteinEditResult:
        requested = self._residue_ids(structure, residue_ids)
        atom_ids = {
            atom.id for atom in structure.atoms if atom.residue_id in requested
        }
        return self._delete(structure, atom_ids, "protein.residue.delete")

    def delete_chains(
        self,
        structure: NormalizedStructureV1,
        chain_ids: list[int],
    ) -> ProteinEditResult:
        requested = self._chain_ids(structure, chain_ids)
        residue_ids = {
            residue.id
            for residue in structure.residues
            if residue.chain_id in requested
        }
        atom_ids = {
            atom.id for atom in structure.atoms if atom.residue_id in residue_ids
        }
        return self._delete(structure, atom_ids, "protein.chain.delete")

    def delete_components(
        self,
        structure: NormalizedStructureV1,
        component: ProteinComponent,
    ) -> ProteinEditResult:
        residue_ids = {
            residue.id
            for residue in structure.residues
            if residue.component_type == component
        }
        if not residue_ids:
            raise InvalidProteinEditError(
                f"The protein contains no {component} residues to delete"
            )
        atom_ids = {
            atom.id for atom in structure.atoms if atom.residue_id in residue_ids
        }
        return self._delete(
            structure,
            atom_ids,
            f"protein.{component}.delete",
        )

    def rename_chain(
        self,
        structure: NormalizedStructureV1,
        chain_id: int,
        name: str,
    ) -> ProteinEditResult:
        self._ensure_protein(structure)
        normalized = name.strip()
        if not normalized:
            raise InvalidProteinEditError("Chain name must not be blank")
        chain = next((item for item in structure.chains if item.id == chain_id), None)
        if chain is None:
            raise InvalidProteinEditError(f"Chain {chain_id} is missing from the protein")
        if chain.name == normalized:
            raise InvalidProteinEditError("The chain already has that name")
        if any(item.id != chain_id and item.name == normalized for item in structure.chains):
            raise InvalidProteinEditError("Chain names must be unique within an entry")
        updated = [
            item.model_copy(update={"name": normalized})
            if item.id == chain_id
            else item
            for item in structure.chains
        ]
        warnings: list[MolecularWarning] = []
        if len(normalized) > 1:
            warnings.append(
                _warning(
                    "chain_name_not_pdb_compatible",
                    (
                        f"Chain name {normalized!r} requires PDBx/mmCIF; "
                        "PDB export retains only one character."
                    ),
                    "protein.chain.rename",
                    "chains.name",
                )
            )
        return self._finish(
            structure,
            structure.model_copy(update={"chains": updated}),
            "protein.chain.rename",
            extra_warnings=tuple(warnings),
            changed_chain_ids=(chain_id,),
        )

    def renumber_residues(
        self,
        structure: NormalizedStructureV1,
        chain_id: int,
        *,
        start: int,
        step: int = 1,
    ) -> ProteinEditResult:
        self._ensure_protein(structure)
        if step == 0:
            raise InvalidProteinEditError("Residue numbering step must not be zero")
        chain = next((item for item in structure.chains if item.id == chain_id), None)
        if chain is None:
            raise InvalidProteinEditError(f"Chain {chain_id} is missing from the protein")
        targets = [
            residue
            for residue in structure.residues
            if residue.chain_id == chain_id
        ]
        if not targets:
            raise InvalidProteinEditError("The selected chain has no residues")
        changed = tuple(residue.id for residue in targets)
        next_number = start
        updated: list[Residue] = []
        cleared_insertions = False
        for residue in structure.residues:
            if residue.chain_id != chain_id:
                updated.append(residue)
                continue
            cleared_insertions = cleared_insertions or residue.insertion_code is not None
            updated.append(
                residue.model_copy(
                    update={
                        "author_number": next_number,
                        "insertion_code": None,
                    }
                )
            )
            next_number += step
        warnings = (
            (
                _warning(
                    "insertion_codes_cleared",
                    "Author residue renumbering cleared insertion codes in the chain.",
                    "protein.residue.renumber",
                    "residues.insertion_code",
                ),
            )
            if cleared_insertions
            else ()
        )
        return self._finish(
            structure,
            structure.model_copy(update={"residues": updated}),
            "protein.residue.renumber",
            extra_warnings=warnings,
            changed_residue_ids=changed,
            changed_chain_ids=(chain_id,),
        )

    def mutate_residue(
        self,
        structure: NormalizedStructureV1,
        residue_id: int,
        target_name: str,
        *,
        next_atom_id: int,
        next_bond_id: int,
    ) -> ProteinEditResult:
        self._ensure_template_compatible(structure)
        residue = self._residue(structure, residue_id)
        if residue.component_type != "polymer":
            raise InvalidProteinEditError("Only polymer amino-acid residues can mutate")
        source_name = residue.name.upper()
        target = target_name.strip().upper()
        if source_name not in STANDARD_AMINO_ACIDS:
            raise InvalidProteinEditError(
                f"Residue {residue.id} ({residue.name}) is not a supported standard amino acid"
            )
        if target not in STANDARD_AMINO_ACIDS:
            raise InvalidProteinEditError(
                "Mutation target must be one of the 20 standard amino acids"
            )
        if source_name == target:
            raise InvalidProteinEditError("The residue already has that amino-acid type")
        if residue.insertion_code:
            raise InvalidProteinEditError(
                "PDBFixer mutation does not support residues with insertion codes"
            )
        names = {
            atom.name
            for atom in structure.atoms
            if atom.residue_id == residue.id
        }
        missing_anchors = sorted({"N", "CA", "C"} - names)
        if missing_anchors:
            raise InvalidProteinEditError(
                "Mutation requires unambiguous backbone anchors N, CA, and C; "
                f"missing {missing_anchors}"
            )
        chain = self._chain_for_residue(structure, residue)
        fixer = self._fixer(structure)
        try:
            fixer.applyMutations(
                [f"{source_name}-{residue.author_number}-{target}"],
                chain.name,
            )
            fixer.findMissingResidues()
            fixer.findMissingAtoms()
            target_output = self._fixer_residue(fixer, chain.name, residue)
            fixer.missingAtoms = {
                item: atoms
                for item, atoms in fixer.missingAtoms.items()
                if item == target_output
            }
            fixer.missingTerminals = {
                item: atoms
                for item, atoms in fixer.missingTerminals.items()
                if item == target_output
            }
            fixer.missingResidues = {}
            fixer.addMissingAtoms(seed=0)
        except (KeyError, RuntimeError, ValueError) as error:
            raise InvalidProteinEditError(
                f"PDBFixer could not build the {target} template: {error}"
            ) from error
        target_output = self._fixer_residue(fixer, chain.name, residue)
        if target_output.name != target:
            raise InvalidProteinEditError(
                "PDBFixer returned an unexpected residue template identity"
            )
        result = self._merge_fixer(
            structure,
            fixer,
            residue_ids={residue.id},
            next_atom_id=next_atom_id,
            next_bond_id=next_bond_id,
            operation="protein.residue.mutate",
            residue_names={residue.id: target},
            inference_code="residue_template_applied",
            inference_message=(
                f"PDBFixer {target} template atoms and coordinates were inferred "
                f"for residue {residue.id}."
            ),
        )
        terminal = self._is_terminal_polymer_residue(structure, residue)
        missing_backbone = sorted(BACKBONE_ATOMS - names)
        extra = [
            _warning(
                "side_chain_not_optimized",
                (
                    "The deterministic template side chain was not searched across "
                    "rotamers or globally optimized."
                ),
                "protein.residue.mutate",
                "residues.name",
            )
        ]
        if terminal:
            extra.append(
                _warning(
                    "terminal_residue_mutation",
                    "The mutated residue is a chain terminus; terminal chemistry may need review.",
                    "protein.residue.mutate",
                    "residues",
                )
            )
        if missing_backbone:
            extra.append(
                _warning(
                    "missing_template_atoms_added",
                    f"Missing backbone template atoms were inferred: {missing_backbone}.",
                    "protein.residue.mutate",
                    "atoms",
                )
            )
        return self._append_result_warnings(result, tuple(extra))

    def add_hydrogens(
        self,
        structure: NormalizedStructureV1,
        *,
        next_atom_id: int,
        next_bond_id: int,
        residue_ids: list[int] | None = None,
        ph: float = 7.0,
    ) -> ProteinEditResult:
        self._ensure_template_compatible(structure)
        if not isfinite(ph) or not 0.0 <= ph <= 14.0:
            raise InvalidProteinEditError("Hydrogen placement pH must be between 0 and 14")
        polymer = [
            residue
            for residue in structure.residues
            if residue.component_type == "polymer"
        ]
        unsupported = sorted(
            {
                residue.name
                for residue in polymer
                if residue.name.upper() not in STANDARD_AMINO_ACIDS
            }
        )
        if unsupported:
            raise InvalidProteinEditError(
                "Protein hydrogen placement cannot map unsupported residues: "
                + ", ".join(unsupported)
            )
        requested = (
            self._residue_ids(structure, residue_ids)
            if residue_ids is not None
            else {residue.id for residue in polymer}
        )
        nonpolymer = sorted(
            residue_id
            for residue_id in requested
            if self._residue(structure, residue_id).component_type != "polymer"
        )
        if nonpolymer:
            raise InvalidProteinEditError(
                f"Hydrogens can only be placed on polymer residues: {nonpolymer}"
            )
        fixer = self._fixer(structure)
        try:
            fixer.addMissingHydrogens(pH=ph)
        except (KeyError, RuntimeError, ValueError) as error:
            raise InvalidProteinEditError(
                f"PDBFixer could not place protein hydrogens: {error}"
            ) from error
        result = self._merge_fixer(
            structure,
            fixer,
            residue_ids=requested,
            next_atom_id=next_atom_id,
            next_bond_id=next_bond_id,
            operation="protein.hydrogen.add",
            residue_names={},
            inference_code="protein_hydrogens_added",
            inference_message=(
                f"PDBFixer inferred explicit protein hydrogens at pH {ph:g}."
            ),
            only_new_hydrogens=True,
        )
        if not result.created_atom_ids:
            raise InvalidProteinEditError(
                "The selected protein residues do not need additional hydrogens"
            )
        terminal_ids = sorted(
            residue.id
            for residue in polymer
            if residue.id in requested
            and self._is_terminal_polymer_residue(structure, residue)
        )
        extra = [
            _warning(
                "hydrogen_placement_ph_dependent",
                (
                    f"Hydrogens were inferred at pH {ph:g} from standard residue "
                    "rules, not a complete protonation-state calculation."
                ),
                "protein.hydrogen.add",
                "atoms",
            )
        ]
        if terminal_ids:
            extra.append(
                _warning(
                    "terminal_hydrogen_placement",
                    (
                        "Hydrogen placement included chain termini "
                        f"{terminal_ids}; terminal states require review."
                    ),
                    "protein.hydrogen.add",
                    "residues",
                )
            )
        return self._append_result_warnings(result, tuple(extra))

    def remove_hydrogens(
        self,
        structure: NormalizedStructureV1,
        residue_ids: list[int] | None = None,
    ) -> ProteinEditResult:
        requested = (
            self._residue_ids(structure, residue_ids)
            if residue_ids is not None
            else {residue.id for residue in structure.residues}
        )
        hydrogens = {
            atom.id
            for atom in structure.atoms
            if atom.element.upper() == "H" and atom.residue_id in requested
        }
        if not hydrogens:
            raise InvalidProteinEditError(
                "No explicit protein hydrogens are selected for removal"
            )
        return self._delete(
            structure,
            hydrogens,
            "protein.hydrogen.remove",
        )

    def _delete(
        self,
        structure: NormalizedStructureV1,
        deleted_atom_ids: set[int],
        operation: str,
    ) -> ProteinEditResult:
        self._ensure_protein(structure)
        if len(deleted_atom_ids) == len(structure.atoms):
            raise InvalidProteinEditError("A protein edit cannot delete every atom")
        deleted_bond_ids = {
            bond.id
            for bond in structure.bonds
            if bond.atom_1_id in deleted_atom_ids
            or bond.atom_2_id in deleted_atom_ids
        }
        retained_atoms = [
            atom for atom in structure.atoms if atom.id not in deleted_atom_ids
        ]
        retained_residue_ids = {
            atom.residue_id for atom in retained_atoms if atom.residue_id is not None
        }
        deleted_residue_ids = {
            residue.id
            for residue in structure.residues
            if residue.id not in retained_residue_ids
        }
        retained_residues = [
            residue
            for residue in structure.residues
            if residue.id in retained_residue_ids
        ]
        retained_chain_ids = {residue.chain_id for residue in retained_residues}
        deleted_chain_ids = {
            chain.id
            for chain in structure.chains
            if chain.id not in retained_chain_ids
        }
        retained_chains = [
            chain for chain in structure.chains if chain.id in retained_chain_ids
        ]
        retained_bonds = [
            bond for bond in structure.bonds if bond.id not in deleted_bond_ids
        ]
        index_by_id = {atom.id: index for index, atom in enumerate(structure.atoms)}
        conformers = [
            conformer.model_copy(
                update={
                    "coordinates": [
                        conformer.coordinates[index_by_id[atom.id]]
                        for atom in retained_atoms
                    ]
                }
            )
            for conformer in structure.conformers
        ]
        active_index = next(
            index
            for index, conformer in enumerate(conformers)
            if conformer.id == structure.active_conformer_id
        )
        active = conformers[active_index].coordinates
        retained_atoms = [
            atom.model_copy(update={"coordinates": active[index]})
            for index, atom in enumerate(retained_atoms)
        ]
        edited = structure.model_copy(
            update={
                "atoms": retained_atoms,
                "bonds": retained_bonds,
                "residues": retained_residues,
                "chains": retained_chains,
                "conformers": conformers,
            }
        )
        return self._finish(
            structure,
            edited,
            operation,
            deleted_atom_ids=tuple(sorted(deleted_atom_ids)),
            deleted_bond_ids=tuple(sorted(deleted_bond_ids)),
            deleted_residue_ids=tuple(sorted(deleted_residue_ids)),
            deleted_chain_ids=tuple(sorted(deleted_chain_ids)),
        )

    def _merge_fixer(
        self,
        before: NormalizedStructureV1,
        fixer: Any,
        *,
        residue_ids: set[int],
        next_atom_id: int,
        next_bond_id: int,
        operation: str,
        residue_names: dict[int, str],
        inference_code: str,
        inference_message: str,
        only_new_hydrogens: bool = False,
    ) -> ProteinEditResult:
        residue_map = self._fixer_residue_map(before, fixer)
        before_atoms_by_residue_name: dict[tuple[int, str], Atom] = {}
        for atom in before.atoms:
            if atom.residue_id is not None:
                key = (atom.residue_id, atom.name)
                if key in before_atoms_by_residue_name:
                    raise InvalidProteinEditError(
                        "Protein template mapping found duplicate atom names in one residue"
                    )
                before_atoms_by_residue_name[key] = atom

        output_atoms = list(fixer.topology.atoms())
        output_positions = fixer.positions.value_in_unit(unit.angstrom)
        output_to_id: dict[Any, int] = {}
        output_coordinates: dict[int, tuple[float, float, float]] = {}
        created_atoms: list[Atom] = []
        created_atom_ids: list[int] = []
        next_source_index = max(
            (atom.source_index for atom in before.atoms),
            default=-1,
        ) + 1

        for output_atom, position in zip(
            output_atoms,
            output_positions,
            strict=True,
        ):
            residue_id = residue_map[output_atom.residue]
            existing = before_atoms_by_residue_name.get(
                (residue_id, output_atom.name)
            )
            if existing is not None:
                output_to_id[output_atom] = existing.id
                output_coordinates[existing.id] = existing.coordinates
                continue
            if residue_id not in residue_ids:
                continue
            element = output_atom.element.symbol if output_atom.element else ""
            if only_new_hydrogens and element.upper() != "H":
                continue
            atom_id = next_atom_id + len(created_atom_ids)
            coordinates = (
                float(position[0]),
                float(position[1]),
                float(position[2]),
            )
            output_to_id[output_atom] = atom_id
            output_coordinates[atom_id] = coordinates
            created_atom_ids.append(atom_id)
            created_atoms.append(
                Atom(
                    id=atom_id,
                    name=output_atom.name,
                    element=element,
                    coordinates=coordinates,
                    residue_id=residue_id,
                    formal_charge=None,
                    source_index=next_source_index + len(created_atoms),
                    occupancy=1.0,
                    b_factor=0.0,
                    inferred_fields=["element", "coordinates", "template"],
                )
            )

        retained_atoms = [
            atom
            for atom in before.atoms
            if atom.residue_id not in residue_ids
            or (atom.residue_id, atom.name)
            in {
                (
                    residue_map[output_atom.residue],
                    output_atom.name,
                )
                for output_atom in output_atoms
                if output_atom.residue in residue_map
            }
        ]
        if only_new_hydrogens:
            retained_atoms = list(before.atoms)
        retained_atom_ids = {atom.id for atom in retained_atoms}
        deleted_atom_ids = sorted(
            atom.id
            for atom in before.atoms
            if atom.id not in retained_atom_ids
        )
        atoms = sorted([*retained_atoms, *created_atoms], key=lambda atom: atom.id)

        existing_bonds = [
            bond
            for bond in before.bonds
            if bond.atom_1_id in {atom.id for atom in atoms}
            and bond.atom_2_id in {atom.id for atom in atoms}
        ]
        existing_pairs = {
            frozenset((bond.atom_1_id, bond.atom_2_id)) for bond in existing_bonds
        }
        created_bonds: list[Bond] = []
        for first, second in fixer.topology.bonds():
            if first not in output_to_id or second not in output_to_id:
                continue
            first_id = output_to_id[first]
            second_id = output_to_id[second]
            if (
                first.residue not in residue_map
                or second.residue not in residue_map
            ):
                continue
            first_residue_id = residue_map[first.residue]
            second_residue_id = residue_map[second.residue]
            if not ({first_residue_id, second_residue_id} & residue_ids):
                continue
            pair = frozenset((first_id, second_id))
            if pair in existing_pairs:
                continue
            bond_id = next_bond_id + len(created_bonds)
            created_bonds.append(
                Bond(
                    id=bond_id,
                    atom_1_id=min(first_id, second_id),
                    atom_2_id=max(first_id, second_id),
                    order=None,
                    inferred=True,
                )
            )
            existing_pairs.add(pair)
        bonds = sorted([*existing_bonds, *created_bonds], key=lambda bond: bond.id)
        deleted_bond_ids = sorted(
            bond.id
            for bond in before.bonds
            if bond.id not in {item.id for item in existing_bonds}
        )

        coordinate_by_id = {
            atom.id: output_coordinates.get(atom.id, atom.coordinates)
            for atom in atoms
        }
        conformer = Conformer(
            id=before.active_conformer_id,
            name=before.conformers[0].name,
            coordinates=[coordinate_by_id[atom.id] for atom in atoms],
        )
        atoms = [
            atom.model_copy(update={"coordinates": coordinate_by_id[atom.id]})
            for atom in atoms
        ]
        residues = [
            residue.model_copy(update={"name": residue_names[residue.id]})
            if residue.id in residue_names
            else residue
            for residue in before.residues
        ]
        inference = InferenceRecord(
            code=inference_code,
            message=inference_message,
            atom_ids=created_atom_ids,
            bond_ids=[bond.id for bond in created_bonds],
        )
        edited = before.model_copy(
            update={
                "atoms": atoms,
                "bonds": bonds,
                "residues": residues,
                "conformers": [conformer],
                "inferences": [*before.inferences, inference],
            }
        )
        changed_atom_ids = sorted(
            atom.id for atom in atoms if atom.residue_id in residue_ids
        )
        return self._finish(
            before,
            edited,
            operation,
            created_atom_ids=tuple(created_atom_ids),
            created_bond_ids=tuple(bond.id for bond in created_bonds),
            deleted_atom_ids=tuple(deleted_atom_ids),
            deleted_bond_ids=tuple(deleted_bond_ids),
            changed_atom_ids=tuple(changed_atom_ids),
            changed_residue_ids=tuple(sorted(residue_ids)),
        )

    def _finish(
        self,
        before: NormalizedStructureV1,
        after: NormalizedStructureV1,
        operation: str,
        *,
        extra_warnings: tuple[MolecularWarning, ...] = (),
        created_atom_ids: tuple[int, ...] = (),
        created_bond_ids: tuple[int, ...] = (),
        deleted_atom_ids: tuple[int, ...] = (),
        deleted_bond_ids: tuple[int, ...] = (),
        changed_atom_ids: tuple[int, ...] = (),
        changed_residue_ids: tuple[int, ...] = (),
        deleted_residue_ids: tuple[int, ...] = (),
        changed_chain_ids: tuple[int, ...] = (),
        deleted_chain_ids: tuple[int, ...] = (),
    ) -> ProteinEditResult:
        del before
        warnings = (*self.validator.validate(after, operation), *extra_warnings)
        after = after.model_copy(
            update={"warnings": [*after.warnings, *warnings]}
        )
        return ProteinEditResult(
            structure=after,
            warnings=warnings,
            created_atom_ids=created_atom_ids,
            created_bond_ids=created_bond_ids,
            deleted_atom_ids=deleted_atom_ids,
            deleted_bond_ids=deleted_bond_ids,
            changed_atom_ids=changed_atom_ids,
            changed_residue_ids=changed_residue_ids,
            deleted_residue_ids=deleted_residue_ids,
            changed_chain_ids=changed_chain_ids,
            deleted_chain_ids=deleted_chain_ids,
        )

    @staticmethod
    def _append_result_warnings(
        result: ProteinEditResult,
        warnings: tuple[MolecularWarning, ...],
    ) -> ProteinEditResult:
        return ProteinEditResult(
            structure=result.structure.model_copy(
                update={
                    "warnings": [
                        *result.structure.warnings,
                        *warnings,
                    ]
                }
            ),
            warnings=(*result.warnings, *warnings),
            created_atom_ids=result.created_atom_ids,
            created_bond_ids=result.created_bond_ids,
            deleted_atom_ids=result.deleted_atom_ids,
            deleted_bond_ids=result.deleted_bond_ids,
            changed_atom_ids=result.changed_atom_ids,
            changed_residue_ids=result.changed_residue_ids,
            deleted_residue_ids=result.deleted_residue_ids,
            changed_chain_ids=result.changed_chain_ids,
            deleted_chain_ids=result.deleted_chain_ids,
        )

    def _fixer(self, structure: NormalizedStructureV1) -> Any:
        projection = self._polymer_projection(structure)
        payload = PdbAdapter().export(projection, "protein-template").data
        try:
            return PDBFixer(
                pdbfile=StringIO(payload.decode("ascii")),
                platform=Platform.getPlatformByName("Reference"),
            )
        except (RuntimeError, ValueError) as error:
            raise InvalidProteinEditError(
                f"PDBFixer could not load the normalized protein projection: {error}"
            ) from error

    def _polymer_projection(
        self,
        structure: NormalizedStructureV1,
    ) -> NormalizedStructureV1:
        polymer_residue_ids = {
            residue.id
            for residue in structure.residues
            if residue.component_type == "polymer"
        }
        if not polymer_residue_ids:
            raise InvalidProteinEditError("The entry contains no polymer residues")
        atoms = [
            atom
            for atom in structure.atoms
            if atom.residue_id in polymer_residue_ids
        ]
        atom_ids = {atom.id for atom in atoms}
        residues = [
            residue
            for residue in structure.residues
            if residue.id in polymer_residue_ids
        ]
        chain_ids = {residue.chain_id for residue in residues}
        chains = [
            chain for chain in structure.chains if chain.id in chain_ids
        ]
        bonds = [
            bond
            for bond in structure.bonds
            if bond.atom_1_id in atom_ids and bond.atom_2_id in atom_ids
        ]
        index_by_id = {atom.id: index for index, atom in enumerate(structure.atoms)}
        conformer = structure.conformers[0].model_copy(
            update={
                "coordinates": [
                    structure.conformers[0].coordinates[index_by_id[atom.id]]
                    for atom in atoms
                ]
            }
        )
        return structure.model_copy(
            update={
                "structure_type": "protein",
                "atoms": atoms,
                "bonds": bonds,
                "residues": residues,
                "chains": chains,
                "conformers": [conformer],
                "active_conformer_id": conformer.id,
            }
        )

    def _fixer_residue_map(
        self,
        structure: NormalizedStructureV1,
        fixer: Any,
    ) -> dict[Any, int]:
        residues_by_key = {
            self._normalized_residue_key(structure, residue): residue.id
            for residue in structure.residues
            if residue.component_type == "polymer"
        }
        result: dict[Any, int] = {}
        for residue in fixer.topology.residues():
            key = (
                residue.chain.id,
                int(residue.id),
                (residue.insertionCode or "").strip(),
            )
            residue_id = residues_by_key.get(key)
            if residue_id is None:
                raise InvalidProteinEditError(
                    "PDBFixer returned an unmapped residue identity"
                )
            if residue_id in result.values():
                raise InvalidProteinEditError(
                    "PDBFixer returned an ambiguous residue identity"
                )
            result[residue] = residue_id
        if set(result.values()) != set(residues_by_key.values()):
            raise InvalidProteinEditError(
                "PDBFixer did not preserve every normalized polymer residue"
            )
        return result

    def _fixer_residue(
        self,
        fixer: Any,
        chain_name: str,
        residue: Residue,
    ) -> Any:
        matches = [
            item
            for item in fixer.topology.residues()
            if item.chain.id == chain_name
            and int(item.id) == residue.author_number
            and (item.insertionCode or "").strip()
            == (residue.insertion_code or "").strip()
        ]
        if len(matches) != 1:
            raise InvalidProteinEditError(
                "PDBFixer could not map the target residue unambiguously"
            )
        return matches[0]

    @staticmethod
    def _normalized_residue_key(
        structure: NormalizedStructureV1,
        residue: Residue,
    ) -> tuple[str, int, str]:
        chain = next(
            (item for item in structure.chains if item.id == residue.chain_id),
            None,
        )
        if chain is None or residue.author_number is None:
            raise InvalidProteinEditError(
                "Protein templates require chain names and author residue numbers"
            )
        return (
            chain.name,
            residue.author_number,
            residue.insertion_code or "",
        )

    def _ensure_template_compatible(
        self,
        structure: NormalizedStructureV1,
    ) -> None:
        self._ensure_protein(structure)
        if len(structure.conformers) != 1:
            raise InvalidProteinEditError(
                "PDBFixer template operations require exactly one conformer"
            )
        if any(atom.alternate_location for atom in structure.atoms):
            raise InvalidProteinEditError(
                "PDBFixer template operations require resolved alternate locations"
            )
        polymer_chains = {
            residue.chain_id
            for residue in structure.residues
            if residue.component_type == "polymer"
        }
        names = [
            chain.name
            for chain in structure.chains
            if chain.id in polymer_chains
        ]
        if any(len(name) != 1 for name in names) or len(names) != len(set(names)):
            raise InvalidProteinEditError(
                "PDBFixer template operations require unique one-character chain names"
            )
        keys = [
            self._normalized_residue_key(structure, residue)
            for residue in structure.residues
            if residue.component_type == "polymer"
        ]
        if len(keys) != len(set(keys)):
            raise InvalidProteinEditError(
                "PDBFixer template operations require unique residue identities"
            )

    def _ensure_protein(self, structure: NormalizedStructureV1) -> None:
        self.validator.validate(structure, "protein.validate")

    @staticmethod
    def _atom_ids(
        structure: NormalizedStructureV1,
        atom_ids: list[int],
    ) -> set[int]:
        if not atom_ids:
            raise InvalidProteinEditError("Atom IDs must not be empty")
        if len(atom_ids) != len(set(atom_ids)):
            raise InvalidProteinEditError("Atom IDs must not contain duplicates")
        existing = {atom.id for atom in structure.atoms}
        missing = sorted(set(atom_ids) - existing)
        if missing:
            raise InvalidProteinEditError(
                f"Atom IDs are missing from the protein: {missing}"
            )
        return set(atom_ids)

    @staticmethod
    def _residue_ids(
        structure: NormalizedStructureV1,
        residue_ids: list[int],
    ) -> set[int]:
        if not residue_ids or len(residue_ids) != len(set(residue_ids)):
            raise InvalidProteinEditError(
                "Residue IDs must be a non-empty unique list"
            )
        existing = {residue.id for residue in structure.residues}
        missing = sorted(set(residue_ids) - existing)
        if missing:
            raise InvalidProteinEditError(
                f"Residue IDs are missing from the protein: {missing}"
            )
        return set(residue_ids)

    @staticmethod
    def _chain_ids(
        structure: NormalizedStructureV1,
        chain_ids: list[int],
    ) -> set[int]:
        if not chain_ids or len(chain_ids) != len(set(chain_ids)):
            raise InvalidProteinEditError("Chain IDs must be a non-empty unique list")
        existing = {chain.id for chain in structure.chains}
        missing = sorted(set(chain_ids) - existing)
        if missing:
            raise InvalidProteinEditError(
                f"Chain IDs are missing from the protein: {missing}"
            )
        return set(chain_ids)

    @staticmethod
    def _residue(
        structure: NormalizedStructureV1,
        residue_id: int,
    ) -> Residue:
        residue = next(
            (item for item in structure.residues if item.id == residue_id),
            None,
        )
        if residue is None:
            raise InvalidProteinEditError(
                f"Residue {residue_id} is missing from the protein"
            )
        return residue

    @staticmethod
    def _chain_for_residue(
        structure: NormalizedStructureV1,
        residue: Residue,
    ) -> Chain:
        chain = next(
            (item for item in structure.chains if item.id == residue.chain_id),
            None,
        )
        if chain is None:
            raise InvalidProteinEditError(
                f"Chain {residue.chain_id} is missing from the protein"
            )
        return chain

    @staticmethod
    def _is_terminal_polymer_residue(
        structure: NormalizedStructureV1,
        residue: Residue,
    ) -> bool:
        chain_residues = [
            item
            for item in structure.residues
            if item.chain_id == residue.chain_id
            and item.component_type == "polymer"
        ]
        return bool(
            chain_residues
            and residue.id in {chain_residues[0].id, chain_residues[-1].id}
        )
