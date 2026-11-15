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
    for (let i = 0; i < 100; i++) expect(context.describe(record)[0]).toContain("Same (protein) · GLY 10 · chain A · CA #1");
    expect(reads).toBe(initial);
    expect(context.describe({ ...record, participants: [[ref(1, "other")]] })[0]).toContain("Same (other)");
    expect(describeInteractionParticipants(record, entries, sources)).toEqual(context.describe(record));
  });

  it("uses explicit identity fallbacks instead of labels from stale or missing projections", () => {
    const source = proteinProjection(); source.artifact_id = "stale";
    const context = createInteractionPresentationContext([molecularEntry("protein", "Receptor", "protein")], new Map([["protein", source]]));
    expect(context.describe(record)).toEqual(["Receptor · Atom #2; Receptor · Atom #1", "Receptor · Atom #3"]);
    expect(context.describe({ ...record, participants: [[ref(99, "deleted")]] })).toEqual(["deleted · Atom #99"]);
  });
});
