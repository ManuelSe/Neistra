from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, FiniteFloat, model_validator

RESOLVER_VERSION = "ligand-instance-v3"


class LigandDesignationV1(BaseModel):
    """Durable intent and its assessed canonical membership, owned by one entry."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    schema_version: Literal[1] = 1
    status: Literal[
        "unresolved", "selection_required", "not_applicable", "cleared", "resolved", "stale"
    ] = "unresolved"
    source_artifact_id: str | None = None
    instance_id: str | None = None
    atom_ids: list[int] = Field(default_factory=list)
    origin: Literal["automatic_single_candidate", "manual"] | None = None
    selected_at: AwareDatetime | None = None
    reason_code: str | None = None
    resolver_version: str | None = None
    assessed_at: AwareDatetime | None = None
    assessed_revision: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_state(self) -> LigandDesignationV1:
        if self.atom_ids != sorted(set(self.atom_ids)) or any(i < 1 for i in self.atom_ids):
            raise ValueError("Ligand atom IDs must be positive, unique and sorted")
        assigned = self.status in {"resolved", "stale"}
        if assigned:
            if not self.instance_id or not self.atom_ids or not self.origin or not self.selected_at:
                raise ValueError("Assigned ligand requires identity, membership and provenance")
            UUID(self.instance_id)
            if not self.source_artifact_id:
                raise ValueError("Assigned ligand intent requires its assessed source artifact")
        elif self.instance_id or self.atom_ids or self.origin or self.selected_at:
            raise ValueError("Unassigned ligand state must not carry an active reference")
        if self.status == "stale" and not self.reason_code:
            raise ValueError("Stale ligand intent requires a recovery reason")
        return self


class LigandLocationV1(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    residue_id: int
    residue_name: str
    chain_id: int | None = None
    chain_name: str | None = None
    author_number: int | None = None
    insertion_code: str | None = None
    source_entity_id: str | None = None
    source_asym_id: str | None = None


class LigandCandidateV1(BaseModel):
    """A current candidate key is separate from durable designation identity."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    candidate_key: str
    atom_ids: list[int]
    residue_ids: list[int] = Field(default_factory=list)
    component_ids: list[str] = Field(default_factory=list)
    label: str
    locations: list[LigandLocationV1] = Field(default_factory=list)
    boundary_status: Literal["qualified", "source_instance", "unsupported", "ineligible"]
    potential_ligand: bool = True
    reason_codes: list[str] = Field(default_factory=list)
    provenance: list[str] = Field(default_factory=list)
    heavy_atom_count: int | None = Field(default=None, ge=0)
    formal_charge: int | None = None
    formula: str | None = None
    molecular_weight: FiniteFloat | None = None
    chemistry_status: Literal["qualified", "unavailable"] = "unavailable"
    chemistry_reason: str | None = "chemical_representation_not_qualified"
    chemical_input_hash: str | None = None

    @model_validator(mode="after")
    def validate_membership(self) -> LigandCandidateV1:
        if not self.atom_ids or self.atom_ids != sorted(set(self.atom_ids)):
            raise ValueError("Candidate membership must be complete, unique and sorted")
        if any(i < 1 for i in self.atom_ids):
            raise ValueError("Candidate atom IDs must be positive")
        return self

    @property
    def selectable(self) -> bool:
        return self.boundary_status in {"qualified", "source_instance"}

    @property
    def automatic_eligible(self) -> bool:
        return self.boundary_status == "qualified"


class LigandInventoryV1(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    schema_version: Literal[1] = 1
    resolver_version: str = RESOLVER_VERSION
    input_hash: str
    candidates: list[LigandCandidateV1]
    warnings: list[str] = Field(default_factory=list)

    @property
    def automatic_candidate(self) -> LigandCandidateV1 | None:
        potential = [
            c for c in self.candidates if c.potential_ligand and c.boundary_status != "ineligible"
        ]
        return potential[0] if len(potential) == 1 and potential[0].automatic_eligible else None
