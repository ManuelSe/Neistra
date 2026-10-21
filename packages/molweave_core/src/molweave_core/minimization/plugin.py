from __future__ import annotations

import hashlib
import io
import json
import os
import time
import traceback
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
    CalculationDiagnostic,
    CalculationError,
    MinimizationParameters,
    MinimizationReport,
)


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def calculation_archive(directory: Path) -> bytes:
    from molweave_core.minimization.parameter_cache import file_allowed

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(directory.rglob("*")):
            relative = path.relative_to(directory)
            if (
                path.is_file()
                and not path.is_symlink()
                and (file_allowed(relative) or relative == Path("captured-coordinates.json"))
            ):
                if path.stat().st_size > 16 * 1024 * 1024:
                    raise CalculationError(
                        "model_artifact_limit", "Calculation file exceeded 16 MiB"
                    )
                archive.writestr(relative.as_posix(), path.read_bytes())
    return output.getvalue()


class MinimizationPlugin:
    name = "molweave.minimization"

    def definitions(self) -> tuple[JobDefinition, ...]:
        from molweave_core.minimization.quick_plugin import definition

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
                    resident_memory_bytes=int(
                        os.environ.get("MOLWEAVE_MINIMIZATION_MAX_RSS_BYTES", 4 * 1024**3)
                    ),
                    max_result_artifacts=3,
                    max_result_bytes=100 * 1024**2,
                ),
            ),
            definition(),
        )

    def execute(
        self,
        job_type: str,
        parameters: BaseModel,
        inputs: tuple[InputArtifact, ...],
        context: JobContext,
    ) -> JobResult:
        from molweave_core.minimization.quick_contracts import QUICK_JOB, QuickParameters

        if job_type == QUICK_JOB:
            from molweave_core.minimization.quick_plugin import execute

            return execute(
                QuickParameters.model_validate(parameters.model_dump(mode="json")), inputs, context
            )

        # Heavy native imports happen in the controlled worker child, not API startup.
        from molweave_core.minimization.assembly import environment_preflight, needs_templates
        from molweave_core.minimization.context_model import parameterize_environment
        from molweave_core.minimization.live import SnapshotPublisher
        from molweave_core.minimization.optimize import optimize_environment, optimize_isolated
        from molweave_core.minimization.parameter_cache import ParameterCache
        from molweave_core.minimization.parameterization import parameterize_isolated
        from molweave_core.minimization.preflight import isolated_preflight
        from molweave_core.minimization.templates import read_templates
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
            tools = AmberTools.discover()
            cache_root = getattr(context, "cache_directory", None)
            cache = (
                ParameterCache(
                    cache_root / "minimization",
                    int(os.environ.get("MOLWEAVE_MINIMIZATION_CACHE_BYTES", 2 * 1024**3)),
                )
                if isinstance(cache_root, Path)
                and os.environ.get("MOLWEAVE_MINIMIZATION_CACHE") != "0"
                else None
            )
            use_assembly = needs_templates(values, inputs)
            if not use_assembly:
                value = isolated_preflight(values, inputs)
                context.progress(5, "Preparing GAFF 1.81 / AM1-BCC parameters")
                stage = "parameterization"
                model = parameterize_isolated(value, tools, directory, context, cache=cache)
            else:
                assembly = environment_preflight(values, inputs, read_templates(tools.prefix))
                context.progress(5, "Preparing ff14SB / GAFF / explicit-water parameters")
                stage = "parameterization"
                model = parameterize_environment(
                    assembly,
                    tools,
                    directory,
                    context,
                    isolated=values.mode == "isolated",
                    cache=cache,
                )
            context.progress(35, "Optimizing captured selected coordinates only")
            if not use_assembly:
                references = [(value.entry_id, a.id) for a in value.structure.atoms]
                coordinates = value.structure.active_coordinates
            else:
                references = list(assembly.references)
                coordinates = assembly.coordinates
            (directory / "captured-coordinates.json").write_bytes(
                json_bytes(
                    {
                        "units": "angstrom",
                        "references": references,
                        "coordinates": coordinates,
                        "note": "Optimizer start positions; native model.inpcrd is not used.",
                    }
                )
            )
            stage = "optimization"
            live = SnapshotPublisher(values, context)
            if not use_assembly:
                report, proposal = optimize_isolated(value, model, values, context, live.publish)
                proposals.append(proposal.model_dump(mode="json"))
            else:
                report, results = optimize_environment(
                    assembly, model, values, context, live.publish
                )
                proposals.extend(p.model_dump(mode="json") for p in results)
            if live.warning:
                report.warnings.append(live.warning)
            recovered = sum(
                len(c.identity_recovery.atoms)
                for c in values.captured_inputs
                if c.identity_recovery
            )
            if recovered:
                report.warnings.append(
                    f"Verified legacy identity for {recovered} atoms "
                    "against preserved original files; "
                    "canonical metadata was not changed."
                )
            if values.mode == "environment":
                report.warnings.append(
                    "Environment model is nonperiodic with 12 angstrom cutoff, 10 angstrom "
                    "Lennard-Jones switching and reaction-field dielectric 78.3; it is not "
                    "a solvated or long-range binding model. Complete explicit waters use "
                    "unconstrained AMBER TIP3P internal distance terms."
                )
            report.toolchain = {
                **report.toolchain,
                **tools.provenance,
                "charge_normalization": model.charge_normalization,
                **model.provenance,
            }
            charge_records = model.provenance.get("charge_normalizations", [])
            if not isinstance(charge_records, list):
                raise CalculationError("invalid_parameters", "Invalid charge provenance")
            if abs(model.charge_normalization.get("uniform_offset_e", 0)) > 1e-9 or any(
                abs(float(record["uniform_offset_e"])) > 1e-9 for record in charge_records
            ):
                report.warnings.append(
                    "AM1-BCC finite-precision partial charges were uniformly normalized to the "
                    "specified net charge; raw and corrected calculation files are retained."
                )
        except CalculationError as error:
            context.stderr(traceback.format_exc())
            report = MinimizationReport(
                outcome="failed" if stage == "optimization" else "blocked",
                reason=f"{error.code}: {error}",
                parameters=values,
                toolchain={
                    "diagnostic": CalculationDiagnostic(
                        code=error.code,
                        stage=stage,
                        message=str(error),
                        entry_id=error.entry_id,
                        atom_ids=error.atom_ids,
                        residue_id=error.residue_id,
                    ).model_dump(mode="json")
                },
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
