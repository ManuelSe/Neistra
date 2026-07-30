from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from rdkit import Chem
from rdkit.Chem import AllChem, rdDetermineBonds

from molweave_core.adapters.base import (
    AdapterError,
    ExportResult,
    FormatCapabilities,
    ImportOptions,
    ParseResult,
)
from molweave_core.adapters.rdkit_common import (
    export_loss_warnings,
    mol_to_normalized,
    normalized_to_mol,
)
from molweave_core.molecular import InferenceRecord, MolecularWarning, NormalizedStructureV1

all_chem: Any = AllChem


def _decode(data: bytes, filename: str) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise AdapterError(
            "invalid_text_encoding",
            "The structure file must be UTF-8 text.",
            filename=filename,
            operation="import",
        ) from error


def _parse_error(filename: str, format_name: str, record_index: int | None = None) -> AdapterError:
    record_text = f" record {record_index + 1}" if record_index is not None else ""
    return AdapterError(
        "parse_failed",
        (
            f"RDKit could not parse {format_name.upper()}{record_text}; "
            "check syntax, valence, and atom typing."
        ),
        filename=filename,
        operation="import",
        record_index=record_index,
    )


class SdfAdapter:
    capabilities = FormatCapabilities(
        format="sdf",
        label="SDF",
        extensions=("sdf",),
        media_types=("chemical/x-mdl-sdfile",),
        multi_record=True,
    )

    def parse(
        self, data: bytes, filename: str, options: ImportOptions | None = None
    ) -> ParseResult:
        del options
        supplier = Chem.ForwardSDMolSupplier(
            io.BytesIO(data), sanitize=True, removeHs=False, strictParsing=True
        )
        structures: list[NormalizedStructureV1] = []
        for index, mol in enumerate(supplier):
            if mol is None:
                raise _parse_error(filename, "sdf", index)
            structures.append(
                mol_to_normalized(
                    mol,
                    filename=filename,
                    format_name="sdf",
                    record_index=index,
                )
            )
        if not structures:
            raise _parse_error(filename, "sdf")
        return ParseResult(structures=tuple(structures))

    def export(self, structure: NormalizedStructureV1, filename_stem: str) -> ExportResult:
        mol = normalized_to_mol(structure)
        records: list[str] = []
        properties = structure.metadata.get("properties", {})
        for conformer_index in range(mol.GetNumConformers()):
            block = Chem.MolToMolBlock(
                mol,
                confId=conformer_index,
                forceV3000=mol.GetNumAtoms() > 999 or mol.GetNumBonds() > 999,
            )
            property_lines: list[str] = []
            for key, value in sorted(properties.items()):
                if isinstance(value, (str, int, float, bool)):
                    property_lines.extend((f">  <{key}>", str(value), ""))
            records.append(f"{block.rstrip()}\n" + "\n".join(property_lines) + "\n$$$$\n")
        return ExportResult(
            data="".join(records).encode("utf-8"),
            filename=f"{filename_stem}.sdf",
            media_type=self.capabilities.media_types[0],
            warnings=tuple(export_loss_warnings(structure, "sdf")),
        )


class MolAdapter:
    capabilities = FormatCapabilities(
        format="mol",
        label="MDL MOL",
        extensions=("mol",),
        media_types=("chemical/x-mdl-molfile",),
    )

    def parse(
        self, data: bytes, filename: str, options: ImportOptions | None = None
    ) -> ParseResult:
        del options
        mol = Chem.MolFromMolBlock(
            _decode(data, filename), sanitize=True, removeHs=False, strictParsing=True
        )
        if mol is None:
            raise _parse_error(filename, "mol")
        return ParseResult(
            structures=(mol_to_normalized(mol, filename=filename, format_name="mol"),)
        )

    def export(self, structure: NormalizedStructureV1, filename_stem: str) -> ExportResult:
        mol = normalized_to_mol(structure)
        block = Chem.MolToMolBlock(
            mol,
            confId=max(structure.active_conformer_id - 1, 0),
            forceV3000=mol.GetNumAtoms() > 999 or mol.GetNumBonds() > 999,
        )
        return ExportResult(
            data=block.encode("utf-8"),
            filename=f"{filename_stem}.mol",
            media_type=self.capabilities.media_types[0],
            warnings=tuple(export_loss_warnings(structure, "mol")),
        )


