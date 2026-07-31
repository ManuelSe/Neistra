from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
from molweave_core.jobs import InputArtifact, JobCancelled, ResultArtifact
from molweave_core.molecular import (
    Atom,
    Bond,
    Conformer,
    NormalizedStructureV1,
    SourceFacts,
)
from molweave_demo_plugin.plugin import (
    DEMO_JOB_TYPE,
    NORMALIZED_MEDIA_TYPE,
    DemoJobParameters,
    plugin,
)


@dataclass
class RecordingContext:
    work_directory: Path = Path("/tmp/molweave-demo-test")
    cancel_at_checkpoint: int | None = None
    checkpoints: int = 0
    progress_events: list[tuple[float, str]] = field(default_factory=list)
    stdout_lines: list[str] = field(default_factory=list)
    stderr_lines: list[str] = field(default_factory=list)

    def is_cancelled(self) -> bool:
        return (
            self.cancel_at_checkpoint is not None
            and self.checkpoints >= self.cancel_at_checkpoint
        )

    def checkpoint(self) -> None:
        self.checkpoints += 1
        if self.is_cancelled():
            raise JobCancelled("cancelled")

    def sleep(self, seconds: float) -> None:
        del seconds
        self.checkpoint()

    def progress(self, value: float, message: str) -> None:
        self.progress_events.append((value, message))

    def stdout(self, message: str) -> None:
        self.stdout_lines.append(message)

    def stderr(self, message: str) -> None:
        self.stderr_lines.append(message)

    def publish_artifact(
        self,
        *,
        role: str,
        filename: str,
        media_type: str,
        data: bytes,
        metadata: dict[str, Any] | None = None,
    ) -> ResultArtifact:
        return ResultArtifact(
            role=role,
            filename=filename,
            media_type=media_type,
            data=data,
            metadata=metadata or {},
        )


def structure() -> NormalizedStructureV1:
    return NormalizedStructureV1(
        title="Carbon monoxide",
        structure_type="ligand",
        source=SourceFacts(filename="co.mol", format="mol"),
        atoms=[
            Atom(id=1, name="C1", element="C", coordinates=(0, 0, 0), source_index=0),
            Atom(id=2, name="O1", element="O", coordinates=(1.2, 0, 0), source_index=1),
        ],
        bonds=[Bond(id=1, atom_1_id=1, atom_2_id=2, order=3)],
        conformers=[
            Conformer(id=1, name="Model 1", coordinates=[(0, 0, 0), (1.2, 0, 0)])
        ],
    )


def input_artifact() -> InputArtifact:
    payload = structure().to_bytes()
    return InputArtifact(
        entry_id="entry-1",
        entry_name="CO",
        structure_type="ligand",
        role="structure",
        artifact_id="artifact-1",
        sha256="a" * 64,
        media_type=NORMALIZED_MEDIA_TYPE,
        filename="co.normalized.json",
        data=payload,
    )


def test_demonstration_plugin_reports_statistics_and_translated_structure() -> None:
    context = RecordingContext()
    result = plugin.execute(
        DEMO_JOB_TYPE,
        DemoJobParameters(step_count=2, delay_ms=0, translation=(2, -1, 3)),
        (input_artifact(),),
        context,
    )

    assert result.message == "Structure statistics completed"
    assert [item.role for item in result.artifacts] == ["statistics", "structure"]
    statistics = json.loads(result.artifacts[0].data)
    assert statistics["structure_count"] == 1
    assert statistics["atom_count"] == 2
    assert statistics["bond_count"] == 1
    assert statistics["elements"] == {"C": 1, "O": 1}
    assert statistics["molecular_weight"] == pytest.approx(28.01, abs=0.02)
    translated = NormalizedStructureV1.from_bytes(result.artifacts[1].data)
    assert translated.atoms[0].coordinates == pytest.approx((2, -1, 3))
    assert translated.atoms[1].coordinates == pytest.approx((3.2, -1, 3))
    assert context.progress_events[-1] == (100, "Published demonstration results")
    assert context.stderr_lines == []


def test_demonstration_plugin_fails_deterministically() -> None:
    context = RecordingContext()
    with pytest.raises(RuntimeError, match="failure at step 2"):
        plugin.execute(
            DEMO_JOB_TYPE,
            DemoJobParameters(step_count=3, delay_ms=0, fail_at_step=2),
            (input_artifact(),),
            context,
        )
    assert context.stderr_lines == ["Configured failure at step 2."]


def test_demonstration_plugin_observes_cooperative_cancellation() -> None:
    context = RecordingContext(cancel_at_checkpoint=2)
    with pytest.raises(JobCancelled):
        plugin.execute(
            DEMO_JOB_TYPE,
            DemoJobParameters(step_count=5, delay_ms=0),
            (input_artifact(),),
            context,
        )
    assert context.progress_events == []
