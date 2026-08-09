import type { Selection, StructureProjection } from "../api/types";

const TRACE_NAMES: Record<"protein" | "dna" | "rna", Set<string>> = {
  protein: new Set(["CA"]),
  dna: new Set(["C4'", "C4*"]),
  rna: new Set(["C4'", "C4*"]),
};

export function polymerStyleUnavailableReason(
  selection: Selection,
  structures: ReadonlyMap<string, StructureProjection>,
): string | null {
  if (selection.atoms.length === 0) return "Select atoms before choosing a polymer style";
  const selectedByEntry = new Map<string, Set<number>>();
  for (const reference of selection.atoms) {
    const selected = selectedByEntry.get(reference.structure_id) ?? new Set<number>();
    selected.add(reference.atom_id);
    selectedByEntry.set(reference.structure_id, selected);
  }
  for (const [entryId, selected] of selectedByEntry) {
    const projection = structures.get(entryId);
    if (!projection) return "Selected structures could not be loaded for polymer validation";
    const atomsById = new Map(projection.structure.atoms.map((atom) => [atom.id, atom]));
    const atomsByResidue = new Map<number, Set<number>>();
    for (const atom of projection.structure.atoms) {
      if (atom.residue_id === null) continue;
      const atomIds = atomsByResidue.get(atom.residue_id) ?? new Set<number>();
      atomIds.add(atom.id);
      atomsByResidue.set(atom.residue_id, atomIds);
    }
    const supportedResidues = new Map<number, keyof typeof TRACE_NAMES>();
    for (const component of projection.hierarchy.components) {
      if (!(component.category in TRACE_NAMES)) continue;
      for (const residueId of component.residue_ids) {
        supportedResidues.set(
          residueId,
          component.category as keyof typeof TRACE_NAMES,
        );
      }
    }
    const selectedResidues = new Set<number>();
    for (const atomId of selected) {
      const residueId = atomsById.get(atomId)?.residue_id;
      if (residueId === null || residueId === undefined || !supportedResidues.has(residueId)) {
        return "Backbone and Cartoon require complete protein, DNA, or RNA residues";
      }
      selectedResidues.add(residueId);
    }
    const expected = new Set(
      [...selectedResidues].flatMap((residueId) => [
        ...(atomsByResidue.get(residueId) ?? []),
      ]),
    );
    if (selected.size !== expected.size || [...selected].some((atomId) => !expected.has(atomId))) {
      return "Backbone and Cartoon require every atom in each selected residue";
    }
    for (const residueId of selectedResidues) {
      const category = supportedResidues.get(residueId);
      const traceNames = category ? TRACE_NAMES[category] : undefined;
      if (
        !traceNames ||
        ![...(atomsByResidue.get(residueId) ?? [])].some((atomId) =>
          traceNames.has(atomsById.get(atomId)?.name.trim().toUpperCase() ?? ""),
        )
      ) {
        return "Backbone and Cartoon require usable trace atoms in every selected residue";
      }
    }
  }
  return null;
}
