from __future__ import annotations

from pathlib import Path

import pytest
from molweave_core.adapters.defaults import create_default_registry
from molweave_core.molecular import NormalizedStructureV1

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"


def parse(filename: str) -> tuple[NormalizedStructureV1, ...]:
    registry = create_default_registry()
    return (
        registry.for_filename(filename)
        .parse((FIXTURES / filename).read_bytes(), filename)
        .structures
    )


def test_pdb_preserves_models_altloc_occupancy_and_insertion_code() -> None:
    structure = parse("protein_models_altloc.pdb")[0]
    assert structure.structure_type == "protein"
    assert len(structure.conformers) == 2
    assert structure.residues[0].author_number == 10
    assert structure.residues[0].insertion_code == "A"
    alternatives = {
        atom.alternate_location: atom.occupancy for atom in structure.atoms if atom.name == "CA"
    }
    assert alternatives == {"A": pytest.approx(0.6), "B": pytest.approx(0.4)}
    assert "models_retained_as_conformers" in {warning.code for warning in structure.warnings}


def test_mmcif_retains_models_and_reports_original_only_categories() -> None:
    structure = parse("protein_models.cif")[0]
    assert len(structure.conformers) == 2
    assert "_exptl." in structure.source.categories
    assert "_exptl." in structure.source.facts["unmodeled_categories"]
    assert "mmcif_categories_original_only" in {warning.code for warning in structure.warnings}


def test_pdb_ligand_connectivity_never_invents_bond_order() -> None:
    structure = parse("ligand_conect.pdb")[0]
    assert len(structure.bonds) == 1
    assert structure.bonds[0].order is None
    assert not structure.bonds[0].inferred
    assert "pdb_bond_orders_unknown" in {warning.code for warning in structure.warnings}


def test_xyz_connectivity_is_explicitly_inferred_with_unknown_order() -> None:
    structure = parse("water.xyz")[0]
    assert len(structure.bonds) == 2
    assert all(bond.inferred and bond.order is None for bond in structure.bonds)
    assert structure.inferences[0].code == "xyz_connectivity_inferred"
    assert "xyz_bond_orders_unknown" in {warning.code for warning in structure.warnings}


def test_smiles_3d_generation_is_deterministic_and_recorded() -> None:
    first = parse("molecules.smi")
    second = parse("molecules.smi")
    assert len(first) == 2
    assert first[0].active_coordinates == second[0].active_coordinates
    assert any(abs(z) > 0.01 for _, _, z in first[0].active_coordinates)
    assert first[0].inferences[0].code == "smiles_coordinates_generated"
    assert first[1].metadata["canonical_smiles"]


def test_sdf_records_become_distinct_entries_and_properties_survive() -> None:
    structures = parse("molecules.sdf")
    assert [structure.title for structure in structures] == ["Ethanol", "Carbonyl"]
    assert structures[0].metadata["properties"]["SOURCE"] == "fixture"
    assert structures[1].bonds[0].order == 2.0


def test_representative_tripos_and_corina_mol2_typing_is_retained() -> None:
    tripos = parse("tripos_benzene.mol2")[0]
    corina = parse("corina_carboxylate.mol2")[0]
    assert tripos.metadata["mol2_atom_types"] == ["C.ar"] * 6
    assert all(bond.aromatic for bond in tripos.bonds)
    assert corina.metadata["mol2_atom_types"] == ["C.3", "C.2", "O.co2", "O.co2"]
    orders_by_endpoints = {
        frozenset((bond.atom_1_id, bond.atom_2_id)): bond.order for bond in corina.bonds
    }
    assert orders_by_endpoints[frozenset((1, 2))] == 1.0
    assert {
        orders_by_endpoints[frozenset((2, 3))],
        orders_by_endpoints[frozenset((2, 4))],
    } == {1.0, 2.0}
