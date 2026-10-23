import { useSelectionStore } from "../store/selection";
import { canonicalSelection, emptySelection } from "../selection/selection";
import type { SelectionMode } from "../api/types";
import { beforeEach, describe, expect, it } from "vitest";
import { DoubleClickSequence, doubleClickExpansion, gestureIndex, residueLabel, residuePosition, type ResidueSelectionRequest, type SelectionStructure } from "../selection/gestures";
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

// Source order intentionally differs from residue/atom-number sorting. A separate
// protein component lies between two same-component residues in the same chain.
function rangeSource(): SelectionStructure {
  const normalized = proteinStructure();
  normalized.chains = [{ id: 1, name: "A", entity_type: "polymer" }, { id: 2, name: "A", entity_type: "polymer" }];
  normalized.residues = [101, 5, 99, 88, 2, 77].map((id, index) => ({ ...normalized.residues[0], id,
    chain_id: index === 5 ? 2 : 1, author_number: [10, 10, 20, 24, 3, 10][index], insertion_code: index === 1 ? "A" : null }));
  normalized.atoms = normalized.residues.flatMap((residue, index) => [0, 1].map(offset => ({ ...normalized.atoms[0],
    id: (index + 1) * 10 + offset, residue_id: residue.id })));
  const component = componentHierarchy(normalized).components[0];
  const hierarchy = { schema_version: 1 as const, warnings: [], components: [
    { ...component, id: "main", chain_ids: [1], residue_ids: [101, 5, 88, 2] },
    { ...component, id: "split", chain_ids: [1], residue_ids: [99] },
    { ...component, id: "other-chain", chain_ids: [2], residue_ids: [77] },
  ] };
  return { entryId: "entry", normalized, hierarchy };
}


