import type { AtomReference, Entry, StructureProjection, SurfaceObject, SurfaceSource } from "../api/types";
import { componentAtomIds } from "./components";

/** Canonical scientific source, independent of disposable viewer visibility. */
export function surfaceSourceAtoms(entry: Entry, surface: SurfaceObject, projection?: StructureProjection): AtomReference[] | null {
  const ids = surface.source.kind === "entry" ? entry.atom_ids
    : surface.source.kind === "fragment" ? surface.source.atom_ids
      : projection ? projection.hierarchy.components.filter(component => component.category === "protein")
        .flatMap(component => componentAtomIds(projection.structure, component)) : null;
  return ids && [...new Set(ids)].sort((a, b) => a - b).map(atom_id => ({ structure_id: entry.id, atom_id }));
}

export function capturedFragmentSource(entry: Entry, atoms: AtomReference[]): SurfaceSource {
  if (!atoms.length || atoms.some(atom => atom.structure_id !== entry.id)) {
    throw new Error("Select a nonempty fragment belonging only to this entry.");
  }
  const valid = new Set(entry.atom_ids);
  if (atoms.some(atom => !valid.has(atom.atom_id))) throw new Error("The selected source contains unavailable atoms.");
  return { kind: "fragment", profile: "molecular-v1", atom_ids: [...new Set(atoms.map(atom => atom.atom_id))].sort((a, b) => a - b) };
}
