from __future__ import annotations

from pathlib import Path
from typing import Any

import gemmi

from molweave_core.adapters.base import (
    AdapterError,
    ExportResult,
    FormatCapabilities,
    ImportOptions,
    ParseResult,
)
from molweave_core.adapters.rdkit_common import export_loss_warnings
from molweave_core.molecular import (
    Atom,
    Bond,
    Chain,
    Conformer,
    MolecularWarning,
    NormalizedStructureV1,
    Residue,
    SourceFacts,
)

WATER_NAMES = {"DOD", "HOH", "H2O", "WAT"}
ION_ELEMENTS = {
    "BR",
    "CA",
    "CD",
    "CL",
    "CO",
    "CS",
    "CU",
    "FE",
    "K",
    "LI",
    "MG",
    "MN",
    "NA",
    "NI",
    "RB",
    "SR",
    "ZN",
}


def _clean_identifier(value: str) -> str:
    return value.replace("\x00", "").strip()


def _decode(data: bytes, filename: str) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise AdapterError(
            "invalid_text_encoding",
            "PDB and PDBx/mmCIF inputs must be UTF-8 text.",
            filename=filename,
            operation="import",
        ) from error


def _component_type(residue: Any) -> str:
    name = residue.name.strip().upper()
    tabulated = gemmi.find_tabulated_residue(name)
    if name in WATER_NAMES or tabulated.is_water():
        return "water"
    if tabulated.is_amino_acid() or tabulated.is_nucleic_acid():
        return "polymer"
    atoms = list(residue)
    if len(atoms) == 1 and atoms[0].element.name.upper() in ION_ELEMENTS:
        return "ion"
    return "ligand"


def _enum_name(value: Any) -> str | None:
    name = getattr(value, "name", None)
    if not name or name == "Unknown":
        return None
    characters: list[str] = []
    for index, character in enumerate(name):
        if index and character.isupper() and not name[index - 1].isupper():
            characters.append("_")
        characters.append(character.lower())
    return "".join(characters)


def _structure_type(residues: list[Residue]) -> str:
    components = {residue.component_type for residue in residues}
    if components <= {"water", "ion"}:
        return "solvent"
    if "polymer" in components and components & {"ligand", "ion"}:
        return "complex"
    if "polymer" in components:
        return "protein"
    if "ligand" in components:
        return "ligand"
    return "unknown"


def _atom_signature(chain: Any, residue: Any, atom: Any) -> tuple[str, str, int, str, str, str]:
    return (
        chain.name,
        residue.name,
        int(residue.seqid.num),
        _clean_identifier(residue.seqid.icode),
        atom.name.strip(),
        _clean_identifier(atom.altloc),
    )


def _connection_signature(address: Any) -> tuple[str, str, int, str, str, str]:
    return (
        address.chain_name,
        address.res_id.name,
        int(address.res_id.seqid.num),
        _clean_identifier(address.res_id.seqid.icode),
        address.atom_name.strip(),
        _clean_identifier(address.altloc),
    )


