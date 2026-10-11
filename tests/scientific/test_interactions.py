from __future__ import annotations

import math

import pytest
from molweave_core.interactions import analyze_interactions
from molweave_core.molecular import Atom, Bond, Conformer, NormalizedStructureV1, SourceFacts

from tests.unit.test_interactions import source


def hydrogen_pair(
    angle_degrees: float = 180,
    acceptor_base: tuple[float, float, float] = (3.8, 0, 0),
    hydrogen: bool = True,
) -> NormalizedStructureV1:
    # Ammonia donor and carbonyl acceptor, explicit charges and bond orders.
    radians = math.radians(angle_degrees)
    atoms = [
        ("N", (1 + math.cos(radians), math.sin(radians), 0)),
        ("H", (1, 0, 0)),
        ("O", (2.8, 0, 0)),
        ("C", acceptor_base),
    ]
    if not hydrogen:
        atoms[1] = ("C", (-1, 0, 0))
    return NormalizedStructureV1(
        title="controlled H bond",
        structure_type="ligand",
        source=SourceFacts(filename="controlled.sdf", format="sdf"),
        atoms=[
            Atom(
                id=i,
                name=f"{element}{i}",
                element=element,
                formal_charge=0,
                coordinates=point,
                source_index=i - 1,
            )
            for i, (element, point) in enumerate(atoms, 1)
        ],
        bonds=[
            Bond(id=1, atom_1_id=1, atom_2_id=2, order=1),
            Bond(id=2, atom_1_id=3, atom_2_id=4, order=2),
        ],
        conformers=[Conformer(id=1, name="controlled", coordinates=[point for _, point in atoms])],
    )


def test_hydrogen_bond_endpoints_geometry_and_clash_exception() -> None:
    result = analyze_interactions([source(hydrogen_pair())])
    bonds = [r for r in result.records if r.kind == "hydrogen_bond"]
    assert len(bonds) == 1
    assert bonds[0].endpoints == [(1, 0, 0), (2.8, 0, 0)]
    assert bonds[0].geometry["donor_angle"] == pytest.approx(180)
    assert bonds[0].geometry["acceptor_angle"] == pytest.approx(180)
    assert bonds[0].participants[0][0].atom_id == 2
    assert not any(r.kind == "clash" and r.participants[1][0].atom_id == 3 for r in result.records)


@pytest.mark.parametrize("angle_degrees,expected", [(129.9, 0), (130, 1), (180, 1)])
def test_donor_angle_boundary(angle_degrees: float, expected: int) -> None:
    result = analyze_interactions([source(hydrogen_pair(angle_degrees))])
    assert sum(r.kind == "hydrogen_bond" for r in result.records) == expected


def test_acceptor_angle_and_missing_hydrogen_are_respected() -> None:
    for structure in (hydrogen_pair(acceptor_base=(1.8, 0, 0)), hydrogen_pair(hydrogen=False)):
        result = analyze_interactions([source(structure)])
        assert not any(r.kind == "hydrogen_bond" for r in result.records)
    assert any(w.code == "explicit_hydrogens_required" for w in result.warnings)


def test_unknown_chemistry_does_not_become_rdkit_defaults() -> None:
    structure = hydrogen_pair()
    structure = structure.model_copy(
        update={"atoms": [a.model_copy(update={"formal_charge": None}) for a in structure.atoms]}
    )
    result = analyze_interactions([source(structure)])
    assert not any(r.kind in {"hydrogen_bond", "hydrophobic"} for r in result.records)
    assert result.coverage["hydrogen_bond"].status == "unavailable"
    assert any(w.code == "unknown_chemistry" for w in result.warnings)


def test_hydrophobic_neighborhood_and_distance() -> None:
    from tests.unit.test_interactions import molecule

    structure = molecule([(0, 0, 0), (-1.5, 0, 0), (4, 0, 0), (5.5, 0, 0)], [(1, 2), (3, 4)])
    records = analyze_interactions([source(structure)]).records
    assert sum(r.kind == "hydrophobic" for r in records) == 1
    polar = structure.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"element": "O"}) if atom.id == 2 else atom
                for atom in structure.atoms
            ]
        }
    )
    assert not any(r.kind == "hydrophobic" for r in analyze_interactions([source(polar)]).records)


