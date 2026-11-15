import { describe, expect, it } from "vitest";
import type { AtomReference, Entry, StructureProjection } from "../api/types";
import { captureLigandTarget, captureSelectionTarget, filterTargetInteractions, resolveInteractionLigands, validateInteractionTarget } from "../interactions/target";
import type { InteractionRecord } from "../interactions/types";
import { molecularEntry, proteinStructure } from "./molecular-fixtures";

const ref = (atom_id: number, structure_id = "a"): AtomReference => ({ structure_id, atom_id });
function fixture() {
  const base = proteinStructure();
  const structure = { ...base,
    atoms: [1, 2, 3, 4].map(id => ({ ...base.atoms[0], id, residue_id: id < 3 ? 1 : id === 3 ? 2 : null, element: id === 4 ? "H" : "C" })),
    residues: base.residues.map(residue => ({ ...residue, component_type: "ligand" as const })),
    bonds: [{ id: 1, atom_1_id: 1, atom_2_id: 4, order: 1, aromatic: false, stereo: null, inferred: false }],
  };
  const entry: Entry = { ...molecularEntry("a", "Same", "ligand"), atom_ids: [1, 2, 3, 4] };
  const projection: StructureProjection = { entry_id: entry.id, artifact_id: entry.current_artifact_id!, structure,
    hierarchy: { schema_version: 1, warnings: [], components: [
      { id: "ligand-1", category: "ligand", display_label: "LIG", chain_ids: [1], residue_ids: [1], atom_ids: [4], classification_source: "fallback", classification_status: "assigned", warnings: [] },
      { id: "ligand-2", category: "ligand", display_label: "LIG", chain_ids: [1], residue_ids: [2], atom_ids: [], classification_source: "source", classification_status: "assigned", warnings: [] },
    ] }, viewer: { format: "mmcif", data: "original projection" } };
  return { entry, projection, projections: new Map([[entry.id, projection]]) };
}