def _normalized_from_gemmi(
    structure: Any,
    *,
    filename: str,
    format_name: str,
    categories: list[str] | None = None,
    pdb_text: str | None = None,
) -> NormalizedStructureV1:
    if not len(structure) or structure[0].count_atom_sites() == 0:
        raise AdapterError(
            "no_atoms",
            f"{Path(filename).name} contains no molecular atom records.",
            filename=filename,
            operation="import",
        )
    structure.setup_entities()
    first_model = structure[0]
    entities_by_subchain = {
        subchain: entity
        for entity in structure.entities
        for subchain in entity.subchains
    }
    chains: list[Chain] = []
    residues: list[Residue] = []
    atoms: list[Atom] = []
    signature_to_atom_id: dict[tuple[str, str, int, str, str, str], int] = {}
    serial_to_atom_id: dict[int, int] = {}
    residue_id_by_object: dict[tuple[int, int], int] = {}
    warnings: list[MolecularWarning] = []

    for chain_index, chain in enumerate(first_model):
        chain_id = chain_index + 1
        chains.append(Chain(id=chain_id, name=chain.name, entity_type="mixed"))
        for residue_index, residue in enumerate(chain):
            source_subchain_id = _clean_identifier(residue.subchain) or None
            source_entity = entities_by_subchain.get(source_subchain_id or "")
            source_entity_type = (
                _enum_name(source_entity.entity_type) if source_entity is not None else None
            )
            if source_entity_type == "non_polymer":
                source_entity_type = "non-polymer"
            residue_id = len(residues) + 1
            residue_id_by_object[(chain_index, residue_index)] = residue_id
            label_number = int(residue.label_seq) if residue.label_seq is not None else None
            residues.append(
                Residue(
                    id=residue_id,
                    chain_id=chain_id,
                    name=residue.name,
                    author_number=int(residue.seqid.num),
                    label_number=label_number,
                    insertion_code=_clean_identifier(residue.seqid.icode) or None,
                    component_type=_component_type(residue),
                    source_entity_id=(
                        _clean_identifier(source_entity.name) or None
                        if source_entity is not None
                        else None
                    ),
                    source_subchain_id=source_subchain_id,
                    source_entity_type=source_entity_type,
                    source_polymer_type=(
                        _enum_name(source_entity.polymer_type)
                        if source_entity is not None
                        else None
                    ),
                    source_residue_kind=_enum_name(
                        gemmi.find_tabulated_residue(residue.name.strip().upper()).kind
                    ),
                )
            )
            for atom in residue:
                atom_id = len(atoms) + 1
                signature = _atom_signature(chain, residue, atom)
                signature_to_atom_id[signature] = atom_id
                if atom.serial > 0:
                    serial_to_atom_id[int(atom.serial)] = atom_id
                formal_charge = int(atom.charge) if int(atom.charge) != 0 else None
                atoms.append(
                    Atom(
                        id=atom_id,
                        name=atom.name.strip(),
                        element=atom.element.name,
                        coordinates=(
                            float(atom.pos.x),
                            float(atom.pos.y),
                            float(atom.pos.z),
                        ),
                        residue_id=residue_id_by_object[(chain_index, residue_index)],
                        formal_charge=formal_charge,
                        source_index=int(atom.serial - 1) if atom.serial > 0 else atom_id - 1,
                        alternate_location=_clean_identifier(atom.altloc) or None,
                        occupancy=float(atom.occ),
                        b_factor=float(atom.b_iso),
                    )
                )

    conformers: list[Conformer] = []
    expected_signatures = list(signature_to_atom_id)
    for model_index, model in enumerate(structure):
        model_coordinates: dict[
            tuple[str, str, int, str, str, str], tuple[float, float, float]
        ] = {}
        for chain in model:
            for residue in chain:
                for atom in residue:
                    model_coordinates[_atom_signature(chain, residue, atom)] = (
                        float(atom.pos.x),
                        float(atom.pos.y),
                        float(atom.pos.z),
                    )
        if set(model_coordinates) != set(expected_signatures):
            raise AdapterError(
                "model_topology_mismatch",
                (
                    "Models in this file do not contain identical atom identities; "
                    "split them before import."
                ),
                filename=filename,
                operation="import",
                record_index=model_index,
            )
        conformers.append(
            Conformer(
                id=model_index + 1,
                name=f"Model {model.num}",
                coordinates=[model_coordinates[signature] for signature in expected_signatures],
            )
        )

    bond_pairs: set[tuple[int, int]] = set()
    for connection in structure.connections:
        first = signature_to_atom_id.get(_connection_signature(connection.partner1))
        second = signature_to_atom_id.get(_connection_signature(connection.partner2))
        if first is not None and second is not None and first != second:
            bond_pairs.add((min(first, second), max(first, second)))

    if pdb_text:
        for line in pdb_text.splitlines():
            if not line.startswith("CONECT"):
                continue
            try:
                serials = [
                    int(line[index : index + 5])
                    for index in range(6, len(line), 5)
                    if line[index : index + 5].strip()
                ]
            except ValueError:
                warnings.append(
                    MolecularWarning(
                        code="pdb_conect_invalid",
                        message="A malformed CONECT record was ignored.",
                        operation="import",
                        field="bonds",
                    )
                )
                continue
            if serials and serials[0] in serial_to_atom_id:
                for target_serial in serials[1:]:
                    if target_serial in serial_to_atom_id:
                        first_id = serial_to_atom_id[serials[0]]
                        second_id = serial_to_atom_id[target_serial]
                        bond_pairs.add((min(first_id, second_id), max(first_id, second_id)))

    bonds = [
        Bond(
            id=index + 1,
            atom_1_id=pair[0],
            atom_2_id=pair[1],
            order=None,
            inferred=False,
        )
        for index, pair in enumerate(sorted(bond_pairs))
    ]
    if bond_pairs:
        warnings.append(
            MolecularWarning(
                code=f"{format_name}_bond_orders_unknown",
                message=(
                    "Connectivity was retained, but this source does not provide "
                    "reliable ligand bond orders."
                ),
                operation="import",
                field="bonds.order",
            )
        )
    if any(atom.alternate_location for atom in atoms):
        warnings.append(
            MolecularWarning(
                code="alternate_locations_retained",
                message=(
                    "Alternate-location identifiers and occupancies were retained "
                    "as distinct atom records."
                ),
                operation="import",
                severity="info",
                field="atoms.alternate_location",
            )
        )
    if len(conformers) > 1:
        warnings.append(
            MolecularWarning(
                code="models_retained_as_conformers",
                message=f"{len(conformers)} coordinate models were retained as conformers.",
                operation="import",
                severity="info",
                field="conformers",
            )
        )

    category_names = sorted(categories or [])
    modeled_categories = {
        "_atom_site.",
        "_entry.",
        "_entity.",
        "_entity_poly.",
        "_struct_asym.",
        "_struct_conn.",
    }
    unmodeled_categories = [
        category for category in category_names if category not in modeled_categories
    ]
    if unmodeled_categories:
        warnings.append(
            MolecularWarning(
                code="mmcif_categories_original_only",
                message=(
                    f"{len(unmodeled_categories)} PDBx/mmCIF categories remain available only "
                    "in the immutable original upload."
                ),
                operation="import",
                field="source.categories",
            )
        )

    title = structure.name.strip() or Path(filename).stem
    return NormalizedStructureV1(
        title=title,
        structure_type=_structure_type(residues),
        source=SourceFacts(
            filename=filename,
            format=format_name,
            model_count=len(conformers),
            categories=category_names,
            facts={"unmodeled_categories": unmodeled_categories},
        ),
        chains=chains,
        residues=residues,
        atoms=atoms,
        bonds=bonds,
        conformers=conformers,
        metadata={
            "spacegroup": structure.spacegroup_hm,
            "cell": {
                "a": float(structure.cell.a),
                "b": float(structure.cell.b),
                "c": float(structure.cell.c),
                "alpha": float(structure.cell.alpha),
                "beta": float(structure.cell.beta),
                "gamma": float(structure.cell.gamma),
            },
        },
        warnings=warnings,
    )


