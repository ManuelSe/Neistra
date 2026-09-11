from __future__ import annotations

from datetime import datetime
from math import isfinite
from typing import Annotated, Any, Literal

from molweave_core.components import ComponentHierarchyV1
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


class JobInputCreate(BaseModel):
    role: str = Field(min_length=1, max_length=64)
    entry_id: str = Field(min_length=1, max_length=36)


class JobCreate(BaseModel):
    job_type: str = Field(min_length=1, max_length=120)
    parameters: dict[str, Any] = Field(default_factory=dict)
    inputs: list[JobInputCreate] = Field(min_length=1, max_length=100)


class JobInputRoleRead(BaseModel):
    role: str
    label: str
    minimum: int
    maximum: int
    structure_types: list[str]


class JobResultRoleRead(BaseModel):
    role: str
    label: str
    media_types: list[str]
    importable_structure: bool


class JobDefinitionRead(BaseModel):
    plugin_name: str
    job_type: str
    implementation_version: str
    label: str
    description: str
    parameter_schema: dict[str, Any]
    input_roles: list[JobInputRoleRead]
    result_roles: list[JobResultRoleRead]


class JobInputRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    ordinal: int
    role: str
    entry_id: str
    entry_name: str
    structure_type: str
    artifact_id: str
    artifact_sha256: str
    artifact_size: int
    media_type: str
    filename: str


class JobResultArtifactRead(BaseModel):
    id: str
    role: str
    artifact: ArtifactRead
    filename: str
    media_type: str
    metadata: dict[str, Any]
    importable_structure: bool
    imported_entry_ids: list[str]
    created_at: datetime


JobStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class JobRead(BaseModel):
    id: str
    project_id: str
    plugin_name: str
    job_type: str
    implementation_version: str
    status: JobStatus
    parameters: dict[str, Any]
    progress: float
    status_message: str
    result_values: dict[str, Any]
    warnings: list[dict[str, Any]]
    error: dict[str, Any] | None
    provenance: dict[str, Any]
    cancellation_requested: bool
    inputs: list[JobInputRead]
    results: list[JobResultArtifactRead]
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    modified_at: datetime


class JobEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: str
    sequence: int
    kind: str
    stream: str | None
    message: str
    data: dict[str, Any]
    created_at: datetime


class JobResultImportCreate(BaseModel):
    expected_revision: int = Field(ge=0)
    name: str | None = Field(default=None, max_length=160)


