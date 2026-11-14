import type { AtomReference, Selection, StructureProjection } from "../api/types";
import { canonicalSelection } from "./selection";

/** Existing H selected directly or one current graph edge from selected heavy atoms. */
export function resolveHydrogenTargets(
  seed: Selection,
  structures: ReadonlyMap<string, StructureProjection>,
): Selection {
  const selected = new Map<string, Set<number>>();
  for (const reference of seed.atoms) {
    let ids = selected.get(reference.structure_id);
    if (!ids) { ids = new Set(); selected.set(reference.structure_id, ids); }
    ids.add(reference.atom_id);
  }

  const targets: AtomReference[] = [];
  for (const [entryId, selectedIds] of selected) {
    const projection = structures.get(entryId);
    if (!projection || projection.entry_id !== entryId) {
      throw new Error("Selected structure data is unavailable. Reload the selection structures and try again.");
    }
    const hydrogens = new Set<number>();
    const heavySeeds = new Set<number>();
    const resolved = new Set<number>();
    const missing = new Set(selectedIds);
    for (const atom of projection.structure.atoms) {
      const element = atom.element.trim().toUpperCase();
      if (element === "H") hydrogens.add(atom.id);
      if (!selectedIds.has(atom.id)) continue;
      missing.delete(atom.id);
      if (element === "H") resolved.add(atom.id);
      else if (element !== "D" && element !== "T") heavySeeds.add(atom.id);
    }
    if (missing.size) throw new Error("Selected atoms are no longer present. Refresh the selection and try again.");
    if (heavySeeds.size) for (const bond of projection.structure.bonds) {
      // The recorded endpoints, including unknown-order or inferred edges, own
      // adjacency. Coordinates and polarity classification are not consulted.
      if (heavySeeds.has(bond.atom_1_id) && hydrogens.has(bond.atom_2_id)) resolved.add(bond.atom_2_id);
      if (heavySeeds.has(bond.atom_2_id) && hydrogens.has(bond.atom_1_id)) resolved.add(bond.atom_1_id);
    }
    for (const id of resolved) targets.push({ structure_id: entryId, atom_id: id });
  }
  return canonicalSelection(targets, "atom", "inspector");
}
