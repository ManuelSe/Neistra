"""Bounded aggregate descriptor and installation-preference contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from neistra_core.ligand_properties.models import (
    DescriptorCategory,
    DescriptorDefinition,
    DescriptorReport,
)
from neistra_core.ligand_properties.registry import descriptor_coverage
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator

DEFAULT_CATEGORIES: tuple[DescriptorCategory, ...] = (
    "composition",
    "polarity",
    "lipophilicity",
    "flexibility",
)
MAX_AGGREGATE_ENTRIES = 200
MAX_SOURCE_ATOMS = 16_384
MAX_AGGREGATE_ATOMS = 65_536


class PropertyModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class LigandPropertyRegistryRead(PropertyModel):
    definitions: tuple[DescriptorDefinition, ...]
    implementation_version: str
    policy_version: str
    library_version: str


class LigandPropertyPreferencesRead(PropertyModel):
    schema_version: Literal[1] = 1
    revision: StrictInt = Field(ge=0)
    enabled_categories: tuple[DescriptorCategory, ...]
    default_categories: tuple[DescriptorCategory, ...] = DEFAULT_CATEGORIES
    updated_at: datetime | None = None


class LigandPropertyPreferencesUpdate(PropertyModel):
    expected_revision: StrictInt = Field(ge=0)
    enabled_categories: tuple[DescriptorCategory, ...]

    @field_validator("enabled_categories")
    @classmethod
    def unique_categories(
        cls, value: tuple[DescriptorCategory, ...]
    ) -> tuple[DescriptorCategory, ...]:
        if len(set(value)) != len(value):
            raise ValueError("Categories must be unique")
        return tuple(category for category in DEFAULT_CATEGORIES if category in value)


class LigandPropertySource(PropertyModel):
    entry_id: str = Field(min_length=1, max_length=36)
    source_artifact_id: str = Field(min_length=1, max_length=36)
    instance_id: str
    atom_ids: tuple[StrictInt, ...] = Field(min_length=1, max_length=MAX_SOURCE_ATOMS)

    @field_validator("instance_id")
    @classmethod
    def valid_instance(cls, value: str) -> str:
        UUID(value)
        return value

    @field_validator("atom_ids")
    @classmethod
    def canonical_membership(cls, value: tuple[int, ...]) -> tuple[int, ...]:
        if value != tuple(sorted(set(value))) or value[0] < 1:
            raise ValueError("Membership must be positive, unique and sorted")
        return value


class LigandPropertyReadRequest(PropertyModel):
    entries: tuple[LigandPropertySource, ...] = Field(max_length=MAX_AGGREGATE_ENTRIES)
    descriptor_ids: tuple[str, ...] = Field(max_length=14)

    @field_validator("descriptor_ids")
    @classmethod
    def known_coverage(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(value) != len(set(value)):
            raise ValueError("Descriptor IDs must be unique")
        return descriptor_coverage(value)

    @model_validator(mode="after")
    def unique_entries(self) -> LigandPropertyReadRequest:
        if len({source.entry_id for source in self.entries}) != len(self.entries):
            raise ValueError("Aggregate entries must be unique")
        if sum(len(source.atom_ids) for source in self.entries) > MAX_AGGREGATE_ATOMS:
            raise ValueError("Aggregate membership exceeds the supported input budget")
        return self


class LigandPropertyConsumerUpdate(LigandPropertyReadRequest):
    sequence: StrictInt = Field(ge=1, le=9_007_199_254_740_991)
    active_entry_id: str | None = Field(default=None, max_length=36)

    @model_validator(mode="after")
    def active_is_requested(self) -> LigandPropertyConsumerUpdate:
        if self.active_entry_id is not None and self.active_entry_id not in {
            source.entry_id for source in self.entries
        }:
            raise ValueError("Active entry must belong to the requested aggregate")
        return self


class LigandPropertyCurrentRead(PropertyModel):
    source: LigandPropertySource
    binding_key: str
    status: Literal["pending", "ready", "unavailable", "cancelled", "failed"]
    report: DescriptorReport | None = None
    reason: str | None = None
    progress: float = Field(default=0, ge=0, le=100, allow_inf_nan=False)


class LigandPropertyAggregateRead(PropertyModel):
    project_id: str
    entries: tuple[LigandPropertyCurrentRead, ...]
    consumer_id: str | None = None
    sequence: int | None = None
    expires_at: datetime | None = None
