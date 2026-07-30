from __future__ import annotations

from pathlib import Path

import pytest
from molweave_core.adapters.defaults import create_default_registry

FIXTURES = Path(__file__).parents[2] / "fixtures" / "formats"


@pytest.mark.parametrize("target_format", ["pdb", "mmcif", "sdf", "mol", "mol2", "xyz", "smiles"])
def test_individual_structure_exports_through_every_adapter(target_format: str) -> None:
    registry = create_default_registry()
    structure = (
        registry.for_filename("ethanol.mol")
        .parse((FIXTURES / "ethanol.mol").read_bytes(), "ethanol.mol")
        .structures[0]
    )

    exported = registry.for_format(target_format).export(structure, "ethanol")

    assert exported.data
    assert exported.filename.startswith("ethanol.")
    reparsed = registry.for_filename(exported.filename).parse(exported.data, exported.filename)
    assert reparsed.structures
    original_heavy_atoms = sum(atom.element != "H" for atom in structure.atoms)
    roundtrip_heavy_atoms = sum(atom.element != "H" for atom in reparsed.structures[0].atoms)
    assert roundtrip_heavy_atoms == original_heavy_atoms


def test_export_enumerates_blocking_xyz_losses() -> None:
    registry = create_default_registry()
    structure = (
        registry.for_filename("tripos_benzene.mol2")
        .parse(
            (FIXTURES / "tripos_benzene.mol2").read_bytes(),
            "tripos_benzene.mol2",
        )
        .structures[0]
    )
    result = registry.for_format("xyz").export(structure, "benzene")
    warnings = {warning.code: warning for warning in result.warnings}
    assert warnings["connectivity_lost"].blocking
    assert warnings["bond_orders_lost"].blocking
    assert warnings["coordinates_not_preserved"].field == "coordinates"


def test_macromolecular_roundtrip_preserves_models_altloc_and_insertion_code() -> None:
    registry = create_default_registry()
    source = (
        registry.for_filename("protein_models_altloc.pdb")
        .parse(
            (FIXTURES / "protein_models_altloc.pdb").read_bytes(),
            "protein_models_altloc.pdb",
        )
        .structures[0]
    )
    for target_format in ("pdb", "mmcif"):
        exported = registry.for_format(target_format).export(source, "protein")
        roundtrip = (
            registry.for_filename(exported.filename)
            .parse(exported.data, exported.filename)
            .structures[0]
        )
        assert len(roundtrip.atoms) == len(source.atoms)
        assert len(roundtrip.conformers) == 2
        assert {atom.alternate_location for atom in roundtrip.atoms} >= {"A", "B"}
        assert roundtrip.residues[0].insertion_code == "A"
