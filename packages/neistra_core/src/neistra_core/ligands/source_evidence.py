"""Original-table evidence; entity inference is never source inventory proof."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from typing import Any

import gemmi

from neistra_core.molecular import NormalizedStructureV1

SOURCE_EVIDENCE_KEY = "ligand_mmcif_source_inventory_v1"


def _value(value: str) -> str:
    return "" if value in {".", "?"} else str(gemmi.cif.as_string(value)).strip()


def _source_tables(block: Any, original_bytes: bytes) -> dict[str, Any]:
    columns = {
        name: [_value(value) for value in block.find_values(f"_atom_site.{name}")]
        for name in (
            "id",
            "type_symbol",
            "label_asym_id",
            "label_entity_id",
            "label_comp_id",
            "label_atom_id",
            "label_alt_id",
            "auth_asym_id",
            "auth_seq_id",
            "auth_comp_id",
            "auth_atom_id",
            "pdbx_PDB_ins_code",
            "pdbx_PDB_model_num",
        )
    }
    return {
        "schema_version": 1,
        "original_sha256": hashlib.sha256(original_bytes).hexdigest(),
        "entities": [
            [_value(a), _value(b)]
            for a, b in zip(
                block.find_values("_entity.id"), block.find_values("_entity.type"), strict=False
            )
        ],
        "asymmetries": [
            [_value(a), _value(b)]
            for a, b in zip(
                block.find_values("_struct_asym.id"),
                block.find_values("_struct_asym.entity_id"),
                strict=False,
            )
        ],
        "atom_site": columns,
    }


def _receipt(tables: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "original_sha256": tables["original_sha256"],
        "table_sha256": hashlib.sha256(
            json.dumps(tables, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
        "atom_site_rows": len(tables["atom_site"]["id"]),
    }


def capture_mmcif_source(block: Any, original_bytes: bytes) -> dict[str, Any]:
    """Capture compact table identity before setup_entities can infer fields."""
    return _receipt(_source_tables(block, original_bytes))


def qualified_mmcif_residues(
    structure: NormalizedStructureV1,
    original_bytes: bytes | None,
) -> dict[int, tuple[str, str]]:
    """Return nonpolymer residue -> (source asym, entity), or no qualified inventory.

    Re-read the supplied immutable original rather than trusting archive metadata.
    Complete first-model inventory must match canonical source identities exactly.
    """
    if original_bytes is None or structure.source.format.lower() not in {"mmcif", "cif"}:
        return {}
    retained = structure.source.facts.get(SOURCE_EVIDENCE_KEY)
    if not isinstance(retained, dict):
        return {}
    try:
        block = gemmi.cif.read_string(original_bytes.decode("utf-8")).sole_block()
        evidence = _source_tables(block, original_bytes)
    except (UnicodeError, RuntimeError, ValueError):
        return {}
    if retained != _receipt(evidence):
        return {}
    entities_rows, asym_rows = evidence["entities"], evidence["asymmetries"]
    entities = dict(entities_rows)
    asymmetries = dict(asym_rows)
    if (
        not entities
        or not asymmetries
        or len(entities) != len(entities_rows)
        or len(asymmetries) != len(asym_rows)
        or any(not key or not value for key, value in [*entities_rows, *asym_rows])
    ):
        return {}
    columns = evidence["atom_site"]
    count = len(columns["id"])
    required = (
        "id",
        "type_symbol",
        "label_asym_id",
        "label_entity_id",
        "label_comp_id",
        "label_atom_id",
        "auth_asym_id",
        "auth_seq_id",
    )
    if not count or any(len(columns[name]) != count for name in required):
        return {}
    if any(values and len(values) != count for values in columns.values()):
        return {}
    models = columns["pdbx_PDB_model_num"] or ["1"] * count
    first_model = models[0]
    residues = {residue.id: residue for residue in structure.residues}
    chains = {chain.id: chain for chain in structure.chains}
    original_sites: dict[tuple[object, ...], tuple[str, str, str]] = {}
    for index in range(count):
        if models[index] != first_model:
            continue
        try:
            serial = int(columns["id"][index])
            number = int(columns["auth_seq_id"][index])
        except ValueError:
            return {}
        asym, entity = columns["label_asym_id"][index], columns["label_entity_id"][index]
        if not asym or not entity or asymmetries.get(asym) != entity or entity not in entities:
            return {}
        key: tuple[object, ...] = (
            serial - 1,
            columns["type_symbol"][index],
            columns["auth_asym_id"][index],
            number,
            (columns["pdbx_PDB_ins_code"] or [""] * count)[index],
            (columns["auth_comp_id"] or columns["label_comp_id"])[index],
            (columns["auth_atom_id"] or columns["label_atom_id"])[index],
            (columns["label_alt_id"] or [""] * count)[index],
        )
        if key in original_sites:
            return {}
        original_sites[key] = asym, entity, entities[entity].lower()
    if len(original_sites) != len(structure.atoms):
        return {}
    matched: set[tuple[object, ...]] = set()
    residue_sources: dict[int, set[tuple[str, str, str]]] = defaultdict(set)
    for atom in structure.atoms:
        residue = residues.get(atom.residue_id or -1)
        if residue is None or residue.chain_id not in chains:
            return {}
        key = (
            atom.source_index,
            atom.element,
            chains[residue.chain_id].name,
            residue.author_number,
            residue.insertion_code or "",
            residue.name,
            atom.name,
            atom.alternate_location or "",
        )
        if key not in original_sites or key in matched:
            return {}
        matched.add(key)
        residue_sources[residue.id].add(original_sites[key])
    if matched != set(original_sites):
        return {}
    result = {}
    nonpoly_asym: dict[str, set[int]] = defaultdict(set)
    for residue_id, sources in residue_sources.items():
        if len(sources) != 1:
            return {}
        asym, entity, kind = next(iter(sources))
        if kind in {"non-polymer", "nonpolymer"}:
            nonpoly_asym[asym].add(residue_id)
            result[residue_id] = asym, entity
    if any(len(ids) != 1 for ids in nonpoly_asym.values()):
        return {}
    return result
