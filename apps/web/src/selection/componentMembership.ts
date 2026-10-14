import type { ComponentCategory, ComponentHierarchy, MolecularComponent, NormalizedStructure } from "../api/types";
import { canonicalSelection } from "./selection";

export interface ComponentMembership {
  components: Map<string, number[]>;
  categories: Map<ComponentCategory, number[]>;
}

// A single atom pass, followed by actual component membership, rather than a
// full molecular scan per row. Identity and classification remain API-owned.
export function buildComponentMembership(structure: NormalizedStructure, hierarchy: ComponentHierarchy): ComponentMembership {
  const residues = new Map<number, number[]>();
  const atomIds = new Set<number>();
  for (const atom of structure.atoms) {
    atomIds.add(atom.id);
    if (atom.residue_id !== null) {
      const members = residues.get(atom.residue_id) ?? [];
      members.push(atom.id); residues.set(atom.residue_id, members);
    }
  }
  const components = new Map<string, number[]>();
  const categories = new Map<ComponentCategory, Set<number>>();
  for (const component of hierarchy.components) {
    const members = new Set(component.atom_ids.filter(id => atomIds.has(id)));
    for (const residueId of component.residue_ids) for (const id of residues.get(residueId) ?? []) members.add(id);
    const ids = [...members].sort((a, b) => a - b);
    components.set(component.id, ids);
    const category = categories.get(component.category) ?? new Set<number>();
    for (const id of ids) category.add(id);
    categories.set(component.category, category);
  }
  return { components, categories: new Map([...categories].map(([category, ids]) => [category, [...ids].sort((a, b) => a - b)])) };
}

export function indexedComponentSelection(entryId: string, component: MolecularComponent, atomIds: number[]) {
  const polymer = ["protein", "dna", "rna", "other_polymer"].includes(component.category);
  return canonicalSelection(atomIds.map(atom_id => ({ structure_id: entryId, atom_id })),
    component.atom_ids.length ? "atom" : polymer ? "chain" : "residue", "project");
}

export function indexedCategorySelection(entryId: string, atomIds: number[]) {
  return canonicalSelection(atomIds.map(atom_id => ({ structure_id: entryId, atom_id })), "atom", "project");
}

export function membershipSelectedState(atomIds: number[], selectedIds: Set<number>): boolean | "mixed" {
  if (!atomIds.length) return false;
  let count = 0;
  for (const id of atomIds) if (selectedIds.has(id)) count++;
  return count === 0 ? false : count === atomIds.length ? true : "mixed";
}
