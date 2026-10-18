"""Test-only allowlisted plugin for real subprocess-tree lifecycle failures."""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path
from typing import Literal

from molweave_core.jobs import (
    InputArtifact,
    InputRole,
    JobContext,
    JobDefinition,
    JobResult,
    ResourcePolicy,
    ResultRole,
)
from pydantic import BaseModel


class Parameters(BaseModel):
    pid_file: str
    mode: Literal["cooperative", "ignoring", "crash"] = "cooperative"


class NativeTreePlugin:
    name = "test.native_tree"

    def definitions(self) -> tuple[JobDefinition, ...]:
        return (
            JobDefinition(
                job_type="test.native_tree",
                implementation_version="1",
                label="Test native tree",
                description="Test-only controlled descendant cleanup",
                parameter_model=Parameters,
                input_roles=(InputRole(role="structure", label="Snapshot", minimum=1),),
                result_roles=(
                    ResultRole(role="unused", label="Unused", media_types=("text/plain",)),
                ),
                resources=ResourcePolicy(wall_time_seconds=2, cancellation_grace_seconds=0.1),
            ),
        )

    def execute(
        self,
        job_type: str,
        parameters: BaseModel,
        inputs: tuple[InputArtifact, ...],
        context: JobContext,
    ) -> JobResult:
        import os

        values = Parameters.model_validate(parameters.model_dump())
        # The fixed script creates one grandchild in the inherited job group.
        script = (
            "import os,subprocess,sys,time; from pathlib import Path; "
            "child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(120)']); "
            "pids=str(os.getpgrp())+' '+str(os.getpid())+' '+str(child.pid); "
            "Path(sys.argv[1]).write_text(pids); "
            "time.sleep(120)"
        )
        native = subprocess.Popen([sys.executable, "-c", script, values.pid_file])
        while not Path(values.pid_file).exists():
            context.checkpoint()
            time.sleep(0.01)
        if values.mode == "crash":
            os._exit(37)
        try:
            while native.poll() is None:
                if values.mode == "cooperative":
                    context.checkpoint()
                time.sleep(0.01)
        finally:
            if native.poll() is None:
                native.terminate()
            native.wait(timeout=1)
        return JobResult(artifacts=())


plugin = NativeTreePlugin()


def run_worker(settings: object) -> None:
    """Separate coordinator process, so tests can kill it without killing pytest."""
    from molweave_api.database import create_database_engine, create_session_factory
    from molweave_api.job_worker import JobWorker
    from molweave_api.settings import Settings
    from molweave_core.jobs import PluginRegistry

    assert isinstance(settings, Settings)
    engine = create_database_engine(settings.database_url)
    registry = PluginRegistry.load(
        allowlist=settings.job_plugin_allowlist, configured_targets=settings.job_plugin_targets
    )
    try:
        JobWorker(
            settings, create_session_factory(engine), registry, "disappearing-worker"
        ).run_once()
    finally:
        engine.dispose()
