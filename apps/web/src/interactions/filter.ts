import type { AtomReference } from "../api/types";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { visibleRepresentationAtomIds } from "../viewer/representationProjection";
import type { InteractionChoices, InteractionRecord } from "./types";

export function filterInteractions(records: InteractionRecord[], choices: InteractionChoices, structures: ViewerStructure[], isolation: AtomReference[] | null): InteractionRecord[] {
  const visible = new Map(structures.map(structure => {
    const isolated = isolation === null ? null : new Set(isolation.filter(ref => ref.structure_id === structure.entryId).map(ref => ref.atom_id));
    const atoms = new Map(structure.normalized.atoms.map(atom => [atom.id, atom]));
    const nonpolar = new Set(structure.normalized.bonds.flatMap(bond => {
      const a = atoms.get(bond.atom_1_id), b = atoms.get(bond.atom_2_id);
      return a?.element === "H" && b?.element === "C" ? [a.id] : b?.element === "H" && a?.element === "C" ? [b.id] : [];
    }));
    const ids = visibleRepresentationAtomIds(structure, isolated, nonpolar);
    // Atom-detail masks apply where an atomic representation is responsible.
    if (structure.settings.representations.some(rep => ["line", "stick", "ball-and-stick", "spacefill"].includes(rep.style))) {
      for (const id of structure.settings.selection_hidden_atoms) ids.delete(id);
    }
    return [structure.entryId, ids] as const;
  }));
  return records.filter(record => choices.types.includes(record.kind) && choices[record.scope] && record.participants.every(group => group.every(ref => visible.get(ref.structure_id)?.has(ref.atom_id))));
}
