from __future__ import annotations

from typing import Any

from molweave_core.components import component_atom_ids, derive_component_hierarchy
from molweave_core.molecular import NormalizedStructureV1

ATOMIC_SELECTION_STYLES = frozenset(
    {"line", "stick", "thick-stick", "ball-and-stick", "space-filling"}
)
POLYMER_SELECTION_STYLES = frozenset({"backbone", "cartoon"})
TRACE_NAMES = {
    "protein": {"CA"},
    "dna": {"C4'", "C4*"},
    "rna": {"C4'", "C4*"},
}


def selection_style_channel(style: str) -> str:
    if style in ATOMIC_SELECTION_STYLES:
        return "atomic"
    if style in POLYMER_SELECTION_STYLES:
        return "polymer"
    raise ValueError(f"Unsupported selection representation style: {style}")


def update_selection_representations(
    assignments: list[dict[str, Any]],
    atom_ids: set[int],
    *,
    action: str,
    style: str | None = None,
) -> list[dict[str, Any]]:
    """Apply deterministic replacement-channel algebra to one entry."""
    if not atom_ids:
        raise ValueError("Selection representation target must not be empty")
    target_channel = selection_style_channel(style) if style is not None else None
    result: dict[str, set[int]] = {
        str(item["style"]): {int(atom_id) for atom_id in item["atom_ids"]} for item in assignments
    }
    for existing_style, existing_ids in result.items():
        if action == "reset" or selection_style_channel(existing_style) == target_channel:
            existing_ids.difference_update(atom_ids)
    if action == "apply":
        if style is None:
            raise ValueError("Style is required when applying a selection representation")
        result.setdefault(style, set()).update(atom_ids)
    elif action != "reset":
        raise ValueError(f"Unsupported selection representation action: {action}")
    return [
        {"style": item_style, "atom_ids": sorted(ids)}
        for item_style, ids in sorted(result.items())
        if ids
    ]


def prune_selection_representations(
    settings: dict[str, Any], deleted_atom_ids: set[int]
) -> dict[str, Any]:
    updated = {**settings}
    updated["selection_representations"] = [
        {"style": item["style"], "atom_ids": retained}
        for item in settings.get("selection_representations", [])
        if (retained := sorted(set(item["atom_ids"]) - deleted_atom_ids))
    ]
    return updated


def validate_polymer_selection(structure: NormalizedStructureV1, selected: set[int]) -> None:
    hierarchy = derive_component_hierarchy(structure)
    atom_by_id = {atom.id: atom for atom in structure.atoms}
    residue_atoms: dict[int, set[int]] = {}
    for atom in structure.atoms:
        if atom.residue_id is not None:
            residue_atoms.setdefault(atom.residue_id, set()).add(atom.id)
    supported_residues: dict[int, str] = {}
    for component in hierarchy.components:
        if component.category not in TRACE_NAMES:
            continue
        if selected.intersection(component_atom_ids(structure, component)):
            for residue_id in component.residue_ids:
                supported_residues[residue_id] = component.category
    selected_residues: set[int] = set()
    for atom_id in selected:
        selected_atom = atom_by_id.get(atom_id)
        if (
            selected_atom is None
            or selected_atom.residue_id is None
            or selected_atom.residue_id not in supported_residues
        ):
            raise ValueError("Backbone and Cartoon require complete protein, DNA, or RNA residues")
        selected_residues.add(selected_atom.residue_id)
    expected = {
        atom_id for residue_id in selected_residues for atom_id in residue_atoms[residue_id]
    }
    if selected != expected:
        raise ValueError("Backbone and Cartoon require every atom in each selected residue")
    for residue_id in selected_residues:
        trace_names = TRACE_NAMES[supported_residues[residue_id]]
        if not any(
            atom_by_id[atom_id].name.strip().upper() in trace_names
            for atom_id in residue_atoms[residue_id]
        ):
            raise ValueError(
                "Backbone and Cartoon require usable trace atoms in every selected residue"
            )


def default_viewer_settings(structure_type: str) -> dict[str, Any]:
    style = "cartoon" if structure_type in {"protein", "complex"} else "ball-and-stick"
    return {
        "representations": [
            {
                "id": "primary",
                "style": style,
                "color_by": "element",
                "custom_color": "#3b82f6",
                "opacity": 1.0,
            }
        ],
        "selection_representations": [],
        "components": {
            "hydrogens": True,
            "solvent": True,
            "ions": True,
            "ligands": True,
            "protein": True,
        },
        "labels": {
            "atoms": False,
            "residues": False,
            "chains": False,
            "structure": False,
        },
    }
