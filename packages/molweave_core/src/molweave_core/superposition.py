from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from molweave_core.molecular import Atom, NormalizedStructureV1
from molweave_core.transforms import Point3D, apply_rigid_transform

BACKBONE_NAMES = frozenset({"N", "CA", "C", "O"})
ProteinAtomIdentity = tuple[
    str,
    int | None,
    int | None,
    str,
    str,
    str,
    str,
    str,
]


class InvalidSuperpositionError(ValueError):
    """Raised when a scientifically unambiguous protein fit cannot be defined."""


@dataclass(frozen=True, slots=True)
class KabschFit:
    rotation: tuple[Point3D, Point3D, Point3D]
    translation: Point3D
    rmsd: float
    atom_count: int


@dataclass(frozen=True, slots=True)
class SuperpositionResult:
    structure: NormalizedStructureV1
    fit: KabschFit
    identities: tuple[ProteinAtomIdentity, ...]


def kabsch_fit(
    moving_coordinates: Iterable[Point3D],
    reference_coordinates: Iterable[Point3D],
) -> KabschFit:
    moving = np.asarray(list(moving_coordinates), dtype=np.float64)
    reference = np.asarray(list(reference_coordinates), dtype=np.float64)
    if moving.shape != reference.shape:
        raise InvalidSuperpositionError(
            "Moving and reference coordinate sets must have equal size"
        )
    if moving.ndim != 2 or moving.shape[1] != 3 or moving.shape[0] < 3:
        raise InvalidSuperpositionError(
            "Superposition requires at least three paired 3D coordinates"
        )
    if not np.all(np.isfinite(moving)) or not np.all(np.isfinite(reference)):
        raise InvalidSuperpositionError("Superposition coordinates must be finite")
    moving_centroid = moving.mean(axis=0)
    reference_centroid = reference.mean(axis=0)
    moving_centered = moving - moving_centroid
    reference_centered = reference - reference_centroid
    if (
        np.linalg.matrix_rank(moving_centered, tol=1e-12) < 2
        or np.linalg.matrix_rank(reference_centered, tol=1e-12) < 2
    ):
        raise InvalidSuperpositionError(
            "Superposition geometry is collinear or otherwise underdetermined"
        )
    covariance = moving_centered.T @ reference_centered
    left, _, right_transposed = np.linalg.svd(covariance)
    rotation = right_transposed.T @ left.T
    if np.linalg.det(rotation) < 0:
        raise InvalidSuperpositionError(
            "Correspondence requires a reflection rather than a proper rotation"
        )
    translation = reference_centroid - rotation @ moving_centroid
    fitted = moving @ rotation.T + translation
    rmsd = float(
        np.sqrt(np.mean(np.sum(np.square(fitted - reference), axis=1)))
    )
    return KabschFit(
        rotation=_matrix_tuple(rotation),
        translation=_point(translation),
        rmsd=rmsd,
        atom_count=int(moving.shape[0]),
    )


def superpose_selected(
    moving: NormalizedStructureV1,
    reference: NormalizedStructureV1,
    moving_atom_ids: Iterable[int],
    reference_atom_ids: Iterable[int],
) -> SuperpositionResult:
    moving_by_identity = _identity_map(moving, moving_atom_ids)
    reference_by_identity = _identity_map(reference, reference_atom_ids)
    return _superpose(moving, reference, moving_by_identity, reference_by_identity)


def superpose_backbone(
    moving: NormalizedStructureV1,
    reference: NormalizedStructureV1,
) -> SuperpositionResult:
    _validate_protein_entry(moving)
    _validate_protein_entry(reference)
    moving_ids = [
        atom.id for atom in moving.atoms if atom.name.strip().upper() in BACKBONE_NAMES
    ]
    reference_ids = [
        atom.id
        for atom in reference.atoms
        if atom.name.strip().upper() in BACKBONE_NAMES
    ]
    moving_by_identity = _identity_map(moving, moving_ids)
    reference_by_identity = _identity_map(reference, reference_ids)
    return _superpose(moving, reference, moving_by_identity, reference_by_identity)


