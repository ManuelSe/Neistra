from __future__ import annotations

from copy import deepcopy

import pytest
from neistra_core.ligands.models import LigandDesignationV1

from tests.support.project_document_compatibility import expected_project


def test_expected_document_conversion_preserves_every_preceding_field_and_input() -> None:
    original = {"schema_version": 2, "entries": [{"id": "a", "atom_ids": [8, 1, 9],
                "user_metadata": {"ligand_designation": {"user": "unchanged"}},
                "unknown_retained_field": {"nested": [1, 2, 3]}}],
                "history": {"can_redo": True, "retained_commands": 200},
                "arbitrary_state": {"must_not_disappear": True}}
    before = deepcopy(original)
    changed = expected_project(original)
    assert original == before
    assert changed == {**before, "schema_version": 3, "entries": [{
        **before["entries"][0], "ligand_designation": LigandDesignationV1().model_dump(mode="json"),
    }]}
    changed["entries"][0]["user_metadata"]["extra"] = 1
    assert original == before


def test_current_and_unknown_versions_are_not_reinterpreted_or_stripped() -> None:
    for version in (1, 3, 4):
        original = {"schema_version": version, "entries": [{"id": "a", "future_field": 9}],
                    "unknown": [4, 3, 2]}
        assert expected_project(original) == original


def test_schema_two_unknown_designation_is_refused_instead_of_replaced_with_default() -> None:
    with pytest.raises(AssertionError, match="unknown ligand state"):
        expected_project({
            "schema_version": 2, "entries": [{"ligand_designation": {"status": "cleared"}}],
        })
