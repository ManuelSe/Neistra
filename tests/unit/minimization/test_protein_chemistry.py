from __future__ import annotations

import pytest
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.protein_chemistry import validate_protein_chemistry
from molweave_core.minimization.templates import match_protein_chain

from tests.support.minimization import protein_state_chain, protein_state_templates

TEMPLATES = protein_state_templates()


@pytest.mark.parametrize("label", sorted(TEMPLATES))
def test_all70_locked_standard_states_and_termini_have_unambiguous_existing_graphs(label):
    labels = (
        (label, "GLY", "CALA")
        if label.startswith("N") and len(label) == 4
        else ("NALA", "GLY", label)
        if label.startswith("C") and len(label) == 4
        else ("NALA", label, "CALA")
    )
    source = protein_state_chain(labels)
    before = source.to_bytes()
    matched = match_protein_chain(source, TEMPLATES)
    assert [r.template.name for r in matched] == list(labels)
    validate_protein_chemistry(source, matched)
    assert source.to_bytes() == before


@pytest.mark.parametrize(
    "labels,charges",
    [
        (("NARG", "GLY", "CALA"), {"N": 0, "NE": 0, "NH1": 1, "NH2": 1}),
        (("NALA", "GLY", "CARG"), {"O": 0, "OXT": 0, "NE": 0, "NH1": 0, "NH2": 0}),
    ],
)
def test_opposing_incorrect_charge_groups_cannot_pass_by_their_total(labels, charges):
    source = protein_state_chain(labels)
    target = 1 if labels[0] == "NARG" else 3
    source = source.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": charges[a.name]})
                if a.residue_id == target and a.name in charges
                else a
                for a in source.atoms
            ]
        }
    )
    before = source.to_bytes()
    with pytest.raises(CalculationError, match="charge group"):
        validate_protein_chemistry(source, match_protein_chain(source, TEMPLATES))
    assert source.to_bytes() == before


def assigned_backbone(source):
    atoms = {a.id: a for a in source.atoms}
    return source.model_copy(
        update={
            "bonds": [
                b.model_copy(
                    update={
                        "order": 2.0
                        if {atoms[b.atom_1_id].name, atoms[b.atom_2_id].name} == {"C", "O"}
                        else 1.0
                    }
                )
                for b in source.bonds
            ]
        }
    )


def test_three_adjacent_doubles_do_not_establish_a_valid_phenyl_kekule_graph():
    source = assigned_backbone(protein_state_chain(("NALA", "PHE", "CALA")))
    atoms = {a.id: a for a in source.atoms}
    doubles = [{"CG", "CD1"}, {"CD1", "CE1"}, {"CE1", "CZ"}]
    source = source.model_copy(
        update={
            "bonds": [
                b.model_copy(update={"order": 2.0})
                if atoms[b.atom_1_id].residue_id == 2
                and {atoms[b.atom_1_id].name, atoms[b.atom_2_id].name} in doubles
                else b
                for b in source.bonds
            ]
        }
    )
    with pytest.raises(CalculationError, match="valence"):
        validate_protein_chemistry(source, match_protein_chain(source, TEMPLATES))


def test_valid_alternating_phenyl_kekule_graph_is_accepted():
    source = assigned_backbone(protein_state_chain(("NALA", "PHE", "CALA")))
    atoms = {a.id: a for a in source.atoms}
    doubles = [{"CG", "CD1"}, {"CE1", "CZ"}, {"CE2", "CD2"}]
    source = source.model_copy(
        update={
            "bonds": [
                b.model_copy(update={"order": 2.0})
                if atoms[b.atom_1_id].residue_id == 2
                and {atoms[b.atom_1_id].name, atoms[b.atom_2_id].name} in doubles
                else b
                for b in source.bonds
            ]
        }
    )
    validate_protein_chemistry(source, match_protein_chain(source, TEMPLATES))


def test_negative_carboxyl_oxygen_cannot_also_have_assigned_double_order():
    source = assigned_backbone(protein_state_chain(("NALA", "ASP", "CALA")))
    atoms = {a.id: a for a in source.atoms}
    source = source.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"formal_charge": -1})
                if a.residue_id == 2 and a.name == "OD1"
                else a
                for a in source.atoms
            ],
            "bonds": [
                b.model_copy(update={"order": 2.0})
                if atoms[b.atom_1_id].residue_id == 2
                and {atoms[b.atom_1_id].name, atoms[b.atom_2_id].name} == {"CG", "OD1"}
                else b
                for b in source.bonds
            ],
        }
    )
    with pytest.raises(CalculationError, match="valence"):
        validate_protein_chemistry(source, match_protein_chain(source, TEMPLATES))


def test_aromatic_flag_on_backbone_is_not_ignored():
    source = protein_state_chain(("NALA", "GLY", "CALA"))
    source = source.model_copy(
        update={"bonds": [source.bonds[0].model_copy(update={"aromatic": True}), *source.bonds[1:]]}
    )
    with pytest.raises(CalculationError, match="aromatic flag"):
        validate_protein_chemistry(source, match_protein_chain(source, TEMPLATES))
