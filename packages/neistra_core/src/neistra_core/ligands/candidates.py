"""Exact canonical instance inventory, separate from depiction chemistry."""

from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from typing import Any

from rdkit import Chem

from neistra_core.components import ION_ELEMENTS, POLYMER_CATEGORIES, derive_component_hierarchy
from neistra_core.ligands.chemistry import PreparedLigandChemistry, prepare_chemistry
from neistra_core.ligands.models import (
    RESOLVER_VERSION,
    LigandCandidateV1,
    LigandInventoryV1,
    LigandLocationV1,
)
from neistra_core.ligands.source_evidence import (
    KNOWN_ENTITY_TYPES,
    SOURCE_EVIDENCE_KEY,
    assess_mmcif_source,
    known_covalent_bond_ids,
)
from neistra_core.molecular import Atom, NormalizedStructureV1

_SMALL_FORMATS = {"mol", "sdf", "mol2", "smiles", "smi"}
_MACRO_FORMATS = {"pdb", "mmcif", "cif"}
_ATOMIC_NUMBERS = {
    Chem.GetPeriodicTable().GetElementSymbol(number): number for number in range(1, 119)
}
# Counting aliases only; source isotope and representation facts stay intact.
_ATOMIC_NUMBERS.update({"D": 1, "T": 1})


def _hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _neutral_water(molecule: Any, formal_charge: int | None) -> bool:
    """Count physical elements without discarding source isotope information."""
    if formal_charge != 0:
        return False
    composition = Counter(int(atom.GetAtomicNum()) for atom in molecule.GetAtoms())
    composition[1] += sum(
        atom.GetNumExplicitHs() + atom.GetNumImplicitHs() for atom in molecule.GetAtoms()
    )
    return composition == {8: 1, 1: 2}


def _known_heavy_count(atoms: list[Atom]) -> int | None:
    count = 0
    for atom in atoms:
        number = _ATOMIC_NUMBERS.get(atom.element)
        if number is None:
            return None
        count += int(number > 1)
    return count


