"""Offline independent source-limit oracles and canonical registry transport specimen.

The metadata specimen uses production serialization; molecular observations use
the pinned descriptor kernel. Expected threshold outcomes below come from the
accepted publication/adaptation table, not the production registry or evaluator.
Run with the core source on PYTHONPATH.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from neistra_core.adapters.rdkit_common import mol_to_normalized
from neistra_core.ligand_profiles import profile_registry_document
from neistra_core.ligand_properties import calculate_properties
from rdkit import Chem

HERE = Path(__file__).resolve().parent
REFERENCE = {
    "ro5": [
        ("molecular_weight", "le", 500),
        ("calculated_logp", "le", 5),
        ("hbd", "le", 5),
        ("hba", "le", 10),
    ],
    "ro3": [
        ("molecular_weight", "lt", 300),
        ("calculated_logp", "le", 3),
        ("hbd", "le", 3),
        ("hba", "le", 3),
    ],
    "veber": [("rotatable_bond_count", "le", 10), ("tpsa", "le", 140)],
    "ro5-veber": [
        ("molecular_weight", "le", 500),
        ("calculated_logp", "le", 5),
        ("hbd", "le", 5),
        ("hba", "le", 10),
        ("rotatable_bond_count", "le", 10),
        ("tpsa", "le", 140),
    ],
    "doak-outer-envelope": [
        ("molecular_weight", "le", 1000),
        ("calculated_logp", "ge", -2),
        ("calculated_logp", "le", 10),
        ("hbd", "le", 6),
        ("hba", "le", 15),
        ("tpsa", "le", 250),
        ("rotatable_bond_count", "le", 20),
    ],
    "gleeson-4-400": [("molecular_weight", "lt", 400), ("calculated_logp", "lt", 4)],
    "teague-lead-range": [
        ("molecular_weight", "ge", 100),
        ("molecular_weight", "le", 350),
        ("calculated_logp", "ge", 1),
        ("calculated_logp", "le", 3),
    ],
}
BASE_VALUES = {
    "molecular_weight": 250,
    "heavy_atom_count": 18,
    "heteroatom_count": 4,
    "carbon_count": 14,
    "formal_charge": 0,
    "hbd": 1,
    "hba": 2,
    "tpsa": 60,
    "calculated_logp": 2,
    "molar_refractivity": 70,
    "rotatable_bond_count": 2,
    "ring_count": 1,
    "aromatic_ring_count": 1,
    "fraction_sp3": 0.5,
}
INTEGER_DESCRIPTORS = {"hbd", "hba", "rotatable_bond_count"}


def outcome(value: float, operator: str, limit: float) -> bool:
    if operator == "lt":
        return value < limit
    if operator == "le":
        return value <= limit
    if operator == "ge":
        return value >= limit
    if operator == "gt":
        return value > limit
    raise ValueError(operator)


def independent_specimen() -> dict[str, object]:
    samples = []
    for profile, rules in REFERENCE.items():
        for descriptor, operator, limit in rules:
            neighbours = (
                (limit - 1, limit, limit + 1)
                if descriptor in INTEGER_DESCRIPTORS
                else (
                    math.nextafter(limit, -math.inf),
                    float(limit),
                    math.nextafter(limit, math.inf),
                )
            )
            for side, value in zip(("below", "exact", "above"), neighbours, strict=True):
                values = {**BASE_VALUES, descriptor: value}
                criteria = [
                    {
                        "descriptor_id": key,
                        "operator": op,
                        "limit": threshold,
                        "status": "pass" if outcome(values[key], op, threshold) else "fail",
                    }
                    for key, op, threshold in rules
                ]
                samples.append(
                    {
                        "id": f"{profile}:{descriptor}:{operator}:{limit}:{side}",
                        "profile_id": profile,
                        "varied_descriptor": descriptor,
                        "relation": side,
                        "values": values,
                        "criteria": criteria,
                        "status": "pass"
                        if all(row["status"] == "pass" for row in criteria)
                        else "fail",
                    }
                )
    operator_controls = [
        {
            "operator": operator,
            "limit": 300,
            "value": value,
            "expected": "pass" if outcome(value, operator, 300) else "fail",
        }
        for operator in ("lt", "le", "gt", "ge")
        for value in (math.nextafter(300, -math.inf), 300.0, math.nextafter(300, math.inf))
    ]
    return {
        "format_version": 1,
        "basis": "Independent accepted publication/adaptation limits; IEEE754 adjacent values, "
        "integer limit±1. No production evaluator supplies an expected outcome.",
        "references": REFERENCE,
        "base_values": BASE_VALUES,
        "samples": samples,
        "operator_controls": operator_controls,
    }


def molecular_specimen() -> dict[str, object]:
    """Pinned graph observations with independently specified profile and partial outcomes."""
    cases = [
        (
            "ethanol",
            "CCO",
            {
                "ro5": "pass",
                "ro3": "pass",
                "veber": "pass",
                "ro5-veber": "pass",
                "doak-outer-envelope": "pass",
                "gleeson-4-400": "pass",
                "teague-lead-range": "fail",
            },
        ),
        (
            "ethylbenzene",
            "CCc1ccccc1",
            {
                "ro5": "pass",
                "ro3": "pass",
                "veber": "pass",
                "ro5-veber": "pass",
                "doak-outer-envelope": "pass",
                "gleeson-4-400": "pass",
                "teague-lead-range": "pass",
            },
        ),
        (
            "glycine-zwitterion",
            "[NH3+]CC(=O)[O-]",
            {
                "ro5": "pass",
                "ro3": "pass",
                "veber": "pass",
                "ro5-veber": "pass",
                "doak-outer-envelope": "fail",
                "gleeson-4-400": "pass",
                "teague-lead-range": "unavailable",
            },
        ),
        (
            "nitrobenzene",
            "[O-][N+](=O)c1ccccc1",
            {
                "ro5": "pass",
                "ro3": "pass",
                "veber": "pass",
                "ro5-veber": "pass",
                "doak-outer-envelope": "pass",
                "gleeson-4-400": "pass",
                "teague-lead-range": "unavailable",
            },
        ),
        (
            "hexadecane",
            "CCCCCCCCCCCCCCCC",
            {
                "ro5": "fail",
                "ro3": "fail",
                "veber": "fail",
                "ro5-veber": "fail",
                "doak-outer-envelope": "pass",
                "gleeson-4-400": "fail",
                "teague-lead-range": "fail",
            },
        ),
    ]
    observations = []
    for case_id, smiles, expected in cases:
        molecule = Chem.MolFromSmiles(smiles)
        assert molecule is not None
        structure = mol_to_normalized(
            molecule, filename="profile-specimen.smi", format_name="smiles"
        )
        before = structure.to_bytes()
        report = calculate_properties(
            structure, [atom.id for atom in structure.atoms], original_bytes=f"{smiles}\n".encode()
        )
        assert structure.to_bytes() == before
        assert report.model_status == "qualified" and all(
            item.status == "ready" for item in report.values
        )
        observations.append(
            {
                "id": case_id,
                "smiles": smiles,
                "input_hash": report.input_hash,
                "contains_formally_charged_atoms": report.contains_formally_charged_atoms,
                "values": {item.descriptor_id: item.value for item in report.values},
                "expected_profiles": expected,
            }
        )
    partial = []
    for case_id, smiles, reason in (
        ("isotopic-methane", "[13CH4]", "isotope_model_not_qualified"),
        ("methyl-radical", "[CH3]", "radical_model_not_qualified"),
    ):
        molecule = Chem.MolFromSmiles(smiles)
        assert molecule is not None
        structure = mol_to_normalized(
            molecule, filename="partial-profile-specimen.smi", format_name="smiles"
        )
        before = structure.to_bytes()
        report = calculate_properties(
            structure, [atom.id for atom in structure.atoms], original_bytes=f"{smiles}\n".encode()
        )
        assert structure.to_bytes() == before
        assert report.model_status == "unavailable" and report.model_reason == reason
        partial.append(
            {
                "id": case_id,
                "smiles": smiles,
                "input_hash": report.input_hash,
                "model_status": report.model_status,
                "model_reason": report.model_reason,
                "contains_formally_charged_atoms": report.contains_formally_charged_atoms,
                "coverage": list(report.coverage),
                "values": [value.model_dump(mode="json") for value in report.values],
                "expected_known_values": {
                    "heavy_atom_count": 1,
                    "heteroatom_count": 0,
                    "carbon_count": 1,
                    "formal_charge": 0,
                },
            }
        )
    return {
        "format_version": 1,
        "basis": "Pinned descriptor-kernel observations with literal independent expected profile "
        "outcomes. Synthetic authority in browser unit tests is not API publication evidence.",
        "cases": observations,
        "partial_cases": partial,
    }


def write() -> None:
    (HERE / "registry.json").write_text(
        json.dumps(profile_registry_document(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )
    (HERE / "boundaries.json").write_text(
        json.dumps(independent_specimen(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )
    (HERE / "molecular-cases.json").write_text(
        json.dumps(molecular_specimen(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )


if __name__ == "__main__":
    write()
