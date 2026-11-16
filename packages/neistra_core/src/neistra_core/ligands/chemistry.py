"""Strict disposable chemistry for identity cards; no fallback interpretation."""

from __future__ import annotations

import hashlib
import io
import json
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any, Literal

from rdkit import Chem, rdBase
from rdkit.Chem import Descriptors, rdDepictor, rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D

from neistra_core.adapters.rdkit_common import mol_to_normalized
from neistra_core.hydrogen_protection import AtomProtection, protection_facts
from neistra_core.molecular import Atom, Bond, NormalizedStructureV1

CHEMISTRY_POLICY = "ligand-exact-representation-v1"
DEPICTION_POLICY = "ligand-2d-v1"
MAX_DEPICTION_ATOMS = 1024
_descriptors: Any = Descriptors
_ORDERS = {
    1.0: Chem.BondType.SINGLE,
    1.5: Chem.BondType.AROMATIC,
    2.0: Chem.BondType.DOUBLE,
    3.0: Chem.BondType.TRIPLE,
}


@dataclass(frozen=True)
class QualifiedLigandChemistry:
    status: Literal["qualified", "unavailable"]
    reason: str | None = None
    input_hash: str | None = None
    formula: str | None = None
    molecular_weight: float | None = None
    formal_charge: int | None = None
    molecule: Any = None
    provenance: str | None = None


@dataclass(frozen=True)
class LigandDepiction:
    status: Literal["ready", "unavailable"]
    reason: str | None = None
    cache_key: str | None = None
    svg: str | None = None
    input_hash: str | None = None
    implementation: str = DEPICTION_POLICY
    library_version: str = rdBase.rdkitVersion


@dataclass(frozen=True)
class _StructureIndex:
    atoms: dict[int, Atom]
    incident: dict[int, list[Bond]]
    facts: dict[int, AtomProtection]
    facts_invalid: bool

    @classmethod
    def prepare(cls, structure: NormalizedStructureV1) -> _StructureIndex:
        atoms = {atom.id: atom for atom in structure.atoms}
        incident: dict[int, list[Bond]] = defaultdict(list)
        for bond in structure.bonds:
            incident[bond.atom_1_id].append(bond)
            incident[bond.atom_2_id].append(bond)
        try:
            facts, invalid = protection_facts(structure), False
        except ValueError:
            facts, invalid = {}, True
        return cls(atoms, dict(incident), facts, invalid)

    def bonds(self, members: set[int]) -> list[Bond]:
        return list(
            {
                bond.id: bond for atom_id in members for bond in self.incident.get(atom_id, [])
            }.values()
        )

    def rows(self, members: set[int]) -> dict[str, Any]:
        return {
            "atoms": [
                (a.id, a.element, a.formal_charge, a.stereo, a.source_index, a.alternate_location)
                for a in (self.atoms[atom_id] for atom_id in sorted(members))
            ],
            "bonds": sorted(
                (
                    min(b.atom_1_id, b.atom_2_id),
                    max(b.atom_1_id, b.atom_2_id),
                    b.order,
                    b.aromatic,
                    b.stereo,
                    b.inferred,
                )
                for b in self.bonds(members)
            ),
        }


def _original_molecules(structure: NormalizedStructureV1, data: bytes) -> Iterator[Any]:
    format_name = structure.source.format.lower()
    record = structure.source.record_index
    if format_name == "sdf":
        supplier = Chem.ForwardSDMolSupplier(
            io.BytesIO(data), sanitize=True, removeHs=False, strictParsing=True
        )
        for index, mol in enumerate(supplier):
            if index == record:
                if mol is not None:
                    yield mol
                return
        return
    text = data.decode("utf-8")
    if format_name == "mol":
        mol = Chem.MolFromMolBlock(text, sanitize=True, removeHs=False, strictParsing=True)
    elif format_name == "mol2":
        mol = Chem.MolFromMol2Block(text, sanitize=True, removeHs=False, cleanupSubstructures=True)
    elif format_name in {"smiles", "smi"}:
        lines = text.splitlines()
        if record >= len(lines) or not lines[record].strip():
            return
        mol = Chem.MolFromSmiles(lines[record].split()[0])
        if mol is not None:
            yield mol
        return
    else:
        return
    if mol is not None:
        yield mol


