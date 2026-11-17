from __future__ import annotations

import importlib
import itertools
from collections.abc import Iterator
from typing import Any

import pytest
from neistra_core.adapters.macromolecular import MmcifAdapter
from neistra_core.adapters.rdkit_common import mol_to_normalized
from neistra_core.ligands.candidates import resolve_candidates
from neistra_core.ligands.chemistry import prepare_chemistry
from neistra_core.ligands.occurrences import (
    OccurrenceIndex,
    OccurrenceLimits,
    build_occurrence_index,
    qualified_representation_key,
)
from neistra_core.ligands.reconcile import initial_designation, select_candidate
from neistra_core.ligands.source_evidence import MmcifSourceInventory, assess_mmcif_source
from neistra_core.molecular import NormalizedStructureV1
from rdkit import Chem

from tests.scientific.test_ligand_instances import cif

LIMITS = OccurrenceLimits(1024, 8192)


def source(smiles: str) -> tuple[NormalizedStructureV1, bytes]:
    return mol_to_normalized(
        Chem.MolFromSmiles(smiles), filename="occurrences.smi", format_name="smiles",
    ), f"{smiles}\n".encode()


def index(smiles: str, *, limits: OccurrenceLimits = LIMITS) -> OccurrenceIndex:
    structure, original = source(smiles)
    inventory = resolve_candidates(structure, original_bytes=original)
    return build_occurrence_index(
        structure, inventory, prepare_chemistry(structure, original_bytes=original), limits=limits,
    )


def values(value: OccurrenceIndex) -> list[int | None]:
    return [result.count for result in value.by_candidate.values()]


def test_repeated_complete_instances_count_without_merging_selection_identity() -> None:
    structure, original = source("CCO.CCO.CN")
    before = structure.to_bytes()
    inventory = resolve_candidates(structure, original_bytes=original)
    result = build_occurrence_index(
        structure, inventory, prepare_chemistry(structure, original_bytes=original), limits=LIMITS,
    )
    assert values(result) == [2, 2, 1]
    assert result.complete and result.chemical_complete and result.qualified_candidates == 3
    assert {value.basis for value in result.by_candidate.values()} == {
        "qualified_representation_v1",
    }
    assert inventory.automatic_candidate is None
    assert initial_designation(inventory, "source").status == "selection_required"
    first = select_candidate(inventory, inventory.candidates[0].candidate_key, "source")
    second = select_candidate(inventory, inventory.candidates[1].candidate_key, "source")
    assert first.instance_id != second.instance_id
    assert set(first.atom_ids).isdisjoint(second.atom_ids)
    assert structure.to_bytes() == before
    with pytest.raises(TypeError):
        result.by_candidate["other"] = result.default  # type: ignore[index]


def test_count_is_entry_wide_and_independent_of_twelve_card_pages() -> None:
    result = index(".".join(["CCO"] * 25 + ["CN"]))
    assert values(result) == [25] * 25 + [1]
    assert result.qualified_candidates == 26
    assert values(index("CCO")) == [1]


@pytest.mark.parametrize(
    ("first", "second"),
    [
        ("CCO", "CCN"),
        ("CCO", "[13CH3]CO"),
        ("CN", "C[NH3+]"),
        ("F[C@H](Cl)Br", "F[C@@H](Cl)Br"),
        ("C/C=C/C", "C/C=C\\C"),
        ("[CH3]", "C"),
        ("[CH2]", "[CH3]"),
    ],
)
def test_distinct_qualified_representations_do_not_merge(first: str, second: str) -> None:
    assert qualified_representation_key(Chem.MolFromSmiles(first)) != \
        qualified_representation_key(Chem.MolFromSmiles(second))


@pytest.mark.parametrize(
    "smiles",
    ["CCO", "C[CH3]", "F[C@H](Cl)Br", "C/C=C/C", "[13CH3]O", "[CH2]CO"],
)
def test_key_is_invariant_to_all_small_atom_permutations(smiles: str) -> None:
    molecule = Chem.MolFromSmiles(smiles)
    expected = qualified_representation_key(molecule)
    before = molecule.ToBinary()
    for order in itertools.permutations(range(molecule.GetNumAtoms())):
        permuted = Chem.RenumberAtoms(molecule, order)
        for atom in permuted.GetAtoms():
            atom.SetAtomMapNum(999 - atom.GetIdx())
            atom.SetProp("source_index", str(100 + atom.GetIdx()))
            atom.SetProp("atomLabel", "same editable label")
        assert qualified_representation_key(permuted) == expected
    assert molecule.ToBinary() == before


def test_key_ignores_coordinates_and_keeps_explicit_hydrogen_graph() -> None:
    molecule = Chem.MolFromSmiles("CCO")
    moved = Chem.Mol(molecule)
    conformer = Chem.Conformer(moved.GetNumAtoms())
    for identity in range(moved.GetNumAtoms()):
        conformer.SetAtomPosition(identity, (identity + 10.0, -20.0, 30.0))
    moved.AddConformer(conformer)
    assert qualified_representation_key(molecule) == qualified_representation_key(moved)
    assert qualified_representation_key(Chem.AddHs(molecule)) != \
        qualified_representation_key(molecule)
    assert qualified_representation_key(Chem.MolFromSmiles("C[CH3]")) == \
        qualified_representation_key(Chem.MolFromSmiles("[CH3]C"))
    assert qualified_representation_key(Chem.MolFromSmiles("CCO")) == \
        qualified_representation_key(Chem.MolFromSmiles("[CH3][CH2]O"))