def resolve_candidates(
    structure: NormalizedStructureV1,
    *,
    original_bytes: bytes | None = None,
) -> LigandInventoryV1:
    atoms = {atom.id: atom for atom in structure.atoms}
    residues = {residue.id: residue for residue in structure.residues}
    chains = {chain.id: chain for chain in structure.chains}
    hierarchy = derive_component_hierarchy(structure)
    components = {component.id: component for component in hierarchy.components}
    by_residue = {
        residue_id: component.id
        for component in hierarchy.components
        for residue_id in component.residue_ids
    }
    by_atom = {
        atom_id: component.id
        for component in hierarchy.components
        for atom_id in component.atom_ids
    }
    membership = {
        atom.id: by_atom.get(atom.id) or by_residue.get(atom.residue_id or -1)
        for atom in structure.atoms
    }
    format_name = structure.source.format.lower()
    input_hash = _hash(
        {
            "resolver": RESOLVER_VERSION,
            "format": format_name,
            "original_sha256": hashlib.sha256(original_bytes).hexdigest()
            if original_bytes is not None
            else None,
            "atoms": [
                a.model_dump(exclude={"coordinates", "name", "occupancy", "b_factor"})
                for a in structure.atoms
            ],
            "bonds": [bond.model_dump() for bond in structure.bonds],
            "residues": [residue.model_dump() for residue in structure.residues],
            "facts": structure.source.facts,
            "annotations": structure.annotations,
        }
    )
    groups: dict[str, list[int]] = defaultdict(list)
    if format_name in _SMALL_FORMATS:
        parent = {atom_id: atom_id for atom_id in atoms}

        def root(atom_id: int) -> int:
            while parent[atom_id] != atom_id:
                parent[atom_id] = parent[parent[atom_id]]
                atom_id = parent[atom_id]
            return atom_id

        for bond in structure.bonds:
            first, second = root(bond.atom_1_id), root(bond.atom_2_id)
            parent[max(first, second)] = min(first, second)
        for atom_id in atoms:
            groups[f"graph:{root(atom_id)}"].append(atom_id)
    else:
        for atom_id in atoms:
            groups[membership[atom_id] or f"unassigned:{atom_id}"].append(atom_id)
    source_inventory = assess_mmcif_source(structure, original_bytes)
    qualified_residues = source_inventory.nonpolymer_residues
    atom_group = {atom_id: key for key, ids in groups.items() for atom_id in ids}
    crossing = {
        atom_group[endpoint]
        for bond in structure.bonds
        if atom_group[bond.atom_1_id] != atom_group[bond.atom_2_id]
        for endpoint in (bond.atom_1_id, bond.atom_2_id)
    }
    # Deliberately authored H-parent edges establish current membership even
    # though their placement/chemistry remains disclosed as inferred. This is
    # distinct from distance-inferred whole-molecule connectivity.
    known_edges = known_covalent_bond_ids(structure)
    authored_h_bonds = {
        bond.id for bond in structure.bonds if bond.inferred and bond.id in known_edges
    }
    inferred_groups = {
        atom_group[bond.atom_1_id]
        for bond in structure.bonds
        if bond.inferred and bond.id not in authored_h_bonds
    }
    authored_h_groups = {
        atom_group[bond.atom_1_id] for bond in structure.bonds if bond.id in authored_h_bonds
    }
    candidates = []
    prepared_chemistry: PreparedLigandChemistry | None = None
    for group_key, ids in groups.items():
        ids.sort()
        group_atoms = [atoms[atom_id] for atom_id in ids]
        residue_ids = sorted({a.residue_id for a in group_atoms if a.residue_id in residues})
        component_ids = sorted({key for atom_id in ids if (key := membership[atom_id])})
        group_components = [components[key] for key in component_ids]
        categories = {component.category for component in group_components}
        original_nonpolymer = bool(residue_ids) and all(
            residue_id in qualified_residues for residue_id in residue_ids
        )
        source_kinds = {
            source_inventory.residues[identity][2]
            for identity in residue_ids
            if identity in source_inventory.residues
        }
        polymer = "polymer" in source_kinds or (
            not source_kinds
            and not original_nonpolymer
            and (
                bool(categories & POLYMER_CATEGORIES)
                or any(
                    residues[residue_id].component_type == "polymer" for residue_id in residue_ids
                )
            )
        )
        branched = "branched" in source_kinds or (
            not source_kinds
            and any(
                residues[residue_id].source_entity_type == "branched" for residue_id in residue_ids
            )
        )
        locations = [
            LigandLocationV1(
                residue_id=residue.id,
                residue_name=residue.name,
                chain_id=residue.chain_id,
                chain_name=chains[residue.chain_id].name if residue.chain_id in chains else None,
                author_number=residue.author_number,
                insertion_code=residue.insertion_code,
                source_entity_id=residue.source_entity_id,
                source_asym_id=residue.source_subchain_id,
            )
            for residue in (residues[residue_id] for residue_id in residue_ids)
        ]
        label = " / ".join(component.display_label for component in group_components) or (
            f"Atoms {ids[0]}-{ids[-1]}"
        )
        reasons: list[str] = []
        status = "qualified" if format_name in _SMALL_FORMATS else "source_instance"
        potential = not polymer
        if any(a.alternate_location for a in group_atoms):
            status, reasons = "unsupported", ["alternate_sites_unresolved"]
        elif source_inventory.status == "unsupported":
            status, reasons, potential = (
                "unsupported",
                [source_inventory.reason or "original_mmcif_inventory_inconsistent"],
                True,
            )
        elif source_kinds - KNOWN_ENTITY_TYPES:
            status, reasons, potential = "unsupported", ["source_entity_type_unsupported"], True
        elif polymer:
            status, reasons = "unsupported", ["polymer_boundary_unsupported"]
        elif branched:
            status, reasons = "unsupported", ["branched_boundary_unsupported"]
        elif group_key in crossing:
            status, reasons = "unsupported", ["cross_boundary_link_unqualified"]
        elif format_name in _SMALL_FORMATS:
            if group_key in inferred_groups:
                status, reasons = "unsupported", ["connectivity_inferred"]
        elif format_name in _MACRO_FORMATS:
            if (
                len(residue_ids) != 1
                or not group_components
                or any(c.classification_status != "assigned" for c in group_components)
            ):
                status, reasons = "unsupported", ["source_boundary_unresolved"]
            elif residue_ids[0] in qualified_residues:
                status = "qualified"
            else:
                reasons = ["source_instance_requires_deliberate_choice"]
        else:
            status, reasons = "unsupported", ["molecular_boundary_not_qualified"]
        elements = [atom.element for atom in group_atoms]
        water_like = len(ids) <= 3 and elements.count("O") == 1 \
            and set(elements) <= {"O", "H", "D"}
        source_assigned_water = source_kinds == {"water"} or (
            format_name == "pdb" and categories == {"water"}
        )
        is_water = False
        if water_like or source_assigned_water or categories == {"water"}:
            if prepared_chemistry is None:
                prepared_chemistry = prepare_chemistry(structure, original_bytes=original_bytes)
            chemistry = prepared_chemistry.qualify(ids)
            if chemistry.status == "qualified":
                is_water = _neutral_water(chemistry.molecule, chemistry.formal_charge)
                if not is_water and source_assigned_water and status == "qualified":
                    status, reasons = "source_instance", ["source_water_identity_changed"]
            else:
                # Source-assigned water may lack complete H/charge evidence.
                # Keep that boundary fact separate from qualified chemistry;
                # labels alone cannot defeat raw nonpolymer ownership.
                is_water = source_assigned_water and water_like and all(
                    atom.formal_charge in {None, 0} for atom in group_atoms
                )
            if not is_water and chemistry.status != "qualified" and status == "qualified" \
                    and (water_like or source_assigned_water):
                status, reasons = "source_instance", ["water_identity_unresolved"]
        known_source_ion = (
            len(ids) == 1
            and group_atoms[0].element.upper() in ION_ELEMENTS
            and (
                (group_atoms[0].formal_charge is not None and group_atoms[0].formal_charge != 0)
                or (format_name in _MACRO_FORMATS and categories == {"ion"})
            )
        )
        is_ion = False
        if len(ids) == 1 and (known_source_ion or group_atoms[0].formal_charge not in {None, 0}):
            if prepared_chemistry is None:
                prepared_chemistry = prepare_chemistry(structure, original_bytes=original_bytes)
            chemistry = prepared_chemistry.qualify(ids)
            if chemistry.status == "qualified":
                molecule = chemistry.molecule
                physical_atoms = molecule.GetNumAtoms() + sum(
                    atom.GetNumExplicitHs() + atom.GetNumImplicitHs()
                    for atom in molecule.GetAtoms()
                )
                is_ion = physical_atoms == 1 and chemistry.formal_charge not in {None, 0}
            else:
                is_ion = known_source_ion
                if not is_ion and status == "qualified":
                    status, reasons = "source_instance", ["monoatomic_ion_identity_unresolved"]
        if is_water or is_ion:
            status, reasons, potential = (
                "ineligible",
                ["water" if is_water else "monoatomic_ion"],
                False,
            )
        candidates.append(
            LigandCandidateV1(
                candidate_key=_hash([RESOLVER_VERSION, input_hash, ids]),
                atom_ids=ids,
                residue_ids=residue_ids,
                component_ids=component_ids,
                label=label,
                locations=locations,
                boundary_status=status,
                reason_codes=reasons,
                potential_ligand=potential,
                provenance=[
                    "source_declared_graph"
                    if format_name in _SMALL_FORMATS
                    else "original_mmcif_inventory"
                    if status == "qualified"
                    else "normalized_source_instance"
                ]
                + (
                    ["original_mmcif_receipt_recovered"]
                    if status == "qualified"
                    and format_name in {"mmcif", "cif"}
                    and SOURCE_EVIDENCE_KEY not in structure.source.facts
                    else []
                )
                + (["authored_hydrogen_connectivity"] if group_key in authored_h_groups else []),
                heavy_atom_count=_known_heavy_count(group_atoms),
                formal_charge=sum(
                    a.formal_charge for a in group_atoms if a.formal_charge is not None
                )
                if all(a.formal_charge is not None for a in group_atoms)
                else None,
            )
        )
    candidates.sort(key=lambda candidate: candidate.atom_ids[0])
    return LigandInventoryV1(input_hash=input_hash, candidates=candidates)
