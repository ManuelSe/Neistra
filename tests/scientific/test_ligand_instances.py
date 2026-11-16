from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace

import pytest
from neistra_core.adapters.macromolecular import MmcifAdapter, PdbAdapter
from neistra_core.adapters.rdkit_common import mol_to_normalized
from neistra_core.editing.ligand import RdkitLigandEditor
from neistra_core.ligands.candidates import resolve_candidates
from neistra_core.ligands.chemistry import (
    depict_ligand,
    depict_qualified,
    depiction_cache_key,
    prepare_chemistry,
    qualify_chemistry,
)
from neistra_core.ligands.models import LigandDesignationV1
from neistra_core.ligands.reconcile import (
    clear_designation,
    initial_designation,
    reconcile_designation,
    select_candidate,
)
from neistra_core.ligands.source_evidence import SOURCE_EVIDENCE_KEY
from neistra_core.molecular import Atom, Bond, NormalizedStructureV1
from rdkit import Chem


def molecule(smiles: str, *, explicit_h: bool = False) -> NormalizedStructureV1:
    mol = Chem.MolFromSmiles(smiles)
    if explicit_h:
        mol = Chem.AddHs(mol)
    return mol_to_normalized(mol, filename="known.smi", format_name="smiles")


def cif(*, tables: bool = True, repeated: bool = False, disagree: bool = False) -> bytes:
    mapping = """loop_
_entity.id
_entity.type
1 polymer
2 non-polymer
loop_
_struct_asym.id
_struct_asym.entity_id
A 1
B 2
""" + ("C 2\n" if repeated else "")
    rows = """ATOM 1 C CA . ALA A 1 1 0 0 0 1 10 1 A CA ALA ? 1
HETATM 2 C C1 . LIG B 2 . 3 0 0 1 10 7 B C1 LIG ? 1
HETATM 3 O O1 . LIG B 2 . 4 0 0 1 10 7 B O1 LIG ? 1
"""
    if disagree:
        rows = rows.replace("LIG B 2", "LIG B 1")
    if repeated:
        rows += """HETATM 4 C C1 . LIG C 2 . 6 0 0 1 10 7 C C1 LIG ? 1
HETATM 5 O O1 . LIG C 2 . 7 0 0 1 10 7 C O1 LIG ? 1
"""
    return (
        "data_exact\n"
        + (mapping if tables else "")
        + """loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.auth_seq_id
_atom_site.auth_asym_id
_atom_site.auth_atom_id
_atom_site.auth_comp_id
_atom_site.pdbx_PDB_ins_code
_atom_site.pdbx_PDB_model_num
"""
        + rows
    ).encode()


def test_implicit_methane_is_one_eligible_molecule_not_a_monoatomic_ion() -> None:
    source = molecule("C")
    inventory = resolve_candidates(source, original_bytes=b"C\n")
    assert inventory.automatic_candidate is not None
    assert inventory.automatic_candidate.heavy_atom_count == 1
    assert inventory.automatic_candidate.molecular_weight is None
    assert initial_designation(inventory, "source").status == "resolved"


def test_disconnected_salt_and_repeated_graph_instances_remain_exact() -> None:
    source = molecule("CCO.[Na+].CCO")
    inventory = resolve_candidates(source)
    assert [candidate.atom_ids for candidate in inventory.candidates] == [[1, 2, 3], [4], [5, 6, 7]]
    assert inventory.candidates[1].reason_codes == ["monoatomic_ion"]
    assert inventory.automatic_candidate is None
    selected = select_candidate(inventory, inventory.candidates[2].candidate_key, "source")
    assert selected.atom_ids == [5, 6, 7]
    assert initial_designation(inventory, "source").status == "selection_required"


def test_source_known_water_is_ineligible_and_missing_h_semantics_remains_unknown() -> None:
    source = molecule("O")
    assert resolve_candidates(source, original_bytes=b"O\n").candidates[0].reason_codes == ["water"]
    # One oxygen graph does not itself prove water or a guessed molecular weight.
    assert resolve_candidates(source).candidates[0].boundary_status == "source_instance"
    assert resolve_candidates(source).automatic_candidate is None
    assert qualify_chemistry(source, [1]).status == "unavailable"


