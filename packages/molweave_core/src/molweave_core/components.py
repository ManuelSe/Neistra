from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from typing import Literal, NamedTuple

from pydantic import BaseModel, ConfigDict, Field, model_validator

from molweave_core.molecular import MolecularWarning, NormalizedStructureV1, Residue

ComponentCategory = Literal[
    "protein",
    "dna",
    "rna",
    "other_polymer",
    "ligand",
    "water",
    "solvent",
    "ion",
    "other_heterogen",
    "unclassified",
]
ClassificationSource = Literal["source", "fallback", "ambiguous"]
ClassificationStatus = Literal["assigned", "ambiguous"]

POLYMER_CATEGORIES = {"protein", "dna", "rna", "other_polymer"}
CATEGORY_ORDER: tuple[ComponentCategory, ...] = (
    "protein",
    "dna",
    "rna",
    "other_polymer",
    "ligand",
    "water",
    "solvent",
    "ion",
    "other_heterogen",
    "unclassified",
)

PROTEIN_KINDS = {"aa", "aad", "maa", "paa"}
DNA_KINDS = {"dna"}
RNA_KINDS = {"rna"}
SOLVENT_KINDS = {"buf"}
HETEROGEN_KINDS = {"ket", "pyr"}
WATER_KINDS = {"hoh"}

PROTEIN_NAMES = {
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
}
DNA_NAMES = {"DA", "DC", "DG", "DI", "DT", "DU"}
RNA_NAMES = {"A", "C", "G", "I", "U"}
WATER_NAMES = {"DOD", "H2O", "HOH", "WAT"}
SOLVENT_NAMES = {
    "ACT",
    "ACY",
    "BME",
    "BOG",
    "CIT",
    "DMS",
    "EDO",
    "FMT",
    "GOL",
    "MPD",
    "PEG",
    "PG4",
    "PO4",
    "SO4",
    "TRS",
}
SUGAR_NAMES = {
    "BGC",
    "FUC",
    "GAL",
    "GLC",
    "MAN",
    "NAG",
    "NDG",
    "SIA",
}

# A single atom is treated as an ion only when its element is a common
# monatomic ion or metal. The residue/source boundary remains authoritative.
ION_ELEMENTS = {
    "AG",
    "AL",
    "AU",
    "BA",
    "BE",
    "BR",
    "CA",
    "CD",
    "CE",
    "CL",
    "CO",
    "CR",
    "CS",
    "CU",
    "DY",
    "ER",
    "EU",
    "F",
    "FE",
    "GA",
    "GD",
    "HG",
    "HO",
    "I",
    "IN",
    "IR",
    "K",
    "LA",
    "LI",
    "LU",
    "MG",
    "MN",
    "MO",
    "NA",
    "NB",
    "ND",
    "NI",
    "OS",
    "PB",
    "PD",
    "PR",
    "PT",
    "RB",
    "RE",
    "RH",
    "RU",
    "SB",
    "SC",
    "SM",
    "SN",
    "SR",
    "TA",
    "TB",
    "TC",
    "TI",
    "TL",
    "TM",
    "V",
    "W",
    "Y",
    "YB",
    "ZN",
    "ZR",
}


