"""Quick job definition and execution within the existing minimization plugin."""

from __future__ import annotations

import hashlib
import io
import os
import time
import traceback
import zipfile
from importlib.metadata import version

from molweave_core.jobs import (
    InputArtifact,
    InputRole,
    JobContext,
    JobDefinition,
    JobResult,
    ResourcePolicy,
    ResultRole,
)
from molweave_core.minimization.contracts import CalculationError, CoordinateProposal
from molweave_core.minimization.quick_contracts import QUICK_JOB, QuickParameters, QuickReport


def definition() -> JobDefinition:
    return JobDefinition(
        job_type=QUICK_JOB,
        implementation_version="1.0.2",
        label="Quick minimize selection",
        description="Fast local coordinate relaxation; publication is a separate validated edit.",
        parameter_model=QuickParameters,
        input_roles=(
            InputRole(
                role="calculation", label="Captured participating entries", minimum=1, maximum=100
            ),
        ),
        result_roles=(
            ResultRole(
                role="report", label="Quick relaxation report", media_types=("application/json",)
            ),
            ResultRole(
                role="proposal",
                label="Quick coordinate proposal",
                media_types=("application/json",),
            ),
            ResultRole(
                role="model",
                label="Temporary local calculation model",
                media_types=("application/zip",),
            ),
        ),
        resources=ResourcePolicy(
            wall_time_seconds=30,
            cancellation_grace_seconds=2,
            resident_memory_bytes=int(
                os.environ.get("MOLWEAVE_MINIMIZATION_MAX_RSS_BYTES", 4 * 1024**3)
            ),
            max_result_artifacts=3,
            max_result_bytes=100 * 1024**2,
        ),
    )


def execute(
    parameters: QuickParameters, inputs: tuple[InputArtifact, ...], context: JobContext
) -> JobResult:
    from molweave_core.minimization.live import SnapshotPublisher
    from molweave_core.minimization.plugin import json_bytes
    from molweave_core.minimization.quick_model import build_assembly, read_sources
    from molweave_core.minimization.quick_optimize import optimize

    started = time.monotonic()
    proposals: list[CoordinateProposal] = []
    model_data = None
    try:
        context.progress(1, "Interpreting the captured local molecular graph")
        sources = read_sources(parameters, inputs)
        assembly = build_assembly(sources, parameters)
        interpretation = time.monotonic() - started
        context.progress(20, "Building the quick local force field")
        publisher = SnapshotPublisher(parameters, context)
        report, proposals = optimize(assembly, parameters, context, publisher.publish)
        model_data = json_bytes(
            {
                "schema_version": 1,
                "model": parameters.model,
                "references": assembly.references,
                "coordinates": assembly.coordinates.tolist(),
                "candidate_coordinates": assembly.result_coordinates.tolist(),
                "field_center": assembly.field_center.tolist(),
                "energy_reference": assembly.energy_reference,
                "atoms": [
                    {
                        "element": a.GetSymbol(),
                        "formal_charge": a.GetFormalCharge(),
                        "isotope": a.GetIsotope(),
                        "radical_electrons": a.GetNumRadicalElectrons(),
                    }
                    for a in assembly.molecule.GetAtoms()
                ],
                "bonds": [
                    {
                        "first": b.GetBeginAtomIdx(),
                        "second": b.GetEndAtomIdx(),
                        "order": b.GetBondTypeAsDouble(),
                        "aromatic": b.GetIsAromatic(),
                    }
                    for b in assembly.molecule.GetBonds()
                ],
                "coverage_modes": assembly.modes,
                "movable_indices": assembly.movable,
                "assumptions": assembly.assumptions,
            }
        )
        report.timings["interpretation"] = interpretation
        if publisher.warning:
            report.warnings.append(publisher.warning)
    except (CalculationError, ValueError, RuntimeError) as error:
        context.stderr(traceback.format_exc())
        report = QuickReport(
            parameters=parameters,
            outcome="blocked",
            reason=f"{getattr(error, 'code', 'invalid_model')}: {error}",
        )
    report.toolchain = {name: version(name) for name in ("rdkit", "scipy", "numpy")}
    report.elapsed_seconds = time.monotonic() - started
    document = {
        "schema_version": 1,
        "parameters": parameters.model_dump(mode="json"),
        "entries": [p.model_dump(mode="json") for p in proposals],
        "report": report.model_dump(mode="json"),
    }
    data = json_bytes(document)
    digest = hashlib.sha256(data).hexdigest()
    results = [
        context.publish_artifact(
            role="report",
            filename="quick-report.json",
            media_type="application/json",
            data=json_bytes(document["report"]),
        ),
        context.publish_artifact(
            role="proposal",
            filename="quick-proposal.json",
            media_type="application/json",
            data=data,
            metadata={"proposal_sha256": digest, "outcome": report.outcome},
        ),
    ]
    if model_data is not None:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("local-model.json", model_data)
        results.append(
            context.publish_artifact(
                role="model",
                filename="quick-model.zip",
                media_type="application/zip",
                data=buffer.getvalue(),
            )
        )
    context.progress(100, f"Quick relaxation {report.outcome}; saved coordinates unchanged")
    return JobResult(
        artifacts=tuple(results),
        values={"outcome": report.outcome, "proposal_sha256": digest},
        message=f"Quick relaxation {report.outcome}: {report.reason}"[:500],
    )