class JobResultImportRead(BaseModel):
    project: ProjectRead
    imported_entry_id: str


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
    "thick-stick",
    "ball-and-stick",
    "space-filling",
    "surface",
]
SelectionRepresentationStyle = Literal[
    "line",
    "stick",
    "thick-stick",
    "ball-and-stick",
    "space-filling",
    "backbone",
    "cartoon",
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
    nonpolar_hydrogens: bool = True
    solvent: bool = True
    ions: bool = True
    ligands: bool = True
    protein: bool = True


class LabelVisibility(BaseModel):
    atoms: bool = False
    residues: bool = False
    chains: bool = False
    structure: bool = False


class SelectionRepresentation(BaseModel):
    style: SelectionRepresentationStyle
    atom_ids: list[int] = Field(min_length=1)

    @field_validator("atom_ids")
    @classmethod
    def atom_ids_are_canonical(cls, value: list[int]) -> list[int]:
        if value != sorted(set(value)) or any(atom_id < 1 for atom_id in value):
            raise ValueError(
                "Selection representation atom IDs must be positive, unique, and sorted"
            )
        return value


class SelectionColor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    color: str = Field(pattern=r"^(#[0-9a-fA-F]{6}|element)$")
    atom_ids: list[int] = Field(min_length=1)

    @field_validator("atom_ids")
    @classmethod
    def canonical_ids(cls, value: list[int]) -> list[int]:
        return SelectionRepresentation.atom_ids_are_canonical(value)

    @field_validator("color")
    @classmethod
    def canonical_color(cls, value: str) -> str:
        return value.lower()


class SelectionNonpolarHydrogens(BaseModel):
    model_config = ConfigDict(extra="forbid")
    show: bool = Field(strict=True)
    atom_ids: list[int] = Field(min_length=1)

    @field_validator("atom_ids")
    @classmethod
    def canonical_ids(cls, value: list[int]) -> list[int]:
        return SelectionRepresentation.atom_ids_are_canonical(value)


class ViewerSettings(BaseModel):
    representations: list[RepresentationSettings] = Field(min_length=1, max_length=12)
    selection_representations: list[SelectionRepresentation] = Field(
        default_factory=list, max_length=7
    )
    selection_colors: list[SelectionColor] = Field(default_factory=list)
    selection_nonpolar_hydrogens: list[SelectionNonpolarHydrogens] = Field(
        default_factory=list, max_length=2
    )
    components: ComponentVisibility = Field(default_factory=ComponentVisibility)
    labels: LabelVisibility = Field(default_factory=LabelVisibility)

    @field_validator("selection_nonpolar_hydrogens")
    @classmethod
    def hydrogen_modes_are_disjoint(
        cls,
        value: list[SelectionNonpolarHydrogens],
    ) -> list[SelectionNonpolarHydrogens]:
        assigned: set[int] = set()
        modes: set[bool] = set()
        for item in value:
            if item.show in modes or assigned.intersection(item.atom_ids):
                raise ValueError("Hydrogen modes must be unique with disjoint atom IDs")
            modes.add(item.show)
            assigned.update(item.atom_ids)
        return sorted(value, key=lambda item: item.show)

    @field_validator("selection_colors")
    @classmethod
    def colors_are_disjoint(cls, value: list[SelectionColor]) -> list[SelectionColor]:
        assigned: set[int] = set()
        colors: set[str] = set()
        for item in value:
            if item.color in colors or assigned.intersection(item.atom_ids):
                raise ValueError("Selection colors must be unique with disjoint atom IDs")
            colors.add(item.color)
            assigned.update(item.atom_ids)
        return sorted(value, key=lambda item: item.color)

    @field_validator("representations")
    @classmethod
    def representation_ids_are_unique(
        cls, value: list[RepresentationSettings]
    ) -> list[RepresentationSettings]:
        if len({item.id for item in value}) != len(value):
            raise ValueError("Representation IDs must be unique")
        return value

    @field_validator("selection_representations")
    @classmethod
    def selection_representations_are_disjoint(
        cls, value: list[SelectionRepresentation]
    ) -> list[SelectionRepresentation]:
        if len({item.style for item in value}) != len(value):
            raise ValueError("Selection representation styles must be unique")
        atomic_styles = {"line", "stick", "thick-stick", "ball-and-stick", "space-filling"}
        for styles in (atomic_styles, {"backbone", "cartoon"}):
            assigned: set[int] = set()
            for item in value:
                if item.style not in styles:
                    continue
                overlap = assigned.intersection(item.atom_ids)
                if overlap:
                    raise ValueError(
                        "Selection representation atom IDs must be disjoint within each channel"
                    )
                assigned.update(item.atom_ids)
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
    atom_ids: list[int]
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


class CoordinatePatch(BaseModel):
    entry_id: str
    artifact_id: str
    atom_ids: list[int] = Field(min_length=1)
    coordinates: list[tuple[float, float, float]] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_coordinate_span(self) -> CoordinatePatch:
        if self.atom_ids != sorted(set(self.atom_ids)):
            raise ValueError("Coordinate patch atom IDs must be unique and sorted")
        if len(self.atom_ids) != len(self.coordinates):
            raise ValueError("Coordinate patch IDs and coordinates must have equal length")
        if not all(isfinite(value) for point in self.coordinates for value in point):
            raise ValueError("Coordinate patch values must be finite")
        return self


class TopologyPatch(BaseModel):
    entry_id: str
    artifact_id: str


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
    structure_patches: list[CoordinatePatch] = Field(default_factory=list)
    topology_patches: list[TopologyPatch] = Field(default_factory=list)


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


class SelectionRepresentationUpdate(BaseModel):
    expected_revision: int = Field(ge=0)
    selection: SelectionV1
    action: Literal["apply", "reset"]
    style: SelectionRepresentationStyle | None = None

    @model_validator(mode="after")
    def validate_action(self) -> SelectionRepresentationUpdate:
        if not self.selection.atoms:
            raise ValueError("Select at least one atom to change its representation")
        if self.action == "apply" and self.style is None:
            raise ValueError("Style is required when applying a selection representation")
        if self.action == "reset" and self.style is not None:
            raise ValueError("Style must be omitted when resetting selection representations")
        return self


class SelectionAppearanceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    selection: SelectionV1
    property: Literal["color", "nonpolar_hydrogens"]
    action: Literal["set", "reset"]
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    show: bool | None = Field(default=None, strict=True)
    color_mode: Literal["all", "carbon"] | None = None

    @model_validator(mode="after")
    def validate_action(self) -> SelectionAppearanceUpdate:
        if not self.selection.atoms:
            raise ValueError("Select at least one atom to change its appearance")
        if self.color_mode is not None and (self.property != "color" or self.action != "set"):
            raise ValueError("Color mode is only valid when setting color")
        if self.property == "color":
            if self.show is not None:
                raise ValueError("Show is only valid for hydrogen visibility")
            value: str | bool | None = self.color
        else:
            if self.color is not None:
                raise ValueError("Color is only valid for color changes")
            value = self.show
        if self.action == "set" and value is None:
            raise ValueError("A property value is required for set")
        if self.action == "reset" and value is not None:
            raise ValueError("Omit the property value for reset")
        return self


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


class CoordinateTransformCreate(BaseModel):
    expected_revision: int = Field(ge=0)
    entry_id: str
    scope: Literal["structure", "selection"]
    selection: SelectionV1 = Field(default_factory=SelectionV1)
    translation: tuple[float, float, float] = (0.0, 0.0, 0.0)
    rotation_degrees: tuple[float, float, float] = (0.0, 0.0, 0.0)
    pivot_mode: Literal["selection_centroid", "structure_centroid", "custom"] = "structure_centroid"
    pivot: tuple[float, float, float] | None = None

    @model_validator(mode="after")
    def validate_transform_input(self) -> CoordinateTransformCreate:
        values = (*self.translation, *self.rotation_degrees)
        if not all(isfinite(value) for value in values):
            raise ValueError("Translation and rotation values must be finite")
        if self.pivot_mode == "custom":
            if self.pivot is None or not all(isfinite(value) for value in self.pivot):
                raise ValueError("Custom pivot must be a finite 3D point")
        elif self.pivot is not None:
            raise ValueError("Explicit pivot is only valid with custom pivot mode")
        if self.scope == "selection" and not any(
            item.structure_id == self.entry_id for item in self.selection.atoms
        ):
            raise ValueError("Selected-atom transform requires atoms from the target entry")
        return self


class SuperpositionCreate(BaseModel):
    expected_revision: int = Field(ge=0)
    moving_entry_id: str
    reference_entry_id: str
    mode: Literal["selection", "backbone"]
    selection: SelectionV1 = Field(default_factory=SelectionV1)

    @model_validator(mode="after")
    def validate_superposition_input(self) -> SuperpositionCreate:
        if self.moving_entry_id == self.reference_entry_id:
            raise ValueError("Moving and reference entries must differ")
        allowed = {self.moving_entry_id, self.reference_entry_id}
        if any(item.structure_id not in allowed for item in self.selection.atoms):
            raise ValueError("Superposition selection may only contain moving and reference atoms")
        if self.mode == "selection":
            selected_entries = {item.structure_id for item in self.selection.atoms}
            if selected_entries != allowed:
                raise ValueError("Selection superposition requires atoms from both entries")
        return self


class SuperpositionReport(BaseModel):
    moving_entry_id: str
    reference_entry_id: str
    mode: Literal["selection", "backbone"]
    atom_count: int = Field(ge=3)
    rmsd: float = Field(ge=0, allow_inf_nan=False)


class SuperpositionRead(BaseModel):
    project: ProjectRead
    report: SuperpositionReport


class LigandEditBase(BaseModel):
    expected_revision: int = Field(ge=0)


class AtomAddEdit(LigandEditBase):
    operation: Literal["atom.add"]
    element: str = Field(min_length=1, max_length=3)
    formal_charge: int = Field(default=0, ge=-8, le=8)
    coordinates: tuple[float, float, float]


class AtomDeleteEdit(LigandEditBase):
    operation: Literal["atom.delete"]
    atom_ids: list[int] = Field(min_length=1)


class BondAddEdit(LigandEditBase):
    operation: Literal["bond.add"]
    atom_1_id: int = Field(ge=1)
    atom_2_id: int = Field(ge=1)
    order: float

    @field_validator("order")
    @classmethod
    def supported_bond_order(cls, value: float) -> float:
        if value not in {1.0, 1.5, 2.0, 3.0}:
            raise ValueError("Bond order must be 1, 1.5, 2, or 3")
        return value


class BondDeleteEdit(LigandEditBase):
    operation: Literal["bond.delete"]
    bond_id: int = Field(ge=1)


class BondOrderEdit(LigandEditBase):
    operation: Literal["bond.order"]
    bond_id: int = Field(ge=1)
    order: float

    @field_validator("order")
    @classmethod
    def supported_bond_order(cls, value: float) -> float:
        if value not in {1.0, 1.5, 2.0, 3.0}:
            raise ValueError("Bond order must be 1, 1.5, 2, or 3")
        return value


class AtomElementEdit(LigandEditBase):
    operation: Literal["atom.element"]
    atom_id: int = Field(ge=1)
    element: str = Field(min_length=1, max_length=3)


class AtomChargeEdit(LigandEditBase):
    operation: Literal["atom.charge"]
    atom_id: int = Field(ge=1)
    formal_charge: int = Field(ge=-8, le=8)


class HydrogenAddEdit(LigandEditBase):
    operation: Literal["hydrogen.add"]
    atom_ids: list[int] | None = None


class HydrogenRemoveEdit(LigandEditBase):
    operation: Literal["hydrogen.remove"]
    atom_ids: list[int] | None = None


class BondRotateEdit(LigandEditBase):
    operation: Literal["bond.rotate"]
    bond_id: int = Field(ge=1)
    movable_atom_ids: list[int] = Field(min_length=1)
    angle_degrees: float


class LigandCleanupEdit(LigandEditBase):
    operation: Literal["coordinates.cleanup"]
    force_field: Literal["auto", "mmff", "uff"] = "auto"
    max_iterations: int = Field(default=200, ge=1, le=10_000)
    atom_ids: list[int] | None = None


LigandEditCreate = Annotated[
    AtomAddEdit
    | AtomDeleteEdit
    | BondAddEdit
    | BondDeleteEdit
    | BondOrderEdit
    | AtomElementEdit
    | AtomChargeEdit
    | HydrogenAddEdit
    | HydrogenRemoveEdit
    | BondRotateEdit
    | LigandCleanupEdit,
    Field(discriminator="operation"),
]


class LigandEditReport(BaseModel):
    operation: str
    created_atom_ids: list[int] = Field(default_factory=list)
    created_bond_ids: list[int] = Field(default_factory=list)
    deleted_atom_ids: list[int] = Field(default_factory=list)
    deleted_bond_ids: list[int] = Field(default_factory=list)
    changed_atom_ids: list[int] = Field(default_factory=list)
    force_field: Literal["MMFF", "UFF"] | None = None
    converged: bool | None = None


class LigandEditRead(BaseModel):
    project: ProjectRead
    warnings: list[MolecularWarning]
    report: LigandEditReport


class ProteinEditBase(BaseModel):
    expected_revision: int = Field(ge=0)


class ProteinAtomDeleteEdit(ProteinEditBase):
    operation: Literal["protein.atom.delete"]
    atom_ids: list[int] = Field(min_length=1)


class ProteinResidueDeleteEdit(ProteinEditBase):
    operation: Literal["protein.residue.delete"]
    residue_ids: list[int] = Field(min_length=1)


class ProteinChainDeleteEdit(ProteinEditBase):
    operation: Literal["protein.chain.delete"]
    chain_ids: list[int] = Field(min_length=1)


class ProteinWaterDeleteEdit(ProteinEditBase):
    operation: Literal["protein.water.delete"]


class ProteinIonDeleteEdit(ProteinEditBase):
    operation: Literal["protein.ion.delete"]


class ProteinChainRenameEdit(ProteinEditBase):
    operation: Literal["protein.chain.rename"]
    chain_id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=160)


