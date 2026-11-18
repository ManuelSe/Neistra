from __future__ import annotations

import pytest
from neistra_core.adapters.ligand import MolAdapter, SmilesAdapter
from neistra_core.adapters.macromolecular import MmcifAdapter, PdbAdapter
from neistra_core.editing.model import (
    DirectMolecularEditor,
    ModelCharge,
    ModelElement,
    ModelHydrogenAdd,
)
from neistra_core.ligands.candidates import resolve_candidates
from neistra_core.ligands.chemistry import depict_ligand, qualify_chemistry
from neistra_core.ligands.reconcile import initial_designation
from rdkit import Chem

from tests.scientific.test_ligand_instances import cif


@pytest.mark.parametrize("pattern", ["*", "*C", "[C;H3]", "C-,=C", "C~C"])
def test_exact_original_query_or_dummy_is_selectable_without_qualified_chemistry(
    pattern: str,
) -> None:
    if "*" in pattern:
        original = f"{pattern} placeholder\n".encode()
        structure = SmilesAdapter().parse(original, "placeholder.smi").structures[0]
    else:
        original = Chem.MolToMolBlock(Chem.MolFromSmarts(pattern), forceV3000=True).encode()
        structure = MolAdapter().parse(original, "query.mol").structures[0]
    before = structure.to_bytes()
    inventory = resolve_candidates(structure, original_bytes=original)
    candidate = inventory.automatic_candidate
    assert candidate is not None and candidate.selectable
    expected_count = None if "*" in pattern else 1 if pattern == "[C;H3]" else 2
    assert candidate.heavy_atom_count == expected_count
    chemistry = qualify_chemistry(structure, candidate.atom_ids, original_bytes=original)
    assert chemistry.status == "unavailable"
    assert chemistry.reason == "query_or_dummy_representation_unsupported"
    assert chemistry.input_hash is None
    assert chemistry.formula is None
    assert chemistry.molecular_weight is None
    assert chemistry.formal_charge is None
    drawing = depict_ligand(structure, candidate.atom_ids, original_bytes=original)
    assert drawing.status == "unavailable" and drawing.svg is None
    assert structure.to_bytes() == before


@pytest.mark.parametrize("smiles,expected", [("[13CH4]", 1), ("[2H][3H]", 0), ("[2H]O[2H]", 1)])
def test_nuclear_counts_preserve_isotopes_and_distinguish_zero(smiles: str, expected: int) -> None:
    original = f"{smiles} isotope\n".encode()
    structure = SmilesAdapter().parse(original, "isotope.smi").structures[0]
    assert resolve_candidates(structure, original_bytes=original).candidates[0].heavy_atom_count \
        == expected


@pytest.mark.parametrize("element", ["Xx", "*", "D", "T"])
def test_undefined_elements_do_not_become_known_heavy_counts(element: str) -> None:
    original = b"C known\n"
    structure = SmilesAdapter().parse(original, "known.smi").structures[0]
    # This isolates the independent count of canonical sites, without claiming
    # that these modified atoms have qualified chemistry or source provenance.
    structure = structure.model_copy(update={"atoms": [
        structure.atoms[0].model_copy(update={"element": element}), *structure.atoms[1:],
    ]})
    candidate = resolve_candidates(structure).candidates[0]
    assert candidate.heavy_atom_count == (0 if element in {"D", "T"} else None)


@pytest.mark.parametrize("missing", ["charge", "bond_order"])
def test_missing_chemistry_does_not_erase_known_nuclear_counts(missing: str) -> None:
    structure = SmilesAdapter().parse(b"CCO example\n", "known.smi").structures[0]
    if missing == "charge":
        structure = structure.model_copy(update={"atoms": [
            atom.model_copy(update={"formal_charge": None}) for atom in structure.atoms
        ]})
    else:
        structure = structure.model_copy(update={"bonds": [
            bond.model_copy(update={"order": None}) for bond in structure.bonds
        ]})
    candidate = resolve_candidates(structure).candidates[0]
    assert candidate.heavy_atom_count == 3
    assert qualify_chemistry(structure, candidate.atom_ids).status == "unavailable"


@pytest.mark.parametrize("smiles", ["O", "[2H]O[2H]", "[18OH2]"])
def test_water_isotopologues_are_ineligible_without_changing_their_representation(
    smiles: str,
) -> None:
    original = f"{smiles} water\n".encode()
    structure = SmilesAdapter().parse(original, "water.smi").structures[0]
    before = structure.to_bytes()
    inventory = resolve_candidates(structure, original_bytes=original)
    assert inventory.candidates[0].reason_codes == ["water"]
    assert inventory.candidates[0].boundary_status == "ineligible"
    assert initial_designation(inventory, "source").status == "not_applicable"
    assert structure.to_bytes() == before


