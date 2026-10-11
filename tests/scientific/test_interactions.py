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
