"""Disposable local model; no chemical projection is written back to the project."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from math import isfinite
from typing import Any

import numpy as np
from rdkit import Chem

from molweave_core.jobs import InputArtifact
from molweave_core.minimization.assembly import project_atoms
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.preflight import connected_atoms
from molweave_core.minimization.quick_chemistry import interpret
from molweave_core.minimization.quick_context import discover
from molweave_core.minimization.quick_contracts import QuickParameters, canonical_selection
from molweave_core.minimization.quick_protein import protein_graph
from molweave_core.molecular import NormalizedStructureV1
from molweave_core.selection import SelectionV1

AtomKey = tuple[str, int]


@dataclass
class QuickAssembly:
    molecule: Any
    references: list[AtomKey | None]
    movable: list[int]
    sources: dict[str, NormalizedStructureV1]
    modeled_atoms: dict[str, list[int]]
    warnings: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)
    cap_count: int = 0
    graphs: dict[str, NormalizedStructureV1] = field(default_factory=dict)
    protein: dict[str, set[int]] = field(default_factory=dict)
    modes: list[str] = field(default_factory=list)

    @property
    def coordinates(self) -> Any:
        return np.asarray(self.molecule.GetConformer().GetPositions(), dtype=np.float64)


def resolve_selection(
    sources: dict[str, NormalizedStructureV1], selection: SelectionV1, expand_h: bool
) -> SelectionV1:
    keys = {(a.structure_id, a.atom_id) for a in selection.atoms}
    if not keys:
        raise CalculationError("selection_empty", "Select atoms before minimizing")
    for entry in {e for e, _ in keys}:
        if entry not in sources:
            raise CalculationError("entry_missing", "A selected entry is missing")
        source = sources[entry]
        atoms = {a.id: a for a in source.atoms}
        selected = {i for e, i in keys if e == entry}
        if not selected <= atoms.keys():
            raise CalculationError("atom_missing", "A selected atom is missing")
        if expand_h:
            neighbors: dict[int, list[int]] = {a: [] for a in atoms}
            for b in source.bonds:
                neighbors[b.atom_1_id].append(b.atom_2_id)
                neighbors[b.atom_2_id].append(b.atom_1_id)
            keys.update(
                (entry, a)
                for a, adjacent in neighbors.items()
                if atoms[a].element == "H"
                and len(adjacent) == 1
                and adjacent[0] in selected
                and atoms[adjacent[0]].element != "H"
            )
    if len(keys) > 2000:
        raise CalculationError(
            "selection_limit", "At most 2000 atoms including attached H may move"
        )
    return canonical_selection(selection, keys)


def read_sources(
    parameters: QuickParameters, inputs: tuple[InputArtifact, ...]
) -> dict[str, NormalizedStructureV1]:
    by_entry = {item.entry_id: item for item in inputs}
    if len(by_entry) != len(inputs) or set(by_entry) != {
        c.entry_id for c in parameters.captured_inputs
    }:
        raise CalculationError("capture_mismatch", "Quick source entries differ from capture")
    result = {}
    for capture in parameters.captured_inputs:
        item = by_entry[capture.entry_id]
        if (item.artifact_id, item.sha256) != (capture.artifact_id, capture.sha256) or (
            hashlib.sha256(item.data).hexdigest() != capture.sha256
        ):
            raise CalculationError(
                "capture_mismatch", "Quick source differs from immutable capture"
            )
        source = NormalizedStructureV1.from_bytes(item.data)
        if (
            source.active_conformer_id != capture.conformer_id
            or sorted(a.id for a in source.atoms) != capture.atom_ids
        ):
            raise CalculationError(
                "capture_mismatch", "Quick source atom/conformer identity changed"
            )
        if any(not isfinite(v) for p in source.active_coordinates for v in p):
            raise CalculationError(
                "invalid_coordinates", "Quick minimization requires finite coordinates"
            )
        result[capture.entry_id] = source
    resolved = resolve_selection(
        result, parameters.requested_selection, parameters.expand_hydrogens
    )
    if resolved.atoms != parameters.selection.atoms:
        raise CalculationError(
            "selection_mismatch", "Resolved movable mask differs from captured mask"
        )
    return result


def build_assembly(
    sources: dict[str, NormalizedStructureV1],
    parameters: QuickParameters,
    membership: dict[str, set[int]] | None = None,
) -> QuickAssembly:
    keys = {(a.structure_id, a.atom_id) for a in parameters.selection.atoms}
    combined: Any = None
    references: list[AtomKey | None] = []
    movable: list[int] = []
    modeled: dict[str, list[int]] = {}
    warnings: list[str] = []
    assumptions: list[str] = []
    graphs = {}
    proteins = {}
    template_assumptions = {}
    for entry, source in sources.items():
        graphs[entry], proteins[entry], template_assumptions[entry] = protein_graph(source)
    discovered = discover(graphs, keys, proteins)
    if membership:
        for entry, ids in membership.items():
            discovered.setdefault(entry, set()).update(ids)
    if sum(len(ids) for ids in discovered.values()) > 20000:
        raise CalculationError(
            "model_limit", "Local calculation exceeds 20000 atoms before helpers"
        )
    caps = 0
    modes: list[str] = []
    for entry, source in sorted(graphs.items()):
        members = discovered.get(entry, set())
        if not members:
            continue
        if any(a.alternate_location for a in source.atoms if a.id in members):
            raise CalculationError(
                "alternate_sites", "Resolve local alternate sites before minimizing"
            )
        if members & proteins[entry]:
            assumptions.extend(f"{entry}: {text}" for text in template_assumptions[entry])
        remaining = set(members)
        while remaining:
            component = connected_atoms(project_atoms(source, members), {min(remaining)})
            remaining.difference_update(component)
            projected = project_atoms(source, component)
            mol, mode, local_caps, notes = interpret(
                source, projected, component, proteins[entry], parameters.allow_repair
            )
            caps += local_caps
            assumptions.extend(
                f"{entry} atoms {min(component)}-{max(component)}: {note}" for note in notes
            )
            if mode == "repair":
                warnings.append(
                    f"Approximate repair for {entry} atoms {sorted(component)}: "
                    "missing physical interactions; fixed unsupported sites are steric obstacles"
                )
            offset = len(references)
            local_refs: list[AtomKey | None] = [(entry, a.id) for a in projected.atoms]
            local_refs.extend([None] * (mol.GetNumAtoms() - len(local_refs)))
            for atom in mol.GetAtoms():
                index = atom.GetIdx()
                ref = local_refs[index]
                moves = (
                    ref in keys
                    if ref
                    else any(local_refs[n.GetIdx()] in keys for n in atom.GetNeighbors())
                )
                if moves:
                    movable.append(offset + index)
            references.extend(local_refs)
            modes.extend([mode] * len(local_refs))
            combined = mol if combined is None else Chem.CombineMols(combined, mol)
            if len(references) > 20000:
                raise CalculationError(
                    "model_limit", "Local calculation exceeds 20000 atoms including helpers"
                )
        modeled[entry] = sorted(members)
    if combined is None:
        raise CalculationError("selection_empty", "Select atoms before minimizing")
    if len(references) > 20000:
        raise CalculationError(
            "model_limit", "Local calculation exceeds 20000 atoms including helpers"
        )
    if caps:
        assumptions.append(
            f"{caps} fixed calculation-only ACE/NME caps at local peptide boundaries; "
            "finite-shell energies are local approximations"
        )
    return QuickAssembly(
        combined,
        references,
        movable,
        sources,
        modeled,
        warnings,
        assumptions,
        caps,
        graphs,
        proteins,
        modes,
    )
