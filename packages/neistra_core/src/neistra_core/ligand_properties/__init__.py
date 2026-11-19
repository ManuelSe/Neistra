"""Versioned strict ligand descriptor kernel; current publication is caller-owned."""

from neistra_core.ligand_properties.calculate import calculate_prepared, calculate_properties
from neistra_core.ligand_properties.input import PreparedDescriptorInput, prepare_descriptor_input
from neistra_core.ligand_properties.models import (
    DescriptorDefinition,
    DescriptorReport,
    DescriptorValue,
)
from neistra_core.ligand_properties.registry import (
    DESCRIPTOR_DEFINITIONS,
    DESCRIPTOR_REGISTRY,
    IMPLEMENTATION_VERSION,
    LIBRARY_VERSION,
    MAX_CIP_RECURSIVE_ITERATIONS,
    MAX_PROPERTY_ATOMS,
    MAX_PROPERTY_BONDS,
    POLICY_VERSION,
    descriptor_coverage,
    descriptor_definition,
)

__all__ = [
    "DESCRIPTOR_DEFINITIONS",
    "DESCRIPTOR_REGISTRY",
    "IMPLEMENTATION_VERSION",
    "LIBRARY_VERSION",
    "MAX_CIP_RECURSIVE_ITERATIONS",
    "MAX_PROPERTY_ATOMS",
    "MAX_PROPERTY_BONDS",
    "POLICY_VERSION",
    "DescriptorDefinition",
    "DescriptorReport",
    "DescriptorValue",
    "PreparedDescriptorInput",
    "calculate_prepared",
    "calculate_properties",
    "descriptor_coverage",
    "descriptor_definition",
    "prepare_descriptor_input",
]
