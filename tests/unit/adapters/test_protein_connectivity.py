from __future__ import annotations

from pathlib import Path

import pytest
from neistra_core.adapters import ImportOptions
from neistra_core.adapters.macromolecular import MmcifAdapter, PdbAdapter
from neistra_core.molecular import Bond
from neistra_core.protein_connectivity import infer_standard_connectivity


def protein_pdb(distance: float = 1.33, *, ter: bool = False, second: int = 2) -> bytes:
    lines = []
    serial = 0
    for residue_number, shift in [(1, 0.0), (second, distance + 2)]:
        for name, element, point in [
            ("N", "N", (-2.0, 0.0, 0.0)),
            ("CA", "C", (-1.0, 1.0, 0.0)),
            ("C", "C", (0.0, 0.0, 0.0)),
            ("O", "O", (0.0, -1.2, 0.0)),
            ("CB", "C", (-1.0, 2.5, 0.0)),
        ]:
            serial += 1
            x, y, z = point
            lines.append(
                f"ATOM  {serial:5d} {name:^4s} ALA A{residue_number:4d}    "
                f"{x + shift:8.3f}{y:8.3f}{z:8.3f}{1.0:6.2f}{0.0:6.2f}          {element:>2s}  "
            )
        if ter and residue_number == 1:
            lines.append("TER")
    return ("\n".join(lines) + "\nEND\n").encode()


def parse_raw(**options):
    return (
        PdbAdapter()
        .parse(protein_pdb(**options), "observed.pdb", ImportOptions(infer_bonds=False))
        .structures[0]
    )


def pairs(source):
    return {tuple(sorted((b.atom_1_id, b.atom_2_id))) for b in source.bonds}


def test_import_records_only_observed_supported_edges_and_respects_option():
    raw = parse_raw()
    inferred = PdbAdapter().parse(protein_pdb(), "observed.pdb").structures[0]
    expected = {
        (1, 2),
        (2, 3),
        (3, 4),
        (2, 5),
        (6, 7),
        (7, 8),
        (8, 9),
        (7, 10),
        (3, 6),
    }
    assert raw.bonds == []
    assert pairs(inferred) == expected
    assert inferred.atoms == raw.atoms and inferred.conformers == raw.conformers
    assert all(b.inferred and b.order is None for b in inferred.bonds)
    assert inferred.inferences[-1].bond_ids == [b.id for b in inferred.bonds]
    assert len(inferred.inferences[-1].atom_ids) == 10
    assert infer_standard_connectivity(raw).bonds == inferred.bonds


@pytest.mark.parametrize(
    ("distance", "linked"), [(0.899, False), (0.9, True), (1.799, True), (1.8, False)]
)
def test_peptide_distance_bounds_apply_to_every_conformer(distance, linked):
    raw = parse_raw()
    points = list(raw.conformers[0].coordinates)
    points[5] = (distance, 0, 0)
    source = raw.model_copy(
        update={
            "conformers": [
                *raw.conformers,
                raw.conformers[0].model_copy(update={"id": 2, "coordinates": points}),
            ]
        }
    )
    assert ((3, 6) in pairs(infer_standard_connectivity(source))) is linked
    if linked:
        points[5] = (2, 0, 0)
        altered = source.model_copy(
            update={
                "conformers": [
                    raw.conformers[0],
                    raw.conformers[0].model_copy(update={"id": 2, "coordinates": points}),
                ]
            }
        )
        assert (3, 6) not in pairs(infer_standard_connectivity(altered))