def test_known_total_hydrogens_group_without_rewriting_representation() -> None:
    structure, original = source("CCO.[CH3][CH2]O.CN")
    before = structure.to_bytes()
    inventory = resolve_candidates(structure, original_bytes=original)
    result = build_occurrence_index(
        structure, inventory, prepare_chemistry(structure, original_bytes=original), limits=LIMITS,
    )
    assert values(result) == [2, 2, 1]
    assert structure.to_bytes() == before


def test_radical_spin_state_and_unknown_stereo_cannot_collapse() -> None:
    first = Chem.MolFromSmiles("[CH2]")
    second = Chem.Mol(first)
    second.GetAtomWithIdx(0).SetNumRadicalElectrons(0)
    assert qualified_representation_key(first) != qualified_representation_key(second)
    unknown = Chem.MolFromSmiles("CC=CC")
    unknown.GetBondWithIdx(1).SetStereo(Chem.BondStereo.STEREOANY)
    with pytest.raises(ValueError, match="occurrence_stereochemistry_unsupported"):
        qualified_representation_key(unknown)


def test_enhanced_stereo_is_explicitly_unavailable() -> None:
    molecule = Chem.MolFromSmiles("F[C@H](Cl)Br |&1:1|")
    assert molecule.GetStereoGroups()
    with pytest.raises(ValueError, match="occurrence_enhanced_stereochemistry_unsupported"):
        qualified_representation_key(molecule)


def test_structural_group_semantics_are_not_silently_discarded() -> None:
    molecule = Chem.MolFromSmiles("CCO")
    Chem.CreateMolSubstanceGroup(molecule, "SUP")
    with pytest.raises(ValueError, match="occurrence_structural_groups_unsupported"):
        qualified_representation_key(molecule)


def test_unknown_potential_candidate_invalidates_whole_chemical_total() -> None:
    result = index("CCO.CCO.*")
    assert not result.complete and not result.chemical_complete
    assert not values(result)
    assert result.default.count is None
    assert result.default.reason == "occurrence_inventory_unqualified"


def test_proved_ineligible_water_and_ions_do_not_hide_complete_chemical_count() -> None:
    result = index("CCO.O.[Na+].CCO")
    assert result.complete
    assert values(result) == [2, 2]


def test_missing_or_overlapping_inventory_never_becomes_count_one() -> None:
    structure, original = source("CCO.CCO")
    inventory = resolve_candidates(structure, original_bytes=original)
    for candidates in [inventory.candidates[:1], [inventory.candidates[0]] * 2]:
        partial = inventory.model_copy(update={"candidates": candidates})
        result = build_occurrence_index(
            structure, partial, prepare_chemistry(structure, original_bytes=original),
            limits=LIMITS,
        )
        assert not result.complete and result.default.reason == "occurrence_inventory_incomplete"


def test_admission_refuses_before_any_chemical_qualification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    structure, original = source("CCO.CCO.CN")
    inventory = resolve_candidates(structure, original_bytes=original)
    prepared = prepare_chemistry(structure, original_bytes=original)
    monkeypatch.setattr(prepared, "qualify", lambda _: pytest.fail("No admitted chemistry work"))
    for limits, reason in [
        (OccurrenceLimits(2, 8192), "occurrence_candidate_limit"),
        (OccurrenceLimits(1024, 7), "occurrence_atom_limit"),
        (OccurrenceLimits(1024, 8192, 2), "occurrence_atom_limit"),
    ]:
        result = build_occurrence_index(structure, inventory, prepared, limits=limits)
        assert not result.complete and result.default.reason == reason
        assert result.qualified_candidates == 0


def test_polled_budget_cannot_publish_a_partial_chemical_count() -> None:
    structure, original = source("CCO.CCO.CN")
    inventory = resolve_candidates(structure, original_bytes=original)
    ticks: Iterator[float] = iter([0, 0, 0, 2])
    result = build_occurrence_index(
        structure, inventory, prepare_chemistry(structure, original_bytes=original),
        limits=LIMITS, deadline=1, clock=lambda: next(ticks),
    )
    assert result.qualified_candidates == 1
    assert not result.complete and not result.by_candidate
    assert result.default.reason == "occurrence_work_limit"


