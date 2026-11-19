"""Strict disposable descriptor preparation and coordinate-independent input identity."""

from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

from rdkit import Chem
from rdkit.Chem import rdCIPLabeler

from neistra_core.hydrogen_protection import AtomProtection, protection_facts
from neistra_core.ligand_properties.registry import (
    IMPLEMENTATION_VERSION,
    LIBRARY_VERSION,
    MAX_CIP_RECURSIVE_ITERATIONS,
    MAX_PROPERTY_ATOMS,
    MAX_PROPERTY_BONDS,
    POLICY_VERSION,
)
from neistra_core.ligands.chemistry import prepare_chemistry
from neistra_core.molecular import Atom, Bond, InferenceRecord, NormalizedStructureV1

_ATOMIC_NUMBERS = {
    Chem.GetPeriodicTable().GetElementSymbol(number): number for number in range(1, 119)
} | {"D": 1, "T": 1}
_SUPPORTED_ELEMENTS = frozenset({1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 33, 34, 35, 53})
_GEOMETRY_ONLY_INFERENCES = frozenset({"coordinates_generated", "smiles_coordinates_generated"})
_SUPPORTED_CHIRAL_TAGS = frozenset(
    {
        Chem.ChiralType.CHI_UNSPECIFIED,
        Chem.ChiralType.CHI_TETRAHEDRAL_CW,
        Chem.ChiralType.CHI_TETRAHEDRAL_CCW,
    }
)
_SUPPORTED_BOND_STEREO = frozenset(
    {
        Chem.BondStereo.STEREONONE,
        Chem.BondStereo.STEREOZ,
        Chem.BondStereo.STEREOE,
        Chem.BondStereo.STEREOCIS,
        Chem.BondStereo.STEREOTRANS,
    }
)


@dataclass(frozen=True, slots=True)
class PreparedDescriptorInput:
    """A single immutable interpretation boundary; native molecules stay private.

    This is a short-lived calculation context, not a persistent cache value.
    Current project/source/instance ownership belongs to the caller's binding.
    """

    input_hash: str
    model_reason: str | None
    known_values: tuple[tuple[str, int | None], ...]
    contains_formally_charged_atoms: bool | None
    provenance: tuple[str, ...]
    _molecule: Any = field(default=None, repr=False, compare=False)

    def __post_init__(self) -> None:
        if (self.model_reason is None) != (self._molecule is not None):
            raise ValueError("A qualified preparation requires its private disposable molecule")


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _signature(molecule: Any) -> str:
    """Only supported chemical semantics; no coordinates, maps or display properties."""
    copy = Chem.Mol(molecule)
    copy.RemoveAllConformers()
    for atom in copy.GetAtoms():
        atom.SetAtomMapNum(0)
    params: Any = Chem.SmilesWriteParams()
    params.canonical = True
    params.doIsomericSmiles = True
    params.allHsExplicit = True
    params.allBondsExplicit = True
    return str(
        Chem.MolToCXSmiles(
            copy,
            params,
            Chem.CXSmilesFields.CX_RADICALS | Chem.CXSmilesFields.CX_ENHANCEDSTEREO,
        )
    )


def _hydrogen_inventory(molecule: Any) -> int:
    return sum(
        1 if atom.GetAtomicNum() == 1 else int(atom.GetTotalNumHs(includeNeighbors=False))
        for atom in molecule.GetAtoms()
    )


