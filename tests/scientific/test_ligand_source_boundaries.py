from __future__ import annotations

import pytest
from neistra_core.adapters.macromolecular import MmcifAdapter
from neistra_core.ligands.candidates import resolve_candidates
from neistra_core.ligands.reconcile import initial_designation, reconcile_designation
from neistra_core.molecular import NormalizedStructureV1

from tests.scientific.test_ligand_instances import cif, molecule

SCHEME_HEADER = b"""loop_
_pdbx_nonpoly_scheme.asym_id
_pdbx_nonpoly_scheme.entity_id
_pdbx_nonpoly_scheme.mon_id
_pdbx_nonpoly_scheme.ndb_seq_num
_pdbx_nonpoly_scheme.pdb_seq_num
_pdbx_nonpoly_scheme.auth_seq_num
_pdbx_nonpoly_scheme.pdb_mon_id
_pdbx_nonpoly_scheme.auth_mon_id
_pdbx_nonpoly_scheme.pdb_strand_id
_pdbx_nonpoly_scheme.pdb_ins_code
"""


def parsed(original: bytes) -> NormalizedStructureV1:
    return MmcifAdapter().parse(original, "authored.cif").structures[0]


def test_scheme_uses_coordinate_pdb_mapping_and_allows_distinct_historical_author_labels() -> None:
    original = cif() + SCHEME_HEADER + b"B 2 LIG 1 7 original-99 LIG HIST B .\n"
    structure = parsed(original)
    candidate = resolve_candidates(structure, original_bytes=original).automatic_candidate
    assert candidate is not None and candidate.atom_ids == [2, 3]


@pytest.mark.parametrize(
    "row",
    [
        b"B 999 LIG 1 7 7 LIG LIG B .\n",
        b"B 2 GOL 1 7 7 LIG LIG B .\n",
        b"B 2 LIG 1 99 7 LIG LIG B .\n",
        b"B 2 LIG 1 7 7 GOL LIG B .\n",
        b"B 2 LIG 1 7 7 LIG LIG Z .\n",
        b"B 2 LIG 1 7 7 LIG LIG B A\n",
        b"Z 2 LIG 1 7 7 LIG LIG B .\n",
        b"B 2 LIG . 7 7 LIG LIG B .\n",
        b"B 2 LIG 1 7 7 LIG LIG B .\nB 2 LIG 1 7 7 LIG LIG B .\n",
    ],
)
def test_present_conflicting_or_duplicate_scheme_cannot_qualify_automatic_inventory(
    row: bytes,
) -> None:
    original = cif() + SCHEME_HEADER + row
    assert resolve_candidates(parsed(original), original_bytes=original).automatic_candidate is None


def test_incomplete_present_scheme_does_not_match_a_repeated_instance_inventory() -> None:
    original = cif(repeated=True) + SCHEME_HEADER + b"B 2 LIG 1 7 7 LIG LIG B .\n"
    inventory = resolve_candidates(parsed(original), original_bytes=original)
    assert not any(candidate.boundary_status == "qualified" for candidate in inventory.candidates)


@pytest.mark.parametrize("change", ["atom", "residue", "chain", "author_number", "insertion"])
def test_mutable_labels_retain_nonpolymer_proof_and_exact_intent(change: str) -> None:
    original = cif().replace(b"LIG", b"ALA")
    before = parsed(original)
    designated = initial_designation(resolve_candidates(before, original_bytes=original), "before")
    assert designated.status == "resolved" and designated.atom_ids == [2, 3]
    if change == "atom":
        after = before.model_copy(
            update={
                "atoms": [
                    atom.model_copy(update={"name": "Renamed"}) if atom.id == 2 else atom
                    for atom in before.atoms
                ]
            }
        )
    elif change == "chain":
        after = before.model_copy(
            update={
                "chains": [
                    chain.model_copy(update={"name": "Renamed"}) if chain.id == 2 else chain
                    for chain in before.chains
                ]
            }
        )
    else:
        field, value = {
            "residue": ("name", "Renamed"),
            "author_number": ("author_number", 99),
            "insertion": ("insertion_code", "Z"),
        }[change]
        after = before.model_copy(
            update={
                "residues": [
                    residue.model_copy(update={field: value}) if residue.id == 2 else residue
                    for residue in before.residues
                ]
            }
        )
    candidate = resolve_candidates(after, original_bytes=original).automatic_candidate
    assert candidate is not None and candidate.atom_ids == [2, 3]
    current = reconcile_designation(
        designated, before, after, resolve_candidates(after, original_bytes=original), "current"
    )
    assert current.status == "resolved" and current.instance_id == designated.instance_id
    assert current.origin == designated.origin and current.selected_at == designated.selected_at
    assert current.source_artifact_id == "current" and current.atom_ids == [2, 3]


