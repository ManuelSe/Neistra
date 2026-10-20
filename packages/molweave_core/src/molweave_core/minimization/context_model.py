from __future__ import annotations

import json
import time
from dataclasses import replace
from pathlib import Path

import openmm
from openmm import app, unit

from molweave_core.jobs import JobContext
from molweave_core.minimization.assembly import Assembly, Component
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.parameter_cache import (
    ParameterCache,
    chemistry_signature,
    fingerprint,
)
from molweave_core.minimization.parameterization import (
    Parameterized,
    finite_parameters,
    native_atom_names,
    parameterize_isolated,
    validate_charged_graph,
    write_calculation_mol2,
)
from molweave_core.minimization.toolchain import AmberTools


def parameterize_environment(
    value: Assembly,
    tools: AmberTools,
    directory: Path,
    context: JobContext,
    *,
    isolated: bool = False,
    cache: ParameterCache | None = None,
) -> Parameterized:
    if cache is None:
        return _build_environment(value, tools, directory, context, isolated=isolated)
    key = fingerprint(
        {
            "schema": 1,
            "model": "amber-local-v1",
            "engine": openmm.__version__,
            "toolchain": tools.provenance,
            "isolated": isolated,
            "references": value.references,
            "components": [
                {
                    "kind": c.kind,
                    "chemistry": chemistry_signature(c.structure),
                    "ordered_ids": c.atom_ids,
                    "templates": [r.template.name for r in c.residues],
                    "charge_input": write_calculation_mol2(c.organic)[0] if c.organic else None,
                }
                for c in value.components
            ],
        }
    )
    prepared = cache.prepare(
        "assembly",
        key,
        directory,
        context,
        lambda: _build_environment(
            value, tools, directory, context, isolated=isolated, cache=cache
        ),
        lambda: load_environment(value, directory, isolated=isolated),
    )
    return replace(
        prepared.value,
        provenance={**prepared.value.provenance, "parameter_cache": prepared.provenance},
    )


def _protein_library(
    component: Component,
    tools: AmberTools,
    directory: Path,
    context: JobContext,
    cache: ParameterCache,
    deadline: float,
) -> Parameterized:
    value = Assembly((component,), frozenset())
    key = fingerprint(
        {
            "schema": 1,
            "model": "amber-local-v1",
            "engine": openmm.__version__,
            "toolchain": tools.provenance,
            "chemistry": chemistry_signature(component.structure),
            "ordered_ids": component.atom_ids,
            "templates": [r.template.name for r in component.residues],
        }
    )

    def load() -> Parameterized:
        if not (directory / "component.lib").is_file():
            raise CalculationError(
                "parameter_mapping_failed", "Prepared receptor library is missing"
            )
        return load_environment(value, directory, isolated=True)

    prepared = cache.prepare(
        "protein",
        key,
        directory,
        context,
        lambda: _build_environment(
            value, tools, directory, context, isolated=True, library=True, deadline=deadline
        ),
        load,
    )
    return replace(
        prepared.value,
        provenance={**prepared.value.provenance, "parameter_cache": prepared.provenance},
    )


def _build_environment(
    value: Assembly,
    tools: AmberTools,
    directory: Path,
    context: JobContext,
    *,
    isolated: bool,
    cache: ParameterCache | None = None,
    library: bool = False,
    deadline: float | None = None,
) -> Parameterized:
    directory.mkdir(parents=True, exist_ok=False)
    deadline = deadline if deadline is not None else time.monotonic() + 240
    # Only qualified, fixed native template symbols enter LEaP script text.
    lines = ["source leaprc.protein.ff14SB", "source leaprc.gaff"]
    if any(c.kind == "water" for c in value.components):
        lines.extend(["loadOff solvents.lib", "loadAmberParams frcmod.tip3p"])
    charge_records = []
    component_caches = []
    for index, component in enumerate(value.components):
        context.checkpoint()
        label = "cached" if library else f"part{index}"
        if component.kind == "organic":
            assert component.organic is not None
            model = parameterize_isolated(
                component.organic, tools, directory / f"organic-{index}", context, deadline, cache
            )
            lines.append(f"{label} = loadmol2 organic-{index}/charged.mol2")
            charge_records.append(
                {
                    "entry_id": component.entry_id,
                    "atom_ids": list(component.atom_ids),
                    "charge_input_sha256": model.provenance["charge_input_sha256"],
                    **model.charge_normalization,
                }
            )
            if "parameter_cache" in model.provenance:
                component_caches.append(model.provenance["parameter_cache"])
        elif component.kind == "protein":
            if cache is not None:
                model = _protein_library(
                    component, tools, directory / f"protein-{index}", context, cache, deadline
                )
                lines.extend([f"loadOff protein-{index}/component.lib", f"{label} = copy cached"])
                component_caches.append(model.provenance["parameter_cache"])
            else:
                sequence = " ".join(r.template.name for r in component.residues)
                lines.append(f"{label} = sequence {{ {sequence} }}")
        else:
            lines.append(f"{label} = copy TP3")
            # Native AMBER TIP3P represents its internal angle with an auxiliary H-H
            # distance term. It is not a new canonical covalent bond.
    labels = "cached" if library else " ".join(f"part{i}" for i in range(len(value.components)))
    if library:
        lines.append("saveOff cached component.lib")
    lines.extend(
        [
            f"assembly = combine {{ {labels} }}",
            "saveamberparm assembly model.prmtop model.inpcrd",
            "quit",
        ]
    )
    (directory / "leap.in").write_text("\n".join(lines) + "\n")
    log = tools.run("tleap", ["-f", "leap.in"], directory, context, deadline)
    if "Errors = 0" not in log or not (directory / "model.prmtop").is_file():
        raise CalculationError(
            "parameters_missing", "Complete AMBER parameters could not be generated"
        )
    (directory / "parameterization.json").write_text(
        json.dumps(
            {
                "charge_normalizations": charge_records,
                "component_caches": component_caches,
            },
            allow_nan=False,
        )
    )
    return load_environment(value, directory, isolated=isolated)


