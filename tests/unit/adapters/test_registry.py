from __future__ import annotations

from pathlib import Path

import pytest
from molweave_core.adapters import AdapterError
from molweave_core.adapters.defaults import create_default_registry

FIXTURES = Path(__file__).parents[2] / "fixtures" / "formats"


def test_default_registry_exposes_every_m2_format() -> None:
    registry = create_default_registry()
    assert {item.format for item in registry.capabilities()} == {
        "pdb",
        "mmcif",
        "sdf",
        "mol",
        "mol2",
        "xyz",
        "smiles",
    }
    assert all(item.can_import and item.can_export for item in registry.capabilities())
    assert registry.for_filename("protein.CIF").capabilities.format == "mmcif"
    assert registry.for_filename("molecule.smiles").capabilities.format == "smiles"


def test_unknown_extension_has_structured_actionable_error() -> None:
    with pytest.raises(AdapterError) as raised:
        create_default_registry().for_filename("unsafe.pdbqt")
    assert raised.value.code == "unsupported_format"
    assert raised.value.filename == "unsafe.pdbqt"
    assert "registered" in raised.value.message


@pytest.mark.parametrize(
    ("filename", "expected_structures"),
    [
        ("protein_models_altloc.pdb", 1),
        ("protein_models.cif", 1),
        ("molecules.sdf", 2),
        ("ethanol.mol", 1),
        ("tripos_benzene.mol2", 1),
        ("water.xyz", 1),
        ("molecules.smi", 2),
    ],
)
def test_each_required_fixture_imports(filename: str, expected_structures: int) -> None:
    registry = create_default_registry()
    result = registry.for_filename(filename).parse((FIXTURES / filename).read_bytes(), filename)
    assert len(result.structures) == expected_structures
    assert all(structure.atoms for structure in result.structures)
    assert all(structure.schema_version == 1 for structure in result.structures)


def test_malformed_structure_error_is_tied_to_file_and_operation() -> None:
    registry = create_default_registry()
    with pytest.raises(AdapterError) as raised:
        registry.for_filename("malformed.pdb").parse(
            (FIXTURES / "malformed.pdb").read_bytes(), "malformed.pdb"
        )
    assert raised.value.code == "no_atoms"
    assert raised.value.filename == "malformed.pdb"
    assert raised.value.operation == "import"