@pytest.mark.parametrize("change", ["id", "source_index", "residue", "chain"])
def test_canonical_source_or_partition_tampering_cannot_borrow_original_proof(change: str) -> None:
    original = cif().replace(b"LIG", b"ALA")
    before = parsed(original)
    if change == "chain":
        after = before.model_copy(
            update={
                "residues": [
                    residue.model_copy(update={"chain_id": 1}) if residue.id == 2 else residue
                    for residue in before.residues
                ]
            }
        )
    else:
        field, value = {
            "id": ("id", 99),
            "source_index": ("source_index", 99),
            "residue": ("residue_id", 1),
            "element": ("element", "N"),
        }[change]
        after = before.model_copy(
            update={
                "atoms": [
                    atom.model_copy(update={field: value}) if atom.id == 2 else atom
                    for atom in before.atoms
                ]
            }
        )
    assert resolve_candidates(after, original_bytes=original).automatic_candidate is None


@pytest.mark.parametrize("smiles", ["[H+]", "[H-]", "[O-]", "[O-2]", "[C-]", "[N-3]"])
def test_true_charged_monoatomic_species_are_ineligible_for_designation(smiles: str) -> None:
    inventory = resolve_candidates(molecule(smiles), original_bytes=smiles.encode())
    assert inventory.automatic_candidate is None
    assert inventory.candidates[0].reason_codes == ["monoatomic_ion"]
    assert not inventory.candidates[0].selectable
    assert initial_designation(inventory, "source").status == "not_applicable"


@pytest.mark.parametrize("smiles", ["[OH-]", "[CH3-]", "[NH4+]"])
def test_implicit_hydrogen_polyatomic_ions_remain_eligible(smiles: str) -> None:
    inventory = resolve_candidates(molecule(smiles), original_bytes=smiles.encode())
    assert inventory.automatic_candidate is not None
    assert inventory.candidates[0].boundary_status == "qualified"
    assert inventory.candidates[0].atom_ids == [1]


@pytest.mark.parametrize("smiles", ["[OH-]", "[CH3-]", "[NH4+]"])
def test_unqualified_singleton_hydrogen_semantics_never_guess_atomic_ion_or_auto(
    smiles: str,
) -> None:
    inventory = resolve_candidates(molecule(smiles))
    assert inventory.automatic_candidate is None
    assert inventory.candidates[0].selectable
    assert inventory.candidates[0].boundary_status == "source_instance"
    assert "monoatomic_ion" not in inventory.candidates[0].reason_codes


def water_scheme_original() -> bytes:
    return (
        cif()
        .replace(b"2 non-polymer\n", b"2 non-polymer\n3 water\n")
        .replace(b"B 2\n", b"B 2\nW 3\n")
        + b"HETATM 4 O O . HOH W 3 . 10 0 0 1 10 8 W O HOH ? 1\n"
        + b"HETATM 5 O O . HOH W 3 . 12 0 0 1 10 9 W O HOH ? 1\n"
        + SCHEME_HEADER
        + b"B 2 LIG 1 7 70 LIG OLD B .\n"
        + b"W 3 HOH 1 8 80 HOH HIST W .\nW 3 HOH 2 9 90 HOH HIST W .\n"
    )


def test_consistent_scheme_includes_multiple_water_residues_in_one_asymmetry() -> None:
    original = water_scheme_original()
    inventory = resolve_candidates(parsed(original), original_bytes=original)
    assert inventory.automatic_candidate is not None
    assert inventory.automatic_candidate.atom_ids == [2, 3]
    assert [candidate.reason_codes for candidate in inventory.candidates[-2:]] == [
        ["water"],
        ["water"],
    ]
    invalid = original.replace(b"W 3 HOH 2 9", b"W 3 HOH 2 99")
    assert resolve_candidates(parsed(invalid), original_bytes=invalid).automatic_candidate is None