class PdbAdapter:
    capabilities = FormatCapabilities(
        format="pdb",
        label="PDB",
        extensions=("pdb", "ent"),
        media_types=("chemical/x-pdb",),
    )

    def parse(
        self, data: bytes, filename: str, options: ImportOptions | None = None
    ) -> ParseResult:
        del options
        text = _decode(data, filename)
        try:
            structure = gemmi.read_pdb_string(text)
        except (RuntimeError, ValueError) as error:
            raise AdapterError(
                "parse_failed",
                f"Gemmi could not parse PDB: {error}",
                filename=filename,
                operation="import",
            ) from error
        normalized = _normalized_from_gemmi(
            structure,
            filename=filename,
            format_name="pdb",
            pdb_text=text,
        )
        return ParseResult(structures=(normalized,))

    def export(self, structure: NormalizedStructureV1, filename_stem: str) -> ExportResult:
        return ExportResult(
            data=_write_pdb(structure).encode("ascii"),
            filename=f"{filename_stem}.pdb",
            media_type=self.capabilities.media_types[0],
            warnings=tuple(export_loss_warnings(structure, "pdb")),
        )


class MmcifAdapter:
    capabilities = FormatCapabilities(
        format="mmcif",
        label="PDBx/mmCIF",
        extensions=("cif", "mmcif"),
        media_types=("chemical/x-mmcif",),
    )

    def parse(
        self, data: bytes, filename: str, options: ImportOptions | None = None
    ) -> ParseResult:
        del options
        text = _decode(data, filename)
        try:
            document = gemmi.cif.read_string(text)
            block = document.sole_block()
            if not block.find_mmcif_category("_atom_site."):
                raise AdapterError(
                    "unsupported_cif_dialect",
                    "This CIF does not contain a PDBx/mmCIF _atom_site category.",
                    filename=filename,
                    operation="import",
                )
            structure = gemmi.make_structure_from_block(block)
        except AdapterError:
            raise
        except (RuntimeError, ValueError) as error:
            raise AdapterError(
                "parse_failed",
                f"Gemmi could not parse PDBx/mmCIF: {error}",
                filename=filename,
                operation="import",
            ) from error
        normalized = _normalized_from_gemmi(
            structure,
            filename=filename,
            format_name="mmcif",
            categories=list(block.get_mmcif_category_names()),
        )
        return ParseResult(structures=(normalized,))

    def export(self, structure: NormalizedStructureV1, filename_stem: str) -> ExportResult:
        return ExportResult(
            data=_write_mmcif(structure).encode("utf-8"),
            filename=f"{filename_stem}.cif",
            media_type=self.capabilities.media_types[0],
            warnings=tuple(export_loss_warnings(structure, "mmcif")),
        )


