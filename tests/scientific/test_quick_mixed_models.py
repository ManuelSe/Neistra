"""Independent moving-force checks for mixed local models (angstrom coordinates).

Native terms retain kcal/mol units. A native-plus-repair sum is a disclosed
surrogate objective in penalty units, not a physical mixed force-field energy.
Distance constraint normalization is pinned to RDKit Release_2026_03_4,
Code/ForceField/DistanceConstraint.cpp: E = 0.5 * k * distance_error**2.
"""

from __future__ import annotations

from itertools import combinations
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from neistra_core.hydrogen_protection import protection_annotation, protection_facts
from neistra_core.minimization.quick_contracts import usable
from neistra_core.minimization.quick_field import force_field
from neistra_core.minimization.quick_model import build_assembly
from neistra_core.minimization.quick_optimize import optimize
from neistra_core.molecular import Conformer
from rdkit import Chem
from rdkit.Chem import AllChem

from tests.support.minimization import LocalContext, molecule, translated
from tests.unit.test_quick_minimization import environment_parameters

all_chem: Any = AllChem


def repair_source():
    """Two literal charged carbons: no native interpretation or helper H is valid."""
    source = molecule("CC", explicit_h=False)
    identifiers = {1: 11, 2: 47}
    coordinates = [(1.8, 0.0, 0.0), (0.0, 0.0, 0.0)]
    inactive = [(71.0, -82.0, 93.0), (74.0, -85.0, 96.0)]
    facts = protection_facts(source)
    return source.model_copy(
        update={
            "atoms": [
                atom.model_copy(
                    update={
                        "id": identifiers[atom.id],
                        "formal_charge": 1,
                        "coordinates": xyz,
                    }
                )
                for atom, xyz in zip(source.atoms, coordinates, strict=True)
            ],
            "bonds": [
                bond.model_copy(
                    update={
                        "atom_1_id": identifiers[bond.atom_1_id],
                        "atom_2_id": identifiers[bond.atom_2_id],
                        "order": None,
                    }
                )
                for bond in source.bonds
            ],
            "conformers": [
                Conformer(id=17, name="Inactive", coordinates=inactive),
                Conformer(id=7, name="Active", coordinates=coordinates),
            ],
            "active_conformer_id": 7,
            "annotations": [
                protection_annotation(
                    [
                        facts[atom.id].model_copy(update={"atom_id": identifiers[atom.id]})
                        for atom in source.atoms
                    ],
                    "import",
                )
            ],
        }
    )


def profile(kind):
    sources = {"native": molecule("CCO")}
    if kind == "repair":
        sources["native"] = translated(sources["native"], (4.0, 0.4, 0.3))
        sources["other"] = repair_source()
        selected = {"native": [1], "other": [11]}
    else:
        sources["other"] = translated(molecule("B"), (4.0, 0.4, 0.3))
        selected = {"native": [1], "other": [1]}
    parameters, _ = environment_parameters(
        sources, selected, expand_hydrogens=False, max_iterations=100
    )
    original = {key: source.to_bytes() for key, source in sources.items()}
    assembly = build_assembly(sources, parameters)
    assert {key: source.to_bytes() for key, source in sources.items()} == original
    return sources, parameters, assembly


def independent_molecule(smiles, source):
    """Reconstruct the chemical reference independently of local interpretation."""
    mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
    assert [atom.GetSymbol() for atom in mol.GetAtoms()] == [a.element for a in source.atoms]
    indices = {atom.id: i for i, atom in enumerate(source.atoms)}
    assert {
        tuple(sorted((bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()))) for bond in mol.GetBonds()
    } == {tuple(sorted((indices[b.atom_1_id], indices[b.atom_2_id]))) for b in source.bonds}
    conformer = Chem.Conformer(len(source.atoms))
    for i, xyz in enumerate(source.active_coordinates):
        conformer.SetAtomPosition(i, xyz)
    mol.AddConformer(conformer)
    return mol


def reference_field(mol, mode, moving):
    if mode == "MMFF94":
        properties = all_chem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94")
        properties.SetMMFFDielectricModel(2)
        properties.SetMMFFDielectricConstant(4.0)
        field = all_chem.MMFFGetMoleculeForceField(
            mol,
            properties,
            nonBondedThresh=float("inf"),
            ignoreInterfragInteractions=False,
        )
    else:
        field = all_chem.UFFGetMoleculeForceField(
            mol,
            vdwThresh=float("inf"),
            ignoreInterfragInteractions=False,
        )
    for i in set(range(mol.GetNumAtoms())) - set(moving):
        field.AddFixedPoint(i)
    field.Initialize()
    return field


