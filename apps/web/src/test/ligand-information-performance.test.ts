import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import metadata from "../../../../tests/fixtures/profiles/registry.json";
import manifest from "../../../../tests/fixtures/ligand-properties-performance/editable/manifest.json";
import { closedIntervalProof, comparisonMatches, comparisonOracle, elapsedFrom, passiveTraffic, positiveHeaderOracle, trafficCounts,
  type ClosedIntervalEvent, type ComparisonOracle, type FixtureFacts, type PrimarySnapshot, type PrimaryTrigger, type TrafficRecord } from "../../../../tests/e2e/support/ligand-information-performance";
import type { DescriptorReport } from "../ligandProperties/types";
import type { NormalizedStructure } from "../api/types";
import { parseProfileRegistry } from "../ligandProfiles/validate";

const registry = parseProfileRegistry(metadata);
function report(values: Record<string, number> = {}): DescriptorReport {
  const numbers = { hbd: 0, hba: 20, molecular_weight: 1000, calculated_logp: -2, tpsa: 0, rotatable_bond_count: 0, formal_charge: 0, ...values };
  return { schema_version: 1, ...registry.descriptor_method, input_hash: "a".repeat(64), created_at: "2026-11-20T00:00:00Z",
    model_status: "qualified", model_reason: null, provenance: [], contains_formally_charged_atoms: false,
    coverage: Object.keys(numbers), values: Object.entries(numbers).map(([descriptor_id, value]) => ({ descriptor_id, status: "ready", value, reason: null })) };
}
function snapshot(expected: ComparisonOracle): PrimarySnapshot {
  return { at: 20, entry: "entry", instance: "instance", formula: "C10H22", charge: "0", image: null,
    profile: expected.profileId, primaryVisible: true, headerVisible: true, imageVisible: false, svgVisible: true, tableVisible: true,
    spokes: expected.rows.length, points: expected.rows.map(r => ({ x: r.x, y: r.y, clipped: r.clipped })),
    polygons: [expected.rows.map(r => `${r.x},${r.y}`).join(" ")], legend: expected.rows.map(r => r.name),
    rows: expected.rows.map(r => ({ descriptor: r.descriptor, spans: r.spans })), criteria: expected.constraints };
}
function structure(counts: Record<string, number>): NormalizedStructure {
  const elements = Object.entries(counts).flatMap(([element, count]) => Array.from({ length: count }, () => element));
  return { schema_version: 1, title: "Header count control", structure_type: "ligand", chains: [], residues: [], bonds: [], conformers: [], warnings: [],
    atoms: elements.map((element, i) => ({ id: i + 1, name: `${element}${i + 1}`, element, coordinates: [0, 0, 0], residue_id: null,
      formal_charge: 0, source_index: i, alternate_location: null, occupancy: null, b_factor: null, inferred_fields: [] })) };
}
const automatic = { policy: "automatic", status: "complete", skipped_count: 0, unprocessed_count: 0 };
const formulaControls = [
  { id: "paired-chromium-10", before: { C: 10, H: 22 }, after: { C: 9, H: 21, N: 1 }, formulas: ["C10H22", "C9H21N"] },
  { id: "paired-chromium-86", before: { C: 86, H: 174 }, after: { C: 85, H: 173, N: 1 }, formulas: ["C86H174", "C85H173N"] },
  { id: "paired-mobile-chromium-10", before: { C: 9, H: 20, O: 1 }, after: { C: 8, H: 19, N: 1, O: 1 }, formulas: ["C9H20O", "C8H19NO"] },
  { id: "paired-mobile-chromium-86", before: { C: 85, H: 172, O: 1 }, after: { C: 84, H: 171, N: 1, O: 1 }, formulas: ["C85H172O", "C84H171NO"] },
];
const factsFor = (id: string) => structuredClone(manifest.fixtures.find(f => f.id === id)!.chemistry_facts) as FixtureFacts;