@dataclass(frozen=True)
class _OriginalVariant:
    index: _StructureIndex
    fragments: dict[frozenset[int], Any]
    atom_orders: dict[frozenset[int], tuple[int, ...]] = field(default_factory=dict)
    hydrogen_offsets: dict[int, tuple[int, int]] = field(default_factory=dict)
    expanded: dict[frozenset[int], _OriginalVariant] = field(default_factory=dict)

    @classmethod
    def prepare(cls, mol: Any, structure: NormalizedStructureV1) -> _OriginalVariant:
        normalized = mol_to_normalized(
            mol,
            filename=structure.source.filename,
            format_name=structure.source.format,
        )
        mappings: list[tuple[int, ...]] = []
        fragments = Chem.GetMolFrags(
            mol,
            asMols=True,
            sanitizeFrags=True,
            fragsMolAtomMapping=mappings,
        )
        offsets: dict[int, tuple[int, int]] = {}
        if structure.source.format.lower() in {"smiles", "smi"}:
            # Pinned RDKit 2026.03.4 appends explicit then implicit H in
            # original atom-index order. Record offsets without allocating H
            # for unrelated fragments; original explicit H atoms stay in place.
            next_id = int(mol.GetNumAtoms()) + 1
            for atom in mol.GetAtoms():
                count = int(atom.GetNumExplicitHs() + atom.GetNumImplicitHs())
                offsets[int(atom.GetIdx()) + 1] = next_id, count
                next_id += count
        return cls(
            _StructureIndex.prepare(normalized),
            {
                frozenset(index + 1 for index in indices): fragment
                for fragment, indices in zip(fragments, mappings, strict=True)
            },
            {
                frozenset(index + 1 for index in indices): tuple(index + 1 for index in indices)
                for indices in mappings
            },
            offsets,
        )

    def match(self, current: _StructureIndex, members: set[int]) -> Any:
        fragment = self.fragments.get(frozenset(members))
        if fragment is None or current.rows(members) != self.index.rows(members):
            return None
        if any(
            atom_id in current.facts
            and (
                not current.facts[atom_id].matches(self.index.atoms[atom_id])
                or current.facts[atom_id] != self.index.facts[atom_id]
            )
            for atom_id in members
        ):
            return None
        return fragment

    def match_expanded(self, current: _StructureIndex, members: set[int]) -> Any:
        """Reproduce import H identity on one complete bounded source fragment."""
        if not self.hydrogen_offsets or rdBase.rdkitVersion != "2026.03.4":
            return None
        anchors = frozenset(atom_id for atom_id in members if atom_id in self.index.atoms)
        source = self.fragments.get(anchors)
        if source is None:
            return None
        order = self.atom_orders[anchors]
        expected_count = len(order) + sum(self.hydrogen_offsets[atom_id][1] for atom_id in order)
        if expected_count != len(members) or expected_count > MAX_DEPICTION_ATOMS:
            return None
        global_ids = list(order)
        expected_parents = []
        for local_id, atom_id in enumerate(order):
            start, count = self.hydrogen_offsets[atom_id]
            atom = source.GetAtomWithIdx(local_id)
            if atom.GetNumExplicitHs() + atom.GetNumImplicitHs() != count:
                return None
            global_ids.extend(range(start, start + count))
            expected_parents.extend([local_id] * count)
        if set(global_ids) != members:
            return None
        prepared = self.expanded.get(anchors)
        if prepared is None:
            # Membership and total size were proved before any H allocation.
            # Copy the whole disconnected source fragment, never an atom subset.
            mol = Chem.AddHs(Chem.Mol(source))
            if mol.GetNumAtoms() != expected_count:
                return None
            for local_id, parent in enumerate(expected_parents, start=len(order)):
                atom = mol.GetAtomWithIdx(local_id)
                neighbors = list(atom.GetNeighbors())
                if (
                    atom.GetAtomicNum() != 1
                    or len(neighbors) != 1
                    or neighbors[0].GetIdx() != parent
                ):
                    return None
            normalized = mol_to_normalized(mol, filename="qualified-fragment", format_name="smiles")
            local = _StructureIndex.prepare(normalized)
            mapping = dict(enumerate(global_ids, start=1))
            incident: dict[int, list[Bond]] = defaultdict(list)
            for bond in local.bonds(set(local.atoms)):
                bond = bond.model_copy(
                    update={
                        "atom_1_id": mapping[bond.atom_1_id],
                        "atom_2_id": mapping[bond.atom_2_id],
                    }
                )
                incident[bond.atom_1_id].append(bond)
                incident[bond.atom_2_id].append(bond)
            mapped = _StructureIndex(
                {
                    mapping[atom.id]: atom.model_copy(
                        update={
                            "id": mapping[atom.id],
                            "source_index": mapping[atom.id] - 1,
                        }
                    )
                    for atom in local.atoms.values()
                },
                dict(incident),
                {
                    mapping[fact.atom_id]: fact.model_copy(
                        update={
                            "atom_id": mapping[fact.atom_id],
                            "source_index": mapping[fact.atom_id] - 1,
                        }
                    )
                    for fact in local.facts.values()
                },
                local.facts_invalid,
            )
            prepared = _OriginalVariant(mapped, {frozenset(global_ids): mol})
            self.expanded[anchors] = prepared
        return prepared.match(current, members)