def test_protein_template_types_only_observed_unambiguous_sites_without_mutation() -> None:
    from molweave_core.molecular import Chain, Residue

    base = hydrogen_pair()
    protein_points = [(0, 0, 0), (1, 0, 0), (-1, 1, 0), (-2, 1, 0), (-3, 1, 0), (-1, 2, 0)]
    names = [("N", "N"), ("H", "H"), ("CA", "C"), ("C", "C"), ("O", "O"), ("CB", "C")]
    atoms = [
        Atom(id=i, name=name, element=element, residue_id=1, coordinates=point, source_index=i - 1)
        for i, ((name, element), point) in enumerate(zip(names, protein_points, strict=True), 1)
    ]
    atoms += [
        base.atoms[2].model_copy(update={"id": 7, "residue_id": 2}),
        base.atoms[3].model_copy(update={"id": 8, "residue_id": 2}),
    ]
    structure = base.model_copy(
        update={
            "source": SourceFacts(filename="protein.pdb", format="pdb"),
            "atoms": atoms,
            "chains": [Chain(id=1, name="A")],
            "residues": [
                Residue(id=1, chain_id=1, name="ALA", component_type="polymer"),
                Residue(id=2, chain_id=1, name="LIG", component_type="ligand"),
            ],
            "bonds": [Bond(id=1, atom_1_id=7, atom_2_id=8, order=2)],
            "conformers": [
                Conformer(
                    id=1, name="observed", coordinates=[*protein_points, (2.8, 0, 0), (3.8, 0, 0)]
                )
            ],
        }
    )
    before = structure.to_bytes()
    result = analyze_interactions([source(structure)])
    assert any(
        r.kind == "hydrogen_bond" and r.participants[0][0].atom_id == 2 for r in result.records
    )
    assert any(w.code == "protein_template_connectivity" for w in result.warnings)
    assert before == structure.to_bytes()
    alternate = structure.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"alternate_location": "A"}) if atom.id == 2 else atom
                for atom in atoms
            ]
        }
    )
    assert not any(
        r.kind == "hydrogen_bond" for r in analyze_interactions([source(alternate)]).records
    )


def aromatic(
    z: float = 0, offset: float = 0, tilt: float = 0, warp: float = 0
) -> NormalizedStructureV1:
    from molweave_core.adapters.rdkit_common import mol_to_normalized
    from rdkit import Chem

    mol = Chem.MolFromSmiles("c1ccccc1")
    conformer = Chem.Conformer(6)
    for index in range(6):
        theta = index * math.pi / 3
        x, y = 1.4 * math.cos(theta), 1.4 * math.sin(theta)
        conformer.SetAtomPosition(
            index,
            (
                x + offset,
                y * math.cos(math.radians(tilt)),
                z + y * math.sin(math.radians(tilt)) + (warp if index == 0 else 0),
            ),
        )
    mol.AddConformer(conformer)
    return mol_to_normalized(mol, filename="ring.sdf", format_name="sdf")


@pytest.mark.parametrize(
    "z,offset,tilt,expected",
    [(3.5, 0, 0, 1), (3.5, 2.01, 0, 0), (4, 0, 90, 1), (3.5, 0, 45, 0), (5.51, 0, 0, 0)],
)
def test_ring_distance_plane_and_offset_geometry(
    z: float, offset: float, tilt: float, expected: int
) -> None:
    result = analyze_interactions([source(aromatic(), "a"), source(aromatic(z, offset, tilt), "b")])
    records = [r for r in result.records if r.kind == "pi_pi"]
    assert len(records) == expected
    if records:
        assert len(records[0].participants[0]) == len(records[0].participants[1]) == 6
        assert records[0].endpoints[0] == pytest.approx((0, 0, 0), abs=1e-9)


def test_nonplanar_or_degenerate_rings_report_missing_coverage() -> None:
    result = analyze_interactions([source(aromatic(warp=1), "a"), source(aromatic(z=3.5), "b")])
    assert not any(r.kind == "pi_pi" for r in result.records)
    assert any(w.code == "unassessable_aromatic_plane" for w in result.warnings)


def ion(element: str, charge: int, point: tuple[float, float, float]) -> NormalizedStructureV1:
    from tests.unit.test_interactions import molecule

    base = molecule([point])
    return base.model_copy(
        update={
            "atoms": [
                base.atoms[0].model_copy(update={"element": element, "formal_charge": charge})
            ]
        }
    )