def _absolute_stereo_labels(
    molecule: Any,
    atoms: list[Atom],
    bonds: list[Bond],
) -> tuple[dict[int, str | None], dict[int, str | None]]:
    """Joint stereo/evidence colors after proving the native/current correspondence.

    CIP is assigned on a disposable physical molecule, not the identity-only
    incidence graph. Relative CW/CCW tags are checked solely to prove mapping;
    they never become qualified canonical colors.
    """
    copy = Chem.Mol(molecule)
    copy.RemoveAllConformers()
    if copy.GetNumAtoms() != len(atoms) or copy.GetNumBonds() != len(bonds):
        raise ValueError("descriptor_evidence_mapping_not_qualified")
    positions = {atom.id: position for position, atom in enumerate(atoms)}
    for current, native in zip(atoms, copy.GetAtoms(), strict=True):
        tag = str(native.GetChiralTag()).removeprefix("CHI_")
        if (
            current.element != native.GetSymbol()
            or current.formal_charge != native.GetFormalCharge()
            or (current.stereo or "UNSPECIFIED") != tag
        ):
            raise ValueError("descriptor_evidence_mapping_not_qualified")
        if native.HasProp("_CIPCode"):
            native.ClearProp("_CIPCode")
    native_bonds: dict[int, Any] = {}
    neighbor_order: dict[int, list[int]] = defaultdict(list)
    for current_bond in bonds:
        if current_bond.atom_1_id not in positions or current_bond.atom_2_id not in positions:
            raise ValueError("descriptor_evidence_mapping_not_qualified")
        neighbor_order[current_bond.atom_1_id].append(current_bond.atom_2_id)
        neighbor_order[current_bond.atom_2_id].append(current_bond.atom_1_id)
        native = copy.GetBondBetweenAtoms(
            positions[current_bond.atom_1_id],
            positions[current_bond.atom_2_id],
        )
        if native is None or (
            current_bond.order != native.GetBondTypeAsDouble()
            or current_bond.aromatic != native.GetIsAromatic()
            or (current_bond.stereo or "NONE") != str(native.GetStereo()).removeprefix("STEREO")
        ):
            raise ValueError("descriptor_evidence_mapping_not_qualified")
        native_bonds[current_bond.id] = native
        if native.HasProp("_CIPCode"):
            native.ClearProp("_CIPCode")
    if len({native.GetIdx() for native in native_bonds.values()}) != len(bonds):
        raise ValueError("descriptor_evidence_mapping_not_qualified")
    for current, native in zip(atoms, copy.GetAtoms(), strict=True):
        if current.stereo and neighbor_order[current.id] != [
            atoms[neighbor.GetIdx()].id for neighbor in native.GetNeighbors()
        ]:
            # A relative tetrahedral tag is meaningful only in its proved
            # neighbor frame. Do not infer parity for a reordered frame.
            raise ValueError("descriptor_evidence_mapping_not_qualified")
    try:
        rdCIPLabeler.AssignCIPLabels(copy, maxRecursiveIterations=MAX_CIP_RECURSIVE_ITERATIONS)
    except (RuntimeError, ValueError, OverflowError) as error:
        raise ValueError("descriptor_stereo_assignment_not_qualified") from error
    atom_labels: dict[int, str | None] = {}
    for current, native in zip(atoms, copy.GetAtoms(), strict=True):
        code = native.GetProp("_CIPCode") if native.HasProp("_CIPCode") else None
        specified = native.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED
        if (specified and code not in {"R", "S", "r", "s"}) or (not specified and code):
            raise ValueError("descriptor_stereo_assignment_not_qualified")
        atom_labels[current.id] = code
    bond_labels: dict[int, str | None] = {}
    for current_bond in bonds:
        native = native_bonds[current_bond.id]
        code = native.GetProp("_CIPCode") if native.HasProp("_CIPCode") else None
        specified = native.GetStereo() != Chem.BondStereo.STEREONONE
        if (specified and code not in {"E", "Z"}) or (not specified and code):
            raise ValueError("descriptor_stereo_assignment_not_qualified")
        bond_labels[current_bond.id] = code
    return atom_labels, bond_labels


def _model_reason(molecule: Any) -> str | None:
    if molecule.GetStereoGroups() or Chem.GetMolSubstanceGroups(molecule):
        return "enhanced_stereo_or_substance_groups_unsupported"
    for atom in molecule.GetAtoms():
        if atom.HasQuery() or atom.GetAtomicNum() <= 0:
            return "query_or_dummy_representation_unsupported"
        if atom.GetIsotope():
            return "isotope_model_not_qualified"
        if atom.GetNumRadicalElectrons():
            return "radical_model_not_qualified"
        if atom.GetAtomicNum() not in _SUPPORTED_ELEMENTS:
            return "element_model_not_qualified"
        if atom.GetChiralTag() not in _SUPPORTED_CHIRAL_TAGS:
            return "nonstandard_stereochemistry_unsupported"
        if atom.GetAtomicNum() == 1:
            neighbors = tuple(atom.GetNeighbors())
            if (
                atom.GetFormalCharge() != 0
                or len(neighbors) != 1
                or neighbors[0].GetAtomicNum() <= 1
                or molecule.GetBondBetweenAtoms(atom.GetIdx(), neighbors[0].GetIdx()).GetBondType()
                != Chem.BondType.SINGLE
            ):
                return "nonterminal_or_charged_hydrogen_unsupported"
    for bond in molecule.GetBonds():
        if bond.HasQuery() or bond.GetBondType() not in {
            Chem.BondType.SINGLE,
            Chem.BondType.DOUBLE,
            Chem.BondType.TRIPLE,
            Chem.BondType.AROMATIC,
        }:
            return "bond_model_not_qualified"
        if bond.GetStereo() not in _SUPPORTED_BOND_STEREO:
            return "nonstandard_stereochemistry_unsupported"
    return None