def hydrogen_added(before: NormalizedStructureV1) -> NormalizedStructureV1:
    from neistra_core.hydrogen_protection import ordinary_generated
    from neistra_core.molecular import Atom, Bond, InferenceRecord

    hydrogen = Atom(
        id=max(atom.id for atom in before.atoms) + 1,
        name="Hnew",
        element="H",
        coordinates=(3.0, 1.0, 0.0),
        residue_id=2,
        formal_charge=0,
        source_index=max(atom.source_index for atom in before.atoms) + 1,
    )
    bond = Bond(id=1, atom_1_id=2, atom_2_id=hydrogen.id, order=1.0, inferred=True)
    return before.model_copy(
        update={
            "atoms": [*before.atoms, hydrogen],
            "bonds": [bond],
            "conformers": [
                frame.model_copy(update={"coordinates": [*frame.coordinates, hydrogen.coordinates]})
                for frame in before.conformers
            ],
            "annotations": [*before.annotations, ordinary_generated([hydrogen])],
            "inferences": [
                *before.inferences,
                InferenceRecord(
                    code="model_hydrogen_placement",
                    message="Authored exact H-parent membership; approximate coordinates",
                    atom_ids=[hydrogen.id],
                    bond_ids=[bond.id],
                ),
            ],
        }
    )


def without_atom(before: NormalizedStructureV1, atom_id: int) -> NormalizedStructureV1:
    kept = [index for index, atom in enumerate(before.atoms) if atom.id != atom_id]
    return before.model_copy(
        update={
            "atoms": [before.atoms[index] for index in kept],
            "bonds": [
                bond for bond in before.bonds if atom_id not in (bond.atom_1_id, bond.atom_2_id)
            ],
            "conformers": [
                frame.model_copy(
                    update={"coordinates": [frame.coordinates[index] for index in kept]}
                )
                for frame in before.conformers
            ],
        }
    )


def test_authored_h_addition_and_removal_retain_exact_nonpolymer_identity() -> None:
    original = cif().replace(b"LIG", b"ALA")
    before = parsed(original)
    designation = initial_designation(resolve_candidates(before, original_bytes=original), "before")
    added = hydrogen_added(before)
    inventory = resolve_candidates(added, original_bytes=original)
    assert inventory.automatic_candidate is not None
    assert inventory.automatic_candidate.atom_ids == [2, 3, 4]
    retained = reconcile_designation(designation, before, added, inventory, "added")
    assert retained.status == "resolved" and retained.instance_id == designation.instance_id
    removed = without_atom(added, 4)
    restored = reconcile_designation(
        retained, added, removed, resolve_candidates(removed, original_bytes=original), "removed"
    )
    assert restored.status == "resolved" and restored.instance_id == designation.instance_id
    assert restored.atom_ids == [2, 3] and restored.source_artifact_id == "removed"


def test_original_explicit_h_removal_keeps_all_heavy_source_anchors() -> None:
    original = cif().replace(b"LIG", b"ALA") + (
        b"HETATM 4 H H1 . ALA B 2 . 3 1 0 1 10 7 B H1 ALA ? 1\n"
    )
    before = parsed(original)
    designation = initial_designation(resolve_candidates(before, original_bytes=original), "before")
    assert designation.atom_ids == [2, 3, 4]
    after = without_atom(before, 4)
    current = reconcile_designation(
        designation, before, after, resolve_candidates(after, original_bytes=original), "after"
    )
    assert current.status == "resolved" and current.instance_id == designation.instance_id
    assert current.atom_ids == [2, 3]
    assert (
        resolve_candidates(without_atom(before, 2), original_bytes=original).automatic_candidate
        is None
    )


