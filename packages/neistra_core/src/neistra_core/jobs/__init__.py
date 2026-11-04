"""Generic controlled-job contracts and plugin discovery."""

from neistra_core.jobs.contracts import (
    InputArtifact,
    InputRole,
    JobCancelled,
    JobContext,
    JobDefinition,
    JobPlugin,
    JobResult,
    ResourcePolicy,
    ResultArtifact,
    ResultRole,
)
from neistra_core.jobs.registry import (
    DuplicateJobTypeError,
    JobDefinitionNotFoundError,
    PluginLoadError,
    PluginRegistry,
    RegisteredJob,
)

__all__ = [
    "DuplicateJobTypeError",
    "InputArtifact",
    "InputRole",
    "JobCancelled",
    "JobContext",
    "JobDefinition",
    "JobDefinitionNotFoundError",
    "JobPlugin",
    "JobResult",
    "PluginLoadError",
    "PluginRegistry",
    "RegisteredJob",
    "ResourcePolicy",
    "ResultArtifact",
    "ResultRole",
]