describe("canonical interaction targets", () => {
  it("resolves residue membership and explicit extra H without guessing one ligand", () => {
    const { entry, projections } = fixture();
    const candidates = resolveInteractionLigands([entry], projections);
    expect(candidates).toHaveLength(2);
    expect(candidates.map(candidate => candidate.atoms)).toEqual([[ref(1), ref(2), ref(4)], [ref(3)]]);
    expect(candidates.every(candidate => candidate.eligible)).toBe(true);
    expect(new Set(candidates.map(candidate => candidate.label)).size).toBe(2);
    expect(new Set(candidates.map(candidate => candidate.key)).size).toBe(2);
    expect(captureLigandTarget(candidates[0])).toEqual({ kind: "ligand", entryId: "a", componentId: "ligand-1", atoms: [ref(1), ref(2), ref(4)] });
  });

  it("excludes ambiguous and nonligand categories independently of the entry type", () => {
    const { entry, projection, projections } = fixture();
    projection.hierarchy.components[0].classification_status = "ambiguous";
    projection.hierarchy.components[1].category = "other_heterogen";
    expect(resolveInteractionLigands([entry], projections)).toEqual([]);
  });

  it("explains connected nonpolymer instances while retaining polymer-linked component targets", () => {
    const { entry, projection, projections } = fixture();
    projection.structure.bonds.push({ ...projection.structure.bonds[0], id: 2, atom_1_id: 2, atom_2_id: 3 });
    const candidates = resolveInteractionLigands([entry], projections);
    expect(candidates.every(candidate => !candidate.eligible && candidate.reason?.includes("explicit selection"))).toBe(true);
    expect(captureLigandTarget(candidates[0])).toBeNull();
    projection.hierarchy.components[1].category = "protein";
    expect(resolveInteractionLigands([entry], projections)[0].eligible).toBe(true);
  });

  it("captures exact sorted IDs without retaining mutable selection objects", () => {
    const atoms = [ref(4), ref(1), ref(1)];
    const target = captureSelectionTarget(atoms);
    expect(target).toEqual({ kind: "selection", atoms: [ref(1), ref(4)] });
    atoms[1].atom_id = 99;
    expect(target).toEqual({ kind: "selection", atoms: [ref(1), ref(4)] });
    expect(captureSelectionTarget([])).toBeNull();
  });

  it("keeps hidden canonical selection IDs through unrelated additions and artifact changes", () => {
    const { entry } = fixture();
    entry.visible = false; entry.atom_ids.push(99); entry.current_artifact_id = "changed";
    const target = captureSelectionTarget([ref(1), ref(4)])!;
    expect(validateInteractionTarget(target, [entry], new Map())).toMatchObject({ status: "ready", hidden: true, atoms: [ref(1), ref(4)] });
    entry.atom_ids = entry.atom_ids.filter(id => id !== 4);
    expect(validateInteractionTarget(target, [entry], new Map()).status).toBe("needs-update");
    expect(validateInteractionTarget(target, [], new Map()).status).toBe("needs-update");
    expect(target).toEqual({ kind: "selection", atoms: [ref(1), ref(4)] });
  });

  it("validates all visible dynamically without capturing atoms", () => {
    expect(validateInteractionTarget({ kind: "all" }, [], new Map())).toEqual({ status: "ready", atoms: [], hidden: false, message: null });
    expect(validateInteractionTarget({ kind: "selection", atoms: [] }, [], new Map()).status).toBe("needs-update");
  });

  it.each(["missing", "stale", "seed", "wrong-entry"] as const)("waits for %s ligand projection without pruning capture", state => {
    const { entry, projection, projections } = fixture();
    const target = captureLigandTarget(resolveInteractionLigands([entry], projections)[0])!;
    if (state === "missing") projections.clear();
    if (state === "stale") projection.artifact_id = "old";
    if (state === "seed") projection.projection_state = "coordinate-seed";
    if (state === "wrong-entry") projection.entry_id = "b";
    expect(validateInteractionTarget(target, [entry], projections)).toMatchObject({ status: "validating", atoms: [ref(1), ref(2), ref(4)] });
    expect(resolveInteractionLigands([entry], projections)).toEqual([]);
  });

  it("retains ligand identity after coordinate-only changes and member reordering", () => {
    const { entry, projection, projections } = fixture();
    const target = captureLigandTarget(resolveInteractionLigands([entry], projections)[0])!;
    entry.current_artifact_id = projection.artifact_id = "new-coordinates";
    projection.structure.atoms.reverse();
    projection.structure.atoms.forEach(atom => { atom.coordinates = [100, 200, 300]; });
    entry.visible = false;
    expect(validateInteractionTarget(target, [entry], projections)).toMatchObject({ status: "ready", hidden: true });
  });

  it.each(["added", "added-orphan-H", "removed", "reclassified", "replaced", "crosslinked"] as const)("requires explicit update after ligand membership/instance %s", change => {
    const { entry, projection, projections } = fixture();
    const target = captureLigandTarget(resolveInteractionLigands([entry], projections)[0])!;
    if (change === "added") {
      projection.structure.atoms.push({ ...projection.structure.atoms[0], id: 5 }); entry.atom_ids.push(5);
    }
    if (change === "added-orphan-H") {
      projection.structure.atoms.push({ ...projection.structure.atoms[3], id: 5 }); entry.atom_ids.push(5);
      projection.hierarchy.components[0].atom_ids.push(5);
      projection.structure.bonds.push({ ...projection.structure.bonds[0], id: 2, atom_2_id: 5 });
    }
    if (change === "removed") {
      projection.structure.atoms = projection.structure.atoms.filter(atom => atom.id !== 4); entry.atom_ids = [1, 2, 3];
    }
    if (change === "reclassified") projection.hierarchy.components[0].classification_status = "ambiguous";
    if (change === "replaced") projection.hierarchy.components[0].id = "replacement";
    if (change === "crosslinked") projection.structure.bonds.push({ ...projection.structure.bonds[0], id: 2, atom_1_id: 2, atom_2_id: 3 });
    expect(validateInteractionTarget(target, [entry], projections).status).toBe("needs-update");
  });

  it("does not confuse duplicate entry labels or same atom IDs across entries", () => {
    const { entry, projection, projections } = fixture();
    const other = { ...entry, id: "b", current_artifact_id: "current-b" };
    projections.set("b", { ...projection, entry_id: "b", artifact_id: "current-b" });
    const candidates = resolveInteractionLigands([entry, other], projections);
    expect(new Set(candidates.map(candidate => candidate.label)).size).toBe(4);
    expect(candidates[2].atoms).toEqual([ref(1, "b"), ref(2, "b"), ref(4, "b")]);
  });
});

describe("whole-group target-to-rest filtering", () => {
  const record: InteractionRecord = { kind: "hydrogen_bond", scope: "intra", participants: [[ref(1), ref(2)], [ref(3), ref(4)]], endpoints: [[0, 0, 0], [3, 0, 0]], geometry: { distance: 3 } };
  it.each([
    [[], false], [[1], true], [[3], true], [[1, 3], false], [[2], true], [[4], true], [[1, 2, 3, 4], false],
  ] as [number[], boolean][])("applies XOR for selected atoms %j", (ids, expected) => {
    const before = JSON.stringify(record);
    const filtered = filterTargetInteractions([record], { kind: "selection", atoms: ids.map(id => ref(id)) });
    expect(filtered).toHaveLength(expected ? 1 : 0);
    if (expected) { expect(filtered[0]).toBe(record); expect(filtered[0].participants).toBe(record.participants); }
    expect(JSON.stringify(record)).toBe(before);
  });
  it("retains complete rings and distinguishes entries even when IDs coincide", () => {
    const ring = { ...record, kind: "pi_pi" as const, participants: [[1, 2, 3, 4, 5, 6].map(id => ref(id)), [1, 2, 3, 4, 5, 6].map(id => ref(id, "b"))] };
    expect(filterTargetInteractions([ring], { kind: "selection", atoms: [ref(2)] })[0].participants.map(group => group.length)).toEqual([6, 6]);
    expect(filterTargetInteractions([ring], { kind: "selection", atoms: [ref(2), ref(2, "b")] })).toEqual([]);
    expect(filterTargetInteractions([ring], { kind: "all" })[0]).toBe(ring);
  });
});
