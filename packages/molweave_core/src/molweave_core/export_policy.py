from __future__ import annotations

import io
import re
import stat
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from molweave_core.adapters.defaults import create_default_registry
from molweave_core.adapters.registry import AdapterRegistry
from molweave_core.molecular import InferenceRecord, MolecularWarning, NormalizedStructureV1

ExportMode = Literal["separate", "multi_record"]

_WINDOWS_RESERVED_NAMES = {
    "aux",
    "clock$",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "con",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9",
    "nul",
    "prn",
}


class ExportPolicyError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True, slots=True)
class ExportFilters:
    include_hydrogens: bool = True
    include_waters: bool = True
    include_ions: bool = True


@dataclass(frozen=True, slots=True)
class ExportInput:
    entry_id: str
    entry_name: str
    structure: NormalizedStructureV1


@dataclass(frozen=True, slots=True)
class ExportEntryReport:
    entry_id: str
    entry_name: str
    output_filename: str
    record_index: int | None
    warnings: tuple[MolecularWarning, ...]


@dataclass(frozen=True, slots=True)
class PreparedExport:
    data: bytes
    filename: str
    media_type: str
    format: str
    mode: ExportMode
    reports: tuple[ExportEntryReport, ...]

    @property
    def warnings(self) -> tuple[MolecularWarning, ...]:
        return tuple(warning for report in self.reports for warning in report.warnings)


