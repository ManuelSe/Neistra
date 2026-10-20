from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Literal

from molweave_core.jobs import InputArtifact
from molweave_core.minimization.contracts import CalculationError, MinimizationParameters
from molweave_core.minimization.preflight import (
    IsolatedInput,
    connected_atoms,
    organic_preflight,
    validate_coordinates_and_identity,
    validate_separation,
)
from molweave_core.minimization.protein_chemistry import validate_protein_chemistry
from molweave_core.minimization.templates import (
    MatchedResidue,
    ResidueTemplate,
    match_protein_chain,
)
from molweave_core.molecular import Atom, NormalizedStructureV1

AtomKey = tuple[str, int]


def needs_templates(parameters: MinimizationParameters, inputs: tuple[InputArtifact, ...]) -> bool:
    if parameters.mode == "environment":
        return True
    if len(inputs) != 1:
        raise CalculationError("isolated_scope", "Isolated mode requires one complete molecule")
    try:
        source = NormalizedStructureV1.from_bytes(inputs[0].data)
    except ValueError as error:
        raise CalculationError("input_invalid", "Captured molecular data is invalid") from error
    members = set(parameters.captured_inputs[0].atom_ids)
    residues = {a.residue_id for a in source.atoms if a.id in members}
    return any(
        r.id in residues and r.component_type in {"polymer", "water"} for r in source.residues
    )


def project_atoms(source: NormalizedStructureV1, ids: set[int]) -> NormalizedStructureV1:
    indices = [i for i, a in enumerate(source.atoms) if a.id in ids]
    residue_ids = {source.atoms[i].residue_id for i in indices}
    residues = [r for r in source.residues if r.id in residue_ids]
    chain_ids = {r.chain_id for r in residues}
    return source.model_copy(
        update={
            "atoms": [source.atoms[i] for i in indices],
            "bonds": [b for b in source.bonds if b.atom_1_id in ids and b.atom_2_id in ids],
            "residues": residues,
            "chains": [c for c in source.chains if c.id in chain_ids],
            "conformers": [
                next(c for c in source.conformers if c.id == source.active_conformer_id).model_copy(
                    update={"coordinates": [source.active_coordinates[i] for i in indices]}
                )
            ],
        }
    )


@dataclass(frozen=True)
class Component:
    entry_id: str
    kind: Literal["protein", "organic", "water"]
    structure: NormalizedStructureV1
    atom_ids: tuple[int, ...]
    residues: tuple[MatchedResidue, ...] = ()
    organic: IsolatedInput | None = None


@dataclass(frozen=True)
class Assembly:
    components: tuple[Component, ...]
    movable: frozenset[AtomKey]

    @property
    def references(self) -> tuple[AtomKey, ...]:
        return tuple((c.entry_id, i) for c in self.components for i in c.atom_ids)

    @property
    def atoms(self) -> tuple[Atom, ...]:
        result: list[Atom] = []
        for component in self.components:
            by_id = {a.id: a for a in component.structure.atoms}
            result.extend(by_id[i] for i in component.atom_ids)
        return tuple(result)

    @property
    def coordinates(self) -> list[tuple[float, float, float]]:
        return [a.coordinates for a in self.atoms]

    @property
    def bonds(self) -> frozenset[frozenset[int]]:
        index = {key: i for i, key in enumerate(self.references)}
        return frozenset(
            frozenset((index[c.entry_id, b.atom_1_id], index[c.entry_id, b.atom_2_id]))
            for c in self.components
            for b in c.structure.bonds
        )


