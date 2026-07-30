from __future__ import annotations

from pathlib import Path
from typing import Any

from rdkit import Chem

from molweave_core.molecular import (
    Atom,
    Bond,
    Chain,
    Conformer,
    InferenceRecord,
    MolecularWarning,
    NormalizedStructureV1,
    Residue,
    SourceFacts,
)


def mol_to_normalized(
    mol: Any,
    *,
    filename: str,
    format_name: str,
    record_index: int = 0,
    title: str | None = None,
    inferences: list[InferenceRecord] | None = None,
    warnings: list[MolecularWarning] | None = None,
    inferred_bonds: bool = False,
    unknown_bond_orders: bool = False,
    metadata: dict[str, Any] | None = None,
) -> NormalizedStructureV1:
    structure_warnings = list(warnings or [])
    residue_keys: dict[tuple[str, int, str, str], int] = {}
    chain_ids: dict[str, int] = {}
    chains: list[Chain] = []
    residues: list[Residue] = []

    def residue_for(atom: Any) -> int:
        info = atom.GetPDBResidueInfo()
        if info is None:
            chain_name, number, insertion_code, residue_name = "", 1, "", "LIG"
        else:
            chain_name = info.GetChainId().strip()
            number = int(info.GetResidueNumber())
            insertion_code = info.GetInsertionCode().strip()
            residue_name = info.GetResidueName().strip() or "LIG"
        if chain_name not in chain_ids:
            chain_id = len(chain_ids) + 1
            chain_ids[chain_name] = chain_id
            chains.append(Chain(id=chain_id, name=chain_name, entity_type="non-polymer"))
        key = (chain_name, number, insertion_code, residue_name)
        if key not in residue_keys:
            residue_id = len(residue_keys) + 1
            residue_keys[key] = residue_id
            residues.append(
                Residue(
                    id=residue_id,
                    chain_id=chain_ids[chain_name],
                    name=residue_name,
                    author_number=number,
                    label_number=number,
                    insertion_code=insertion_code or None,
                    component_type="ligand",
                )
            )
        return residue_keys[key]

    conformers: list[Conformer] = []
    if mol.GetNumConformers():
        for conformer_index, rd_conformer in enumerate(mol.GetConformers(), start=1):
            coordinates = [
                (
                    float(rd_conformer.GetAtomPosition(index).x),
                    float(rd_conformer.GetAtomPosition(index).y),
                    float(rd_conformer.GetAtomPosition(index).z),
                )
                for index in range(mol.GetNumAtoms())
            ]
            conformers.append(
                Conformer(
                    id=conformer_index, name=f"Conformer {conformer_index}", coordinates=coordinates
                )
            )
    else:
        coordinates = [(0.0, 0.0, 0.0)] * mol.GetNumAtoms()
        conformers.append(Conformer(id=1, name="Missing coordinates", coordinates=coordinates))
        structure_warnings.append(
            MolecularWarning(
                code="missing_coordinates",
                message=(
                    "The source contains no coordinates; zero coordinates were "
                    "retained explicitly."
                ),
                operation="import",
                field="coordinates",
            )
        )

    active_coordinates = conformers[0].coordinates
    atoms: list[Atom] = []
    for index, rd_atom in enumerate(mol.GetAtoms()):
        info = rd_atom.GetPDBResidueInfo()
        atom_name = (
            info.GetName().strip()
            if info is not None and info.GetName().strip()
            else f"{rd_atom.GetSymbol()}{index + 1}"
        )
        atoms.append(
            Atom(
                id=index + 1,
                name=atom_name,
                element=rd_atom.GetSymbol(),
                coordinates=active_coordinates[index],
                residue_id=residue_for(rd_atom),
                formal_charge=int(rd_atom.GetFormalCharge()),
                source_index=index,
                alternate_location=(info.GetAltLoc().strip() or None if info is not None else None),
                occupancy=float(info.GetOccupancy()) if info is not None else None,
                b_factor=float(info.GetTempFactor()) if info is not None else None,
                inferred_fields=[],
            )
        )

    bonds = [
        Bond(
            id=index + 1,
            atom_1_id=int(rd_bond.GetBeginAtomIdx()) + 1,
            atom_2_id=int(rd_bond.GetEndAtomIdx()) + 1,
            order=None if unknown_bond_orders else float(rd_bond.GetBondTypeAsDouble()),
            aromatic=bool(rd_bond.GetIsAromatic()),
            stereo=str(rd_bond.GetStereo()).removeprefix("STEREO") or None,
            inferred=inferred_bonds,
        )
        for index, rd_bond in enumerate(mol.GetBonds())
    ]

    properties = {
        key: mol.GetProp(key)
        for key in mol.GetPropNames(includePrivate=False, includeComputed=False)
    }
    molecule_title = title or (
        mol.GetProp("_Name").strip()
        if mol.HasProp("_Name") and mol.GetProp("_Name").strip()
        else f"{Path(filename).stem} {record_index + 1}"
        if record_index
        else Path(filename).stem
    )
    structure_metadata = dict(metadata or {})
    if properties:
        structure_metadata["properties"] = properties
    structure_metadata["canonical_smiles"] = Chem.MolToSmiles(mol, isomericSmiles=True)

    return NormalizedStructureV1(
        title=molecule_title,
        structure_type="ligand",
        source=SourceFacts(
            filename=filename,
            format=format_name,
            record_index=record_index,
            model_count=len(conformers),
        ),
        chains=chains,
        residues=residues,
        atoms=atoms,
        bonds=bonds,
        conformers=conformers,
        metadata=structure_metadata,
        warnings=structure_warnings,
        inferences=inferences or [],
    )


