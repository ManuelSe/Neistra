"""Bounded temporary ligand interpretation; failed drafts remain explicit repair models."""

from __future__ import annotations

from typing import Any

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem, rdDetermineBonds
from scipy.spatial import cKDTree  # type: ignore[import-untyped]

from molweave_core.adapters.rdkit_common import normalized_to_mol
from molweave_core.hydrogen_protection import protection_facts
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.quick_protein import cap_boundaries
from molweave_core.molecular import NormalizedStructureV1

all_chem: Any = AllChem


def interpret(
    source: NormalizedStructureV1,
    projected: NormalizedStructureV1,
    members: set[int],
    protein: set[int],
    allow_repair: bool,
) -> tuple[Any, str, int, list[str]]:
    mol = normalized_to_mol(projected)
    assumptions = []
    facts = protection_facts(source)
    for atom, native in zip(projected.atoms, mol.GetAtoms(), strict=True):
        fact = facts.get(atom.id)
        if fact and fact.matches(atom):
            if fact.isotope is not None:
                native.SetIsotope(fact.isotope)
            if fact.radical_electrons is not None:
                native.SetNumRadicalElectrons(fact.radical_electrons)
    original = Chem.Mol(mol)
    cap_count = 0
    try:
        if cKDTree(np.asarray(projected.active_coordinates)).query_pairs(1e-6):
            raise ValueError("Coincident sites require geometric repair")
        if any(b.order is None for b in projected.bonds):
            if members & protein:
                raise ValueError("Unresolved bonds in an observed protein fragment")
            # DetermineBondOrders changes orders/charges only; connectivity is retained.
            charge = sum(a.formal_charge or 0 for a in projected.atoms)
            rdDetermineBonds.DetermineBondOrders(
                mol, charge=charge, embedChiral=False, maxIterations=10000
            )
            for i, atom in enumerate(projected.atoms):
                if (
                    atom.formal_charge is not None
                    and mol.GetAtomWithIdx(i).GetFormalCharge() != atom.formal_charge
                ):
                    raise ValueError("Perception conflicts with an assigned formal charge")
            index = {a.id: i for i, a in enumerate(projected.atoms)}
            for bond in projected.bonds:
                perceived = mol.GetBondBetweenAtoms(index[bond.atom_1_id], index[bond.atom_2_id])
                if bond.order is not None and perceived.GetBondTypeAsDouble() != bond.order:
                    raise ValueError("Perception conflicts with an assigned bond order")
            if mol.GetNumBonds() != len(projected.bonds):
                raise ValueError("Perception changed connectivity")
            assumptions.append(
                "Bounded bond-order perception on unchanged connectivity; "
                f"temporary net charge {charge} (unknown atom charges use a neutral attempt)"
            )
        elif any(a.formal_charge is None for a in projected.atoms):
            assumptions.append(
                "Unknown formal charges use temporary neutral values; no protonation enumeration"
            )
        mol, cap_count = cap_boundaries(mol, source, members, protein)
        Chem.SanitizeMol(mol)
        before = mol.GetNumAtoms()
        mol = Chem.AddHs(mol, addCoords=True)
        if mol.GetNumAtoms() > before:
            assumptions.append(f"Added {mol.GetNumAtoms() - before} calculation-only hydrogens")
        if any(a.GetNumRadicalElectrons() for a in mol.GetAtoms()):
            raise ValueError("Radical force-field coverage is not established")
        if all_chem.MMFFHasAllMoleculeParams(mol):
            return mol, "MMFF94", cap_count, assumptions
        if all_chem.UFFHasAllMoleculeParams(mol):
            assumptions.append(
                "MMFF94 parameters unavailable; UFF omits electrostatic interactions"
            )
            return mol, "UFF", cap_count, assumptions
        raise ValueError("Native MMFF94/UFF parameters unavailable")
    except (ValueError, RuntimeError) as error:
        if not allow_repair:
            raise CalculationError(
                "chemistry_unresolved", f"Quick chemistry requires approximate repair: {error}"
            ) from error
        # Use exactly the observed source graph in repair, including stale aromatic flags.
        original.UpdatePropertyCache(strict=False)
        Chem.GetSymmSSSR(original)
        assumptions.append(
            f"Approximate repair: {error}; no force-field/protonation or metal coordination claim"
        )
        if any(b.order is None for b in projected.bonds):
            assumptions.append("Unknown bonds use single-like covalent-radius repair lengths")
        return original, "repair", 0, assumptions
