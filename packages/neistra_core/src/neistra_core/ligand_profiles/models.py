"""Versioned profile data; numerical evaluation belongs to the current browser owner."""

from __future__ import annotations

import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, model_validator

from neistra_core.ligand_properties.models import DescriptorDefinition

Identifier = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_-]{0,79}$")]
FiniteNumber = StrictInt | Annotated[float, Field(strict=True, allow_inf_nan=False)]
Operator = Literal["lt", "le", "gt", "ge"]
NumericRule = Literal["finite", "nonnegative_integer", "safe_integer", "fraction_0_1"]


def descriptor_numeric_rule(descriptor: DescriptorDefinition) -> NumericRule:
    """Declared input policy for the current catalog, separate from plotting ranges."""
    if descriptor.id == "fraction_sp3":
        return "fraction_0_1"
    if descriptor.value_type == "integer":
        return "safe_integer" if descriptor.id == "formal_charge" else "nonnegative_integer"
    return "finite"


class ProfileData(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class DescriptorMethod(ProfileData):
    implementation_version: str = Field(min_length=1, max_length=160)
    policy_version: str = Field(min_length=1, max_length=160)
    library_version: str = Field(min_length=1, max_length=160)


class ProfileSource(ProfileData):
    id: Identifier
    title: str = Field(min_length=1, max_length=500)
    doi: str = Field(min_length=1, max_length=250)
    url: str = Field(pattern=r"^https://", max_length=1000)
    scope: str = Field(min_length=1, max_length=2000)


class ProfileConstraint(ProfileData):
    id: Identifier
    descriptor_id: Identifier
    operator: Operator
    limit: FiniteNumber


class FilterBound(ProfileData):
    value: FiniteNumber
    inclusive: StrictBool


class ProfileFilterRange(ProfileData):
    descriptor_id: Identifier
    minimum: FilterBound | None = None
    maximum: FilterBound | None = None

    @model_validator(mode="after")
    def nonempty_interval(self) -> ProfileFilterRange:
        if self.minimum is None and self.maximum is None:
            raise ValueError("A filter interval requires a bound")
        if self.minimum is not None and self.maximum is not None:
            lower, upper = self.minimum.value, self.maximum.value
            if lower > upper or (
                lower == upper and not (self.minimum.inclusive and self.maximum.inclusive)
            ):
                raise ValueError("Contradictory profile bounds")
        return self


class ProfileAxis(ProfileData):
    id: Identifier
    descriptor_id: Identifier
    numeric_rule: NumericRule
    domain: tuple[FiniteNumber, FiniteNumber]
    normalization: Literal["linear"] = "linear"
    clipping: Literal["mark_and_clip"] = "mark_and_clip"
    missing: Literal["leave_missing"] = "leave_missing"

    @model_validator(mode="after")
    def finite_increasing_domain(self) -> ProfileAxis:
        lower, upper = self.domain
        if not lower < upper or not math.isfinite(upper - lower):
            raise ValueError("An axis requires a finite increasing display domain")
        return self


class ProfileDefinition(ProfileData):
    id: Identifier
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=2000)
    definition_version: str = Field(min_length=1, max_length=160)
    availability: Literal["available", "unavailable"]
    unavailable_reason: str | None = Field(default=None, max_length=2000)
    missing_inputs: tuple[str, ...] = Field(default=(), max_length=16)
    source_ids: tuple[Identifier, ...] = Field(min_length=1, max_length=8)
    adaptations: tuple[str, ...] = Field(min_length=1, max_length=16)
    constraint_ids: tuple[Identifier, ...] = Field(default=(), max_length=32)
    component_ids: tuple[Identifier, ...] = Field(default=(), max_length=8)
    required_descriptor_ids: tuple[Identifier, ...] = Field(default=(), max_length=64)
    source_domain: Literal["qualified_representation", "no_formally_charged_atoms"] = (
        "qualified_representation"
    )
    axis_ids: tuple[Identifier, ...] = Field(min_length=1, max_length=64)
    default_filter_ranges: tuple[ProfileFilterRange, ...] = Field(default=(), max_length=64)

    @model_validator(mode="after")
    def coherent_availability(self) -> ProfileDefinition:
        for values in (
            self.source_ids,
            self.constraint_ids,
            self.component_ids,
            self.required_descriptor_ids,
            self.axis_ids,
            self.missing_inputs,
        ):
            if len(values) != len(set(values)):
                raise ValueError("Profile references cannot be duplicated")
        if self.availability == "available":
            if bool(self.constraint_ids) == bool(self.component_ids):
                raise ValueError("Available profiles require constraints or component profiles")
            if self.unavailable_reason is not None or self.missing_inputs:
                raise ValueError("Available profiles cannot report missing prerequisites")
        elif (
            not self.unavailable_reason
            or self.constraint_ids
            or self.component_ids
            or self.required_descriptor_ids
            or self.default_filter_ranges
        ):
            raise ValueError("Unavailable profiles require a reason and no executable constraints")
        return self


