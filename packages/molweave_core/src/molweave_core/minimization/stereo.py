from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from rdkit import Chem

from molweave_core.adapters.rdkit_common import normalized_to_mol
from molweave_core.minimization.assembly import Assembly
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.preflight import IsolatedInput


def assembly_stereo_validator(value: Assembly) -> Callable[[NDArray[np.float64]], None]:
    # Import here to keep the optimizer's isolated public interface acyclic.
    from molweave_core.minimization.optimize import geometry_stereo, validate_stereo_intent

    index = {ref: i for i, ref in enumerate(value.references)}
    organic_checks = []
    protein_checks = []
    original = np.asarray(value.coordinates, dtype=np.float64)
    for component in value.components:
        if component.kind == "protein" and (
            any(a.stereo for a in component.structure.atoms)
            or any(b.stereo for b in component.structure.bonds)
        ):
            graph = normalized_to_mol(component.structure)
            graph.UpdatePropertyCache(strict=False)
            Chem.GetSymmSSSR(graph)
            view = IsolatedInput(component.entry_id, component.structure, graph, ())
            validate_stereo_intent(
                view, geometry_stereo(graph, np.asarray(component.structure.active_coordinates))
            )
        if component.organic is not None:
            rows = [index[component.entry_id, a.id] for a in component.structure.atoms]
            baseline = geometry_stereo(component.organic.molecule, original[rows])
            validate_stereo_intent(component.organic, baseline)
            organic_checks.append((component.organic.molecule, rows, baseline))
        for residue in component.residues:
            names = residue.template.atom_names
            centers = [("CA", "N", "C", "CB")]
            state = residue.template.name[-3:]
            if state == "ILE":
                centers.append(("CB", "CA", "CG1", "CG2"))
            elif state == "THR":
                centers.append(("CB", "CA", "OG1", "CG2"))
            for labels in centers:
                if not set(labels) <= set(names):
                    continue  # GLY has no CA stereocenter.
                local = [names.index(name) for name in labels]
                rows = [index[component.entry_id, residue.atom_ids[i]] for i in local]
                reference = np.asarray(residue.template.positions, dtype=np.float64)[local]
                points = original[rows]
                expected = float(np.linalg.det(reference[1:] - reference[0]))
                current = float(np.linalg.det(points[1:] - points[0]))
                if abs(expected) < 1e-6 or abs(current) < 1e-6 or current * expected <= 0:
                    raise CalculationError(
                        "protein_stereo_conflict",
                        "Protein geometry conflicts with the qualified "
                        "standard ff14SB stereochemical template; repair explicitly",
                    )
                protein_checks.append((rows, current))

    def validate(coordinates: NDArray[np.float64]) -> None:
        for molecule, rows, baseline in organic_checks:
            if geometry_stereo(molecule, coordinates[rows]) != baseline:
                raise CalculationError(
                    "stereo_changed", "Optimization changed geometric stereochemistry"
                )
        for rows, baseline_sign in protein_checks:
            points = coordinates[rows]
            current = float(np.linalg.det(points[1:] - points[0]))
            if abs(current) < 1e-6 or current * baseline_sign <= 0:
                raise CalculationError(
                    "stereo_changed", "Optimization changed protein stereochemistry"
                )

    return validate
