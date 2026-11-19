"""Independent descriptor goldens, representation invariants and adversarial domains."""

from __future__ import annotations

import importlib
import itertools
from typing import Any

import pytest
from neistra_core.adapters.rdkit_common import mol_to_normalized
from neistra_core.ligand_properties import (
    DESCRIPTOR_DEFINITIONS,
    DESCRIPTOR_REGISTRY,
    DescriptorReport,
    calculate_prepared,
    calculate_properties,
    prepare_descriptor_input,
)
from neistra_core.molecular import InferenceRecord, NormalizedStructureV1
from rdkit import Chem


def source(smiles: str, *, explicit: bool = False) -> tuple[NormalizedStructureV1, bytes]:
    molecule = Chem.MolFromSmiles(smiles)
    assert molecule is not None
    if explicit:
        molecule = Chem.AddHs(molecule)
    return mol_to_normalized(
        molecule, filename="source.smi", format_name="smiles"
    ), f"{smiles}\n".encode()


def report(smiles: str, *, explicit: bool = False) -> DescriptorReport:
    structure, original = source(smiles, explicit=explicit)
    before = structure.to_bytes()
    result = calculate_properties(
        structure, [atom.id for atom in structure.atoms], original_bytes=original
    )
    assert structure.to_bytes() == before
    return result


def values(result: DescriptorReport) -> dict[str, int | float | None]:
    return {value.descriptor_id: value.value for value in result.values}


def test_ethanol_analytic_counts_and_source_bound_fragment_goldens() -> None:
    result = report("CCO")
    assert result.model_status == "qualified"
    assert values(result) == pytest.approx(
        {
            "molecular_weight": 2 * 12.011 + 6 * 1.008 + 15.999,
            "heavy_atom_count": 3,
            "heteroatom_count": 1,
            "carbon_count": 2,
            "formal_charge": 0,
            "hbd": 1,
            "hba": 1,
            "tpsa": 20.23,
            # Pinned RDKit Data/Crippen.txt C1 + C3 + O2 + 5 H1 + H2.
            # This is an independent sum of the published fragment constants.
            "calculated_logp": 0.1441 - 0.2035 - 0.2893 + 5 * 0.123 - 0.2677,
            "molar_refractivity": 2.503 + 2.753 + 0.8238 + 5 * 1.057 + 1.395,
            "rotatable_bond_count": 0,
            "ring_count": 0,
            "aromatic_ring_count": 0,
            "fraction_sp3": 1.0,
        },
        abs=1e-10,
        rel=0,
    )
    assert result.contains_formally_charged_atoms is False
    assert all(value.status == "ready" for value in result.values)
    assert len(result.coverage) == 14
    assert all(
        type(value.value) is int
        for value in result.values
        if DESCRIPTOR_REGISTRY[value.descriptor_id].value_type == "integer"
    )


@pytest.mark.parametrize(
    "smiles",
    [
        "CCO",
        "[CH3][CH2]O",
        "c1cc[nH]c1",
        "CC(=O)N",
        "F[C@H](Cl)Br",
        "C/C=C/C",
    ],
)
def test_ordinary_explicit_and_implicit_hydrogens_have_equal_results_and_content(
    smiles: str,
) -> None:
    implicit = report(smiles)
    explicit = report(smiles, explicit=True)
    assert implicit.model_status == explicit.model_status == "qualified"
    assert values(implicit) == values(explicit)
    assert implicit.input_hash == explicit.input_hash


def test_foscarnic_tpsa_pins_exclusion_of_sulfur_and_phosphorus_terms() -> None:
    result = report("OC(=O)P(=O)(O)O")
    assert result.get_value("tpsa").value == pytest.approx(94.83, abs=1e-10, rel=0)
    assert result.get_value("tpsa").value != pytest.approx(104.64)
    assert result.get_value("formal_charge").value == 0
    assert result.get_value("carbon_count").value == 1


