from __future__ import annotations

import hashlib
import io
import json
import re
import stat
import zipfile
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from pathlib import PurePosixPath
from typing import Any, Literal
from uuid import UUID

from molweave_core.artifacts import LocalArtifactStore
from molweave_core.molecular import MolecularWarning, NormalizedStructureV1, StructureType
from molweave_core.selection import AtomReference, SelectionGranularity, SelectionV1
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.orm import Session
from uuid6 import uuid7

from molweave_api.import_export import (
    ArtifactService,
    safe_display_filename,
    safe_filename_stem,
)
from molweave_api.models import (
    EntryGroup,
    Measurement,
    Project,
    SavedSelection,
    Scene,
    StructureEntry,
)
from molweave_api.project_service import ProjectNotFoundError, project_read, project_state
from molweave_api.schemas import (
    ArchiveExportRead,
    ArchiveImportRead,
    CameraState,
    MeasurementKind,
    SceneEntryState,
    ViewerSettings,
)
from molweave_api.settings import Settings

ARCHIVE_MEDIA_TYPE = "application/vnd.molweave.project+zip"
ARCHIVE_SCHEMA_VERSION = 1
APPLICATION_VERSION = "0.1.0"
MANIFEST_PATH = "manifest.json"
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class ArchiveValidationError(ValueError):
    def __init__(self, code: str, message: str, *, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class ArchiveLimits:
    max_archive_bytes: int
    max_uncompressed_bytes: int
    max_members: int
    max_compression_ratio: float
    max_manifest_bytes: int = 10 * 1024 * 1024

    @classmethod
    def from_settings(cls, settings: Settings) -> ArchiveLimits:
        return cls(
            max_archive_bytes=settings.max_archive_upload_bytes,
            max_uncompressed_bytes=settings.max_archive_uncompressed_bytes,
            max_members=settings.max_archive_members,
            max_compression_ratio=settings.max_archive_compression_ratio,
        )


class ManifestModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


def _validate_uuid(value: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as error:
        raise ValueError("Identifier must be a UUID") from error


class ManifestFile(ManifestModel):
    path: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    size: int = Field(ge=0)
    media_type: str = Field(min_length=1, max_length=120)
    filename: str = Field(min_length=1, max_length=255)

    @model_validator(mode="after")
    def path_matches_hash(self) -> ManifestFile:
        if self.path != f"artifacts/{self.sha256}":
            raise ValueError("Artifact path must be derived from its SHA-256")
        if safe_display_filename(self.filename) != self.filename:
            raise ValueError("Artifact display filename is unsafe")
        return self


class ManifestEntry(ManifestModel):
    id: str
    group_id: str | None
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    structure_type: StructureType
    original_filename: str | None = Field(default=None, max_length=255)
    source_format: (
        Literal["pdb", "mmcif", "sdf", "mol", "mol2", "xyz", "smiles"] | None
    ) = None
    normalized_data: dict[str, Any]
    atom_count: int = Field(ge=0)
    atom_ids: list[int]
    bond_count: int = Field(ge=0)
    residue_count: int = Field(ge=0)
    conformer_count: int = Field(ge=0)
    warnings: list[MolecularWarning]
    next_atom_id: int = Field(ge=1)
    next_bond_id: int = Field(ge=1)
    viewer_settings: ViewerSettings
    visible: bool
    locked: bool
    user_metadata: dict[str, Any]
    job_links: list[str]
    generated_results: list[str]
    original_file: str | None
    current_file: str | None
    created_at: datetime
    modified_at: datetime

    _entry_uuid = field_validator("id")(_validate_uuid)
    _group_uuid = field_validator("group_id")(
        lambda value: _validate_uuid(value) if value is not None else None
    )

    @model_validator(mode="after")
    def validate_atom_identity(self) -> ManifestEntry:
        if self.atom_ids != sorted(set(self.atom_ids)):
            raise ValueError("Entry atom IDs must be unique and sorted")
        if len(self.atom_ids) != self.atom_count:
            raise ValueError("Entry atom count and atom IDs differ")
        if self.atom_ids and self.next_atom_id <= max(self.atom_ids):
            raise ValueError("Next atom ID must exceed retained atom IDs")
        return self


class ManifestGroup(ManifestModel):
    id: str
    parent_id: str | None
    name: str = Field(min_length=1, max_length=120)
    created_at: datetime
    modified_at: datetime

    _group_uuid = field_validator("id")(_validate_uuid)
    _parent_uuid = field_validator("parent_id")(
        lambda value: _validate_uuid(value) if value is not None else None
    )


class ManifestSavedSelection(ManifestModel):
    id: str
    name: str = Field(min_length=1, max_length=120)
    atom_references: list[AtomReference]
    granularity: SelectionGranularity
    warnings: list[MolecularWarning]
    created_at: datetime
    modified_at: datetime

    _selection_uuid = field_validator("id")(_validate_uuid)

    @model_validator(mode="after")
    def canonical_references(self) -> ManifestSavedSelection:
        keys = [(item.structure_id, item.atom_id) for item in self.atom_references]
        if keys != sorted(set(keys)):
            raise ValueError("Saved-selection references must be canonical")
        return self


class ManifestMeasurement(ManifestModel):
    id: str
    name: str = Field(min_length=1, max_length=120)
    kind: MeasurementKind
    atom_references: list[AtomReference]
    visible: bool
    warnings: list[MolecularWarning]
    created_at: datetime
    modified_at: datetime

    _measurement_uuid = field_validator("id")(_validate_uuid)

    @model_validator(mode="after")
    def valid_arity(self) -> ManifestMeasurement:
        expected = {"distance": 2, "angle": 3, "dihedral": 4}[self.kind]
        keys = [(item.structure_id, item.atom_id) for item in self.atom_references]
        if len(keys) != expected or len(set(keys)) != expected:
            raise ValueError(f"{self.kind} measurement requires {expected} distinct atoms")
        return self


class ManifestScene(ManifestModel):
    id: str
    name: str = Field(min_length=1, max_length=120)
    camera: CameraState
    entry_states: list[SceneEntryState]
    selection: SelectionV1
    created_at: datetime
    modified_at: datetime

    _scene_uuid = field_validator("id")(_validate_uuid)


class ManifestJobSummary(ManifestModel):
    id: str
    job_type: str
    implementation_version: str
    status: str
    input_entry_ids: list[str]
    result_files: list[str]
    provenance: dict[str, Any]


class ProjectManifestV1(ManifestModel):
    schema_version: Literal[1] = 1
    application_version: Literal["0.1.0"] = "0.1.0"
    source_project_id: str
    source_revision: int = Field(ge=0)
    source_checkpoint_revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    created_at: datetime
    modified_at: datetime
    entries: list[ManifestEntry]
    groups: list[ManifestGroup]
    saved_selections: list[ManifestSavedSelection]
    measurements: list[ManifestMeasurement]
    scenes: list[ManifestScene]
    jobs: list[ManifestJobSummary] = Field(default_factory=list)
    files: list[ManifestFile]

    _project_uuid = field_validator("source_project_id")(_validate_uuid)


@dataclass(frozen=True, slots=True)
class ArchiveBuildInput:
    manifest: ProjectManifestV1
    contents: dict[str, bytes]


@dataclass(frozen=True, slots=True)
class PreparedArchive:
    manifest: ProjectManifestV1
    contents: dict[str, bytes]


def build_project_archive(build: ArchiveBuildInput) -> bytes:
    manifest_bytes = (
        json.dumps(
            build.manifest.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        ).encode("utf-8")
        + b"\n"
    )
    files = {MANIFEST_PATH: manifest_bytes, **build.contents}
    expected_paths = {item.path for item in build.manifest.files}
    if set(build.contents) != expected_paths:
        raise ArchiveValidationError(
            "archive_content_mismatch",
            "Manifest files and supplied archive content differ.",
        )
    output = io.BytesIO()
    with zipfile.ZipFile(output, mode="w") as archive:
        for path, data in sorted(files.items()):
            _validate_member_path(path)
            info = zipfile.ZipInfo(filename=path, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, data)
    return output.getvalue()


def read_project_archive(data: bytes, limits: ArchiveLimits) -> PreparedArchive:
    if len(data) > limits.max_archive_bytes:
        raise ArchiveValidationError(
            "archive_upload_too_large",
            f"Archive exceeds the compressed limit of {limits.max_archive_bytes} bytes.",
            status_code=413,
        )
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise ArchiveValidationError(
            "invalid_project_archive",
            "File is not a valid ZIP.",
        ) from error
    with archive:
        infos = archive.infolist()
        if not infos or len(infos) > limits.max_members:
            raise ArchiveValidationError(
                "archive_member_limit_exceeded",
                f"Archive must contain between 1 and {limits.max_members} members.",
                status_code=413,
            )
        names = [info.filename for info in infos]
        if len(names) != len(set(names)):
            raise ArchiveValidationError(
                "duplicate_archive_path",
                "Archive contains duplicate member paths.",
            )
        total_size = 0
        for info in infos:
            _validate_member(info, limits)
            total_size += info.file_size
            if total_size > limits.max_uncompressed_bytes:
                raise ArchiveValidationError(
                    "archive_uncompressed_limit_exceeded",
                    (
                        "Archive exceeds the uncompressed limit of "
                        f"{limits.max_uncompressed_bytes} bytes."
                    ),
                    status_code=413,
                )
        info_by_name = {info.filename: info for info in infos}
        manifest_info = info_by_name.get(MANIFEST_PATH)
        if manifest_info is None:
            raise ArchiveValidationError(
                "archive_manifest_missing",
                "Archive does not contain manifest.json.",
            )
        if manifest_info.file_size > limits.max_manifest_bytes:
            raise ArchiveValidationError(
                "archive_manifest_too_large",
                "Archive manifest exceeds its size limit.",
                status_code=413,
            )
        try:
            raw_manifest = json.loads(archive.read(manifest_info))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ArchiveValidationError(
                "invalid_archive_manifest",
                "Archive manifest must be valid UTF-8 JSON.",
            ) from error
        if not isinstance(raw_manifest, dict):
            raise ArchiveValidationError(
                "invalid_archive_manifest",
                "Archive manifest must be a JSON object.",
            )
        schema_version = raw_manifest.get("schema_version")
        if schema_version != ARCHIVE_SCHEMA_VERSION:
            raise ArchiveValidationError(
                "unsupported_archive_schema",
                f"Archive schema {schema_version!r} is not supported.",
            )
        try:
            manifest = ProjectManifestV1.model_validate(raw_manifest)
        except ValueError as error:
            raise ArchiveValidationError(
                "invalid_archive_manifest",
                f"Archive manifest validation failed: {error}",
            ) from error
        file_by_path = {item.path: item for item in manifest.files}
        if len(file_by_path) != len(manifest.files):
            raise ArchiveValidationError(
                "duplicate_manifest_path",
                "Manifest declares a file path more than once.",
            )
        expected_names = {MANIFEST_PATH, *file_by_path}
        if set(names) != expected_names:
            missing = sorted(expected_names - set(names))
            unexpected = sorted(set(names) - expected_names)
            raise ArchiveValidationError(
                "archive_member_mismatch",
                f"Archive member mismatch; missing={missing}, unexpected={unexpected}.",
            )
        contents: dict[str, bytes] = {}
        for path, record in sorted(file_by_path.items()):
            payload = archive.read(info_by_name[path])
            digest = hashlib.sha256(payload).hexdigest()
            if len(payload) != record.size:
                raise ArchiveValidationError(
                    "archive_size_mismatch",
                    f"Archive member {path} does not match its declared size.",
                )
            if digest != record.sha256:
                raise ArchiveValidationError(
                    "archive_hash_mismatch",
                    f"Archive member {path} does not match its declared SHA-256.",
                )
            contents[path] = payload
    _validate_manifest_relationships(manifest, contents)
    return PreparedArchive(manifest=manifest, contents=contents)


class ProjectArchiveService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.artifacts = ArtifactService(session, LocalArtifactStore(settings.data_dir))

    def export_source(self, project_id: str) -> ArchiveBuildInput:
        project = self.session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        artifact_paths: dict[str, str] = {}
        contents: dict[str, bytes] = {}
        file_records: dict[str, ManifestFile] = {}

        def archive_artifact(artifact_id: str | None) -> str | None:
            if artifact_id is None:
                return None
            artifact, payload = self.artifacts.read(artifact_id)
            digest = hashlib.sha256(payload).hexdigest()
            if digest != artifact.sha256 or len(payload) != artifact.size:
                raise ArchiveValidationError(
                    "artifact_integrity_failed",
                    f"Stored artifact {artifact.id} failed hash or size validation.",
                )
            path = artifact_paths.setdefault(artifact.id, f"artifacts/{artifact.sha256}")
            contents.setdefault(path, payload)
            file_records.setdefault(
                path,
                ManifestFile(
                    path=path,
                    sha256=artifact.sha256,
                    size=artifact.size,
                    media_type=artifact.media_type,
                    filename=safe_display_filename(artifact.filename),
                ),
            )
            return path

        entries = [
            ManifestEntry(
                id=entry.id,
                group_id=entry.group_id,
                name=entry.name,
                description=entry.description,
                structure_type=entry.structure_type,
                original_filename=entry.original_filename,
                source_format=entry.source_format,
                normalized_data=deepcopy(entry.normalized_data),
                atom_count=entry.atom_count,
                atom_ids=deepcopy(entry.atom_ids),
                bond_count=entry.bond_count,
                residue_count=entry.residue_count,
                conformer_count=entry.conformer_count,
                warnings=[MolecularWarning.model_validate(item) for item in entry.warnings],
                next_atom_id=entry.next_atom_id,
                next_bond_id=entry.next_bond_id,
                viewer_settings=ViewerSettings.model_validate(entry.viewer_settings),
                visible=entry.visible,
                locked=entry.locked,
                user_metadata=deepcopy(entry.user_metadata),
                job_links=deepcopy(entry.job_links),
                generated_results=deepcopy(entry.generated_results),
                original_file=archive_artifact(entry.original_artifact_id),
                current_file=archive_artifact(entry.current_artifact_id),
                created_at=entry.created_at,
                modified_at=entry.modified_at,
            )
            for entry in sorted(project.entries, key=lambda item: item.id)
        ]
        manifest = ProjectManifestV1(
            source_project_id=project.id,
            source_revision=project.revision,
            source_checkpoint_revision=project.checkpoint_revision,
            name=project.name,
            description=project.description,
            created_at=project.created_at,
            modified_at=project.modified_at,
            entries=entries,
            groups=[
                ManifestGroup(
                    id=group.id,
                    parent_id=group.parent_id,
                    name=group.name,
                    created_at=group.created_at,
                    modified_at=group.modified_at,
                )
                for group in sorted(project.groups, key=lambda item: item.id)
            ],
            saved_selections=[
                ManifestSavedSelection(
                    id=item.id,
                    name=item.name,
                    atom_references=[
                        AtomReference.model_validate(reference)
                        for reference in item.atom_references
                    ],
                    granularity=item.granularity,
                    warnings=[
                        MolecularWarning.model_validate(warning)
                        for warning in item.warnings
                    ],
                    created_at=item.created_at,
                    modified_at=item.modified_at,
                )
                for item in sorted(project.saved_selections, key=lambda item: item.id)
            ],
            measurements=[
                ManifestMeasurement(
                    id=item.id,
                    name=item.name,
                    kind=item.kind,
                    atom_references=[
                        AtomReference.model_validate(reference)
                        for reference in item.atom_references
                    ],
                    visible=item.visible,
                    warnings=[
                        MolecularWarning.model_validate(warning)
                        for warning in item.warnings
                    ],
                    created_at=item.created_at,
                    modified_at=item.modified_at,
                )
                for item in sorted(project.measurements, key=lambda item: item.id)
            ],
            scenes=[
                ManifestScene(
                    id=item.id,
                    name=item.name,
                    camera=CameraState.model_validate(item.camera),
                    entry_states=[
                        SceneEntryState.model_validate(state) for state in item.entry_states
                    ],
                    selection=SelectionV1.model_validate(item.selection),
                    created_at=item.created_at,
                    modified_at=item.modified_at,
                )
                for item in sorted(project.scenes, key=lambda item: item.id)
            ],
            files=[file_records[path] for path in sorted(file_records)],
        )
        _validate_manifest_relationships(manifest, contents)
        return ArchiveBuildInput(manifest=manifest, contents=contents)

    def publish_export(
        self,
        project_name: str,
        source_revision: int,
        prepared: bytes,
    ) -> ArchiveExportRead:
        filename = f"{safe_filename_stem(project_name)}.molweave.zip"
        artifact = self.artifacts.publish(prepared, filename, ARCHIVE_MEDIA_TYPE)
        self.session.commit()
        return ArchiveExportRead(
            artifact=self.artifacts.response(artifact, filename=filename),
            manifest_schema_version=ARCHIVE_SCHEMA_VERSION,
            source_revision=source_revision,
        )

    def import_archive(self, prepared: PreparedArchive) -> ArchiveImportRead:
        manifest = prepared.manifest
        try:
            published_by_path = {}
            for record in manifest.files:
                published_by_path[record.path] = self.artifacts.publish(
                    prepared.contents[record.path],
                    record.filename,
                    record.media_type,
                )

            project = Project(
                id=str(uuid7()),
                name=manifest.name,
                description=manifest.description,
                revision=0,
                checkpoint_revision=0,
                checkpoint_state={},
                created_at=manifest.created_at,
                modified_at=manifest.modified_at,
            )
            self.session.add(project)
            self.session.flush()
            entry_ids = {item.id: str(uuid7()) for item in manifest.entries}
            group_ids = {item.id: str(uuid7()) for item in manifest.groups}
            selection_ids = {
                item.id: str(uuid7()) for item in manifest.saved_selections
            }
            measurement_ids = {
                item.id: str(uuid7()) for item in manifest.measurements
            }
            scene_ids = {item.id: str(uuid7()) for item in manifest.scenes}

            for group in _ordered_groups(manifest.groups):
                self.session.add(
                    EntryGroup(
                        id=group_ids[group.id],
                        project_id=project.id,
                        parent_id=(
                            group_ids[group.parent_id]
                            if group.parent_id is not None
                            else None
                        ),
                        name=group.name,
                        created_at=group.created_at,
                        modified_at=group.modified_at,
                    )
                )
                self.session.flush()
            for entry in manifest.entries:
                original = (
                    published_by_path[entry.original_file]
                    if entry.original_file is not None
                    else None
                )
                current = (
                    published_by_path[entry.current_file]
                    if entry.current_file is not None
                    else None
                )
                self.session.add(
                    StructureEntry(
                        id=entry_ids[entry.id],
                        project_id=project.id,
                        group_id=(
                            group_ids[entry.group_id]
                            if entry.group_id is not None
                            else None
                        ),
                        name=entry.name,
                        description=entry.description,
                        structure_type=entry.structure_type,
                        original_filename=entry.original_filename,
                        source_format=entry.source_format,
                        normalized_data=deepcopy(entry.normalized_data),
                        atom_count=entry.atom_count,
                        atom_ids=deepcopy(entry.atom_ids),
                        bond_count=entry.bond_count,
                        residue_count=entry.residue_count,
                        conformer_count=entry.conformer_count,
                        warnings=[
                            warning.model_dump(mode="json")
                            for warning in entry.warnings
                        ],
                        next_atom_id=entry.next_atom_id,
                        next_bond_id=entry.next_bond_id,
                        viewer_settings=entry.viewer_settings.model_dump(mode="json"),
                        visible=entry.visible,
                        locked=entry.locked,
                        user_metadata=deepcopy(entry.user_metadata),
                        job_links=deepcopy(entry.job_links),
                        generated_results=deepcopy(entry.generated_results),
                        original_artifact_id=original.id if original else None,
                        current_artifact_id=current.id if current else None,
                        created_at=entry.created_at,
                        modified_at=entry.modified_at,
                    )
                )
            self.session.flush()
            for saved_item in manifest.saved_selections:
                self.session.add(
                    SavedSelection(
                        id=selection_ids[saved_item.id],
                        project_id=project.id,
                        name=saved_item.name,
                        atom_references=_remap_references(
                            saved_item.atom_references, entry_ids
                        ),
                        granularity=saved_item.granularity,
                        warnings=[
                            warning.model_dump(mode="json")
                            for warning in saved_item.warnings
                        ],
                        created_at=saved_item.created_at,
                        modified_at=saved_item.modified_at,
                    )
                )
            for measurement_item in manifest.measurements:
                self.session.add(
                    Measurement(
                        id=measurement_ids[measurement_item.id],
                        project_id=project.id,
                        name=measurement_item.name,
                        kind=measurement_item.kind,
                        atom_references=_remap_references(
                            measurement_item.atom_references, entry_ids
                        ),
                        visible=measurement_item.visible,
                        warnings=[
                            warning.model_dump(mode="json")
                            for warning in measurement_item.warnings
                        ],
                        created_at=measurement_item.created_at,
                        modified_at=measurement_item.modified_at,
                    )
                )
            for scene_item in manifest.scenes:
                self.session.add(
                    Scene(
                        id=scene_ids[scene_item.id],
                        project_id=project.id,
                        name=scene_item.name,
                        camera=scene_item.camera.model_dump(mode="json"),
                        entry_states=[
                            {
                                **state.model_dump(mode="json"),
                                "entry_id": entry_ids[state.entry_id],
                            }
                            for state in scene_item.entry_states
                        ],
                        selection=_remap_selection(scene_item.selection, entry_ids),
                        created_at=scene_item.created_at,
                        modified_at=scene_item.modified_at,
                    )
                )
            self.session.flush()
            project.checkpoint_state = project_state(project)
            project.modified_at = manifest.modified_at
            self.session.commit()
        except BaseException:
            self.session.rollback()
            raise
        return ArchiveImportRead(
            project=project_read(self.session, project),
            source_project_id=manifest.source_project_id,
            source_revision=manifest.source_revision,
        )


def _validate_member_path(path: str) -> None:
    parts = path.split("/")
    if not path or "\\" in path or ":" in parts[0]:
        raise ArchiveValidationError(
            "unsafe_archive_path",
            f"Archive member path is unsafe: {path!r}.",
        )
    pure = PurePosixPath(path)
    if pure.is_absolute() or any(part in {"", ".", ".."} for part in parts):
        raise ArchiveValidationError(
            "unsafe_archive_path",
            f"Archive member path is unsafe: {path!r}.",
        )


def _validate_member(info: zipfile.ZipInfo, limits: ArchiveLimits) -> None:
    _validate_member_path(info.filename)
    if info.is_dir():
        raise ArchiveValidationError(
            "archive_directory_unsupported",
            f"Archive member must be a regular file: {info.filename}.",
        )
    mode = info.external_attr >> 16
    if stat.S_ISLNK(mode):
        raise ArchiveValidationError(
            "archive_symlink_rejected",
            f"Archive symlinks are not allowed: {info.filename}.",
        )
    file_type = stat.S_IFMT(mode)
    if file_type not in {0, stat.S_IFREG}:
        raise ArchiveValidationError(
            "archive_special_file_rejected",
            f"Archive special files are not allowed: {info.filename}.",
        )
    if info.flag_bits & 0x1:
        raise ArchiveValidationError(
            "encrypted_archive_unsupported",
            "Encrypted archive members are not supported.",
        )
    if info.file_size:
        if info.compress_size == 0:
            ratio = float("inf")
        else:
            ratio = info.file_size / info.compress_size
        if ratio > limits.max_compression_ratio:
            raise ArchiveValidationError(
                "archive_compression_ratio_exceeded",
                f"Archive member {info.filename} exceeds the compression-ratio limit.",
                status_code=413,
            )


def _validate_manifest_relationships(
    manifest: ProjectManifestV1,
    contents: dict[str, bytes],
) -> None:
    _require_unique("entry", [item.id for item in manifest.entries])
    _require_unique("group", [item.id for item in manifest.groups])
    _require_unique("saved selection", [item.id for item in manifest.saved_selections])
    _require_unique("measurement", [item.id for item in manifest.measurements])
    _require_unique("scene", [item.id for item in manifest.scenes])
    _require_unique(
        "saved selection name",
        [item.name.casefold() for item in manifest.saved_selections],
    )
    _require_unique("scene name", [item.name.casefold() for item in manifest.scenes])
    entry_ids = {item.id for item in manifest.entries}
    group_ids = {item.id for item in manifest.groups}
    file_paths = {item.path for item in manifest.files}
    file_by_path = {item.path: item for item in manifest.files}
    referenced_file_paths: set[str] = set()
    for entry in manifest.entries:
        if entry.group_id is not None and entry.group_id not in group_ids:
            raise ArchiveValidationError(
                "invalid_archive_relationship",
                f"Entry {entry.id} references an unknown group.",
            )
        for path in (entry.original_file, entry.current_file):
            if path is not None and path not in file_paths:
                raise ArchiveValidationError(
                    "invalid_archive_relationship",
                    f"Entry {entry.id} references an undeclared artifact.",
                )
            if path is not None:
                referenced_file_paths.add(path)
        if entry.job_links or entry.generated_results:
            raise ArchiveValidationError(
                "archive_jobs_unsupported",
                "Job links and generated results are reserved for Milestone 9.",
            )
        if entry.current_file is None:
            if entry.atom_count or entry.bond_count or entry.residue_count:
                raise ArchiveValidationError(
                    "archive_structure_missing",
                    f"Entry {entry.id} has molecular counts without current data.",
                )
            continue
        if entry.normalized_data != {"schema_version": 1, "storage": "artifact"}:
            raise ArchiveValidationError(
                "invalid_archive_normalized_reference",
                f"Entry {entry.id} has an unsupported normalized-data reference.",
            )
        if (
            file_by_path[entry.current_file].media_type
            != "application/vnd.molweave.normalized-structure+json"
        ):
            raise ArchiveValidationError(
                "invalid_normalized_artifact_media_type",
                f"Entry {entry.id} current artifact has the wrong media type.",
            )
        try:
            structure = NormalizedStructureV1.from_bytes(contents[entry.current_file])
        except (KeyError, ValueError) as error:
            raise ArchiveValidationError(
                "invalid_normalized_artifact",
                f"Entry {entry.id} current artifact is not NormalizedStructureV1.",
            ) from error
        if (
            entry.atom_count != len(structure.atoms)
            or entry.atom_ids != [atom.id for atom in structure.atoms]
            or entry.bond_count != len(structure.bonds)
            or entry.residue_count != len(structure.residues)
            or entry.conformer_count != len(structure.conformers)
            or entry.structure_type != structure.structure_type
        ):
            raise ArchiveValidationError(
                "archive_structure_summary_mismatch",
                f"Entry {entry.id} summary does not match its normalized artifact.",
            )
    if file_paths != referenced_file_paths:
        raise ArchiveValidationError(
            "unreferenced_archive_artifact",
            "Archive manifest declares an artifact that no project entry references.",
        )
    _ordered_groups(manifest.groups)
    atom_ids_by_entry = {item.id: set(item.atom_ids) for item in manifest.entries}
    for saved in manifest.saved_selections:
        _validate_references(saved.atom_references, entry_ids, atom_ids_by_entry)
    for measurement in manifest.measurements:
        _validate_references(
            measurement.atom_references, entry_ids, atom_ids_by_entry
        )
    for scene in manifest.scenes:
        scene_entry_ids = [state.entry_id for state in scene.entry_states]
        if len(scene_entry_ids) != len(set(scene_entry_ids)) or not set(
            scene_entry_ids
        ).issubset(entry_ids):
            raise ArchiveValidationError(
                "invalid_archive_relationship",
                f"Scene {scene.id} contains invalid or duplicate entry state.",
            )
        _validate_references(scene.selection.atoms, entry_ids, atom_ids_by_entry)
    if manifest.jobs:
        raise ArchiveValidationError(
            "archive_jobs_unsupported",
            "Job summaries are reserved for Milestone 9 and must be empty.",
        )


def _ordered_groups(groups: list[ManifestGroup]) -> list[ManifestGroup]:
    by_id = {group.id: group for group in groups}
    ordered: list[ManifestGroup] = []
    remaining = set(by_id)
    while remaining:
        ready = sorted(
            group_id
            for group_id in remaining
            if by_id[group_id].parent_id is None
            or by_id[group_id].parent_id in {item.id for item in ordered}
        )
        if not ready:
            raise ArchiveValidationError(
                "invalid_archive_group_tree",
                "Archive groups contain an unknown parent or a cycle.",
            )
        for group_id in ready:
            group = by_id[group_id]
            if group.parent_id is not None and group.parent_id not in by_id:
                raise ArchiveValidationError(
                    "invalid_archive_group_tree",
                    f"Group {group.id} references an unknown parent.",
                )
            ordered.append(group)
            remaining.remove(group_id)
    return ordered


def _validate_references(
    references: list[AtomReference],
    entry_ids: set[str],
    atom_ids_by_entry: dict[str, set[int]],
) -> None:
    for reference in references:
        if (
            reference.structure_id not in entry_ids
            or reference.atom_id not in atom_ids_by_entry[reference.structure_id]
        ):
            raise ArchiveValidationError(
                "invalid_archive_atom_reference",
                "Archive contains an atom reference that is not present.",
            )


def _require_unique(label: str, values: list[str]) -> None:
    if len(values) != len(set(values)):
        raise ArchiveValidationError(
            "duplicate_archive_identity",
            f"Archive contains a duplicate {label}.",
        )


def _remap_references(
    references: list[AtomReference],
    entry_ids: dict[str, str],
) -> list[dict[str, Any]]:
    return [
        {"structure_id": entry_ids[item.structure_id], "atom_id": item.atom_id}
        for item in references
    ]


def _remap_selection(
    selection: SelectionV1,
    entry_ids: dict[str, str],
) -> dict[str, Any]:
    return {
        **selection.model_dump(mode="json"),
        "atoms": _remap_references(selection.atoms, entry_ids),
    }
