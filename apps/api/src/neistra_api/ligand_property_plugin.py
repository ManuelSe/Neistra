"""Allowlisted spawned descriptor batch; private captures carry immutable inputs."""

from __future__ import annotations

import base64
import hashlib
import json
import time
from typing import Any

from neistra_core.jobs import InputArtifact, JobContext, JobDefinition, JobResult, ResourcePolicy
from neistra_core.ligand_properties import calculate_prepared, prepare_descriptor_input
from neistra_core.ligand_properties.registry import IMPLEMENTATION_VERSION
from neistra_core.molecular import NormalizedStructureV1
from pydantic import BaseModel, ConfigDict, Field

from neistra_api.ligand_property_identity import (
    MAX_CAPTURE_ENVELOPE_BYTES,
    raw_source_fingerprint,
)


class PropertyExecutionParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    execution_id: str = Field(min_length=36, max_length=36)


class LigandPropertyPlugin:
    name = "neistra.ligand_properties"

    def definitions(self) -> tuple[JobDefinition, ...]:
        return (
            JobDefinition(
                job_type="ligand.properties",
                implementation_version=IMPLEMENTATION_VERSION,
                label="Ligand properties",
                description="Calculate current qualified ligand descriptors.",
                parameter_model=PropertyExecutionParameters,
                input_roles=(),
                result_roles=(),
                resources=ResourcePolicy(
                    wall_time_seconds=30,
                    cancellation_grace_seconds=0.5,
                    max_result_artifacts=1,
                    max_result_bytes=1024 * 1024,
                    cpu_time_seconds=30,
                    resident_memory_bytes=1024 * 1024 * 1024,
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
        if job_type != "ligand.properties" or not 1 <= len(inputs) <= 8:
            raise ValueError("Invalid bounded descriptor execution")
        reports: list[dict[str, Any]] = []
        timings: list[dict[str, Any]] = []
        if sum(len(artifact.data) for artifact in inputs) > MAX_CAPTURE_ENVELOPE_BYTES:
            raise ValueError("Descriptor capture envelopes exceed the supported byte budget")
        for index, artifact in enumerate(inputs):
            context.checkpoint()
            proof_started = time.perf_counter()
            if hashlib.sha256(artifact.data).hexdigest() != artifact.sha256:
                raise ValueError("Descriptor capture failed integrity verification")
            captured = json.loads(artifact.data)
            original = (
                base64.b64decode(captured["original_base64"], validate=True)
                if captured["original_base64"] is not None
                else None
            )
            identity = captured["original_identity"]
            if (original is None) != (identity is None):
                raise ValueError("Original source proof requires exactly matching original bytes")
            if original is not None and (
                identity is None
                or len(original) != identity["size"]
                or hashlib.sha256(original).hexdigest() != identity["sha256"]
            ):
                raise ValueError("Original source identity does not match its immutable capture")
            fingerprint = raw_source_fingerprint(
                captured["structure"], captured["atom_ids"], identity
            )
            if fingerprint != captured["semantic_fingerprint"]:
                raise ValueError("Descriptor raw-source proof does not match its capture")
            structure = NormalizedStructureV1.model_validate(captured["structure"])
            raw_seconds = time.perf_counter() - proof_started
            context.checkpoint()
            preparing = time.perf_counter()
            prepared = prepare_descriptor_input(
                structure, captured["atom_ids"], original_bytes=original
            )
            prepare_seconds = time.perf_counter() - preparing
            context.checkpoint()
            calculating = time.perf_counter()
            report = calculate_prepared(prepared, descriptor_ids=captured["descriptor_ids"])
            calculation_seconds = time.perf_counter() - calculating
            expected = captured["expected_input_hash"]
            if expected is not None and report.input_hash != expected:
                raise ValueError("Previously qualified source proof changed scientific identity")
            reports.append(
                {"semantic_fingerprint": fingerprint, "report": report.model_dump(mode="json")}
            )
            timings.append(
                {
                    "semantic_fingerprint": fingerprint,
                    "raw_proof_seconds": raw_seconds,
                    "prepare_seconds": prepare_seconds,
                    "calculate_seconds": calculation_seconds,
                    "capture_bytes": len(artifact.data),
                }
            )
            context.progress(100 * (index + 1) / len(inputs), "Calculating ligand properties")
        return JobResult(
            artifacts=(),
            values={"reports": reports, "stage_timings": timings},
            message="Ligand properties ready",
        )


plugin = LigandPropertyPlugin()
