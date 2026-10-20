from __future__ import annotations

from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SerializerFunctionWrapHandler,
    model_serializer,
    model_validator,
)

from molweave_core.selection import SelectionV1

MODEL: Literal["amber-local-v1"] = "amber-local-v1"
JOB_TYPE = "coordinates.minimize"
IMPLEMENTATION_VERSION = "1.1.0"
GRADIENT_TOLERANCE = 10.0  # kJ mol^-1 nm^-1, maximum movable component


class CalculationError(ValueError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        entry_id: str | None = None,
        atom_ids: tuple[int, ...] = (),
        residue_id: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.entry_id = entry_id
        self.atom_ids = atom_ids
        self.residue_id = residue_id


class CalculationDiagnostic(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    code: str
    message: str
    stage: str
    entry_id: str | None = None
    atom_ids: tuple[int, ...] = ()
    residue_id: int | None = None


class CapturedInput(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    entry_id: str = Field(min_length=1)
    artifact_id: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    conformer_id: int = Field(ge=1)
    atom_ids: list[int] = Field(min_length=1, max_length=20_000)

    @model_validator(mode="after")
    def canonical_ids(self) -> CapturedInput:
        if self.atom_ids != sorted(set(self.atom_ids)) or self.atom_ids[0] < 1:
            raise ValueError("Calculation atom IDs must be sorted, positive and unique")
        return self


class MinimizationParameters(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    schema_version: Literal[1, 2] = 1
    model: Literal["amber-local-v1"] = MODEL
    mode: Literal["isolated", "environment"] = "isolated"
    context_policy: Literal["manual", "automatic"] = "manual"
    acceptance_policy: Literal["strict", "interactive"] = "strict"
    selection: SelectionV1
    captured_inputs: list[CapturedInput] = Field(min_length=1, max_length=100)
    max_iterations: int = Field(default=500, ge=1, le=2_000)

    @model_serializer(mode="wrap")
    def versioned_dump(self, handler: SerializerFunctionWrapHandler) -> dict[str, object]:
        result: dict[str, object] = handler(self)
        if self.schema_version == 1:
            result.pop("context_policy", None)
        if self.schema_version == 1 or "acceptance_policy" not in self.model_fields_set:
            result.pop("acceptance_policy", None)
        return result

    @model_validator(mode="after")
    def unique_nonempty_capture(self) -> MinimizationParameters:
        if self.schema_version == 1 and self.context_policy != "manual":
            raise ValueError("Automatic context requires calculation schema2")
        if self.schema_version == 1 and self.acceptance_policy != "strict":
            raise ValueError("Interactive acceptance requires calculation schema2")
        if not self.selection.atoms or len(self.selection.atoms) > 2_000:
            raise ValueError("Select between 1 and 2000 movable atoms")
        entries = [item.entry_id for item in self.captured_inputs]
        if entries != sorted(set(entries)):
            raise ValueError("Captured entries must be sorted and unique")
        if sum(len(item.atom_ids) for item in self.captured_inputs) > 20_000:
            raise ValueError("Calculation exceeds 20000 atoms including H")
        captured = {(item.entry_id, i) for item in self.captured_inputs for i in item.atom_ids}
        if any((ref.structure_id, ref.atom_id) not in captured for ref in self.selection.atoms):
            raise ValueError("Every movable atom must belong to the captured calculation")
        return self


class CoordinateProposal(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)

    entry_id: str
    conformer_id: int
    atom_ids: list[int]
    coordinates: list[tuple[float, float, float]]


class MinimizationReport(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    schema_version: Literal[1, 2] = 1
    model: str = MODEL
    outcome: Literal["blocked", "failed", "non_converged", "converged", "unchanged"]
    reason: str
    parameters: MinimizationParameters
    units: dict[str, str] = Field(
        default_factory=lambda: {
            "energy": "kJ/mol",
            "gradient": "kJ/(mol nm)",
            "displacement": "angstrom",
        }
    )
    initial_energy: float | None = None
    final_energy: float | None = None
    maximum_gradient: float | None = None
    gradient_tolerance: float = GRADIENT_TOLERANCE
    iterations: int = 0
    evaluations: int = 0
    maximum_displacement: float = 0
    rms_displacement: float = 0
    residual_clashes: int = 0
    movable_count: int = 0
    fixed_count: int = 0
    toolchain: dict[str, object] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    elapsed_seconds: float = 0
    termination_kind: Literal["converged", "iteration_limit", "abnormal"] = "abnormal"
    nonconverged_eligible: bool = False
    new_severe_overlaps: bool | None = None

    @model_serializer(mode="wrap")
    def versioned_dump(self, handler: SerializerFunctionWrapHandler) -> dict[str, object]:
        result: dict[str, object] = handler(self)
        if self.schema_version == 1:
            for key in ("termination_kind", "nonconverged_eligible", "new_severe_overlaps"):
                result.pop(key, None)
        return result


def eligible_nonconvergence(report: MinimizationReport) -> bool:
    """Only immutable new producer evidence can authorize warned acceptance."""
    return (
        report.schema_version == 2
        and report.parameters.acceptance_policy == "interactive"
        and report.outcome == "non_converged"
        and report.termination_kind == "iteration_limit"
        and report.nonconverged_eligible
        and report.new_severe_overlaps is False
        and report.initial_energy is not None
        and report.final_energy is not None
        and report.maximum_gradient is not None
        and report.final_energy
        < report.initial_energy - max(1e-6, abs(report.initial_energy) * 1e-10)
    )
