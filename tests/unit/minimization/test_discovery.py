from __future__ import annotations

import pytest
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.discovery import discover_context, whole_components
from molweave_core.selection import AtomReference, SelectionV1

from tests.support.minimization import combined, molecule, peptide, translated


def selection(entry="ligand", atom=3):
    return SelectionV1(atoms=[AtomReference(structure_id=entry, atom_id=atom)])


def test_discovery_is_nonrecursive_and_keeps_complete_components():
    ligand = molecule()
    nearby = translated(ligand, (10, 0, 0))
    remote = translated(ligand, (23, 0, 0))
    sources = {"ligand": ligand, "nearby": nearby, "remote": remote}
    before = {key: value.to_bytes() for key, value in sources.items()}
    result = discover_context({"ligand": ligand}, sources.items(), selection())
    assert result.membership == {"ligand": set(range(1, 10)), "nearby": set(range(1, 10))}
    assert result.component_count == 2
    assert {key: value.to_bytes() for key, value in sources.items()} == before


def test_selected_component_closure_drives_radius_not_only_selected_atom():
    source = peptide()
    source = source.model_copy(update={"bonds": []})
    assert whole_components(source) == (frozenset(a.id for a in source.atoms),)
    # A nearby candidate at one end is included even when the selected end is far away.
    points = [(float(i) * 3, 0.0, 0.0) for i in range(len(source.atoms))]
    source = source.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": p})
                for a, p in zip(source.atoms, points, strict=True)
            ],
            "conformers": [c.model_copy(update={"coordinates": points}) for c in source.conformers],
        }
    )
    neighbor = translated(molecule(), points[-1])
    result = discover_context(
        {"ligand": source}, [("ligand", source), ("neighbor", neighbor)], selection(atom=1)
    )
    assert result.membership["ligand"] == {a.id for a in source.atoms}
    assert result.membership["neighbor"] == {a.id for a in neighbor.atoms}


def test_same_entry_discovery_and_final_overrides_use_exact_ids():
    original = molecule()
    source = combined(original, translated(original, (40, 0, 0)))
    result = discover_context({"ligand": source}, [("ligand", source)], selection())
    assert result.membership == {"ligand": set(range(1, 10))}
    updates = {("ligand", 3): (35.0, 0.0, 0.0)}
    final = discover_context({"ligand": source}, [("ligand", source)], selection(), updates)
    assert final.membership["ligand"] == {a.id for a in source.atoms}


def test_unsupported_chemistry_is_discovered_without_filtering():
    source = molecule()
    ion = molecule("[Cl-]")
    result = discover_context({"ligand": source}, [("ligand", source), ("ion", ion)], selection())
    assert result.membership["ion"] == {1}
    with pytest.raises(CalculationError, match="missing"):
        discover_context({"ligand": source}, [("ligand", source)], selection(atom=999))