@pytest.mark.parametrize(
    "smiles,rings,aromatic",
    [
        ("c1ccccc1", 1, 1),
        ("c1ccc2ccccc2c1", 2, 2),
        ("C1CCCCC1", 1, 0),
        # Cubane has six perceived rings but cycle rank E-V+1 is five.
        ("C12C3C4C1C5C2C3C45", 6, 0),
    ],
)
def test_pinned_perceived_ring_definition_is_not_cycle_rank(
    smiles: str,
    rings: int,
    aromatic: int,
) -> None:
    result = report(smiles)
    assert result.get_value("ring_count").value == rings
    assert result.get_value("aromatic_ring_count").value == aromatic


@pytest.mark.parametrize("smiles,rotors", [("CCCC", 1), ("CC(=O)NC", 0), ("CCO", 0)])
def test_strict_rotors_exclude_amides_and_terminal_bonds(smiles: str, rotors: int) -> None:
    assert report(smiles).get_value("rotatable_bond_count").value == rotors


def test_carbon_free_fraction_is_unavailable_while_other_values_survive() -> None:
    result = report("N")
    assert result.get_value("carbon_count").value == 0
    assert result.get_value("fraction_sp3").status == "unavailable"
    assert result.get_value("fraction_sp3").reason == "no_carbon_atoms"
    assert result.get_value("heavy_atom_count").value == 1
    assert result.get_value("molecular_weight").status == "ready"


@pytest.mark.parametrize(
    "smiles,reason",
    [
        ("[13CH3]O", "isotope_model_not_qualified"),
        ("[2H]O[2H]", "isotope_model_not_qualified"),
        ("[CH3]", "radical_model_not_qualified"),
        ("[H-]", "nonterminal_or_charged_hydrogen_unsupported"),
        ("[Na+]", "element_model_not_qualified"),
    ],
)
def test_unsupported_model_domain_preserves_independent_counts_charge_and_originals(
    smiles: str,
    reason: str,
) -> None:
    result = report(smiles)
    assert result.model_status == "unavailable" and result.model_reason == reason
    assert result.get_value("molecular_weight").status == "unavailable"
    assert result.get_value("tpsa").reason == reason
    assert result.get_value("heavy_atom_count").status == "ready"
    assert result.get_value("formal_charge").status == "ready"


def test_zwitterion_charge_presence_does_not_mean_nonzero_net_charge() -> None:
    result = report("[NH3+]CC(=O)[O-]")
    assert result.get_value("formal_charge").value == 0
    assert result.contains_formally_charged_atoms is True


@pytest.mark.parametrize("missing", ["charge", "bond", "protection", "element"])
def test_unknown_facts_never_turn_into_neutral_or_default_model_values(missing: str) -> None:
    structure, _ = source("CCO", explicit=True)
    changes: dict[str, Any] = {}
    if missing == "charge":
        changes["atoms"] = [
            atom.model_copy(update={"formal_charge": None}) for atom in structure.atoms
        ]
    elif missing == "bond":
        changes["bonds"] = [bond.model_copy(update={"order": None}) for bond in structure.bonds]
    elif missing == "protection":
        changes["annotations"] = []
    else:
        changes["atoms"] = [
            structure.atoms[0].model_copy(update={"element": "Xx"}),
            *structure.atoms[1:],
        ]
    structure = structure.model_copy(update=changes)
    before = structure.to_bytes()
    result = calculate_properties(structure, [atom.id for atom in structure.atoms])
    assert result.model_status == "unavailable"
    assert result.get_value("molecular_weight").value is None
    assert result.get_value("heavy_atom_count").value == (None if missing == "element" else 3)
    if missing in {"charge", "protection", "element"}:
        assert result.get_value("formal_charge").value is None
        assert result.contains_formally_charged_atoms is None
    assert structure.to_bytes() == before


