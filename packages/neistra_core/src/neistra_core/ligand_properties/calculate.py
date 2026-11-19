"""Independent descriptor outcomes on one qualified disposable representation."""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable
from datetime import UTC, datetime
from typing import Any

from rdkit import Chem
from rdkit.Chem import Descriptors, rdMolDescriptors

from neistra_core.ligand_properties.input import PreparedDescriptorInput, prepare_descriptor_input
from neistra_core.ligand_properties.models import DescriptorReport, DescriptorValue
from neistra_core.ligand_properties.registry import (
    DESCRIPTOR_REGISTRY,
    IMPLEMENTATION_VERSION,
    LIBRARY_VERSION,
    POLICY_VERSION,
    descriptor_coverage,
)
from neistra_core.molecular import NormalizedStructureV1

_descriptors: Any = Descriptors
_CALCULATORS: dict[str, Callable[[Any], int | float]] = {
    "molecular_weight": lambda mol: float(_descriptors.MolWt(mol)),
    "hbd": lambda mol: int(rdMolDescriptors.CalcNumHBD(mol)),
    "hba": lambda mol: int(rdMolDescriptors.CalcNumHBA(mol)),
    "tpsa": lambda mol: float(rdMolDescriptors.CalcTPSA(mol, includeSandP=False)),
    "calculated_logp": lambda mol: float(
        rdMolDescriptors.CalcCrippenDescriptors(mol, includeHs=True, force=True)[0]
    ),
    "molar_refractivity": lambda mol: float(
        rdMolDescriptors.CalcCrippenDescriptors(mol, includeHs=True, force=True)[1]
    ),
    "rotatable_bond_count": lambda mol: int(
        rdMolDescriptors.CalcNumRotatableBonds(
            mol,
            rdMolDescriptors.NumRotatableBondsOptions.Strict,
        )
    ),
    "ring_count": lambda mol: int(rdMolDescriptors.CalcNumRings(mol)),
    "aromatic_ring_count": lambda mol: int(rdMolDescriptors.CalcNumAromaticRings(mol)),
    "fraction_sp3": lambda mol: float(rdMolDescriptors.CalcFractionCSP3(mol)),
}


def calculate_prepared(
    prepared: PreparedDescriptorInput,
    descriptor_ids: Iterable[str] | None = None,
) -> DescriptorReport:
    coverage = descriptor_coverage(descriptor_ids)
    known = dict(prepared.known_values)
    # A private disposable copy prevents native descriptor caches from changing
    # either the caller's molecular model or a reused preparation context.
    molecule = Chem.Mol(prepared._molecule) if prepared._molecule is not None else None
    outcomes: list[DescriptorValue] = []
    for key in coverage:
        if key in known:
            value = known[key]
            outcomes.append(
                DescriptorValue(
                    descriptor_id=key,
                    status="ready" if value is not None else "unavailable",
                    value=value,
                    reason=None
                    if value is not None
                    else (
                        "atomic_charge_not_qualified"
                        if key == "formal_charge"
                        else "element_identity_not_qualified"
                    ),
                )
            )
            continue
        if prepared.model_reason is not None or molecule is None:
            outcomes.append(
                DescriptorValue(
                    descriptor_id=key,
                    status="unavailable",
                    reason=prepared.model_reason or "chemical_representation_not_qualified",
                )
            )
            continue
        if key == "fraction_sp3" and known["carbon_count"] == 0:
            outcomes.append(
                DescriptorValue(
                    descriptor_id=key,
                    status="unavailable",
                    reason="no_carbon_atoms",
                )
            )
            continue
        try:
            calculated = _CALCULATORS[key](molecule)
            if type(calculated) not in {int, float} or not math.isfinite(calculated):
                reason = "descriptor_returned_nonfinite_value"
            elif DESCRIPTOR_REGISTRY[key].value_type == "integer" and type(calculated) is not int:
                reason = "descriptor_returned_noninteger_value"
            else:
                outcomes.append(
                    DescriptorValue(descriptor_id=key, status="ready", value=calculated)
                )
                continue
        except (ValueError, RuntimeError, OverflowError, ZeroDivisionError, TypeError):
            reason = "descriptor_calculation_failed"
        outcomes.append(DescriptorValue(descriptor_id=key, status="error", reason=reason))
    return DescriptorReport(
        input_hash=prepared.input_hash,
        implementation_version=IMPLEMENTATION_VERSION,
        library_version=LIBRARY_VERSION,
        policy_version=POLICY_VERSION,
        created_at=datetime.now(UTC),
        model_status="qualified" if prepared.model_reason is None else "unavailable",
        model_reason=prepared.model_reason,
        provenance=prepared.provenance,
        contains_formally_charged_atoms=prepared.contains_formally_charged_atoms,
        coverage=coverage,
        values=tuple(outcomes),
    )


def calculate_properties(
    structure: NormalizedStructureV1,
    atom_ids: list[int] | tuple[int, ...],
    *,
    original_bytes: bytes | None = None,
    descriptor_ids: Iterable[str] | None = None,
) -> DescriptorReport:
    return calculate_prepared(
        prepare_descriptor_input(structure, atom_ids, original_bytes=original_bytes),
        descriptor_ids,
    )