@pytest.mark.parametrize(
    "change",
    [
        "no_inference",
        "no_protection",
        "cross_residue",
        "two_parents",
        "order",
        "new_heavy",
        "duplicate_source",
    ],
)
def test_hydrogen_extension_never_relaxes_ambiguous_or_nonhydrogen_source_boundaries(
    change: str,
) -> None:
    from neistra_core.molecular import Bond

    original = cif().replace(b"LIG", b"ALA")
    after = hydrogen_added(parsed(original))
    if change == "no_inference":
        after = after.model_copy(update={"inferences": []})
    elif change == "no_protection":
        after = after.model_copy(update={"annotations": []})
    elif change in {"cross_residue", "new_heavy", "duplicate_source"}:
        field, value = {
            "cross_residue": ("residue_id", 1),
            "new_heavy": ("element", "C"),
            "duplicate_source": ("source_index", 1),
        }[change]
        after = after.model_copy(
            update={"atoms": [*after.atoms[:-1], after.atoms[-1].model_copy(update={field: value})]}
        )
    elif change == "order":
        after = after.model_copy(
            update={"bonds": [after.bonds[0].model_copy(update={"order": 2.0})]}
        )
    else:
        after = after.model_copy(
            update={"bonds": [*after.bonds, Bond(id=2, atom_1_id=3, atom_2_id=4, order=1.0)]}
        )
    assert resolve_candidates(after, original_bytes=original).automatic_candidate is None


def test_legacy_original_recovers_raw_proof_but_present_forged_receipt_still_refuses() -> None:
    from neistra_core.ligands.source_evidence import SOURCE_EVIDENCE_KEY

    original = cif()
    before = parsed(original)
    facts = {key: value for key, value in before.source.facts.items() if key != SOURCE_EVIDENCE_KEY}
    legacy = before.model_copy(update={"source": before.source.model_copy(update={"facts": facts})})
    candidate = resolve_candidates(legacy, original_bytes=original).automatic_candidate
    assert candidate is not None and candidate.atom_ids == [2, 3]
    assert "original_mmcif_receipt_recovered" in candidate.provenance
    assert SOURCE_EVIDENCE_KEY not in legacy.source.facts
    for forged in (None, {}, {"schema_version": 1}):
        malformed = legacy.model_copy(
            update={
                "source": legacy.source.model_copy(
                    update={"facts": {**facts, SOURCE_EVIDENCE_KEY: forged}}
                )
            }
        )
        assert resolve_candidates(malformed, original_bytes=original).automatic_candidate is None
    assert resolve_candidates(legacy, original_bytes=cif(disagree=True)).automatic_candidate is None


def test_resolver_identity_binds_original_presence_and_bytes() -> None:
    source = molecule("O")
    missing = resolve_candidates(source)
    known = resolve_candidates(source, original_bytes=b"O\n")
    other = resolve_candidates(source, original_bytes=b"[O]\n")
    assert len({missing.input_hash, known.input_hash, other.input_hash}) == 3
    assert (
        len({inventory.candidates[0].candidate_key for inventory in (missing, known, other)}) == 3
    )
    assert known.candidates[0].reason_codes == ["water"]
    assert resolve_candidates(source, original_bytes=b"O\n").input_hash == known.input_hash


@pytest.mark.parametrize("scheme_insertion,qualifies", [(b".", False), (b"?", True), (b"A", True)])
def test_known_blank_scheme_insertion_does_not_match_inserted_coordinate_residue(
    scheme_insertion: bytes,
    qualifies: bool,
) -> None:
    original = (
        cif().replace(b"B C1 LIG ? 1", b"B C1 LIG A 1").replace(b"B O1 LIG ? 1", b"B O1 LIG A 1")
    )
    original += SCHEME_HEADER + b"B 2 LIG 1 7 7 LIG LIG B " + scheme_insertion + b"\n"
    assert (
        resolve_candidates(parsed(original), original_bytes=original).automatic_candidate
        is not None
    ) == qualifies


def test_legacy_recovery_never_promotes_inferred_normalized_entity_metadata() -> None:
    from neistra_core.ligands.source_evidence import SOURCE_EVIDENCE_KEY

    original = cif(tables=False)
    before = parsed(original)
    forged = before.model_copy(
        update={
            "source": before.source.model_copy(
                update={
                    "facts": {
                        key: value
                        for key, value in before.source.facts.items()
                        if key != SOURCE_EVIDENCE_KEY
                    }
                }
            ),
            "residues": [
                residue.model_copy(
                    update={"source_entity_type": "non-polymer", "source_entity_id": "invented"}
                )
                for residue in before.residues
            ],
        }
    )
    inventory = resolve_candidates(forged, original_bytes=original)
    assert inventory.automatic_candidate is None
    assert not any(candidate.boundary_status == "qualified" for candidate in inventory.candidates)


