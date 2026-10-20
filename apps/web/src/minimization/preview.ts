import type { CoordinatePatch, MinimizationProposal, Selection } from "../api/types";
import type { CalculationSource } from "./context";

/** Selected-row patches only; canonical structures and query caches stay immutable. */
export function coordinatePatches(selection: Selection, entries: MinimizationProposal["entries"], sources: ReadonlyMap<string, CalculationSource>): CoordinatePatch[] {
  const selected = new Set(selection.atoms.map(a => `${a.structure_id}/${a.atom_id}`));
  const seen = new Set<string>();
  const patches = entries.map(entry => {
    const input = sources.get(entry.entry_id), source = input?.structure;
    if (!input || !source || (source.active_conformer_id ?? 1) !== entry.conformer_id || entry.atom_ids.length !== entry.coordinates.length) throw new Error("Proposal source/conformer is unavailable.");
    const atoms = new Set(source.atoms.map(a => a.id));
    entry.atom_ids.forEach((id, i) => {
      const key = `${entry.entry_id}/${id}`, point = entry.coordinates[i];
      if (!selected.has(key) || seen.has(key) || !atoms.has(id) || point.length !== 3 || !point.every(Number.isFinite)) throw new Error("Proposal does not match the captured selection.");
      seen.add(key);
    });
    return { entry_id: entry.entry_id, artifact_id: input.artifactId, atom_ids: entry.atom_ids, coordinates: entry.coordinates };
  });
  if (seen.size !== selected.size) throw new Error("Proposal omits captured movable atoms.");
  return patches;
}