@pytest.mark.parametrize("water", ["O", "[2H]O[2H]", "[18OH2]"])
def test_water_isotopes_do_not_prevent_unique_ethanol_assignment(water: str) -> None:
    original = f"CCO.{water} mixture\n".encode()
    structure = SmilesAdapter().parse(original, "mixture.smi").structures[0]
    inventory = resolve_candidates(structure, original_bytes=original)
    candidate = inventory.automatic_candidate
    assert candidate is not None and candidate.heavy_atom_count == 3
    assert initial_designation(inventory, "source").status == "resolved"
    assert qualify_chemistry(structure, candidate.atom_ids, original_bytes=original).formula \
        == "C2H6O"


@pytest.mark.parametrize("label", [b"LIG", b"HOH", b"WAT", b"DOD"])
def test_raw_nonpolymer_carbon_oxygen_instance_is_not_water_by_name(label: bytes) -> None:
    original = cif().replace(b"LIG", label)
    structure = MmcifAdapter().parse(original, "instance.cif").structures[0]
    before = structure.to_bytes()
    inventory = resolve_candidates(structure, original_bytes=original)
    candidate = inventory.automatic_candidate
    assert candidate is not None and candidate.atom_ids == [2, 3]
    assert candidate.boundary_status == "qualified"
    assert "water" not in candidate.reason_codes
    assert structure.to_bytes() == before


def test_supported_edit_from_water_to_methane_is_no_longer_excluded_as_water() -> None:
    original = (
        b"HETATM    1  O   HOH A   1       0.000   0.000   0.000  1.00 20.00           O\n"
        b"END\n"
    )
    structure = PdbAdapter().parse(original, "water.pdb").structures[0]
    editor = DirectMolecularEditor()
    actions = [
        ModelElement(operation="atom.element", element="C"),
        ModelCharge(operation="atom.charge.set", charge=0),
        ModelHydrogenAdd(operation="hydrogens.add", count=4),
    ]
    for action in actions:
        structure = editor.edit(
            structure, [1], action,
            next_atom_id=max(atom.id for atom in structure.atoms) + 1,
            next_bond_id=max((bond.id for bond in structure.bonds), default=0) + 1,
            hydrogen_policy="preserve",
        ).edit.structure
    before = structure.to_bytes()
    chemistry = qualify_chemistry(
        structure, [atom.id for atom in structure.atoms], original_bytes=original,
    )
    assert chemistry.status == "qualified" and chemistry.formula == "CH4"
    candidate = resolve_candidates(structure, original_bytes=original).candidates[0]
    assert candidate.boundary_status == "source_instance"
    assert candidate.selectable and candidate.potential_ligand
    assert "water" not in candidate.reason_codes
    assert structure.to_bytes() == before


@pytest.mark.parametrize("smiles", ["[OH-]", "[OH3+]"])
def test_charged_oxygen_hydrogen_molecules_are_not_neutral_water(smiles: str) -> None:
    original = f"{smiles} charged\n".encode()
    structure = SmilesAdapter().parse(original, "charged.smi").structures[0]
    inventory = resolve_candidates(structure, original_bytes=original)
    assert inventory.automatic_candidate is not None
    assert "water" not in inventory.candidates[0].reason_codes


def test_source_assigned_pdb_water_remains_ineligible_without_guessed_chemistry() -> None:
    original = (
        b"HETATM    1  O   HOH A   1       0.000   0.000   0.000  1.00 20.00           O\n"
        b"END\n"
    )
    structure = PdbAdapter().parse(original, "water.pdb").structures[0]
    inventory = resolve_candidates(structure, original_bytes=original)
    assert inventory.candidates[0].reason_codes == ["water"]
    chemistry = qualify_chemistry(structure, [1], original_bytes=original)
    assert chemistry.status == "unavailable"
    assert chemistry.formula is None and chemistry.formal_charge is None


def test_verified_mmcif_water_remains_ineligible_without_complete_hydrogen_facts() -> None:
    original = cif().replace(b"2 non-polymer", b"2 water").replace(b"LIG", b"HOH")
    original = b"\n".join(
        row for row in original.split(b"\n") if not row.startswith(b"HETATM 2 C C1")
    )
    structure = MmcifAdapter().parse(original, "water.cif").structures[0]
    before = structure.to_bytes()
    inventory = resolve_candidates(structure, original_bytes=original)
    water = next(candidate for candidate in inventory.candidates if candidate.atom_ids == [2])
    assert water.boundary_status == "ineligible" and water.reason_codes == ["water"]
    chemistry = qualify_chemistry(structure, water.atom_ids, original_bytes=original)
    assert chemistry.status == "unavailable"
    assert chemistry.formula is None and chemistry.formal_charge is None
    assert structure.to_bytes() == before