def heavy_added(
    before: NormalizedStructureV1, *, owner: int = 2, parent: int = 2
) -> NormalizedStructureV1:
    from neistra_core.hydrogen_protection import ordinary_generated

    after = hydrogen_added(before)
    carbon = after.atoms[-1].model_copy(
        update={"element": "C", "name": "Cnew", "residue_id": owner}
    )
    return after.model_copy(
        update={
            "atoms": [*after.atoms[:-1], carbon],
            "annotations": [*before.annotations, ordinary_generated([carbon])],
            "inferences": [],
            "bonds": [after.bonds[-1].model_copy(update={"atom_1_id": parent, "inferred": False})],
        }
    )


@pytest.mark.parametrize("name", [b"LIG", b"ALA"])
@pytest.mark.parametrize("edit", ["element", "charge", "addition", "deletion"])
def test_editable_chemistry_and_unambiguous_membership_keep_exact_owned_instance(
    name: bytes, edit: str
) -> None:
    original = cif().replace(b"LIG", name)
    before = parsed(original)
    designation = initial_designation(resolve_candidates(before, original_bytes=original), "before")
    expected = [2, 3]
    if edit in {"element", "charge"}:
        changes = {"element": "N"} if edit == "element" else {"formal_charge": 1}
        after = before.model_copy(
            update={
                "atoms": [
                    atom.model_copy(update=changes) if atom.id == 2 else atom
                    for atom in before.atoms
                ]
            }
        )
    elif edit == "addition":
        after = heavy_added(before)
        expected = [2, 3, 4]
    else:
        after = without_atom(before, 3)
        expected = [2]
    inventory = resolve_candidates(after, original_bytes=original)
    assert inventory.automatic_candidate is not None
    assert inventory.automatic_candidate.atom_ids == expected
    retained = reconcile_designation(designation, before, after, inventory, "current")
    assert retained.status == "resolved" and retained.instance_id == designation.instance_id
    assert retained.atom_ids == expected and retained.origin == designation.origin
    assert (
        retained.selected_at == designation.selected_at and retained.source_artifact_id == "current"
    )


@pytest.mark.parametrize("name", [b"LIG", b"ALA"])
@pytest.mark.parametrize(
    "ambiguity", ["unanchored", "unknown_order", "inferred", "other_instance", "reparent"]
)
def test_added_cluster_ambiguity_is_unsupported_and_retires_intent_for_all_residue_labels(
    name: bytes, ambiguity: str
) -> None:
    from neistra_core.molecular import Bond

    original = cif(repeated=True).replace(b"LIG", name)
    before = parsed(original)
    from neistra_core.ligands.reconcile import select_candidate

    old = resolve_candidates(before, original_bytes=original)
    designation = select_candidate(
        old, next(c.candidate_key for c in old.candidates if c.atom_ids == [2, 3]), "before"
    )
    after = heavy_added(before)
    if ambiguity == "unanchored":
        after = after.model_copy(update={"bonds": []})
    elif ambiguity == "unknown_order":
        after = after.model_copy(
            update={"bonds": [after.bonds[0].model_copy(update={"order": None})]}
        )
    elif ambiguity == "inferred":
        after = after.model_copy(
            update={"bonds": [after.bonds[0].model_copy(update={"inferred": True})]}
        )
    elif ambiguity == "other_instance":
        after = after.model_copy(
            update={
                "bonds": [
                    *after.bonds,
                    Bond(id=2, atom_1_id=4, atom_2_id=after.atoms[-1].id, order=1.0),
                ]
            }
        )
    else:
        after = after.model_copy(
            update={
                "atoms": [*after.atoms[:-1], after.atoms[-1].model_copy(update={"residue_id": 1})]
            }
        )
    inventory = resolve_candidates(after, original_bytes=original)
    assert not any(c.selectable for c in inventory.candidates if 2 in c.atom_ids)
    assert reconcile_designation(designation, before, after, inventory, "after").status == "stale"


