from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any

from molweave_core.adapters import ImportOptions
from molweave_core.adapters.defaults import create_default_registry
from molweave_core.adapters.registry import AdapterRegistry
from molweave_core.artifacts import LocalArtifactStore
from molweave_core.molecular import MolecularWarning, NormalizedStructureV1
from sqlalchemy import select
from sqlalchemy.orm import Session
from uuid6 import uuid7

from molweave_api.models import Artifact, Project, StructureEntry
from molweave_api.project_service import (
    EntryNotFoundError,
    ProjectNotFoundError,
    ProjectService,
    RevisionConflictError,
)
from molweave_api.schemas import (
    ArtifactRead,
    ExportRead,
    FormatRead,
    ImportRead,
    StructureRead,
    ViewerProjection,
)
from molweave_api.settings import Settings
from molweave_api.viewer_state import default_viewer_settings

NORMALIZED_MEDIA_TYPE = "application/vnd.molweave.normalized-structure+json"


class ImportLimitError(ValueError):
    def __init__(self, code: str, message: str, *, filename: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.filename = filename


class ArtifactNotFoundError(LookupError):
    pass


class StructureUnavailableError(LookupError):
    pass


class LossAcknowledgementRequiredError(RuntimeError):
    def __init__(self, warnings: list[MolecularWarning]) -> None:
        super().__init__("Export would lose molecular information")
        self.warnings = warnings


@dataclass(frozen=True, slots=True)
class UploadPayload:
    filename: str
    data: bytes
    media_type: str | None = None


@dataclass(frozen=True, slots=True)
class PreparedFile:
    filename: str
    data: bytes
    media_type: str
    source_format: str
    structures: tuple[NormalizedStructureV1, ...]


def safe_display_filename(filename: str) -> str:
    normalized = filename.replace("\\", "/").replace("\x00", "")
    basename = PurePosixPath(normalized).name.strip()
    cleaned = "".join(
        character if character.isprintable() and character not in {"/", "\\"} else "_"
        for character in basename
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return (cleaned or "structure")[:255]


def safe_filename_stem(name: str) -> str:
    sanitized = safe_display_filename(name)
    stem = Path(sanitized).stem
    portable = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._")
    return (portable or "structure")[:120]


def prepare_uploads(
    settings: Settings,
    uploads: list[UploadPayload],
    *,
    generate_3d: bool = True,
    infer_bonds: bool = True,
    registry: AdapterRegistry | None = None,
) -> list[PreparedFile]:
    if not uploads:
        raise ImportLimitError("empty_import", "Select at least one structure file.")
    aggregate_size = sum(len(upload.data) for upload in uploads)
    if aggregate_size > settings.max_upload_request_bytes:
        raise ImportLimitError(
            "aggregate_upload_too_large",
            (
                f"Upload is {aggregate_size} bytes; the request limit is "
                f"{settings.max_upload_request_bytes} bytes."
            ),
        )
    prepared: list[PreparedFile] = []
    adapter_registry = registry or create_default_registry()
    options = ImportOptions(generate_3d=generate_3d, infer_bonds=infer_bonds)
    for upload in uploads:
        filename = safe_display_filename(upload.filename)
        if len(upload.data) > settings.max_structure_file_bytes:
            raise ImportLimitError(
                "structure_file_too_large",
                (
                    f"{filename} is {len(upload.data)} bytes; the per-file limit is "
                    f"{settings.max_structure_file_bytes} bytes."
                ),
                filename=filename,
            )
        adapter = adapter_registry.for_filename(filename)
        parsed = adapter.parse(upload.data, filename, options)
        structures: list[NormalizedStructureV1] = []
        for structure in parsed.structures:
            atom_count = len(structure.atoms)
            if atom_count > settings.atom_hard_limit:
                raise ImportLimitError(
                    "atom_hard_limit_exceeded",
                    (
                        f"{filename} record {structure.source.record_index + 1} has "
                        f"{atom_count} atoms; the hard limit is {settings.atom_hard_limit}."
                    ),
                    filename=filename,
                )
            if atom_count > settings.atom_warning_limit:
                warning = MolecularWarning(
                    code="atom_warning_limit_exceeded",
                    message=(
                        f"This structure has {atom_count} atoms; interactive "
                        "rendering may be slower."
                    ),
                    operation="import",
                    field="atoms",
                )
                structure = structure.model_copy(
                    update={"warnings": [*structure.warnings, warning]}
                )
            structures.append(structure)
        media_type = (
            upload.media_type
            if upload.media_type and upload.media_type != "application/octet-stream"
            else adapter.capabilities.media_types[0]
        )
        prepared.append(
            PreparedFile(
                filename=filename,
                data=upload.data,
                media_type=media_type,
                source_format=adapter.capabilities.format,
                structures=tuple(structures),
            )
        )
    return prepared


class ArtifactService:
    def __init__(self, session: Session, store: LocalArtifactStore) -> None:
        self.session = session
        self.store = store

    def publish(self, data: bytes, filename: str, media_type: str) -> Artifact:
        stored = self.store.put_bytes(data)
        artifact = self.session.scalar(select(Artifact).where(Artifact.sha256 == stored.sha256))
        if artifact is not None:
            return artifact
        artifact = Artifact(
            id=str(uuid7()),
            sha256=stored.sha256,
            size=stored.size,
            media_type=media_type,
            filename=safe_display_filename(filename),
            relative_path=stored.relative_path,
        )
        self.session.add(artifact)
        self.session.flush()
        return artifact

    def get(self, artifact_id: str) -> Artifact:
        artifact = self.session.get(Artifact, artifact_id)
        if artifact is None:
            raise ArtifactNotFoundError(artifact_id)
        return artifact

    def read(self, artifact_id: str) -> tuple[Artifact, bytes]:
        artifact = self.get(artifact_id)
        return artifact, self.store.read_bytes(artifact.relative_path)

    @staticmethod
    def response(artifact: Artifact) -> ArtifactRead:
        return ArtifactRead(
            id=artifact.id,
            filename=artifact.filename,
            media_type=artifact.media_type,
            sha256=artifact.sha256,
            size=artifact.size,
            download_url=f"/api/v1/artifacts/{artifact.id}",
        )


class ImportExportService:
    def __init__(
        self,
        session: Session,
        settings: Settings,
        *,
        registry: AdapterRegistry | None = None,
        store: LocalArtifactStore | None = None,
    ) -> None:
        self.session = session
        self.settings = settings
        self.registry = registry
        self.artifacts = ArtifactService(session, store or LocalArtifactStore(settings.data_dir))

    def formats(self) -> list[FormatRead]:
        return [
            FormatRead(
                format=item.format,
                label=item.label,
                extensions=list(item.extensions),
                media_types=list(item.media_types),
                can_import=item.can_import,
                can_export=item.can_export,
                multi_record=item.multi_record,
            )
            for item in self._registry().capabilities()
        ]

    def prepare(
        self,
        uploads: list[UploadPayload],
        *,
        generate_3d: bool = True,
        infer_bonds: bool = True,
    ) -> list[PreparedFile]:
        return prepare_uploads(
            self.settings,
            uploads,
            generate_3d=generate_3d,
            infer_bonds=infer_bonds,
            registry=self.registry,
        )

    def commit_import(
        self,
        project_id: str,
        expected_revision: int,
        prepared: list[PreparedFile],
    ) -> ImportRead:
        project = self.session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        if project.revision != expected_revision:
            raise RevisionConflictError(project.revision)

        now = datetime.now(UTC)
        entry_states: list[dict[str, Any]] = []
        warnings: list[MolecularWarning] = []
        for prepared_file in prepared:
            original = self.artifacts.publish(
                prepared_file.data,
                prepared_file.filename,
                prepared_file.media_type,
            )
            for record_number, structure in enumerate(prepared_file.structures, start=1):
                normalized_filename = (
                    f"{safe_filename_stem(prepared_file.filename)}-{record_number}.normalized.json"
                )
                normalized = self.artifacts.publish(
                    structure.to_bytes(),
                    normalized_filename,
                    NORMALIZED_MEDIA_TYPE,
                )
                entry_id = str(uuid7())
                entry_states.append(
                    {
                        "id": entry_id,
                        "group_id": None,
                        "name": structure.title[:160],
                        "description": None,
                        "structure_type": structure.structure_type,
                        "original_filename": prepared_file.filename,
                        "source_format": prepared_file.source_format,
                        "normalized_data": {
                            "schema_version": 1,
                            "storage": "artifact",
                        },
                        "atom_count": len(structure.atoms),
                        "bond_count": len(structure.bonds),
                        "residue_count": len(structure.residues),
                        "conformer_count": len(structure.conformers),
                        "warnings": [
                            warning.model_dump(mode="json") for warning in structure.warnings
                        ],
                        "viewer_settings": default_viewer_settings(structure.structure_type),
                        "visible": True,
                        "locked": False,
                        "user_metadata": {},
                        "job_links": [],
                        "generated_results": [],
                        "original_artifact_id": original.id,
                        "current_artifact_id": normalized.id,
                        "created_at": now.isoformat(),
                    }
                )
                warnings.extend(structure.warnings)
        project_read = ProjectService(self.session).import_entries(
            project_id,
            expected_revision,
            entry_states,
            len(prepared),
        )
        return ImportRead(
            project=project_read,
            imported_entry_ids=[str(state["id"]) for state in entry_states],
            warnings=warnings,
        )

    def structure(self, project_id: str, entry_id: str) -> StructureRead:
        entry = self._entry(project_id, entry_id)
        if entry.current_artifact_id is None:
            raise StructureUnavailableError(entry_id)
        _, payload = self.artifacts.read(entry.current_artifact_id)
        structure = NormalizedStructureV1.from_bytes(payload)
        viewer_format = (
            "mmcif"
            if structure.structure_type
            in {
                "protein",
                "complex",
                "solvent",
            }
            else "sdf"
        )
        projection = (
            self._registry()
            .for_format(viewer_format)
            .export(structure, safe_filename_stem(entry.name))
        )
        return StructureRead(
            entry_id=entry.id,
            structure=structure,
            viewer=ViewerProjection(
                format=viewer_format,
                data=projection.data.decode("utf-8"),
            ),
        )

    def original(self, project_id: str, entry_id: str) -> tuple[Artifact, bytes]:
        entry = self._entry(project_id, entry_id)
        if entry.original_artifact_id is None:
            raise StructureUnavailableError(entry_id)
        return self.artifacts.read(entry.original_artifact_id)

    def export(
        self,
        project_id: str,
        entry_id: str,
        format_name: str,
        *,
        acknowledge_losses: bool,
    ) -> ExportRead:
        entry = self._entry(project_id, entry_id)
        if entry.current_artifact_id is None:
            raise StructureUnavailableError(entry_id)
        _, payload = self.artifacts.read(entry.current_artifact_id)
        structure = NormalizedStructureV1.from_bytes(payload)
        result = (
            self._registry()
            .for_format(format_name)
            .export(structure, safe_filename_stem(entry.name))
        )
        blocking = [warning for warning in result.warnings if warning.blocking]
        if blocking and not acknowledge_losses:
            raise LossAcknowledgementRequiredError(blocking)
        artifact = self.artifacts.publish(result.data, result.filename, result.media_type)
        self.session.commit()
        return ExportRead(
            artifact=self.artifacts.response(artifact),
            warnings=list(result.warnings),
        )

    def artifact(self, artifact_id: str) -> tuple[Artifact, bytes]:
        return self.artifacts.read(artifact_id)

    def _entry(self, project_id: str, entry_id: str) -> StructureEntry:
        project = self.session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        entry = self.session.scalar(
            select(StructureEntry).where(
                StructureEntry.project_id == project_id,
                StructureEntry.id == entry_id,
            )
        )
        if entry is None:
            raise EntryNotFoundError(entry_id)
        return entry

    def _registry(self) -> AdapterRegistry:
        # RDKit adapter objects are created in the thread where parsing runs.
        return self.registry or create_default_registry()