def _normalize_hydrogens(molecule: Any) -> Any:
    """Remove only admitted ordinary terminal H, checking a full expanded roundtrip."""
    before = Chem.Mol(molecule)
    params: Any = Chem.RemoveHsParameters()
    params.removeDegreeZero = False
    params.removeHigherDegrees = False
    params.removeOnlyHNeighbors = False
    params.removeIsotopes = False
    params.removeAndTrackIsotopes = False
    params.removeHydrides = False
    params.removeDummyNeighbors = False
    params.removeWithQuery = False
    params.removeDefiningBondStereo = False
    params.removeWithWedgedBond = False
    params.removeNontetrahedralNeighbors = False
    params.removeInSGroups = False
    params.removeMapped = False
    params.removeNonimplicit = True
    params.updateExplicitCount = True
    # Atom maps are source labels, not hydrogen protection or molecular chemistry.
    for atom in before.GetAtoms():
        atom.SetAtomMapNum(0)
    normalized = Chem.RemoveHs(before, params, sanitize=True)
    if any(atom.GetAtomicNum() == 1 for atom in normalized.GetAtoms()):
        raise ValueError("hydrogen_normalization_not_qualified")
    if (
        _hydrogen_inventory(before) != _hydrogen_inventory(normalized)
        or Chem.GetFormalCharge(before) != Chem.GetFormalCharge(normalized)
        or Counter(
            (atom.GetAtomicNum(), atom.GetIsotope(), atom.GetNumRadicalElectrons())
            for atom in before.GetAtoms()
            if atom.GetAtomicNum() != 1
        )
        != Counter(
            (atom.GetAtomicNum(), atom.GetIsotope(), atom.GetNumRadicalElectrons())
            for atom in normalized.GetAtoms()
        )
        or _signature(Chem.AddHs(before)) != _signature(Chem.AddHs(normalized))
    ):
        raise ValueError("hydrogen_normalization_changed_representation")
    return normalized


