import type {
  AtomReference,
  ComponentCategory,
  ComponentHierarchy,
  MolecularComponent,
  NormalizedStructure,
  Selection,
} from "../api/types";
import { canonicalSelection } from "./selection";

export function componentAtomIds(
  structure: NormalizedStructure,
  component: MolecularComponent,
): number[] {
  const residueIds = new Set(component.residue_ids);
  const explicitIds = new Set(component.atom_ids);
  return structure.atoms
    .filter(
      (atom) =>
        explicitIds.has(atom.id) ||
        (atom.residue_id !== null && residueIds.has(atom.residue_id)),
    )
    .map((atom) => atom.id)
    .sort((left, right) => left - right);
}

function references(entryId: string, atomIds: Iterable<number>): AtomReference[] {
  return [...atomIds].map((atomId) => ({
    structure_id: entryId,
    atom_id: atomId,
  }));
}

export function componentSelection(
  entryId: string,
  structure: NormalizedStructure,
  component: MolecularComponent,
): Selection {
  const granularity =
    component.atom_ids.length > 0
      ? "atom"
      : component.category === "protein" ||
          component.category === "dna" ||
          component.category === "rna" ||
          component.category === "other_polymer"
        ? "chain"
        : "residue";
  return canonicalSelection(
    references(entryId, componentAtomIds(structure, component)),
    granularity,
    "project",
  );
}

export function categorySelection(
  entryId: string,
  structure: NormalizedStructure,
  hierarchy: ComponentHierarchy,
  category: ComponentCategory,
): Selection {
  const atomIds = new Set(
    hierarchy.components
      .filter((component) => component.category === category)
      .flatMap((component) => componentAtomIds(structure, component)),
  );
  return canonicalSelection(references(entryId, atomIds), "atom", "project");
}

export function selectedState(
  current: Selection,
  operand: Selection,
): boolean | "mixed" {
  if (operand.atoms.length === 0) return false;
  const currentKeys = new Set(
    current.atoms.map((atom) => `${atom.structure_id}:${atom.atom_id}`),
  );
  const selectedCount = operand.atoms.filter((atom) =>
    currentKeys.has(`${atom.structure_id}:${atom.atom_id}`),
  ).length;
  if (selectedCount === 0) return false;
  if (selectedCount === operand.atoms.length) return true;
  return "mixed";
}