describe("application-owned fixed residue anchors", () => {
  const source = rangeSource();
  const context = { source, projectId: "project", artifactId: "artifact" };
  const state = () => useSelectionStore.getState();
  const emit = (ids: number[], hit: number, mode: SelectionMode = "replace", shift = false, kind: "single" | "double" = "single") => {
    state().applyViewer(canonicalSelection(refs(...ids), kind === "double" ? "residue" : state().pickingGranularity, "viewer"),
      mode, { atoms: refs(hit), kind, shift }, context);
  };
  const panel = (residueId: number, mode: SelectionMode = "replace", shift = false, overrides: Partial<ResidueSelectionRequest> = {}) => {
    state().applyResidue({ projectId: "project", projectEpoch: state().projectEpoch, entryId: "entry",
      artifactId: "artifact", residueId, source: "sequence", mode, shift, ...overrides }, context);
  };
  beforeEach(() => {
    useSelectionStore.setState({ projectId: null, projectEpoch: 0, rangeAnchor: null, selection: emptySelection(), pickingGranularity: "atom" });
    state().setProject("project");
    state().setPickingGranularity("residue");
  });

  it("adds inclusive ranges both ways from a fixed explicit anchor and preserves unrelated atoms", () => {
    emit([20, 21], 20);
    const anchor = state().rangeAnchor;
    expect(anchor?.residueId).toBe(5);
    state().apply(canonicalSelection([{ structure_id: "unrelated", atom_id: 900 }]), "add");
    emit([50, 51], 50, "add", true);
    expect(state().selection.atoms).toEqual([...refs(20, 21, 40, 41, 50, 51), { structure_id: "unrelated", atom_id: 900 }]);
    expect(state().rangeAnchor).toBe(anchor);
    emit([10, 11], 10, "add", true);
    expect(state().selection.atoms).toEqual([...refs(10, 11, 20, 21, 40, 41, 50, 51), { structure_id: "unrelated", atom_id: 900 }]);
    expect(state().rangeAnchor).toBe(anchor);
    emit([20, 21], 20, "add", true);
    expect(state().rangeAnchor).toBe(anchor);
  });

  it("falls back to additive picking across source components, chain identities and entries", () => {
    emit([20, 21], 20);
    emit([30, 31], 30, "add", true);
    expect(state().selection.atoms).toEqual(refs(20, 21, 30, 31));
    emit([60, 61], 60, "add", true);
    expect(state().selection.atoms).toEqual(refs(20, 21, 30, 31, 60, 61));
    const other = [{ structure_id: "other", atom_id: 50 }, { structure_id: "other", atom_id: 51 }];
    state().applyViewer(canonicalSelection(other, "residue", "viewer"), "add", { atoms: [other[0]], kind: "single", shift: true },
      { ...context, source: { ...source, entryId: "other" } });
    expect(state().selection.atoms).toEqual([...refs(20, 21, 30, 31, 60, 61), ...other]);
    expect(state().rangeAnchor?.residueId).toBe(5);
  });

  it("uses Atom-mode whole-residue ranges only after explicit residue double-click", () => {
    state().setPickingGranularity("atom");
    emit([20], 20);
    emit([50], 50, "add", true);
    expect(state().selection.atoms).toEqual(refs(20, 50));
    expect(state().rangeAnchor).toBeNull();
    emit([20, 21], 20, "replace", false, "double");
    emit([50], 50, "add", true);
    expect(state().selection.atoms).toEqual(refs(20, 21, 40, 41, 50, 51));
    emit([10], 10);
    expect(state().rangeAnchor).toBeNull();
  });

  it("invalidates on subtraction, replacement, clear, artifact/mode/project change without inferring anchors", () => {
    emit([20, 21], 20, "toggle");
    expect(state().rangeAnchor?.residueId).toBe(5);
    state().apply(canonicalSelection(refs(20)), "subtract");
    expect(state().rangeAnchor).toBeNull();
    emit([20, 21], 20);
    emit([20, 21], 20, "toggle");
    expect(state().rangeAnchor).toBeNull();
    emit([20, 21], 20);
    state().replace(canonicalSelection(refs(20, 21)));
    expect(state().rangeAnchor).toBeNull();
    state().apply(canonicalSelection(refs(40, 41)), "add");
    expect(state().rangeAnchor).toBeNull();
    emit([20, 21], 20);
    state().reconcileAnchor([{ id: "entry", current_artifact_id: "artifact" }]);
    expect(state().rangeAnchor).not.toBeNull();
    state().reconcileAnchor([{ id: "entry", current_artifact_id: "new-artifact" }]);
    expect(state().rangeAnchor).toBeNull();
    emit([20, 21], 20);
    state().setPickingGranularity("residue");
    expect(state().rangeAnchor).not.toBeNull();
    state().setPickingGranularity("atom");
    expect(state().rangeAnchor).toBeNull();
    state().setPickingGranularity("residue"); emit([20, 21], 20);
    state().clear(); expect(state().rangeAnchor).toBeNull();
    emit([20, 21], 20);
    const epoch = state().projectEpoch;
    state().setProject("another"); state().setProject("project");
    expect(state().rangeAnchor).toBeNull(); expect(state().selection.atoms).toEqual([]);
    expect(state().projectEpoch).toBe(epoch + 2);
  });

  it("ignores stale projects and preserves modifier precedence without creating Shift/Alt anchors", () => {
    emit([20, 21], 20, "add", true);
    expect(state().rangeAnchor).toBeNull();
    emit([20, 21], 20);
    const before = state().selection;
    state().applyViewer(canonicalSelection(refs(50, 51)), "replace", { atoms: refs(50), kind: "single", shift: false }, { ...context, projectId: "old" });
    expect(state().selection).toBe(before);
    emit([50, 51], 50, "toggle", true);
    expect(state().selection.atoms).toEqual(refs(20, 21, 50, 51));
    expect(state().rangeAnchor?.residueId).toBe(5);
    emit([20, 21], 20, "subtract", true);
    expect(state().rangeAnchor).toBeNull();
    state().applyViewer(canonicalSelection(refs(50, 51)), "add", { atoms: refs(50), kind: "single", shift: true }, { ...context, artifactId: "changed" });
    expect(state().rangeAnchor).toBeNull();
  });
  it.each(["atom", "residue", "chain", "structure"] as const)("selects complete panel residues and ranges in %s picking mode", mode => {
    state().setPickingGranularity(mode);
    panel(5);
    expect(state().selection.atoms).toEqual(refs(20, 21));
    const start = state().rangeAnchor;
    panel(2, "add", true);
    expect(state().selection.atoms).toEqual(refs(20, 21, 40, 41, 50, 51));
    panel(101, "add", true);
    expect(state().selection.atoms).toEqual(refs(10, 11, 20, 21, 40, 41, 50, 51));
    expect(state().rangeAnchor).toBe(start);
    expect(state().selection.source).toBe("sequence");
    expect(state().pickingGranularity).toBe(mode);
  });

  it("extends viewer starts from panels and panel starts from the viewer with correct result source", () => {
    emit([20, 21], 20);
    panel(2, "add", true);
    expect(state().selection.atoms).toEqual(refs(20, 21, 40, 41, 50, 51));
    expect(state().selection.source).toBe("sequence");
    panel(101, "replace", false, { source: "project" });
    emit([40, 41], 40, "add", true);
    expect(state().selection.atoms).toEqual(refs(10, 11, 20, 21, 40, 41));
    expect(state().selection.source).toBe("viewer");
    expect(state().rangeAnchor?.residueId).toBe(101);
  });

  it("completes partial residues, toggles them off and preserves independent atoms", () => {
    state().apply(canonicalSelection(refs(20, 60)));
    panel(5, "toggle");
    expect(state().selection.atoms).toEqual(refs(20, 21, 60));
    expect(state().rangeAnchor?.residueId).toBe(5);
    panel(5, "toggle");
    expect(state().selection.atoms).toEqual(refs(60));
    expect(state().rangeAnchor).toBeNull();
    panel(5, "add", true);
    expect(state().rangeAnchor).toBeNull();
    panel(5, "subtract");
    expect(state().selection.atoms).toEqual(refs(60));
  });

  it("never bridges a separate source instance or repeated chain label", () => {
    panel(5);
    panel(99, "add", true);
    panel(77, "add", true);
    expect(state().selection.atoms).toEqual(refs(20, 21, 30, 31, 60, 61));
    expect(state().rangeAnchor?.residueId).toBe(5);
    panel(88, "toggle", true);
    expect(state().rangeAnchor?.residueId).toBe(5);
  });

  it("rejects retired project visits, artifacts, missing and nonprotein residues", () => {
    panel(5);
    const before = state();
    for (const overrides of [{ projectId: "old" }, { projectEpoch: before.projectEpoch - 1 },
      { artifactId: "old" }, { entryId: "other" }, { residueId: 900 }]) {
      panel(2, "replace", false, overrides);
      expect(state()).toBe(before);
    }
    const nonprotein = { ...source, hierarchy: { ...source.hierarchy, components: source.hierarchy.components.map(c => ({ ...c, category: "dna" as const })) } };
    state().applyResidue({ projectId: "project", projectEpoch: before.projectEpoch, artifactId: "artifact", entryId: "entry",
      residueId: 5, mode: "replace", source: "project", shift: false }, { ...context, source: nonprotein });
    expect(state()).toBe(before);
    state().setProject("elsewhere"); state().setProject("project");
    panel(2, "replace", false, { projectEpoch: before.projectEpoch });
    expect(state().selection.atoms).toEqual([]);
  });

  it("keeps a reused immutable structure independent from entry identity", () => {
    const other = { ...context, source: { ...source, entryId: "other" } };
    state().applyResidue({ projectId: "project", projectEpoch: state().projectEpoch, entryId: "other", artifactId: "artifact",
      residueId: 5, mode: "replace", source: "project", shift: false }, other);
    expect(state().selection.atoms).toEqual([20, 21].map(atom_id => ({ structure_id: "other", atom_id })));
    expect(state().rangeAnchor?.entryId).toBe("other");
  });

  it("preserves author, label and internal identity without inventing numbering", () => {
    const residue = source.normalized.residues[1];
    expect(residueLabel(residue)).toBe("GLY 10A");
    expect(residuePosition({ ...residue, author_number: null, label_number: 0 })).toBe("0A");
    expect(residueLabel({ ...residue, name: "MSE", author_number: null, label_number: null })).toBe("MSE ID 5");
  });

});
