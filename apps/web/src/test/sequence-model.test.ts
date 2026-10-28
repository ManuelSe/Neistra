import { describe, expect, it } from "vitest";
import { proteinSequenceRows, residueCode } from "../selection/sequence";
import { residuePosition } from "../selection/gestures";
import { proteinProjection } from "./molecular-fixtures";

describe("observed protein sequence rows", () => {
  it("keeps source order, numbering gaps, insertion codes and nonstandard names", () => {
    const projection = proteinProjection();
    const first = projection.structure.residues[0];
    first.name = "MSE"; first.author_number = 42; first.insertion_code = "A";
    projection.structure.residues[1].author_number = 3;
    const [row] = proteinSequenceRows({ entryId: "protein", normalized: projection.structure, hierarchy: projection.hierarchy });
    expect(row.residues.map(residue => [residueCode(residue), residuePosition(residue)])).toEqual([["MSE", "42A"], ["A", "3"]]);
    expect(row.residueAtoms.get(first.id)).toEqual([1, 2]);
    expect(row.residues).toHaveLength(2);
  });

  it("never merges separate source components with identical chain labels", () => {
    const projection = proteinProjection();
    const component = projection.hierarchy.components[0];
    projection.hierarchy.components = [{ ...component, id: "first", residue_ids: [1] }, { ...component, id: "second", residue_ids: [2] }];
    const rows = proteinSequenceRows({ entryId: "protein", normalized: projection.structure, hierarchy: projection.hierarchy });
    expect(rows.map(row => [row.componentId, row.chainName, row.residues.map(r => r.id)])).toEqual([
      ["first", "A", [1]], ["second", "A", [2]],
    ]);
    expect(new Set(rows.map(row => row.key)).size).toBe(2);
    expect(rows[1].qualifier).toBe(" · instance 2");
  });

  it.each(["dna", "rna", "other_polymer", "unclassified"] as const)("does not reinterpret %s as protein", category => {
    const projection = proteinProjection();
    projection.hierarchy.components[0].category = category;
    expect(proteinSequenceRows({ entryId: "entry", normalized: projection.structure, hierarchy: projection.hierarchy })).toEqual([]);
  });

  it("excludes ambiguous protein assignments and explicitly labels absent numbering", () => {
    const projection = proteinProjection();
    projection.structure.residues[0].author_number = null;
    projection.structure.residues[0].label_number = null;
    expect(residuePosition(projection.structure.residues[0])).toBe("ID 1");
    projection.hierarchy.components[0].classification_status = "ambiguous";
    expect(proteinSequenceRows({ entryId: "entry", normalized: projection.structure, hierarchy: projection.hierarchy })).toEqual([]);
  });

  it("reuses immutable memberships without retaining a previous entry identity", () => {
    const projection = proteinProjection();
    const source = { entryId: "first", normalized: projection.structure, hierarchy: projection.hierarchy };
    const rows = proteinSequenceRows(source);
    expect(proteinSequenceRows({ ...source, entryId: "second" })).toBe(rows);
    expect(rows[0]).not.toHaveProperty("entryId");
    expect(proteinSequenceRows({ ...source, hierarchy: { ...source.hierarchy } })).not.toBe(rows);
  });
});
