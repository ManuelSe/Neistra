from pathlib import Path

import pytest
from molweave_api.viewer_state import default_viewer_settings, inherit_added_appearance
from molweave_core.adapters.macromolecular import PdbAdapter
from molweave_core.editing.model import DirectMolecularEditor, ModelAtomAdd

from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_automatic_hydrogens import automatic


@pytest.mark.parametrize("color", ["#ad12ef", "element"])
def test_appearance_inheritance_creation_ancestry_and_independent_properties(color: str) -> None:
    before = model("C.O")
    result = automatic(before, [1], ModelAtomAdd(operation="atom.add", element="N"))
    settings = default_viewer_settings("ligand")
    settings.update(
        selection_representations=[
            {"style": "stick", "atom_ids": [1]},
            {"style": "line", "atom_ids": [2]},
        ],
        selection_colors=[{"color": color, "atom_ids": [1]}],
        selection_hidden_atoms=[1],
        selection_nonpolar_hydrogens=[{"show": False, "atom_ids": [3]}],
    )
    changed, warnings = inherit_added_appearance(
        settings, before, result.edit.structure, result.appearance_sources
    )
    created = set(result.edit.created_atom_ids)
    assert changed["selection_representations"] == [
        {"style": "stick", "atom_ids": sorted({1, *created})},
        {"style": "line", "atom_ids": [2]},
    ]
    assert changed["selection_colors"] == [{"color": color, "atom_ids": sorted({1, *created})}]
    assert changed["selection_hidden_atoms"] == [1]
    assert changed["selection_nonpolar_hydrogens"] == settings["selection_nonpolar_hydrogens"]
    assert changed["components"] == settings["components"]
    assert changed["surface_objects"] == settings["surface_objects"]
    assert settings["selection_colors"][0]["atom_ids"] == [1]
    assert not warnings


def test_appearance_inheritance_unattached_atoms_use_entry_defaults() -> None:
    before = model("C")
    result = DirectMolecularEditor().edit(
        before,
        [],
        ModelAtomAdd(operation="atom.add", element="O", coordinates=(4.0, 0.0, 0.0)),
        next_atom_id=1000,
        next_bond_id=1000,
    )
    settings = default_viewer_settings("ligand")
    settings["selection_colors"] = [{"color": "#ff0000", "atom_ids": [1]}]
    after, warnings = inherit_added_appearance(
        settings, before, result.edit.structure, result.appearance_sources
    )
    assert after == settings and not warnings


def test_appearance_inheritance_polymer_residue_validation_and_fallback() -> None:
    before = (
        PdbAdapter()
        .parse(Path("tests/fixtures/formats/protein_editing.pdb").read_bytes(), "protein.pdb")
        .structures[0]
    )
    anchor = next(a for a in before.atoms if a.name == "CA")
    residue_ids = [a.id for a in before.atoms if a.residue_id == anchor.residue_id]
    result = DirectMolecularEditor().edit(
        before,
        [anchor.id],
        ModelAtomAdd(operation="atom.add", element="C"),
        next_atom_id=1000,
        next_bond_id=1000,
    )
    settings = default_viewer_settings("protein")
    settings["selection_representations"] = [{"style": "cartoon", "atom_ids": residue_ids}]
    after, warnings = inherit_added_appearance(
        settings, before, result.edit.structure, result.appearance_sources
    )
    assert after["selection_representations"][0]["atom_ids"] == sorted([*residue_ids, 1000])
    assert not warnings
    settings["selection_representations"] = [{"style": "cartoon", "atom_ids": [anchor.id]}]
    after, warnings = inherit_added_appearance(
        settings, before, result.edit.structure, result.appearance_sources
    )
    assert after == settings
    assert warnings[0].code == "model_appearance_polymer_unresolved"


def test_appearance_inheritance_rejects_invalid_internal_ancestry() -> None:
    before = model("C")
    result = automatic(before, [1], ModelAtomAdd(operation="atom.add", element="N"))
    settings = default_viewer_settings("ligand")
    with pytest.raises(ValueError, match="cycle"):
        inherit_added_appearance(settings, before, result.edit.structure, {1000: 1001, 1001: 1000})
    with pytest.raises(ValueError, match="newly created"):
        inherit_added_appearance(settings, before, result.edit.structure, {1: 1000})