def _superpose(
    moving: NormalizedStructureV1,
    reference: NormalizedStructureV1,
    moving_by_identity: dict[ProteinAtomIdentity, Atom],
    reference_by_identity: dict[ProteinAtomIdentity, Atom],
) -> SuperpositionResult:
    _validate_protein_entry(moving)
    _validate_protein_entry(reference)
    moving_identities = set(moving_by_identity)
    reference_identities = set(reference_by_identity)
    if moving_identities != reference_identities:
        missing = len(moving_identities - reference_identities)
        extra = len(reference_identities - moving_identities)
        raise InvalidSuperpositionError(
            "Selected atoms do not have equal protein identities "
            f"(moving-only: {missing}, reference-only: {extra})"
        )
    identities = tuple(sorted(moving_identities, key=_identity_sort_key))
    if len(identities) < 3:
        raise InvalidSuperpositionError(
            "Superposition requires at least three corresponding atoms"
        )
    moving_coordinates = [
        moving_by_identity[identity].coordinates for identity in identities
    ]
    reference_coordinates = [
        reference_by_identity[identity].coordinates for identity in identities
    ]
    fit = kabsch_fit(moving_coordinates, reference_coordinates)
    structure = apply_rigid_transform(
        moving,
        (atom.id for atom in moving.atoms),
        fit.rotation,
        fit.translation,
    )
    return SuperpositionResult(structure=structure, fit=fit, identities=identities)


def _identity_map(
    structure: NormalizedStructureV1,
    atom_ids: Iterable[int],
) -> dict[ProteinAtomIdentity, Atom]:
    requested = list(atom_ids)
    if not requested:
        raise InvalidSuperpositionError("Superposition selection must not be empty")
    if len(set(requested)) != len(requested):
        raise InvalidSuperpositionError("Superposition atom IDs must be unique")
    atoms_by_id = {atom.id: atom for atom in structure.atoms}
    missing = sorted(set(requested) - atoms_by_id.keys())
    if missing:
        raise InvalidSuperpositionError(
            f"Superposition references missing atom IDs: {', '.join(map(str, missing))}"
        )
    residues = {residue.id: residue for residue in structure.residues}
    chains = {chain.id: chain for chain in structure.chains}
    identities: dict[ProteinAtomIdentity, Atom] = {}
    for atom_id in requested:
        atom = atoms_by_id[atom_id]
        residue = residues.get(atom.residue_id or -1)
        chain = chains.get(residue.chain_id) if residue else None
        if residue is None or chain is None:
            raise InvalidSuperpositionError(
                f"Atom {atom.id} lacks protein residue or chain identity"
            )
        identity: ProteinAtomIdentity = (
            chain.name,
            residue.author_number,
            residue.label_number,
            residue.insertion_code or "",
            residue.name,
            atom.name,
            atom.element,
            atom.alternate_location or "",
        )
        if identity in identities:
            raise InvalidSuperpositionError(
                "Protein atom correspondence is ambiguous because an identity is duplicated"
            )
        identities[identity] = atom
    return identities


def _validate_protein_entry(structure: NormalizedStructureV1) -> None:
    if structure.structure_type not in {"protein", "complex"}:
        raise InvalidSuperpositionError(
            "Protein superposition requires protein or complex entries"
        )


def _identity_sort_key(identity: ProteinAtomIdentity) -> tuple[str, ...]:
    return tuple("" if value is None else str(value) for value in identity)


def _point(values: NDArray[np.float64]) -> Point3D:
    return (float(values[0]), float(values[1]), float(values[2]))


def _matrix_tuple(
    matrix: NDArray[np.float64],
) -> tuple[Point3D, Point3D, Point3D]:
    return (_point(matrix[0]), _point(matrix[1]), _point(matrix[2]))
