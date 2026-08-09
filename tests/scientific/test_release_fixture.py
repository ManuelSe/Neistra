from __future__ import annotations

import hashlib
from collections import Counter
from pathlib import Path

from molweave_core.adapters.base import ImportOptions
from molweave_core.adapters.defaults import create_default_registry
from molweave_core.components import component_atom_ids, derive_component_hierarchy

FIXTURE = Path(__file__).parents[1] / "fixtures" / "complex" / "1stp.pdb"
HYDROGEN_FIXTURES = Path(__file__).parents[1] / "fixtures" / "hydrogens"
POLAR_NEIGHBOR_ELEMENTS = {"N", "O", "S", "F", "CL", "BR", "I"}


def test_streptavidin_biotin_release_fixture_has_expected_scientific_content() -> None:
    data = FIXTURE.read_bytes()
    assert hashlib.sha256(data).hexdigest() == (
        "6fbb3d5c324e717fe7284703426e74ea58191431720daab1b2faa0bbb6430f30"
    )

    parsed = create_default_registry().for_filename(FIXTURE.name).parse(
        data,
        FIXTURE.name,
        ImportOptions(),
    )
    assert len(parsed.structures) == 1
    structure = parsed.structures[0]
    assert structure.structure_type == "complex"
    assert len(structure.atoms) == 1001
    assert len(structure.chains) == 1
    assert Counter(residue.component_type for residue in structure.residues) == {
        "polymer": 121,
        "water": 84,
        "ligand": 1,
    }
    assert [
        residue.name for residue in structure.residues if residue.component_type == "ligand"
    ] == ["BTN"]
    assert Counter(atom.element for atom in structure.atoms) == {
        "C": 572,
        "N": 158,
        "O": 270,
        "S": 1,
    }
    assert len(structure.bonds) == 17
    assert all(bond.order is None for bond in structure.bonds)
    assert {warning.code for warning in structure.warnings} == {"pdb_bond_orders_unknown"}
    hierarchy = derive_component_hierarchy(structure)
    assert Counter(component.category for component in hierarchy.components) == {
        "protein": 1,
        "ligand": 1,
        "water": 84,
    }
    assert sum(
        len(component_atom_ids(structure, component)) for component in hierarchy.components
    ) == len(structure.atoms)


def test_polar_hydrogen_fixtures_have_explicit_known_connectivity() -> None:
    expected = {
        "polar_hydrogens_protein.pdb": {
            "sha256": "ccf1a8da540fa9847abe751a9777e3a48966485955accecfa95e92d7878703e4",
            "structure_type": "protein",
            "warning_codes": {"pdb_bond_orders_unknown"},
        },
        "polar_hydrogens_ligand.mol": {
            "sha256": "a603d2fe048d3a961b2875f01b2ac0bbfcc9f6ff6607d5053844b314b079b7c5",
            "structure_type": "ligand",
            "warning_codes": set(),
        },
    }

    for filename, assertions in expected.items():
        path = HYDROGEN_FIXTURES / filename
        data = path.read_bytes()
        assert hashlib.sha256(data).hexdigest() == assertions["sha256"]
        parsed = create_default_registry().for_filename(path.name).parse(
            data,
            path.name,
            ImportOptions(infer_bonds=False),
        )
        assert len(parsed.structures) == 1
        structure = parsed.structures[0]
        assert structure.structure_type == assertions["structure_type"]
        assert Counter(atom.element.upper() for atom in structure.atoms) == {
            "C": 1,
            "H": 2,
            "O": 1,
        }
        assert len(structure.bonds) == 3
        assert {warning.code for warning in structure.warnings} == assertions[
            "warning_codes"
        ]

        atom_by_id = {atom.id: atom for atom in structure.atoms}
        neighbors: dict[int, set[int]] = {}
        for bond in structure.bonds:
            neighbors.setdefault(bond.atom_1_id, set()).add(bond.atom_2_id)
            neighbors.setdefault(bond.atom_2_id, set()).add(bond.atom_1_id)
        hydrogen_neighbors = {
            atom.id: {
                atom_by_id[neighbor_id].element.upper()
                for neighbor_id in neighbors.get(atom.id, set())
            }
            for atom in structure.atoms
            if atom.element.upper() == "H"
        }
        assert hydrogen_neighbors == {2: {"C"}, 4: {"O"}}
        assert {
            atom_id
            for atom_id, elements in hydrogen_neighbors.items()
            if elements.intersection(POLAR_NEIGHBOR_ELEMENTS)
        } == {4}
