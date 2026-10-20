import { describe, expect, it } from "vitest";
import { DoubleClickSequence, doubleClickExpansion, gestureIndex, type SelectionStructure } from "../selection/gestures";
import { componentHierarchy, proteinStructure } from "./molecular-fixtures";

const refs = (...ids: number[]) => ids.map(atom_id => ({ structure_id: "entry", atom_id }));
function source(): SelectionStructure {
  const normalized = proteinStructure();
  normalized.residues.push({ ...normalized.residues[0], id: 3, component_type: "ligand" });
  normalized.atoms.push(...[4, 5, 6].map(id => ({ ...normalized.atoms[0], id, residue_id: id === 6 ? null : 3 })));
  const hierarchy = componentHierarchy(normalized);
  const ligand = hierarchy.components.find(item => item.category === "ligand")!;
  ligand.atom_ids.push(6);
  hierarchy.components = hierarchy.components.filter(item => item.category !== "unclassified");
  return { entryId: "entry", normalized, hierarchy };
}

describe("canonical double-click expansion", () => {
  it("selects one complete protein residue, including a same-residue bond hit", () => {
    const input = source();
    expect(doubleClickExpansion(refs(1), [input])?.selection.atoms).toEqual(refs(1, 2));
    expect(doubleClickExpansion(refs(1, 2), [input])?.selection.granularity).toBe("residue");
    expect(doubleClickExpansion(refs(1, 3), [input])).toBeNull();
    expect(gestureIndex(input)).toBe(gestureIndex(input));
  });

  it("uses complete component membership rather than entry, proximity or connectivity", () => {
    const input = source();
    expect(doubleClickExpansion(refs(4), [input])?.selection.atoms).toEqual(refs(4, 5, 6));
    expect(doubleClickExpansion(refs(4, 6), [input])?.selection.atoms).toEqual(refs(4, 5, 6));
    expect(doubleClickExpansion(refs(1, 4), [input])).toBeNull();
    expect(doubleClickExpansion([{ structure_id: "other", atom_id: 4 }, ...refs(4)], [input])).toBeNull();
  });

  it.each(["dna", "rna", "other_polymer", "unclassified"] as const)("retains ordinary picking for %s", category => {
    const input = source();
    input.hierarchy.components.find(item => item.category === "ligand")!.category = category;
    expect(doubleClickExpansion(refs(4), [input])).toBeNull();
  });

  it("refuses missing/ambiguous hits and consumes only matching accepted pairs", () => {
    const input = source();
    expect(doubleClickExpansion([], [input])).toBeNull();
    expect(doubleClickExpansion(refs(999), [input])).toBeNull();
    expect(doubleClickExpansion(refs(1), [])).toBeNull();
    const sequence = new DoubleClickSequence();
    const a = doubleClickExpansion(refs(1), [input]);
    const b = doubleClickExpansion(refs(2), [input]);
    const ligand = doubleClickExpansion(refs(4), [input]);
    sequence.record(a); expect(sequence.take()).toBeNull();
    sequence.record(a); sequence.record(b); expect(sequence.take()).toEqual(b);
    expect(sequence.take()).toBeNull();
    sequence.record(a); sequence.record(ligand); expect(sequence.take()).toBeNull();
    sequence.record(a); sequence.clear(); sequence.record(b); expect(sequence.take()).toBeNull();
    sequence.record(a); sequence.record(null); sequence.record(b); expect(sequence.take()).toBeNull();
    input.hierarchy.components.find(item => item.category === "ligand")!.classification_status = "ambiguous";
    // A new immutable API projection gets a distinct index.
    expect(doubleClickExpansion(refs(4), [{ ...input, hierarchy: { ...input.hierarchy } }])).toBeNull();
  });
});