def safe_export_stem(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    basename = ascii_name.replace("\\", "/").split("/")[-1]
    stem = Path(basename).stem
    portable = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip(" ._-")
    portable = portable[:100] or "structure"
    if portable.casefold() in _WINDOWS_RESERVED_NAMES:
        portable = f"_{portable}"
    return portable


def filter_structure(
    structure: NormalizedStructureV1,
    filters: ExportFilters,
) -> tuple[NormalizedStructureV1, tuple[MolecularWarning, ...]]:
    residue_by_id = {residue.id: residue for residue in structure.residues}
    removed_by_kind = {"hydrogens": 0, "waters": 0, "ions": 0}
    retained_indices: list[int] = []
    retained_atom_ids: set[int] = set()

    for index, atom in enumerate(structure.atoms):
        residue = residue_by_id.get(atom.residue_id or -1)
        remove_kind: str | None = None
        if not filters.include_hydrogens and atom.element.upper() in {"H", "D", "T"}:
            remove_kind = "hydrogens"
        elif (
            not filters.include_waters
            and residue is not None
            and residue.component_type == "water"
        ):
            remove_kind = "waters"
        elif (
            not filters.include_ions
            and residue is not None
            and residue.component_type == "ion"
        ):
            remove_kind = "ions"
        if remove_kind is not None:
            removed_by_kind[remove_kind] += 1
            continue
        retained_indices.append(index)
        retained_atom_ids.add(atom.id)

    if not retained_indices:
        raise ExportPolicyError(
            "empty_export",
            "The selected export filters remove every atom from at least one structure.",
        )

    retained_bonds = [
        bond
        for bond in structure.bonds
        if bond.atom_1_id in retained_atom_ids and bond.atom_2_id in retained_atom_ids
    ]
    retained_bond_ids = {bond.id for bond in retained_bonds}
    retained_residue_ids = {
        atom.residue_id
        for atom in structure.atoms
        if atom.id in retained_atom_ids and atom.residue_id is not None
    }
    retained_residues = [
        residue for residue in structure.residues if residue.id in retained_residue_ids
    ]
    retained_chain_ids = {residue.chain_id for residue in retained_residues}
    retained_chains = [chain for chain in structure.chains if chain.id in retained_chain_ids]
    retained_inferences: list[InferenceRecord] = []
    for inference in structure.inferences:
        atom_ids = [atom_id for atom_id in inference.atom_ids if atom_id in retained_atom_ids]
        bond_ids = [bond_id for bond_id in inference.bond_ids if bond_id in retained_bond_ids]
        if (inference.atom_ids and not atom_ids) or (inference.bond_ids and not bond_ids):
            if not atom_ids and not bond_ids:
                continue
        retained_inferences.append(
            inference.model_copy(update={"atom_ids": atom_ids, "bond_ids": bond_ids})
        )

    conformers = [
        conformer.model_copy(
            update={
                "coordinates": [
                    conformer.coordinates[index] for index in retained_indices
                ]
            }
        )
        for conformer in structure.conformers
    ]
    active_coordinates = next(
        conformer.coordinates
        for conformer in conformers
        if conformer.id == structure.active_conformer_id
    )
    atoms = [
        structure.atoms[index].model_copy(
            update={"coordinates": active_coordinates[retained_index]}
        )
        for retained_index, index in enumerate(retained_indices)
    ]

    warnings = tuple(
        MolecularWarning(
            code=f"{kind}_excluded",
            message=f"Excluded {count} {kind} atom{'s' if count != 1 else ''} from export.",
            operation="export",
            field="atoms",
            severity="info",
        )
        for kind, count in removed_by_kind.items()
        if count
    )
    filtered = structure.model_copy(
        update={
            "chains": retained_chains,
            "residues": retained_residues,
            "atoms": atoms,
            "bonds": retained_bonds,
            "conformers": conformers,
            "inferences": retained_inferences,
        }
    )
    return NormalizedStructureV1.model_validate(filtered.model_dump()), warnings


def prepare_export(
    inputs: list[ExportInput],
    *,
    format_name: str,
    mode: ExportMode,
    filters: ExportFilters,
    bundle_name: str,
    registry: AdapterRegistry | None = None,
) -> PreparedExport:
    if not inputs:
        raise ExportPolicyError("empty_export_scope", "Select at least one structure to export.")
    adapter_registry = registry or create_default_registry()
    adapter = adapter_registry.for_format(format_name)
    if mode == "multi_record" and not adapter.capabilities.multi_record:
        raise ExportPolicyError(
            "multi_record_unsupported",
            f"{adapter.capabilities.label} does not support multi-record export.",
        )

    ordered_inputs = sorted(inputs, key=lambda item: item.entry_id)
    used_names: set[str] = set()
    payloads: list[tuple[str, bytes]] = []
    reports: list[ExportEntryReport] = []
    for record_index, item in enumerate(ordered_inputs):
        filtered, filter_warnings = filter_structure(item.structure, filters)
        unique_stem = _unique_stem(safe_export_stem(item.entry_name), used_names)
        result = adapter.export(filtered, unique_stem)
        payloads.append((result.filename, result.data))
        reports.append(
            ExportEntryReport(
                entry_id=item.entry_id,
                entry_name=item.entry_name,
                output_filename=result.filename,
                record_index=record_index if mode == "multi_record" else None,
                warnings=(*filter_warnings, *result.warnings),
            )
        )

    bundle_stem = safe_export_stem(bundle_name)
    if mode == "multi_record":
        data = _pack_multi_record(format_name, [payload for _, payload in payloads])
        extension = Path(payloads[0][0]).suffix
        filename = f"{bundle_stem}{extension}"
        reports = [
            ExportEntryReport(
                entry_id=report.entry_id,
                entry_name=report.entry_name,
                output_filename=filename,
                record_index=report.record_index,
                warnings=report.warnings,
            )
            for report in reports
        ]
        return PreparedExport(
            data=data,
            filename=filename,
            media_type=adapter.capabilities.media_types[0],
            format=format_name,
            mode=mode,
            reports=tuple(reports),
        )

    if len(payloads) == 1:
        filename, data = payloads[0]
        return PreparedExport(
            data=data,
            filename=filename,
            media_type=adapter.capabilities.media_types[0],
            format=format_name,
            mode=mode,
            reports=tuple(reports),
        )

    return PreparedExport(
        data=deterministic_zip(payloads),
        filename=f"{bundle_stem}-{format_name}.zip",
        media_type="application/zip",
        format=format_name,
        mode=mode,
        reports=tuple(reports),
    )


def deterministic_zip(files: list[tuple[str, bytes]]) -> bytes:
    names = [name for name, _ in files]
    if len(names) != len(set(names)):
        raise ExportPolicyError("duplicate_export_filename", "Export filenames must be unique.")
    output = io.BytesIO()
    with zipfile.ZipFile(output, mode="w") as archive:
        for filename, data in sorted(files):
            if filename != Path(filename).name or filename in {"", ".", ".."}:
                raise ExportPolicyError("unsafe_export_filename", "Export filename is unsafe.")
            info = zipfile.ZipInfo(filename=filename, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, data)
    return output.getvalue()


def _unique_stem(stem: str, used_names: set[str]) -> str:
    candidate = stem
    suffix = 2
    while candidate.casefold() in used_names:
        candidate = f"{stem}-{suffix}"
        suffix += 1
    used_names.add(candidate.casefold())
    return candidate


def _pack_multi_record(format_name: str, payloads: list[bytes]) -> bytes:
    if format_name not in {"sdf", "smiles"}:
        raise ExportPolicyError(
            "multi_record_packer_unavailable",
            f"Multi-record packing is not implemented for {format_name}.",
        )
    return b"".join(payload.rstrip(b"\r\n") + b"\n" for payload in payloads)
