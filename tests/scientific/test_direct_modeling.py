from __future__ import annotations

import pytest
from molweave_core.adapters.base import AdapterError
from molweave_core.adapters.defaults import create_default_registry
from molweave_core.editing.model import (
    DirectMolecularEditor,
    ModelAtomAdd,
    ModelBondDelete,
    ModelCharge,
    ModelElement,
)
from molweave_core.viewer_projection import ligand_viewer_sdf

from tests.support.modeling_fixture import paracetamol
from tests.unit.editing.test_ligand_editor import ligand


def test_remote_stereo_dependencies_clear_bond_labels_but_keep_disconnected_stereo() -> None:
    before = ligand("CCCC/C(CCCCC)=C(/F)Cl.C/C=C/C.C[C@H](F)O")
    component = {1}
    while True:
        expanded = component | {
            i
            for b in before.bonds
            if component & {b.atom_1_id, b.atom_2_id}
            for i in (b.atom_1_id, b.atom_2_id)
        }
        if expanded == component:
            break
        component = expanded
    assigned = [b for b in before.bonds if b.stereo not in {None, "NONE"}]
    assert any(b.atom_1_id in component for b in assigned)
    assert any(b.atom_1_id not in component for b in assigned)
    result = (
        DirectMolecularEditor()
        .edit(
            before,
            [1],
            ModelElement(operation="atom.element", element="Br"),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit
    )
    for old, new in zip(before.bonds, result.structure.bonds, strict=True):
        if old in assigned and old.atom_1_id in component:
            assert new.stereo is None
        elif old.atom_1_id not in component:
            assert new == old
    assert [a for a in result.structure.atoms if a.id not in component] == [
        a for a in before.atoms if a.id not in component
    ]
    assert result.structure.conformers == before.conformers
    assert any(w.code == "model_stereo_unassigned" for w in result.warnings)


def test_unknown_anchor_coordinates_are_finite_and_explicitly_unvalidated() -> None:
    before = ligand("C")
    before = before.model_copy(
        update={"atoms": [before.atoms[0].model_copy(update={"element": "X"})]}
    )
    result = (
        DirectMolecularEditor()
        .edit(
            before,
            [1],
            ModelAtomAdd(operation="atom.add", element="C"),
            next_atom_id=2,
            next_bond_id=1,
        )
        .edit
    )
    assert result.structure.atoms[0] == before.atoms[0]
    assert result.structure.atoms[1].coordinates == pytest.approx((1.5, 0, 0))
    assert any(w.code == "model_placement_radius_unknown" for w in result.warnings)


def test_extreme_authored_charge_remains_persisted_and_displayable() -> None:
    before = paracetamol()
    after = (
        DirectMolecularEditor()
        .edit(
            before,
            [1],
            ModelCharge(operation="atom.charge.set", charge=2**32),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit.structure
    )
    snapshot = after.to_bytes()
    assert "M  END" in ligand_viewer_sdf(after)
    assert after.atoms[0].formal_charge == 2**32
    assert after.to_bytes() == snapshot


@pytest.mark.parametrize("format_name", ["mol", "sdf", "mol2"])
def test_chemical_exports_explain_unknown_charge_mapping(format_name: str) -> None:
    before = paracetamol()
    after = (
        DirectMolecularEditor()
        .edit(
            before,
            [1],
            ModelCharge(operation="atom.charge.set", charge=None),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit.structure
    )
    snapshot = after.to_bytes()
    result = create_default_registry().for_format(format_name).export(after, "unknown")
    assert any(w.blocking and w.code == "unknown_formal_charges_mapped" for w in result.warnings)
    assert after.to_bytes() == snapshot


def test_smiles_refuses_unknown_chemistry_instead_of_inventing_neutral_smiles() -> None:
    before = paracetamol()
    before = before.model_copy(
        update={"atoms": [a.model_copy(update={"formal_charge": None}) for a in before.atoms]}
    )
    with pytest.raises(AdapterError, match="assigned formal charges and bond orders"):
        create_default_registry().for_format("smiles").export(before, "unknown")


@pytest.mark.parametrize("format_name", ["mol", "sdf", "smiles"])
def test_unrepresentable_broken_aromatic_export_is_a_typed_refusal(format_name: str) -> None:
    before = paracetamol()
    bond = next(b for b in before.bonds if b.aromatic)
    after = (
        DirectMolecularEditor()
        .edit(
            before,
            [bond.atom_1_id, bond.atom_2_id],
            ModelBondDelete(operation="bond.delete"),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit.structure
    )
    assert "M  END" in ligand_viewer_sdf(after)
    with pytest.raises(AdapterError, match="represent"):
        create_default_registry().for_format(format_name).export(after, "aromatic-draft")


@pytest.mark.parametrize(
    "field, value", [("id", 100000), ("coordinates", (-1000.0, 0, 0)), ("formal_charge", 12)]
)
def test_pdb_refuses_draft_fields_that_do_not_fit_its_writer(field: str, value: object) -> None:
    before = ligand("C")
    before = before.model_copy(
        update={"atoms": [before.atoms[0].model_copy(update={field: value})]}
    )
    if field == "coordinates":
        before = before.model_copy(
            update={
                "conformers": [before.conformers[0].model_copy(update={"coordinates": [value]})]
            }
        )
    with pytest.raises(AdapterError):
        create_default_registry().for_format("pdb").export(before, "bounded")


def test_current_mol2_types_follow_the_edited_element_and_original_types_stay_source_facts() -> (
    None
):
    from tests.scientific.test_format_fidelity import parse

    before = parse("corina_carboxylate.mol2")[0]
    atom = next(a for a in before.atoms if a.element == "O")
    after = (
        DirectMolecularEditor()
        .edit(
            before,
            [atom.id],
            ModelElement(operation="atom.element", element="S"),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit.structure
    )
    result = create_default_registry().for_format("mol2").export(after, "authored")
    line = next(
        line
        for line in result.data.decode().splitlines()
        if len(line.split()) >= 9 and line.split()[0] == str(atom.id)
    )
    assert line.split()[5].startswith("S")
    assert after.metadata["mol2_atom_types"] == before.metadata["mol2_atom_types"]
    assert any(w.code == "mol2_draft_typing" and w.blocking for w in result.warnings)


def test_large_parent_uses_no_rdkit_parent_conversion_or_component_helper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import molweave_core.editing.selection as helper
    from molweave_core.molecular import Atom, Bond, Conformer, NormalizedStructureV1, SourceFacts

    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("The complete parent must not enter a chemistry helper.")

    monkeypatch.setattr(helper, "component_projection", forbidden)
    monkeypatch.setattr(helper, "normalized_to_mol", forbidden)
    count = 25000
    points = [(float(i * 2), 0.0, 0.0) for i in range(count)]
    before = NormalizedStructureV1(
        title="Synthetic scope qualification",
        structure_type="complex",
        source=SourceFacts(filename="synthetic", format="generated", facts={"synthetic": True}),
        atoms=[
            Atom(
                id=i + 1,
                name=f"C{i + 1}",
                element="C",
                coordinates=p,
                source_index=i,
                formal_charge=None,
            )
            for i, p in enumerate(points)
        ],
        bonds=[Bond(id=i, atom_1_id=i, atom_2_id=i + 1, order=None) for i in range(1, count)],
        conformers=[Conformer(id=1, name="synthetic", coordinates=points)],
    )
    result = (
        DirectMolecularEditor()
        .edit(
            before,
            [1],
            ModelAtomAdd(operation="atom.add", element="P"),
            next_atom_id=count + 1,
            next_bond_id=count,
        )
        .edit
    )
    assert result.structure.atoms[:-1] == before.atoms
    assert result.structure.bonds[:-1] == before.bonds
    assert result.structure.active_coordinates[:-1] == before.active_coordinates
    assert result.created_atom_ids == (count + 1,)


def test_mmcif_multimodel_serials_remain_unique_after_sparse_identity_edits() -> None:
    import gemmi
    from molweave_core.molecular import Conformer

    before = paracetamol()
    # Valid stable identities can have arbitrary allocator gaps after branching.
    before = before.model_copy(
        update={
            "atoms": [
                before.atoms[i].model_copy(update={"id": atom_id})
                for i, atom_id in enumerate([1, 3, 4])
            ],
            "bonds": [],
            "conformers": [
                Conformer(
                    id=number, name=f"Model {number}", coordinates=before.active_coordinates[:3]
                )
                for number in [1, 17]
            ],
        }
    )
    output = create_default_registry().for_format("mmcif").export(before, "sparse-models")
    block = gemmi.cif.read_string(output.data.decode()).sole_block()
    ids = list(block.find_values("_atom_site.id"))
    assert len(ids) == len(set(ids)) == 6
    assert before.atoms[2].id == 4


@pytest.mark.parametrize("format_name", ["mol", "sdf", "smiles"])
def test_h_free_draft_exports_explain_implicit_valence_h_interpretation(format_name: str) -> None:
    from molweave_core.editing.model import ModelDelete
    from rdkit import Chem

    before = paracetamol()
    draft = (
        DirectMolecularEditor()
        .edit(
            before,
            [a.id for a in before.atoms if a.element == "H"],
            ModelDelete(operation="atom.delete"),
            next_atom_id=100,
            next_bond_id=100,
        )
        .edit.structure
    )
    assert all(a.element != "H" for a in draft.atoms)
    snapshot = draft.to_bytes()
    result = create_default_registry().for_format(format_name).export(draft, "literal-h-free")
    text = result.data.decode()
    interpreted = (
        Chem.MolFromSmiles(text.split()[0])
        if format_name == "smiles"
        else Chem.MolFromMolBlock(text.split("$$$$")[0])
    )
    assert sum(a.GetTotalNumHs() for a in interpreted.GetAtoms()) > 0
    assert any(w.code == "implicit_valence_interpretation" and w.blocking for w in result.warnings)
    assert draft.to_bytes() == snapshot
