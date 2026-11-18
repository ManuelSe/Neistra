"""Original-table evidence; entity inference is never source inventory proof."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Literal

import gemmi

from neistra_core.hydrogen_protection import protection_facts
from neistra_core.molecular import Bond, NormalizedStructureV1

SOURCE_EVIDENCE_KEY = "ligand_mmcif_source_inventory_v1"
NONPOLYMER_ENTITY_TYPES = frozenset({"non-polymer", "nonpolymer", "macrolide"})
KNOWN_ENTITY_TYPES = NONPOLYMER_ENTITY_TYPES | {"polymer", "water", "branched"}
AUTHORED_HYDROGEN_CODES = frozenset(
    {
        "hydrogens_added",
        "model_hydrogen_placement",
        "model_hydrogen_reconciliation",
        "protein_hydrogens_added",
    }
)


def known_covalent_bond_ids(structure: NormalizedStructureV1) -> set[int]:
    """Explicit current edges, plus strictly evidenced authored H-parent edges."""
    atoms = {atom.id: atom for atom in structure.atoms}
    authored = {
        atom_id
        for inference in structure.inferences
        if inference.code in AUTHORED_HYDROGEN_CODES
        for atom_id in inference.atom_ids
    }
    try:
        facts = protection_facts(structure)
    except ValueError:
        facts = {}
    degrees: dict[int, int] = defaultdict(int)
    for bond in structure.bonds:
        degrees[bond.atom_1_id] += 1
        degrees[bond.atom_2_id] += 1
    return {
        bond.id
        for bond in structure.bonds
        if bond.order in {1.0, 1.5, 2.0, 3.0}
        and bond.aromatic == (bond.order == 1.5)
        and (
            not bond.inferred
            or (
                bond.order == 1.0
                and any(
                    atom_id in atoms
                    and atoms[atom_id].element == "H"
                    and atom_id in authored
                    and degrees[atom_id] == 1
                    and atom_id in facts
                    and facts[atom_id].matches(atoms[atom_id])
                    and facts[atom_id].ordinary
                    for atom_id in (bond.atom_1_id, bond.atom_2_id)
                )
            )
        )
    }


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
    tables = {
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
    scheme = block.get_mmcif_category("_pdbx_nonpoly_scheme.", raw=True)
    if scheme:
        tables["nonpoly_scheme"] = {
            name: [_value(value) for value in values] for name, values in scheme.items()
        }
        tables["nonpoly_scheme_nulls"] = {
            name: [value if value in {".", "?"} else "" for value in values]
            for name, values in scheme.items()
        }
    return tables


def _consistent_scheme(evidence: dict[str, Any]) -> bool:
    scheme = evidence.get("nonpoly_scheme")
    if scheme is None:
        return True
    required = ("asym_id", "entity_id", "mon_id", "ndb_seq_num")
    count = len(scheme.get("asym_id", []))
    if not count or any(len(scheme.get(name, [])) != count for name in required):
        return False
    if any(len(values) != count for values in scheme.values()):
        return False
    entities = dict(evidence["entities"])
    asymmetries = dict(evidence["asymmetries"])
    columns = evidence["atom_site"]
    models = columns["pdbx_PDB_model_num"] or ["1"] * len(columns["id"])
    insertions = columns["pdbx_PDB_ins_code"] or [""] * len(models)
    observed: dict[str, set[tuple[str, ...]]] = defaultdict(set)
    for index in range(len(columns["id"])):
        entity = columns["label_entity_id"][index]
        if models[index] != models[0] or entities.get(
            entity, ""
        ).lower() not in NONPOLYMER_ENTITY_TYPES | {"water"}:
            continue
        observed[columns["label_asym_id"][index]].add(
            (
                entity,
                columns["label_comp_id"][index],
                columns["auth_seq_id"][index],
                (columns["auth_comp_id"] or columns["label_comp_id"])[index],
                columns["auth_asym_id"][index],
                insertions[index],
            )
        )
    seen: set[tuple[str, str]] = set()
    covered = set()
    # At most 16 known-column patterns; each source residue is indexed once
    # per pattern rather than scanning a large shared water asym per row.
    lookups: dict[tuple[bool, ...], dict[tuple[str, ...], list[tuple[str, ...]]]] = {}
    for index in range(count):
        asym, entity, monomer, sequence = (scheme[name][index] for name in required)
        if (
            not all((asym, entity, monomer, sequence))
            or (asym, sequence) in seen
            or asymmetries.get(asym) != entity
            or entities.get(entity, "").lower() not in NONPOLYMER_ENTITY_TYPES | {"water"}
        ):
            return False
        seen.add((asym, sequence))
        if asym not in observed:
            # A present scheme cannot silently introduce an unobserved instance.
            return False
        names = ("pdb_seq_num", "pdb_mon_id", "pdb_strand_id", "pdb_ins_code")
        known = tuple(scheme[name][index] if name in scheme else "" for name in names)
        # CIF '.' is inapplicable (not an insertion code); '?' is unknown.
        # A declared blank must not match a known inserted coordinate residue.
        mask = tuple(
            name in scheme and evidence["nonpoly_scheme_nulls"][name][index] != "?"
            for name in names
        )
        if mask not in lookups:
            lookup: dict[tuple[str, ...], list[tuple[str, ...]]] = defaultdict(list)
            for observed_asym, coordinates in observed.items():
                for coordinate in coordinates:
                    lookup[
                        (
                            observed_asym,
                            *coordinate[:2],
                            *(
                                value
                                for value, present in zip(coordinate[2:], mask, strict=True)
                                if present
                            ),
                        )
                    ].append(coordinate)
            lookups[mask] = dict(lookup)
        matched = lookups[mask].get(
            (
                asym,
                entity,
                monomer,
                *(value for value, present in zip(known, mask, strict=True) if present),
            ),
            [],
        )
        if len(matched) != 1 or (asym, matched[0]) in covered:
            return False
        # auth_seq_num/auth_mon_id describe historical author nomenclature;
        # they need not equal numbering/names in the coordinate/PDB records.
        covered.add((asym, matched[0]))
    return covered == {
        (asym, coordinate) for asym, coordinates in observed.items() for coordinate in coordinates
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


@dataclass(frozen=True)
class MmcifSourceInventory:
    status: Literal["unavailable", "qualified", "unsupported"]
    residues: dict[int, tuple[str, str, str]]
    reason: str | None = None

    @property
    def nonpolymer_residues(self) -> dict[int, tuple[str, str]]:
        return {
            identity: (asym, entity)
            for identity, (asym, entity, kind) in self.residues.items()
            if kind in NONPOLYMER_ENTITY_TYPES
        }


def qualified_mmcif_residues(
    structure: NormalizedStructureV1,
    original_bytes: bytes | None,
) -> dict[int, tuple[str, str]]:
    return assess_mmcif_source(structure, original_bytes).nonpolymer_residues


def assess_mmcif_source(
    structure: NormalizedStructureV1,
    original_bytes: bytes | None,
) -> MmcifSourceInventory:
    """Original raw identity establishes ownership, independent of current chemistry.

    Current canonical/source anchors and residue/chain partitions must remain.
    New clusters need known covalent connectivity to one original instance.
    """
    if original_bytes is None or structure.source.format.lower() not in {"mmcif", "cif"}:
        return MmcifSourceInventory("unavailable", {}, "original_mmcif_unavailable")
    retained = structure.source.facts.get(SOURCE_EVIDENCE_KEY)
    if SOURCE_EVIDENCE_KEY in structure.source.facts and not isinstance(retained, dict):
        return MmcifSourceInventory("unsupported", {}, "original_mmcif_receipt_invalid")
    try:
        block = gemmi.cif.read_string(original_bytes.decode("utf-8")).sole_block()
        evidence = _source_tables(block, original_bytes)
    except (UnicodeError, RuntimeError, ValueError):
        return MmcifSourceInventory("unsupported", {}, "original_mmcif_unreadable")
    if SOURCE_EVIDENCE_KEY in structure.source.facts and retained != _receipt(evidence):
        return MmcifSourceInventory("unsupported", {}, "original_mmcif_receipt_mismatch")
    if not evidence["entities"] and not evidence["asymmetries"]:
        return MmcifSourceInventory("unavailable", {}, "original_mmcif_inventory_not_declared")
    matched = _match_mmcif_inventory(structure, block, evidence)
    if matched is None:
        return MmcifSourceInventory("unsupported", {}, "original_mmcif_inventory_inconsistent")
    return MmcifSourceInventory("qualified", matched)


def _match_mmcif_inventory(
    structure: NormalizedStructureV1,
    block: Any,
    evidence: dict[str, Any],
) -> dict[int, tuple[str, str, str]] | None:
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
        return None
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
        return None
    if any(values and len(values) != count for values in columns.values()):
        return None
    if not _consistent_scheme(evidence):
        return None
    models = columns["pdbx_PDB_model_num"] or ["1"] * count
    insertions = columns["pdbx_PDB_ins_code"] or [""] * count
    alternates = columns["label_alt_id"] or [""] * count
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
            return None
        asym, entity = columns["label_asym_id"][index], columns["label_entity_id"][index]
        if not asym or not entity or asymmetries.get(asym) != entity or entity not in entities:
            return None
        key: tuple[object, ...] = (
            serial - 1,
            columns["type_symbol"][index],
            columns["auth_asym_id"][index],
            number,
            insertions[index],
            (columns["auth_comp_id"] or columns["label_comp_id"])[index],
            (columns["auth_atom_id"] or columns["label_atom_id"])[index],
            alternates[index],
        )
        if key in original_sites:
            return None
        original_sites[key] = asym, entity, entities[entity].lower()
    # Recover the adapter's original canonical bindings from the immutable
    # first model. Current display labels are editable and are not identities.
    bindings = {}
    try:
        native = gemmi.make_structure_from_block(block)
        atom_id, residue_id = 0, 0
        for chain_id, source_chain in enumerate(native[0], start=1):
            for source_residue in source_chain:
                if source_residue.seqid.num is None:
                    return None
                residue_id += 1
                for source_atom in source_residue:
                    atom_id += 1
                    key = (
                        int(source_atom.serial) - 1,
                        source_atom.element.name,
                        source_chain.name,
                        int(source_residue.seqid.num),
                        str(source_residue.seqid.icode).strip(),
                        source_residue.name,
                        source_atom.name.strip(),
                        str(source_atom.altloc).strip("\x00 "),
                    )
                    if key not in original_sites:
                        return None
                    bindings[atom_id] = (key, residue_id, chain_id)
    except (RuntimeError, ValueError, IndexError):
        return None
    if len(bindings) != len(original_sites):
        return None
    atoms = {atom.id: atom for atom in structure.atoms}
    known_edges = known_covalent_bond_ids(structure)
    incident: dict[int, list[Bond]] = defaultdict(list)
    for bond in structure.bonds:
        incident[bond.atom_1_id].append(bond)
        incident[bond.atom_2_id].append(bond)
    added = atoms.keys() - bindings.keys()
    unvisited = set(added)
    while unvisited:
        pending = [unvisited.pop()]
        cluster, anchors = set(), set()
        while pending:
            identity = pending.pop()
            cluster.add(identity)
            for edge in incident[identity]:
                # Every new connection needs a known authored covalent basis.
                if edge.id not in known_edges:
                    return None
                other = edge.atom_2_id if edge.atom_1_id == identity else edge.atom_1_id
                if other in unvisited:
                    unvisited.remove(other)
                    pending.append(other)
                elif other in bindings:
                    anchors.add(other)
        owners = {bindings[identity][1] for identity in anchors}
        if len(owners) != 1:
            return None
        owner = next(iter(owners))
        source_anchor = bindings[next(iter(anchors))]
        if not any(bindings[identity][0][1] != "H" for identity in anchors):
            return None
        for identity in cluster:
            atom = atoms[identity]
            residue = residues.get(atom.residue_id or -1)
            if (
                residue is None
                or residue.id != owner
                or residue.chain_id != source_anchor[2]
                or (atom.alternate_location or "") != source_anchor[0][-1]
            ):
                return None
    matched: set[tuple[object, ...]] = set()
    residue_sources: dict[int, set[tuple[str, str, str]]] = defaultdict(set)
    for atom in structure.atoms:
        residue = residues.get(atom.residue_id or -1)
        if residue is None or residue.chain_id not in chains:
            return None
        binding = bindings.get(atom.id)
        if binding is None:
            # The complete added cluster and its unique original owner were
            # validated above; it cannot introduce another source instance.
            continue
        key, expected_residue, expected_chain = binding
        if (
            (atom.source_index, atom.alternate_location or "") != (key[0], key[-1])
            or residue.id != expected_residue
            or residue.chain_id != expected_chain
            or key in matched
        ):
            return None
        matched.add(key)
        residue_sources[residue.id].add(original_sites[key])
    anchored_residues = {
        binding[1]
        for identity, binding in bindings.items()
        if identity in atoms and binding[0][1] != "H"
    }
    changed_residues = {
        binding[1] for identity, binding in bindings.items() if identity not in atoms
    }
    changed_residues |= {
        current_residue
        for identity in added
        if (current_residue := atoms[identity].residue_id) is not None
    }
    current_residues = {atom.residue_id for atom in structure.atoms}
    if not (changed_residues & current_residues) <= anchored_residues:
        return None
    if len({atom.source_index for atom in structure.atoms}) != len(structure.atoms):
        return None
    result = {}
    nonpoly_asym: dict[str, set[int]] = defaultdict(set)
    for residue_id, sources in residue_sources.items():
        if len(sources) != 1:
            return None
        asym, entity, kind = next(iter(sources))
        result[residue_id] = asym, entity, kind
        if kind in NONPOLYMER_ENTITY_TYPES:
            nonpoly_asym[asym].add(residue_id)
    if any(len(ids) != 1 for ids in nonpoly_asym.values()):
        return None
    return result
