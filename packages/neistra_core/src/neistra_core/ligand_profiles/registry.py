"""Authoritative sourced threshold adaptations and shared presentation metadata."""

from __future__ import annotations

from typing import Any

from neistra_core.ligand_profiles.models import (
    DescriptorMethod,
    Operator,
    ProfileAxis,
    ProfileConstraint,
    ProfileDefinition,
    ProfileRegistry,
    ProfileSource,
    descriptor_numeric_rule,
    intersect_constraints,
)
from neistra_core.ligand_properties.registry import (
    DESCRIPTOR_DEFINITIONS,
    DESCRIPTOR_REGISTRY,
    IMPLEMENTATION_VERSION,
    LIBRARY_VERSION,
    POLICY_VERSION,
)

REGISTRY_VERSION = "ligand-profiles-v1"
_DESCRIPTOR_ORDER = tuple(DESCRIPTOR_REGISTRY)
_AXIS_ORDER = (
    "hbd",
    "hba",
    "tpsa",
    "molecular_weight",
    "heavy_atom_count",
    "heteroatom_count",
    "carbon_count",
    "formal_charge",
    "calculated_logp",
    "molar_refractivity",
    "rotatable_bond_count",
    "ring_count",
    "aromatic_ring_count",
    "fraction_sp3",
)
_AXES = tuple(
    ProfileAxis(
        id=key,
        descriptor_id=key,
        numeric_rule=descriptor_numeric_rule(DESCRIPTOR_REGISTRY[key]),
        domain=DESCRIPTOR_REGISTRY[key].plot_domain,
    )
    for key in _AXIS_ORDER
)

_SOURCES = (
    ProfileSource(
        id="lipinski-1997",
        title="Ro5 source: Lipinski et al. (1997)",
        doi="10.1016/S0169-409X(96)00423-1",
        url="https://www.sciencedirect.com/science/article/pii/S0169409X96004231",
        scope="Size, partition estimate and hydrogen-bond counts. The application uses an "
        "explicit all-four conjunction rather than a validated absorption prediction.",
    ),
    ProfileSource(
        id="congreve-2003",
        title="Core Ro3 source: Congreve et al. (2003), with author clarification",
        doi="10.1016/S1359-6446(03)02831-9",
        url="https://doi.org/10.1016/S1359-6446(03)02831-9",
        scope="Core fragment-library criteria; author clarification DOI10.1038/nrd3926-c1. "
        "Additional polar-surface-area and rotor proposals are not part of this core variant.",
    ),
    ProfileSource(
        id="veber-2002",
        title="Polar surface area and flexibility source: Veber et al. (2002)",
        doi="10.1021/jm020017n",
        url="https://doi.org/10.1021/jm020017n",
        scope="Rotatable bonds and atom-based polar surface area. The paper's donor-plus-acceptor "
        "alternative is not an additional condition in this adaptation.",
    ),
    ProfileSource(
        id="doak-2014",
        title="Observed outer-envelope source: Doak et al. (2014)",
        doi="10.1016/j.chembiol.2014.08.013",
        url="https://doi.org/10.1016/j.chembiol.2014.08.013",
        scope="Approximate observed envelope in a source cohort with molecular weight above500. "
        "The cohort description is not an extra lower-weight threshold or a universal "
        "bRo5 definition.",
    ),
    ProfileSource(
        id="gleeson-2008",
        title="4/400 source: Gleeson (2008), section2.6",
        doi="10.1021/jm701122q",
        url="https://doi.org/10.1021/jm701122q",
        scope="A named two-property strict-limit adaptation, not the complete original "
        "ionization-dependent ADMET analysis.",
    ),
    ProfileSource(
        id="teague-1999",
        title="Lead-library range source: Teague et al. (1999)",
        doi="10.1002/(SICI)1521-3773(19991216)38:24<3743::AID-ANIE3743>3.0.CO;2-U",
        url="https://www.researchgate.net/publication/12665941_The_Design_of_Leadlike_Combinatorial_Libraries",
        scope="The source specifies ranges without endpoint operators. Closed endpoints and the "
        "conservative uncharged-representation domain are explicit application conventions.",
    ),
    ProfileSource(
        id="wager-2010",
        title="Continuous CNS MPO source: Wager et al. (2010)",
        doi="10.1021/cn100008c",
        url="https://pmc.ncbi.nlm.nih.gov/articles/PMC3368654/",
        scope="Six equally weighted continuous desirability terms, total 0-6; requires logD7.4 "
        "and most-basic pKa. Binary thresholds or zero-filled missing terms do not reproduce it.",
    ),
    ProfileSource(
        id="lee-schneider-2001",
        title="Scaffold/SOM method source: Lee and Schneider (2001)",
        doi="10.1021/cc000097l",
        url="https://pubmed.ncbi.nlm.nih.gov/11350252/",
        scope="Verified abstract describes scaffold clustering and pharmacophore assessment using "
        "a self-organizing map. A reproducible threshold preset was not established; full text "
        "was inaccessible. This is distinct from DOI10.1021/jm015507e.",
    ),
)


