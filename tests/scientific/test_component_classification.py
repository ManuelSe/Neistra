from __future__ import annotations

from collections import Counter
from pathlib import Path

from molweave_core.adapters.defaults import create_default_registry
from molweave_core.components import component_atom_ids, derive_component_hierarchy
from molweave_core.molecular import NormalizedStructureV1

FIXTURES = Path(__file__).parents[1] / "fixtures"


def _parse(path: Path) -> NormalizedStructureV1:
    return (
        create_default_registry()
        .for_filename(path.name)
        .parse(path.read_bytes(), path.name)
        .structures[0]
    )


def test_pdb_source_entities_preserve_protein_ligand_and_water_instances() -> None:
    structure = _parse(FIXTURES / "complex" / "1stp.pdb")
    hierarchy = derive_component_hierarchy(structure)

    assert Counter(component.category for component in hierarchy.components) == {
        "protein": 1,
        "ligand": 1,
        "water": 84,
    }
    protein = next(
        component for component in hierarchy.components if component.category == "protein"
    )
    ligand = next(component for component in hierarchy.components if component.category == "ligand")
    assert len(component_atom_ids(structure, protein)) == 901
    assert len(component_atom_ids(structure, ligand)) == 16
    assert ligand.display_label.startswith("BTN 300")
    assert {component.classification_source for component in hierarchy.components} == {"source"}
    assert {
        residue.source_entity_type
        for residue in structure.residues
    } == {"polymer", "non-polymer", "water"}
    assert next(
        residue.source_polymer_type
        for residue in structure.residues
        if residue.component_type == "polymer"
    ) == "peptide_l"


def test_pdbx_polymer_metadata_precedes_fallback_and_is_deterministic() -> None:
    path = FIXTURES / "formats" / "protein_models.cif"
    first = _parse(path)
    second = _parse(path)
    first_hierarchy = derive_component_hierarchy(first)
    second_hierarchy = derive_component_hierarchy(second)

    assert len(first_hierarchy.components) == 1
    component = first_hierarchy.components[0]
    assert component.category == "protein"
    assert component.classification_source == "source"
    assert component.id == second_hierarchy.components[0].id
    assert component_atom_ids(first, component) == [1, 2, 3, 4, 5]


def test_rdkit_structure_is_one_explicit_ligand_component() -> None:
    structure = _parse(FIXTURES / "formats" / "ethanol.mol")
    hierarchy = derive_component_hierarchy(structure)

    assert len(hierarchy.components) == 1
    component = hierarchy.components[0]
    assert component.category == "ligand"
    assert component.classification_source == "source"
    assert component_atom_ids(structure, component) == [1, 2, 3]
