from __future__ import annotations

import json
from collections import Counter
from math import isfinite
from typing import Any

from molweave_core.jobs import (
    InputArtifact,
    InputRole,
    JobContext,
    JobDefinition,
    JobResult,
    ResourcePolicy,
    ResultArtifact,
    ResultRole,
)
from molweave_core.molecular import NormalizedStructureV1
from molweave_core.transforms import apply_rigid_transform
from pydantic import BaseModel, ConfigDict, Field, field_validator
from rdkit import Chem

DEMO_JOB_TYPE = "molweave.demo.structure_statistics"
NORMALIZED_MEDIA_TYPE = "application/vnd.molweave.normalized-structure+json"


class DemoJobParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_count: int = Field(default=5, ge=1, le=100, title="Steps")
    delay_ms: int = Field(default=100, ge=0, le=5_000, title="Delay per step (ms)")
    fail_at_step: int | None = Field(
        default=None,
        ge=1,
        le=100,
        title="Fail at step",
    )
    translation: tuple[float, float, float] = Field(
        default=(0.0, 0.0, 0.0),
        title="Result translation",
    )

    @field_validator("translation")
    @classmethod
    def finite_translation(
        cls, value: tuple[float, float, float]
    ) -> tuple[float, float, float]:
        if not all(isfinite(item) for item in value):
            raise ValueError("Translation values must be finite")
        return value

    @field_validator("fail_at_step")
    @classmethod
    def failure_within_steps(cls, value: int | None, info: Any) -> int | None:
        step_count = info.data.get("step_count", 5)
        if value is not None and value > step_count:
            raise ValueError("Failure step cannot exceed the step count")
        return value


class DemoPlugin:
    name = "molweave.demo"

    def definitions(self) -> tuple[JobDefinition, ...]:
        return (
            JobDefinition(
                job_type=DEMO_JOB_TYPE,
                implementation_version="1.0.0",
                label="Structure statistics",
                description="Calculate structure statistics and return a translated copy.",
                parameter_model=DemoJobParameters,
                input_roles=(
                    InputRole(
                        role="structure",
                        label="Structures",
                        minimum=1,
                        maximum=16,
                        structure_types=(
                            "protein",
                            "ligand",
                            "complex",
                            "solvent",
                            "unknown",
                        ),
                    ),
                ),
                result_roles=(
                    ResultRole(
                        role="statistics",
                        label="Statistics",
                        media_types=("application/json",),
                    ),
                    ResultRole(
                        role="structure",
                        label="Structure copy",
                        media_types=(NORMALIZED_MEDIA_TYPE,),
                        importable_structure=True,
                    ),
                ),
                resources=ResourcePolicy(
                    wall_time_seconds=600,
                    max_result_artifacts=2,
                    max_result_bytes=200 * 1024 * 1024,
                ),
            ),
        )

    def execute(
        self,
        job_type: str,
        parameters: BaseModel,
        inputs: tuple[InputArtifact, ...],
        context: JobContext,
    ) -> JobResult:
        if job_type != DEMO_JOB_TYPE:
            raise ValueError(f"Unsupported demonstration job type: {job_type}")
        values = DemoJobParameters.model_validate(parameters.model_dump(mode="json"))
        context.stdout(f"Starting statistics for {len(inputs)} structure(s).")
        for step in range(1, values.step_count + 1):
            context.checkpoint()
            if values.fail_at_step == step:
                context.stderr(f"Configured failure at step {step}.")
                raise RuntimeError(f"Demonstration failure at step {step}")
            context.sleep(values.delay_ms / 1000)
            context.progress(
                80 * step / values.step_count,
                f"Completed step {step} of {values.step_count}",
            )

        structures = [NormalizedStructureV1.from_bytes(item.read_bytes()) for item in inputs]
        statistics = _statistics(structures, inputs)
        context.stdout("Calculated atom, residue, chain, element, and mass statistics.")
        copied = structures[0]
        if values.translation != (0.0, 0.0, 0.0):
            copied = apply_rigid_transform(
                copied,
                [atom.id for atom in copied.atoms],
                ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
                values.translation,
            )
        statistics_bytes = (
            json.dumps(
                statistics,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=True,
            ).encode("utf-8")
            + b"\n"
        )
        context.progress(100, "Published demonstration results")
        return JobResult(
            artifacts=(
                ResultArtifact(
                    role="statistics",
                    filename="structure-statistics.json",
                    media_type="application/json",
                    data=statistics_bytes,
                ),
                ResultArtifact(
                    role="structure",
                    filename="demonstration-result.normalized.json",
                    media_type=NORMALIZED_MEDIA_TYPE,
                    data=copied.to_bytes(),
                    metadata={"source_entry_id": inputs[0].entry_id},
                ),
            ),
            values=statistics,
            message="Structure statistics completed",
        )


def _statistics(
    structures: list[NormalizedStructureV1],
    inputs: tuple[InputArtifact, ...],
) -> dict[str, Any]:
    elements = Counter(atom.element for structure in structures for atom in structure.atoms)
    periodic_table = Chem.GetPeriodicTable()
    molecular_weight = sum(
        periodic_table.GetAtomicWeight(atom.element)
        for structure in structures
        for atom in structure.atoms
    )
    return {
        "structure_count": len(structures),
        "atom_count": sum(len(item.atoms) for item in structures),
        "bond_count": sum(len(item.bonds) for item in structures),
        "residue_count": sum(len(item.residues) for item in structures),
        "chain_count": sum(len(item.chains) for item in structures),
        "elements": dict(sorted(elements.items())),
        "molecular_weight": round(float(molecular_weight), 6),
        "inputs": [
            {
                "entry_id": item.entry_id,
                "artifact_id": item.artifact_id,
                "sha256": item.sha256,
                "role": item.role,
            }
            for item in inputs
        ],
    }


plugin = DemoPlugin()
