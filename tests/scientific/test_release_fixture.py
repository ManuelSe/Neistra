from __future__ import annotations

import hashlib
from collections import Counter
from pathlib import Path

from molweave_core.adapters.base import ImportOptions
from molweave_core.adapters.defaults import create_default_registry

FIXTURE = Path(__file__).parents[1] / "fixtures" / "complex" / "1stp.pdb"


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