def test_verified_source_entity_counts_need_no_chemical_guessing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = cif(repeated=True)
    structure = MmcifAdapter().parse(original, filename="repeat.cif").structures[0]
    assessed = assess_mmcif_source(structure, original)
    inventory = resolve_candidates(structure, original_bytes=original, source_inventory=assessed)
    prepared = prepare_chemistry(structure, original_bytes=original)
    monkeypatch.setattr(
        prepared, "qualify", lambda _: pytest.fail("Source count needs no chemistry"),
    )
    result = build_occurrence_index(
        structure, inventory, prepared, limits=OccurrenceLimits(1024, 1),
        source_inventory=assessed,
    )
    ligands = [c for c in inventory.candidates if c.potential_ligand]
    assert len(ligands) == 2
    assert [result.for_candidate(c.candidate_key).count for c in ligands] == [2, 2]
    assert {result.for_candidate(c.candidate_key).basis for c in ligands} == {
        "verified_source_entity_v1",
    }
    assert result.complete and not result.chemical_complete and result.qualified_candidates == 0


def test_source_count_uses_entities_not_same_residue_labels() -> None:
    original = cif(repeated=True).replace(b"2 non-polymer\n", b"2 non-polymer\n3 non-polymer\n") \
        .replace(b"C 2\n", b"C 3\n").replace(b"LIG C 2", b"LIG C 3")
    structure = MmcifAdapter().parse(original, filename="different.cif").structures[0]
    assessed = assess_mmcif_source(structure, original)
    assert assessed.status == "qualified"
    inventory = resolve_candidates(structure, original_bytes=original, source_inventory=assessed)
    result = build_occurrence_index(
        structure, inventory, prepare_chemistry(structure, original_bytes=original),
        limits=LIMITS, source_inventory=assessed,
    )
    assert values(result) == [1, 1]


def test_incomplete_source_occurrence_does_not_reduce_count_to_known_one() -> None:
    original = cif(repeated=True)
    structure = MmcifAdapter().parse(original, filename="repeat.cif").structures[0]
    assessed = assess_mmcif_source(structure, original)
    inventory = resolve_candidates(structure, original_bytes=original, source_inventory=assessed)
    polymer, first, second = inventory.candidates
    fragments = [first.model_copy(update={
        "candidate_key": f"split-{identity}", "atom_ids": [identity],
        "boundary_status": "unsupported",
    }) for identity in first.atom_ids]
    partial = inventory.model_copy(update={"candidates": [polymer, *fragments, second]})
    result = build_occurrence_index(
        structure, partial, prepare_chemistry(structure, original_bytes=original),
        limits=LIMITS, source_inventory=assessed,
    )
    assert not result.complete
    assert result.for_candidate(second.candidate_key).count is None
    assert not result.by_candidate


def test_source_basis_survives_current_chemical_edit_and_excludes_unknown_mapping() -> None:
    original = cif(repeated=True)
    structure = MmcifAdapter().parse(original, filename="repeat.cif").structures[0]
    atom = next(a for a in structure.atoms if a.residue_id == 2)
    edited = structure.model_copy(update={"atoms": [
        a.model_copy(update={"element": "N"}) if a.id == atom.id else a for a in structure.atoms
    ]})
    assessed = assess_mmcif_source(edited, original)
    assert assessed.status == "qualified"
    inventory = resolve_candidates(edited, original_bytes=original, source_inventory=assessed)
    result = build_occurrence_index(
        edited, inventory, prepare_chemistry(edited, original_bytes=original),
        limits=LIMITS, source_inventory=assessed,
    )
    assert values(result) == [2, 2]
    missing = MmcifSourceInventory("unavailable", {}, "original_mmcif_inventory_not_declared")
    refused = build_occurrence_index(
        edited, inventory, prepare_chemistry(edited, original_bytes=original),
        limits=LIMITS, source_inventory=missing,
    )
    assert not refused.complete
    assert all(
        value.basis != "verified_source_entity_v1" for value in refused.by_candidate.values()
    )


def test_preassessed_source_does_not_parse_again(monkeypatch: pytest.MonkeyPatch) -> None:
    original = cif(repeated=True)
    structure = MmcifAdapter().parse(original, filename="repeat.cif").structures[0]
    assessed = assess_mmcif_source(structure, original)
    module: Any = importlib.import_module("neistra_core.ligands.candidates")
    monkeypatch.setattr(module, "assess_mmcif_source", lambda *_: pytest.fail("Do not reparse"))
    inventory = resolve_candidates(structure, original_bytes=original, source_inventory=assessed)
    result = build_occurrence_index(
        structure, inventory, prepare_chemistry(structure, original_bytes=original),
        limits=LIMITS, source_inventory=assessed,
    )
    assert values(result) == [2, 2]


def test_shared_preparation_covers_water_recognition_and_counting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    structure, original = source("CCO.O.CCO")
    prepared = prepare_chemistry(structure, original_bytes=original)
    module: Any = importlib.import_module("neistra_core.ligands.candidates")
    monkeypatch.setattr(
        module, "prepare_chemistry", lambda *_args, **_kw: pytest.fail("Reuse input"),
    )
    inventory = resolve_candidates(
        structure, original_bytes=original, prepared_chemistry=prepared,
    )
    result = build_occurrence_index(structure, inventory, prepared, limits=LIMITS)
    assert values(result) == [2, 2]


def test_compatibility_module_is_the_same_implementation() -> None:
    assert importlib.import_module("molweave_core.ligands.occurrences") is \
        importlib.import_module("neistra_core.ligands.occurrences")
