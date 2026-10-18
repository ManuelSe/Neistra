from __future__ import annotations

import hashlib
import io
import json
import time
import zipfile
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from molweave_core.jobs import (
    InputArtifact,
    InputRole,
    JobContext,
    JobDefinition,
    JobResult,
    ResourcePolicy,
    ResultRole,
)
from molweave_core.minimization.contracts import (
    IMPLEMENTATION_VERSION,
    JOB_TYPE,
    CalculationError,
    MinimizationParameters,
    MinimizationReport,
)


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def calculation_archive(directory: Path) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in (
            "input.mol2",
            "charged.mol2",
            "charged.raw.mol2",
            "leap.in",
            "model.prmtop",
            "model.inpcrd",
            "antechamber.log",
            "tleap.log",
            "sqm.in",
            "sqm.out",
        ):
            path = directory / name
            if path.is_file():
                if path.stat().st_size > 16 * 1024 * 1024:
                    raise CalculationError(
                        "model_artifact_limit", "Calculation file exceeded 16 MiB"
                    )
                archive.writestr(name, path.read_bytes())
    return output.getvalue()


class MinimizationPlugin:
    name = "molweave.minimization"

    def definitions(self) -> tuple[JobDefinition, ...]:
        return (
            JobDefinition(
                job_type=JOB_TYPE,
                implementation_version=IMPLEMENTATION_VERSION,
                label="Selection minimization",
                description="Compute a fixed-context coordinate proposal; Apply is separate.",
                parameter_model=MinimizationParameters,
                input_roles=(
                    InputRole(
                        role="calculation",
                        label="Captured calculation entries",
                        minimum=1,
                        maximum=100,
                    ),
                ),
                result_roles=(
                    ResultRole(
                        role="report", label="Scientific report", media_types=("application/json",)
                    ),
                    ResultRole(
                        role="proposal",
                        label="Coordinate proposal",
                        media_types=("application/json",),
                    ),
                    ResultRole(
                        role="model",
                        label="Calculation inputs and parameters",
                        media_types=("application/zip",),
                    ),
                ),
                resources=ResourcePolicy(
                    wall_time_seconds=600,
                    cancellation_grace_seconds=2,
                    memory_bytes=4 * 1024**3,
                    max_result_artifacts=3,
                    max_result_bytes=100 * 1024**2,
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
        # Heavy native imports happen in the controlled worker child, not API startup.
        from molweave_core.minimization.optimize import optimize_isolated
        from molweave_core.minimization.parameterization import parameterize_isolated
        from molweave_core.minimization.preflight import isolated_preflight
        from molweave_core.minimization.toolchain import AmberTools

        if job_type != JOB_TYPE:
            raise ValueError("Unknown minimization job type")
        values = MinimizationParameters.model_validate(parameters.model_dump(mode="json"))
        started = time.monotonic()
        proposals: list[dict[str, Any]] = []
        directory = context.work_directory / "calculation"
        stage = "preflight"
        try:
            context.progress(1, "Checking captured chemistry and fixed/movable atoms")
            value = isolated_preflight(values, inputs)
            tools = AmberTools.discover()
            context.progress(5, "Generating GAFF 1.81 / AM1-BCC parameters")
            stage = "parameterization"
            model = parameterize_isolated(value, tools, directory, context)
            context.progress(35, "Optimizing captured selected coordinates only")
            stage = "optimization"
            report, proposal = optimize_isolated(value, model, values, context)
            report.toolchain = {
                **tools.provenance,
                "charge_normalization": model.charge_normalization,
            }
            if abs(model.charge_normalization["uniform_offset_e"]) > 1e-9:
                report.warnings.append(
                    "AM1-BCC finite-precision partial charges were uniformly normalized to the "
                    "specified net charge; raw and corrected calculation files are retained."
                )
            proposals.append(proposal.model_dump(mode="json"))
        except CalculationError as error:
            report = MinimizationReport(
                outcome="failed" if stage == "optimization" else "blocked",
                reason=f"{error.code}: {error}",
                parameters=values,
            )
        report.elapsed_seconds = time.monotonic() - started
        report_data = report.model_dump(mode="json")
        document = {
            "schema_version": 1,
            "parameters": values.model_dump(mode="json"),
            "entries": proposals,
            "report": report_data,
        }
        proposal_data = json_bytes(document)
        digest = hashlib.sha256(proposal_data).hexdigest()
        artifacts = [
            context.publish_artifact(
                role="report",
                filename="minimization-report.json",
                media_type="application/json",
                data=json_bytes(report_data),
            ),
            context.publish_artifact(
                role="proposal",
                filename="minimization-proposal.json",
                media_type="application/json",
                data=proposal_data,
                metadata={"proposal_sha256": digest, "outcome": report.outcome},
            ),
        ]
        if directory.is_dir():
            artifacts.append(
                context.publish_artifact(
                    role="model",
                    filename="minimization-model.zip",
                    media_type="application/zip",
                    data=calculation_archive(directory),
                )
            )
        context.progress(100, f"Calculation {report.outcome}; canonical coordinates unchanged")
        return JobResult(
            artifacts=tuple(artifacts),
            values={"outcome": report.outcome, "proposal_sha256": digest},
            message=f"Minimization {report.outcome}: {report.reason}"[:500],
        )


plugin = MinimizationPlugin()
