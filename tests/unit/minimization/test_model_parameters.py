from __future__ import annotations

import openmm
import pytest
from molweave_core.minimization.parameterization import finite_parameters


def model():
    system = openmm.System()
    for _ in range(4):
        system.addParticle(12)
    nonbonded = openmm.NonbondedForce()
    for _ in range(4):
        nonbonded.addParticle(0, 0.3, 0.2)
    nonbonded.addException(0, 3, 0, 0.3, 0.1)
    bond = openmm.HarmonicBondForce()
    bond.addBond(0, 1, 0.15, 100)
    angle = openmm.HarmonicAngleForce()
    angle.addAngle(0, 1, 2, 1.5, 100)
    torsion = openmm.PeriodicTorsionForce()
    torsion.addTorsion(0, 1, 2, 3, 3, 0, 5)
    for force in [nonbonded, bond, angle, torsion]:
        system.addForce(force)
    return system


@pytest.mark.parametrize(
    "kind", ["mass", "particle", "exception", "bond", "angle", "torsion", "unknown_force"]
)
def test_every_qualified_native_parameter_kind_must_be_finite(kind):
    system = model()
    assert finite_parameters(system)
    if kind == "mass":
        system.setParticleMass(0, float("nan"))
    elif kind == "particle":
        system.getForce(0).setParticleParameters(0, float("nan"), 0.3, 0.2)
    elif kind == "exception":
        system.getForce(0).setExceptionParameters(0, 0, 3, 0, 0.3, float("inf"))
    elif kind == "bond":
        system.getForce(1).setBondParameters(0, 0, 1, 0.15, float("nan"))
    elif kind == "angle":
        system.getForce(2).setAngleParameters(0, 0, 1, 2, float("inf"), 100)
    elif kind == "torsion":
        system.getForce(3).setTorsionParameters(0, 0, 1, 2, 3, 3, 0, float("nan"))
    else:
        system.addForce(openmm.CustomExternalForce("x*x"))
    assert not finite_parameters(system)