def _write_pdb(structure: NormalizedStructureV1) -> str:
    if len(structure.atoms) > 99_999:
        raise AdapterError(
            "pdb_atom_serial_limit",
            "PDB supports at most 99,999 atom serials; export as PDBx/mmCIF.",
            filename=f"{structure.title}.pdb",
            operation="export",
        )
    residue_by_id = {residue.id: residue for residue in structure.residues}
    chain_by_id = {chain.id: chain for chain in structure.chains}
    lines = [f"TITLE     {structure.title[:69]}"]
    for conformer_index, conformer in enumerate(structure.conformers, start=1):
        if len(structure.conformers) > 1:
            lines.append(f"MODEL     {conformer_index:4d}")
        for atom, (x, y, z) in zip(structure.atoms, conformer.coordinates, strict=True):
            if any(abs(value) >= 10_000 for value in (x, y, z)):
                raise AdapterError(
                    "pdb_coordinate_limit",
                    "A coordinate exceeds the PDB fixed-width range; export as PDBx/mmCIF.",
                    filename=f"{structure.title}.pdb",
                    operation="export",
                )
            residue = residue_by_id.get(atom.residue_id or -1)
            chain = chain_by_id.get(residue.chain_id) if residue else None
            component_type = residue.component_type if residue else "unknown"
            record = "ATOM  " if component_type == "polymer" else "HETATM"
            residue_name = (residue.name if residue else "UNK")[:3]
            residue_number = (
                residue.author_number or residue.label_number or residue.id if residue else 1
            )
            insertion_code = (residue.insertion_code or " ")[:1] if residue else " "
            alternate = (atom.alternate_location or " ")[:1]
            occupancy = atom.occupancy if atom.occupancy is not None else 1.0
            b_factor = atom.b_factor or 0.0
            charge = ""
            if atom.formal_charge:
                sign = "+" if atom.formal_charge > 0 else "-"
                charge = f"{abs(atom.formal_charge)}{sign}"
            lines.append(
                f"{record}{atom.id:5d} {atom.name[:4]:>4}{alternate}{residue_name:>3} "
                f"{(chain.name if chain else ' ')[:1]}{residue_number:4d}{insertion_code}   "
                f"{x:8.3f}{y:8.3f}{z:8.3f}{occupancy:6.2f}{b_factor:6.2f}"
                f"          {atom.element[:2]:>2}{charge:>2}"
            )
        if len(structure.conformers) > 1:
            lines.append("ENDMDL")
    for bond in structure.bonds:
        lines.append(f"CONECT{bond.atom_1_id:5d}{bond.atom_2_id:5d}")
    lines.append("END")
    return "\n".join(lines) + "\n"


