from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

import numpy as np
import openmm
from openmm import app
from rdkit import Chem

from molweave_core.jobs import JobContext
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.parameter_cache import (
    ParameterCache,
    chemistry_signature,
    fingerprint,
)
from molweave_core.minimization.preflight import IsolatedInput
from molweave_core.minimization.toolchain import AmberTools


@dataclass(frozen=True)
class Parameterized:
    system: Any
    atom_names: tuple[str, ...]
    charge_normalization: dict[str, float]
    provenance: dict[str, object] = field(default_factory=dict)


def _atom_name(element: str, index: int) -> str:
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    suffix = ""
    for _ in range(4 - len(element)):
        suffix = alphabet[index % 36] + suffix
        index //= 36
    return element + suffix


def native_atom_names(path: Path) -> tuple[str, ...]:
    # AmberPrmtopFile intentionally normalizes PDB aliases (e.g. terminal H1 -> H).
    # Verify the actual Amber labels before those presentation replacements.
    lines = path.read_text().splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if line.strip() == "%FLAG ATOM_NAME")
    except StopIteration as error:
        raise ValueError("Missing AMBER atom names") from error
    if lines[start + 1].strip() != "%FORMAT(20a4)":
        raise ValueError("Unqualified AMBER atom-name encoding")
    rows = []
    for line in lines[start + 2 :]:
        if line.startswith("%FLAG"):
            break
        rows.append(line)
    return tuple(
        line[i : i + 4].strip()
        for line in rows
        for i in range(0, len(line), 4)
        if line[i : i + 4].strip()
    )


def normalize_charge_rounding(path: Path, expected: int) -> dict[str, float]:
    """Uniform finite-precision correction, never a protonation/net-charge choice."""
    text = path.read_text()
    lines = text.splitlines()
    rows: list[tuple[int, list[str]]] = []
    section = ""
    for i, line in enumerate(lines):
        if line.startswith("@<TRIPOS>"):
            section = line.strip()
        elif line.strip() and section == "@<TRIPOS>ATOM":
            rows.append((i, line.split()))
    try:
        raw = [float(fields[8]) for _, fields in rows]
        if not raw or not all(np.isfinite(q) for q in raw):
            raise ValueError("Missing/nonfinite native partial charges")
        residual = expected - sum(raw)
        maximum = min(0.05, 0.00051 * len(raw))  # SQM's printed charge precision
        if abs(residual) > maximum:
            raise ValueError("Native charge residual exceeds the bounded rounding allowance")
        offset = residual / len(raw)
        corrected = [q + offset for q in raw]
        corrected[-1] += expected - sum(corrected)
        for (i, fields), q in zip(rows, corrected, strict=True):
            fields[8] = f"{q:.12f}"
            lines[i] = " ".join(fields)
    except (ValueError, IndexError) as error:
        raise CalculationError("charge_generation_failed", str(error)) from error
    path.with_name("charged.raw.mol2").write_text(text)
    path.write_text("\n".join(lines) + "\n")
    return {
        "raw_total_e": sum(raw),
        "target_total_e": float(expected),
        "uniform_offset_e": offset,
        "maximum_rounding_residual_e": maximum,
    }


def validate_charged_graph(path: Path, value: IsolatedInput, names: tuple[str, ...]) -> None:
    """Bond typing must retain supplied chemistry, allowing equivalent aromatic forms."""
    section = ""
    native_atoms: dict[int, tuple[str, float]] = {}
    native_bonds: dict[frozenset[int], str] = {}
    try:
        for line in path.read_text().splitlines():
            if line.startswith("@<TRIPOS>"):
                section = line.strip()
            elif line.strip() and section == "@<TRIPOS>ATOM":
                fields = line.split()
                native_atoms[int(fields[0])] = fields[1], float(fields[8])
            elif line.strip() and section == "@<TRIPOS>BOND":
                fields = line.split()
                pair = frozenset((int(fields[1]) - 1, int(fields[2]) - 1))
                if len(pair) != 2 or pair in native_bonds:
                    raise ValueError("Duplicate or invalid parameterization bond")
                native_bonds[pair] = fields[3]
        if tuple(native_atoms[i + 1][0] for i in range(len(names))) != names or len(
            native_atoms
        ) != len(names):
            raise ValueError("Parameterization atom names/identities changed")
        actual = Chem.Mol(value.molecule)
        Chem.Kekulize(actual, clearAromaticFlags=True)
        if len(native_bonds) != actual.GetNumBonds():
            raise ValueError("Parameterization bond count changed")
        orders = {
            "1": Chem.BondType.SINGLE,
            "2": Chem.BondType.DOUBLE,
            "3": Chem.BondType.TRIPLE,
            "ar": Chem.BondType.AROMATIC,
            "am": Chem.BondType.SINGLE,
        }
        for pair, order in native_bonds.items():
            first, second = sorted(pair)
            bond = actual.GetBondBetweenAtoms(first, second)
            if bond is None or order not in orders:
                raise ValueError("Parameterization connectivity or bond order is unsupported")
            bond.SetBondType(orders[order])
            bond.SetIsAromatic(order == "ar")
            if order == "ar":
                actual.GetAtomWithIdx(first).SetIsAromatic(True)
                actual.GetAtomWithIdx(second).SetIsAromatic(True)
        Chem.SanitizeMol(actual)
        for expected in value.molecule.GetBonds():
            bond = actual.GetBondBetweenAtoms(expected.GetBeginAtomIdx(), expected.GetEndAtomIdx())
            if bond.GetBondType() != expected.GetBondType():
                raise ValueError(
                    "Parameterization does not preserve supplied bond-order representation"
                )
        charge = sum(float(a.formal_charge or 0) for a in value.structure.atoms)
        native_charge = sum(record[1] for record in native_atoms.values())
        if not np.isfinite(native_charge) or abs(native_charge - charge) > max(
            1e-4, len(names) * 1e-6
        ):
            raise ValueError("Generated partial charges do not match the specified net charge")
    except (OSError, ValueError, KeyError, IndexError, RuntimeError) as error:
        raise CalculationError("parameter_mapping_failed", str(error)) from error


