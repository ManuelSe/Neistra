"""Scientific fixture invariants and refusal controls, not latency checks."""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest

from tests.support.ligand_property_performance_fixtures import (
    FIXTURES,
    FixtureSpec,
    generate_sdf,
    load_fixture,
    specifications,
    verify_original,
)


def test_exact_distinct_matrix_and_peroxide() -> None:
    from rdkit import Chem

    specs = specifications()
    assert len(specs) == len({row.id for row in specs}) == 44
    assert len({Chem.MolToSmiles(Chem.MolFromSmiles(row.smiles)) for row in specs}) == 44
    for profile in ("chromium", "mobile-chromium"):
        assert [
            len(row.smiles) for row in specs if row.id.startswith(f"paired-{profile}-")
        ] == list(range(10, 87, 4))
    bulk = {row.id: row.smiles for row in specs if row.id.startswith("bulk-")}
    assert bulk == {
        "bulk-active-chromium-repeated": "C" * 41 + "NC",
        "bulk-active-chromium-distinct": "C" * 41 + "OC",
        "bulk-active-mobile-chromium-repeated": "C" * 41 + "NO",
        "bulk-active-mobile-chromium-distinct": "C" * 41 + "OO",
    }


@pytest.mark.parametrize("spec", specifications(), ids=lambda spec: spec.id)
def test_every_frozen_original_reparses_with_exact_intended_facts(spec: FixtureSpec) -> None:
    row, payload = load_fixture(spec.id)
    structure = verify_original(payload, spec.smiles, row["filename"])
    assert sum(atom.element != "H" for atom in structure.atoms) == len(spec.smiles)
    assert all(atom.formal_charge == 0 and atom.stereo is None for atom in structure.atoms)
    assert all(
        len(conformer.coordinates) == len(structure.atoms) for conformer in structure.conformers
    )


@pytest.mark.parametrize(
    "identity", ["paired-chromium-62", "paired-chromium-86", "bulk-active-mobile-chromium-distinct"]
)
def test_deterministic_generation_without_embedding_or_optimization(
    identity: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from rdkit.Chem import AllChem

    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("Embedding or optimization is forbidden for this generator")

    monkeypatch.setattr(AllChem, "EmbedMolecule", forbidden)
    monkeypatch.setattr(AllChem, "UFFOptimizeMolecule", forbidden)
    spec = next(row for row in specifications() if row.id == identity)
    _, frozen = load_fixture(identity)
    assert generate_sdf(spec) == generate_sdf(spec) == frozen


@pytest.mark.parametrize(
    "field,value", [("filename", "../outside.sdf"), ("sha256", "0" * 64), ("bytes", 1)]
)
def test_manifest_path_and_original_identity_refuse_tampering(
    tmp_path: Path, field: str, value: object
) -> None:
    identity = "paired-chromium-10"
    row, payload = load_fixture(identity)
    manifest = json.loads((FIXTURES / "manifest.json").read_text())
    manifest["fixtures"] = [{**row, field: value}]
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    (tmp_path / row["filename"]).write_bytes(payload)
    with pytest.raises(AssertionError):
        load_fixture(identity, tmp_path)


@pytest.mark.parametrize("change", ["isotope", "radical", "charge", "hydrogen", "order"])
def test_original_chemical_fact_tampering_is_refused(change: str) -> None:
    from rdkit import Chem

    row, payload = load_fixture("paired-chromium-10")
    molecule = next(iter(Chem.ForwardSDMolSupplier(io.BytesIO(payload), removeHs=False)))
    assert molecule is not None
    if change == "isotope":
        molecule.GetAtomWithIdx(0).SetIsotope(13)
    elif change == "radical":
        # A valence-saturated carbon does not retain an impossible radical label
        # through sanitization. Make a genuine terminal radical by removing one H.
        hydrogen = next(
            atom.GetIdx()
            for atom in molecule.GetAtomWithIdx(0).GetNeighbors()
            if atom.GetSymbol() == "H"
        )
        editable = Chem.RWMol(molecule)
        editable.RemoveAtom(hydrogen)
        molecule = editable.GetMol()
        molecule.GetAtomWithIdx(0).SetNoImplicit(True)
        molecule.GetAtomWithIdx(0).SetNumRadicalElectrons(1)
        molecule.UpdatePropertyCache()
    elif change == "charge":
        molecule.GetAtomWithIdx(0).SetFormalCharge(1)
    elif change == "hydrogen":
        molecule = Chem.RemoveHs(molecule)
    else:
        molecule.GetBondWithIdx(0).SetBondType(Chem.BondType.DOUBLE)
    altered = (Chem.MolToMolBlock(molecule) + "$$$$\n").encode()
    if change == "radical":
        reparsed = next(iter(Chem.ForwardSDMolSupplier(io.BytesIO(altered), removeHs=False)))
        assert reparsed is not None and reparsed.GetAtomWithIdx(0).GetNumRadicalElectrons() == 1
    with pytest.raises(AssertionError):
        verify_original(altered, row["intended_smiles"], row["filename"])