def _write_mmcif(structure: NormalizedStructureV1) -> str:
    document = gemmi.cif.Document()
    block_name = "".join(character if character.isalnum() else "_" for character in structure.title)
    block = document.add_new_block(block_name or "molweave")
    block.set_pair("_entry.id", block_name or "molweave")
    atom_site = block.init_loop(
        "_atom_site.",
        [
            "group_PDB",
            "id",
            "type_symbol",
            "label_atom_id",
            "label_alt_id",
            "label_comp_id",
            "label_asym_id",
            "label_entity_id",
            "label_seq_id",
            "pdbx_PDB_ins_code",
            "Cartn_x",
            "Cartn_y",
            "Cartn_z",
            "occupancy",
            "B_iso_or_equiv",
            "pdbx_formal_charge",
            "auth_seq_id",
            "auth_comp_id",
            "auth_asym_id",
            "auth_atom_id",
            "pdbx_PDB_model_num",
        ],
    )
    residue_by_id = {residue.id: residue for residue in structure.residues}
    chain_by_id = {chain.id: chain for chain in structure.chains}
    for model_number, conformer in enumerate(structure.conformers, start=1):
        for atom, (x, y, z) in zip(structure.atoms, conformer.coordinates, strict=True):
            residue = residue_by_id.get(atom.residue_id or -1)
            chain = chain_by_id.get(residue.chain_id) if residue else None
            residue_name = residue.name if residue else "UNK"
            chain_name = chain.name if chain and chain.name else "A"
            author_number = (
                residue.author_number or residue.label_number or residue.id if residue else 1
            )
            label_number = (
                residue.label_number or residue.author_number or residue.id if residue else 1
            )
            atom_site.add_row(
                [
                    "ATOM" if residue and residue.component_type == "polymer" else "HETATM",
                    str(atom.id + (model_number - 1) * len(structure.atoms)),
                    atom.element,
                    atom.name,
                    atom.alternate_location or ".",
                    residue_name,
                    chain_name,
                    str(residue.chain_id if residue else 1),
                    str(label_number),
                    residue.insertion_code or "?" if residue else "?",
                    f"{x:.6f}",
                    f"{y:.6f}",
                    f"{z:.6f}",
                    f"{atom.occupancy if atom.occupancy is not None else 1.0:.2f}",
                    f"{atom.b_factor or 0.0:.2f}",
                    str(atom.formal_charge) if atom.formal_charge is not None else "?",
                    str(author_number),
                    residue_name,
                    chain_name,
                    atom.name,
                    str(model_number),
                ]
            )
    if structure.bonds:
        connection_loop = block.init_loop(
            "_struct_conn.",
            [
                "id",
                "conn_type_id",
                "ptnr1_label_asym_id",
                "ptnr1_label_comp_id",
                "ptnr1_label_seq_id",
                "ptnr1_label_atom_id",
                "ptnr2_label_asym_id",
                "ptnr2_label_comp_id",
                "ptnr2_label_seq_id",
                "ptnr2_label_atom_id",
            ],
        )
        atom_by_id = {atom.id: atom for atom in structure.atoms}
        for bond in structure.bonds:
            first_atom = atom_by_id[bond.atom_1_id]
            second_atom = atom_by_id[bond.atom_2_id]
            first_residue = residue_by_id.get(first_atom.residue_id or -1)
            second_residue = residue_by_id.get(second_atom.residue_id or -1)
            first_chain = chain_by_id.get(first_residue.chain_id) if first_residue else None
            second_chain = chain_by_id.get(second_residue.chain_id) if second_residue else None
            connection_loop.add_row(
                [
                    f"bond{bond.id}",
                    "covale",
                    first_chain.name if first_chain and first_chain.name else "A",
                    first_residue.name if first_residue else "UNK",
                    str(
                        first_residue.label_number
                        or first_residue.author_number
                        or first_residue.id
                        if first_residue
                        else 1
                    ),
                    first_atom.name,
                    second_chain.name if second_chain and second_chain.name else "A",
                    second_residue.name if second_residue else "UNK",
                    str(
                        second_residue.label_number
                        or second_residue.author_number
                        or second_residue.id
                        if second_residue
                        else 1
                    ),
                    second_atom.name,
                ]
            )
    return document.as_string()
