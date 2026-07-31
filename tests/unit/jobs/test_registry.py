from __future__ import annotations

import pytest
from molweave_core.jobs import (
    DuplicateJobTypeError,
    JobDefinitionNotFoundError,
    PluginLoadError,
    PluginRegistry,
)
from molweave_demo_plugin import plugin
from molweave_demo_plugin.plugin import DEMO_JOB_TYPE, DemoJobParameters

DEMO_TARGET = "molweave_demo_plugin.plugin:plugin"


def test_registry_loads_only_allowlisted_configured_plugins() -> None:
    registry = PluginRegistry.load(
        allowlist=("molweave.demo",),
        configured_targets=(DEMO_TARGET,),
        discover_installed=False,
    )
    registered = registry.get(DEMO_JOB_TYPE)
    assert registered.plugin_name == "molweave.demo"
    assert registered.plugin_target == DEMO_TARGET
    assert registered.definition.implementation_version == "1.0.0"
    assert registered.definition.parameter_schema["additionalProperties"] is False
    assert registered.definition.validate_parameters({}).model_dump() == DemoJobParameters(
    ).model_dump()

    excluded = PluginRegistry.load(
        allowlist=("another.plugin",),
        configured_targets=(DEMO_TARGET,),
        discover_installed=False,
    )
    assert excluded.definitions() == ()


def test_registry_rejects_invalid_targets_duplicates_and_missing_jobs() -> None:
    registry = PluginRegistry(("molweave.demo",))
    registry.register(plugin, DEMO_TARGET)
    with pytest.raises(PluginLoadError, match="already registered"):
        registry.register(plugin, DEMO_TARGET)
    with pytest.raises(JobDefinitionNotFoundError):
        registry.get("missing.job")
    with pytest.raises(PluginLoadError, match="module:attribute"):
        PluginRegistry.load(
            allowlist=("molweave.demo",),
            configured_targets=("invalid-target",),
            discover_installed=False,
        )


def test_registry_rejects_duplicate_job_types_across_plugins() -> None:
    class DuplicatePlugin:
        name = "duplicate.demo"

        def definitions(self):  # type: ignore[no-untyped-def]
            return plugin.definitions()

        execute = plugin.execute

    registry = PluginRegistry(("molweave.demo", "duplicate.demo"))
    registry.register(plugin, DEMO_TARGET)
    with pytest.raises(DuplicateJobTypeError, match=DEMO_JOB_TYPE):
        registry.register(DuplicatePlugin(), "duplicate:plugin")
