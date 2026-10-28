import type { AtomReference, ViewerSettings } from "../api/types";
import { gestureIndex } from "../selection/gestures";
import { proteinSequenceRows, type ProteinSequenceRow } from "../selection/sequence";
import type { ViewerStructure } from "./MolecularViewer";
import { representationLayers, visibleRepresentationAtomIds } from "./representationProjection";

interface DisplayCache {
  entryId: string;
  isolation: readonly AtomReference[] | null;
  pockets: string;
  rows: ProteinSequenceRow[];
}
const displayed = new WeakMap<ReturnType<typeof gestureIndex>, WeakMap<ViewerSettings, DisplayCache>>();

/** Logical application display, never pixels or renderer-owned molecular state. */
export function displayedProteinRows(source: ViewerStructure, isolation: readonly AtomReference[] | null): ProteinSequenceRow[] {
  const index = gestureIndex({ entryId: source.entryId, normalized: source.normalized, hierarchy: source.hierarchy });
  let settingsCache = displayed.get(index);
  if (!settingsCache) { settingsCache = new WeakMap(); displayed.set(index, settingsCache); }
  const pockets = JSON.stringify(Object.entries(source.pockets ?? {}).map(([id, pocket]) => [id, pocket.dependencyKey, pocket.unavailable]));
  const retained = settingsCache.get(source.settings);
  if (retained?.entryId === source.entryId && retained.isolation === isolation && retained.pockets === pockets) return retained.rows;
  const rows = proteinSequenceRows({ entryId: source.entryId, normalized: source.normalized, hierarchy: source.hierarchy });
  const isolated = isolation === null ? null : new Set(isolation.filter(ref => ref.structure_id === source.entryId).map(ref => ref.atom_id));
  const nonpolar = new Set<number>();
  const atoms = new Map(source.normalized.atoms.map(atom => [atom.id, atom]));
  for (const bond of source.normalized.bonds) {
    const a = atoms.get(bond.atom_1_id), b = atoms.get(bond.atom_2_id);
    if (a?.element === "H" && b?.element === "C") nonpolar.add(a.id);
    if (b?.element === "H" && a?.element === "C") nonpolar.add(b.id);
  }
  const visible = new Set(representationLayers(source, isolated, nonpolar).filter(layer => layer.opacity > 0).flatMap(layer => layer.atomIds));
  const available = visibleRepresentationAtomIds(source, isolated, nonpolar);
  for (const surface of source.settings.surface_objects) {
    if (!surface.visible || surface.appearance.opacity <= 0) continue;
    if (surface.source.kind === "fragment") {
      for (const id of surface.source.atom_ids) if (available.has(id)) visible.add(id);
    } else if (surface.source.kind === "pocket" && source.settings.components.protein
      && source.pockets?.[surface.id] && !source.pockets[surface.id].unavailable) {
      // Retain source-chain context, independent of cropped triangles and seeds.
      for (const row of rows) for (const residue of row.residues) {
        for (const id of row.residueAtoms.get(residue.id) ?? []) if (available.has(id)) visible.add(id);
      }
    }
  }
  const result = rows.filter(row => row.residues.some(residue =>
    (row.residueAtoms.get(residue.id) ?? []).some(id => visible.has(id))));
  settingsCache.set(source.settings, { entryId: source.entryId, isolation, pockets, rows: result });
  return result;
}
