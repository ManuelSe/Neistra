from __future__ import annotations

import pytest
from molweave_core.adapters.rdkit_common import export_loss_warnings, mol_to_normalized
from molweave_core.editing.model import DirectMolecularEditor, ModelAtomAdd
from molweave_core.hydrogen_protection import (
    protection_facts,
    recover_protection,
)
from molweave_core.molecular import NormalizedStructureV1
from rdkit import Chem

from tests.support.hydrogen_fixture import model


@pytest.mark.parametrize(
    "smiles,mass,radicals",
    [("[1H]C", 1, 0), ("[2H]C", 2, 0), ("[3H]C", 3, 0), ("[H]C", 0, 0), ("[CH2]C", 0, 1)],
)
def test_import_retains_source_isotope_and_radical_evidence(
    smiles: str, mass: int, radicals: int
) -> None:
    params = Chem.SmilesParserParams()
    params.removeHs = False
    mol = Chem.MolFromSmiles(smiles, params)
    before = mol_to_normalized(mol, filename="source.smi", format_name="smiles")
    fact = protection_facts(before)[1]
    assert fact.isotope == mass
    assert fact.radical_electrons == radicals
    assert fact.matches(before.atoms[0])
    assert fact.ordinary is (mass == 0 and radicals == 0)
    assert NormalizedStructureV1.from_bytes(before.to_bytes()) == before
    warnings = export_loss_warnings(before, "sdf")
    assert any(
        w.code == "isotope_radical_protection_not_exported" and w.blocking for w in warnings
    ) is (mass > 0 or radicals > 0)


def test_recovery_uses_stable_id_and_source_identity_without_mutating_inputs() -> None:
    original = model("CC")
    current = original.model_copy(update={"annotations": [{"kind": "unrelated", "value": 3}]})
    payload = current.to_bytes()
    recovered = recover_protection(current, original)
    assert protection_facts(recovered) == protection_facts(original)
    assert recovered.annotations[0] == {"kind": "unrelated", "value": 3}
    assert current.to_bytes() == payload
    assert recovered.source == original.source
    assert recover_protection(recovered, original) == recovered
    changed = current.model_copy(
        update={"atoms": [a.model_copy(update={"source_index": 999}) for a in current.atoms]}
    )
    assert recover_protection(changed, original) == changed


def test_missing_malformed_or_contradictory_evidence_is_not_ordinary() -> None:
    before = model("CC")
    assert protection_facts(before.model_copy(update={"annotations": []})) == {}
    malformed = {"kind": "neistra_hydrogen_protection", "schema_version": 2}
    with pytest.raises(ValueError):
        protection_facts(before.model_copy(update={"annotations": [malformed]}))
    assert recover_protection(
        before.model_copy(update={"annotations": [malformed]}), before
    ).annotations == [malformed]
    other = dict(before.annotations[0])
    other["atoms"] = [dict(other["atoms"][0], isotope=2)]
    with pytest.raises(ValueError, match="Contradictory"):
        protection_facts(before.model_copy(update={"annotations": [*before.annotations, other]}))


def test_new_direct_atoms_have_known_generated_identity() -> None:
    before = model("C")
    result = DirectMolecularEditor().edit(
        before,
        [1],
        ModelAtomAdd(operation="atom.add", element="H"),
        next_atom_id=50,
        next_bond_id=50,
    )
    fact = protection_facts(result.edit.structure)[50]
    assert fact.ordinary and fact.matches(result.edit.structure.atoms[-1])
