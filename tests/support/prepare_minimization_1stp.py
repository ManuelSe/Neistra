"""Explicit offline benchmark preparation; no production minimization repair.

The full159-residue SEQRES chain is reconstructed independently with PDBFixer.
Observed heavy coordinates and ligand atom-name mapping are preserved. Frozen
outputs, preparation assumptions and hashes are documented separately.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import gemmi
import numpy as np
from molweave_core.adapters.rdkit_common import mol_to_normalized
from molweave_core.hydrogen_protection import ordinary_generated
from molweave_core.molecular import (
    Atom,
    Bond,
    Chain,
    Conformer,
    InferenceRecord,
    NormalizedStructureV1,
    Residue,
    SourceFacts,
)
from openmm import Platform, unit
from pdbfixer import PDBFixer
from rdkit import Chem


def main() -> None:
    output = Path(__file__).parents[1] / "fixtures/minimization"
    raw = output.parent / "complex/1stp.pdb"
    fixer = PDBFixer(filename=str(raw), platform=Platform.getPlatformByName("Reference"))
    fixer.removeHeterogens(keepWater=False)
    fixer.findMissingResidues()
    missing_residues = {str(k): list(v) for k, v in fixer.missingResidues.items()}
    fixer.findMissingAtoms()
    missing_atoms = {f"{r.name}{r.id}": [a.name for a in v] for r, v in fixer.missingAtoms.items()}
    print("Preparing full SEQRES, missing residues:", missing_residues, flush=True)
    fixer.addMissingAtoms(seed=82)
    # Explicit offline repair of generated terminal-residue chirality only.
    # In the ordered (N-CA,C-CA,CB-CA) frame standard L amino acids have
    # positive scalar triple product (CYS has the same frame, different CIP).
    observed_keys = {
        (line[21:22], int(line[22:26]), line[12:16].strip())
        for line in raw.read_text().splitlines()
        if line.startswith("ATOM  ")
    }
    model_positions = np.asarray(fixer.positions.value_in_unit(unit.nanometer)).copy()
    stereo_repairs = []
    for residue in fixer.topology.residues():
        by_name = {a.name: a for a in residue.atoms()}
        if not {"N", "CA", "C", "CB"} <= by_name.keys():
            continue
        labels = [by_name[n].index for n in ("CA", "N", "C", "CB")]
        frame = model_positions[labels]
        if np.linalg.det(frame[1:] - frame[0]) >= 0:
            continue
        assert (residue.chain.id, int(residue.id), "CA") not in observed_keys
        normal = np.cross(frame[1] - frame[0], frame[2] - frame[0])
        normal /= np.linalg.norm(normal)
        for atom in residue.atoms():
            if atom.name in {"N", "CA", "C", "O", "OXT"}:
                continue
            point = model_positions[atom.index]
            model_positions[atom.index] = point - 2 * np.dot(point - frame[0], normal) * normal
        stereo_repairs.append(f"{residue.name}{residue.id}")
    fixer.positions = model_positions * unit.nanometer
    print("Explicit modeled-residue L repair:", stereo_repairs, flush=True)
    fixer.addMissingHydrogens(pH=7.0)
    coords = [tuple(float(v) for v in p) for p in fixer.positions.value_in_unit(unit.angstrom)]
    chains = list(fixer.topology.chains())
    residues = list(fixer.topology.residues())
    atoms = list(fixer.topology.atoms())
    assert len(residues) == 159
    chain_ids = {c: i + 1 for i, c in enumerate(chains)}
    residue_ids = {r: i + 1 for i, r in enumerate(residues)}
    atom_ids = {a: i + 1 for i, a in enumerate(atoms)}
    observed = {
        (line[21:22], int(line[22:26]), line[12:16].strip()): tuple(
            float(line[i : i + 8]) for i in (30, 38, 46)
        )
        for line in raw.read_text().splitlines()
        if line.startswith("ATOM  ")
    }
    kept = 0
    for a, point in zip(atoms, coords, strict=True):
        key = (a.residue.chain.id, int(a.residue.id), a.name)
        if key in observed:
            assert max(abs(x - y) for x, y in zip(point, observed[key], strict=True)) < 1e-6
            kept += 1
    assert kept == len(observed)
    protein = NormalizedStructureV1(
        title="Prepared full159-residue1STP",
        structure_type="protein",
        source=SourceFacts(
            filename="1stp-prepared.pdb",
            format="pdb",
            facts={"raw_sha256": hashlib.sha256(raw.read_bytes()).hexdigest()},
        ),
        chains=[Chain(id=chain_ids[c], name=c.id, entity_type="polymer") for c in chains],
        residues=[
            Residue(
                id=residue_ids[r],
                chain_id=chain_ids[r.chain],
                name=r.name,
                author_number=int(r.id),
                label_number=residue_ids[r],
                component_type="polymer",
            )
            for r in residues
        ],
        atoms=[
            Atom(
                id=atom_ids[a],
                name=a.name,
                element=a.element.symbol,
                coordinates=coords[i],
                residue_id=residue_ids[a.residue],
                formal_charge=None,
                source_index=i,
                inferred_fields=[]
                if (a.residue.chain.id, int(a.residue.id), a.name) in observed
                else ["coordinates"],
            )
            for i, a in enumerate(atoms)
        ],
        bonds=[
            Bond(id=i + 1, atom_1_id=atom_ids[a], atom_2_id=atom_ids[b], order=None)
            for i, (a, b) in enumerate(fixer.topology.bonds())
        ],
        conformers=[Conformer(id=1, name="Explicit offline prepared model", coordinates=coords)],
        inferences=[
            InferenceRecord(
                code="offline_benchmark_preparation",
                message=(
                    "PDBFixer reconstructed all missing SEQRES residues/atoms, "
                    "terminal states and explicit H at pH7; no solvent or ions. "
                    "Not experimental protonation/pose certification."
                ),
            )
        ],
    )
    protein = protein.model_copy(update={"annotations": [ordinary_generated(protein.atoms)]})
    (output / "1stp-protein.normalized.json").write_bytes(protein.to_bytes())

    block = gemmi.cif.read(str(output / "BTN.cif")).sole_block()
    rows = block.find(
        "_chem_comp_atom.", ["atom_id", "type_symbol", "charge", "pdbx_stereo_config"]
    )
    heavy = [list(r) for r in rows if r[1] != "H"]
    positions = {
        line[12:16].strip(): tuple(float(line[i : i + 8]) for i in (30, 38, 46))
        for line in raw.read_text().splitlines()
        if line.startswith("HETATM") and line[17:20] == "BTN"
    }
    molecule: Any = Chem.RWMol()
    indices = {}
    for name, element, charge, _ in heavy:
        atom = Chem.Atom(element)
        atom.SetFormalCharge(int(charge))
        indices[name] = molecule.AddAtom(atom)
    for a, b, order in block.find("_chem_comp_bond.", ["atom_id_1", "atom_id_2", "value_order"]):
        if a in indices and b in indices:
            molecule.AddBond(
                indices[a],
                indices[b],
                {"SING": Chem.BondType.SINGLE, "DOUB": Chem.BondType.DOUBLE}[order],
            )
    ligand = molecule.GetMol()
    Chem.SanitizeMol(ligand)
    conformer = Chem.Conformer(len(heavy))
    conformer.Set3D(True)
    for name, i in indices.items():
        conformer.SetAtomPosition(i, positions[name])
    ligand.AddConformer(conformer)
    Chem.AssignStereochemistryFrom3D(ligand)
    Chem.AssignStereochemistry(ligand, force=True, cleanIt=True)
    for name, _, _, stereo in heavy:
        if stereo in {"R", "S"}:
            assert ligand.GetAtomWithIdx(indices[name]).GetProp("_CIPCode") == stereo
    ligand = Chem.AddHs(ligand, addCoords=True)
    normalized = mol_to_normalized(
        ligand,
        filename="1stp-biotin-neutral.mol",
        format_name="mol",
        metadata={
            "chemical_assignment": (
                "RCSB CCD BTN neutral acid; explicit benchmark microstate, not pH prediction"
            )
        },
    )
    (output / "1stp-biotin.normalized.json").write_bytes(normalized.to_bytes())
    evidence = {
        "raw_sha256": hashlib.sha256(raw.read_bytes()).hexdigest(),
        "ccd_url": "https://files.rcsb.org/ligands/download/BTN.cif",
        "ccd_sha256": hashlib.sha256((output / "BTN.cif").read_bytes()).hexdigest(),
        "protein_atoms": len(protein.atoms),
        "protein_residues": 159,
        "observed_heavy_exact": kept,
        "missing_residues_modeled": missing_residues,
        "missing_atoms_modeled": missing_atoms,
        "protein_ph": 7.0,
        "modeled_terminal_stereo_repair": stereo_repairs,
        "ligand_formal_charge": 0,
        "ligand_atoms": len(normalized.atoms),
        "waters_ions": "excluded explicitly; no implicit solvent",
        "limitations": [
            "Missing terminal residues and H are modeled, not experimental coordinates",
            "Neutral acid is an explicit CCD benchmark microstate; "
            "no physiological protonation claim",
            "Full159-residue chain retained; no distance crop/caps",
        ],
    }
    (output / "1stp-preparation.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n"
    )
    print(json.dumps(evidence, indent=2), flush=True)


if __name__ == "__main__":
    main()
