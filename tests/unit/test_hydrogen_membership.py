from molweave_core.components import component_atom_ids, derive_component_hierarchy
from molweave_core.editing.ligand import RdkitLigandEditor
from molweave_core.editing.selection import component_projection
from molweave_core.molecular import Bond

from tests.support.modeling_fixture import paracetamol


def test_bonded_orphan_hydrogens_join_parent_without_rewriting_source() -> None:
    original = paracetamol()
    orphaned = paracetamol(orphan_h=True)
    before = orphaned.to_bytes()
    expected = derive_component_hierarchy(original).components[0]
    hierarchy = derive_component_hierarchy(orphaned)
    assert len(hierarchy.components) == 1
    component = hierarchy.components[0]
    assert component.id == expected.id
    assert component.category == "ligand"
    assert component.classification_source == "fallback"
    assert set(component_atom_ids(orphaned, component)) == {a.id for a in original.atoms}
    assert any(w.code == "hydrogen_membership_derived" for w in component.warnings)
    assert component_projection(orphaned, [1]).atoms == orphaned.atoms
    hydrogen = next(a.id for a in orphaned.atoms if a.residue_id is None)
    assert component_projection(orphaned, [hydrogen]).atoms == orphaned.atoms
    assert orphaned.to_bytes() == before


def test_ambiguous_or_unbonded_hydrogens_stay_unclassified() -> None:
    source = paracetamol(orphan_h=True)
    h = next(a.id for a in source.atoms if a.residue_id is None)
    source = source.model_copy(
        update={
            "bonds": [
                *source.bonds,
                Bond(
                    id=max(b.id for b in source.bonds) + 1,
                    atom_1_id=h,
                    atom_2_id=1,
                    order=1,
                ),
            ]
        }
    )
    hierarchy = derive_component_hierarchy(source)
    assert any(c.category == "unclassified" and h in c.atom_ids for c in hierarchy.components)
    source = source.model_copy(
        update={"bonds": [b for b in source.bonds if h not in {b.atom_1_id, b.atom_2_id}]}
    )
    assert any(
        c.category == "unclassified" and h in c.atom_ids
        for c in derive_component_hierarchy(source).components
    )


def test_generated_hydrogens_inherit_each_bonded_parent_residue() -> None:
    from tests.unit.editing.test_ligand_editor import ligand

    source = ligand("CC")
    second = source.residues[0].model_copy(update={"id": 2, "name": "L2"})
    source = source.model_copy(
        update={
            "residues": [*source.residues, second],
            "atoms": [source.atoms[0], source.atoms[1].model_copy(update={"residue_id": 2})],
        }
    )
    result = (
        RdkitLigandEditor()
        .add_hydrogens(
            source,
            next_atom_id=3,
            next_bond_id=2,
        )
        .structure
    )
    atoms = {a.id: a for a in result.atoms}
    hydrogen_count = 0
    for bond in result.bonds:
        first, second_atom = atoms[bond.atom_1_id], atoms[bond.atom_2_id]
        if first.element == "H" or second_atom.element == "H":
            hydrogen_count += 1
            assert first.residue_id == second_atom.residue_id
    assert hydrogen_count == 6
