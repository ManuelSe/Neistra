"""Complete aromatic rings and charge groups for interaction-v1."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from rdkit import Chem

from molweave_core.interaction_chemistry import Chemistry
from molweave_core.interactions import InteractionWarning, Site


@dataclass(frozen=True)
class Ring:
    atoms: list[int]
    center: np.ndarray
    normal: np.ndarray


@dataclass(frozen=True)
class ChargeGroup:
    atoms: list[int]
    charge: int
    center: np.ndarray


PROTEIN_RINGS: dict[str, list[tuple[str, ...]]] = {
    "PHE": [("CG", "CD1", "CE1", "CZ", "CE2", "CD2")],
    "TYR": [("CG", "CD1", "CE1", "CZ", "CE2", "CD2")],
    "HIS": [("CG", "ND1", "CE1", "NE2", "CD2")],
    "TRP": [("CG", "CD1", "NE1", "CE2", "CD2"), ("CD2", "CE2", "CZ2", "CH2", "CZ3", "CE3")],
}


def ring_geometry(atoms: list[int], sites: list[Site]) -> Ring | None:
    points = np.asarray([sites[index].point for index in atoms])
    center = points.mean(axis=0)
    _, singular, vectors = np.linalg.svd(points - center)
    if singular[1] < 1e-6:
        return None
    normal = vectors[-1]
    rms = float(np.sqrt(np.mean(((points - center) @ normal) ** 2)))
    if rms > 0.1 + 1e-9:
        return None
    return Ring(sorted(atoms), center, normal)


def interaction_groups(
    chemistry: Chemistry, sites: list[Site], warnings: list[InteractionWarning]
) -> tuple[list[Ring], list[ChargeGroup]]:
    rings: list[Ring] = []
    charges: list[ChargeGroup] = []

    def add_ring(atoms: list[int]) -> None:
        ring = ring_geometry(atoms, sites)
        if ring is None:
            warnings.append(
                InteractionWarning(
                    entry_id=sites[atoms[0]].reference.structure_id,
                    code="unassessable_aromatic_plane",
                    message=(
                        "Aromatic ring is nonplanar or degenerate; its interactions are skipped."
                    ),
                    atom_ids=[sites[index].atom.id for index in atoms],
                )
            )
        else:
            rings.append(ring)

    def add_charge(atoms: list[int], charge: int) -> None:
        if charge and all(sites[index].radius is not None for index in atoms):
            charges.append(
                ChargeGroup(
                    sorted(atoms), charge, np.mean([sites[index].point for index in atoms], axis=0)
                )
            )

    for mol, mapped in chemistry.validated_molecules:
        assigned: set[int] = set()
        for atom_ring in mol.GetRingInfo().AtomRings():
            if len(atom_ring) in {5, 6} and all(
                mol.GetAtomWithIdx(index).GetIsAromatic() for index in atom_ring
            ):
                add_ring([mapped[index] for index in atom_ring])
                nitrogens = [
                    index for index in atom_ring if mol.GetAtomWithIdx(index).GetSymbol() == "N"
                ]
                charge = sum(mol.GetAtomWithIdx(index).GetFormalCharge() for index in atom_ring)
                if charge > 0 and len(nitrogens) > 1:
                    add_charge([mapped[index] for index in nitrogens], charge)
                    assigned.update(nitrogens)
        # Group resonance-equivalent carboxylate and amidinium/guanidinium atoms.
        for smarts, site_positions in (
            ("[C](=[O])-[O-]", (1, 2)),
            ("[N]-[C](=[N+])-[N]", (0, 2, 3)),
            ("[N]-[C]=[N+]", (0, 2)),
        ):
            pattern = Chem.MolFromSmarts(smarts)
            for match in mol.GetSubstructMatches(pattern):
                positions = [match[position] for position in site_positions]
                if assigned.intersection(positions):
                    continue
                charge = sum(mol.GetAtomWithIdx(index).GetFormalCharge() for index in positions)
                if charge:
                    add_charge([mapped[index] for index in positions], charge)
                    assigned.update(positions)
        for index, mapped_index in enumerate(mapped):
            if index not in assigned:
                add_charge([mapped_index], int(mol.GetAtomWithIdx(index).GetFormalCharge()))
    for entry, name, names in chemistry.protein_residues:
        side_names = set(
            {
                "ASP": ("OD1", "OD2"),
                "GLU": ("OE1", "OE2"),
                "LYS": ("NZ",),
                "ARG": ("NE", "NH1", "NH2"),
                "HIS": ("ND1", "NE2"),
            }.get(name, ())
        )
        for atom_name, index in names.items():
            if atom_name not in side_names:
                add_charge([index], sites[index].atom.formal_charge or 0)
        for ring_names in PROTEIN_RINGS.get(name, []):
            if all(atom_name in names for atom_name in ring_names):
                add_ring([names[atom_name] for atom_name in ring_names])
            else:
                warnings.append(
                    InteractionWarning(
                        entry_id=entry,
                        code="incomplete_aromatic_ring",
                        message=(
                            f"{name} aromatic ring has missing or untyped atoms; "
                            "centroid interactions are skipped."
                        ),
                    )
                )
        group_names = {
            "ASP": ("OD1", "OD2"),
            "GLU": ("OE1", "OE2"),
            "LYS": ("NZ",),
            "ARG": ("NE", "NH1", "NH2"),
        }.get(name)
        if group_names is None:
            # Only supplied histidine charge is used; no tautomer/terminal guess.
            if name == "HIS" and {"ND1", "NE2"}.issubset(names):
                members = [names["ND1"], names["NE2"]]
                charge = sum(sites[index].atom.formal_charge or 0 for index in members)
                add_charge(members, charge)
            continue
        if not all(atom_name in names for atom_name in group_names):
            continue
        members = [names[atom_name] for atom_name in group_names]
        explicit = [sites[index].atom.formal_charge for index in members]
        charge = sum(value or 0 for value in explicit)
        hydrogens = [
            neighbor
            for index in members
            for neighbor in sites[index].neighbors
            if sites[neighbor].atom.element == "H"
        ]
        expected = -1 if name in {"ASP", "GLU"} else 1
        # Observed acid H or neutral amine H count conflicts with the convention.
        conflict = (
            (expected < 0 and bool(hydrogens))
            or (name == "LYS" and len(hydrogens) in {1, 2})
            or (name == "ARG" and hydrogens and len(hydrogens) < 5)
        )
        if any(value is not None for value in explicit):
            if charge * expected > 0:
                add_charge(members, charge)
            elif charge:
                warnings.append(
                    InteractionWarning(
                        entry_id=entry,
                        code="contradictory_sidechain_charge",
                        message=(
                            f"Supplied {name} charges conflict with canonical side-chain "
                            "typing; its ionic sites are skipped."
                        ),
                    )
                )
        elif not conflict:
            add_charge(members, expected)
            warnings.append(
                InteractionWarning(
                    entry_id=entry,
                    code="conventional_sidechain_charge",
                    message=(
                        f"{name} side-chain charge {expected:+d} is an analysis-only "
                        "conventional assumption; protonation was not determined."
                    ),
                    atom_ids=[sites[index].atom.id for index in members],
                )
            )
        else:
            warnings.append(
                InteractionWarning(
                    entry_id=entry,
                    code="conflicting_protonation",
                    message=(
                        f"Observed {name} hydrogen evidence prevents "
                        "conventional charge assignment."
                    ),
                    atom_ids=[sites[index].atom.id for index in members],
                )
            )
    # Canonical source/atom ordering makes resonance mapping and ring iteration stable.
    rings.sort(
        key=lambda ring: tuple(
            (sites[index].reference.structure_id, sites[index].atom.id) for index in ring.atoms
        )
    )
    charges.sort(
        key=lambda group: tuple(
            (sites[index].reference.structure_id, sites[index].atom.id) for index in group.atoms
        )
    )
    return rings, charges