def write_calculation_mol2(value: IsolatedInput) -> tuple[str, tuple[str, ...]]:
    """Safe transient labels; no user text is interpreted by AmberTools/LEaP."""
    structure = value.structure
    names = tuple(_atom_name(a.element, i) for i, a in enumerate(structure.atoms))
    indices = {a.id: i + 1 for i, a in enumerate(structure.atoms)}
    lines = [
        "@<TRIPOS>MOLECULE",
        "LIG",
        f"{len(names)} {len(structure.bonds)} 1 0 0",
        "SMALL",
        "USER_CHARGES",
        "",
        "@<TRIPOS>ATOM",
    ]
    for i, (atom, point) in enumerate(
        zip(structure.atoms, structure.active_coordinates, strict=True)
    ):
        rd_atom = value.molecule.GetAtomWithIdx(i)
        element = atom.element
        kind = element
        if element in {"C", "N", "O", "S", "P"}:
            hybridization = str(rd_atom.GetHybridization())
            suffix = (
                "ar" if rd_atom.GetIsAromatic() else {"SP": "1", "SP2": "2"}.get(hybridization, "3")
            )
            kind += "." + suffix
        x, y, z = point
        lines.append(
            f"{i + 1} {names[i]} {x:.12g} {y:.12g} {z:.12g} {kind} 1 LIG {atom.formal_charge}"
        )
    lines.append("@<TRIPOS>BOND")
    for i, bond in enumerate(structure.bonds, 1):
        order = "ar" if bond.aromatic or bond.order == 1.5 else str(int(bond.order or 0))
        lines.append(f"{i} {indices[bond.atom_1_id]} {indices[bond.atom_2_id]} {order}")
    lines.extend(["@<TRIPOS>SUBSTRUCTURE", "1 LIG 1 RESIDUE"])
    return "\n".join(lines) + "\n", names


def parameterize_isolated(
    value: IsolatedInput,
    tools: AmberTools,
    directory: Path,
    context: JobContext,
    deadline: float | None = None,
    cache: ParameterCache | None = None,
) -> Parameterized:
    if cache is not None:
        text, _ = write_calculation_mol2(value)
        key = fingerprint(
            {
                "schema": 1,
                "model": "amber-local-v1",
                "engine": openmm.__version__,
                "toolchain": tools.provenance,
                "input": text,
                "chemistry": chemistry_signature(value.structure),
            }
        )
        prepared = cache.prepare(
            "organic",
            key,
            directory,
            context,
            lambda: parameterize_isolated(value, tools, directory, context, deadline),
            lambda: load_isolated(value, directory),
        )
        return replace(
            prepared.value,
            provenance={**prepared.value.provenance, "parameter_cache": prepared.provenance},
        )
    directory.mkdir(parents=True, exist_ok=False)
    text, names = write_calculation_mol2(value)
    (directory / "input.mol2").write_text(text)
    charge = sum(int(a.formal_charge or 0) for a in value.structure.atoms)
    deadline = deadline if deadline is not None else time.monotonic() + 240
    tools.run(
        "antechamber",
        [
            "-i",
            "input.mol2",
            "-fi",
            "mol2",
            "-o",
            "charged.mol2",
            "-fo",
            "mol2",
            "-at",
            "gaff",
            "-c",
            "bcc",
            "-nc",
            str(charge),
            "-m",
            "1",
            "-rn",
            "LIG",
            "-s",
            "2",
        ],
        directory,
        context,
        deadline,
    )
    if not (directory / "charged.mol2").is_file():
        raise CalculationError(
            "charge_generation_failed", "AM1-BCC did not produce a charged molecule"
        )
    sqm_output = directory / "sqm.out"
    if not sqm_output.is_file() or "Calculation Completed" not in sqm_output.read_text(
        errors="replace"
    ):
        raise CalculationError(
            "charge_generation_failed", "SQM did not complete the AM1-BCC calculation"
        )
    normalization = normalize_charge_rounding(directory / "charged.mol2", charge)
    validate_charged_graph(directory / "charged.mol2", value, names)
    # Do not call parmchk2 to silently fill missing parameters or add atoms/caps.
    (directory / "leap.in").write_text(
        "source leaprc.gaff\nLIG = loadmol2 charged.mol2\n"
        "saveamberparm LIG model.prmtop model.inpcrd\nquit\n"
    )
    log = tools.run("tleap", ["-f", "leap.in"], directory, context, deadline)
    if "Errors = 0" not in log or not (directory / "model.prmtop").is_file():
        raise CalculationError(
            "parameters_missing", "GAFF parameters are incomplete; inspect the calculation logs"
        )
    (directory / "parameterization.json").write_text(
        json.dumps({"charge_normalization": normalization}, allow_nan=False)
    )
    return load_isolated(value, directory)