@pytest.mark.parametrize(
    "point,charge,expected",
    [
        ((0, 0, 4), 1, 1),
        ((3, 0, 4), 1, 0),
        ((0, 0, 6.01), 1, 0),
        ((0, 0, 4), 0, 0),
        ((4, 0, 0), 1, 0),
    ],
)
def test_cation_pi_requires_positive_charge_and_direction(
    point: tuple[float, float, float], charge: int, expected: int
) -> None:
    result = analyze_interactions([source(aromatic(), "a"), source(ion("N", charge, point), "b")])
    assert sum(r.kind == "cation_pi" for r in result.records) == expected


def test_salt_bridge_charge_distance_and_delocalized_grouping() -> None:
    from molweave_core.adapters.rdkit_common import mol_to_normalized
    from rdkit import Chem

    mol = Chem.MolFromSmiles("CC(=O)[O-]")
    conformer = Chem.Conformer(4)
    for index, point in enumerate([(4, 1, 0), (4, 0, 0), (3.4, 0.5, 0), (3.4, -0.5, 0)]):
        conformer.SetAtomPosition(index, point)
    mol.AddConformer(conformer)
    carboxylate = mol_to_normalized(mol, filename="charged.sdf", format_name="sdf")
    result = analyze_interactions([source(carboxylate, "a"), source(ion("N", 1, (0, 0, 0)), "b")])
    salts = [r for r in result.records if r.kind == "salt_bridge"]
    assert len(salts) == 1
    assert len(salts[0].participants[0]) == 2
    assert salts[0].geometry["distance"] == pytest.approx(math.hypot(3.4, 0.5))
    for charge, distance in ((0, 0), (1, -10), (-1, 0)):
        records = analyze_interactions(
            [source(carboxylate, "a"), source(ion("N", charge, (distance, 0, 0)), "b")]
        ).records
        assert not any(r.kind == "salt_bridge" for r in records)


def test_salt_and_hydrogen_bond_classifications_are_independent() -> None:
    structure = hydrogen_pair()
    structure = structure.model_copy(
        update={
            "atoms": [
                atom.model_copy(
                    update={"formal_charge": 1 if atom.id == 1 else -1 if atom.id == 3 else 0}
                )
                for atom in structure.atoms
            ],
            "bonds": [structure.bonds[0], structure.bonds[1].model_copy(update={"order": 1})],
        }
    )
    kinds = {r.kind for r in analyze_interactions([source(structure)]).records}
    assert {"salt_bridge", "hydrogen_bond"}.issubset(kinds)


@pytest.mark.parametrize(
    "charge,protonated,expected", [(None, False, 1), (0, False, 0), (-1, False, 1), (None, True, 0)]
)
def test_protein_charge_assumptions_respect_explicit_evidence(
    charge: int | None, protonated: bool, expected: int
) -> None:
    from molweave_core.molecular import Chain, Residue

    from tests.unit.test_interactions import molecule

    points = [(4, 1, 0), (4, 0, 0), (3.4, 0.5, 0), (3.4, -0.5, 0)]
    names = ["CB", "CG", "OD1", "OD2"]
    if protonated:
        points.append((2.5, -0.5, 0))
        names.append("HD2")
    base = molecule(points)
    atoms = [
        atom.model_copy(
            update={
                "name": names[i],
                "element": "O"
                if names[i].startswith("O")
                else "H"
                if names[i].startswith("H")
                else "C",
                "formal_charge": charge if names[i] == "OD2" else None,
                "residue_id": 1,
            }
        )
        for i, atom in enumerate(base.atoms)
    ]
    structure = base.model_copy(
        update={
            "source": SourceFacts(filename="acid.pdb", format="pdb"),
            "atoms": atoms,
            "chains": [Chain(id=1, name="A")],
            "residues": [Residue(id=1, chain_id=1, name="ASP", component_type="polymer")],
        }
    )
    result = analyze_interactions([source(structure, "a"), source(ion("N", 1, (0, 0, 0)), "b")])
    assert sum(r.kind == "salt_bridge" for r in result.records) == expected
    assert any(w.code == "conventional_sidechain_charge" for w in result.warnings) == (
        charge is None and not protonated
    )
