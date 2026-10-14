import { expect, it } from "vitest";
import type { ComponentHierarchy, MolecularComponent } from "../api/types";
import { buildComponentMembership, indexedCategorySelection, indexedComponentSelection, membershipSelectedState } from "../selection/componentMembership";
import { categorySelection, componentAtomIds, componentSelection } from "../selection/components";
import { componentHierarchy, proteinStructure } from "./molecular-fixtures";

it("matches the established canonical operands including overlaps, gaps, explicit atoms and polymer granularity", () => {
  const structure = proteinStructure();
  structure.atoms = structure.atoms.map((atom, i) => ({ ...atom, id: i * 7 + 1 }));
  const hierarchy = componentHierarchy(structure);
  const explicit: MolecularComponent = { ...hierarchy.components[0], id: "explicit", category: "unclassified",
    residue_ids: [1, 1], atom_ids: [1, 1, 15, 99999], classification_source: "ambiguous", classification_status: "ambiguous" };
  hierarchy.components.push(explicit);
  const before = JSON.stringify({ structure, hierarchy });
  const index = buildComponentMembership(structure, hierarchy);
  for (const component of hierarchy.components) {
    expect(index.components.get(component.id)).toEqual(componentAtomIds(structure, component));
    expect(indexedComponentSelection("entry", component, index.components.get(component.id)!)).toEqual(componentSelection("entry", structure, component));
  }
  for (const category of index.categories.keys()) {
    expect(indexedCategorySelection("entry", index.categories.get(category)!)).toEqual(categorySelection("entry", structure, hierarchy, category));
  }
  expect(JSON.stringify({ structure, hierarchy })).toBe(before);
});

it("visits the atom collection once for ten thousand components and selects complete unmounted categories", () => {
  const structure = proteinStructure();
  const atoms = Array.from({ length: 10000 }, (_, i) => ({ ...structure.atoms[0], id: i + 1, residue_id: null }));
  let scans = 0;
  Object.defineProperty(structure, "atoms", { get: () => { scans++; return atoms; } });
  const hierarchy: ComponentHierarchy = { schema_version: 1, warnings: [], components: atoms.map(atom => ({
    id: `water-${atom.id}`, category: "water", display_label: `Synthetic water ${atom.id}`, chain_ids: [], residue_ids: [], atom_ids: [atom.id],
    classification_source: "fallback", classification_status: "assigned", warnings: [],
  })) };
  const index = buildComponentMembership(structure, hierarchy);
  expect(scans).toBe(1);
  expect(index.components.size).toBe(10000);
  const category = indexedCategorySelection("entry", index.categories.get("water")!);
  expect(category.atoms).toHaveLength(10000);
  expect(category.atoms[9999]).toEqual({ structure_id: "entry", atom_id: 10000 });
  expect(membershipSelectedState(index.categories.get("water")!, new Set([1, 9999]))).toBe("mixed");
  expect(membershipSelectedState([1], new Set([1]))).toBe(true);
  expect(membershipSelectedState([1], new Set())).toBe(false);
  expect(membershipSelectedState([], new Set([1]))).toBe(false);
});
