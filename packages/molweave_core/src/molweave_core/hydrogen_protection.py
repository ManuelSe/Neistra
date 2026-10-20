"""Narrow source identity evidence, not a canonical isotope/radical chemistry model."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from molweave_core.molecular import Atom, MolecularWarning, NormalizedStructureV1

PROTECTION_KIND: Literal["neistra_hydrogen_protection"] = "neistra_hydrogen_protection"


class AtomProtection(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
    atom_id: int = Field(ge=1)
    element: str
    source_index: int = Field(ge=0)
    isotope: int | None = Field(default=None, ge=0)
    radical_electrons: int | None = Field(default=None, ge=0)

    @property
    def ordinary(self) -> bool:
        return self.isotope == 0 and self.radical_electrons == 0

    def matches(self, atom: Atom) -> bool:
        return (self.atom_id, self.element, self.source_index) == (
            atom.id,
            atom.element,
            atom.source_index,
        )


class ProtectionRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
    kind: Literal["neistra_hydrogen_protection"] = PROTECTION_KIND
    schema_version: Literal[1] = 1
    origin: Literal["import", "generated", "original_recovery"]
    atoms: list[AtomProtection]

    @model_validator(mode="after")
    def unique_atoms(self) -> ProtectionRecord:
        if len({a.atom_id for a in self.atoms}) != len(self.atoms):
            raise ValueError("Protection evidence must have unique atom identities.")
        return self


def protection_facts(structure: NormalizedStructureV1) -> dict[int, AtomProtection]:
    """Malformed/contradictory evidence never proves an atom ordinary."""
    facts: dict[int, AtomProtection] = {}
    for annotation in structure.annotations:
        if annotation.get("kind") != PROTECTION_KIND:
            continue
        record = ProtectionRecord.model_validate(annotation)
        for fact in record.atoms:
            if fact.atom_id in facts and facts[fact.atom_id] != fact:
                raise ValueError("Contradictory hydrogen protection evidence.")
            facts[fact.atom_id] = fact
    return facts


def protection_annotation(
    atoms: Iterable[AtomProtection], origin: Literal["import", "generated", "original_recovery"]
) -> dict[str, object]:
    return ProtectionRecord(origin=origin, atoms=list(atoms)).model_dump(mode="json")


def ordinary_generated(atoms: Iterable[Atom]) -> dict[str, object]:
    return protection_annotation(
        (
            AtomProtection(
                atom_id=a.id,
                element=a.element,
                source_index=a.source_index,
                isotope=0,
                radical_electrons=0,
            )
            for a in atoms
        ),
        "generated",
    )


def authored_protection(
    before: NormalizedStructureV1, atoms: list[Atom], generated_ids: set[int]
) -> list[dict[str, object]]:
    """Record explicit new ordinary atoms and verified ordinary element replacements.

    Never replace protected/unknown/conflicting facts with RDKit's defaults.
    Original uploads and preceding artifacts retain the pre-edit identity.
    """
    old = {atom.id: atom for atom in before.atoms}
    changed: set[int] = set()
    try:
        facts = protection_facts(before)
        changed = {
            atom.id
            for atom in atoms
            if atom.id in old
            and atom.element != old[atom.id].element
            and atom.id in facts
            and facts[atom.id].matches(old[atom.id])
            and facts[atom.id].ordinary
        }
    except ValueError:
        pass  # Do not repair malformed evidence as a side effect of editing.
    annotations = []
    for annotation in before.annotations:
        if changed and annotation.get("kind") == PROTECTION_KIND:
            annotation = {
                **annotation,
                "atoms": [row for row in annotation["atoms"] if row["atom_id"] not in changed],
            }
        annotations.append(annotation)
    authored = [atom for atom in atoms if atom.id in generated_ids | changed]
    if authored:
        annotations.append(ordinary_generated(authored))
    return annotations


def recover_protection(
    current: NormalizedStructureV1, original: NormalizedStructureV1
) -> NormalizedStructureV1:
    """Recover only verified stable import identity; never coordinates/names alone.

    Callers parse the preserved original record with bounded existing adapters.
    Old source facts, bytes and the input artifact remain untouched.
    """
    if (current.source.format, current.source.record_index) != (
        original.source.format,
        original.source.record_index,
    ):
        return current
    try:
        existing = protection_facts(current)
        source = protection_facts(original)
    except ValueError:
        return current
    original_atoms = {a.id: a for a in original.atoms}
    recovered = []
    for atom in current.atoms:
        prior = original_atoms.get(atom.id)
        fact = source.get(atom.id)
        if (
            atom.id not in existing
            and prior
            and fact
            and fact.matches(atom)
            and (atom.residue_id, atom.alternate_location)
            == (prior.residue_id, prior.alternate_location)
        ):
            recovered.append(fact)
    if not recovered:
        return current
    return current.model_copy(
        update={
            "annotations": [
                *current.annotations,
                protection_annotation(recovered, "original_recovery"),
            ]
        }
    )


def protection_import_warnings(facts: Iterable[AtomProtection]) -> list[MolecularWarning]:
    if not any(not f.ordinary for f in facts):
        return []
    return [
        MolecularWarning(
            code="isotope_radical_protection_only",
            operation="import",
            field="annotations",
            message="Source isotope/radical labels were retained as protection facts and original "
            "uploads, not complete canonical isotope/radical chemistry. Review display "
            "and chemical export limits; native archives retain the evidence.",
        )
    ]