def _evidence_identity(
    atoms: list[Atom],
    bonds: list[Bond],
    facts: dict[int, AtomProtection],
    inferences: list[InferenceRecord],
    *,
    malformed_facts: bool,
    normalized: bool,
    absolute_stereo: tuple[dict[int, str | None], dict[int, str | None]] | None,
) -> dict[str, Any]:
    """Canonical labelled incidence graph for evidence, never a chemical input.

    Every vertex is a disposable dummy with an integer label for its full semantic
    tuple. Bond vertices retain edge attributes and parallel-edge identity. RDKit
    canonicalizes topology; labels include no atom IDs, source indices or geometry.
    The complete sorted label dictionary accompanies the topology, so isotope
    integers here cannot collide between different semantic dictionaries.
    """
    members = {atom.id: atom for atom in atoms}
    incident: dict[int, list[Bond]] = defaultdict(list)
    for bond in bonds:
        incident[bond.atom_1_id].append(bond)
        incident[bond.atom_2_id].append(bond)
    atom_inferences: dict[int, set[str]] = defaultdict(set)
    bond_inferences: dict[int, set[str]] = defaultdict(set)
    global_inferences: set[str] = set()
    for inference in inferences:
        if inference.code in _GEOMETRY_ONLY_INFERENCES:
            continue  # Geometry provenance is outside these graph-only inputs.
        if not inference.atom_ids and not inference.bond_ids:
            global_inferences.add(inference.code)
        for atom_id in inference.atom_ids:
            atom_inferences[atom_id].add(inference.code)
        for bond_id in inference.bond_ids:
            bond_inferences[bond_id].add(inference.code)
    omitted: set[int] = set()
    if normalized:
        for atom in atoms:
            if _ATOMIC_NUMBERS.get(atom.element) != 1 or atom.formal_charge != 0:
                continue
            edges = incident[atom.id]
            if len(edges) != 1 or edges[0].order != 1 or edges[0].aromatic:
                continue
            edge = edges[0]
            if (
                edge.inferred
                or bond_inferences[edge.id]
                or atom_inferences[atom.id]
                or any(value != "coordinates" for value in atom.inferred_fields)
                or edge.stereo not in {None, "NONE"}
            ):
                continue
            other = edge.atom_2_id if edge.atom_1_id == atom.id else edge.atom_1_id
            if other in members and _ATOMIC_NUMBERS.get(members[other].element, 0) > 1:
                omitted.add(atom.id)
    labels: dict[int, str] = {}
    for atom in atoms:
        if atom.id in omitted:
            continue
        fact = facts.get(atom.id)
        protection = (
            (fact.matches(atom), fact.element, fact.isotope, fact.radical_electrons)
            if fact
            else None
        )
        labels[atom.id] = _json(
            [
                "atom",
                atom.element,
                atom.formal_charge,
                absolute_stereo[0][atom.id] if absolute_stereo is not None else atom.stereo,
                bool(atom.alternate_location),
                protection,
                sorted(value for value in atom.inferred_fields if value != "coordinates"),
                sorted(atom_inferences[atom.id]),
            ]
        )
    edges = [
        bond for bond in bonds if bond.atom_1_id not in omitted and bond.atom_2_id not in omitted
    ]
    edge_labels = [
        _json(
            [
                "bond",
                bond.order,
                bond.aromatic,
                bond.inferred,
                absolute_stereo[1][bond.id] if absolute_stereo is not None else bond.stereo,
                sorted(bond_inferences[bond.id]),
            ]
        )
        for bond in edges
    ]
    dictionary = sorted(set(labels.values()) | set(edge_labels))
    if absolute_stereo is None and (
        any(atom.stereo for atom in atoms)
        or any(bond.stereo not in {None, "NONE"} for bond in bonds)
    ):
        # Without proved absolute labels there is no safe stereo-aware graph
        # orbit. Preserve the complete ordered available evidence and frame,
        # deliberately giving up renumbering reuse for these unavailable inputs.
        # Position indices are local serialization positions, not source IDs.
        positions = {atom.id: position for position, atom in enumerate(atoms)}
        return {
            "method": "ordered_unavailable_stereo_evidence_v1",
            "atoms": [labels[atom.id] for atom in atoms],
            "bonds": [
                [positions.get(bond.atom_1_id), positions.get(bond.atom_2_id), label]
                for bond, label in zip(edges, edge_labels, strict=True)
            ],
            "malformed_facts": malformed_facts,
            "global_inferences": sorted(global_inferences),
        }
    numbers = {value: index + 1 for index, value in enumerate(dictionary)}
    graph = Chem.RWMol()
    vertices: dict[int, int] = {}
    for atom_id, label in labels.items():
        atom = Chem.Atom(0)
        atom.SetNoImplicit(True)
        atom.SetIsotope(numbers[label])
        vertices[atom_id] = graph.AddAtom(atom)
    for edge, label in zip(edges, edge_labels, strict=True):
        atom = Chem.Atom(0)
        atom.SetNoImplicit(True)
        atom.SetIsotope(numbers[label])
        vertex = graph.AddAtom(atom)
        for endpoint in (edge.atom_1_id, edge.atom_2_id):
            if endpoint in vertices:
                graph.AddBond(vertex, vertices[endpoint], Chem.BondType.SINGLE)
    topology = Chem.MolToSmiles(
        graph.GetMol(),
        canonical=True,
        isomericSmiles=True,
        allBondsExplicit=True,
        allHsExplicit=True,
    )
    return {
        "labels": dictionary,
        "topology": topology,
        "malformed_facts": malformed_facts,
        "global_inferences": sorted(global_inferences),
    }


