from __future__ import annotations

import pytest
from molweave_core.contacts import close_contacts
from molweave_core.molecular import Atom, Bond, Conformer, NormalizedStructureV1, SourceFacts


def structure() -> NormalizedStructureV1:
    coordinates = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 2.0, 0.0)]
    return NormalizedStructureV1(
        title="contact fixture",
        structure_type="ligand",
        source=SourceFacts(filename="fixture.sdf", format="sdf"),
        atoms=[
            Atom(id=index, name=f"A{index}", element="C", coordinates=point, source_index=index - 1)
            for index, point in enumerate(coordinates, start=1)
        ],
        bonds=[Bond(id=1, atom_1_id=1, atom_2_id=2, order=1)],
        conformers=[Conformer(id=1, name="Model 1", coordinates=coordinates)],
    )


def test_contacts_use_active_coordinates_and_exclude_bonds() -> None:
    contacts = close_contacts(structure(), 2.1)
    assert [(item.atom_1_id, item.atom_2_id) for item in contacts] == [(1, 3)]
    assert contacts[0].distance == pytest.approx(2.0)


def test_contacts_are_deterministic_and_support_a_minimum_distance() -> None:
    contacts = close_contacts(structure(), 2.3, minimum_distance=2.1)
    assert [(item.atom_1_id, item.atom_2_id) for item in contacts] == [(2, 3)]
    assert contacts[0].distance == pytest.approx(5**0.5)


@pytest.mark.parametrize("cutoff", [0.0, -1.0, float("nan")])
def test_invalid_contact_cutoff_is_rejected(cutoff: float) -> None:
    with pytest.raises(ValueError, match="positive finite"):
        close_contacts(structure(), cutoff)
