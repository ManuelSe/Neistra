from __future__ import annotations

import pytest
from molweave_core.minimization.capture import complete_membership
from molweave_core.minimization.contracts import CalculationError

from tests.support.minimization import combined, molecule, peptide


def test_mandatory_closure_includes_fixed_h_but_not_disconnected_components():
    first, second = molecule(), molecule("CO")
    source = combined(first, second)
    assert complete_membership(source, {3}) == set(range(1, len(first.atoms) + 1))
    assert len(complete_membership(source, {len(first.atoms) + 1})) == len(second.atoms)


def test_sparse_canonical_protein_connectivity_does_not_crop_chosen_chain():
    source = peptide()
    source = source.model_copy(update={"bonds": []})
    assert complete_membership(source, {7}) == {a.id for a in source.atoms}
    assert source.bonds == []  # closure membership never creates missing topology


def test_capture_rejects_missing_atoms():
    with pytest.raises(CalculationError, match="missing"):
        complete_membership(molecule(), {999})


def test_whole_chain_closure_cannot_bypass_the_atom_limit():
    source = peptide()
    template = source.atoms[0]
    atoms = [template.model_copy(update={"id": i + 1}) for i in range(20_001)]
    source = source.model_copy(update={"atoms": atoms, "bonds": []})
    with pytest.raises(CalculationError, match="20000"):
        complete_membership(source, {1})