class Mol2Adapter:
    capabilities = FormatCapabilities(
        format="mol2",
        label="Tripos MOL2",
        extensions=("mol2",),
        media_types=("chemical/x-mol2",),
    )

    def parse(
        self, data: bytes, filename: str, options: ImportOptions | None = None
    ) -> ParseResult:
        del options
        text = _decode(data, filename)
        mol = Chem.MolFromMol2Block(text, sanitize=True, removeHs=False, cleanupSubstructures=True)
        if mol is None:
            raise _parse_error(filename, "mol2")
        atom_types = _mol2_atom_types(text)
        warnings: list[MolecularWarning] = []
        if len(atom_types) != mol.GetNumAtoms():
            warnings.append(
                MolecularWarning(
                    code="mol2_typing_incomplete",
                    message=(
                        "MOL2 atom types could not be mapped one-to-one and were "
                        "retained only in the original upload."
                    ),
                    operation="import",
                    field="mol2_atom_types",
                )
            )
        structure = mol_to_normalized(
            mol,
            filename=filename,
            format_name="mol2",
            warnings=warnings,
            metadata={"mol2_atom_types": atom_types},
        )
        return ParseResult(structures=(structure,))

    def export(self, structure: NormalizedStructureV1, filename_stem: str) -> ExportResult:
        warnings = export_loss_warnings(structure, "mol2")
        return ExportResult(
            data=_write_mol2(structure).encode("utf-8"),
            filename=f"{filename_stem}.mol2",
            media_type=self.capabilities.media_types[0],
            warnings=tuple(warnings),
        )


class XyzAdapter:
    capabilities = FormatCapabilities(
        format="xyz",
        label="XYZ",
        extensions=("xyz",),
        media_types=("chemical/x-xyz",),
    )

    def parse(
        self, data: bytes, filename: str, options: ImportOptions | None = None
    ) -> ParseResult:
        import_options = options or ImportOptions()
        mol = Chem.MolFromXYZBlock(_decode(data, filename))
        if mol is None:
            raise _parse_error(filename, "xyz")
        warnings: list[MolecularWarning] = []
        inferences: list[InferenceRecord] = []
        inferred_bonds = False
        unknown_orders = False
        if import_options.infer_bonds:
            try:
                rdDetermineBonds.DetermineConnectivity(mol)
                inferred_bonds = True
                unknown_orders = True
                inferences.append(
                    InferenceRecord(
                        code="xyz_connectivity_inferred",
                        message=(
                            "Connectivity was inferred from element covalent radii and distances."
                        ),
                    )
                )
                warnings.append(
                    MolecularWarning(
                        code="xyz_bond_orders_unknown",
                        message=(
                            "XYZ does not contain bond orders; inferred connectivity "
                            "retains unknown order."
                        ),
                        operation="import",
                        field="bonds.order",
                    )
                )
            except (RuntimeError, ValueError):
                warnings.append(
                    MolecularWarning(
                        code="xyz_connectivity_not_inferred",
                        message=(
                            "Connectivity inference failed; atoms and coordinates "
                            "were imported without bonds."
                        ),
                        operation="import",
                        field="bonds",
                    )
                )
        else:
            warnings.append(
                MolecularWarning(
                    code="xyz_connectivity_absent",
                    message="XYZ contains no connectivity and inference was disabled.",
                    operation="import",
                    field="bonds",
                )
            )
        return ParseResult(
            structures=(
                mol_to_normalized(
                    mol,
                    filename=filename,
                    format_name="xyz",
                    inferences=inferences,
                    warnings=warnings,
                    inferred_bonds=inferred_bonds,
                    unknown_bond_orders=unknown_orders,
                ),
            )
        )

    def export(self, structure: NormalizedStructureV1, filename_stem: str) -> ExportResult:
        lines = [str(len(structure.atoms)), structure.title]
        coordinates = structure.active_coordinates
        for atom, (x, y, z) in zip(structure.atoms, coordinates, strict=True):
            lines.append(f"{atom.element:<3} {x: .8f} {y: .8f} {z: .8f}")
        return ExportResult(
            data=("\n".join(lines) + "\n").encode("utf-8"),
            filename=f"{filename_stem}.xyz",
            media_type=self.capabilities.media_types[0],
            warnings=tuple(export_loss_warnings(structure, "xyz")),
        )


