"""Typed current-model bond exclusions shared by editors and chemistry services."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator

from neistra_core.molecular import NormalizedStructureV1

MODELING_METADATA = "neistra_modeling"


class InvalidModelingMetadata(ValueError):
    pass


class ModelingMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: Literal[1] = 1
    excluded_bonds: list[tuple[StrictInt, StrictInt]] = Field(default_factory=list)

    @field_validator("schema_version", mode="before")
    @classmethod
    def numeric_schema_version(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("Modeling metadata schema version must be numeric, not boolean.")
        return value

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
        raise InvalidModelingMetadata(
            "Unsupported or invalid authored modeling metadata."
        ) from error
    ids = {a.id for a in structure.atoms}
    if any(a not in ids or b not in ids for a, b in metadata.excluded_bonds):
        raise InvalidModelingMetadata("Authored bond exclusions reference missing atoms.")
    pairs = {tuple(sorted((b.atom_1_id, b.atom_2_id))) for b in structure.bonds}
    if pairs.intersection(metadata.excluded_bonds):
        raise InvalidModelingMetadata("Authored bonds contradict recorded bond exclusions.")
    return metadata


def update_bond_exclusions(
    before: NormalizedStructureV1, after: NormalizedStructureV1
) -> NormalizedStructureV1:
    """Retain deliberate deletions while pruning removed atoms and restored edges."""
    previous = modeling_metadata(before)
    retained = {a.id for a in after.atoms}
    before_pairs = {tuple(sorted((b.atom_1_id, b.atom_2_id))) for b in before.bonds}
    after_pairs = {tuple(sorted((b.atom_1_id, b.atom_2_id))) for b in after.bonds}
    exclusions = {
        pair for pair in set(previous.excluded_bonds) | (before_pairs - after_pairs)
        if set(pair) <= retained and pair not in after_pairs
    }
    # Preserve absent metadata for operations that do not need authored intent.
    if not exclusions and MODELING_METADATA not in before.metadata:
        return after
    metadata = dict(after.metadata)
    metadata[MODELING_METADATA] = ModelingMetadata(
        excluded_bonds=sorted(exclusions)
    ).model_dump(mode="json")
    result = after.model_copy(update={"metadata": metadata})
    modeling_metadata(result)
    return result


def project_modeling_metadata(
    source: NormalizedStructureV1, atom_ids: Iterable[int]
) -> dict[str, object]:
    """Validate the full source, then prune only a disposable projection's pairs."""
    current = modeling_metadata(source)
    metadata: dict[str, object] = dict(source.metadata)
    if MODELING_METADATA in metadata:
        retained = set(atom_ids)
        metadata[MODELING_METADATA] = ModelingMetadata(
            excluded_bonds=[p for p in current.excluded_bonds if set(p) <= retained]
        ).model_dump(mode="json")
    return metadata