def test_known_nonzero_charge_survives_other_unknown_atomic_charges_as_a_presence_fact() -> None:
    structure, _ = source("[NH3+]CC(=O)[O-]", explicit=True)
    structure = structure.model_copy(
        update={
            "atoms": [
                structure.atoms[0],
                *[atom.model_copy(update={"formal_charge": None}) for atom in structure.atoms[1:]],
            ]
        }
    )
    result = calculate_properties(structure, [atom.id for atom in structure.atoms])
    assert result.contains_formally_charged_atoms is True
    assert result.get_value("formal_charge").value is None


def test_coordinate_display_and_geometry_provenance_changes_preserve_scientific_content() -> None:
    structure, original = source("CCO", explicit=True)
    before = calculate_properties(
        structure, [atom.id for atom in structure.atoms], original_bytes=original
    )
    moved = structure.model_copy(
        update={
            "title": "renamed",
            "metadata": {"display": "other"},
            "atoms": [
                atom.model_copy(update={"coordinates": (9.0, 4.0, -2.0), "name": "renamed"})
                for atom in structure.atoms
            ],
            "conformers": [
                conformer.model_copy(
                    update={
                        "coordinates": [(9.0, 4.0, -2.0)] * len(structure.atoms),
                    }
                )
                for conformer in structure.conformers
            ],
            "inferences": [InferenceRecord(code="coordinates_generated", message="Geometry only")],
        }
    )
    after = calculate_properties(moved, [atom.id for atom in moved.atoms], original_bytes=original)
    assert before.input_hash == after.input_hash
    assert values(before) == values(after)


def _permuted_report(order: tuple[int, ...], tagged_original_index: int) -> DescriptorReport:
    original = Chem.MolFromSmiles("CCOC")
    molecule = Chem.RenumberAtoms(original, order)
    structure = mol_to_normalized(molecule, filename="source.mol", format_name="mol")
    tagged = order.index(tagged_original_index)
    structure = structure.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"inferred_fields": ["formal_charge"]})
                if index == tagged
                else atom
                for index, atom in enumerate(structure.atoms)
            ]
        }
    )
    return calculate_properties(
        structure,
        [atom.id for atom in structure.atoms],
        original_bytes=Chem.MolToMolBlock(molecule).encode(),
    )


def test_atom_permutation_preserves_associated_evidence_but_moving_it_does_not() -> None:
    expected = _permuted_report((0, 1, 2, 3), 0)
    assert expected.model_status == "qualified"
    for order in itertools.permutations(range(4)):
        result = _permuted_report(order, 0)
        assert result.model_status == "qualified"
        assert result.input_hash == expected.input_hash
        # Native floating sums can differ by one ulp after atom permutation.
        # 1e-10 is far below the precision of published fragment parameters;
        # all declared integer outputs remain exact.
        assert values(result) == pytest.approx(values(expected), abs=1e-10, rel=0)
        assert all(
            result.get_value(key).value == expected.get_value(key).value
            for key in result.coverage
            if DESCRIPTOR_REGISTRY[key].value_type == "integer"
        )
    assert _permuted_report((0, 1, 2, 3), 1).input_hash != expected.input_hash


def test_evidence_on_automorphic_sites_may_share_content() -> None:
    structure, original = source("CC")
    digests = []
    for selected in [0, 1]:
        tagged = structure.model_copy(
            update={
                "atoms": [
                    atom.model_copy(update={"inferred_fields": ["formal_charge"]})
                    if index == selected
                    else atom
                    for index, atom in enumerate(structure.atoms)
                ]
            }
        )
        digests.append(calculate_properties(tagged, [1, 2], original_bytes=original).input_hash)
    assert digests[0] == digests[1]


@pytest.mark.parametrize(
    "first,second",
    [
        ("CCO", "CCN"),
        ("F[C@H](Cl)Br", "F[C@@H](Cl)Br"),
        ("C/C=C/C", "C/C=C\\C"),
        ("[13CH3]O", "[14CH3]O"),
        ("[CH3]", "[CH2]"),
    ],
)
def test_distinct_relevant_chemical_inputs_never_share_identity(first: str, second: str) -> None:
    assert report(first).input_hash != report(second).input_hash


