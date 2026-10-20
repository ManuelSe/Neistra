from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from molweave_core.selection import SelectionV1

MODEL: Literal["amber-local-v1"] = "amber-local-v1"
JOB_TYPE = "coordinates.minimize"
IMPLEMENTATION_VERSION = "1.0.0"
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

    schema_version: Literal[1] = 1
    model: Literal["amber-local-v1"] = MODEL
    mode: Literal["isolated", "environment"] = "isolated"
    selection: SelectionV1
    captured_inputs: list[CapturedInput] = Field(min_length=1, max_length=100)
    max_iterations: int = Field(default=500, ge=1, le=2_000)

    @model_validator(mode="after")
    def unique_nonempty_capture(self) -> MinimizationParameters:
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

    schema_version: Literal[1] = 1
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
