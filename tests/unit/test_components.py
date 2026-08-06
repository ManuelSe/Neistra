from __future__ import annotations

from collections import Counter

from molweave_core.components import (
    category_atom_ids,
    component_atom_ids,
    derive_component_hierarchy,
)
from molweave_core.molecular import (
    Atom,
    Bond,
    Chain,
    Conformer,
    NormalizedStructureV1,
    Residue,
    SourceFacts,
)


def _structure() -> NormalizedStructureV1:
    residues = [
        Residue(
            id=1,
            chain_id=1,
            name="ALA",
            component_type="polymer",
            source_subchain_id="protein-A",
            source_entity_type="polymer",
            source_polymer_type="peptide_l",
        ),
        Residue(
            id=2,
            chain_id=2,
            name="DA",
            component_type="polymer",
            source_subchain_id="dna-B",
            source_entity_type="polymer",
            source_polymer_type="dna",
        ),
        Residue(
            id=3,
            chain_id=3,
            name="U",
            component_type="polymer",
            source_subchain_id="rna-C",
            source_entity_type="polymer",
            source_polymer_type="rna",
        ),
        Residue(
            id=4,
            chain_id=4,
            name="PNA",
            component_type="polymer",
            source_subchain_id="other-D",
            source_entity_type="polymer",
            source_polymer_type="pna",
        ),
        Residue(
            id=5,
            chain_id=5,
            name="LIG",
            component_type="ligand",
            source_entity_id="ligand-1",
            source_entity_type="non-polymer",
        ),
        Residue(
            id=6,
            chain_id=6,
            name="HOH",
            component_type="water",
            source_entity_type="water",
        ),
        Residue(
            id=7,
            chain_id=7,
            name="GOL",
            component_type="ligand",
            source_entity_type="non-polymer",
            source_residue_kind="buf",
        ),
        Residue(
            id=8,
            chain_id=8,
            name="ZN",
            component_type="ligand",
            source_entity_type="non-polymer",
            source_residue_kind="buf",
        ),
        Residue(
            id=9,
            chain_id=9,
            name="NAG",
            component_type="ligand",
            source_entity_type="branched",
        ),
        Residue(id=10, chain_id=10, name="???", component_type="unknown"),
    ]
    atoms = [
        Atom(
            id=index,
            name=f"A{index}",
            element="ZN" if index == 8 else "C",
            coordinates=(float(index), 0.0, 0.0),
            residue_id=index if index <= 10 else None,
            source_index=index - 1,
        )
        for index in range(1, 12)
    ]
    return NormalizedStructureV1(
        title="Classification matrix",
        structure_type="complex",
        source=SourceFacts(filename="matrix.cif", format="mmcif"),
        chains=[Chain(id=index, name=chr(64 + index)) for index in range(1, 11)],
        residues=residues,
        atoms=atoms,
        bonds=[Bond(id=1, atom_1_id=1, atom_2_id=5)],
        conformers=[
            Conformer(
                id=1,
                name="Model 1",
                coordinates=[atom.coordinates for atom in atoms],
            )
        ],
    )


def test_derivation_covers_every_category_with_disjoint_complete_membership() -> None:
    structure = _structure()
    hierarchy = derive_component_hierarchy(structure)

    assert Counter(component.category for component in hierarchy.components) == {
        "protein": 1,
        "dna": 1,
        "rna": 1,
        "other_polymer": 1,
        "ligand": 1,
        "water": 1,
        "solvent": 1,
        "ion": 1,
        "other_heterogen": 1,
        "unclassified": 2,
    }
    memberships = [
        atom_id
        for component in hierarchy.components
        for atom_id in component_atom_ids(structure, component)
    ]
    assert sorted(memberships) == list(range(1, 12))
    assert len(memberships) == len(set(memberships))
    assert category_atom_ids(structure, hierarchy, "unclassified") == [10, 11]
    assert {warning.code for warning in hierarchy.warnings} == {
        "component_classification_ambiguous"
    }


def test_component_ids_ignore_coordinates_labels_and_normalized_list_order() -> None:
    structure = _structure()
    first = derive_component_hierarchy(structure)
    moved_atoms = [
        atom.model_copy(update={"coordinates": (atom.coordinates[0] + 50.0, 1.0, 2.0)})
        for atom in structure.atoms
    ]
    changed = structure.model_copy(
        update={
            "title": "Renamed display",
            "chains": [
                chain.model_copy(update={"name": f"renamed-{chain.id}"})
                for chain in reversed(structure.chains)
            ],
            "residues": [
                residue.model_copy(update={"name": f"renamed-{residue.id}"})
                for residue in reversed(structure.residues)
            ],
            "atoms": moved_atoms,
            "conformers": [
                Conformer(
                    id=1,
                    name="Moved",
                    coordinates=[atom.coordinates for atom in moved_atoms],
                )
            ],
        }
    )
    second = derive_component_hierarchy(changed)

    first_identity = {
        component.id: component_atom_ids(structure, component)
        for component in first.components
    }
    second_identity = {
        component.id: component_atom_ids(changed, component)
        for component in second.components
    }
    assert first_identity == second_identity


def test_connectivity_does_not_merge_source_component_boundaries() -> None:
    structure = _structure()
    hierarchy = derive_component_hierarchy(structure)

    protein = next(
        component for component in hierarchy.components if component.category == "protein"
    )
    ligand = next(component for component in hierarchy.components if component.category == "ligand")
    assert component_atom_ids(structure, protein) == [1]
    assert component_atom_ids(structure, ligand) == [5]
    assert structure.bonds[0].atom_1_id == 1
    assert structure.bonds[0].atom_2_id == 5


def test_legacy_normalized_documents_use_conservative_fallback_without_rewrite() -> None:
    original = _structure()
    payload = original.model_dump(mode="json")
    for residue in payload["residues"]:
        for field in (
            "source_entity_id",
            "source_subchain_id",
            "source_entity_type",
            "source_polymer_type",
            "source_residue_kind",
        ):
            residue.pop(field)
    legacy = NormalizedStructureV1.model_validate(payload)
    before = legacy.to_bytes()

    hierarchy = derive_component_hierarchy(legacy)

    assert before == legacy.to_bytes()
    assert all(component.classification_source != "source" for component in hierarchy.components)
    assert category_atom_ids(legacy, hierarchy, "protein") == [1]
    assert category_atom_ids(legacy, hierarchy, "ligand") == [5]
    assert category_atom_ids(legacy, hierarchy, "solvent") == [7]
    assert category_atom_ids(legacy, hierarchy, "ion") == [8]
    assert category_atom_ids(legacy, hierarchy, "other_heterogen") == [9]
    assert category_atom_ids(legacy, hierarchy, "unclassified") == [10, 11]
