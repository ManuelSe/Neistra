from __future__ import annotations

from collections.abc import Iterable, Mapping
from math import dist
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from molweave_core.molecular import Atom, Chain, NormalizedStructureV1, Residue

SelectionGranularity = Literal["atom", "residue", "chain", "structure"]
SelectionSource = Literal["viewer", "project", "sequence", "inspector", "saved"]
SelectionMode = Literal["replace", "add", "subtract"]
SelectionPredicateField = Literal[
    "atom_name",
    "atom_index",
    "atom_reference",
    "element",
    "residue_name",
    "residue_number",
    "chain",
    "structure",
]


class AtomReference(BaseModel):
    model_config = ConfigDict(frozen=True)

    structure_id: str = Field(min_length=1)
    atom_id: int = Field(ge=1)


class SelectionV1(BaseModel):
    model_config = ConfigDict(frozen=True)

    schema_version: Literal[1] = 1
    atoms: list[AtomReference] = Field(default_factory=list)
    granularity: SelectionGranularity = "atom"
    source: SelectionSource = "inspector"

    @model_validator(mode="after")
    def canonical_atoms(self) -> SelectionV1:
        keys = [(reference.structure_id, reference.atom_id) for reference in self.atoms]
        if keys != sorted(set(keys)):
            raise ValueError("Selection atom references must be unique and canonically ordered")
        return self


def selection(
    references: Iterable[AtomReference],
    *,
    granularity: SelectionGranularity = "atom",
    source: SelectionSource = "inspector",
) -> SelectionV1:
    unique = {(reference.structure_id, reference.atom_id): reference for reference in references}
    return SelectionV1(
        atoms=[unique[key] for key in sorted(unique)],
        granularity=granularity,
        source=source,
    )


def combine(
    current: SelectionV1,
    operand: SelectionV1,
    mode: SelectionMode,
) -> SelectionV1:
    current_keys = {(item.structure_id, item.atom_id) for item in current.atoms}
    operand_keys = {(item.structure_id, item.atom_id) for item in operand.atoms}
    if mode == "replace":
        result = operand_keys
    elif mode == "add":
        result = current_keys | operand_keys
    else:
        result = current_keys - operand_keys
    return selection(
        (
            AtomReference(structure_id=structure_id, atom_id=atom_id)
            for structure_id, atom_id in result
        ),
        granularity=operand.granularity,
        source=operand.source,
    )


def invert(
    current: SelectionV1,
    structures: Mapping[str, NormalizedStructureV1],
    *,
    source: SelectionSource = "inspector",
) -> SelectionV1:
    universe = selection(
        (
            AtomReference(structure_id=structure_id, atom_id=atom.id)
            for structure_id, structure in structures.items()
            for atom in structure.atoms
        ),
        source=source,
    )
    return combine(universe, current, "subtract")


def expand(
    current: SelectionV1,
    structures: Mapping[str, NormalizedStructureV1],
    granularity: SelectionGranularity,
    *,
    source: SelectionSource = "inspector",
) -> SelectionV1:
    selected = {(item.structure_id, item.atom_id) for item in current.atoms}
    expanded: list[AtomReference] = []
    for structure_id, structure in structures.items():
        selected_atoms = {
            atom_id
            for selected_structure, atom_id in selected
            if selected_structure == structure_id
        }
        if not selected_atoms:
            continue
        atoms_by_id = {atom.id: atom for atom in structure.atoms}
        residue_ids = {
            atom.residue_id
            for atom_id in selected_atoms
            if (atom := atoms_by_id.get(atom_id)) is not None and atom.residue_id is not None
        }
        residue_by_id = {residue.id: residue for residue in structure.residues}
        chain_ids = {
            residue_by_id[residue_id].chain_id
            for residue_id in residue_ids
            if residue_id in residue_by_id
        }
        for atom in structure.atoms:
            include = (
                atom.id in selected_atoms
                if granularity == "atom"
                else atom.residue_id in residue_ids
                if granularity == "residue"
                else (
                    atom.residue_id is not None
                    and atom.residue_id in residue_by_id
                    and residue_by_id[atom.residue_id].chain_id in chain_ids
                )
                if granularity == "chain"
                else True
            )
            if include:
                expanded.append(AtomReference(structure_id=structure_id, atom_id=atom.id))
    return selection(expanded, granularity=granularity, source=source)


def select_by_predicate(
    structures: Mapping[str, NormalizedStructureV1],
    field: SelectionPredicateField,
    value: str,
    *,
    source: SelectionSource = "inspector",
) -> SelectionV1:
    expected = value.strip().casefold()
    matches: list[AtomReference] = []
    for structure_id, structure in structures.items():
        residues = {residue.id: residue for residue in structure.residues}
        chains = {chain.id: chain for chain in structure.chains}
        for atom in structure.atoms:
            residue = residues.get(atom.residue_id) if atom.residue_id is not None else None
            chain = chains.get(residue.chain_id) if residue is not None else None
            actual = _predicate_value(field, structure_id, atom, residue, chain)
            if actual is not None and actual.casefold() == expected:
                matches.append(AtomReference(structure_id=structure_id, atom_id=atom.id))
    return selection(matches, source=source)


def within_distance(
    seed: SelectionV1,
    structures: Mapping[str, NormalizedStructureV1],
    distance_angstrom: float,
    *,
    granularity: Literal["atom", "residue"] = "atom",
    source: SelectionSource = "inspector",
) -> SelectionV1:
    if distance_angstrom < 0:
        raise ValueError("Distance must be non-negative")
    seed_coordinates = [
        atom.coordinates
        for reference in seed.atoms
        if (structure := structures.get(reference.structure_id)) is not None
        if (atom := _atom(structure, reference.atom_id)) is not None
    ]
    matched: list[AtomReference] = []
    if seed_coordinates:
        for structure_id, structure in structures.items():
            for atom in structure.atoms:
                if any(
                    dist(atom.coordinates, coordinate) <= distance_angstrom
                    for coordinate in seed_coordinates
                ):
                    matched.append(AtomReference(structure_id=structure_id, atom_id=atom.id))
    result = selection(matched, source=source)
    return (
        expand(result, structures, "residue", source=source) if granularity == "residue" else result
    )


def valid_references(
    current: SelectionV1,
    valid_atom_ids: Mapping[str, set[int]],
    *,
    source: SelectionSource | None = None,
) -> tuple[SelectionV1, int]:
    kept = [
        reference
        for reference in current.atoms
        if reference.atom_id in valid_atom_ids.get(reference.structure_id, set())
    ]
    return (
        selection(
            kept,
            granularity=current.granularity,
            source=source or current.source,
        ),
        len(current.atoms) - len(kept),
    )


def _atom(structure: NormalizedStructureV1, atom_id: int) -> Atom | None:
    return next((atom for atom in structure.atoms if atom.id == atom_id), None)


def _predicate_value(
    field: SelectionPredicateField,
    structure_id: str,
    atom: Atom,
    residue: Residue | None,
    chain: Chain | None,
) -> str | None:
    if field == "atom_name":
        return atom.name
    if field == "atom_index":
        return str(atom.id)
    if field == "atom_reference":
        return f"{structure_id}:{atom.id}"
    if field == "element":
        return atom.element
    if field == "structure":
        return structure_id
    if residue is None:
        return None
    if field == "residue_name":
        return residue.name
    if field == "residue_number":
        number = residue.author_number or residue.label_number
        return str(number) if number is not None else None
    return chain.name if chain is not None else None
