"""Known warning sites retain canonical identity without changing classification."""

from __future__ import annotations

import numpy as np
import pytest
from neistra_core.interaction_chemistry import Chemistry
from neistra_core.interaction_groups import interaction_groups
from neistra_core.interactions import AtomIdentity, InteractionWarning, Site, analyze_interactions
from neistra_core.molecular import (
    Atom,
    Bond,
    Chain,
    Conformer,
    NormalizedStructureV1,
    Residue,
    SourceFacts,
)

from tests.unit.test_interactions import source


def test_missing_hydrogen_warning_identifies_only_observed_donors_per_entry() -> None:
    # Supplied methylamine/carbonyl heavy sites: no explicit H can be invented.
    points = [(0.0, 0.0, 0.0), (-1.0, 0.0, 0.0), (2.8, 0.0, 0.0), (3.8, 0.0, 0.0)]
    first = NormalizedStructureV1(
        title="Observed donor without H",
        structure_type="ligand",
        source=SourceFacts(filename="donor.mol", format="mol"),
        atoms=[
            Atom(
                id=index,
                name=element,
                element=element,
                formal_charge=0,
                coordinates=point,
                source_index=index - 1,
            )
            for index, (element, point) in enumerate(
                zip(["N", "C", "O", "C"], points, strict=True), 1
            )
        ],
        bonds=[
            Bond(id=1, atom_1_id=1, atom_2_id=2, order=1),
            Bond(id=2, atom_1_id=3, atom_2_id=4, order=2),
        ],
        conformers=[Conformer(id=1, name="observed", coordinates=points)],
    )
    second = first.model_copy(
        update={
            "atoms": [atom.model_copy(update={"id": atom.id + 100}) for atom in first.atoms],
            "bonds": [
                bond.model_copy(
                    update={
                        "atom_1_id": bond.atom_1_id + 100,
                        "atom_2_id": bond.atom_2_id + 100,
                    }
                )
                for bond in first.bonds
            ],
        }
    )
    before = first.to_bytes(), second.to_bytes()
    result = analyze_interactions([source(second, "b"), source(first, "a")])
    warnings = [w for w in result.warnings if w.code == "explicit_hydrogens_required"]
    assert [(warning.entry_id, warning.atom_ids) for warning in warnings] == [
        ("a", [1]),
        ("b", [101]),
    ]
    assert not any(record.kind == "hydrogen_bond" for record in result.records)
    assert all(result.coverage[kind].status == "partial" for kind in result.coverage)
    assert (first.to_bytes(), second.to_bytes()) == before
    assert result == analyze_interactions([source(first, "a"), source(second, "b")])


def test_histidine_tautomer_warning_preserves_known_nitrogen_ids() -> None:
    # Complete observed heavy sites, no tautomer H and no guessed atom identities.
    names = ["N", "CA", "C", "O", "CB", "CG", "ND1", "CE1", "NE2", "CD2"]
    points = [(float(index), float(index % 3), 0.0) for index in range(len(names))]
    atoms = [
        Atom(
            id=10 + index,
            name=name,
            element=name[0],
            residue_id=1,
            coordinates=point,
            source_index=index,
        )
        for index, (name, point) in enumerate(zip(names, points, strict=True))
    ]
    structure = NormalizedStructureV1(
        title="Observed histidine",
        structure_type="protein",
        source=SourceFacts(filename="histidine.pdb", format="pdb"),
        atoms=atoms,
        bonds=[],
        chains=[Chain(id=1, name="A")],
        residues=[Residue(id=1, chain_id=1, name="HIS", component_type="polymer")],
        conformers=[Conformer(id=1, name="observed", coordinates=points)],
    )
    before = structure.to_bytes()
    result = analyze_interactions([source(structure)])
    warnings = [w for w in result.warnings if w.code == "unresolved_histidine_tautomer"]
    assert len(warnings) == 1
    assert warnings[0].atom_ids == [16, 18]  # ND1, NE2, never absent H.
    assert not any(record.kind == "hydrogen_bond" for record in result.records)
    assert structure.to_bytes() == before


def _site(atom_id: int, name: str, charge: int | None = None) -> Site:
    atom = Atom(
        id=atom_id,
        name=name,
        element=name[0],
        formal_charge=charge,
        coordinates=(0.0, 0.0, 0.0),
        source_index=0,
    )
    return Site(
        AtomIdentity(structure_id="entry", atom_id=atom_id),
        atom,
        np.zeros(3),
        "entry:molecule",
        True,
        1.7,
    )


@pytest.mark.parametrize("order", [["CG", "CD1", "CD2"], ["CD2", "CG", "CD1"]])
def test_incomplete_aromatic_warning_exposes_only_existing_typed_ring_members(
    order: list[str],
) -> None:
    known = {"CG": 101, "CD1": 103, "CD2": 107}
    sites = [_site(known[name], name) for name in order]
    names = {name: index for index, name in enumerate(order)}
    chemistry = Chemistry(protein_residues=[("entry", "PHE", names)])
    warnings: list[InteractionWarning] = []
    rings, charges = interaction_groups(chemistry, sites, warnings)
    assert rings == []
    assert charges == []
    assert len(warnings) == 1
    assert warnings[0].code == "incomplete_aromatic_ring"
    assert warnings[0].atom_ids == [101, 103, 107]
    assert all(warning.entry_id == "entry" for warning in warnings)


def test_contradictory_sidechain_warning_identifies_complete_known_charge_group() -> None:
    sites = [_site(41, "OD2", 1), _site(23, "OD1", 0)]
    chemistry = Chemistry(protein_residues=[("entry", "ASP", {"OD2": 0, "OD1": 1})])
    warnings: list[InteractionWarning] = []
    rings, charges = interaction_groups(chemistry, sites, warnings)
    assert rings == []
    assert charges == []
    assert [(warning.code, warning.atom_ids) for warning in warnings] == [
        ("contradictory_sidechain_charge", [23, 41]),
    ]