def test_authored_mmcif_mapping_is_distinct_from_setup_entities_inference() -> None:
    original = cif()
    source = MmcifAdapter().parse(original, "source.cif").structures[0]
    inventory = resolve_candidates(source, original_bytes=original)
    assert inventory.automatic_candidate is not None
    assert inventory.automatic_candidate.atom_ids == [2, 3]
    assert not inventory.candidates[0].potential_ligand
    assert inventory.candidates[0].boundary_status == "unsupported"
    assert inventory.automatic_candidate.provenance == ["original_mmcif_inventory"]
    assert not source.bonds  # Missing bonds never split the source residue.
    inferred_original = cif(tables=False)
    inferred = MmcifAdapter().parse(inferred_original, "inferred.cif").structures[0]
    assert any(r.source_entity_type == "non-polymer" for r in inferred.residues)
    inferred_inventory = resolve_candidates(inferred, original_bytes=inferred_original)
    assert inferred_inventory.automatic_candidate is None
    assert inferred_inventory.candidates[-1].boundary_status == "source_instance"
    manual = select_candidate(
        inferred_inventory, inferred_inventory.candidates[-1].candidate_key, "x"
    )
    assert manual.atom_ids == [2, 3]


@pytest.mark.parametrize("case", ["disagree", "missing_bytes", "forged", "changed_inventory"])
def test_mmcif_automatic_mapping_requires_whole_consistent_immutable_inventory(case: str) -> None:
    original = cif(disagree=case == "disagree")
    source = MmcifAdapter().parse(original, "source.cif").structures[0]
    if case == "forged":
        source = source.model_copy(
            update={
                "source": source.source.model_copy(
                    update={
                        "facts": {
                            **source.source.facts,
                            SOURCE_EVIDENCE_KEY: {"schema_version": 1},
                        },
                    }
                )
            }
        )
    elif case == "changed_inventory":
        source = source.model_copy(
            update={
                "atoms": [
                    source.atoms[0].model_copy(update={"source_index": 500}),
                    *source.atoms[1:],
                ]
            }
        )
    inventory = resolve_candidates(
        source, original_bytes=None if case == "missing_bytes" else original
    )
    assert inventory.automatic_candidate is None


def test_mmcif_repeated_instances_covalent_boundary_and_alternates_are_explicit() -> None:
    original = cif(repeated=True)
    source = MmcifAdapter().parse(original, "copies.cif").structures[0]
    inventory = resolve_candidates(source, original_bytes=original)
    assert [c.atom_ids for c in inventory.candidates if c.selectable] == [[2, 3], [4, 5]]
    assert inventory.automatic_candidate is None
    linked = source.model_copy(update={"bonds": [Bond(id=1, atom_1_id=1, atom_2_id=2)]})
    linked_inventory = resolve_candidates(linked, original_bytes=original)
    assert linked_inventory.candidates[1].reason_codes == ["cross_boundary_link_unqualified"]
    assert linked_inventory.automatic_candidate is None
    alternate = source.model_copy(
        update={
            "atoms": [
                *source.atoms[:1],
                source.atoms[1].model_copy(update={"alternate_location": "A"}),
                *source.atoms[2:],
            ]
        }
    )
    assert resolve_candidates(alternate, original_bytes=original).candidates[1].reason_codes == [
        "alternate_sites_unresolved"
    ]


def test_multiatom_solvent_is_not_blacklisted_and_incomplete_branched_groups_are_unsupported() -> (
    None
):
    original = cif().replace(b"LIG", b"GOL")
    source = MmcifAdapter().parse(original, "solvent.cif").structures[0]
    assert resolve_candidates(source, original_bytes=original).automatic_candidate is not None
    branched_original = cif().replace(b"2 non-polymer", b"2 branched")
    branched = MmcifAdapter().parse(branched_original, "glycan.cif").structures[0]
    candidate = resolve_candidates(branched, original_bytes=branched_original).candidates[-1]
    assert candidate.boundary_status == "unsupported" and candidate.potential_ligand
    assert candidate.reason_codes == ["branched_boundary_unsupported"]


def test_raw_nonpolymer_assignment_overrules_residue_name_polymer_heuristic() -> None:
    original = cif().replace(b"LIG", b"ALA")
    source = MmcifAdapter().parse(original, "amino-ligand.cif").structures[0]
    assert source.residues[-1].component_type == "polymer"
    inventory = resolve_candidates(source, original_bytes=original)
    assert inventory.automatic_candidate is not None
    assert inventory.automatic_candidate.atom_ids == [2, 3]