def _explicit_molecule(index: _StructureIndex, members: set[int]) -> Any:
    facts = index.facts
    editable = Chem.RWMol()
    indices = {}
    for atom in (index.atoms[atom_id] for atom_id in sorted(members)):
        fact = facts.get(atom.id)
        if not fact or not fact.matches(atom) or not fact.ordinary:
            raise ValueError("isotope_radical_or_hydrogen_evidence_unavailable")
        if atom.formal_charge is None:
            raise ValueError("formal_charge_unknown")
        if atom.stereo:
            raise ValueError("stereochemistry_requires_exact_source_evidence")
        native = Chem.Atom(atom.element)
        if native.GetAtomicNum() <= 0:
            raise ValueError("query_or_dummy_atom_unsupported")
        native.SetFormalCharge(atom.formal_charge)
        native.SetNoImplicit(True)
        native.SetNumExplicitHs(0)
        indices[atom.id] = editable.AddAtom(native)
    bonds = index.bonds(members)
    for bond in bonds:
        if bond.atom_1_id not in members or bond.atom_2_id not in members:
            raise ValueError("candidate_has_external_bond")
        if bond.order not in _ORDERS or bond.aromatic != (bond.order == 1.5):
            raise ValueError("bond_order_or_aromaticity_unqualified")
        if bond.stereo not in {None, "NONE"}:
            raise ValueError("stereochemistry_requires_exact_source_evidence")
        editable.AddBond(indices[bond.atom_1_id], indices[bond.atom_2_id], _ORDERS[bond.order])
    mol = editable.GetMol()
    Chem.SanitizeMol(mol)
    if any(atom.GetNumRadicalElectrons() or atom.GetNumImplicitHs() for atom in mol.GetAtoms()):
        raise ValueError("hydrogen_semantics_unavailable")
    for bond in bonds:
        if bond.atom_1_id in members and bond.atom_2_id in members:
            native_bond = mol.GetBondBetweenAtoms(indices[bond.atom_1_id], indices[bond.atom_2_id])
            if (native_bond.GetBondTypeAsDouble(), native_bond.GetIsAromatic()) != (
                bond.order,
                bond.aromatic,
            ):
                raise ValueError("sanitization_would_change_current_graph")
    return mol


class PreparedLigandChemistry:
    """One request's immutable input and lazy reusable interpretation indices.

    Do not retain this context across molecular-state changes. It holds no
    global cache and never replaces its structure or original source bytes.
    """

    def __init__(
        self,
        structure: NormalizedStructureV1,
        *,
        original_bytes: bytes | None = None,
    ) -> None:
        self._structure = structure
        self._original_bytes = original_bytes
        self._index: _StructureIndex | None = None
        self._original_iterator: Iterator[Any] | None = None
        self._originals: list[_OriginalVariant] = []

    @property
    def index(self) -> _StructureIndex:
        if self._index is None:
            self._index = _StructureIndex.prepare(self._structure)
        return self._index

    def recover(self, members: set[int]) -> Any:
        if self._original_bytes is None:
            return None
        for original in self._originals:
            matched = original.match(self.index, members)
            if matched is None:
                matched = original.match_expanded(self.index, members)
            if matched is not None:
                return matched
        if self._original_iterator is None:
            self._original_iterator = _original_molecules(self._structure, self._original_bytes)
        for mol in self._original_iterator:
            original = _OriginalVariant.prepare(mol, self._structure)
            self._originals.append(original)
            matched = original.match(self.index, members)
            if matched is None:
                matched = original.match_expanded(self.index, members)
            if matched is not None:
                return matched
        return None

    def qualify(self, atom_ids: list[int]) -> QualifiedLigandChemistry:
        return _qualify_prepared(self, atom_ids)


def prepare_chemistry(
    structure: NormalizedStructureV1,
    *,
    original_bytes: bytes | None = None,
) -> PreparedLigandChemistry:
    return PreparedLigandChemistry(structure, original_bytes=original_bytes)