def _constraint(
    key: str, descriptor: str, operator: Operator, limit: int | float
) -> ProfileConstraint:
    return ProfileConstraint(id=key, descriptor_id=descriptor, operator=operator, limit=limit)


_CONSTRAINTS = (
    _constraint("mw-le-500", "molecular_weight", "le", 500),
    _constraint("logp-le-5", "calculated_logp", "le", 5),
    _constraint("hbd-le-5", "hbd", "le", 5),
    _constraint("hba-le-10", "hba", "le", 10),
    _constraint("mw-lt-300", "molecular_weight", "lt", 300),
    _constraint("logp-le-3", "calculated_logp", "le", 3),
    _constraint("hbd-le-3", "hbd", "le", 3),
    _constraint("hba-le-3", "hba", "le", 3),
    _constraint("rotors-le-10", "rotatable_bond_count", "le", 10),
    _constraint("tpsa-le-140", "tpsa", "le", 140),
    _constraint("mw-le-1000", "molecular_weight", "le", 1000),
    _constraint("logp-ge-minus2", "calculated_logp", "ge", -2),
    _constraint("logp-le-10", "calculated_logp", "le", 10),
    _constraint("hbd-le-6", "hbd", "le", 6),
    _constraint("hba-le-15", "hba", "le", 15),
    _constraint("tpsa-le-250", "tpsa", "le", 250),
    _constraint("rotors-le-20", "rotatable_bond_count", "le", 20),
    _constraint("mw-lt-400", "molecular_weight", "lt", 400),
    _constraint("logp-lt-4", "calculated_logp", "lt", 4),
    _constraint("mw-ge-100", "molecular_weight", "ge", 100),
    _constraint("mw-le-350", "molecular_weight", "le", 350),
    _constraint("logp-ge-1", "calculated_logp", "ge", 1),
)
_CONSTRAINT_BY_ID = {constraint.id: constraint for constraint in _CONSTRAINTS}
_FLATTENED: dict[str, tuple[ProfileConstraint, ...]] = {}


def _available(
    profile_id: str,
    name: str,
    description: str,
    source_ids: tuple[str, ...],
    adaptations: tuple[str, ...],
    constraint_ids: tuple[str, ...] = (),
    component_ids: tuple[str, ...] = (),
    *,
    uncharged_domain: bool = False,
) -> ProfileDefinition:
    selected = {key: _CONSTRAINT_BY_ID[key] for key in constraint_ids}
    for component in component_ids:
        for constraint in _FLATTENED[component]:
            selected[constraint.id] = constraint
    flattened = tuple(selected.values())
    _FLATTENED[profile_id] = flattened
    required = {constraint.descriptor_id for constraint in flattened}
    return ProfileDefinition(
        id=profile_id,
        name=name,
        description=description,
        definition_version=f"{profile_id}-v1",
        availability="available",
        source_ids=source_ids,
        adaptations=adaptations,
        constraint_ids=constraint_ids,
        component_ids=component_ids,
        required_descriptor_ids=tuple(key for key in _DESCRIPTOR_ORDER if key in required),
        source_domain="no_formally_charged_atoms"
        if uncharged_domain
        else "qualified_representation",
        axis_ids=_AXIS_ORDER,
        default_filter_ranges=intersect_constraints(flattened, _DESCRIPTOR_ORDER),
    )


