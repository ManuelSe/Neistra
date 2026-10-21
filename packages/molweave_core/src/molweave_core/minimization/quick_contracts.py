"""Independent quick-edit contracts; historical AMBER documents stay unchanged."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from molweave_core.selection import AtomReference, SelectionV1

QUICK_JOB = "coordinates.quick_minimize"
QUICK_MODEL: Literal["quick-local-v1"] = "quick-local-v1"
QUICK_FORCE_TOLERANCE = 0.01  # kcal/(mol angstrom), maximum movable component


class QuickCapture(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    entry_id: str
    artifact_id: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    conformer_id: int = Field(ge=1)
    atom_ids: list[int] = Field(min_length=1, max_length=1_000_000)

    @model_validator(mode="after")
    def ordered(self) -> QuickCapture:
        if self.atom_ids != sorted(set(self.atom_ids)) or self.atom_ids[0] < 1:
            raise ValueError("Capture atom IDs must be positive, sorted and unique")
        return self


class QuickParameters(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: Literal[1] = 1
    model: Literal["quick-local-v1"] = QUICK_MODEL
    requested_selection: SelectionV1
    selection: SelectionV1
    captured_inputs: list[QuickCapture] = Field(min_length=1, max_length=100)
    mode: Literal["automatic", "isolated", "environment"] = "automatic"
    context_entry_ids: list[str] = Field(default_factory=list, max_length=100)
    expand_hydrogens: bool = True
    allow_repair: bool = True
    max_iterations: int = Field(default=500, ge=1, le=2000)

    @model_validator(mode="after")
    def mapped_selection(self) -> QuickParameters:
        entries = [c.entry_id for c in self.captured_inputs]
        if entries != sorted(set(entries)):
            raise ValueError("Captured entries must be sorted and unique")
        if not 1 <= len(self.selection.atoms) <= 2000:
            raise ValueError("Select between 1 and 2000 movable atoms including attached H")
        keys = [(a.structure_id, a.atom_id) for a in self.selection.atoms]
        if keys != sorted(set(keys)):
            raise ValueError("Resolved movable references must be sorted and unique")
        captures = {c.entry_id: set(c.atom_ids) for c in self.captured_inputs}
        if any(a.atom_id not in captures.get(a.structure_id, set()) for a in self.selection.atoms):
            raise ValueError("Every movable atom must belong to a captured source")
        if not {(a.structure_id, a.atom_id) for a in self.requested_selection.atoms} <= set(keys):
            raise ValueError("Resolved selection must contain the requested selection")
        return self


class QuickReport(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    schema_version: Literal[1] = 1
    model: Literal["quick-local-v1"] = QUICK_MODEL
    parameters: QuickParameters
    outcome: Literal["converged", "improved", "unchanged", "blocked", "failed"]
    reason: str
    method: Literal["MMFF94", "UFF", "geometry_repair"] = "MMFF94"
    coverage: Literal["complete", "approximate"] = "complete"
    units: dict[str, str] = Field(
        default_factory=lambda: {
            "energy": "kcal/mol",
            "gradient": "kcal/(mol angstrom)",
            "displacement": "angstrom",
        }
    )
    initial_energy: float | None = None
    final_energy: float | None = None
    maximum_gradient: float | None = None
    gradient_tolerance: float = QUICK_FORCE_TOLERANCE
    iterations: int = 0
    evaluations: int = 0
    maximum_displacement: float = 0
    rms_displacement: float = 0
    residual_clashes: int = 0
    new_severe_overlaps: bool = False
    movable_count: int = 0
    fixed_count: int = 0
    helper_count: int = 0
    cap_count: int = 0
    termination_kind: str = "blocked"
    warnings: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    modeled_atoms: dict[str, list[int]] = Field(default_factory=dict)
    timings: dict[str, float] = Field(default_factory=dict)
    elapsed_seconds: float = 0


def canonical_selection(selection: SelectionV1, keys: set[tuple[str, int]]) -> SelectionV1:
    return selection.model_copy(
        update={
            "atoms": [
                AtomReference(structure_id=entry, atom_id=atom) for entry, atom in sorted(keys)
            ]
        }
    )


def usable(report: QuickReport) -> bool:
    return (
        report.outcome in {"converged", "improved"}
        and report.termination_kind in {"converged", "iteration_limit", "budget_limit", "stalled"}
        and report.initial_energy is not None
        and report.final_energy is not None
        and report.maximum_gradient is not None
        and report.final_energy
        < report.initial_energy - max(1e-6, abs(report.initial_energy) * 1e-10)
        and not report.new_severe_overlaps
    )