def test_manual_unknown_source_never_absorbs_unanchored_added_members() -> None:
    from neistra_core.adapters.macromolecular import PdbAdapter
    from neistra_core.ligands.reconcile import select_candidate

    original = (
        b"HETATM    1  C1  LIG A   1       0.000   0.000   0.000  1.00 20.00           C\n"
        b"HETATM    2  O1  LIG A   1       1.400   0.000   0.000  1.00 20.00           O\nEND\n"
    )
    before = PdbAdapter().parse(original, "manual.pdb").structures[0]
    inventory = resolve_candidates(before, original_bytes=original)
    assert inventory.automatic_candidate is None
    selected = select_candidate(inventory, inventory.candidates[0].candidate_key, "before")
    after = heavy_added(before, owner=1, parent=1).model_copy(update={"bonds": []})
    current = reconcile_designation(
        selected, before, after, resolve_candidates(after, original_bytes=original), "after"
    )
    assert (
        current.status == "stale"
        and current.reason_code == "designated_instance_new_members_unanchored"
    )


def test_known_split_retires_whole_residue_but_new_connecting_path_preserves_it() -> None:
    from neistra_core.molecular import Bond

    original = cif().replace(b"LIG", b"ALA")
    before = parsed(original).model_copy(
        update={"bonds": [Bond(id=1, atom_1_id=2, atom_2_id=3, order=1.0)]}
    )
    designation = initial_designation(resolve_candidates(before, original_bytes=original), "before")
    split = before.model_copy(update={"bonds": []})
    stale = reconcile_designation(
        designation, before, split, resolve_candidates(split, original_bytes=original), "split"
    )
    assert stale.status == "stale" and stale.reason_code == "designated_instance_split_or_ambiguous"
    connected = heavy_added(before).model_copy(
        update={
            "bonds": [
                Bond(id=1, atom_1_id=2, atom_2_id=4, order=1.0),
                Bond(id=2, atom_1_id=4, atom_2_id=3, order=1.0),
            ]
        }
    )
    retained = reconcile_designation(
        designation,
        before,
        connected,
        resolve_candidates(connected, original_bytes=original),
        "connected",
    )
    assert retained.status == "resolved" and retained.instance_id == designation.instance_id
    assert retained.atom_ids == [2, 3, 4]


def test_deleted_known_bridge_cannot_hide_a_split_of_remaining_original_members() -> None:
    from neistra_core.molecular import Bond

    original = cif() + b"HETATM 4 C C2 . LIG B 2 . 5 0 0 1 10 7 B C2 LIG ? 1\n"
    before = parsed(original).model_copy(
        update={
            "bonds": [
                Bond(id=1, atom_1_id=2, atom_2_id=3, order=1.0),
                Bond(id=2, atom_1_id=3, atom_2_id=4, order=1.0),
            ]
        }
    )
    designation = initial_designation(resolve_candidates(before, original_bytes=original), "before")
    after = without_atom(before, 3)
    current = reconcile_designation(
        designation, before, after, resolve_candidates(after, original_bytes=original), "after"
    )
    assert (
        current.status == "stale"
        and current.reason_code == "designated_instance_split_or_ambiguous"
    )


def test_unrelated_owned_polymer_addition_keeps_polymer_nonpotential_and_ligand_identity() -> None:
    original = cif().replace(b"LIG", b"ALA")
    before = parsed(original)
    designation = initial_designation(resolve_candidates(before, original_bytes=original), "before")
    after = heavy_added(before, owner=1, parent=1)
    inventory = resolve_candidates(after, original_bytes=original)
    assert inventory.automatic_candidate is not None and inventory.automatic_candidate.atom_ids == [
        2,
        3,
    ]
    assert not inventory.candidates[0].potential_ligand
    assert inventory.candidates[0].boundary_status == "unsupported"
    current = reconcile_designation(designation, before, after, inventory, "after")
    assert current.status == "resolved" and current.instance_id == designation.instance_id