def test_unresolved_potential_instance_suppresses_an_otherwise_unique_qualified_candidate() -> None:
    source = molecule("CCO.CN")
    uncertain = source.model_copy(
        update={
            "bonds": [
                *source.bonds[:-1],
                source.bonds[-1].model_copy(update={"inferred": True}),
            ]
        }
    )
    inventory = resolve_candidates(uncertain)
    assert [c.boundary_status for c in inventory.candidates] == ["qualified", "unsupported"]
    assert inventory.automatic_candidate is None
    assert initial_designation(inventory, "source").status == "selection_required"


def test_pdb_source_instance_is_manual_even_with_inferred_nonpolymer_entity() -> None:
    data = (
        b"HETATM    1  C1  LIG A   7       3.000   0.000   0.000  1.00 10.00           C  \n"
        b"HETATM    2  O1  LIG A   7       4.000   0.000   0.000  1.00 10.00           O  \nEND\n"
    )
    source = PdbAdapter().parse(data, "source.pdb").structures[0]
    inventory = resolve_candidates(source, original_bytes=data)
    assert len(inventory.candidates) == 1
    assert inventory.candidates[0].atom_ids == [1, 2]
    assert inventory.candidates[0].boundary_status == "source_instance"
    assert initial_designation(inventory, "source").status == "selection_required"


@pytest.mark.parametrize(
    "smiles,formula",
    [
        ("c1cc[nH]c1", "C4H5N"),
        ("[13CH4]", "[13C]H4"),
        ("[CH3]", "CH3"),
        ("C/C=C/C", "C4H8"),
        ("C[C@H](F)Cl", "C2H4ClF"),
    ],
)
def test_exact_original_recovery_preserves_hidden_h_isotope_radical_and_stereo(
    smiles: str,
    formula: str,
) -> None:
    source = molecule(smiles)
    before = source.to_bytes()
    qualified = qualify_chemistry(
        source, [a.id for a in source.atoms], original_bytes=smiles.encode()
    )
    assert qualified.status == "qualified"
    assert qualified.formula == formula
    assert Chem.MolToSmiles(qualified.molecule, isomericSmiles=True) == Chem.MolToSmiles(
        Chem.MolFromSmiles(smiles), isomericSmiles=True
    )
    drawing = depict_ligand(source, [a.id for a in source.atoms], original_bytes=smiles.encode())
    assert drawing.status == "ready" and "<svg" in drawing.svg
    assert source.to_bytes() == before
    assert replace(drawing, svg=None).input_hash == qualified.input_hash


def test_coordinate_only_reuse_and_changed_chemistry_never_uses_stale_source_or_metadata() -> None:
    source = molecule("CCO")
    atom_ids = [1, 2, 3]
    original = b"CCO\n"
    qualified = qualify_chemistry(source, atom_ids, original_bytes=original)
    moved = source.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": (100.0, 20.0, 0.0), "name": "Renamed"})
                for a in source.atoms
            ]
        }
    )
    assert (
        qualify_chemistry(moved, atom_ids, original_bytes=original).input_hash
        == qualified.input_hash
    )
    changed = source.model_copy(
        update={
            "atoms": [
                *source.atoms[:2],
                source.atoms[2].model_copy(update={"formal_charge": -1}),
            ]
        }
    )
    assert qualify_chemistry(changed, atom_ids, original_bytes=original).status == "unavailable"
    assert qualify_chemistry(changed, atom_ids).status == "unavailable"
    assert source.metadata["canonical_smiles"] == "CCO"


def test_current_complete_explicit_graph_and_unknown_charge_or_order_refusal() -> None:
    source = molecule("CCO", explicit_h=True)
    ids = [a.id for a in source.atoms]
    result = qualify_chemistry(source, ids)
    assert result.status == "qualified" and result.formula == "C2H6O"
    assert result.molecular_weight == pytest.approx(46.069, abs=0.001)
    unknown_charge = source.model_copy(
        update={
            "atoms": [
                source.atoms[0].model_copy(update={"formal_charge": None}),
                *source.atoms[1:],
            ]
        }
    )
    assert qualify_chemistry(unknown_charge, ids).reason == "formal_charge_unknown"
    unknown_order = source.model_copy(
        update={
            "bonds": [
                source.bonds[0].model_copy(update={"order": None}),
                *source.bonds[1:],
            ]
        }
    )
    assert qualify_chemistry(unknown_order, ids).reason == "bond_order_or_aromaticity_unqualified"
    with pytest.raises(ValueError, match="dimensions"):
        depict_ligand(source, ids, width=5000)


