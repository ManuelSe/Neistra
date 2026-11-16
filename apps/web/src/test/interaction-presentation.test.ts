import { describe, expect, it } from "vitest";
import type { AtomReference } from "../api/types";
import { createInteractionPresentationContext, describeInteractionParticipants, groupInteractionWarnings, interactionMetrics, interactionParticipants, interactionRecordKey } from "../interactions/presentation";
import type { InteractionRecord } from "../interactions/types";
import { molecularEntry, proteinProjection } from "./molecular-fixtures";

const ref = (atom_id: number, structure_id = "protein"): AtomReference => ({ structure_id, atom_id });
const record: InteractionRecord = { kind: "salt_bridge", scope: "inter", participants: [[ref(2), ref(1)], [ref(3)]], endpoints: [[0, 0, 0], [100, 0, 0]], geometry: { distance: 3.4, charge_1: -1, charge_2: 1 } };

describe("canonical interaction evidence presentation", () => {
  it("uses structural relationship keys independent of geometry and group ordering", () => {
    const key = interactionRecordKey(record);
    expect(interactionRecordKey({ ...record, endpoints: [[999, 0, 0], [0, 0, 0]], geometry: { distance: 4.1 }, participants: [[ref(3)], [ref(1), ref(2)]] })).toBe(key);
    expect(interactionRecordKey({ ...record, kind: "hydrogen_bond" })).not.toBe(key);
    expect(interactionRecordKey({ ...record, scope: "intra" })).not.toBe(key);
    expect(interactionRecordKey({ ...record, participants: [[ref(1)], [ref(2), ref(3)]] })).not.toBe(key);
    expect(interactionRecordKey({ ...record, participants: [[ref(1, "another")], [ref(3)]] })).not.toBe(key);
  });

  it("selects a canonical complete participant union without changing source records", () => {
    const before = JSON.stringify(record);
    const atoms = interactionParticipants({ ...record, participants: [[ref(3), ref(1)], [ref(2), ref(1)]] });
    expect(atoms).toEqual([ref(1), ref(2), ref(3)]);
    atoms[0].atom_id = 100;
    expect(JSON.stringify(record)).toBe(before);
  });

  it("names the salt nearest-site metric instead of measuring its drawn group-center line", () => {
    expect(interactionMetrics(record)).toEqual([
      { label: "Nearest charge-site distance", value: 3.4, unit: "Å" },
      { label: "Group 1 formal charge", value: -1, unit: "e" },
      { label: "Group 2 formal charge", value: 1, unit: "e" },
    ]);
  });

  it("distinguishes H···A from D···A distance and angular evidence", () => {
    expect(interactionMetrics({ ...record, kind: "hydrogen_bond", geometry: { distance: 1.8, donor_acceptor_distance: 2.8, donor_angle: 175, acceptor_angle: 96 } })).toEqual([
      { label: "H···A distance", value: 1.8, unit: "Å" }, { label: "D···A distance", value: 2.8, unit: "Å" },
      { label: "Donor angle", value: 175, unit: "°" }, { label: "Acceptor angle", value: 96, unit: "°" },
    ]);
  });

  it.each([
    ["pi_pi", { distance: 5, plane_angle: 90, offset_1: 0, offset_2: 1 }, ["Centroid distance", "Plane angle", "Ring 1 offset", "Ring 2 offset"]],
    ["cation_pi", { distance: 5, normal_angle: 10, offset: 1, charge: 1 }, ["Charge-center–ring-center distance", "Normal angle", "Lateral offset", "Group formal charge"]],
    ["clash", { distance: 2.7, overlap: 0.7 }, ["Atom separation", "van der Waals overlap"]],
    ["hydrophobic", { distance: 3.5 }, ["Atom separation"]],
  ] as [InteractionRecord["kind"], Record<string, number>, string[]][])("presents named %s metrics", (kind, geometry, expected) => {
    expect(interactionMetrics({ ...record, kind, geometry }).map(metric => metric.label)).toEqual(expected);
  });

  it("omits unavailable or nonfinite evidence rather than inventing a number", () => {
    expect(interactionMetrics({ ...record, kind: "clash", geometry: { distance: Number.NaN, unrelated: 12 } })).toEqual([]);
  });

  it("groups warnings by entry, code and exact message while preserving known identities", () => {
    const warning = { entry_id: "protein", code: "missing", message: "Prepare explicit H.", atom_ids: [3, 1] };
    const warnings = [warning, { ...warning, atom_ids: [2, 3] }, { ...warning, message: "Different reason.", atom_ids: [] }, { ...warning, entry_id: "another" }];
    const before = JSON.stringify(warnings);
    const groups = groupInteractionWarnings(warnings);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ entryId: "protein", code: "missing", message: "Prepare explicit H.", atomIds: [1, 2, 3], occurrences: 2 });
    expect(groups[1].atomIds).toEqual([]);
    expect(JSON.stringify(warnings)).toBe(before);
  });

  it("indexes canonical atom/residue/chain labels once and distinguishes duplicated entry names", () => {
    const source = proteinProjection();
    const atoms = source.structure.atoms;
    let reads = 0;
    Object.defineProperty(source.structure, "atoms", { get: () => { reads++; return atoms; } });
    const entries = [molecularEntry("protein", "Same", "protein"), molecularEntry("other", "Same", "protein")];
    const sources = new Map([["protein", source], ["other", { ...source, entry_id: "other", artifact_id: "current-other" }]]);
    const context = createInteractionPresentationContext(entries, sources);
    const initial = reads;
    for (let i = 0; i < 100; i++) {
      expect(context.describe(record)[0]).toContain("Same (protein) · GLY 10 · chain A · CA #1");
      expect(context.summarize(record)).toBe("Same (protein) · GLY 10 · chain A ↔ Same (protein) · ALA 11 · chain A");
    }
    expect(reads).toBe(initial);
    expect(context.describe({ ...record, participants: [[ref(1, "other")]] })[0]).toContain("Same (other)");
    expect(describeInteractionParticipants(record, entries, sources)).toEqual(context.describe(record));
  });

  it("uses explicit identity fallbacks instead of labels from stale or missing projections", () => {
    const source = proteinProjection(); source.artifact_id = "stale";
    const context = createInteractionPresentationContext([molecularEntry("protein", "Receptor", "protein")], new Map([["protein", source]]));
    expect(context.describe(record)).toEqual(["Receptor · Atom #2; Receptor · Atom #1", "Receptor · Atom #3"]);
    expect(context.describe({ ...record, participants: [[ref(99, "deleted")]] })).toEqual(["deleted · Atom #99"]);
    expect(context.summarize(record)).toBe("Receptor · Atom #2 + Receptor · Atom #1 ↔ Receptor · Atom #3");
  });

  it("summarizes complete multiatom rings by canonical sites without repeating every atom", () => {
    const source = proteinProjection();
    source.structure.atoms = Array.from({ length: 12 }, (_, index) => ({
      ...source.structure.atoms[0], id: index + 1, name: `C${index + 1}`, residue_id: index < 6 ? 1 : 2,
    }));
    const ring = { ...record, kind: "pi_pi" as const, participants: [
      [1, 2, 3, 4, 5, 6].map(id => ref(id)), [7, 8, 9, 10, 11, 12].map(id => ref(id)),
    ] };
    const context = createInteractionPresentationContext([molecularEntry("protein", "Receptor", "protein")], new Map([["protein", source]]));
    expect(context.summarize(ring)).toBe("Receptor · GLY 10 · chain A ↔ Receptor · ALA 11 · chain A");
    expect(context.describe(ring)[0]).toContain("C1 #1");
    expect(context.describe(ring)[0]).toContain("C6 #6");
    expect(context.describe(ring)[1]).toContain("C12 #12");
  });

  it("retains actual atom identity for no-residue contacts and counts only other distinct known participants", () => {
    const source = proteinProjection();
    source.structure.atoms = source.structure.atoms.map((atom, index) => ({ ...atom, residue_id: null, name: `C${index + 1}` }));
    const context = createInteractionPresentationContext([molecularEntry("protein", "Ligand", "ligand")], new Map([["protein", source]]));
    expect(context.summarize(record)).toBe("Ligand · C2 #2 +1 other ↔ Ligand · C3 #3");
    expect(context.summarize({ ...record, participants: [[ref(1)], [ref(3)]] })).toBe("Ligand · C1 #1 ↔ Ligand · C3 #3");
    expect(context.summarize({ ...record, participants: [[ref(2), ref(2), ref(1), ref(99)], [ref(3)]] }))
      .toBe("Ligand · C2 #2 +1 other + Ligand · Atom #99 ↔ Ligand · C3 #3");
  });

  it("does not merge duplicate entry names or parse punctuation in names as site boundaries", () => {
    const source = proteinProjection();
    source.structure.residues[0].name = "LIG; special";
    const entries = [molecularEntry("protein", "Same; name", "protein"), molecularEntry("other", "Same; name", "protein")];
    const sources = new Map([["protein", source], ["other", { ...source, entry_id: "other", artifact_id: "current-other" }]]);
    const context = createInteractionPresentationContext(entries, sources);
    expect(context.summarize({ ...record, participants: [[ref(1), ref(2)], [ref(1, "other"), ref(2, "other")]] }))
      .toBe("Same; name (protein) · LIG; special 10 · chain A ↔ Same; name (other) · LIG; special 10 · chain A");
  });
});
