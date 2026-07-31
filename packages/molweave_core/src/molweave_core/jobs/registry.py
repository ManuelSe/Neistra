from __future__ import annotations

import importlib
from dataclasses import dataclass
from importlib.metadata import entry_points
from typing import Any, cast

from molweave_core.jobs.contracts import JobDefinition, JobPlugin


class PluginLoadError(RuntimeError):
    pass


class DuplicateJobTypeError(PluginLoadError):
    pass


class JobDefinitionNotFoundError(KeyError):
    pass


@dataclass(frozen=True, slots=True)
class RegisteredJob:
    plugin_name: str
    plugin_target: str
    plugin: JobPlugin
    definition: JobDefinition


class PluginRegistry:
    """Startup-only allowlisted registry for generic job plugins."""

    def __init__(self, allowlist: tuple[str, ...]) -> None:
        self.allowlist = frozenset(allowlist)
        self._jobs: dict[str, RegisteredJob] = {}
        self._plugins: dict[str, JobPlugin] = {}

    @classmethod
    def load(
        cls,
        *,
        allowlist: tuple[str, ...],
        configured_targets: tuple[str, ...] = (),
        discover_installed: bool = True,
    ) -> PluginRegistry:
        registry = cls(allowlist)
        targets: list[str] = list(configured_targets)
        if discover_installed:
            for entry_point in entry_points(group="molweave.jobs"):
                if entry_point.name in registry.allowlist:
                    targets.append(entry_point.value)
        for target in dict.fromkeys(targets):
            plugin = _load_target(target)
            if plugin.name not in registry.allowlist:
                continue
            registry.register(plugin, target)
        return registry

    def register(self, plugin: JobPlugin, target: str) -> None:
        if plugin.name not in self.allowlist:
            raise PluginLoadError(f"Plugin {plugin.name!r} is not allowlisted")
        if plugin.name in self._plugins:
            raise PluginLoadError(f"Plugin {plugin.name!r} is already registered")
        definitions = plugin.definitions()
        if not definitions:
            raise PluginLoadError(f"Plugin {plugin.name!r} registered no job definitions")
        for definition in definitions:
            if definition.job_type in self._jobs:
                raise DuplicateJobTypeError(
                    f"Job type {definition.job_type!r} is already registered"
                )
            self._jobs[definition.job_type] = RegisteredJob(
                plugin_name=plugin.name,
                plugin_target=target,
                plugin=plugin,
                definition=definition,
            )
        self._plugins[plugin.name] = plugin

    def get(self, job_type: str) -> RegisteredJob:
        try:
            return self._jobs[job_type]
        except KeyError as error:
            raise JobDefinitionNotFoundError(job_type) from error

    def definitions(self) -> tuple[RegisteredJob, ...]:
        return tuple(self._jobs[key] for key in sorted(self._jobs))


def _load_target(target: str) -> JobPlugin:
    module_name, separator, attribute_name = target.partition(":")
    if not separator or not module_name or not attribute_name:
        raise PluginLoadError(
            f"Plugin target {target!r} must use the form 'module:attribute'"
        )
    try:
        module = importlib.import_module(module_name)
        plugin: Any = getattr(module, attribute_name)
    except (ImportError, AttributeError) as error:
        raise PluginLoadError(f"Could not load plugin target {target!r}: {error}") from error
    if not isinstance(getattr(plugin, "name", None), str):
        raise PluginLoadError(f"Plugin target {target!r} does not expose a valid plugin")
    if not callable(getattr(plugin, "definitions", None)) or not callable(
        getattr(plugin, "execute", None)
    ):
        raise PluginLoadError(f"Plugin target {target!r} does not implement JobPlugin")
    return cast(JobPlugin, plugin)
