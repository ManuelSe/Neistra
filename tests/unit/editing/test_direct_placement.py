from __future__ import annotations

import pytest
from molweave_core.editing.fragments import FRAGMENT_CAP_SMILES, fragment_template
from molweave_core.editing.model import (
    DirectMolecularEditor,
    ModelAtomAdd,
    ModelDelete,
    ModelFragmentAdd,
    modeling_metadata,
)
from molweave_core.molecular import Conformer, NormalizedStructureV1
from rdkit import Chem

from tests.support.modeling_fixture import paracetamol


@pytest.mark.parametrize("fragment", FRAGMENT_CAP_SMILES)
@pytest.mark.parametrize("replace_h", [False, True])
def test_all_fragment_graphs_and_membership_on_incomplete_parent(fragment, replace_h):  # type: ignore[no-untyped-def]
    before = paracetamol(orphan_h=True)
    before = before.model_copy(
        update={
            "atoms": [a.model_copy(update={"formal_charge": None}) for a in before.atoms],
            "bonds": [b.model_copy(update={"order": None}) for b in before.bonds],
        }
    )
    source = before.to_bytes()
    target = (
        before.atoms[0]
        if not replace_h
        else next(a for a in reversed(before.atoms) if a.element == "H")
    )
    anchor = target
    if replace_h:
        b = next(b for b in before.bonds if target.id in {b.atom_1_id, b.atom_2_id})
        anchor = next(
            a for a in before.atoms if a.id in {b.atom_1_id, b.atom_2_id} and a.id != target.id
        )
    template = fragment_template(fragment)
    template_bytes = Chem.MolToMolBlock(template)
    editor = DirectMolecularEditor()
    action = ModelFragmentAdd(operation="fragment.attach", fragment=fragment)
    result = editor.edit(before, [target.id], action, next_atom_id=100, next_bond_id=100)
    after = result.edit.structure
    assert (
        editor.edit(
            before, [target.id], action, next_atom_id=100, next_bond_id=100
        ).edit.structure.to_bytes()
        == after.to_bytes()
    )
    assert before.to_bytes() == source
    assert Chem.MolToMolBlock(template) == template_bytes
    retained = [a for a in before.atoms if not replace_h or a.id != target.id]
    assert after.atoms[: len(retained)] == retained
    assert all(a.residue_id == anchor.residue_id for a in after.atoms if a.id >= 100)
    assert result.replacements == ({target.id: 100} if replace_h else {})
    assert after.bonds[len(before.bonds) - int(replace_h)].atom_1_id == anchor.id
    cap = template.GetAtomWithIdx(0)
    removed = {0, *[n.GetIdx() for n in cap.GetNeighbors() if n.GetSymbol() == "H"]}
    kept = [a for a in template.GetAtoms() if a.GetIdx() not in removed]
    assert [a.element for a in after.atoms if a.id >= 100] == [a.GetSymbol() for a in kept]
    assert len(result.edit.created_bond_ids) == 1 + sum(
        b.GetBeginAtomIdx() not in removed and b.GetEndAtomIdx() not in removed
        for b in template.GetBonds()
    )
    assert NormalizedStructureV1.from_bytes(after.to_bytes()) == after


def test_placement_preserves_retained_coordinates_in_all_conformers_and_empty_rebuilding() -> None:
    before = paracetamol()
    extra = Conformer(
        id=17,
        name="translated",
        coordinates=[(p[0] + 10, p[1] - 7, p[2] + 4) for p in before.active_coordinates],
    )
    before = before.model_copy(update={"conformers": [*before.conformers, extra]})
    editor = DirectMolecularEditor()
    after = editor.edit(
        before,
        [1],
        ModelAtomAdd(operation="atom.add", element="P", charge=None),
        next_atom_id=100,
        next_bond_id=100,
    ).edit.structure
    for old, new in zip(before.conformers, after.conformers, strict=True):
        assert new.coordinates[:-1] == old.coordinates
    assert after.conformers[1].coordinates[-1] == pytest.approx(
        tuple(v + d for v, d in zip(after.conformers[0].coordinates[-1], (10, -7, 4), strict=True))
    )
    assert after.atoms[-1].formal_charge is None
    empty = editor.edit(
        after,
        [a.id for a in after.atoms],
        ModelDelete(operation="atom.delete"),
        next_atom_id=101,
        next_bond_id=101,
    ).edit.structure
    rebuilt = editor.edit(
        empty,
        [],
        ModelAtomAdd(operation="atom.add", element="H", charge=0),
        next_atom_id=101,
        next_bond_id=101,
    ).edit.structure
    assert rebuilt.atoms[0].id == 101
    assert rebuilt.bonds == []
    assert all(c.coordinates == [(0.0, 0.0, 0.0)] for c in rebuilt.conformers)
    assert modeling_metadata(rebuilt).excluded_bonds == []
