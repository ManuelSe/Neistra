"""Versioned descriptor definitions shared by calculation and presentation."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from types import MappingProxyType

from rdkit import rdBase

from neistra_core.ligand_properties.models import DescriptorCategory, DescriptorDefinition

IMPLEMENTATION_VERSION = "ligand-properties-v1"
POLICY_VERSION = "strict-current-graph-terminal-h-cip-v2"
LIBRARY_VERSION: str = rdBase.rdkitVersion
MAX_PROPERTY_ATOMS = 1024
MAX_PROPERTY_BONDS = 4096
MAX_CIP_RECURSIVE_ITERATIONS = 100_000


def _definition(
    key: str,
    name: str,
    description: str,
    category: DescriptorCategory,
    unit: str | None,
    method: str,
    domain: tuple[float, float],
    *,
    integer: bool = False,
    depends_on: str = "qualified_graph",
) -> DescriptorDefinition:
    return DescriptorDefinition(
        id=key,
        name=name,
        description=description,
        category=category,
        order=0,
        unit=unit,
        value_type="integer" if integer else "float",
        method=method,
        implementation_version=IMPLEMENTATION_VERSION,
        library_version=LIBRARY_VERSION,
        policy_version=POLICY_VERSION,
        plot_domain=domain,
        depends_on=depends_on,
    )


_DEFINITIONS = (
    _definition(
        "molecular_weight",
        "Molecular weight",
        "Average atomic-weight molecular mass.",
        "composition",
        "g/mol",
        "RDKit.Descriptors.MolWt",
        (0, 1000),
    ),
    _definition(
        "heavy_atom_count",
        "Heavy atoms",
        "Designated atoms with atomic number above 1.",
        "composition",
        None,
        "observed atomic number > 1",
        (0, 100),
        integer=True,
        depends_on="observed_elements",
    ),
    _definition(
        "heteroatom_count",
        "Heteroatoms",
        "Designated atoms other than hydrogen or carbon.",
        "composition",
        None,
        "observed atomic number not in {1,6}",
        (0, 50),
        integer=True,
        depends_on="observed_elements",
    ),
    _definition(
        "carbon_count",
        "Carbon atoms",
        "Designated atoms with atomic number 6.",
        "composition",
        None,
        "observed atomic number == 6",
        (0, 100),
        integer=True,
        depends_on="observed_elements",
    ),
    _definition(
        "formal_charge",
        "Formal charge",
        "Sum of fully qualified atomic formal charges.",
        "composition",
        "e",
        "qualified atomic formal-charge sum",
        (-5, 5),
        integer=True,
        depends_on="qualified_atomic_charge",
    ),
    _definition(
        "hbd",
        "Hydrogen bond donors",
        "RDKit donor definition; not CalcLipinskiHBD.",
        "polarity",
        None,
        "RDKit.rdMolDescriptors.CalcNumHBD",
        (0, 10),
        integer=True,
    ),
    _definition(
        "hba",
        "Hydrogen bond acceptors",
        "RDKit acceptor definition; not CalcLipinskiHBA.",
        "polarity",
        None,
        "RDKit.rdMolDescriptors.CalcNumHBA",
        (0, 20),
        integer=True,
    ),
    _definition(
        "tpsa",
        "Topological polar surface area",
        "Fragment-based polar surface area; sulfur/phosphorus terms excluded.",
        "polarity",
        "Å²",
        "RDKit.CalcTPSA(includeSandP=False)",
        (0, 250),
    ),
    _definition(
        "calculated_logp",
        "Calculated logP",
        "Wildman-Crippen calculated partition estimate.",
        "lipophilicity",
        None,
        "RDKit.CalcCrippenDescriptors(includeHs=True)[0]",
        (-2, 10),
    ),
    _definition(
        "molar_refractivity",
        "Molar refractivity",
        "Wildman-Crippen molar refractivity.",
        "lipophilicity",
        "cm³/mol",
        "RDKit.CalcCrippenDescriptors(includeHs=True)[1]",
        (0, 250),
    ),
    _definition(
        "rotatable_bond_count",
        "Rotatable bonds",
        "RDKit Strict rotatable-bond definition.",
        "flexibility",
        None,
        "RDKit.CalcNumRotatableBonds(Strict)",
        (0, 20),
        integer=True,
    ),
    _definition(
        "ring_count",
        "Rings",
        "RDKit perceived rings; not the graph cycle rank.",
        "flexibility",
        None,
        "RDKit.CalcNumRings",
        (0, 10),
        integer=True,
    ),
    _definition(
        "aromatic_ring_count",
        "Aromatic rings",
        "Aromatic rings in the pinned perceived set.",
        "flexibility",
        None,
        "RDKit.CalcNumAromaticRings",
        (0, 10),
        integer=True,
    ),
    _definition(
        "fraction_sp3",
        "Fraction sp³ carbon",
        "sp³ carbons / all carbons; requires carbon.",
        "flexibility",
        None,
        "RDKit.CalcFractionCSP3; carbon_count > 0",
        (0, 1),
    ),
)

DESCRIPTOR_DEFINITIONS = tuple(
    definition.model_copy(update={"order": order}) for order, definition in enumerate(_DEFINITIONS)
)
DESCRIPTOR_REGISTRY: Mapping[str, DescriptorDefinition] = MappingProxyType(
    {definition.id: definition for definition in DESCRIPTOR_DEFINITIONS}
)


def descriptor_definition(descriptor_id: str) -> DescriptorDefinition:
    return DESCRIPTOR_REGISTRY[descriptor_id]


def descriptor_coverage(descriptor_ids: Iterable[str] | None = None) -> tuple[str, ...]:
    """Validate requested coverage and return stable registry order, never caller order."""
    if descriptor_ids is None:
        return tuple(DESCRIPTOR_REGISTRY)
    requested = set(descriptor_ids)
    unknown = requested - DESCRIPTOR_REGISTRY.keys()
    if unknown:
        raise ValueError(f"Unknown descriptor: {', '.join(sorted(unknown))}")
    return tuple(key for key in DESCRIPTOR_REGISTRY if key in requested)