def test_designation_reconciles_new_members_but_never_merge_split_clear_or_stale() -> None:
    source = molecule("CCO.CN")
    inventory = resolve_candidates(source)
    selected = select_candidate(inventory, inventory.candidates[0].candidate_key, "before")
    moved = source.model_copy(update={"title": "Renamed"})
    retained = reconcile_designation(selected, source, moved, resolve_candidates(moved), "moved")
    assert retained.instance_id == selected.instance_id and retained.atom_ids == [1, 2, 3]
    new_atom = Atom(
        id=6,
        name="H6",
        element="H",
        coordinates=(0, 1, 0),
        residue_id=1,
        source_index=5,
        formal_charge=0,
    )
    expanded = source.model_copy(
        update={
            "atoms": [*source.atoms, new_atom],
            "bonds": [
                *source.bonds,
                Bond(id=4, atom_1_id=3, atom_2_id=6, order=1),
            ],
        }
    )
    added = reconcile_designation(
        selected, source, expanded, resolve_candidates(expanded), "expanded"
    )
    assert added.atom_ids == [1, 2, 3, 6] and added.instance_id == selected.instance_id
    merged = source.model_copy(
        update={
            "bonds": [
                *source.bonds,
                Bond(id=4, atom_1_id=3, atom_2_id=4, order=1),
            ]
        }
    )
    stale = reconcile_designation(selected, source, merged, resolve_candidates(merged), "merged")
    assert stale.status == "stale" and stale.reason_code == "designated_instance_merged"
    assert stale.atom_ids == selected.atom_ids and stale.source_artifact_id == "merged"
    split = source.model_copy(update={"bonds": source.bonds[1:]})
    assert (
        reconcile_designation(selected, source, split, resolve_candidates(split), "split").status
        == "stale"
    )
    assert (
        reconcile_designation(clear_designation(), source, source, inventory, "after").status
        == "cleared"
    )
    reassessed_stale = reconcile_designation(stale, source, source, inventory, "after")
    assert reassessed_stale == stale.model_copy(update={"source_artifact_id": "after"})
    assert LigandDesignationV1.model_validate_json(selected.model_dump_json()) == selected
    with pytest.raises(ValueError, match="exactly one"):
        select_candidate(
            inventory,
            inventory.candidates[0].candidate_key,
            "x",
            origin="automatic_single_candidate",
        )


def test_existing_hydrogen_editor_preserves_designation_with_authored_inference_disclosed() -> None:
    source = molecule("CCO")
    selected = initial_designation(resolve_candidates(source), "source")
    after = (
        RdkitLigandEditor()
        .add_hydrogens(
            source,
            next_atom_id=4,
            next_bond_id=3,
        )
        .structure
    )
    inventory = resolve_candidates(after)
    assert inventory.automatic_candidate is not None
    assert "authored_hydrogen_connectivity" in inventory.automatic_candidate.provenance
    current = reconcile_designation(selected, source, after, inventory, "current")
    assert current.status == "resolved" and current.instance_id == selected.instance_id
    assert current.atom_ids == list(range(1, 10))
    assert qualify_chemistry(after, current.atom_ids).formula == "C2H6O"


def test_qualified_depiction_reuse_preserves_source_and_does_not_repeat_qualification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from neistra_core.ligands import chemistry

    source = molecule("C/C=C/C")
    source_bytes = source.to_bytes()
    qualified = qualify_chemistry(source, [1, 2, 3, 4], original_bytes=b"C/C=C/C")
    native_bytes = qualified.molecule.ToBinary()
    assert qualified.input_hash is not None

    def unexpected_qualification(*args: object, **kwargs: object) -> None:
        pytest.fail("An already qualified input must not be qualified again for drawing")

    monkeypatch.setattr(chemistry, "qualify_chemistry", unexpected_qualification)
    drawing = depict_qualified(qualified)
    assert drawing.status == "ready"
    assert drawing.cache_key == depiction_cache_key(qualified.input_hash)
    assert qualified.molecule.ToBinary() == native_bytes
    assert source.to_bytes() == source_bytes