def intersect_constraints(
    constraints: tuple[ProfileConstraint, ...], descriptor_order: tuple[str, ...]
) -> tuple[ProfileFilterRange, ...]:
    """Derive filter metadata from operators, preserving strict endpoints exactly."""
    ranges: dict[str, dict[str, FilterBound]] = {}
    for constraint in constraints:
        bounds = ranges.setdefault(constraint.descriptor_id, {})
        side = "maximum" if constraint.operator in {"lt", "le"} else "minimum"
        proposed = FilterBound(
            value=constraint.limit, inclusive=constraint.operator in {"le", "ge"}
        )
        previous = bounds.get(side)
        tighter = previous is None or (
            proposed.value < previous.value
            if side == "maximum"
            else proposed.value > previous.value
        )
        if previous is not None and proposed.value == previous.value:
            proposed = FilterBound(
                value=proposed.value, inclusive=proposed.inclusive and previous.inclusive
            )
            tighter = True
        if tighter:
            bounds[side] = proposed
    return tuple(
        ProfileFilterRange(
            descriptor_id=descriptor,
            minimum=ranges[descriptor].get("minimum"),
            maximum=ranges[descriptor].get("maximum"),
        )
        for descriptor in descriptor_order
        if descriptor in ranges
    )


class ProfileRegistry(ProfileData):
    schema_version: Literal[1] = 1
    registry_version: str = Field(min_length=1, max_length=160)
    descriptor_method: DescriptorMethod
    descriptors: tuple[DescriptorDefinition, ...] = Field(min_length=1, max_length=64)
    sources: tuple[ProfileSource, ...] = Field(min_length=1, max_length=64)
    constraints: tuple[ProfileConstraint, ...] = Field(min_length=1, max_length=256)
    axes: tuple[ProfileAxis, ...] = Field(min_length=1, max_length=64)
    profiles: tuple[ProfileDefinition, ...] = Field(min_length=1, max_length=64)
    limitations: tuple[str, ...] = Field(min_length=1, max_length=16)

    @model_validator(mode="after")
    def validate_references_and_derived_metadata(self) -> ProfileRegistry:
        for collection in (
            self.descriptors,
            self.sources,
            self.constraints,
            self.axes,
            self.profiles,
        ):
            ids = [item.id for item in collection]
            if len(set(ids)) != len(ids):
                raise ValueError("Registry identifiers must be unique within each collection")
        descriptors = {item.id: item for item in self.descriptors}
        sources = {item.id for item in self.sources}
        constraints = {item.id: item for item in self.constraints}
        axes = {item.id: item for item in self.axes}
        profiles = {item.id: item for item in self.profiles}
        orders = [item.order for item in self.descriptors]
        if orders != list(range(len(orders))):
            raise ValueError("Descriptor catalog must retain contiguous stable order")
        method = self.descriptor_method.model_dump()
        for descriptor in self.descriptors:
            if any(getattr(descriptor, key) != value for key, value in method.items()):
                raise ValueError("All descriptors must match the registry's method identity")
            lower, upper = descriptor.plot_domain
            if not all(math.isfinite(value) for value in (lower, upper, upper - lower)):
                raise ValueError("Descriptor plot domains must be finite")
        for constraint in self.constraints:
            if constraint.descriptor_id not in descriptors:
                raise ValueError("Unknown constraint descriptor")
            descriptor = descriptors[constraint.descriptor_id]
            if descriptor.value_type == "integer" and (
                int(constraint.limit) != constraint.limit or abs(constraint.limit) > 2**53 - 1
            ):
                raise ValueError("Integer descriptor limits must be safe integers")
        if {axis.descriptor_id for axis in self.axes} != descriptors.keys():
            raise ValueError("Axes must describe every catalog descriptor exactly once")
        if len({axis.descriptor_id for axis in self.axes}) != len(self.axes):
            raise ValueError("Duplicate axis descriptor")
        for axis in self.axes:
            descriptor = descriptors[axis.descriptor_id]
            if tuple(axis.domain) != descriptor.plot_domain:
                raise ValueError("Axis domains must reuse descriptor display domains")
            if axis.numeric_rule != descriptor_numeric_rule(descriptor):
                raise ValueError("Axis numeric validation must match declared catalog semantics")

        active: set[str] = set()
        flattened: dict[str, tuple[ProfileConstraint, ...]] = {}

        def visit(profile_id: str) -> tuple[ProfileConstraint, ...]:
            if profile_id in active:
                raise ValueError("Composite profiles cannot contain a cycle")
            if profile_id in flattened:
                return flattened[profile_id]
            profile = profiles.get(profile_id)
            if profile is None:
                raise ValueError("Unknown component profile")
            active.add(profile_id)
            combined: dict[str, ProfileConstraint] = {}
            for constraint_id in profile.constraint_ids:
                if constraint_id not in constraints:
                    raise ValueError("Unknown profile constraint")
                combined[constraint_id] = constraints[constraint_id]
            for component_id in profile.component_ids:
                component = profiles.get(component_id)
                if component is None or component.availability != "available":
                    raise ValueError("Components must reference available profiles")
                if component.source_domain != profile.source_domain:
                    raise ValueError("Composite source domains must agree")
                for constraint in visit(component_id):
                    combined[constraint.id] = constraint
            active.remove(profile_id)
            flattened[profile_id] = tuple(combined.values())
            return flattened[profile_id]

        descriptor_order = tuple(descriptors)
        for profile in self.profiles:
            if not set(profile.source_ids).issubset(sources):
                raise ValueError("Unknown profile citation")
            if not set(profile.axis_ids).issubset(axes):
                raise ValueError("Unknown profile axis")
            selected = visit(profile.id)
            required = {constraint.descriptor_id for constraint in selected}
            if profile.required_descriptor_ids != tuple(
                key for key in descriptor_order if key in required
            ):
                raise ValueError("Required descriptors must match flattened constraints")
            if profile.default_filter_ranges != intersect_constraints(selected, descriptor_order):
                raise ValueError("Default filters must derive exactly from shared constraints")
        return self
