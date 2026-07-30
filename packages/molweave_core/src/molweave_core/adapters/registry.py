from __future__ import annotations

from pathlib import Path

from molweave_core.adapters.base import AdapterError, FormatCapabilities, StructureAdapter


class AdapterRegistry:
    def __init__(self, adapters: list[StructureAdapter] | None = None) -> None:
        self._by_format: dict[str, StructureAdapter] = {}
        self._by_extension: dict[str, StructureAdapter] = {}
        for adapter in adapters or []:
            self.register(adapter)

    def register(self, adapter: StructureAdapter) -> None:
        capabilities = adapter.capabilities
        if capabilities.format in self._by_format:
            raise ValueError(f"Adapter already registered: {capabilities.format}")
        self._by_format[capabilities.format] = adapter
        for extension in capabilities.extensions:
            normalized = extension.lower().lstrip(".")
            if normalized in self._by_extension:
                raise ValueError(f"Extension already registered: {extension}")
            self._by_extension[normalized] = adapter

    def for_filename(self, filename: str) -> StructureAdapter:
        extension = Path(filename).suffix.lower().lstrip(".")
        adapter = self._by_extension.get(extension)
        if adapter is None:
            raise AdapterError(
                "unsupported_format",
                f"No structure adapter is registered for '.{extension or '(none)'}'.",
                filename=filename,
                operation="import",
            )
        return adapter

    def for_format(self, format_name: str) -> StructureAdapter:
        adapter = self._by_format.get(format_name.lower())
        if adapter is None:
            raise AdapterError(
                "unsupported_format",
                f"No structure adapter is registered for '{format_name}'.",
                filename="",
                operation="export",
            )
        return adapter

    def capabilities(self) -> tuple[FormatCapabilities, ...]:
        return tuple(
            adapter.capabilities
            for _, adapter in sorted(self._by_format.items(), key=lambda item: item[0])
        )