def test_depiction_cache_keys_bind_dimensions_policy_and_library_without_drawing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from neistra_core.ligands import chemistry

    key = depiction_cache_key("qualified-input")
    assert key == depiction_cache_key("qualified-input", width=240, height=180)
    assert key != depiction_cache_key("changed-input")
    assert key != depiction_cache_key("qualified-input", width=241)
    assert key != depiction_cache_key("qualified-input", height=181)
    with monkeypatch.context() as patch:
        patch.setattr(chemistry, "DEPICTION_POLICY", "different-policy")
        assert key != depiction_cache_key("qualified-input")
    with monkeypatch.context() as patch:
        patch.setattr(chemistry.rdBase, "rdkitVersion", "different-library")
        assert key != depiction_cache_key("qualified-input")
    with pytest.raises(ValueError, match="dimensions"):
        depiction_cache_key("qualified-input", width=63)
    with pytest.raises(ValueError, match="dimensions"):
        depiction_cache_key("qualified-input", height=1025)
    with pytest.raises(ValueError, match="hash"):
        depiction_cache_key("")


def test_hundred_water_inventory_parses_original_once_with_linear_current_atom_visits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from neistra_core.ligands import chemistry

    original = ".".join(["O"] * 100).encode()
    source = molecule(original.decode())
    visits = [0]

    class CountedAtoms(list[Atom]):
        def __iter__(self) -> Iterator[Atom]:
            for atom in super().__iter__():
                visits[0] += 1
                yield atom

    object.__setattr__(source, "atoms", CountedAtoms(source.atoms))
    calls = {"parse": 0, "normalize": 0, "add_h": 0}
    parse, normalize, add_h = Chem.MolFromSmiles, chemistry.mol_to_normalized, Chem.AddHs

    def counted_parse(*args: object, **kwargs: object) -> object:
        calls["parse"] += 1
        return parse(*args, **kwargs)

    def counted_normalize(*args: object, **kwargs: object) -> object:
        calls["normalize"] += 1
        return normalize(*args, **kwargs)

    def counted_add_h(*args: object, **kwargs: object) -> object:
        calls["add_h"] += 1
        return add_h(*args, **kwargs)

    monkeypatch.setattr(Chem, "MolFromSmiles", counted_parse)
    monkeypatch.setattr(chemistry, "mol_to_normalized", counted_normalize)
    monkeypatch.setattr(Chem, "AddHs", counted_add_h)
    inventory = resolve_candidates(source, original_bytes=original)
    assert len(inventory.candidates) == 100
    assert all(c.reason_codes == ["water"] and not c.selectable for c in inventory.candidates)
    assert inventory.automatic_candidate is None
    assert calls == {"parse": 1, "normalize": 1, "add_h": 0}
    assert visits[0] <= 15 * len(source.atoms)


def test_shared_page_context_and_oversized_admission_do_not_repeat_whole_source_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from neistra_core.ligands import chemistry

    original = ".".join(["CCO"] * 200).encode()
    source = molecule(original.decode())
    calls = [0]
    parse = Chem.MolFromSmiles

    def counted_parse(*args: object, **kwargs: object) -> object:
        calls[0] += 1
        return parse(*args, **kwargs)

    monkeypatch.setattr(Chem, "MolFromSmiles", counted_parse)
    context = prepare_chemistry(source, original_bytes=original)
    for slot in range(12):
        qualified = context.qualify([slot * 3 + 1, slot * 3 + 2, slot * 3 + 3])
        assert qualified.status == "qualified" and qualified.formula == "C2H6O"
    assert calls[0] == 1

    def forbidden_index(*args: object, **kwargs: object) -> None:
        pytest.fail("Oversized admission must refuse before indexing or source parsing")

    monkeypatch.setattr(chemistry._StructureIndex, "prepare", forbidden_index)
    assert qualify_chemistry(source, list(range(1, 1026)), original_bytes=original).reason == (
        "depiction_atom_limit"
    )
    assert calls[0] == 1