_PROFILES = (
    _available(
        "ro5",
        "Ro5 — all four",
        "All four named physicochemical limits must hold.",
        ("lipinski-1997",),
        (
            "Application all-four conjunction; this is not an absorption or clinical-success "
            "prediction.",
            "Uses average molecular weight, CalcNumHBD/CalcNumHBA and hydrogen-inclusive "
            "Crippen logP. "
            "The source's alternative MlogP≤4.15 is not this descriptor mapping.",
        ),
        ("mw-le-500", "logp-le-5", "hbd-le-5", "hba-le-10"),
    ),
    _available(
        "ro3",
        "Ro3 — core",
        "Core fragment-library size, partition and hydrogen-bond criteria.",
        ("congreve-2003",),
        (
            "Molecular-weight limit is strictly below300; logP/donor/acceptor limits "
            "are inclusive.",
            "No additional TPSA or rotor condition is included. Uses the pinned descriptor "
            "mappings.",
        ),
        ("mw-lt-300", "logp-le-3", "hbd-le-3", "hba-le-3"),
    ),
    _available(
        "veber",
        "Veber — toolkit adaptation",
        "Both flexibility and polar surface area limits.",
        ("veber-2002",),
        (
            "Uses Strict toolkit rotors, which also exclude esters; the original definition "
            "excludes "
            "amide rotation. Uses atom-based TPSA with sulfur/phosphorus terms excluded.",
            "The paper's HBD+HBA≤12 alternative is not an extra condition.",
        ),
        ("rotors-le-10", "tpsa-le-140"),
    ),
    _available(
        "ro5-veber",
        "Ro5 + Veber",
        "Shared conjunction of Ro5 and Veber definitions.",
        ("lipinski-1997", "veber-2002"),
        ("Application composite references existing profiles and constraints without new limits.",),
        component_ids=("ro5", "veber"),
    ),
    _available(
        "doak-outer-envelope",
        "Doak — outer envelope",
        "Approximate observed physicochemical envelope.",
        ("doak-2014",),
        (
            "Inclusive outer limits map to the pinned toolkit, rather than the source's "
            "calculator.",
            "The source cohort had MW>500; no lower-MW condition is invented. Membership is not a "
            "universal bRo5, oral-availability or druggability definition.",
        ),
        (
            "mw-le-1000",
            "logp-ge-minus2",
            "logp-le-10",
            "hbd-le-6",
            "hba-le-15",
            "tpsa-le-250",
            "rotors-le-20",
        ),
    ),
    _available(
        "gleeson-4-400",
        "Gleeson — 4/400",
        "Two-property strict 4/400 adaptation.",
        ("gleeson-2008",),
        (
            "Both MW<400 and calculated logP<4 are strict. This omits the source's broader "
            "ionization-dependent ADMET analysis and is not its complete method.",
        ),
        ("mw-lt-400", "logp-lt-4"),
    ),
    _available(
        "teague-lead-range",
        "Teague — lead-library range",
        "Named molecular-weight and partition ranges.",
        ("teague-1999",),
        (
            "Closed ranges are an explicit application endpoint convention.",
            "Applicable only when the same qualified input proves no formally charged atoms; "
            "net chargezero is insufficient. This also excludes charge-separated neutral graphs, "
            "including nitro representations. No neutralization or pKa inference is performed.",
        ),
        ("mw-ge-100", "mw-le-350", "logp-ge-1", "logp-le-3"),
        uncharged_domain=True,
    ),
    ProfileDefinition(
        id="cns-mpo",
        name="CNS MPO — unavailable",
        description="Original continuous desirability method requires unavailable "
        "descriptor inputs.",
        definition_version="cns-mpo-unavailable-v1",
        availability="unavailable",
        unavailable_reason="Required logD at pH7.4 and most-basic pKa are not calculated.",
        missing_inputs=("logd_ph_7_4", "most_basic_pka"),
        source_ids=("wager-2010",),
        adaptations=(
            "No binary threshold substitute, partial total or zero-filled score is supplied.",
        ),
        axis_ids=_AXIS_ORDER,
    ),
    ProfileDefinition(
        id="scaffold-som",
        name="Scaffold/SOM method — unavailable",
        description="Scaffold clustering and pharmacophore/SOM method is not a threshold preset.",
        definition_version="scaffold-som-unavailable-v1",
        availability="unavailable",
        unavailable_reason="The verified source did not establish a reproducible threshold preset.",
        missing_inputs=("reproducible_scaffold_som_method",),
        source_ids=("lee-schneider-2001",),
        adaptations=(
            "Full text was inaccessible. No limits from a differently attributed method "
            "are substituted.",
        ),
        axis_ids=_AXIS_ORDER,
    ),
)

PROFILE_REGISTRY = ProfileRegistry(
    registry_version=REGISTRY_VERSION,
    descriptor_method=DescriptorMethod(
        implementation_version=IMPLEMENTATION_VERSION,
        policy_version=POLICY_VERSION,
        library_version=LIBRARY_VERSION,
    ),
    descriptors=DESCRIPTOR_DEFINITIONS,
    sources=_SOURCES,
    constraints=_CONSTRAINTS,
    axes=_AXES,
    profiles=_PROFILES,
    limitations=(
        "Threshold adaptations are descriptive criteria, not experimental, permeability, CNS "
        "exposure, clinical-success or binding-affinity predictions.",
        "Exact unrounded values and strict/inclusive operators determine compliance. Display "
        "rounding, radar clipping and polygon area do not change it or supply a validated score.",
        "Missing, invalid, stale or unsupported inputs remain distinct from zero and from failure. "
        "No protonation, tautomer, stereochemistry or salt composition is silently changed.",
    ),
)


def profile_registry_document() -> dict[str, Any]:
    """Fresh JSON-compatible metadata for API and all generic browser consumers."""
    return PROFILE_REGISTRY.model_dump(mode="json")