class ProteinResidueRenumberEdit(ProteinEditBase):
    operation: Literal["protein.residue.renumber"]
    chain_id: int = Field(ge=1)
    start: int
    step: int = 1


StandardAminoAcid = Literal[
    "ALA",
    "ARG",
    "ASN",
    "ASP",
    "CYS",
    "GLN",
    "GLU",
    "GLY",
    "HIS",
    "ILE",
    "LEU",
    "LYS",
    "MET",
    "PHE",
    "PRO",
    "SER",
    "THR",
    "TRP",
    "TYR",
    "VAL",
]


class ProteinResidueMutateEdit(ProteinEditBase):
    operation: Literal["protein.residue.mutate"]
    residue_id: int = Field(ge=1)
    target_name: StandardAminoAcid


class ProteinHydrogenAddEdit(ProteinEditBase):
    operation: Literal["protein.hydrogen.add"]
    residue_ids: list[int] | None = None
    ph: float = Field(default=7.0, ge=0, le=14, allow_inf_nan=False)


class ProteinHydrogenRemoveEdit(ProteinEditBase):
    operation: Literal["protein.hydrogen.remove"]
    residue_ids: list[int] | None = None


ProteinEditCreate = Annotated[
    ProteinAtomDeleteEdit
    | ProteinResidueDeleteEdit
    | ProteinChainDeleteEdit
    | ProteinWaterDeleteEdit
    | ProteinIonDeleteEdit
    | ProteinChainRenameEdit
    | ProteinResidueRenumberEdit
    | ProteinResidueMutateEdit
    | ProteinHydrogenAddEdit
    | ProteinHydrogenRemoveEdit,
    Field(discriminator="operation"),
]