def prepare_descriptor_input(
    structure: NormalizedStructureV1,
    atom_ids: list[int] | tuple[int, ...],
    *,
    original_bytes: bytes | None = None,
) -> PreparedDescriptorInput:
    """Interpret exactly the requested canonical members, without mutating input."""
    members = set(atom_ids)
    all_atoms = {atom.id: atom for atom in structure.atoms}
    reason: str | None = None
    if (
        not members
        or len(members) != len(atom_ids)
        or not members <= all_atoms.keys()
        or any(type(atom_id) is not int or atom_id < 1 for atom_id in atom_ids)
    ):
        reason = "invalid_candidate_membership"
    elif len(members) > MAX_PROPERTY_ATOMS:
        reason = "property_atom_limit"
    atoms = [all_atoms[key] for key in sorted(members) if key in all_atoms]
    bonds = [
        bond for bond in structure.bonds if bond.atom_1_id in members or bond.atom_2_id in members
    ]
    if reason is None and len(bonds) > MAX_PROPERTY_BONDS:
        reason = "property_bond_limit"
    malformed_facts = False
    try:
        facts = protection_facts(structure)
    except ValueError:
        facts, malformed_facts = {}, True
    qualified = None
    molecule = None
    provenance: tuple[str, ...] = ()
    representation = None
    absolute_stereo = None
    if reason is None:
        qualified = prepare_chemistry(structure, original_bytes=original_bytes).qualify(
            sorted(members)
        )
        provenance = (qualified.provenance,) if qualified.provenance else ()
        if any(bond.inferred for bond in bonds):
            provenance += ("contains_inferred_bonds",)
        if any(any(value != "coordinates" for value in atom.inferred_fields) for atom in atoms):
            provenance += ("contains_inferred_atomic_fields",)
        reason = qualified.reason if qualified.status != "qualified" else None
        if reason is None:
            try:
                molecule = Chem.Mol(qualified.molecule)
                representation = _signature(molecule)
                reason = _model_reason(molecule)
                if reason is None:
                    absolute_stereo = _absolute_stereo_labels(molecule, atoms, bonds)
                    molecule = _normalize_hydrogens(molecule)
                    representation = _signature(molecule)
            except (ValueError, RuntimeError, OverflowError) as error:
                code = str(error)
                molecule, reason = (
                    None,
                    (
                        code
                        if code
                        in {
                            "descriptor_evidence_mapping_not_qualified",
                            "descriptor_stereo_assignment_not_qualified",
                        }
                        else "descriptor_preparation_not_qualified"
                    ),
                )
                absolute_stereo = None
    valid_membership = (
        bool(members)
        and len(members) == len(atom_ids)
        and members <= all_atoms.keys()
        and len(members) <= MAX_PROPERTY_ATOMS
        and len(bonds) <= MAX_PROPERTY_BONDS
        and all(type(atom_id) is int and atom_id > 0 for atom_id in atom_ids)
    )
    numbers = [_ATOMIC_NUMBERS.get(atom.element) for atom in atoms]
    known_elements = valid_membership and all(number is not None for number in numbers)
    observed = {
        "heavy_atom_count": sum(number > 1 for number in numbers if number is not None),
        "carbon_count": numbers.count(6),
        "heteroatom_count": sum(number not in {1, 6} for number in numbers if number is not None),
    }
    known: dict[str, int | None] = {
        key: value if known_elements else None for key, value in observed.items()
    }
    charge_known = [
        atom.formal_charge is not None
        and (
            (qualified is not None and qualified.status == "qualified")
            or (
                not malformed_facts
                and atom.id in facts
                and facts[atom.id].matches(atom)
                and _ATOMIC_NUMBERS.get(atom.element) is not None
            )
        )
        for atom in atoms
    ]
    if reason and ("query" in reason or "dummy" in reason):
        charge_known = [False] * len(atoms)
    charge_presence: bool | None = None
    if valid_membership:
        if any(
            known_charge and atom.formal_charge != 0
            for atom, known_charge in zip(atoms, charge_known, strict=True)
        ):
            charge_presence = True
        elif all(charge_known):
            charge_presence = False
    known["formal_charge"] = (
        sum(atom.formal_charge for atom in atoms if atom.formal_charge is not None)
        if valid_membership and all(charge_known)
        else None
    )
    # Resource-refused inputs do not enter potentially expensive graph
    # canonicalization. They cannot provide reusable scientific content.
    evidence = (
        _evidence_identity(
            atoms,
            bonds,
            facts,
            structure.inferences,
            malformed_facts=malformed_facts,
            normalized=reason is None,
            absolute_stereo=absolute_stereo,
        )
        if valid_membership
        else {"refused": reason, "membership": sorted(members)}
    )
    identity = {
        "implementation": IMPLEMENTATION_VERSION,
        "policy": POLICY_VERSION,
        "library": LIBRARY_VERSION,
        "stereo_evidence": "rdkit-absolute-cip-v1",
        "max_cip_recursive_iterations": MAX_CIP_RECURSIVE_ITERATIONS,
        "representation": representation,
        "evidence": evidence,
        "qualification": provenance,
        "model_reason": reason,
    }
    return PreparedDescriptorInput(
        input_hash=hashlib.sha256(_json(identity).encode()).hexdigest(),
        model_reason=reason,
        known_values=tuple(known.items()),
        contains_formally_charged_atoms=charge_presence,
        provenance=provenance,
        _molecule=molecule if reason is None else None,
    )