def environment_preflight(
    parameters: MinimizationParameters,
    inputs: tuple[InputArtifact, ...],
    templates: dict[str, ResidueTemplate],
) -> Assembly:
    if len(inputs) != len(parameters.captured_inputs):
        raise CalculationError("capture_mismatch", "Capture and calculation entries differ")
    items = {item.entry_id: item for item in inputs}
    if len(items) != len(inputs):
        raise CalculationError("capture_mismatch", "Duplicate calculation entries")
    components: list[Component] = []
    movable = frozenset((r.structure_id, r.atom_id) for r in parameters.selection.atoms)
    for capture in parameters.captured_inputs:
        item = items.get(capture.entry_id)
        if (
            item is None
            or (item.artifact_id, item.sha256) != (capture.artifact_id, capture.sha256)
            or (hashlib.sha256(item.data).hexdigest() != capture.sha256)
        ):
            raise CalculationError("capture_mismatch", "Input does not match the immutable capture")
        try:
            source = NormalizedStructureV1.from_bytes(item.data)
        except ValueError as error:
            raise CalculationError("input_invalid", "Captured molecular data is invalid") from error
        if source.active_conformer_id != capture.conformer_id:
            raise CalculationError("conformer_mismatch", "Capture must name the active conformer")
        members = set(capture.atom_ids)
        if parameters.mode == "isolated":
            seeds = {
                r.atom_id for r in parameters.selection.atoms if r.structure_id == item.entry_id
            }
            if len(inputs) != 1 or not seeds or connected_atoms(source, seeds) != members:
                raise CalculationError("isolated_scope", "Capture one complete selected molecule")
        if connected_atoms(source, members) != members:
            raise CalculationError("incomplete_context", "Include complete covalent components")
        included = project_atoms(source, members)
        try:
            validate_coordinates_and_identity(included)
        except CalculationError as error:
            error.entry_id = capture.entry_id
            raise
        remaining = set(members)
        for chain in source.chains:
            polymer_residues = {
                r.id
                for r in source.residues
                if r.chain_id == chain.id and r.component_type == "polymer"
            }
            chain_ids = {a.id for a in source.atoms if a.residue_id in polymer_residues}
            if not members & chain_ids:
                continue
            if not chain_ids <= members:
                raise CalculationError(
                    "incomplete_chain", "Include the complete chosen protein chain"
                )
            if connected_atoms(source, chain_ids) != chain_ids:
                raise CalculationError(
                    "adduct_unsupported",
                    "Protein crosslinks and covalent ligand adducts are deferred",
                )
            projected = project_atoms(source, chain_ids)
            residues = match_protein_chain(projected, templates)
            validate_protein_chemistry(projected, residues)
            components.append(
                Component(
                    capture.entry_id,
                    "protein",
                    projected,
                    tuple(i for r in residues for i in r.atom_ids),
                    residues,
                )
            )
            remaining -= chain_ids
        while remaining:
            ids = connected_atoms(source, {min(remaining)})
            projected = project_atoms(source, ids)
            if any(r.component_type == "water" for r in projected.residues):
                if any(
                    a.formal_charge not in {None, 0} or a.stereo for a in projected.atoms
                ) or any(
                    b.order not in {None, 1.0}
                    or b.stereo not in {None, "", "NONE", "ANY"}
                    or b.aromatic
                    for b in projected.bonds
                ):
                    raise CalculationError(
                        "water_chemistry",
                        "TIP3P requires ordinary neutral water with O-H single bonds",
                    )
                by_name = {a.name: a for a in projected.atoms}
                expected = templates["TP3"]
                if set(by_name) != set(expected.atom_names) or len(projected.atoms) != 3:
                    raise CalculationError(
                        "water_incomplete", "Include complete explicit O/H1/H2 water"
                    )
                ordered = tuple(by_name[name].id for name in expected.atom_names)
                bonds = {frozenset((b.atom_1_id, b.atom_2_id)) for b in projected.bonds}
                if tuple(by_name[n].element for n in expected.atom_names) != expected.elements or (
                    bonds
                    != {frozenset((ordered[0], ordered[1])), frozenset((ordered[0], ordered[2]))}
                ):
                    raise CalculationError(
                        "water_incomplete", "Water needs existing O-H connectivity"
                    )
                components.append(Component(capture.entry_id, "water", projected, ordered))
            else:
                selected = {i for entry, i in movable if entry == capture.entry_id}
                organic = organic_preflight(capture.entry_id, projected, selected)
                components.append(
                    Component(
                        capture.entry_id,
                        "organic",
                        projected,
                        tuple(a.id for a in projected.atoms),
                        organic=organic,
                    )
                )
            remaining -= ids
    if sum(c.kind == "organic" for c in components) > 4:
        raise CalculationError("organic_limit", "Include at most four organic components")
    if parameters.mode == "isolated" and len(components) != 1:
        raise CalculationError("isolated_scope", "Isolated mode requires one complete molecule")
    components.sort(key=lambda c: {"protein": 0, "organic": 1, "water": 2}[c.kind])
    result = Assembly(tuple(components), movable)
    validate_separation(result.coordinates)
    return result