def _qualify_prepared(
    prepared: PreparedLigandChemistry,
    atom_ids: list[int],
) -> QualifiedLigandChemistry:
    members = set(atom_ids)
    if not members or len(members) != len(atom_ids):
        return QualifiedLigandChemistry("unavailable", "invalid_candidate_membership")
    if len(members) > MAX_DEPICTION_ATOMS:
        return QualifiedLigandChemistry("unavailable", "depiction_atom_limit")
    index = prepared.index
    if not members <= index.atoms.keys():
        return QualifiedLigandChemistry("unavailable", "candidate_atoms_missing")
    if any(index.atoms[atom_id].alternate_location for atom_id in members):
        return QualifiedLigandChemistry("unavailable", "alternate_sites_unresolved")
    if any((b.atom_1_id in members) != (b.atom_2_id in members) for b in index.bonds(members)):
        return QualifiedLigandChemistry("unavailable", "candidate_has_external_bond")
    provenance = "current_explicit_graph"
    try:
        if index.facts_invalid:
            return QualifiedLigandChemistry("unavailable", "chemical_representation_not_qualified")
        mol = prepared.recover(members)
        if mol is not None:
            provenance = "exact_immutable_source_match"
        else:
            mol = _explicit_molecule(index, members)
        if len(Chem.GetMolFrags(mol)) != 1:
            return QualifiedLigandChemistry("unavailable", "candidate_is_disconnected")
        identity = {
            "policy": CHEMISTRY_POLICY,
            "library": rdBase.rdkitVersion,
            "current": index.rows(members),
            "representation": Chem.MolToSmiles(mol, isomericSmiles=True, allHsExplicit=True),
        }
        input_hash = hashlib.sha256(
            json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        return QualifiedLigandChemistry(
            "qualified",
            input_hash=input_hash,
            formula=str(
                rdMolDescriptors.CalcMolFormula(
                    mol,
                    separateIsotopes=True,
                    abbreviateHIsotopes=False,
                )
            ),
            molecular_weight=float(_descriptors.MolWt(mol)),
            formal_charge=int(Chem.GetFormalCharge(mol)),
            molecule=mol,
            provenance=provenance,
        )
    except (UnicodeError, ValueError, RuntimeError, OverflowError) as error:
        reason = (
            str(error)
            if isinstance(error, ValueError) and str(error).isidentifier()
            else ("chemical_representation_not_qualified")
        )
        return QualifiedLigandChemistry("unavailable", reason)


def qualify_chemistry(
    structure: NormalizedStructureV1,
    atom_ids: list[int],
    *,
    original_bytes: bytes | None = None,
) -> QualifiedLigandChemistry:
    return prepare_chemistry(structure, original_bytes=original_bytes).qualify(atom_ids)


def _validate_dimensions(width: int, height: int) -> None:
    if (
        type(width) is not int
        or type(height) is not int
        or not 64 <= width <= 1024
        or not 64 <= height <= 1024
    ):
        raise ValueError("Depiction dimensions must be between 64 and 1024 pixels")


def depiction_cache_key(input_hash: str, width: int = 240, height: int = 180) -> str:
    """Look up an immutable depiction without performing layout or drawing."""
    _validate_dimensions(width, height)
    if not input_hash:
        raise ValueError("A qualified chemical input hash is required")
    return hashlib.sha256(
        json.dumps(
            [
                DEPICTION_POLICY,
                rdBase.rdkitVersion,
                input_hash,
                width,
                height,
            ],
            separators=(",", ":"),
        ).encode()
    ).hexdigest()


def depict_qualified(
    qualified: QualifiedLigandChemistry,
    *,
    width: int = 240,
    height: int = 180,
) -> LigandDepiction:
    """Render an already qualified input only when its immutable cache misses."""
    _validate_dimensions(width, height)
    if qualified.status != "qualified":
        return LigandDepiction("unavailable", qualified.reason)
    if not qualified.input_hash or qualified.molecule is None:
        return LigandDepiction("unavailable", "qualified_input_incomplete")
    cache_key = depiction_cache_key(qualified.input_hash, width, height)
    try:
        mol = Chem.Mol(qualified.molecule)
        rdDepictor.Compute2DCoords(mol, canonOrient=True, clearConfs=True)
        mol = rdMolDraw2D.PrepareMolForDrawing(
            mol, kekulize=False, addChiralHs=False, wedgeBonds=True, forceCoords=False
        )
        drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
        drawer.DrawMolecule(mol)
        drawer.FinishDrawing()
        return LigandDepiction(
            "ready",
            cache_key=cache_key,
            svg=str(drawer.GetDrawingText()),
            input_hash=qualified.input_hash,
        )
    except (ValueError, RuntimeError, OverflowError):
        return LigandDepiction(
            "unavailable", "depiction_generation_failed", input_hash=qualified.input_hash
        )


def depict_ligand(
    structure: NormalizedStructureV1,
    atom_ids: list[int],
    *,
    original_bytes: bytes | None = None,
    width: int = 240,
    height: int = 180,
) -> LigandDepiction:
    _validate_dimensions(width, height)
    qualified = qualify_chemistry(structure, atom_ids, original_bytes=original_bytes)
    return depict_qualified(qualified, width=width, height=height)
