from __future__ import annotations

from typing import Any

import pytest
from neistra_core.adapters.rdkit_common import mol_to_normalized
from neistra_core.ligands.chemistry import MAX_DEPICTION_ATOMS, prepare_chemistry
from rdkit import Chem
from rdkit.Chem import Descriptors, rdMolDescriptors


def identity(mol: Any, canonical_ids: list[int]) -> dict[str, object]:
    """Independent mapped native identity, including stereo reference atoms."""
    return {
        "atoms": sorted(
            (
                canonical_ids[a.GetIdx()],
                a.GetAtomicNum(),
                a.GetIsotope(),
                a.GetNumRadicalElectrons(),
                a.GetFormalCharge(),
                str(a.GetChiralTag()),
                a.GetNoImplicit(),
                a.GetNumExplicitHs(),
                a.GetNumImplicitHs(),
            )
            for a in mol.GetAtoms()
        ),
        "bonds": sorted(
            (
                canonical_ids[b.GetBeginAtomIdx()],
                canonical_ids[b.GetEndAtomIdx()],
                b.GetBondTypeAsDouble(),
                b.GetIsAromatic(),
                str(b.GetStereo()),
                tuple(canonical_ids[index] for index in b.GetStereoAtoms()),
            )
            for b in mol.GetBonds()
        ),
    }


@pytest.mark.parametrize(
    "smiles",
    [
        "O.CCO.[NH4+].[Cl-]",
        "[13CH4].c1cc[nH]c1",
        "C[C@H](F)Cl.C/C=C/C",
        "[2H]O.CC",
        "[CH3].N",
        "[H][H].O",
        "[NH2+][C@@H](Cl)C.[18OH2]",
        "CC(=O)[O-].[Na+].CC(=O)O",
        "CCO.CCO.CCO",
        "C1.CCO.CC1",
        "C1.C[C@H](F)Cl.CC1",
        "[2H]C1.C/C=C/C.CC1",
        "C1.[nH]2cccc2.CC1",
    ],
)
def test_fragment_recovery_equals_actual_whole_original_h_expansion(smiles: str) -> None:
    original = smiles.encode()
    native = Chem.MolFromSmiles(smiles)
    # The independent oracle uses the actual preceding whole-original operation.
    whole = Chem.AddHs(native)
    source = mol_to_normalized(whole, filename="exact.smi", format_name="smiles")
    original_state = source.to_bytes()
    mappings: list[tuple[int, ...]] = []
    expected_fragments = Chem.GetMolFrags(
        whole,
        asMols=True,
        sanitizeFrags=True,
        fragsMolAtomMapping=mappings,
    )
    context = prepare_chemistry(source, original_bytes=original)
    for expected, mapping in zip(expected_fragments, mappings, strict=True):
        canonical_ids = [index + 1 for index in mapping]
        qualified = context.qualify(canonical_ids)
        assert qualified.status == "qualified"
        assert qualified.provenance == "exact_immutable_source_match"
        assert identity(qualified.molecule, canonical_ids) == identity(expected, canonical_ids)
        assert qualified.formula == rdMolDescriptors.CalcMolFormula(
            expected,
            separateIsotopes=True,
            abbreviateHIsotopes=False,
        )
        assert qualified.molecular_weight == pytest.approx(Descriptors.MolWt(expected), abs=1e-10)
        assert qualified.formal_charge == Chem.GetFormalCharge(expected)
    assert source.to_bytes() == original_state
    assert original == smiles.encode()


def test_large_original_expands_only_the_admitted_nonfirst_fragment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    smiles = ".".join(["C[C@H](F)Cl"] * 500)
    native = Chem.MolFromSmiles(smiles)
    whole = Chem.AddHs(native)
    assert native.GetNumAtoms() > MAX_DEPICTION_ATOMS
    source = mol_to_normalized(whole, filename="many.smi", format_name="smiles")
    mapping = Chem.GetMolFrags(whole)[-1]
    members = [index + 1 for index in mapping]
    before = source.to_bytes()
    add_h = Chem.AddHs
    allocations = []

    def bounded_add_h(mol: Any, *args: Any, **kwargs: Any) -> Any:
        assert mol.GetNumAtoms() <= MAX_DEPICTION_ATOMS
        result = add_h(mol, *args, **kwargs)
        assert result.GetNumAtoms() <= MAX_DEPICTION_ATOMS
        allocations.append((mol.GetNumAtoms(), result.GetNumAtoms()))
        return result

    monkeypatch.setattr(Chem, "AddHs", bounded_add_h)
    context = prepare_chemistry(source, original_bytes=smiles.encode())
    qualified = context.qualify(members)
    assert qualified.status == "qualified" and qualified.formula == "C2H4ClF"
    assert qualified.provenance == "exact_immutable_source_match"
    assert allocations == [(4, 8)]
    assert context.qualify(members).input_hash == qualified.input_hash
    assert allocations == [(4, 8)]
    assert source.to_bytes() == before


def test_mismatched_global_h_membership_never_expands_original(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    smiles = "C[C@H](F)Cl.C[C@H](F)Cl"
    whole = Chem.AddHs(Chem.MolFromSmiles(smiles))
    source = mol_to_normalized(whole, filename="copies.smi", format_name="smiles")
    members = [index + 1 for index in Chem.GetMolFrags(whole)[-1]]
    old_id = members[-1]
    new_id = len(source.atoms) + 1
    changed = source.model_copy(
        update={
            "atoms": [a for a in source.atoms if a.id != old_id]
            + [
                next(a for a in source.atoms if a.id == old_id).model_copy(
                    update={
                        "id": new_id,
                        "source_index": new_id - 1,
                    }
                ),
            ],
            "bonds": [
                b.model_copy(
                    update={
                        "atom_1_id": new_id if b.atom_1_id == old_id else b.atom_1_id,
                        "atom_2_id": new_id if b.atom_2_id == old_id else b.atom_2_id,
                    }
                )
                for b in source.bonds
            ],
        }
    )

    def forbidden_add_h(*args: object, **kwargs: object) -> None:
        pytest.fail("Unproven global H membership must refuse before H allocation")

    monkeypatch.setattr(Chem, "AddHs", forbidden_add_h)
    result = prepare_chemistry(changed, original_bytes=smiles.encode()).qualify(
        [new_id if atom_id == old_id else atom_id for atom_id in members]
    )
    assert result.status == "unavailable"


def test_same_membership_with_changed_chemistry_does_not_reuse_original() -> None:
    smiles = "C[C@H](F)Cl.C[C@H](F)Cl"
    whole = Chem.AddHs(Chem.MolFromSmiles(smiles))
    source = mol_to_normalized(whole, filename="copies.smi", format_name="smiles")
    members = [index + 1 for index in Chem.GetMolFrags(whole)[-1]]
    changed_id = members[1]
    changed = source.model_copy(
        update={
            "atoms": [
                atom.model_copy(update={"formal_charge": 1}) if atom.id == changed_id else atom
                for atom in source.atoms
            ]
        }
    )
    result = prepare_chemistry(changed, original_bytes=smiles.encode()).qualify(members)
    assert result.status == "unavailable"
