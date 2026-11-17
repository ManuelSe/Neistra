"""Data-only ownership and bounded transport for ephemeral contact reads."""

from __future__ import annotations

import hashlib
from typing import Literal

from neistra_core.contacts import DEFAULT_CONTACT_LIMITS, ContactLimits
from pydantic import BaseModel, ConfigDict, Field, model_validator

from neistra_api.edit_execution_data import FileDescriptor, ImmutableEditInput


class ContactPolicy(BaseModel):
    """Measured admission policy; integrated API qualification is still required."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True, allow_inf_nan=False)

    implementation: Literal["contacts-stream-v2"] = "contacts-stream-v2"
    max_input_atoms: int = Field(default=DEFAULT_CONTACT_LIMITS.max_input_atoms, ge=0)
    max_raw_visits: int = Field(default=DEFAULT_CONTACT_LIMITS.max_raw_visits, ge=0)
    max_results: int = Field(default=DEFAULT_CONTACT_LIMITS.max_results, ge=0)
    max_source_bytes: int = Field(default=64 * 1024**2, gt=0)
    max_response_bytes: int = Field(default=64 * 1024**2, ge=2)
    timeout_seconds: float = Field(default=15.0, gt=0)
    max_worker_rss_bytes: int = Field(default=1024**3, gt=0)
    cleanup_grace_seconds: float = Field(default=2.0, gt=0)

    @property
    def key(self) -> str:
        return hashlib.sha256(self.model_dump_json().encode()).hexdigest()

    @property
    def core_limits(self) -> ContactLimits:
        return ContactLimits(
            max_input_atoms=self.max_input_atoms,
            max_raw_visits=self.max_raw_visits,
            max_results=self.max_results,
        )


DEFAULT_CONTACT_POLICY = ContactPolicy()


class ContactSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True, allow_inf_nan=False)

    operation_id: str = Field(min_length=1, max_length=128)
    project_id: str = Field(min_length=1, max_length=128)
    entry_id: str = Field(min_length=1, max_length=128)
    declared_atom_count: int = Field(ge=0)
    source: ImmutableEditInput
    data_root: str
    cutoff: float = Field(gt=0, le=10)
    minimum_distance: float = Field(ge=0, lt=10)
    policy: ContactPolicy

    @model_validator(mode="after")
    def input_admission(self) -> ContactSnapshot:
        if self.minimum_distance >= self.cutoff:
            raise ValueError("Minimum contact distance must be smaller than the cutoff")
        if self.source.size > self.policy.max_source_bytes:
            raise ValueError("Contact input exceeds its source-byte budget")
        if self.declared_atom_count > self.policy.max_input_atoms:
            raise ValueError("Contact input exceeds its atom budget")
        return self


class ContactResponseDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    filename: Literal["response.json"] = "response.json"
    size: int = Field(ge=2)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    def file_descriptor(self) -> FileDescriptor:
        return FileDescriptor(filename=self.filename, size=self.size, sha256=self.sha256)


class ContactCompletion(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    kind: Literal["result"] = "result"
    operation_id: str
    project_id: str
    entry_id: str
    artifact_id: str
    policy_key: str = Field(pattern=r"^[0-9a-f]{64}$")
    count: int = Field(ge=0)
    response: ContactResponseDescriptor

    def check_owner(self, snapshot: ContactSnapshot) -> None:
        if (
            self.operation_id != snapshot.operation_id
            or self.project_id != snapshot.project_id
            or self.entry_id != snapshot.entry_id
            or self.artifact_id != snapshot.source.artifact_id
            or self.policy_key != snapshot.policy.key
        ):
            raise ValueError("Contact completion does not belong to the captured input")
        if self.count > snapshot.policy.max_results:
            raise ValueError("Contact completion exceeds its result budget")
        if self.response.size > snapshot.policy.max_response_bytes:
            raise ValueError("Contact completion exceeds its response-byte budget")


class ContactRejection(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    kind: Literal["query", "geometry", "capacity", "input", "failed"]
    message: str = Field(min_length=1, max_length=240)