def test_inference_and_policy_changes_invalidate_content_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    structure, original = source("CCO")
    members = [atom.id for atom in structure.atoms]
    baseline = calculate_properties(structure, members, original_bytes=original)
    inferred = structure.model_copy(
        update={
            "inferences": [
                InferenceRecord(
                    code="bond_order_inferred", message="Qualified representation", bond_ids=[1]
                ),
            ]
        }
    )
    assert (
        calculate_properties(inferred, members, original_bytes=original).input_hash
        != baseline.input_hash
    )
    module = importlib.import_module("neistra_core.ligand_properties.input")
    monkeypatch.setattr(module, "POLICY_VERSION", "different-policy")
    assert (
        calculate_properties(structure, members, original_bytes=original).input_hash
        != baseline.input_hash
    )


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -float("inf"), True, 1.5])
def test_descriptor_failure_is_partial_and_nonfinite_or_noninteger_values_are_errors(
    monkeypatch: pytest.MonkeyPatch,
    bad: Any,
) -> None:
    module = importlib.import_module("neistra_core.ligand_properties.calculate")
    monkeypatch.setitem(module._CALCULATORS, "hbd", lambda mol: bad)
    result = report("CCO")
    assert result.get_value("hbd").status == "error"
    assert result.get_value("hbd").value is None
    assert result.get_value("hba").value == 1
    assert result.get_value("molecular_weight").status == "ready"


def test_one_native_exception_does_not_discard_independent_results(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = importlib.import_module("neistra_core.ligand_properties.calculate")

    def fail(molecule: Any) -> float:
        raise RuntimeError("native calculation failed")

    monkeypatch.setitem(module._CALCULATORS, "tpsa", fail)
    result = report("CCO")
    assert result.get_value("tpsa").reason == "descriptor_calculation_failed"
    assert result.get_value("hbd").value == 1
    assert result.get_value("molecular_weight").status == "ready"


def test_requested_subset_has_stable_coverage_and_reuses_one_preparation() -> None:
    structure, original = source("CCO")
    prepared = prepare_descriptor_input(structure, [1, 2, 3], original_bytes=original)
    subset = calculate_prepared(prepared, ["hba", "molecular_weight", "hba"])
    assert subset.coverage == ("molecular_weight", "hba")
    assert subset.input_hash == calculate_prepared(prepared).input_hash
    assert len(DESCRIPTOR_DEFINITIONS) == 14
    with pytest.raises(ValueError, match="Unknown descriptor"):
        calculate_prepared(prepared, ["invented"])


def test_exact_fragment_membership_does_not_silently_add_or_remove_counterions() -> None:
    structure, original = source("[Na+].CCO")
    selected = calculate_properties(structure, [2, 3, 4], original_bytes=original)
    assert selected.model_status == "qualified"
    assert selected.get_value("formal_charge").value == 0
    assert selected.get_value("heavy_atom_count").value == 3
    assert selected.get_value("molecular_weight").value == pytest.approx(46.069, abs=1e-10)
    disconnected = calculate_properties(structure, [1, 2, 3, 4], original_bytes=original)
    assert disconnected.model_status == "unavailable"
    assert disconnected.get_value("molecular_weight").value is None
    assert disconnected.get_value("heavy_atom_count").value == 4
    external = calculate_properties(structure, [2, 3], original_bytes=original)
    assert external.model_reason == "candidate_has_external_bond"
    assert external.get_value("heavy_atom_count").value == 2


def test_query_bond_input_has_no_model_values_but_keeps_known_element_counts() -> None:
    molecule = Chem.MolFromSmarts("C~O")
    original = Chem.MolToMolBlock(molecule, forceV3000=True).encode()
    structure = mol_to_normalized(molecule, filename="query.mol", format_name="mol")
    result = calculate_properties(structure, [1, 2], original_bytes=original)
    assert result.model_reason == "query_or_dummy_representation_unsupported"
    assert result.get_value("heavy_atom_count").value == 2
    assert result.get_value("carbon_count").value == 1
    assert result.get_value("molecular_weight").value is None
    assert result.contains_formally_charged_atoms is None


def test_protected_fact_identity_keeps_site_association_for_unavailable_chemistry() -> None:
    def protected(order: tuple[int, ...], tagged_original: int) -> str:
        molecule = Chem.RenumberAtoms(Chem.MolFromSmiles("CCOC"), order)
        structure = mol_to_normalized(molecule, filename="source.mol", format_name="mol")
        tagged = order.index(tagged_original) + 1
        annotations = [
            {
                **record,
                "atoms": [
                    {**fact, "isotope": 13} if fact["atom_id"] == tagged else fact
                    for fact in record["atoms"]
                ],
            }
            for record in structure.annotations
        ]
        structure = structure.model_copy(update={"annotations": annotations})
        result = calculate_properties(structure, [1, 2, 3, 4])
        assert result.model_status == "unavailable"
        assert result.get_value("heavy_atom_count").value == 4
        return result.input_hash

    expected = protected((0, 1, 2, 3), 0)
    for order in itertools.permutations(range(4)):
        assert protected(order, 0) == expected
    assert protected((0, 1, 2, 3), 1) != expected


def _stereo_site_report(order: tuple[int, ...], original_site: int) -> DescriptorReport:
    molecule = Chem.RenumberAtoms(Chem.MolFromSmiles("C[C@H](F)[C@H](F)C"), order)
    structure = mol_to_normalized(molecule, filename="stereo.mol", format_name="mol")
    tagged = order.index(original_site)
    structure = structure.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"inferred_fields": ["formal_charge"]})
                if index == tagged
                else atom
                for index, atom in enumerate(structure.atoms)
            ]
        }
    )
    return calculate_properties(
        structure,
        [atom.id for atom in structure.atoms],
        original_bytes=Chem.MolToMolBlock(molecule).encode(),
    )


