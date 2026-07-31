from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path, PurePath
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, model_validator

from molweave_core.molecular import MolecularWarning


class JobContractError(ValueError):
    """Raised when a plugin declaration or returned artifact is invalid."""


class JobCancelled(RuntimeError):
    """Raised cooperatively when a running job observes cancellation."""


class InputRole(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    role: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_.-]*$")
    label: str = Field(min_length=1, max_length=80)
    minimum: int = Field(default=0, ge=0, le=100)
    maximum: int = Field(default=1, ge=1, le=100)
    structure_types: tuple[str, ...] = ()

    @model_validator(mode="after")
    def valid_cardinality(self) -> InputRole:
        if self.maximum < self.minimum:
            raise ValueError("Input-role maximum must be at least its minimum")
        return self


class ResultRole(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    role: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_.-]*$")
    label: str = Field(min_length=1, max_length=80)
    media_types: tuple[str, ...] = Field(min_length=1)
    importable_structure: bool = False


class ResourcePolicy(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    wall_time_seconds: float = Field(default=300.0, gt=0, le=86_400)
    cancellation_grace_seconds: float = Field(default=2.0, ge=0.1, le=30)
    max_result_artifacts: int = Field(default=16, ge=1, le=1_000)
    max_result_bytes: int = Field(default=100 * 1024 * 1024, ge=1)
    cpu_time_seconds: int | None = Field(default=None, ge=1, le=86_400)
    memory_bytes: int | None = Field(default=None, ge=16 * 1024 * 1024)


@dataclass(frozen=True, slots=True)
class JobDefinition:
    job_type: str
    implementation_version: str
    label: str
    description: str
    parameter_model: type[BaseModel]
    input_roles: tuple[InputRole, ...]
    result_roles: tuple[ResultRole, ...]
    resources: ResourcePolicy = field(default_factory=ResourcePolicy)

    def __post_init__(self) -> None:
        if not self.job_type or len(self.job_type) > 120:
            raise JobContractError("Job type must contain 1 to 120 characters")
        if not self.implementation_version or len(self.implementation_version) > 64:
            raise JobContractError("Implementation version must contain 1 to 64 characters")
        if not self.label or not self.description:
            raise JobContractError("Job definitions require a label and description")
        input_names = [item.role for item in self.input_roles]
        result_names = [item.role for item in self.result_roles]
        if len(input_names) != len(set(input_names)):
            raise JobContractError("Input role names must be unique")
        if len(result_names) != len(set(result_names)):
            raise JobContractError("Result role names must be unique")

    def validate_parameters(self, parameters: dict[str, Any]) -> BaseModel:
        return self.parameter_model.model_validate(parameters)

    @property
    def parameter_schema(self) -> dict[str, Any]:
        return self.parameter_model.model_json_schema()


@dataclass(frozen=True, slots=True)
class InputArtifact:
    entry_id: str
    entry_name: str
    structure_type: str
    role: str
    artifact_id: str
    sha256: str
    media_type: str
    filename: str
    data: bytes

    def read_bytes(self) -> bytes:
        return self.data


@dataclass(frozen=True, slots=True)
class ResultArtifact:
    role: str
    filename: str
    media_type: str
    data: bytes
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.role or len(self.role) > 64:
            raise JobContractError("Result artifact role is invalid")
        if (
            not self.filename
            or len(self.filename) > 255
            or PurePath(self.filename).name != self.filename
            or "\x00" in self.filename
        ):
            raise JobContractError("Result artifact filename must be a safe basename")
        if not self.media_type or len(self.media_type) > 120:
            raise JobContractError("Result artifact media type is invalid")


@dataclass(frozen=True, slots=True)
class JobResult:
    artifacts: tuple[ResultArtifact, ...]
    values: dict[str, Any] = field(default_factory=dict)
    warnings: tuple[MolecularWarning, ...] = ()
    message: str = "Completed"


class JobContext(Protocol):
    work_directory: Path

    def is_cancelled(self) -> bool: ...

    def checkpoint(self) -> None: ...

    def sleep(self, seconds: float) -> None: ...

    def progress(self, value: float, message: str) -> None: ...

    def stdout(self, message: str) -> None: ...

    def stderr(self, message: str) -> None: ...

    def publish_artifact(
        self,
        *,
        role: str,
        filename: str,
        media_type: str,
        data: bytes,
        metadata: dict[str, Any] | None = None,
    ) -> ResultArtifact: ...


class JobPlugin(Protocol):
    name: str

    def definitions(self) -> tuple[JobDefinition, ...]: ...

    def execute(
        self,
        job_type: str,
        parameters: BaseModel,
        inputs: tuple[InputArtifact, ...],
        context: JobContext,
    ) -> JobResult: ...
