import type { AtomReference } from "../api/types";
import { componentAtomIds } from "../selection/components";
import type { ViewerStructure } from "./MolecularViewer";
import { hydrogenDisplayMode } from "./settings";

function referenceKey(reference: AtomReference): string {
  return `${reference.structure_id}:${reference.atom_id}`;
}

export function visibleLigandAtoms(
  structures: ViewerStructure[],
  isolation: AtomReference[] | null,
): AtomReference[] {
  const isolated = isolation ? new Set(isolation.map(referenceKey)) : null;
  const seen = new Set<string>();
  const references: AtomReference[] = [];

  for (const structure of structures) {
    if (!structure.settings.components.ligands) continue;
    const hydrogenMode = hydrogenDisplayMode(structure.settings.components);
    const ligandAtomIds = new Set(
      structure.hierarchy.components
        .filter((component) => component.category === "ligand")
        .flatMap((component) => componentAtomIds(structure.normalized, component)),
    );
    if (ligandAtomIds.size === 0) continue;

    for (const atom of structure.normalized.atoms) {
      if (!ligandAtomIds.has(atom.id)) continue;
      if (
        hydrogenMode !== "all" &&
        atom.element.trim().toUpperCase() === "H"
      ) {
        continue;
      }
      const reference = {
        structure_id: structure.entryId,
        atom_id: atom.id,
      };
      const key = referenceKey(reference);
      if ((isolated && !isolated.has(key)) || seen.has(key)) continue;
      seen.add(key);
      references.push(reference);
    }
  }

  return references.sort(
    (left, right) =>
      left.structure_id.localeCompare(right.structure_id) ||
      left.atom_id - right.atom_id,
  );
}
