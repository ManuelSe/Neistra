import type { Entry, StructureProjection } from "../api/types";
import type { ResolvedPocket } from "../viewer/MolecularViewer";

export interface PocketProjection {
  data?: StructureProjection;
  current: boolean;
  failed?: boolean;
}

/** Application-owned artifact snapshots; hidden seeds never become viewer structures. */
export function resolvePocketInputs(
  entries: Entry[], projections: ReadonlyMap<string, PocketProjection>,
): Map<string, ResolvedPocket> {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const atomMaps = new Map<string, Map<number, [number, number, number]>>();
  const result = new Map<string, ResolvedPocket>();
  for (const owner of entries) {
    const definition = owner.viewer_settings.selection_pocket_surface;
    if (!owner.visible || !definition) continue;
    const sources = [...new Set([owner.id, ...definition.seed_atom_references.map((seed) => seed.structure_id)])].sort();
    const dependencyKey = JSON.stringify([definition, sources.map((id) => [
      id, byId.get(id)?.current_artifact_id, projections.get(id)?.current ?? false,
      projections.get(id)?.failed ?? false,
    ])]);
    let unavailable: string | undefined;
    const seeds: ResolvedPocket["seeds"] = [];
    for (const id of sources) {
      const snapshot = projections.get(id);
      if (!byId.has(id)) unavailable = "A captured seed entry is unavailable.";
      else if (snapshot?.failed) unavailable = "Pocket inputs could not load. Retry loading the structure.";
      else if (!snapshot?.current || !snapshot.data) unavailable ??= "Loading current pocket inputs…";
    }
    if (!unavailable) {
      for (const reference of definition.seed_atom_references) {
        let coordinates = atomMaps.get(reference.structure_id);
        if (!coordinates) {
          coordinates = new Map(projections.get(reference.structure_id)!.data!.structure.atoms
            .map((atom) => [atom.id, atom.coordinates]));
          atomMaps.set(reference.structure_id, coordinates);
        }
        const point = coordinates.get(reference.atom_id);
        if (!point) { unavailable = "A captured seed atom is unavailable."; break; }
        seeds.push({ reference, coordinates: [...point] });
      }
    }
    result.set(owner.id, { radius: definition.radius, seeds, dependencyKey, unavailable });
  }
  return result;
}