def normalized_to_mol(structure: NormalizedStructureV1) -> Any:
    editable = Chem.RWMol()
    residue_by_id = {residue.id: residue for residue in structure.residues}
    chain_by_id = {chain.id: chain for chain in structure.chains}
    atom_indices: dict[int, int] = {}
    aromatic_atom_ids: set[int] = set()
    for bond in structure.bonds:
        if bond.aromatic:
            aromatic_atom_ids.update((bond.atom_1_id, bond.atom_2_id))

    for atom in structure.atoms:
        rd_atom = Chem.Atom(atom.element)
        rd_atom.SetFormalCharge(atom.formal_charge or 0)
        rd_atom.SetIsAromatic(atom.id in aromatic_atom_ids)
        if atom.residue_id is not None and atom.residue_id in residue_by_id:
            residue = residue_by_id[atom.residue_id]
            chain = chain_by_id.get(residue.chain_id)
            info = Chem.AtomPDBResidueInfo()
            info.SetName(atom.name[:4].rjust(4))
            info.SetResidueName(residue.name[:3].rjust(3))
            info.SetResidueNumber(residue.author_number or residue.label_number or residue.id)
            info.SetChainId((chain.name if chain else "")[:1])
            info.SetInsertionCode((residue.insertion_code or "")[:1])
            info.SetAltLoc((atom.alternate_location or "")[:1])
            info.SetOccupancy(atom.occupancy if atom.occupancy is not None else 1.0)
            info.SetTempFactor(atom.b_factor or 0.0)
            rd_atom.SetMonomerInfo(info)
        atom_indices[atom.id] = int(editable.AddAtom(rd_atom))

    bond_type_by_order = {
        1.0: Chem.BondType.SINGLE,
        1.5: Chem.BondType.AROMATIC,
        2.0: Chem.BondType.DOUBLE,
        3.0: Chem.BondType.TRIPLE,
    }
    for bond in structure.bonds:
        order = 1.5 if bond.aromatic else bond.order or 1.0
        editable.AddBond(
            atom_indices[bond.atom_1_id],
            atom_indices[bond.atom_2_id],
            bond_type_by_order.get(order, Chem.BondType.SINGLE),
        )

    mol = editable.GetMol()
    for conformer in structure.conformers:
        rd_conformer = Chem.Conformer(len(structure.atoms))
        rd_conformer.Set3D(True)
        rd_conformer.SetId(conformer.id - 1)
        for atom_index, coordinates in enumerate(conformer.coordinates):
            rd_conformer.SetAtomPosition(atom_index, coordinates)
        mol.AddConformer(rd_conformer, assignId=True)
    mol.SetProp("_Name", structure.title)
    for key, value in structure.metadata.get("properties", {}).items():
        if isinstance(value, (str, int, float, bool)):
            mol.SetProp(str(key), str(value))
    return mol


def export_loss_warnings(
    structure: NormalizedStructureV1, target_format: str
) -> list[MolecularWarning]:
    warnings: list[MolecularWarning] = []

    def add(code: str, message: str, field: str, *, blocking: bool = False) -> None:
        warnings.append(
            MolecularWarning(
                code=code,
                message=message,
                operation=f"export:{target_format}",
                field=field,
                blocking=blocking,
            )
        )

    has_residue_semantics = any(
        residue.component_type != "ligand"
        or residue.author_number not in (None, 1)
        or residue.insertion_code
        for residue in structure.residues
    )
    has_named_chains = any(chain.name for chain in structure.chains)
    has_metadata = bool(structure.metadata.get("properties"))
    has_charges = any((atom.formal_charge or 0) != 0 for atom in structure.atoms)
    has_known_bond_orders = any(
        bond.order not in (None, 1.0) or bond.aromatic for bond in structure.bonds
    )
    has_stereo = any(bond.stereo for bond in structure.bonds) or bool(
        structure.metadata.get("canonical_smiles")
    )
    multiple_conformers = len(structure.conformers) > 1

    if target_format in {"smiles", "xyz"}:
        add(
            "coordinates_not_preserved",
            "This format does not preserve reusable 3D coordinates.",
            "coordinates",
        )
        add(
            "atom_names_not_preserved",
            "Atom names are not represented by this format.",
            "atom.name",
        )
    if target_format in {"smiles", "xyz", "mol"} and multiple_conformers:
        add(
            "conformers_reduced",
            "Only the active conformer can be represented.",
            "conformers",
            blocking=True,
        )
    if target_format in {"smiles", "xyz", "mol", "mol2"} and has_residue_semantics:
        add(
            "residue_information_lost",
            "Residue numbering, insertion codes, or component types are not fully preserved.",
            "residues",
        )
    if target_format in {"smiles", "xyz", "mol"} and has_named_chains:
        add("chain_information_lost", "Chain identifiers are not preserved.", "chains")
    if target_format in {"smiles", "xyz", "mol", "mol2", "pdb"} and has_metadata:
        add(
            "metadata_reduced",
            "Source properties or metadata are not fully reproduced.",
            "metadata",
        )
    if target_format in {"xyz"} and structure.bonds:
        add(
            "connectivity_lost",
            "XYZ does not encode molecular connectivity.",
            "bonds",
            blocking=True,
        )
    if target_format in {"xyz", "pdb", "mmcif"} and has_known_bond_orders:
        add(
            "bond_orders_lost",
            "Bond orders and aromaticity are not fully represented.",
            "bonds.order",
            blocking=True,
        )
    if target_format in {"xyz"} and has_charges:
        add(
            "formal_charges_lost",
            "Formal charges are not represented.",
            "atoms.formal_charge",
            blocking=True,
        )
    if target_format in {"xyz", "pdb", "mmcif", "mol2"} and has_stereo:
        add(
            "stereochemistry_reduced",
            "Stereochemical annotations may not round-trip through this format.",
            "stereochemistry",
            blocking=True,
        )
    return warnings
