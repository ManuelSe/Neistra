from __future__ import annotations

from typing import Any

import pytest
from molweave_core.adapters.rdkit_common import mol_to_normalized
from molweave_core.editing import InvalidLigandEditError, RdkitLigandEditor, StructureValidator
from molweave_core.molecular import NormalizedStructureV1
from rdkit import Chem
from rdkit.Chem import AllChem

all_chem: Any = AllChem


def ligand(smiles: str) -> NormalizedStructureV1:
    mol = Chem.MolFromSmiles(smiles)
    assert mol is not None
    assert all_chem.EmbedMolecule(mol, randomSeed=0xBAD5EED) == 0
    return mol_to_normalized(mol, filename="scientific.smi", format_name="smiles")


def test_cip_assignment_survives_normalized_rdkit_round_trip() -> None:
    structure = ligand("N[C@@H](C)C(=O)O")
    before = StructureValidator.stereochemistry(structure)
    after = RdkitLigandEditor().cleanup(
        structure,
        force_field="auto",
        max_iterations=200,
    )
    assert before
    assert StructureValidator.stereochemistry(after.structure) == before
    assert not any(item.code == "stereochemistry_changed" for item in after.warnings)


def test_explicit_requested_force_field_does_not_silently_fallback() -> None:
    structure = ligand("[U]")
    with pytest.raises(InvalidLigandEditError, match="MMFF parameters"):
        RdkitLigandEditor().cleanup(
            structure,
            force_field="mmff",
            max_iterations=50,
        )


def test_questionable_geometry_is_returned_as_structured_warning() -> None:
    structure = ligand("CC")
    overlapping = structure.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"coordinates": (0.0, 0.0, 0.0)})
                for atom in structure.atoms
            ],
            "conformers": [
                conformer.model_copy(
                    update={"coordinates": [(0.0, 0.0, 0.0)] * len(structure.atoms)}
                )
                for conformer in structure.conformers
            ],
        }
    )
    warnings = StructureValidator().validate(overlapping, "scientific.test")
    assert [item.code for item in warnings] == ["severe_atomic_clash"]
