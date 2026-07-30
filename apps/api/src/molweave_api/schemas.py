from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from molweave_core.molecular import MolecularWarning, NormalizedStructureV1
from molweave_core.selection import AtomReference, SelectionGranularity, SelectionV1
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Project name must not be blank")
        return normalized


class ProjectUpdate(BaseModel):
    expected_revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Project name must not be blank")
        return normalized


class RevisionRequest(BaseModel):
    expected_revision: int = Field(ge=0)


class GroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    parent_id: str | None
    name: str
    created_at: datetime
    modified_at: datetime


StructureType = Literal["protein", "ligand", "complex", "solvent", "unknown"]
RepresentationStyle = Literal[
    "cartoon",
    "backbone",
    "line",
    "stick",
    "ball-and-stick",
    "space-filling",
    "surface",
]
ColorScheme = Literal[
    "element",
    "chain",
    "residue",
    "secondary-structure",
    "structure",
    "custom",
]


class RepresentationSettings(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    style: RepresentationStyle
    color_by: ColorScheme = "element"
    custom_color: str = Field(default="#3b82f6", pattern=r"^#[0-9a-fA-F]{6}$")
    opacity: float = Field(default=1.0, ge=0, le=1)


class ComponentVisibility(BaseModel):
    hydrogens: bool = True
    solvent: bool = True
    ions: bool = True
    ligands: bool = True
    protein: bool = True


class LabelVisibility(BaseModel):
    atoms: bool = False
    residues: bool = False
    chains: bool = False
    structure: bool = False


class ViewerSettings(BaseModel):
    representations: list[RepresentationSettings] = Field(min_length=1, max_length=12)
    components: ComponentVisibility = Field(default_factory=ComponentVisibility)
    labels: LabelVisibility = Field(default_factory=LabelVisibility)

    @field_validator("representations")
    @classmethod
    def representation_ids_are_unique(
        cls, value: list[RepresentationSettings]
    ) -> list[RepresentationSettings]:
        if len({item.id for item in value}) != len(value):
            raise ValueError("Representation IDs must be unique")
        return value


class EntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    group_id: str | None
    name: str
    description: str | None
    structure_type: StructureType
    original_filename: str | None
    source_format: str | None
    atom_count: int
    bond_count: int
    residue_count: int
    conformer_count: int
    warnings: list[MolecularWarning]
    viewer_settings: ViewerSettings
    original_artifact_id: str | None
    current_artifact_id: str | None
    visible: bool
    locked: bool
    user_metadata: dict[str, Any]
    dirty: bool
    job_links: list[str]
    generated_results: list[str]
    created_at: datetime
    modified_at: datetime


class HistoryRead(BaseModel):
    can_undo: bool
    can_redo: bool
    undo_description: str | None
    redo_description: str | None
    retained_commands: int
    limit: int


class SavedSelectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    atom_references: list[AtomReference]
    granularity: SelectionGranularity
    warnings: list[MolecularWarning]
    created_at: datetime
    modified_at: datetime


MeasurementKind = Literal["distance", "angle", "dihedral"]


class MeasurementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    kind: MeasurementKind
    atom_references: list[AtomReference]
    visible: bool
    warnings: list[MolecularWarning]
    created_at: datetime
    modified_at: datetime


class CameraState(BaseModel):
    mode: Literal["perspective", "orthographic"] = "perspective"
    position: tuple[float, float, float]
    target: tuple[float, float, float]
    up: tuple[float, float, float]
    radius: float = Field(gt=0)


class SceneEntryState(BaseModel):
    entry_id: str
    visible: bool
    viewer_settings: ViewerSettings


class SceneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    camera: CameraState
    entry_states: list[SceneEntryState]
    selection: SelectionV1
    created_at: datetime
    modified_at: datetime


class ProjectRead(BaseModel):
    schema_version: Literal[1] = 1
    id: str
    name: str
    description: str | None
    revision: int
    checkpoint_revision: int
    has_uncheckpointed_changes: bool
    created_at: datetime
    modified_at: datetime
    entries: list[EntryRead]
    groups: list[GroupRead]
    saved_selections: list[SavedSelectionRead]
    measurements: list[MeasurementRead]
    scenes: list[SceneRead]
    history: HistoryRead


class ProjectListItem(BaseModel):
    id: str
    name: str
    description: str | None
    revision: int
    checkpoint_revision: int
    has_uncheckpointed_changes: bool
    entry_count: int
    created_at: datetime
    modified_at: datetime


class EntryUpdate(BaseModel):
    expected_revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    user_metadata: dict[str, Any] = Field(default_factory=dict)


class EntryToggle(BaseModel):
    expected_revision: int = Field(ge=0)
    value: bool


class EntryRevisionRequest(BaseModel):
    expected_revision: int = Field(ge=0)


class GroupCreate(BaseModel):
    expected_revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=120)
    entry_ids: list[str] = Field(min_length=1)


class SavedSelectionCreate(BaseModel):
    expected_revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=120)
    selection: SelectionV1

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Selection name must not be blank")
        return normalized


class ViewerSettingsUpdate(BaseModel):
    expected_revision: int = Field(ge=0)
    settings: ViewerSettings


class MeasurementCreate(BaseModel):
    expected_revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=120)
    kind: MeasurementKind
    atom_references: list[AtomReference]

    @field_validator("name")
    @classmethod
    def measurement_name_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Measurement name must not be blank")
        return normalized


class MeasurementUpdate(BaseModel):
    expected_revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=120)
    visible: bool


class SceneCreate(BaseModel):
    expected_revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=120)
    camera: CameraState
    selection: SelectionV1

    @field_validator("name")
    @classmethod
    def scene_name_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Scene name must not be blank")
        return normalized


class ContactQuery(BaseModel):
    entry_id: str
    cutoff: float = Field(default=2.0, gt=0, le=10)
    minimum_distance: float = Field(default=0.5, ge=0, lt=10)

    @model_validator(mode="after")
    def minimum_must_be_below_cutoff(self) -> ContactQuery:
        if self.minimum_distance >= self.cutoff:
            raise ValueError("Minimum contact distance must be smaller than the cutoff")
        return self


class ContactRead(BaseModel):
    atom_1: AtomReference
    atom_2: AtomReference
    distance: float


class TestEntryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    structure_type: StructureType = "unknown"


class ApiError(BaseModel):
    code: str
    message: str


class FormatRead(BaseModel):
    format: str
    label: str
    extensions: list[str]
    media_types: list[str]
    can_import: bool
    can_export: bool
    multi_record: bool


class ImportRead(BaseModel):
    project: ProjectRead
    imported_entry_ids: list[str]
    warnings: list[MolecularWarning]


class ViewerProjection(BaseModel):
    format: Literal["pdb", "mmcif", "sdf", "mol"]
    data: str


class StructureRead(BaseModel):
    entry_id: str
    structure: NormalizedStructureV1
    viewer: ViewerProjection


class ExportCreate(BaseModel):
    format: Literal["pdb", "mmcif", "sdf", "mol", "mol2", "xyz", "smiles"]
    acknowledge_losses: bool = False


class ArtifactRead(BaseModel):
    id: str
    filename: str
    media_type: str
    sha256: str
    size: int
    download_url: str


class ExportRead(BaseModel):
    artifact: ArtifactRead
    warnings: list[MolecularWarning]
