import type { AtomReference } from "../api/types";
import type { ViewerStructure } from "./MolecularViewer";

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
    const ligandResidues = new Set(
      structure.normalized.residues
        .filter((residue) => residue.component_type === "ligand")
        .map((residue) => residue.id),
    );
    if (ligandResidues.size === 0) continue;

    for (const atom of structure.normalized.atoms) {
      if (atom.residue_id === null || !ligandResidues.has(atom.residue_id)) continue;
      if (
        !structure.settings.components.hydrogens &&
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
