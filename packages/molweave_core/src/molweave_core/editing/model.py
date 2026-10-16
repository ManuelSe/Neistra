"""Authored molecular graph edits; chemistry libraries do not gate draft state."""

from __future__ import annotations

from math import dist
from typing import Annotated, Literal

import numpy as np
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    FiniteFloat,
    StrictFloat,
    StrictInt,
    field_validator,
)
from rdkit import Chem
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.editing.fragments import FragmentName
from molweave_core.editing.ligand import EditResult
from molweave_core.editing.placement import place_atom, place_fragment
from molweave_core.editing.selection import (
    HydrogenPrepare,
    SelectionEditResult,
    SelectionMolecularEditor,
)
from molweave_core.molecular import Bond, MolecularWarning, NormalizedStructureV1

MODELING_METADATA = "neistra_modeling"
HydrogenPolicy = Literal["preserve", "complete_if_possible"]


class InvalidModelEdit(ValueError):
    pass


class ModelActionBase(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ModelElement(ModelActionBase):
    operation: Literal["atom.element"]
    element: str = Field(min_length=1, max_length=3)

    @field_validator("element")
    @classmethod
    def recognized_element(cls, value: str) -> str:
        try:
            if Chem.GetPeriodicTable().GetAtomicNumber(value) < 1:
                raise ValueError("Choose a recognized chemical element.")
        except RuntimeError as error:
            raise ValueError("Choose a recognized chemical element.") from error
        return value


class ModelCharge(ModelActionBase):
    operation: Literal["atom.charge.set"]
    charge: StrictInt | None


class ModelDelete(ModelActionBase):
    operation: Literal["atom.delete"]


class ModelBondSet(ModelActionBase):
    operation: Literal["bond.set"]
    order: StrictFloat | None = Field(
        default=1.0, json_schema_extra={"enum": [None, 1.0, 1.5, 2.0, 3.0]}
    )

    @field_validator("order")
    @classmethod
    def represented_order(cls, value: float | None) -> float | None:
        if value not in {None, 1.0, 1.5, 2.0, 3.0}:
            raise ValueError("Choose unknown, single, double, triple or aromatic bond order.")
        return value


class ModelBondDelete(ModelActionBase):
    operation: Literal["bond.delete"]


class ModelAtomAdd(ModelActionBase):
    operation: Literal["atom.add"]
    element: str = Field(min_length=1, max_length=3)
    charge: StrictInt | None = 0
    direction: int = Field(default=0, ge=0, le=5, strict=True)
    coordinates: tuple[FiniteFloat, FiniteFloat, FiniteFloat] | None = None

    @field_validator("element")
    @classmethod
    def recognized_element(cls, value: str) -> str:
        return ModelElement.recognized_element(value)


class ModelFragmentAdd(ModelActionBase):
    operation: Literal["fragment.attach"]
    fragment: FragmentName
    direction: int = Field(default=0, ge=0, le=5, strict=True)
    rotation: int = Field(default=0, ge=0, le=5, strict=True)


ModelAction = Annotated[
    ModelElement
    | ModelCharge
    | ModelDelete
    | ModelBondSet
    | ModelBondDelete
    | ModelAtomAdd
    | ModelFragmentAdd,
    Field(discriminator="operation"),
]


class ModelingMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: Literal[1] = 1
    excluded_bonds: list[tuple[StrictInt, StrictInt]] = Field(default_factory=list)

    @field_validator("excluded_bonds")
    @classmethod
    def canonical_pairs(cls, value: list[tuple[int, int]]) -> list[tuple[int, int]]:
        if any(a < 1 or b < 1 or a == b for a, b in value):
            raise ValueError("Excluded bonds require distinct positive atom identities.")
        return sorted({(min(a, b), max(a, b)) for a, b in value})


def modeling_metadata(structure: NormalizedStructureV1) -> ModelingMetadata:
    try:
        metadata = ModelingMetadata.model_validate(structure.metadata.get(MODELING_METADATA, {}))
    except ValueError as error:
        raise InvalidModelEdit("Unsupported or invalid authored modeling metadata.") from error
    ids = {a.id for a in structure.atoms}
    if any(a not in ids or b not in ids for a, b in metadata.excluded_bonds):
        raise InvalidModelEdit("Authored bond exclusions reference missing atoms.")
    return metadata


def model_warning(
    code: str, message: str, operation: str, field: str = "chemistry"
) -> MolecularWarning:
    return MolecularWarning(
        code=code,
        message=message,
        operation=f"model.{operation}",
        field=field,
    )


class DirectMolecularEditor:
    def edit(
        self,
        before: NormalizedStructureV1,
        selected: list[int],
        action: ModelAction,
        *,
        next_atom_id: int,
        next_bond_id: int,
        hydrogen_policy: HydrogenPolicy = "preserve",
        atom_limit: int = 1_000_000,
    ) -> SelectionEditResult:
        atoms = {a.id: a for a in before.atoms}
        chosen = set(selected)
        if (
            (not selected and not isinstance(action, ModelAtomAdd))
            or len(chosen) != len(selected)
            or not chosen <= atoms.keys()
        ):
            raise InvalidModelEdit("Select current, unique atoms in this entry.")
        if next_atom_id <= max(atoms, default=0) or next_bond_id <= max(
            (b.id for b in before.bonds),
            default=0,
        ):
            raise InvalidModelEdit("New identities must exceed retained entry identities.")
        pairs = {tuple(sorted((b.atom_1_id, b.atom_2_id))): b for b in before.bonds}
        if len(pairs) != len(before.bonds):
            raise InvalidModelEdit("Duplicate bond endpoints require an explicit repair.")
        exclusions = set(modeling_metadata(before).excluded_bonds)
        if exclusions & pairs.keys():
            raise InvalidModelEdit("Authored bonds contradict recorded bond exclusions.")
        after = before
        touched = set(chosen)
        warnings: list[MolecularWarning] = []
        replacements: dict[int, int] = {}
        if isinstance(action, (ModelAtomAdd, ModelFragmentAdd)):
            try:
                placement = (
                    place_atom(
                        before,
                        selected,
                        element=action.element,
                        charge=action.charge,
                        direction=action.direction,
                        coordinates=action.coordinates,
                        next_atom_id=next_atom_id,
                        next_bond_id=next_bond_id,
                    )
                    if isinstance(action, ModelAtomAdd)
                    else place_fragment(
                        before,
                        selected,
                        fragment=action.fragment,
                        direction=action.direction,
                        rotation=action.rotation,
                        next_atom_id=next_atom_id,
                        next_bond_id=next_bond_id,
                    )
                )
            except ValueError as error:
                raise InvalidModelEdit(str(error)) from error
            after, replacements, touched = (
                placement.structure,
                placement.replacements,
                placement.touched,
            )
            warnings.extend(placement.warnings)
        elif isinstance(action, ModelDelete):
            retained = [i for i, a in enumerate(before.atoms) if a.id not in chosen]
            for bond in before.bonds:
                if chosen & {bond.atom_1_id, bond.atom_2_id}:
                    touched.update((bond.atom_1_id, bond.atom_2_id))
            after = before.model_copy(
                update={
                    "atoms": [before.atoms[i] for i in retained],
                    "bonds": [b for b in before.bonds if not chosen & {b.atom_1_id, b.atom_2_id}],
                    "conformers": [
                        c.model_copy(
                            update={
                                "coordinates": [c.coordinates[i] for i in retained],
                            }
                        )
                        for c in before.conformers
                    ],
                }
            )
            exclusions = {p for p in exclusions if not chosen & set(p)}
        elif isinstance(action, (ModelElement, ModelCharge)):
            if len(selected) != 1:
                raise InvalidModelEdit("Select exactly one atom for element or charge assignment.")
            target = atoms[selected[0]]
            change = (
                {"element": action.element}
                if isinstance(action, ModelElement)
                else {
                    "formal_charge": action.charge,
                }
            )
            if all(getattr(target, key) == value for key, value in change.items()):
                raise InvalidModelEdit("The atom already has the requested value.")
            after = before.model_copy(
                update={
                    "atoms": [
                        a.model_copy(
                            update={
                                **change,
                                "inferred_fields": [
                                    field
                                    for field in a.inferred_fields
                                    if field not in change and field != "chemistry"
                                ],
                            }
                        )
                        if a.id == target.id
                        else a
                        for a in before.atoms
                    ]
                }
            )
        else:
            if len(selected) != 2:
                raise InvalidModelEdit("Select exactly two distinct bond endpoints.")
            pair = tuple(sorted(selected))
            # The arity check gives a concrete tuple for the metadata contract.
            endpoints = (pair[0], pair[1])
            old = pairs.get(endpoints)
            if isinstance(action, ModelBondDelete):
                if old is None and endpoints in exclusions:
                    raise InvalidModelEdit("The selected bond is already removed.")
                exclusions.add(endpoints)
                after = before.model_copy(
                    update={
                        "bonds": [b for b in before.bonds if old is None or b.id != old.id],
                    }
                )
            else:
                aromatic = action.order == 1.5
                if old and old.order == action.order and old.aromatic == aromatic:
                    raise InvalidModelEdit("The bond already has the requested order.")
                exclusions.discard(endpoints)
                if old:
                    after = before.model_copy(
                        update={
                            "bonds": [
                                b.model_copy(
                                    update={
                                        "order": action.order,
                                        "aromatic": aromatic,
                                        "inferred": False,
                                        "stereo": None,
                                    }
                                )
                                if b.id == old.id
                                else b
                                for b in before.bonds
                            ]
                        }
                    )
                else:
                    after = before.model_copy(
                        update={
                            "bonds": [
                                *before.bonds,
                                Bond(
                                    id=next_bond_id,
                                    atom_1_id=endpoints[0],
                                    atom_2_id=endpoints[1],
                                    order=action.order,
                                    aromatic=aromatic,
                                    inferred=False,
                                ),
                            ]
                        }
                    )
        # Local stereo labels cannot certify a changed neighborhood. Keep geometry
        # and every unaffected annotation; never invent unspecified stereo.
        stereo_scope = set(touched)
        for bond in before.bonds:
            if touched & {bond.atom_1_id, bond.atom_2_id}:
                stereo_scope.update((bond.atom_1_id, bond.atom_2_id))
        # E/Z labels depend on substituent priorities beyond the immediate edit.
        # Preserve disconnected annotations; conservatively unassign dependent
        # bond labels without converting/sanitizing the complete parent.
        bond_stereo_scope: set[int] = set()
        if any(b.stereo not in {None, "NONE"} for b in [*before.bonds, *after.bonds]):
            adjacency: dict[int, set[int]] = {}
            for bond in [*before.bonds, *after.bonds]:
                adjacency.setdefault(bond.atom_1_id, set()).add(bond.atom_2_id)
                adjacency.setdefault(bond.atom_2_id, set()).add(bond.atom_1_id)
            stack = list(touched)
            while stack:
                node = stack.pop()
                if node in bond_stereo_scope:
                    continue
                bond_stereo_scope.add(node)
                stack.extend(adjacency.get(node, set()) - bond_stereo_scope)
        if any(a.stereo not in {None, "NONE"} and a.id in stereo_scope for a in after.atoms) or any(
            b.stereo not in {None, "NONE"} and bond_stereo_scope & {b.atom_1_id, b.atom_2_id}
            for b in [*before.bonds, *after.bonds]
        ):
            warnings.append(
                model_warning(
                    "model_stereo_unassigned",
                    "Stereo annotations affected by the edit or connected substituent priorities "
                    "were cleared; retained coordinates do not establish a new stereo assignment.",
                    action.operation,
                    "stereo",
                )
            )
        after = after.model_copy(
            update={
                "atoms": [
                    a.model_copy(
                        update={
                            "stereo": None,
                            "inferred_fields": [
                                field for field in a.inferred_fields if field != "stereo"
                            ],
                        }
                    )
                    if a.stereo not in {None, "NONE"} and a.id in stereo_scope
                    else a
                    for a in after.atoms
                ],
                "bonds": [
                    b.model_copy(update={"stereo": None})
                    if b.stereo not in {None, "NONE"}
                    and bond_stereo_scope & {b.atom_1_id, b.atom_2_id}
                    else b
                    for b in after.bonds
                ],
            }
        )
        metadata = dict(after.metadata)
        for key in ("canonical_smiles", "formula", "molecular_weight", "descriptors"):
            metadata.pop(key, None)
        retained_ids = {a.id for a in after.atoms}
        exclusions = {pair for pair in exclusions if set(pair) <= retained_ids}
        metadata[MODELING_METADATA] = ModelingMetadata(
            excluded_bonds=sorted(exclusions),
        ).model_dump(mode="json")
        after = after.model_copy(update={"metadata": metadata})
        if hydrogen_policy == "complete_if_possible":
            if isinstance(action, ModelDelete) and any(atoms[i].element == "H" for i in chosen):
                warnings.append(
                    model_warning(
                        "model_hydrogen_completion_skipped",
                        "Explicit hydrogen deletion was preserved; "
                        "automatic completion was skipped.",
                        action.operation,
                    )
                )
            else:
                remaining = {a.id for a in after.atoms}
                operands = sorted(touched & remaining)
                try:
                    completed = (
                        SelectionMolecularEditor()
                        .edit(
                            after,
                            operands,
                            HydrogenPrepare(operation="hydrogens.prepare"),
                            next_atom_id=max(
                                next_atom_id, max((a.id for a in after.atoms), default=0) + 1
                            ),
                            next_bond_id=max(
                                next_bond_id,
                                max(
                                    (b.id for b in after.bonds),
                                    default=0,
                                )
                                + 1,
                            ),
                        )
                        .edit
                    )
                    if len(completed.structure.atoms) > atom_limit:
                        raise InvalidModelEdit(
                            f"Hydrogen completion exceeds the entry limit of {atom_limit} atoms."
                        )
                    base_atoms = {a.id: a for a in after.atoms}
                    candidate_atoms = {a.id: a for a in completed.structure.atoms}
                    if not base_atoms.keys() <= candidate_atoms.keys():
                        raise InvalidModelEdit("Hydrogen completion would remove retained atoms.")
                    added = [a for a in completed.structure.atoms if a.id not in base_atoms]
                    if any(a.element != "H" for a in added):
                        raise InvalidModelEdit("Hydrogen completion produced a non-hydrogen atom.")
                    added_ids = {a.id for a in added}
                    old_bonds = {b.id for b in after.bonds}
                    hydrogen_bonds = [b for b in completed.structure.bonds if b.id not in old_bonds]
                    inherited = []
                    valid_residues = {r.id for r in after.residues}
                    for atom in added:
                        incident = [
                            b for b in hydrogen_bonds if atom.id in {b.atom_1_id, b.atom_2_id}
                        ]
                        if len(incident) != 1:
                            raise InvalidModelEdit(
                                "Hydrogen completion produced ambiguous connectivity."
                            )
                        bond = incident[0]
                        parent_id = bond.atom_2_id if bond.atom_1_id == atom.id else bond.atom_1_id
                        parent = base_atoms.get(parent_id)
                        if parent is None or parent.element == "H" or bond.order != 1:
                            raise InvalidModelEdit(
                                "Hydrogen completion needs a retained heavy parent."
                            )
                        inherited.append(
                            atom.model_copy(
                                update={
                                    "residue_id": parent.residue_id
                                    if parent.residue_id in valid_residues
                                    else None
                                }
                            )
                        )
                    if any(not added_ids & {b.atom_1_id, b.atom_2_id} for b in hydrogen_bonds):
                        raise InvalidModelEdit("Hydrogen completion would add unrelated bonds.")
                    # Consume only new H records. Retained atoms/bonds/stereo/coordinates
                    # remain exactly the requested direct draft, not a helper normalization.
                    after = after.model_copy(
                        update={
                            "atoms": [*after.atoms, *inherited],
                            "bonds": [*after.bonds, *hydrogen_bonds],
                            "conformers": [
                                c.model_copy(
                                    update={
                                        "coordinates": [
                                            *c.coordinates,
                                            *[a.coordinates for a in inherited],
                                        ]
                                    }
                                )
                                for c in after.conformers
                            ],
                            "inferences": [
                                *after.inferences,
                                *completed.structure.inferences[len(after.inferences) :],
                            ],
                        }
                    )
                    warnings.extend(completed.warnings)
                except (ValueError, RuntimeError, OverflowError) as error:
                    warnings.append(
                        model_warning(
                            "model_hydrogen_completion_skipped",
                            f"Direct edit saved; hydrogen completion unavailable: {error}",
                            action.operation,
                        )
                    )
        if len(after.atoms) > atom_limit:
            raise InvalidModelEdit(f"The result exceeds the entry limit of {atom_limit} atoms.")
        if isinstance(action, (ModelAtomAdd, ModelFragmentAdd)):
            old_ids = {a.id for a in before.atoms}
            created_indices = [i for i, a in enumerate(after.atoms) if a.id not in old_ids]
            retained_indices = [i for i, a in enumerate(after.atoms) if a.id in old_ids]
            closest = float("inf")
            if created_indices and retained_indices:
                for conformer in after.conformers:
                    retained_points = np.asarray(
                        [conformer.coordinates[i] for i in retained_indices]
                    )
                    new_points = np.asarray([conformer.coordinates[i] for i in created_indices])
                    closest = min(
                        closest, float(np.min(cKDTree(retained_points).query(new_points)[0]))
                    )
            if closest < 0.6:
                warnings.append(
                    model_warning(
                        "model_placement_clash",
                        f"A generated atom is {closest:.3f} angstrom from retained "
                        "material in a conformer; "
                        "review this unoptimized placement. The requested draft was retained.",
                        action.operation,
                        "coordinates",
                    )
                )
        warnings.extend(self._local_warnings(after, touched, action.operation))
        # Retain previous scientific/source warnings, replacing exact duplicates.
        unique = {(w.code, w.field, w.message): w for w in [*after.warnings, *warnings]}
        after = after.model_copy(update={"warnings": list(unique.values())})
        old_atoms = {a.id: a for a in before.atoms}
        new_atoms = {a.id: a for a in after.atoms}
        old_bonds = {b.id for b in before.bonds}
        new_bonds = {b.id for b in after.bonds}
        return SelectionEditResult(
            EditResult(
                structure=after,
                warnings=tuple(warnings),
                created_atom_ids=tuple(sorted(new_atoms.keys() - old_atoms.keys())),
                deleted_atom_ids=tuple(sorted(old_atoms.keys() - new_atoms.keys())),
                created_bond_ids=tuple(sorted(new_bonds - old_bonds)),
                deleted_bond_ids=tuple(sorted(old_bonds - new_bonds)),
                changed_atom_ids=tuple(
                    sorted(
                        i
                        for i in new_atoms.keys() & old_atoms.keys()
                        if new_atoms[i] != old_atoms[i] or i in touched
                    )
                ),
            ),
            replacements,
        )

    @staticmethod
    def _local_warnings(
        structure: NormalizedStructureV1,
        touched: set[int],
        operation: str,
    ) -> list[MolecularWarning]:
        result = [
            model_warning(
                "model_chemistry_unvalidated",
                "Direct edit saved. Chemistry is incomplete or "
                "unvalidated; no protonation, optimized geometry or preparation is implied.",
                operation,
            ),
            model_warning(
                "model_source_labels",
                "Retained source labels and properties describe the original "
                "structure; modified chemistry requires review.",
                operation,
                "metadata",
            ),
        ]
        if structure.source.format == "generated":
            result = [w for w in result if w.code != "model_source_labels"]
        atoms = {a.id: a for a in structure.atoms}
        neighbors: dict[int, list[Bond]] = {i: [] for i in touched & atoms.keys()}
        for bond in structure.bonds:
            for i in (bond.atom_1_id, bond.atom_2_id):
                if i in neighbors:
                    neighbors[i].append(bond)
            if touched & {bond.atom_1_id, bond.atom_2_id}:
                length = dist(atoms[bond.atom_1_id].coordinates, atoms[bond.atom_2_id].coordinates)
                if length < 0.4 or length > 3.0:
                    result.append(
                        model_warning(
                            "model_bond_geometry",
                            f"Bond {bond.id} is {length:.3f} angstrom; "
                            "review the unoptimized geometry.",
                            operation,
                            f"bonds.{bond.id}",
                        )
                    )
        if any(b.aromatic and touched & {b.atom_1_id, b.atom_2_id} for b in structure.bonds):
            result.append(
                model_warning(
                    "model_aromaticity_unvalidated",
                    "Aromatic labels near the edit were retained without validating rings; "
                    "the draft may contain unresolved aromaticity.",
                    operation,
                    "bonds",
                )
            )
        typical = {"H": 1, "C": 4, "N": 3, "O": 2, "F": 1, "Cl": 1, "Br": 1, "I": 1}
        for i, bonds in neighbors.items():
            atom = atoms[i]
            if atom.formal_charge is not None and abs(atom.formal_charge) > 8:
                result.append(
                    model_warning(
                        "model_unusual_charge",
                        f"Atom {i} has formal charge {atom.formal_charge}; chemistry and "
                        "chemical-format representability need review. "
                        "Canonical charge was retained.",
                        operation,
                        f"atoms.{i}.formal_charge",
                    )
                )
            if atom.formal_charge is None or any(b.order is None for b in bonds):
                result.append(
                    model_warning(
                        "model_chemistry_unknown",
                        f"Atom {i} has unknown charge or incident bond "
                        "order; these values were preserved.",
                        operation,
                        f"atoms.{i}",
                    )
                )
            if (
                atom.formal_charge == 0
                and not any(b.aromatic for b in bonds)
                and (
                    all(b.order is not None for b in bonds)
                    and sum(b.order or 0 for b in bonds) > typical.get(atom.element, 1000)
                )
            ):
                result.append(
                    model_warning(
                        "model_unusual_valence",
                        f"Atom {i} has bond valence above the typical "
                        f"neutral {atom.element} value; the requested draft was retained.",
                        operation,
                        f"atoms.{i}",
                    )
                )
        return result