class ProteinEditReport(BaseModel):
    operation: str
    created_atom_ids: list[int] = Field(default_factory=list)
    created_bond_ids: list[int] = Field(default_factory=list)
    deleted_atom_ids: list[int] = Field(default_factory=list)
    deleted_bond_ids: list[int] = Field(default_factory=list)
    changed_atom_ids: list[int] = Field(default_factory=list)
    changed_residue_ids: list[int] = Field(default_factory=list)
    deleted_residue_ids: list[int] = Field(default_factory=list)
    changed_chain_ids: list[int] = Field(default_factory=list)
    deleted_chain_ids: list[int] = Field(default_factory=list)


class ProteinEditRead(BaseModel):
    project: ProjectRead
    warnings: list[MolecularWarning]
    report: ProteinEditReport


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
    hierarchy: ComponentHierarchyV1
    viewer: ViewerProjection


class ExportCreate(BaseModel):
    format: Literal["pdb", "mmcif", "sdf", "mol", "mol2", "xyz", "smiles"]
    acknowledge_losses: bool = False


class BatchExportCreate(BaseModel):
    scope: Literal["all", "selected", "visible"]
    entry_ids: list[str] = Field(default_factory=list, max_length=10_000)
    format: Literal["pdb", "mmcif", "sdf", "mol", "mol2", "xyz", "smiles"]
    mode: Literal["separate", "multi_record"] = "separate"
    include_hydrogens: bool = True
    include_waters: bool = True
    include_ions: bool = True
    acknowledge_losses: bool = False
    operation_id: str = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_scope(self) -> BatchExportCreate:
        if len(self.entry_ids) != len(set(self.entry_ids)):
            raise ValueError("Selected export entry IDs must be unique")
        if self.scope == "selected" and not self.entry_ids:
            raise ValueError("Selected export scope requires at least one entry ID")
        if self.scope != "selected" and self.entry_ids:
            raise ValueError("Entry IDs are accepted only for selected export scope")
        return self


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


class ExportEntryReportRead(BaseModel):
    entry_id: str
    entry_name: str
    output_filename: str
    record_index: int | None
    warnings: list[MolecularWarning]


class BatchExportRead(BaseModel):
    artifact: ArtifactRead
    scope: Literal["all", "selected", "visible"]
    source_revision: int
    format: Literal["pdb", "mmcif", "sdf", "mol", "mol2", "xyz", "smiles"]
    mode: Literal["separate", "multi_record"]
    reports: list[ExportEntryReportRead]


class ArchiveExportCreate(BaseModel):
    operation_id: str = Field(min_length=1, max_length=64)


class ArchiveExportRead(BaseModel):
    artifact: ArtifactRead
    manifest_schema_version: Literal[1] = 1
    source_revision: int = Field(ge=0)


class ArchiveImportRead(BaseModel):
    project: ProjectRead
    source_project_id: str
    source_revision: int = Field(ge=0)