@pytest.mark.parametrize(
    "operation,member_count", [("element", 2), ("atom", 3), ("fragment", 10), ("hydrogen", 3)]
)
def test_actual_direct_editor_retains_source_owned_nonpolymer_with_current_membership(
    operation: str, member_count: int
) -> None:
    from neistra_core.editing.model import (
        DirectMolecularEditor,
        ModelAction,
        ModelAtomAdd,
        ModelElement,
        ModelFragmentAdd,
        ModelHydrogenAdd,
    )

    original = cif().replace(b"LIG", b"ALA")
    before = parsed(original)
    designation = initial_designation(resolve_candidates(before, original_bytes=original), "before")
    actions: dict[str, ModelAction] = {
        "element": ModelElement(operation="atom.element", element="N"),
        "atom": ModelAtomAdd(operation="atom.add", element="C"),
        "fragment": ModelFragmentAdd(operation="fragment.attach", fragment="cyclopropyl"),
        "hydrogen": ModelHydrogenAdd(operation="hydrogens.add", count=1),
    }
    action = actions[operation]
    after = (
        DirectMolecularEditor()
        .edit(before, [2], action, next_atom_id=4, next_bond_id=1, hydrogen_policy="preserve")
        .edit.structure
    )
    inventory = resolve_candidates(after, original_bytes=original)
    assert inventory.automatic_candidate is not None
    assert inventory.automatic_candidate.atom_ids == list(range(2, member_count + 2))
    retained = reconcile_designation(designation, before, after, inventory, "after")
    assert retained.status == "resolved" and retained.instance_id == designation.instance_id
    assert retained.atom_ids == list(range(2, member_count + 2))


@pytest.mark.parametrize("with_scheme", [False, True])
def test_explicit_macrolide_entity_is_an_exact_nonpolymeric_boundary(with_scheme: bool) -> None:
    original = cif().replace(b"2 non-polymer", b"2 macrolide")
    if with_scheme:
        original += SCHEME_HEADER + b"B 2 LIG 1 7 70 LIG HIST B .\n"
    candidate = resolve_candidates(parsed(original), original_bytes=original).automatic_candidate
    assert candidate is not None and candidate.atom_ids == [2, 3]


def test_unknown_raw_entity_type_stays_potential_despite_amino_acid_name_heuristic() -> None:
    original = cif().replace(b"1 polymer", b"1 unknown-kind")
    inventory = resolve_candidates(parsed(original), original_bytes=original)
    assert inventory.automatic_candidate is None
    unknown = inventory.candidates[0]
    assert unknown.atom_ids == [1] and unknown.potential_ligand and not unknown.selectable
    assert unknown.reason_codes == ["source_entity_type_unsupported"]
    assert inventory.candidates[1].boundary_status == "qualified"


def test_raw_branched_entity_is_potential_despite_amino_acid_name_heuristic() -> None:
    original = cif().replace(b"1 polymer", b"1 branched")
    inventory = resolve_candidates(parsed(original), original_bytes=original)
    assert inventory.automatic_candidate is None
    branched = inventory.candidates[0]
    assert branched.atom_ids == [1] and branched.potential_ligand and not branched.selectable
    assert branched.reason_codes == ["branched_boundary_unsupported"]
    assert inventory.candidates[1].boundary_status == "qualified"


def test_raw_branched_amino_named_instance_blocks_a_separate_qualified_ligand() -> None:
    original = (
        cif(repeated=True)
        .replace(b"2 non-polymer\n", b"2 branched\n3 non-polymer\n")
        .replace(b"C 2\n", b"C 3\n")
        .replace(b"LIG B 2", b"ALA B 2")
        .replace(b"B C1 LIG", b"B C1 ALA")
        .replace(b"B O1 LIG", b"B O1 ALA")
        .replace(b"LIG C 2", b"LIG C 3")
    )
    inventory = resolve_candidates(parsed(original), original_bytes=original)
    assert inventory.automatic_candidate is None
    branched = next(candidate for candidate in inventory.candidates if candidate.atom_ids == [2, 3])
    assert branched.potential_ligand and branched.reason_codes == ["branched_boundary_unsupported"]
    assert next(
        candidate for candidate in inventory.candidates if candidate.atom_ids == [4, 5]
    ).automatic_eligible
