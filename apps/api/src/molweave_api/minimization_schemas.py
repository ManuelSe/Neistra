from __future__ import annotations

from typing import Literal

from molweave_core.minimization.contracts import CoordinateProposal, MinimizationReport
from molweave_core.selection import SelectionV1
from pydantic import BaseModel, ConfigDict, Field, model_validator


class MinimizationContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entry_id: str = Field(min_length=1)
    atom_ids: list[int] = Field(min_length=1, max_length=20_000)

    @model_validator(mode="after")
    def canonical_ids(self) -> MinimizationContext:
        if self.atom_ids != sorted(set(self.atom_ids)) or self.atom_ids[0] < 1:
            raise ValueError("Context atom IDs must be sorted, positive and unique")
        return self


class MinimizationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    mode: Literal["isolated", "environment", "automatic"] = "isolated"
    selection: SelectionV1
    context: list[MinimizationContext] = Field(default_factory=list, max_length=100)
    conformers: dict[str, int] = Field(default_factory=dict)
    max_iterations: int = Field(default=500, ge=1, le=2_000)

    @model_validator(mode="after")
    def bounded_selection(self) -> MinimizationCreate:
        if self.mode == "automatic" and (self.context or self.conformers):
            raise ValueError("Automatic mode captures context and active conformers on the server")
        if len(self.conformers) > 100 or any(value < 1 for value in self.conformers.values()):
            raise ValueError("Confirm at most 100 positive active conformer IDs")
        if not 1 <= len(self.selection.atoms) <= 2_000:
            raise ValueError("Select between 1 and 2000 movable atoms")
        entries = [c.entry_id for c in self.context]
        if len(entries) != len(set(entries)):
            raise ValueError("Context entries must be unique")
        if self.mode == "isolated" and (
            self.context or len({r.structure_id for r in self.selection.atoms}) != 1
        ):
            raise ValueError("Isolated mode requires one selected molecule and no extra context")
        if sum(len(c.atom_ids) for c in self.context) > 20_000:
            raise ValueError("Context exceeds 20000 atoms")
        return self


class MinimizationApply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    proposal_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class MinimizationProposalRead(BaseModel):
    schema_version: Literal[1] = 1
    job_id: str
    proposal_sha256: str
    report: MinimizationReport
    entries: list[CoordinateProposal]
    applicable: bool
    unavailable_reason: str | None = None


class MinimizationCapabilities(BaseModel):
    model: Literal["amber-local-v1"] = "amber-local-v1"
    available: bool
    unavailable_reason: str | None = None
    prerequisites: list[str]
    scientific_limits: list[str]
    limits: dict[str, int | float]
