"""Immutable scientific content, independent of project/source publication ownership."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    model_validator,
)

DescriptorNumber = StrictInt | Annotated[float, Field(strict=True, allow_inf_nan=False)]
DescriptorCategory = Literal["composition", "polarity", "lipophilicity", "flexibility"]


class DescriptorDefinition(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    name: str
    description: str
    category: DescriptorCategory
    order: int = Field(ge=0)
    unit: str | None
    value_type: Literal["integer", "float"]
    method: str
    implementation_version: str
    library_version: str
    policy_version: str
    plot_domain: tuple[float, float]
    depends_on: Literal["qualified_graph", "observed_elements", "qualified_atomic_charge"]

    @model_validator(mode="after")
    def increasing_plot_domain(self) -> DescriptorDefinition:
        if not self.plot_domain[0] < self.plot_domain[1]:
            raise ValueError("Plot domains must have increasing endpoints")
        return self


class DescriptorValue(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    descriptor_id: str
    status: Literal["ready", "unavailable", "error"]
    value: DescriptorNumber | None = None
    reason: str | None = None

    @model_validator(mode="after")
    def complete_outcome(self) -> DescriptorValue:
        if self.status == "ready":
            if self.value is None or self.reason is not None:
                raise ValueError("A ready descriptor requires a finite value and no failure reason")
        elif self.value is not None or not self.reason:
            raise ValueError("An unavailable/error descriptor requires a reason and no value")
        return self


class DescriptorReport(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    schema_version: Literal[1] = 1
    input_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    implementation_version: str
    library_version: str
    policy_version: str
    created_at: AwareDatetime
    model_status: Literal["qualified", "unavailable"]
    model_reason: str | None = None
    provenance: tuple[str, ...] = ()
    contains_formally_charged_atoms: StrictBool | None
    coverage: tuple[str, ...]
    values: tuple[DescriptorValue, ...]

    @model_validator(mode="after")
    def complete_coverage(self) -> DescriptorReport:
        if self.coverage != tuple(value.descriptor_id for value in self.values):
            raise ValueError("Report coverage must exactly describe its ordered outcomes")
        if len(set(self.coverage)) != len(self.coverage):
            raise ValueError("Report coverage cannot contain duplicate descriptors")
        if (self.model_status == "qualified") != (self.model_reason is None):
            raise ValueError("Unavailable model preparation requires a reason")
        return self

    def get_value(self, descriptor_id: str) -> DescriptorValue:
        for value in self.values:
            if value.descriptor_id == descriptor_id:
                return value
        raise KeyError(descriptor_id)