def test_ter_gap_subchain_chain_and_unresolved_insertion_veto_peptide_inference():
    assert (3, 6) not in pairs(PdbAdapter().parse(protein_pdb(ter=True), "ter.pdb").structures[0])
    assert (3, 6) not in pairs(PdbAdapter().parse(protein_pdb(second=3), "gap.pdb").structures[0])
    raw = parse_raw()
    for changes in [{"chain_id": 2}, {"source_subchain_id": "different"}, {"insertion_code": "A"}]:
        changed = raw.model_copy(
            update={
                "residues": [
                    raw.residues[0],
                    raw.residues[1].model_copy(update=changes),
                ]
            }
        )
        assert (3, 6) not in pairs(infer_standard_connectivity(changed))
    # Reliable consecutive label sequence resolves an author-number insertion.
    labeled = raw.model_copy(
        update={
            "residues": [
                raw.residues[0].model_copy(update={"label_number": 1, "insertion_code": "A"}),
                raw.residues[1].model_copy(update={"label_number": 2}),
            ]
        }
    )
    assert (3, 6) in pairs(infer_standard_connectivity(labeled))
    label_gap = labeled.model_copy(
        update={
            "residues": [
                labeled.residues[0],
                labeled.residues[1].model_copy(update={"label_number": 3}),
            ]
        }
    )
    assert (3, 6) not in pairs(infer_standard_connectivity(label_gap))


@pytest.mark.parametrize("change", ["alternate", "duplicate", "element"])
def test_ambiguous_or_mismatched_residue_is_not_inferred(change):
    raw = parse_raw()
    updates = {
        "alternate": {"alternate_location": "A"},
        "duplicate": {"name": "CA"},
        "element": {"element": "O"},
    }[change]
    changed = raw.model_copy(
        update={
            "atoms": [
                raw.atoms[0].model_copy(update=updates),
                *raw.atoms[1:],
            ]
        }
    )
    inferred = infer_standard_connectivity(changed)
    assert all(a > 5 and b > 5 for a, b in pairs(inferred))


def test_missing_atoms_never_created_and_explicit_graph_and_facts_preserved():
    raw = parse_raw()
    # Missing CB is allowed: infer only edges between the observed matching atoms.
    atoms = [a for a in raw.atoms if a.id != 5]
    source = raw.model_copy(
        update={
            "atoms": atoms,
            "conformers": [
                c.model_copy(
                    update={
                        "coordinates": [
                            point
                            for a, point in zip(raw.atoms, c.coordinates, strict=True)
                            if a.id != 5
                        ]
                    }
                )
                for c in raw.conformers
            ],
            "bonds": [Bond(id=41, atom_1_id=1, atom_2_id=10, order=2, inferred=False)],
        }
    )
    result = infer_standard_connectivity(source)
    assert result.atoms == source.atoms
    assert result.conformers == source.conformers
    assert result.bonds[0] == source.bonds[0]
    assert all(b.id > 41 for b in result.bonds[1:])
    assert all(b.atom_1_id != 5 and b.atom_2_id != 5 for b in result.bonds)
    assert (1, 10) in pairs(result)


def test_mmcif_import_uses_same_observed_graph_and_explicit_option():
    raw = parse_raw()
    exported = MmcifAdapter().export(raw, "protein")
    default = MmcifAdapter().parse(exported.data, "protein.cif").structures[0]
    disabled = (
        MmcifAdapter()
        .parse(exported.data, "protein.cif", ImportOptions(infer_bonds=False))
        .structures[0]
    )
    assert pairs(default) == pairs(infer_standard_connectivity(raw))
    assert disabled.bonds == []
    assert default.atoms == disabled.atoms


def test_raw_1stp_retains_ligand_and_all_original_facts():
    path = Path(__file__).parents[2] / "fixtures/complex/1stp.pdb"
    raw = (
        PdbAdapter()
        .parse(path.read_bytes(), path.name, ImportOptions(infer_bonds=False))
        .structures[0]
    )
    inferred = PdbAdapter().parse(path.read_bytes(), path.name).structures[0]
    assert len(raw.bonds) == 17 and len(inferred.bonds) == 940
    assert inferred.bonds[:17] == raw.bonds
    assert inferred.atoms == raw.atoms and inferred.conformers == raw.conformers
    assert all(b.inferred and b.order is None for b in inferred.bonds[17:])
    residues = {r.id: r for r in inferred.residues}
    atoms = {a.id: a for a in inferred.atoms}
    assert all(
        residues[atoms[b.atom_1_id].residue_id].name == "BTN"
        and residues[atoms[b.atom_2_id].residue_id].name == "BTN"
        for b in raw.bonds
    )


