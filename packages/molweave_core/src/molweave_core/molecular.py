from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

StructureType = Literal["protein", "ligand", "complex", "solvent", "unknown"]
ComponentType = Literal["polymer", "ligand", "water", "ion", "unknown"]
WarningSeverity = Literal["info", "warning", "error"]


class MolecularWarning(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str
    message: str
    operation: str
    severity: WarningSeverity = "warning"
    field: str | None = None
    blocking: bool = False


class InferenceRecord(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str
    message: str
    atom_ids: list[int] = Field(default_factory=list)
    bond_ids: list[int] = Field(default_factory=list)


class SourceFacts(BaseModel):
    model_config = ConfigDict(frozen=True)

    filename: str
    format: str
    record_index: int = 0
    model_count: int = 1
    categories: list[str] = Field(default_factory=list)
    facts: dict[str, Any] = Field(default_factory=dict)


class Chain(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int = Field(ge=1)
    name: str
    entity_type: str = "unknown"


class Residue(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int = Field(ge=1)
    chain_id: int = Field(ge=1)
    name: str
    author_number: int | None = None
    label_number: int | None = None
    insertion_code: str | None = None
    component_type: ComponentType = "unknown"


class Atom(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int = Field(ge=1)
    name: str
    element: str
    coordinates: tuple[float, float, float]
    residue_id: int | None = None
    formal_charge: int | None = None
    source_index: int = Field(ge=0)
    alternate_location: str | None = None
    occupancy: float | None = None
    b_factor: float | None = None
    inferred_fields: list[str] = Field(default_factory=list)


class Bond(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int = Field(ge=1)
    atom_1_id: int = Field(ge=1)
    atom_2_id: int = Field(ge=1)
    order: float | None = None
    aromatic: bool = False
    stereo: str | None = None
    inferred: bool = False


class Conformer(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int = Field(ge=1)
    name: str
    coordinates: list[tuple[float, float, float]]


class NormalizedStructureV1(BaseModel):
    model_config = ConfigDict(frozen=True)

    schema_version: Literal[1] = 1
    title: str
    structure_type: StructureType
    source: SourceFacts
    active_conformer_id: int = 1
    chains: list[Chain] = Field(default_factory=list)
    residues: list[Residue] = Field(default_factory=list)
    atoms: list[Atom]
    bonds: list[Bond] = Field(default_factory=list)
    conformers: list[Conformer]
    metadata: dict[str, Any] = Field(default_factory=dict)
    annotations: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[MolecularWarning] = Field(default_factory=list)
    inferences: list[InferenceRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_identity_and_coordinates(self) -> NormalizedStructureV1:
        atom_ids = [atom.id for atom in self.atoms]
        if atom_ids != list(range(1, len(atom_ids) + 1)):
            raise ValueError("Atom IDs must be contiguous, one-based, and stable")
        if len(set(atom_ids)) != len(atom_ids):
            raise ValueError("Atom IDs must be unique")
        atom_id_set = set(atom_ids)
        for bond in self.bonds:
            if bond.atom_1_id not in atom_id_set or bond.atom_2_id not in atom_id_set:
                raise ValueError("Bond endpoint does not reference an atom")
            if bond.atom_1_id == bond.atom_2_id:
                raise ValueError("Bond endpoints must differ")
        conformer_ids = {conformer.id for conformer in self.conformers}
        if self.active_conformer_id not in conformer_ids:
            raise ValueError("Active conformer does not exist")
        for conformer in self.conformers:
            if len(conformer.coordinates) != len(self.atoms):
                raise ValueError("Every conformer must provide one coordinate per atom")
        return self

    def to_bytes(self) -> bytes:
        return self.model_dump_json(indent=None).encode("utf-8")

    @classmethod
    def from_bytes(cls, payload: bytes) -> NormalizedStructureV1:
        return cls.model_validate_json(payload)

    @property
    def active_coordinates(self) -> list[tuple[float, float, float]]:
        return next(
            conformer.coordinates
            for conformer in self.conformers
            if conformer.id == self.active_conformer_id
        )