class ComponentV1(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    category: ComponentCategory
    display_label: str
    chain_ids: list[int] = Field(default_factory=list)
    residue_ids: list[int] = Field(default_factory=list)
    atom_ids: list[int] = Field(default_factory=list)
    classification_source: ClassificationSource
    classification_status: ClassificationStatus
    warnings: list[MolecularWarning] = Field(default_factory=list)


class ComponentHierarchyV1(BaseModel):
    model_config = ConfigDict(frozen=True)

    schema_version: Literal[1] = 1
    components: list[ComponentV1]
    warnings: list[MolecularWarning] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_component_identity(self) -> ComponentHierarchyV1:
        component_ids = [component.id for component in self.components]
        if len(component_ids) != len(set(component_ids)):
            raise ValueError("Component IDs must be unique")
        return self


class _Classification(NamedTuple):
    category: ComponentCategory
    source: ClassificationSource
    status: ClassificationStatus


def _normalized_fact(value: str | None) -> str:
    return (value or "").strip().lower().replace("_", "-")


def _polymer_category(polymer_type: str | None) -> ComponentCategory | None:
    value = _normalized_fact(polymer_type).replace("-", "")
    if value in {"peptidel", "peptided"}:
        return "protein"
    if value == "dna":
        return "dna"
    if value == "rna":
        return "rna"
    if value in {
        "cyclicpseudopeptide",
        "dnarnahybrid",
        "other",
        "pna",
        "saccharided",
        "saccharidel",
    }:
        return "other_polymer"
    return None


def _fallback_polymer_category(residue: Residue) -> ComponentCategory | None:
    kind = _normalized_fact(residue.source_residue_kind)
    name = residue.name.strip().upper()
    if kind in PROTEIN_KINDS or name in PROTEIN_NAMES:
        return "protein"
    if kind in DNA_KINDS or name in DNA_NAMES:
        return "dna"
    if kind in RNA_KINDS or name in RNA_NAMES:
        return "rna"
    return None


def _is_single_atom_ion(atom_ids: list[int], elements: dict[int, str]) -> bool:
    return len(atom_ids) == 1 and elements.get(atom_ids[0], "").strip().upper() in ION_ELEMENTS


def _classify_residue(
    residue: Residue,
    atom_ids: list[int],
    elements: dict[int, str],
) -> _Classification:
    entity_type = _normalized_fact(residue.source_entity_type)
    polymer_category = _polymer_category(residue.source_polymer_type)
    kind = _normalized_fact(residue.source_residue_kind)
    name = residue.name.strip().upper()

    if entity_type == "water":
        return _Classification("water", "source", "assigned")
    if entity_type == "branched":
        return _Classification("other_heterogen", "source", "assigned")
    if entity_type == "polymer":
        if polymer_category:
            return _Classification(polymer_category, "source", "assigned")
        fallback_polymer = _fallback_polymer_category(residue)
        if fallback_polymer:
            return _Classification(fallback_polymer, "fallback", "assigned")
        return _Classification("other_polymer", "source", "assigned")

    if kind in WATER_KINDS or name in WATER_NAMES:
        return _Classification("water", "fallback", "assigned")
    if _is_single_atom_ion(atom_ids, elements):
        return _Classification("ion", "fallback", "assigned")
    if kind in SOLVENT_KINDS or name in SOLVENT_NAMES:
        return _Classification("solvent", "fallback", "assigned")
    if kind in HETEROGEN_KINDS or name in SUGAR_NAMES:
        return _Classification("other_heterogen", "fallback", "assigned")

    fallback_polymer = _fallback_polymer_category(residue)
    if fallback_polymer and (residue.component_type == "polymer" or entity_type == "polymer"):
        return _Classification(fallback_polymer, "fallback", "assigned")
    if residue.component_type == "polymer":
        return _Classification("other_polymer", "fallback", "assigned")
    if entity_type in {"non-polymer", "nonpolymer"}:
        return _Classification("ligand", "source", "assigned")
    if residue.component_type == "ligand":
        return _Classification("ligand", "fallback", "assigned")
    if residue.component_type == "water":
        return _Classification("water", "fallback", "assigned")
    if residue.component_type == "ion":
        return _Classification("ion", "fallback", "assigned")
    return _Classification("unclassified", "ambiguous", "ambiguous")


def _component_id(anchor: tuple[object, ...]) -> str:
    encoded = json.dumps(anchor, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return f"cmp-{hashlib.sha256(encoded).hexdigest()[:20]}"


def _residue_position(residue: Residue) -> str:
    number = residue.author_number if residue.author_number is not None else residue.label_number
    suffix = residue.insertion_code or ""
    return f" {number}{suffix}" if number is not None else ""


def _polymer_label(
    category: ComponentCategory,
    chain_name: str,
    subchain_id: str | None,
) -> str:
    names = {
        "protein": "Protein",
        "dna": "DNA",
        "rna": "RNA",
        "other_polymer": "Other polymer",
    }
    label = f"{names[category]} chain {chain_name or '(unnamed)'}"
    if subchain_id and subchain_id != chain_name:
        label += f" ({subchain_id})"
    return label


def _residue_label(residue: Residue, chain_name: str) -> str:
    residue_name = residue.name.strip() or "Unknown"
    shown_chain = chain_name or "(unnamed)"
    return f"{residue_name}{_residue_position(residue)} · chain {shown_chain}"


def _ambiguous_warning(label: str) -> MolecularWarning:
    return MolecularWarning(
        code="component_classification_ambiguous",
        message=f"{label} could not be assigned to a narrower component category.",
        operation="component_detection",
        field="component.category",
    )


def derive_component_hierarchy(structure: NormalizedStructureV1) -> ComponentHierarchyV1:
    chains = {chain.id: chain for chain in structure.chains}
    residues = {residue.id: residue for residue in structure.residues}
    atoms = {atom.id: atom for atom in structure.atoms}
    residue_atoms: dict[int, list[int]] = defaultdict(list)
    orphan_atom_ids: list[int] = []
    elements = {atom.id: atom.element for atom in structure.atoms}
    for atom in structure.atoms:
        if atom.residue_id is not None and atom.residue_id in residues:
            residue_atoms[atom.residue_id].append(atom.id)
        else:
            orphan_atom_ids.append(atom.id)

    classified = {
        residue_id: _classify_residue(residue, residue_atoms[residue_id], elements)
        for residue_id, residue in residues.items()
        if residue_atoms[residue_id]
    }
    polymer_groups: dict[tuple[ComponentCategory, int, str], list[Residue]] = defaultdict(list)
    components: list[ComponentV1] = []

    for residue_id, classification in classified.items():
        residue = residues[residue_id]
        chain = chains.get(residue.chain_id)
        chain_name = chain.name if chain else str(residue.chain_id)
        if classification.category in POLYMER_CATEGORIES:
            source_anchor = (
                residue.source_subchain_id
                or residue.source_entity_id
                or f"chain:{residue.chain_id}"
            )
            polymer_groups[
                (classification.category, residue.chain_id, source_anchor)
            ].append(residue)
            continue

        label = _residue_label(residue, chain_name)
        warnings = [_ambiguous_warning(label)] if classification.status == "ambiguous" else []
        components.append(
            ComponentV1(
                id=_component_id(("residue", residue.chain_id, residue.id)),
                category=classification.category,
                display_label=label,
                chain_ids=[residue.chain_id],
                residue_ids=[residue.id],
                classification_source=classification.source,
                classification_status=classification.status,
                warnings=warnings,
            )
        )

    for (category, chain_id, source_anchor), group in polymer_groups.items():
        ordered = sorted(group, key=lambda residue: residue.id)
        chain = chains.get(chain_id)
        chain_name = chain.name if chain else str(chain_id)
        sources = {classified[residue.id].source for residue in ordered}
        source: ClassificationSource = (
            "ambiguous"
            if "ambiguous" in sources
            else "source"
            if sources == {"source"}
            else "fallback"
        )
        subchain = ordered[0].source_subchain_id
        components.append(
            ComponentV1(
                id=_component_id(("polymer", category, chain_id, source_anchor)),
                category=category,
                display_label=_polymer_label(category, chain_name, subchain),
                chain_ids=[chain_id],
                residue_ids=[residue.id for residue in ordered],
                classification_source=source,
                classification_status="ambiguous" if source == "ambiguous" else "assigned",
            )
        )

    for atom_id in orphan_atom_ids:
        atom = atoms[atom_id]
        label = f"Unclassified atom {atom.name or atom.element} ({atom.id})"
        components.append(
            ComponentV1(
                id=_component_id(("atom", atom.id)),
                category="unclassified",
                display_label=label,
                atom_ids=[atom.id],
                classification_source="ambiguous",
                classification_status="ambiguous",
                warnings=[_ambiguous_warning(label)],
            )
        )

    category_index = {category: index for index, category in enumerate(CATEGORY_ORDER)}
    components.sort(
        key=lambda component: (
            category_index[component.category],
            component.display_label.casefold(),
            component.id,
        )
    )
    ambiguous_count = sum(
        component.classification_status == "ambiguous" for component in components
    )
    hierarchy_warnings = (
        [
            MolecularWarning(
                code="component_classification_ambiguous",
                message=(
                    f"{ambiguous_count} component assignment"
                    f"{'s remain' if ambiguous_count != 1 else ' remains'} unclassified."
                ),
                operation="component_detection",
                field="components",
            )
        ]
        if ambiguous_count
        else []
    )
    hierarchy = ComponentHierarchyV1(components=components, warnings=hierarchy_warnings)
    _validate_complete_membership(structure, hierarchy)
    return hierarchy


def component_atom_ids(
    structure: NormalizedStructureV1,
    component: ComponentV1,
) -> list[int]:
    residue_ids = set(component.residue_ids)
    explicit_ids = set(component.atom_ids)
    return sorted(
        atom.id
        for atom in structure.atoms
        if atom.id in explicit_ids
        or (atom.residue_id is not None and atom.residue_id in residue_ids)
    )


def category_atom_ids(
    structure: NormalizedStructureV1,
    hierarchy: ComponentHierarchyV1,
    category: ComponentCategory,
) -> list[int]:
    return sorted(
        {
            atom_id
            for component in hierarchy.components
            if component.category == category
            for atom_id in component_atom_ids(structure, component)
        }
    )


def _validate_complete_membership(
    structure: NormalizedStructureV1,
    hierarchy: ComponentHierarchyV1,
) -> None:
    memberships = [
        atom_id
        for component in hierarchy.components
        for atom_id in component_atom_ids(structure, component)
    ]
    expected = sorted(atom.id for atom in structure.atoms)
    if sorted(memberships) != expected:
        raise ValueError("Every atom must belong to exactly one component")
