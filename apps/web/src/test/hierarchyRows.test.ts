import { describe, expect, it } from "vitest";
import { hierarchyRows, type CategoryDefinition } from "../selection/hierarchyRows";
import { buildComponentMembership, membershipSelectedState } from "../selection/componentMembership";
import { componentHierarchy, proteinStructure } from "./molecular-fixtures";
import type { SelectionStructure } from "../selection/gestures";

const definition: CategoryDefinition = { category: "protein", label: "Protein", visibility: "protein" };
function input(): SelectionStructure {
  const normalized = proteinStructure();
  normalized.chains.push({ id: 2, name: "A", entity_type: "polymer" });
  normalized.residues = [90, 7, 25, 2].map((id, i) => ({ ...normalized.residues[0], id,
    chain_id: i === 3 ? 2 : 1, author_number: [10, 10, 3, 10][i], insertion_code: i === 1 ? "A" : null }));
  normalized.atoms = normalized.residues.flatMap((r, i) => [0, 1].map(j => ({ ...normalized.atoms[0], id: i * 2 + j + 1, residue_id: r.id })));
  const template = componentHierarchy(normalized).components[0];
  return { entryId: "entry", normalized, hierarchy: { schema_version: 1, warnings: [], components: [
    { ...template, id: "first", chain_ids: [1], residue_ids: [25, 7, 90] },
    { ...template, id: "second", chain_ids: [2], residue_ids: [2] },
  ] } };
}
const rowsFor = (source: SelectionStructure, expanded: string[]) => hierarchyRows(source,
  buildComponentMembership(source.normalized, source.hierarchy), [{ definition, components: source.hierarchy.components }], ["protein"], expanded);

describe("protein residue navigation rows", () => {
  it("preserves normalized order rather than IDs, numbering or component list order", () => {
    const rows = rowsFor(input(), ["first", "second"]);
    expect(rows.filter(r => r.kind === "residue").map(r => r.kind === "residue" && r.residue.id)).toEqual([90, 7, 25, 2]);
    expect(rows.filter(r => r.kind === "residue").map(r => r.label)).toEqual(["GLY 10", "GLY 10A", "GLY 3", "GLY 10"]);
    expect(rows.filter(r => r.kind === "component").map(r => r.label)).toEqual(["Protein chain A · instance 1", "Protein chain A · instance 2"]);
    expect(rows[2].parentKey).toBe("component:first");
    expect(rows.at(-1)?.parentKey).toBe("component:second");
  });

  it("keeps collapsed children out of rows without changing parent membership", () => {
    const source = input();
    const collapsed = rowsFor(source, []), expanded = rowsFor(source, ["first"]);
    expect(collapsed).toHaveLength(3);
    expect(expanded).toHaveLength(6);
    expect(collapsed[1].members).toEqual([1, 2, 3, 4, 5, 6]);
    expect(expanded[1].members).toEqual(collapsed[1].members);
    expect(membershipSelectedState(expanded[2].members, new Set([1]))).toBe("mixed");
  });

  it("does not infer protein descendants for ambiguous or nonprotein components", () => {
    const source = input();
    source.hierarchy.components[0].classification_status = "ambiguous";
    source.hierarchy.components[1].category = "dna";
    const rows = rowsFor(source, ["first", "second"]);
    expect(rows.some(r => r.kind === "residue")).toBe(false);
    expect(rows.filter(r => r.kind === "component").every(r => !r.expandable)).toBe(true);
  });

  it("materializes 10000 residues with complete membership and reuses the atom index", () => {
    const source = input(), count = 10000;
    const baseResidue = source.normalized.residues[0], baseAtom = source.normalized.atoms[0];
    source.normalized.residues = Array.from({ length: count }, (_, i) => ({ ...baseResidue, id: i + 1, author_number: count - i }));
    source.normalized.atoms = source.normalized.residues.map((r, i) => ({ ...baseAtom, id: i + 1, residue_id: r.id }));
    source.hierarchy.components = [{ ...source.hierarchy.components[0], residue_ids: source.normalized.residues.map(r => r.id) }];
    const membership = buildComponentMembership(source.normalized, source.hierarchy);
    const atoms = source.normalized.atoms;
    let visits = 0;
    Object.defineProperty(source.normalized, "atoms", { get: () => { visits++; return atoms; } });
    const categories = [{ definition, components: source.hierarchy.components }];
    const rows = hierarchyRows(source, membership, categories, ["protein"], ["first"]);
    const indexedVisits = visits;
    expect(rows).toHaveLength(count + 2);
    expect(rows[1].members).toHaveLength(count);
    expect(rows.at(-1)?.members).toEqual([count]);
    hierarchyRows(source, membership, categories, ["protein"], []);
    expect(visits).toBe(indexedVisits);
    expect(visits).toBeLessThanOrEqual(2);
  });
});