def load_isolated(value: IsolatedInput, directory: Path) -> Parameterized:
    text, names = write_calculation_mol2(value)
    if (directory / "input.mol2").read_text() != text:
        raise CalculationError(
            "parameter_mapping_failed", "Charge input geometry or chemistry changed"
        )
    normalization = json.loads((directory / "parameterization.json").read_bytes())[
        "charge_normalization"
    ]
    validate_charged_graph(directory / "charged.mol2", value, names)
    try:
        topology = app.AmberPrmtopFile(str(directory / "model.prmtop"))
        actual_atoms = list(topology.topology.atoms())
        if tuple(a.name for a in actual_atoms) != names or any(
            native.element is None or native.element.symbol != atom.element
            for native, atom in zip(actual_atoms, value.structure.atoms, strict=True)
        ):
            raise ValueError("Generated atom identity/order differs from the captured graph")
        indices = {a.id: i for i, a in enumerate(value.structure.atoms)}
        expected_bonds = {
            frozenset((names[indices[b.atom_1_id]], names[indices[b.atom_2_id]]))
            for b in value.structure.bonds
        }
        actual_bonds = {frozenset((a.name, b.name)) for a, b in topology.topology.bonds()}
        if actual_bonds != expected_bonds:
            raise ValueError("Generated connectivity differs from the captured graph")
        system = topology.createSystem(
            nonbondedMethod=app.NoCutoff,
            constraints=None,
            rigidWater=False,
            removeCMMotion=False,
        )
        if system.getNumParticles() != len(names) or system.getNumConstraints():
            raise ValueError("Calculation introduced particles or constraints")
        if not finite_parameters(system):
            raise ValueError("Calculation contains nonfinite or unqualified force parameters")
    except (ValueError, RuntimeError, KeyError, OSError) as error:
        raise CalculationError("parameter_mapping_failed", str(error)) from error
    return Parameterized(
        system,
        names,
        normalization,
        {
            "charge_input_sha256": hashlib.sha256(text.encode()).hexdigest(),
            "charge_method": "AM1-BCC",
            "geometry_dependent_charges": True,
        },
    )


def finite_parameters(system: Any) -> bool:
    """Reject nonfinite native parameter records before constructing a Context."""
    from openmm import unit

    def finite(values: Any) -> bool:
        return all(
            np.isfinite(v.value_in_unit_system(unit.md_unit_system) if unit.is_quantity(v) else v)
            for v in values
        )

    if not finite(system.getParticleMass(i) for i in range(system.getNumParticles())):
        return False
    for force in system.getForces():
        name = type(force).__name__
        if name == "NonbondedForce":
            if not all(
                finite(force.getParticleParameters(i)) for i in range(force.getNumParticles())
            ):
                return False
            if not all(
                finite(force.getExceptionParameters(i)) for i in range(force.getNumExceptions())
            ):
                return False
        elif name == "HarmonicBondForce":
            if not all(finite(force.getBondParameters(i)) for i in range(force.getNumBonds())):
                return False
        elif name == "HarmonicAngleForce":
            if not all(finite(force.getAngleParameters(i)) for i in range(force.getNumAngles())):
                return False
        elif name == "PeriodicTorsionForce":
            if not all(
                finite(force.getTorsionParameters(i)) for i in range(force.getNumTorsions())
            ):
                return False
        else:
            # The checksum-qualified AMBER profile emits these four force kinds.
            # An extension needs explicit validation/qualification, not blind acceptance.
            return False
    return True