def test_exclusions_are_respected_and_other_polymer_or_ligand_not_inferred():
    raw = parse_raw()
    source = raw.model_copy(
        update={
            "metadata": {
                "neistra_modeling": {"schema_version": 1, "excluded_bonds": [[3, 6], [1, 2]]}
            }
        }
    )
    assert not {(3, 6), (1, 2)} & pairs(infer_standard_connectivity(source))
    other = raw.model_copy(
        update={"residues": [r.model_copy(update={"name": "UNK"}) for r in raw.residues]}
    )
    assert infer_standard_connectivity(other).bonds == []


def test_ter_in_later_model_with_different_serials_vetoes_link_but_keeps_explicit_edge():
    first = protein_pdb().decode().replace("END\n", "")
    second = protein_pdb(ter=True).decode().replace("END\n", "")
    shifted = []
    for line in second.splitlines():
        if line.startswith("ATOM  "):
            line = line[:6] + f"{int(line[6:11]) + 100:5d}" + line[11:]
        shifted.append(line)
    text = "MODEL        1\n" + first + "ENDMDL\nMODEL        2\n"
    text += "\n".join(shifted) + "\nENDMDL\nEND\n"
    source = PdbAdapter().parse(text.encode(), "two-models.pdb").structures[0]
    assert len(source.conformers) == 2
    assert (3, 6) not in pairs(source)
    explicit = text.replace("END\n", "CONECT    3    6\nEND\n")
    supplied = PdbAdapter().parse(explicit.encode(), "explicit.pdb").structures[0]
    assert (3, 6) in pairs(supplied)
    retained = next(b for b in supplied.bonds if (b.atom_1_id, b.atom_2_id) == (3, 6))
    assert not retained.inferred and retained.order is None


def test_standard_ile_named_connectivity_uses_cg1_cd1_without_completing_atoms():
    from neistra_core.adapters.rdkit_common import mol_to_normalized
    from rdkit import Chem
    from rdkit.Chem import AllChem

    native = Chem.MolFromSequence("I")
    assert AllChem.EmbedMolecule(native, randomSeed=82) == 0
    source = mol_to_normalized(native, filename="observed.pdb", format_name="pdb")
    source = source.model_copy(update={"bonds": []})
    names = {a.id: a.name for a in source.atoms}
    edges = {frozenset((names[a], names[b])) for a, b in pairs(infer_standard_connectivity(source))}
    assert frozenset(("CG1", "CD1")) in edges
    assert frozenset(("CG2", "CD1")) not in edges


@pytest.mark.parametrize(
    "changes",
    [
        {"component_type": "ligand"},
        {"component_type": "water"},
        {"source_entity_type": "non-polymer"},
        {"source_entity_type": "branched"},
        {"source_entity_id": "different"},
    ],
)
def test_known_nonpolymer_and_entity_boundaries_veto_only_missing_peptide_edges(changes):
    raw = parse_raw()
    residues = [r.model_copy(update={"source_entity_id": "same"}) for r in raw.residues]
    residues[1] = residues[1].model_copy(update=changes)
    source = raw.model_copy(update={"residues": residues})
    result = infer_standard_connectivity(source)
    assert (3, 6) not in pairs(result)
    assert {(1, 2), (2, 3), (6, 7), (7, 8)} <= pairs(result)
    explicit = source.model_copy(
        update={"bonds": [Bond(id=42, atom_1_id=3, atom_2_id=6, order=None, inferred=False)]}
    )
    assert infer_standard_connectivity(explicit).bonds[0] == explicit.bonds[0]


@pytest.mark.parametrize("entity_type", [None, "unknown"])
def test_unknown_entity_uses_sequence_and_geometry_fallback(entity_type):
    raw = parse_raw()
    source = raw.model_copy(
        update={
            "residues": [
                r.model_copy(
                    update={
                        "component_type": "unknown",
                        "source_entity_type": entity_type,
                        "source_entity_id": None,
                    }
                )
                for r in raw.residues
            ]
        }
    )
    assert (3, 6) in pairs(infer_standard_connectivity(source))