def assert_current_graph(assembly, sources):
    assert all(reference is not None for reference in assembly.references)
    assert {
        frozenset(
            (assembly.references[b.GetBeginAtomIdx()], assembly.references[b.GetEndAtomIdx()])
        )
        for b in assembly.molecule.GetBonds()
    } == {
        frozenset(((entry, b.atom_1_id), (entry, b.atom_2_id)))
        for entry, source in sources.items()
        for b in source.bonds
    }


def repair_oracle(xyz, references, sources, moving):
    """Full-pair closed form; no production constraint, index or discovery helper.

    The only repair bond is C--C, target 1.52 A and k=100. All other repair
    contributions here are k=20 repulsive distance penalties. There are no
    repair angles/torsions or helper atoms in this two-site fixture.
    """
    indices = {ref: i for i, ref in enumerate(references)}
    first, second = indices[("other", 11)], indices[("other", 47)]
    gradient = np.zeros_like(xyz)

    def pair(i, j, boundary, strength, repulsive=False):
        vector = xyz[i] - xyz[j]
        distance = float(np.linalg.norm(vector))
        error = distance - boundary
        if repulsive and error >= 0:
            return 0.0
        derivative = strength * error * vector / distance
        gradient[i] += derivative
        gradient[j] -= derivative
        return 0.5 * strength * error**2

    bond = pair(first, second, 1.52, 100.0)
    radii = {"C": 1.70, "H": 1.20, "O": 1.55}
    element = {(entry, a.id): a.element for entry, source in sources.items() for a in source.atoms}
    # Full canonical graph distances independently define 1--2/1--3 exclusions.
    adjacent = {reference: set() for reference in references}
    for entry, source in sources.items():
        for edge in source.bonds:
            a, b = (entry, edge.atom_1_id), (entry, edge.atom_2_id)
            adjacent[a].add(b)
            adjacent[b].add(a)
    steric = 0.0
    active_pairs = 0
    for i, j in combinations(range(len(references)), 2):
        a, b = references[i], references[j]
        if not {i, j} & moving or (a[0] != "other" and b[0] != "other"):
            continue
        if b in adjacent[a] or adjacent[a] & adjacent[b]:
            continue
        energy = pair(i, j, 0.75 * (radii[element[a]] + radii[element[b]]), 20.0, True)
        steric += energy
        active_pairs += energy > 0
    return bond + steric, gradient, bond, steric, active_pairs


def assert_moving_finite_differences(field, energy, xyz, moving):
    analytical = np.asarray(field.CalcGrad(xyz.reshape(-1).tolist())).reshape((-1, 3))
    for atom in moving:
        for axis in range(3):
            plus, minus = xyz.copy(), xyz.copy()
            plus[atom, axis] += 1e-5
            minus[atom, axis] -= 1e-5
            derivative = (energy(plus) - energy(minus)) / 2e-5
            assert analytical[atom, axis] == pytest.approx(derivative, abs=1e-4, rel=1e-6)


def test_moving_mmff_and_repair_match_independent_native_plus_full_pair_surrogate():
    sources, _, assembly = profile("repair")
    original = {key: source.to_bytes() for key, source in sources.items()}
    field, method = force_field(assembly)
    assert method == "geometry_repair" and set(assembly.modes) == {"MMFF94", "repair"}
    assert_current_graph(assembly, sources)
    assert assembly.effective_field is not None
    records = {part.entry_id: part for part in assembly.effective_field.components}
    assert {key: part.method for key, part in records.items()} == {
        "native": "MMFF94",
        "other": "geometry_repair",
    }
    assert records["other"].atom_ids == [11, 47]
    assert "unsupported_site_electrostatics" in records["native"].omissions
    assert "uff_electrostatics" not in assembly.effective_field.omissions
    native_indices = [
        assembly.references.index(("native", atom.id)) for atom in sources["native"].atoms
    ]
    independent = reference_field(independent_molecule("CCO", sources["native"]), "MMFF94", [0])
    xyz = assembly.coordinates.copy()
    xyz[assembly.movable] += (0.021, -0.013, 0.017)
    moving = set(assembly.movable)
    repair_energy, repair_gradient, bond, steric, pairs = repair_oracle(
        xyz,
        assembly.references,
        sources,
        moving,
    )
    assert bond > 1e-3 and steric > 1e-3 and pairs > 0
    native_positions = xyz[native_indices].reshape(-1).tolist()
    native_energy = independent.CalcEnergy(native_positions)
    assert abs(native_energy) > 1e-3
    expected_gradient = repair_gradient.copy()
    expected_gradient[native_indices] += np.asarray(independent.CalcGrad(native_positions)).reshape(
        (-1, 3)
    )
    actual = np.asarray(field.CalcGrad(xyz.reshape(-1).tolist())).reshape((-1, 3))
    assert field.CalcEnergy(xyz.reshape(-1).tolist()) == pytest.approx(
        native_energy + repair_energy, abs=1e-6
    )
    assert np.allclose(
        actual[assembly.movable], expected_gradient[assembly.movable], atol=1e-4, rtol=1e-6
    )
    assert all(np.linalg.norm(actual[index]) > 1e-3 for index in assembly.movable)

    def energy(points):
        return (
            independent.CalcEnergy(points[native_indices].reshape(-1).tolist())
            + repair_oracle(
                points,
                assembly.references,
                sources,
                moving,
            )[0]
        )

    assert_moving_finite_differences(field, energy, xyz, assembly.movable)
    assert {key: source.to_bytes() for key, source in sources.items()} == original


