from __future__ import annotations

import hashlib
from dataclasses import dataclass
from math import isfinite
from typing import Any

from rdkit import Chem

from molweave_core.adapters.rdkit_common import normalized_to_mol
from molweave_core.hydrogen_protection import protection_facts
from molweave_core.jobs import InputArtifact
from molweave_core.minimization.contracts import CalculationError, MinimizationParameters
from molweave_core.molecular import NormalizedStructureV1


@dataclass(frozen=True)
class IsolatedInput:
    entry_id: str
    structure: NormalizedStructureV1
    molecule: Any
    movable_indices: tuple[int, ...]


def connected_atoms(structure: NormalizedStructureV1, seeds: set[int]) -> set[int]:
    adjacency: dict[int, list[int]] = {a.id: [] for a in structure.atoms}
    for bond in structure.bonds:
        adjacency[bond.atom_1_id].append(bond.atom_2_id)
        adjacency[bond.atom_2_id].append(bond.atom_1_id)
    if not seeds <= adjacency.keys():
        raise CalculationError("atom_missing", "A captured movable atom is missing")
    reached, pending = set(seeds), list(seeds)
    while pending:
        for neighbor in adjacency[pending.pop()]:
            if neighbor not in reached:
                reached.add(neighbor)
                pending.append(neighbor)
    return reached


def isolated_preflight(
    parameters: MinimizationParameters,
    inputs: tuple[InputArtifact, ...],
) -> IsolatedInput:
    if len(inputs) != 1 or len(parameters.captured_inputs) != 1:
        raise CalculationError("isolated_scope", "Isolated mode requires one complete molecule")
    item, capture = inputs[0], parameters.captured_inputs[0]
    if (item.entry_id, item.artifact_id, item.sha256) != (
        capture.entry_id,
        capture.artifact_id,
        capture.sha256,
    ) or hashlib.sha256(item.data).hexdigest() != capture.sha256:
        raise CalculationError("capture_mismatch", "Input does not match the immutable capture")
    try:
        source = NormalizedStructureV1.from_bytes(item.data)
    except ValueError as error:
        raise CalculationError(
            "input_invalid", "Captured molecular data is structurally invalid"
        ) from error
    if source.active_conformer_id != capture.conformer_id:
        raise CalculationError("conformer_mismatch", "Capture must name the active conformer")
    selected = {r.atom_id for r in parameters.selection.atoms if r.structure_id == item.entry_id}
    members = connected_atoms(source, selected)
    if members != set(capture.atom_ids):
        raise CalculationError(
            "incomplete_context",
            "Capture the complete covalent molecule; unselected atoms stay fixed",
        )
    # One connected component, not several molecules with unspecified interactions.
    if connected_atoms(source, {min(members)}) != members:
        raise CalculationError("isolated_scope", "Select atoms in one connected molecule")
    indices = [i for i, atom in enumerate(source.atoms) if atom.id in members]
    coordinates = [source.active_coordinates[i] for i in indices]
    structure = source.model_copy(
        update={
            "atoms": [source.atoms[i] for i in indices],
            "bonds": [b for b in source.bonds if b.atom_1_id in members],
            "conformers": [
                next(c for c in source.conformers if c.id == capture.conformer_id).model_copy(
                    update={"coordinates": coordinates}
                )
            ],
        }
    )
    return organic_preflight(item.entry_id, structure, selected)


def organic_preflight(
    entry_id: str, structure: NormalizedStructureV1, selected: set[int]
) -> IsolatedInput:
    validate_coordinates_and_identity(structure)
    if len(structure.atoms) > 1024 or sum(a.element != "H" for a in structure.atoms) > 256:
        raise CalculationError(
            "molecule_limit", "Organic molecule exceeds 256 heavy / 1024 total atoms"
        )
    if any(
        a.element not in {"H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"}
        for a in structure.atoms
    ):
        raise CalculationError(
            "unsupported_element", "This profile supports ordinary closed-shell organic molecules"
        )
    if any(a.formal_charge is None for a in structure.atoms) or any(
        b.order not in {1.0, 1.5, 2.0, 3.0} for b in structure.bonds
    ):
        raise CalculationError(
            "chemistry_unknown", "Assign ligand formal charges and bond orders explicitly"
        )
    try:
        if any(
            a.stereo and a.stereo not in {"TETRAHEDRAL_CW", "TETRAHEDRAL_CCW"}
            for a in structure.atoms
        ):
            raise CalculationError(
                "unsupported_stereo", "This atom stereo encoding is not qualified for minimization"
            )
        molecule = normalized_to_mol(structure)
        Chem.SanitizeMol(molecule)
        if any(a.GetNumRadicalElectrons() for a in molecule.GetAtoms()):
            raise CalculationError(
                "radical_unsupported", "Radicals are unsupported by this profile"
            )
        if Chem.AddHs(molecule).GetNumAtoms() != molecule.GetNumAtoms():
            raise CalculationError(
                "hydrogens_missing",
                "Complete explicit hydrogens in a separate action before minimization",
            )
    except CalculationError:
        raise
    except (ValueError, RuntimeError) as error:
        raise CalculationError(
            "invalid_chemistry", f"Cannot parameterize current chemistry: {error}"
        ) from error
    return IsolatedInput(
        entry_id,
        structure,
        molecule,
        tuple(i for i, a in enumerate(structure.atoms) if a.id in selected),
    )


def validate_coordinates_and_identity(structure: NormalizedStructureV1) -> None:
    pairs = [frozenset((b.atom_1_id, b.atom_2_id)) for b in structure.bonds]
    if len(set(pairs)) != len(pairs):
        raise CalculationError("duplicate_bonds", "Resolve duplicate canonical bond pairs")
    if any(a.alternate_location for a in structure.atoms):
        raise CalculationError(
            "alternate_sites", "Resolve alternate sites explicitly before minimization"
        )
    coordinates = structure.active_coordinates
    if any(not isfinite(v) for point in coordinates for v in point):
        raise CalculationError("invalid_coordinates", "Coordinates must be finite")
    if any(a.coordinates != point for a, point in zip(structure.atoms, coordinates, strict=True)):
        raise CalculationError(
            "coordinate_mismatch", "Atom rows must match the captured active conformer"
        )
    try:
        facts = protection_facts(structure)
        if any(
            a.id not in facts or not facts[a.id].matches(a) or not facts[a.id].ordinary
            for a in structure.atoms
        ):
            raise CalculationError(
                "identity_uncertain",
                "Ordinary isotope/radical identity must be established for every atom",
            )
    except ValueError as error:
        raise CalculationError("identity_uncertain", "Malformed atom identity evidence") from error