class SmilesAdapter:
    capabilities = FormatCapabilities(
        format="smiles",
        label="SMILES",
        extensions=("smi", "smiles"),
        media_types=("chemical/x-daylight-smiles", "text/plain"),
        multi_record=True,
    )

    def parse(
        self, data: bytes, filename: str, options: ImportOptions | None = None
    ) -> ParseResult:
        import_options = options or ImportOptions()
        structures: list[NormalizedStructureV1] = []
        for record_index, raw_line in enumerate(_decode(data, filename).splitlines()):
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            fields = line.split(maxsplit=1)
            smiles = fields[0]
            title = (
                fields[1].strip()
                if len(fields) > 1
                else f"{Path(filename).stem} {record_index + 1}"
            )
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                raise _parse_error(filename, "smiles", record_index)
            inferences: list[InferenceRecord] = []
            warnings: list[MolecularWarning] = []
            if import_options.generate_3d:
                mol = Chem.AddHs(mol)
                parameters = all_chem.ETKDGv3()
                parameters.randomSeed = 0x4D6F6C
                if all_chem.EmbedMolecule(mol, parameters) != 0:
                    raise AdapterError(
                        "coordinate_generation_failed",
                        (
                            "RDKit could not generate 3D coordinates for SMILES "
                            f"record {record_index + 1}."
                        ),
                        filename=filename,
                        operation="import",
                        record_index=record_index,
                    )
                if all_chem.UFFHasAllMoleculeParams(mol):
                    all_chem.UFFOptimizeMolecule(mol, maxIters=200)
                else:
                    warnings.append(
                        MolecularWarning(
                            code="uff_parameters_unavailable",
                            message=(
                                "3D coordinates were generated but UFF cleanup was "
                                "unavailable for some atoms."
                            ),
                            operation="import",
                            field="coordinates",
                        )
                    )
                inferences.append(
                    InferenceRecord(
                        code="smiles_coordinates_generated",
                        message=(
                            "Hydrogens and deterministic ETKDGv3 3D coordinates "
                            "were generated from SMILES."
                        ),
                    )
                )
            structures.append(
                mol_to_normalized(
                    mol,
                    filename=filename,
                    format_name="smiles",
                    record_index=record_index,
                    title=title,
                    inferences=inferences,
                    warnings=warnings,
                )
            )
        if not structures:
            raise _parse_error(filename, "smiles")
        return ParseResult(structures=tuple(structures))

    def export(self, structure: NormalizedStructureV1, filename_stem: str) -> ExportResult:
        mol = normalized_to_mol(structure)
        smiles = Chem.MolToSmiles(mol, canonical=True, isomericSmiles=True)
        return ExportResult(
            data=f"{smiles}\t{structure.title}\n".encode(),
            filename=f"{filename_stem}.smi",
            media_type=self.capabilities.media_types[0],
            warnings=tuple(export_loss_warnings(structure, "smiles")),
        )


def _mol2_atom_types(text: str) -> list[str]:
    types: list[str] = []
    in_atoms = False
    for line in text.splitlines():
        if line.startswith("@<TRIPOS>"):
            in_atoms = line.strip() == "@<TRIPOS>ATOM"
            continue
        if in_atoms and line.strip():
            fields = line.split()
            if len(fields) >= 6:
                types.append(fields[5])
    return types


def _sybyl_type(atom: Any, structure: NormalizedStructureV1) -> str:
    explicit_types = structure.metadata.get("mol2_atom_types")
    if isinstance(explicit_types, list) and atom.source_index < len(explicit_types):
        value = explicit_types[atom.source_index]
        if isinstance(value, str) and value:
            return value
    element = atom.element
    atom_bonds = [
        bond for bond in structure.bonds if bond.atom_1_id == atom.id or bond.atom_2_id == atom.id
    ]
    if any(bond.aromatic for bond in atom_bonds):
        return f"{element}.ar"
    if any(bond.order == 3.0 for bond in atom_bonds):
        return f"{element}.1"
    if any(bond.order == 2.0 for bond in atom_bonds):
        return f"{element}.2"
    return str(
        {
            "C": "C.3",
            "N": "N.3",
            "O": "O.3",
            "S": "S.3",
            "P": "P.3",
            "H": "H",
        }.get(element, element)
    )


def _write_mol2(structure: NormalizedStructureV1) -> str:
    residue_by_id = {residue.id: residue for residue in structure.residues}
    coordinates = structure.active_coordinates
    lines = [
        "@<TRIPOS>MOLECULE",
        structure.title,
        f"{len(structure.atoms)} {len(structure.bonds)} {len(structure.residues)} 0 0",
        "SMALL",
        "USER_CHARGES",
        "",
        "@<TRIPOS>ATOM",
    ]
    for atom, (x, y, z) in zip(structure.atoms, coordinates, strict=True):
        residue = residue_by_id.get(atom.residue_id or -1)
        residue_id = residue.id if residue else 1
        residue_name = residue.name if residue else "LIG"
        charge = float(atom.formal_charge or 0)
        lines.append(
            f"{atom.id:7d} {atom.name[:8]:<8} {x: .6f} {y: .6f} {z: .6f} "
            f"{_sybyl_type(atom, structure):<8} {residue_id:4d} {residue_name[:8]:<8} {charge: .4f}"
        )
    lines.append("@<TRIPOS>BOND")
    for bond in structure.bonds:
        bond_type = (
            "ar"
            if bond.aromatic
            else str(int(bond.order))
            if bond.order in (1.0, 2.0, 3.0)
            else "un"
        )
        lines.append(f"{bond.id:6d} {bond.atom_1_id:6d} {bond.atom_2_id:6d} {bond_type}")
    if structure.residues:
        lines.append("@<TRIPOS>SUBSTRUCTURE")
        for residue in structure.residues:
            root_atom = next(
                (atom.id for atom in structure.atoms if atom.residue_id == residue.id),
                1,
            )
            lines.append(f"{residue.id:6d} {residue.name[:8]:<8} {root_atom:6d} RESIDUE")
    return "\n".join(lines) + "\n"