def test_evidence_on_stereochemically_distinct_sites_never_shares_content() -> None:
    molecule = Chem.MolFromSmiles("C[C@H](F)[C@H](F)C")
    colored = []
    for site in (1, 3):
        marked = Chem.Mol(molecule)
        marked.GetAtomWithIdx(site).SetIsotope(13)
        colored.append(Chem.MolToSmiles(marked, isomericSmiles=True))
    assert colored[0] != colored[1]  # Independent chemical site-distinction oracle.
    first = _stereo_site_report(tuple(range(6)), 1)
    second = _stereo_site_report(tuple(range(6)), 3)
    assert first.model_status == second.model_status == "qualified"
    assert first.input_hash != second.input_hash


@pytest.mark.parametrize("site", [1, 3])
def test_stereochemical_evidence_site_is_invariant_under_all_atom_renumberings(site: int) -> None:
    expected = _stereo_site_report(tuple(range(6)), site)
    assert expected.model_status == "qualified"
    for order in itertools.permutations(range(6)):
        result = _stereo_site_report(order, site)
        assert result.model_status == "qualified"
        assert result.input_hash == expected.input_hash


def _bond_stereo_site_report(
    order: tuple[int, ...], original_edge: tuple[int, int]
) -> DescriptorReport:
    molecule = Chem.RenumberAtoms(Chem.MolFromSmiles("C/C=C/C=C\\C"), order)
    structure = mol_to_normalized(molecule, filename="bond-stereo.mol", format_name="mol")
    tagged = (
        molecule.GetBondBetweenAtoms(
            order.index(original_edge[0]), order.index(original_edge[1])
        ).GetIdx()
        + 1
    )
    structure = structure.model_copy(
        update={
            "inferences": [
                InferenceRecord(
                    code="bond_order_inferred",
                    message="Current evidence",
                    bond_ids=[tagged],
                )
            ]
        }
    )
    return calculate_properties(
        structure,
        [atom.id for atom in structure.atoms],
        original_bytes=Chem.MolToMolBlock(molecule).encode(),
    )


