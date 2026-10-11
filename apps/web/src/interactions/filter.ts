import type { AtomReference } from "../api/types";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { visibleRepresentationAtomIds } from "../viewer/representationProjection";
import { atomicRepresentationStyles } from "../viewer/settings";
import type { InteractionChoices, InteractionRecord } from "./types";

export function filterInteractions(records: InteractionRecord[], choices: InteractionChoices, structures: ViewerStructure[], isolation: AtomReference[] | null, nativeNonpolar?: ReadonlyMap<string, ReadonlySet<number>>): InteractionRecord[] {
  const visible = new Map(structures.map(structure => {
    const isolated = isolation === null ? null : new Set(isolation.filter(ref => ref.structure_id === structure.entryId).map(ref => ref.atom_id));
    const atoms = new Map(structure.normalized.atoms.map(atom => [atom.id, atom]));
    const nonpolar = nativeNonpolar?.get(structure.entryId) ?? new Set(structure.normalized.bonds.flatMap(bond => {
      const a = atoms.get(bond.atom_1_id), b = atoms.get(bond.atom_2_id);
      return a?.element === "H" && b?.element === "C" ? [a.id] : b?.element === "H" && a?.element === "C" ? [b.id] : [];
    }));
    const ids = visibleRepresentationAtomIds(structure, isolated, nonpolar);
    // Atom-detail masks apply where an atomic representation is responsible.
    for (const id of structure.settings.selection_hidden_atoms) {
      if (structure.settings.representations.some(rep => atomicRepresentationStyles.some(style => style === rep.style)) || structure.settings.selection_representations.some(rep => atomicRepresentationStyles.includes(rep.style) && rep.atom_ids.includes(id))) ids.delete(id);
    }
    return [structure.entryId, ids] as const;
  }));
  return records.filter(record => choices.types.includes(record.kind) && choices[record.scope] && record.participants.every(group => group.every(ref => visible.get(ref.structure_id)?.has(ref.atom_id))));
}
