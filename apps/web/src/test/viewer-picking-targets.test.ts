import { describe, expect, it } from "vitest";
import type { AtomReference } from "../api/types";
import { resolvePickingTarget } from "../viewer/pickingTargets";
import { componentHierarchy, proteinStructure } from "./molecular-fixtures";

const refs = (...ids: number[]): AtomReference[] => ids.map(atom_id => ({ structure_id: "entry", atom_id }));
function source() {
  const normalized = proteinStructure();
  normalized.residues.push({ ...normalized.residues[0], id: 5, component_type: "ligand" });
  normalized.atoms.push(...[40, 70, 90].map(id => ({ ...normalized.atoms[0], id, residue_id: id === 90 ? null : 5 })));
  const hierarchy = componentHierarchy(normalized);
  hierarchy.components.find(c => c.category === "ligand")!.atom_ids.push(90);
  hierarchy.components = hierarchy.components.filter(c => c.category !== "unclassified");
  return { entryId: "entry", normalized, hierarchy };
}
const unchanged = (atoms: AtomReference[]) => atoms;

describe("shared picking targets", () => {
  it.each(["atom", "chain", "structure"] as const)("retains native %s normalization and exact sparse IDs", mode => {
    const pick = refs(40, 70);
    expect(resolvePickingTarget(pick, mode, [source()], (raw, received) => {
      expect(raw).toBe(pick); expect(received).toBe(mode); return refs(90, 40, 40);
    }).atoms).toEqual(refs(40, 90));
  });
  it("resolves complete residues and individual components, including explicit members", () => {
    const input = source();
    expect(resolvePickingTarget(refs(1), "residue", [input], unchanged).atoms).toEqual(refs(1, 2));
    const ligand = resolvePickingTarget(refs(40), "residue", [input], unchanged);
    expect(ligand.atoms).toEqual(refs(40, 70, 90));
    expect(resolvePickingTarget(refs(90), "residue", [input], unchanged)).toBe(ligand);
    expect(resolvePickingTarget(refs(1, 40), "residue", [input], unchanged).atoms).toEqual(refs(1, 2, 40, 70, 90));
  });
  it.each(["dna", "rna", "other_polymer", "unclassified"] as const)("retains native residue fallback for %s", category => {
    const input = source(); input.hierarchy.components.find(c => c.category === "ligand")!.category = category;
    expect(resolvePickingTarget(refs(40), "residue", [input], () => refs(40, 70)).atoms).toEqual(refs(40, 70));
  });
  it("does not expand ambiguous components or merge matching IDs across entries", () => {
    const input = source();
    input.hierarchy.components.find(c => c.category === "ligand")!.classification_status = "ambiguous";
    expect(resolvePickingTarget(refs(40), "residue", [input], unchanged).atoms).toEqual(refs(40));
    const second = { ...source(), entryId: "other" };
    expect(resolvePickingTarget([...refs(1), { structure_id: "other", atom_id: 40 }], "residue", [input, second], unchanged).atoms)
      .toEqual([...refs(1, 2), ...[40, 70, 90].map(atom_id => ({ structure_id: "other", atom_id }))]);
    expect(resolvePickingTarget([], "residue", [input], unchanged).atoms).toEqual([]);
    expect(resolvePickingTarget([{ structure_id: "missing", atom_id: 1 }], "residue", [input], unchanged).atoms).toEqual([]);
  });
});