def test_evidence_on_e_and_z_bonds_is_bound_to_the_actual_stereochemical_edge() -> None:
    first = _bond_stereo_site_report(tuple(range(6)), (1, 2))
    second = _bond_stereo_site_report(tuple(range(6)), (3, 4))
    assert first.model_status == second.model_status == "qualified"
    assert first.input_hash != second.input_hash
    for original_edge, expected in [((1, 2), first), ((3, 4), second)]:
        for order in itertools.permutations(range(6)):
            result = _bond_stereo_site_report(order, original_edge)
            assert result.model_status == "qualified"
            assert result.input_hash == expected.input_hash


@pytest.mark.parametrize(
    "smiles,expected",
    [
        # Independently specified in pinned RDKit CIPLabeler/catch_tests.cpp.
        ("CC[C@H](C)CCCCC[C@H]1CC[C@@H](C)CC1", {2: "S", 9: "s", 12: "S"}),
        (r"C\C=C/[C@@H](\C=C\O)[C@H](C)[C@H](\C=C/C)\C=C\O", {3: "R", 7: "r", 9: "S"}),
    ],
)
def test_absolute_evidence_labels_preserve_source_bound_pseudoasymmetric_case(
    smiles: str,
    expected: dict[int, str],
) -> None:
    module = importlib.import_module("neistra_core.ligand_properties.input")
    molecule = Chem.MolFromSmiles(smiles)
    structure = mol_to_normalized(molecule, filename="source.smi", format_name="smiles")
    labels, _ = module._absolute_stereo_labels(molecule, structure.atoms, structure.bonds)
    assert {index - 1: value for index, value in labels.items() if value} == expected
    result = calculate_properties(
        structure, [atom.id for atom in structure.atoms], original_bytes=f"{smiles}\n".encode()
    )
    assert result.model_status == "qualified"
    assert result.get_value("molecular_weight").status == "ready"


@pytest.mark.parametrize(
    "stereo,expected",
    [
        (Chem.BondStereo.STEREOE, "E"),
        (Chem.BondStereo.STEREOZ, "Z"),
        (Chem.BondStereo.STEREOCIS, "Z"),
        (Chem.BondStereo.STEREOTRANS, "E"),
    ],
)
def test_absolute_evidence_bond_labels_use_proved_cip_not_relative_enum(
    stereo: Any,
    expected: str,
) -> None:
    module = importlib.import_module("neistra_core.ligand_properties.input")
    molecule = Chem.MolFromSmiles("C/C=C/C")
    molecule.GetBondWithIdx(1).SetStereo(stereo)
    structure = mol_to_normalized(molecule, filename="source.smi", format_name="smiles")
    _, labels = module._absolute_stereo_labels(molecule, structure.atoms, structure.bonds)
    assert labels[2] == expected


def test_stale_native_cip_properties_are_cleared_on_the_disposable_copy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = importlib.import_module("neistra_core.ligand_properties.input")
    molecule = Chem.MolFromSmiles("C[C@H](F)[C@H](F)C")
    structure = mol_to_normalized(molecule, filename="source.smi", format_name="smiles")
    for atom in molecule.GetAtoms():
        atom.SetProp("_CIPCode", "stale")
    for bond in molecule.GetBonds():
        bond.SetProp("_CIPCode", "stale")
    original = module.rdCIPLabeler.AssignCIPLabels
    seen = []

    def assign(copy: Any, **kwargs: Any) -> None:
        assert not any(atom.HasProp("_CIPCode") for atom in copy.GetAtoms())
        assert not any(bond.HasProp("_CIPCode") for bond in copy.GetBonds())
        assert kwargs == {"maxRecursiveIterations": 100_000}
        seen.append(True)
        original(copy, **kwargs)

    monkeypatch.setattr(module.rdCIPLabeler, "AssignCIPLabels", assign)
    labels, _ = module._absolute_stereo_labels(molecule, structure.atoms, structure.bonds)
    assert seen == [True]
    assert labels[2] == "S" and labels[4] == "R"
    assert all(atom.GetProp("_CIPCode") == "stale" for atom in molecule.GetAtoms())


