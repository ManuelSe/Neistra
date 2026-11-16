from __future__ import annotations

from typing import Literal

from neistra_core.ligands.models import LigandCandidateV1, LigandDesignationV1
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

from neistra_api.schemas import ArtifactRead


class LigandCandidatesRead(BaseModel):
    project_id: str
    entry_id: str
    artifact_id: str | None
    designation: LigandDesignationV1
    input_hash: str
    resolver_version: str
    total: int
    offset: int
    limit: int
    candidates: list[LigandCandidateV1]
    selectable_candidate_keys: list[str]
    designated_candidate: LigandCandidateV1 | None = None
    warnings: list[str]


class LigandDesignationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0)
    expected_artifact_id: str | None
    candidate_key: str | None = Field(default=None, min_length=1, max_length=160)
    expected_input_hash: str | None = Field(default=None, min_length=64, max_length=64)
    clear: bool = False

    @model_validator(mode="after")
    def one_action(self) -> LigandDesignationCreate:
        if self.clear == bool(self.candidate_key):
            raise ValueError("Choose one candidate or explicitly clear the designation")
        return self


class LigandResolveCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0)
    entry_ids: list[str] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def distinct_entries(self) -> LigandResolveCreate:
        if len(set(self.entry_ids)) != len(self.entry_ids):
            raise ValueError("Resolve each entry once per batch")
        return self


class LigandDepictionRead(BaseModel):
    entry_id: str
    artifact_id: str | None
    candidate_key: str
    status: Literal["ready", "unavailable", "busy"]
    reason: str | None = None
    input_hash: str | None = None
    cache_key: str | None = None
    artifact: ArtifactRead | None = None
    implementation: str
    library_version: str
    formula: str | None = None
    molecular_weight: FiniteFloat | None = None
    formal_charge: int | None = None
    provenance: str | None = None
