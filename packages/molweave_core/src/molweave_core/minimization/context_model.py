from __future__ import annotations

import time
from pathlib import Path

from openmm import app, unit

from molweave_core.jobs import JobContext
from molweave_core.minimization.assembly import Assembly
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.parameterization import (
    Parameterized,
    native_atom_names,
    parameterize_isolated,
)
from molweave_core.minimization.toolchain import AmberTools


def parameterize_environment(
    value: Assembly,
    tools: AmberTools,
    directory: Path,
    context: JobContext,
    *,
    isolated: bool = False,
) -> Parameterized:
    directory.mkdir(parents=True, exist_ok=False)
    deadline = time.monotonic() + 240
    # Only qualified, fixed native template symbols enter LEaP script text.
    lines = ["source leaprc.protein.ff14SB", "source leaprc.gaff"]
    if any(c.kind == "water" for c in value.components):
        lines.extend(["loadOff solvents.lib", "loadAmberParams frcmod.tip3p"])
    names: list[str] = []
    expected_bonds = set(value.bonds)
    charge_records = []
    for index, component in enumerate(value.components):
        context.checkpoint()
        label = f"part{index}"
        if component.kind == "organic":
            assert component.organic is not None
            model = parameterize_isolated(
                component.organic, tools, directory / f"organic-{index}", context, deadline
            )
            lines.append(f"{label} = loadmol2 organic-{index}/charged.mol2")
            names.extend(model.atom_names)
            charge_records.append(
                {
                    "entry_id": component.entry_id,
                    "atom_ids": list(component.atom_ids),
                    **model.charge_normalization,
                }
            )
        elif component.kind == "protein":
            sequence = " ".join(r.template.name for r in component.residues)
            lines.append(f"{label} = sequence {{ {sequence} }}")
            names.extend(n for r in component.residues for n in r.template.atom_names)
        else:
            lines.append(f"{label} = copy TP3")
            names.extend(("O", "H1", "H2"))
            # Native AMBER TIP3P represents its internal angle with an auxiliary H-H
            # distance term. It is not a new canonical covalent bond.
    labels = " ".join(f"part{i}" for i in range(len(value.components)))
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
            "mapping": [
                {"entry_id": entry, "atom_id": atom_id, "particle_index": i}
                for i, (entry, atom_id) in enumerate(value.references)
            ],
            "residue_templates": [r.template.name for c in value.components for r in c.residues],
            "water_auxiliary_distance_terms": sum(c.kind == "water" for c in value.components),
        },
    )
