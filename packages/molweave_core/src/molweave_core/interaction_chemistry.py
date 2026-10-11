"""Conservative site typing; supplied molecular data remains immutable."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, cast

from rdkit import Chem, RDConfig
from rdkit.Chem import ChemicalFeatures

from molweave_core.adapters.rdkit_common import normalized_to_mol
from molweave_core.interactions import AnalysisInput, InteractionWarning, Site, _template_bonds

# Explicit site registry. Backbone amide N is never an acceptor; proline N is
# not a donor. Histidine requires observed tautomer evidence, not assumed charge.
SIDE_DONORS = {
    "ARG": {"NE", "NH1", "NH2"},
    "ASN": {"ND2"},
    "GLN": {"NE2"},
    "LYS": {"NZ"},
    "SER": {"OG"},
    "THR": {"OG1"},
    "TYR": {"OH"},
    "TRP": {"NE1"},
    "CYS": {"SG"},
    "HIS": {"ND1", "NE2"},
}
SIDE_ACCEPTORS = {
    "ASN": {"OD1"},
    "GLN": {"OE1"},
    "ASP": {"OD1", "OD2"},
    "GLU": {"OE1", "OE2"},
    "SER": {"OG"},
    "THR": {"OG1"},
    "TYR": {"OH"},
    "MET": {"SD"},
    "CYS": {"SG"},
    "HIS": {"ND1", "NE2"},
}


@dataclass
class Chemistry:
    typed: set[int] = field(default_factory=set)
    donors: dict[int, list[int]] = field(default_factory=dict)
    acceptors: set[int] = field(default_factory=set)
    hydrophobic: set[int] = field(default_factory=set)
    validated_molecules: list[tuple[Any, list[int]]] = field(default_factory=list)
    protein_residues: list[tuple[str, str, dict[str, int]]] = field(default_factory=list)
    missing_hydrogens: set[int] = field(default_factory=set)


def type_sites(
    inputs: list[AnalysisInput], sites: list[Site], warnings: list[InteractionWarning]
) -> Chemistry:
    chemistry = Chemistry()
    indices = {
        (site.reference.structure_id, site.atom.id): index for index, site in enumerate(sites)
    }
    templates = _template_bonds()
    factory = cast(Any, ChemicalFeatures).BuildFeatureFactory(
        f"{RDConfig.RDDataDir}/BaseFeatures.fdef"
    )
    for source in inputs:
        structure, entry = source.structure, source.identity.entry_id
        residue_atoms: dict[int | None, list[int]] = defaultdict(list)
        for atom in structure.atoms:
            index = indices.get((entry, atom.id))
            if index is not None:
                residue_atoms[atom.residue_id].append(index)
        templated: set[int] = set()
        for residue in structure.residues:
            members = residue_atoms.get(residue.id, [])
            if not members:
                continue
            names = {sites[index].atom.name: index for index in members}
            if residue.component_type == "water":
                oxygen = [index for index in members if sites[index].atom.element == "O"]
                if len(oxygen) == 1 and all(
                    sites[index].atom.element in {"H", "O"} for index in members
                ):
                    chemistry.typed.update(members)
                    chemistry.acceptors.update(oxygen)
                    templated.update(members)
                continue
            if residue.component_type != "polymer" or residue.name not in templates:
                continue
            expected = defaultdict(set)
            for first, second in templates[residue.name]:
                if first.startswith(("-", "+")) or second.startswith(("-", "+")):
                    continue
                expected[first].add(second)
                expected[second].add(first)
            valid: dict[str, int] = {}
            for name, index in names.items():
                if name not in expected:
                    continue
                atom = sites[index].atom
                # Missing heavy neighbors prevent defensible chemistry assignment.
                required = {
                    neighbor
                    for neighbor in expected[name]
                    if not neighbor.startswith("H") and neighbor != "OXT"
                }
                expected_element = "H" if name.startswith("H") else name[0]
                neighbors = sites[index].neighbors
                conflicts = any(
                    sites[neighbor].reference.structure_id == entry
                    and sites[neighbor].atom.residue_id == residue.id
                    and sites[neighbor].atom.name not in expected[name]
                    for neighbor in neighbors
                )
                if (
                    name not in expected
                    or atom.element != expected_element
                    or not required.issubset(names)
                    or conflicts
                ):
                    continue
                valid[name] = index
                chemistry.typed.add(index)
                templated.add(index)
                if name == "O" or name in SIDE_ACCEPTORS.get(residue.name, set()):
                    if (atom.formal_charge or 0) <= 0:
                        # Protonated histidine N and carboxylic OH are not acceptors.
                        has_h = any(sites[neighbor].atom.element == "H" for neighbor in neighbors)
                        if not (has_h and residue.name in {"HIS", "ASP", "GLU"}):
                            chemistry.acceptors.add(index)
            chemistry.protein_residues.append((entry, residue.name, valid))
            missing = [sites[index].atom.id for index in members if index not in templated]
            if missing:
                warnings.append(
                    InteractionWarning(
                        entry_id=entry,
                        code="incomplete_template_sites",
                        message=(
                            f"{residue.name} has incomplete or contradictory observed sites; "
                            "affected typing is skipped."
                        ),
                        atom_ids=missing,
                    )
                )
            for name, index in valid.items():
                if name in SIDE_DONORS.get(residue.name, set()) or (
                    name == "N" and residue.name != "PRO"
                ):
                    hydrogens = [
                        neighbor
                        for neighbor in sites[index].neighbors
                        if sites[neighbor].atom.element == "H" and neighbor in chemistry.typed
                    ]
                    if hydrogens:
                        chemistry.donors[index] = sorted(hydrogens)
                    else:
                        chemistry.missing_hydrogens.add(index)
        # Each supplied connected graph is validated independently: unknown protein
        # bond orders cannot poison or silently supply defaults for a typed ligand.
        protein_members = {
            index
            for residue in structure.residues
            if residue.component_type == "polymer"
            for index in residue_atoms.get(residue.id, [])
        }
        pending = (
            {index for (owner, _), index in indices.items() if owner == entry}
            - templated
            - protein_members
        )
        while pending:
            first_index = min(pending)
            component, frontier = {first_index}, {first_index}
            while frontier:
                frontier = {
                    neighbor for index in frontier for neighbor in sites[index].neighbors
                } - component
                component.update(frontier)
            pending.difference_update(component)
            if component & templated:
                continue
            ids = {sites[index].atom.id for index in component}
            atoms = [atom for atom in structure.atoms if atom.id in ids]
            bonds = [
                bond for bond in structure.bonds if bond.atom_1_id in ids and bond.atom_2_id in ids
            ]
            if any(atom.formal_charge is None for atom in atoms) or any(
                bond.order not in {1, 1.5, 2, 3} and not bond.aromatic for bond in bonds
            ):
                warnings.append(
                    InteractionWarning(
                        entry_id=entry,
                        code="unknown_chemistry",
                        message=(
                            "Unassigned bond orders or formal charges prevent interaction "
                            "typing. Prepare the structure; raw PDB/mmCIF ligands are not "
                            "assigned from names or distances."
                        ),
                        atom_ids=sorted(ids),
                    )
                )
                continue
            positions = [i for i, atom in enumerate(structure.atoms) if atom.id in ids]
            subset = structure.model_copy(
                update={
                    "atoms": atoms,
                    "bonds": bonds,
                    "conformers": [
                        conformer.model_copy(
                            update={"coordinates": [conformer.coordinates[i] for i in positions]}
                        )
                        for conformer in structure.conformers
                    ],
                }
            )
            try:
                mol = normalized_to_mol(subset)
                Chem.SanitizeMol(mol)
                mapped = [indices[(entry, atom.id)] for atom in atoms]
                chemistry.typed.update(mapped)
                chemistry.validated_molecules.append((mol, mapped))
                for feature in factory.GetFeaturesForMol(mol):
                    if feature.GetFamily() == "Acceptor":
                        chemistry.acceptors.update(mapped[i] for i in feature.GetAtomIds())
                    elif feature.GetFamily() == "Donor":
                        for i in feature.GetAtomIds():
                            donor = mapped[i]
                            hydrogens = [
                                neighbor
                                for neighbor in sites[donor].neighbors
                                if sites[neighbor].atom.element == "H"
                            ]
                            if hydrogens:
                                chemistry.donors[donor] = sorted(hydrogens)
                            else:
                                chemistry.missing_hydrogens.add(donor)
            except (ValueError, RuntimeError):
                warnings.append(
                    InteractionWarning(
                        entry_id=entry,
                        code="invalid_chemistry",
                        message=(
                            "Supplied molecular chemistry fails RDKit validation; affected "
                            "sites are skipped."
                        ),
                        atom_ids=sorted(ids),
                    )
                )
        for index in chemistry.typed:
            site = sites[index]
            if site.reference.structure_id != entry:
                continue
            if (
                site.atom.element == "C"
                and (site.atom.formal_charge or 0) == 0
                and site.neighbors
                and all(
                    sites[neighbor].atom.element in {"C", "H"} and neighbor in chemistry.typed
                    for neighbor in site.neighbors
                )
            ):
                chemistry.hydrophobic.add(index)
        # Explicitly connected water hydrogens are the only water donor evidence.
        for index in chemistry.acceptors:
            if sites[index].reference.structure_id != entry:
                continue
            water_residue = next(
                (r for r in structure.residues if r.id == sites[index].atom.residue_id), None
            )
            if water_residue and water_residue.component_type == "water":
                hydrogens = [
                    neighbor
                    for neighbor in sites[index].neighbors
                    if sites[neighbor].atom.element == "H"
                ]
                if hydrogens:
                    chemistry.donors[index] = sorted(hydrogens)
                else:
                    chemistry.missing_hydrogens.add(index)
        if any(
            sites[index].reference.structure_id == entry for index in chemistry.missing_hydrogens
        ):
            warnings.append(
                InteractionWarning(
                    entry_id=entry,
                    code="explicit_hydrogens_required",
                    message=(
                        "Some donors lack explicit hydrogens: hydrogen bonds require supplied "
                        "explicit H atoms. Use existing hydrogen preparation tools."
                    ),
                )
            )
    return chemistry