def test_missing_absolute_labels_fail_closed_and_keep_stereo_evidence_placements_distinct(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = importlib.import_module("neistra_core.ligand_properties.input")
    monkeypatch.setattr(module.rdCIPLabeler, "AssignCIPLabels", lambda *args, **kwargs: None)
    first = _stereo_site_report(tuple(range(6)), 1)
    second = _stereo_site_report(tuple(range(6)), 3)
    assert first.model_status == second.model_status == "unavailable"
    assert first.model_reason == second.model_reason == "descriptor_stereo_assignment_not_qualified"
    assert first.input_hash != second.input_hash
    assert first.get_value("molecular_weight").value is None
    assert first.get_value("heavy_atom_count").value == 6
    first_bond = _bond_stereo_site_report(tuple(range(6)), (1, 2))
    second_bond = _bond_stereo_site_report(tuple(range(6)), (3, 4))
    assert first_bond.model_status == second_bond.model_status == "unavailable"
    assert first_bond.input_hash != second_bond.input_hash


def test_actual_cip_iteration_refusal_is_unavailable_and_retains_independent_counts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = importlib.import_module("neistra_core.ligand_properties.input")
    monkeypatch.setattr(module, "MAX_CIP_RECURSIVE_ITERATIONS", 1)
    result = report("CC[C@H](C)CCCCC[C@H]1CC[C@@H](C)CC1")
    assert result.model_status == "unavailable"
    assert result.model_reason == "descriptor_stereo_assignment_not_qualified"
    assert result.get_value("heavy_atom_count").status == "ready"
    assert result.get_value("molecular_weight").value is None


def test_native_evidence_mapping_must_be_proved_before_stereo_colors_are_used() -> None:
    module = importlib.import_module("neistra_core.ligand_properties.input")
    molecule = Chem.MolFromSmiles("CCOC")
    structure = mol_to_normalized(molecule, filename="source.smi", format_name="smiles")
    wrong_order = Chem.RenumberAtoms(molecule, [1, 0, 2, 3])
    with pytest.raises(ValueError, match="descriptor_evidence_mapping_not_qualified"):
        module._absolute_stereo_labels(wrong_order, structure.atoms, structure.bonds)


def test_relative_tetrahedral_neighbor_frame_is_part_of_the_mapping_proof() -> None:
    module = importlib.import_module("neistra_core.ligand_properties.input")
    molecule = Chem.MolFromSmiles("F[C@](Cl)(Br)I")
    structure = mol_to_normalized(molecule, filename="source.smi", format_name="smiles")
    reordered = Chem.RWMol()
    for atom in molecule.GetAtoms():
        reordered.AddAtom(Chem.Atom(atom))
    bonds = list(molecule.GetBonds())
    for bond in [bonds[1], bonds[0], *bonds[2:]]:
        reordered.AddBond(bond.GetBeginAtomIdx(), bond.GetEndAtomIdx(), bond.GetBondType())
    wrong_frame = reordered.GetMol()
    Chem.SanitizeMol(wrong_frame)
    assert Chem.MolToSmiles(wrong_frame, isomericSmiles=True) != Chem.MolToSmiles(
        molecule, isomericSmiles=True
    )
    with pytest.raises(ValueError, match="descriptor_evidence_mapping_not_qualified"):
        module._absolute_stereo_labels(wrong_frame, structure.atoms, structure.bonds)