describe("independent primary-sidebar measurement controls", () => {
  it("orders unique required axes from registry order and uses literal cardinal geometry, including genuine zero", () => {
    const result = comparisonOracle(registry, "ro5", report());
    expect(result.rows.map(r => r.descriptor)).toEqual(["hbd", "hba", "molecular_weight", "calculated_logp"]);
    expect(result.rows.map(r => [r.x, r.y])).toEqual([[120, 120], [198, 120], [120, 198], [120, 120]]);
    expect(result.rows.every(r => r.clipped === null)).toBe(true);
    expect(result.rows[2].spans).toContain("≤ 500 g/mol · Not met");
  });
  it("preserves unrounded operators and marks clipping without replacing actual values", () => {
    const boundary = comparisonOracle(registry, "ro5", report({ molecular_weight: 500.00000000000006 }));
    expect(boundary.rows[2].spans).toContain("500.00000000000006 g/mol");
    expect(boundary.rows[2].spans).toContain("≤ 500 g/mol · Not met");
    const clipped = comparisonOracle(registry, "ro5", report({ molecular_weight: 1000.01, calculated_logp: -2.01 }));
    expect(clipped.rows[2]).toMatchObject({ x: 120, y: 198, clipped: "high" });
    expect(clipped.rows[3]).toMatchObject({ x: 120, y: 120, clipped: "low" });
    expect(clipped.rows[2].spans).toContain("1000.01 g/mol");
    expect(clipped.rows[3].spans).toContain("Outside display scale (below); actual value retained");
  });
  it("requires six composite axes and preserves failing large-fixture criteria", () => {
    const result = comparisonOracle(registry, "ro5-veber", report({ molecular_weight: 1215, calculated_logp: 30, rotatable_bond_count: 83 }));
    expect(result.rows).toHaveLength(6); expect(result.constraints).toBe(6);
    expect(result.rows.flatMap(r => r.spans).filter(s => s.endsWith("Not met"))).toHaveLength(4);
  });
  it.each(["missing", "unavailable", "method", "charged", "unknown-charge", "fractional-count"])("rejects %s data instead of manufacturing a positive comparison", control => {
    const data = report();
    if (control === "missing") data.values.find(v => v.descriptor_id === "hbd")!.value = null;
    if (control === "unavailable") { data.model_status = "unavailable"; data.model_reason = "hydrogen_semantics_unavailable"; }
    if (control === "method") data.policy_version += "different";
    if (control === "charged") data.contains_formally_charged_atoms = true;
    if (control === "unknown-charge") data.contains_formally_charged_atoms = null;
    if (control === "fractional-count") data.values.find(v => v.descriptor_id === "hbd")!.value = 0.5;
    expect(() => comparisonOracle(registry, "ro5", data)).toThrow();
  });
  it.each(["row", "point", "clipping", "polygon", "legend", "constraint-count"])("refuses an incorrect observed %s even with current-looking row text", control => {
    const expected = comparisonOracle(registry, "ro5", report()), actual = snapshot(expected);
    expect(comparisonMatches(actual, expected)).toBe(true);
    if (control === "row") actual.rows.pop();
    if (control === "point") actual.points[0].x += 0.01;
    if (control === "clipping") actual.points[0].clipped = "high";
    if (control === "polygon") actual.polygons[0] = "0,0 0,0 0,0 0,0";
    if (control === "legend") actual.legend.reverse();
    if (control === "constraint-count") actual.criteria++;
    expect(comparisonMatches(actual, expected)).toBe(false);
  });
  for (const specimen of formulaControls) for (const phase of ["before", "after"] as const) {
    it(`crosschecks explicit analytical ${specimen.id} ${phase} formula against frozen ordinary chemistry facts`, () => {
      const counts = specimen[phase] as Record<string, number>;
      expect(positiveHeaderOracle(specimen.id, phase, structure(counts), report(), factsFor(specimen.id), automatic))
        .toMatchObject({ formula: specimen.formulas[phase === "before" ? 0 : 1], charge: "0" });
    });
  }
  it.each(["wrong-H", "unknown-atomic-charge", "charged-atom", "isotope", "radical", "preserve", "partial", "unavailable", "other-fixture"])("refuses %s header evidence, independently of a formal-charge-zero property", control => {
    const model = structure({ C: 10, H: 22 }), data = report(), facts = factsFor("paired-chromium-10"), reconciliation = { ...automatic };
    if (control === "wrong-H") model.atoms.pop();
    if (control === "unknown-atomic-charge") model.atoms[0].formal_charge = null;
    if (control === "charged-atom") model.atoms[0].formal_charge = 1;
    if (control === "isotope") facts.atoms[0][2] = 13;
    if (control === "radical") facts.atoms[0][3] = 1;
    if (control === "preserve") reconciliation.policy = "preserve";
    if (control === "partial") reconciliation.unprocessed_count = 1;
    if (control === "unavailable") data.model_status = "unavailable";
    expect(() => positiveHeaderOracle(control === "other-fixture" ? "unknown" : "paired-chromium-10", "before", model, data, facts, reconciliation)).toThrow();
  });
  it("accepts only the approved absolute float tolerance and exact integer table values", () => {
    const expected = comparisonOracle(registry, "ro5", report({ molecular_weight: 600 })), actual = snapshot(expected);
    actual.rows[2].spans[0] = "600.00000000005 g/mol"; expect(comparisonMatches(actual, expected)).toBe(true);
    actual.rows[2].spans[0] = "600.0000000002 g/mol"; expect(comparisonMatches(actual, expected)).toBe(false);
    actual.rows[2].spans[0] = "600 g/mol"; actual.rows[0].spans[0] = "0.00000000001";
    expect(comparisonMatches(actual, expected)).toBe(false);
  });
  it("never uses numerical tolerance to conceal a changed exact threshold decision", () => {
    const expected = comparisonOracle(registry, "ro5", report({ molecular_weight: 500 })), actual = snapshot(expected);
    actual.rows[2].spans[0] = "500.00000000005 g/mol";
    expect(comparisonMatches(actual, expected)).toBe(false);
  });
  it("captures actual image bytes and hashes passively without routing or issuing a preflight request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "neistra161-primary-observer-"));
    const callbacks: Record<string, (value: unknown) => void> = {}, route = vi.fn();
    const page = { on: (event: string, callback: (value: unknown) => void) => { callbacks[event] = callback; }, route } as unknown as Page;
    const body = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");
    const url = "http://localhost/api/v1/artifacts/controlled/download";
    const request = { url: () => url, method: () => "GET", resourceType: () => "image", postDataJSON: () => null };
    try {
      const traffic = passiveTraffic(page, directory);
      callbacks.request(request); callbacks.response({ request: () => request, status: () => 200, headers: () => ({ "content-type": "image/svg+xml" }), body: () => Promise.resolve(body) });
      await traffic.settle(); expect(route).not.toHaveBeenCalled();
      const [image] = traffic.records, sha256 = createHash("sha256").update(body).digest("hex");
      expect(image).toMatchObject({ kind: "image", status: 200, url, bytes: body.length, sha256, companion: `image-${sha256}.body` });
      expect(await readFile(join(directory, image.companion!))).toEqual(body);
      await traffic.save("network.json"); expect(JSON.parse(await readFile(join(directory, "network.json"), "utf8"))).toHaveLength(1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("keeps unobserved timings null and rejects untrusted or pre-trigger observations", () => {
    const initial = snapshot(comparisonOracle(registry, "ro5", report()));
    const trigger: PrimaryTrigger = { label: "reopen", at: 10, trusted: true, event: "click", initial };
    expect(elapsedFrom(trigger, undefined)).toBeNull(); expect(elapsedFrom(trigger, { ...initial, at: 25 })).toBe(15);
    expect(() => elapsedFrom({ ...trigger, trusted: false }, initial)).toThrow(/Trusted/);
    expect(() => elapsedFrom(trigger, { ...initial, at: 9 })).toThrow(/precedes/);
  });
  it("counts legitimate project/inventory and image requests separately from drawing generation and descriptor work", () => {
    const records: TrafficRecord[] = ["project", "inventory", "image", "depiction"].map(kind => ({ kind: kind as TrafficRecord["kind"],
      method: "GET", path: "/controlled", url: "http://localhost/controlled", at_utc_ms: 1, body: null }));
    expect(trafficCounts(records)).toEqual({ project: 1, inventory: 1, images: 1, depiction: 1, propertyReads: 0, allocations: 0, demands: 0, releases: 0 });
  });
  const closedEvents = (): ClosedIntervalEvent[] => [
    { sequence: 1, at: 10, kind: "start", label: "hidden", primaryVisible: true },
    { sequence: 2, at: 10, kind: "absent", label: "hidden", primaryVisible: false },
    { sequence: 3, at: 10, kind: "reopen", label: "hidden", primaryVisible: false, trusted: true, triggerLabel: "open", event: "click" },
  ];
  const proveClosed = (intervalEvents: ClosedIntervalEvent[]) => closedIntervalProof({ timeOrigin: 1000, intervalEvents }, "hidden", "open");
  it("rejects a drawing initiated during the reopening await gap", async () => {
    const events = closedEvents(), reopening = events.pop()!, records: TrafficRecord[] = [];
    const sampledBeforeReopen = trafficCounts(records).depiction;
    await Promise.resolve(); // Visibility/arming await before the trusted reopening click.
    records.push({ kind: "depiction", method: "GET", path: "/depiction", url: "http://localhost/depiction", at_utc_ms: 1, body: null });
    events.push({ sequence: 3, at: 10, kind: "depiction", label: "hidden", url: "http://localhost/depiction" });
    await Promise.resolve(); events.push({ ...reopening, sequence: 4 });
    expect(sampledBeforeReopen).toBe(0); // The previous Node snapshot admitted this race.
    expect(() => proveClosed(events)).toThrow(/Drawing initiated before trusted reopening/);
  });
  it("includes close-helper awaits and allows post-trigger drawings even at the same clock value", () => {
    const duringClose = closedEvents(); duringClose.splice(1, 0, { sequence: 2, at: 10, kind: "depiction", label: "hidden" });
    duringClose.forEach((event, index) => { event.sequence = index + 1; });
    expect(() => proveClosed(duringClose)).toThrow(/Drawing initiated before trusted reopening/);
    const afterReopen = closedEvents(); afterReopen.push({ sequence: 4, at: 10, kind: "depiction", label: null });
    expect(proveClosed(afterReopen)).toMatchObject({ depiction_initiations: [], reopen: { sequence: 3 } });
  });
  it.each(["missing-start", "missing-absence", "missing-reopen", "duplicate", "wrong-label", "untrusted", "visible-reopen", "wrong-event", "unordered", "backward-clock", "missing-clock"])("refuses %s closed-interval evidence", control => {
    const events = closedEvents();
    if (control === "missing-start") events[0].kind = "depiction";
    if (control === "missing-absence") events[1].kind = "depiction";
    if (control === "missing-reopen") events[2].kind = "depiction";
    if (control === "duplicate") events.push({ ...events[2], sequence: 4 });
    if (control === "wrong-label") events[2].triggerLabel = "other";
    if (control === "untrusted") events[2].trusted = false;
    if (control === "visible-reopen") events[2].primaryVisible = true;
    if (control === "wrong-event") events[2].event = "change";
    if (control === "unordered") events[2].sequence = 2;
    if (control === "backward-clock") events[2].at = 9;
    expect(() => closedIntervalProof({ timeOrigin: control === "missing-clock" ? NaN : 1000, intervalEvents: events }, "hidden", "open")).toThrow();
  });

});