def load_environment(value: Assembly, directory: Path, *, isolated: bool) -> Parameterized:
    metadata = json.loads((directory / "parameterization.json").read_bytes())
    charge_records = metadata["charge_normalizations"]
    names: list[str] = []
    for index, component in enumerate(value.components):
        if component.organic is not None:
            text, organic_names = write_calculation_mol2(component.organic)
            organic_directory = directory / f"organic-{index}"
            if (organic_directory / "input.mol2").read_text() != text:
                raise CalculationError(
                    "parameter_mapping_failed", "Cached ligand charge input changed"
                )
            validate_charged_graph(
                organic_directory / "charged.mol2", component.organic, organic_names
            )
            names.extend(organic_names)
        elif component.kind == "protein":
            names.extend(n for r in component.residues for n in r.template.atom_names)
        else:
            names.extend(("O", "H1", "H2"))
    expected_bonds = set(value.bonds)
    try:
        topology = app.AmberPrmtopFile(str(directory / "model.prmtop"))
        native_atoms = list(topology.topology.atoms())
        if native_atom_names(directory / "model.prmtop") != tuple(names) or any(
            a.element is None or a.element.symbol != b.element
            for a, b in zip(native_atoms, value.atoms, strict=True)
        ):
            raise ValueError("AMBER assembly changed captured atom identities/order")
        actual_bonds = {frozenset((a.index, b.index)) for a, b in topology.topology.bonds()}
        if actual_bonds != expected_bonds:
            raise ValueError("AMBER assembly changed captured connectivity")
        system = topology.createSystem(
            nonbondedMethod=app.NoCutoff if isolated else app.CutoffNonPeriodic,
            nonbondedCutoff=1.2 * unit.nanometer,
            constraints=None,
            rigidWater=False,
            removeCMMotion=False,
        )
        if system.getNumParticles() != len(names) or system.getNumConstraints():
            raise ValueError("AMBER assembly introduced particles/constraints")
        nonbonded = next(f for f in system.getForces() if type(f).__name__ == "NonbondedForce")
        nonbonded.setUseSwitchingFunction(not isolated)
        nonbonded.setSwitchingDistance(1.0 * unit.nanometer)
        nonbonded.setReactionFieldDielectric(78.3)
        nonbonded.setUseDispersionCorrection(False)
        if not finite_parameters(system):
            raise ValueError("Assembly contains nonfinite or unqualified force parameters")
    except (ValueError, RuntimeError, KeyError, OSError, StopIteration) as error:
        raise CalculationError("parameter_mapping_failed", str(error)) from error
    return Parameterized(
        system,
        tuple(names),
        {},
        {
            "protein": "ff14SB",
            "organic": "GAFF 1.81 / AM1-BCC",
            "water": "AMBER TIP3P",
            "nonbonded": "NoCutoff" if isolated else "CutoffNonPeriodic",
            "cutoff_nm": None if isolated else 1.2,
            "lj_switch_nm": None if isolated else 1.0,
            "reaction_field_dielectric": 78.3,
            "dispersion_correction": False,
            "charge_normalizations": charge_records,
            "component_caches": metadata.get("component_caches", []),
            "mapping": [
                {"entry_id": entry, "atom_id": atom_id, "particle_index": i}
                for i, (entry, atom_id) in enumerate(value.references)
            ],
            "residue_templates": [r.template.name for c in value.components for r in c.residues],
            "water_auxiliary_distance_terms": sum(c.kind == "water" for c in value.components),
        },
    )
