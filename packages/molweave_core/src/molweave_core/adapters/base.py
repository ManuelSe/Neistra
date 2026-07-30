from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, ConfigDict

from molweave_core.molecular import MolecularWarning, NormalizedStructureV1


class ImportOptions(BaseModel):
    model_config = ConfigDict(frozen=True)

    generate_3d: bool = True
    infer_bonds: bool = True


@dataclass(frozen=True, slots=True)
class FormatCapabilities:
    format: str
    label: str
    extensions: tuple[str, ...]
    media_types: tuple[str, ...]
    can_import: bool = True
    can_export: bool = True
    multi_record: bool = False


@dataclass(frozen=True, slots=True)
class ParseResult:
    structures: tuple[NormalizedStructureV1, ...]
    warnings: tuple[MolecularWarning, ...] = ()


@dataclass(frozen=True, slots=True)
class ExportResult:
    data: bytes
    filename: str
    media_type: str
    warnings: tuple[MolecularWarning, ...] = ()


class AdapterError(ValueError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        filename: str,
        operation: str,
        record_index: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.filename = filename
        self.operation = operation
        self.record_index = record_index


class StructureAdapter(Protocol):
    capabilities: FormatCapabilities

    def parse(
        self,
        data: bytes,
        filename: str,
        options: ImportOptions | None = None,
    ) -> ParseResult: ...

    def export(self, structure: NormalizedStructureV1, filename_stem: str) -> ExportResult: ...