def test_moving_mmff_and_uff_components_use_the_independent_full_uff_field():
    sources, _, assembly = profile("uff")
    original = {key: source.to_bytes() for key, source in sources.items()}
    field, method = force_field(assembly)
    assert method == "UFF" and set(assembly.modes) == {"MMFF94", "UFF"}
    assert_current_graph(assembly, sources)
    assert assembly.effective_field is not None
    assert {part.method for part in assembly.effective_field.components} == {"UFF"}
    assert assembly.effective_field.omissions == ["uff_electrostatics"]
    references = [(entry, atom.id) for entry in sorted(sources) for atom in sources[entry].atoms]
    molecules = {
        entry: independent_molecule("CCO" if entry == "native" else "B", sources[entry])
        for entry in sources
    }
    combined = Chem.CombineMols(molecules["native"], molecules["other"])
    Chem.SanitizeMol(combined)
    indices = [assembly.references.index(ref) for ref in references]
    moving = [i for i, index in enumerate(indices) if index in assembly.movable]
    independent = reference_field(combined, "UFF", moving)
    xyz = assembly.coordinates.copy()
    xyz[assembly.movable] += (0.019, 0.014, -0.011)
    positions = xyz[indices].reshape(-1).tolist()
    expected_energy = independent.CalcEnergy(positions)
    actual_gradient = np.asarray(field.CalcGrad(xyz.reshape(-1).tolist())).reshape((-1, 3))
    gradient = np.asarray(independent.CalcGrad(positions)).reshape((-1, 3))
    assert field.CalcEnergy(xyz.reshape(-1).tolist()) == pytest.approx(expected_energy, abs=1e-6)
    assert np.allclose(actual_gradient[indices][moving], gradient[moving], atol=1e-4, rtol=1e-6)
    assert all(np.linalg.norm(actual_gradient[index]) > 1e-3 for index in assembly.movable)
    separated = 0.0
    for entry, mol in molecules.items():
        local_indices = [
            assembly.references.index((entry, atom.id)) for atom in sources[entry].atoms
        ]
        separated += reference_field(mol, "UFF", []).CalcEnergy(
            xyz[local_indices].reshape(-1).tolist()
        )
    assert (
        abs(expected_energy - separated) > 1e-3
    )  # Intercomponent native terms are actually exercised.

    def energy(points):
        return independent.CalcEnergy(points[indices].reshape(-1).tolist())

    assert_moving_finite_differences(field, energy, xyz, assembly.movable)
    assert {key: source.to_bytes() for key, source in sources.items()} == original


@pytest.mark.parametrize("kind", ["repair", "uff"])
def test_mixed_moving_optimization_preserves_fixed_rows_sources_and_exact_proposal_masks(
    kind, tmp_path: Path
):
    sources, parameters, assembly = profile(kind)
    original = {key: source.to_bytes() for key, source in sources.items()}
    before = assembly.coordinates.copy()
    selected = {(atom.structure_id, atom.atom_id) for atom in parameters.selection.atoms}
    report, proposals = optimize(assembly, parameters, LocalContext(tmp_path))
    assert usable(report), report
    assert report.method == ("geometry_repair" if kind == "repair" else "UFF")
    assert report.units["energy"] == ("penalty" if kind == "repair" else "kcal/mol")
    assert report.units["gradient"] == (
        "penalty/angstrom" if kind == "repair" else "kcal/(mol angstrom)"
    )
    assert report.final_energy < report.initial_energy
    fixed = [i for i, ref in enumerate(assembly.references) if ref not in selected]
    assert np.array_equal(assembly.result_coordinates[fixed], before[fixed])
    for i, ref in enumerate(assembly.references):
        if ref in selected:
            assert np.linalg.norm(assembly.result_coordinates[i] - before[i]) > 1e-8
    assert np.array_equal(assembly.coordinates, before)
    assert_current_graph(assembly, sources)
    assert {
        (proposal.entry_id, atom) for proposal in proposals for atom in proposal.atom_ids
    } == selected
    if kind == "repair":
        assert (
            next(proposal for proposal in proposals if proposal.entry_id == "other").conformer_id
            == 7
        )
        assert sources["other"].conformers[0].id == 17
    assert {key: source.to_bytes() for key, source in sources.items()} == original
