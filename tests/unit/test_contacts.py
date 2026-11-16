from __future__ import annotations

import pytest
from neistra_core.contacts import ContactLimits, ContactQueryError, close_contacts
from neistra_core.molecular import Atom, Bond, Conformer, NormalizedStructureV1, SourceFacts


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


@pytest.mark.parametrize("cutoff", [0.0, -1.0, float("nan"), float("inf")])
def test_invalid_contact_cutoff_is_rejected(cutoff: float) -> None:
    with pytest.raises(ContactQueryError, match="positive finite"):
        close_contacts(structure(), cutoff)


@pytest.mark.parametrize("minimum", [-1.0, float("nan"), float("inf"), 2.0, 3.0])
def test_invalid_minimum_is_a_specific_query_error(minimum: float) -> None:
    with pytest.raises(ContactQueryError):
        close_contacts(structure(), 2.0, minimum_distance=minimum)


@pytest.mark.parametrize("value", [-1, 1.5, True])
@pytest.mark.parametrize("field", ["max_input_atoms", "max_raw_visits", "max_results"])
def test_contact_limits_require_non_negative_integers(field: str, value: int) -> None:
    values = {"max_input_atoms": 3, "max_raw_visits": 9, "max_results": 3}
    values[field] = value
    with pytest.raises(ContactQueryError, match="non-negative integers"):
        ContactLimits(**values)


def test_query_errors_retain_value_error_compatibility() -> None:
    with pytest.raises(ValueError):
        close_contacts(structure(), 0.0)
