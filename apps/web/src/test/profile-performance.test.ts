import { describe, expect, it, vi } from "vitest";
import metadata from "../../../../tests/fixtures/profiles/registry.json";
import { assertReport, cacheBasis, classifyFirstSelection, coldRequirement, distribution, durations, expectedCriteria, installObservation, matchingReady, requestCounts,
  sameSource, type FetchRecord, type Sample } from "../../../../tests/e2e/support/profile-performance";
import { parseProfileRegistry } from "../ligandProfiles/validate";
import type { DescriptorReport, PropertyAggregate } from "../ligandProperties/types";

const registry = parseProfileRegistry(metadata);
const source = { entry_id: "entry", source_artifact_id: "artifact", instance_id: "instance", atom_ids: [1, 3] };
function report(): DescriptorReport {
  return { schema_version: 1, ...registry.descriptor_method, input_hash: "a".repeat(64), created_at: "2026-11-20T00:00:00Z",
    model_status: "qualified", model_reason: null, provenance: [], contains_formally_charged_atoms: false,
    coverage: ["molecular_weight", "hbd", "hba", "calculated_logp"], values: [
      { descriptor_id: "molecular_weight", status: "ready", value: 500.00000000000006, reason: null },
      { descriptor_id: "hbd", status: "ready", value: 1, reason: null },
      { descriptor_id: "hba", status: "ready", value: 2, reason: null },
      { descriptor_id: "calculated_logp", status: "ready", value: 3.1, reason: null },
    ] };
}
function aggregate(): PropertyAggregate {
  return { project_id: "project", entries: [{ source, binding_key: "binding", status: "ready", reason: null, progress: 100, report: report() }] };
}
const ids = ["molecular_weight", "hbd", "hba", "calculated_logp"];

describe("profile performance evidence qualification", () => {
  it("reports observed spread, nearest-rank p95 and actual misses without averaging away outliers", () => {
    expect(distribution([2001, 90, 100, 110, 120], 2000)).toEqual({ n: 5, median: 110, p95_nearest_rank: 2001, max: 2001, target: 2000, misses: 1 });
    expect(distribution(Array.from({ length: 20 }, (_, i) => (i + 1) * 10), 100))
      .toEqual({ n: 20, median: 105, p95_nearest_rank: 190, max: 200, target: 100, misses: 10 });
    for (const values of [[], [NaN], [Infinity], [-1]]) expect(() => distribution(values, 100)).toThrow();
  });
  it("classifies matching numerical coverage independently from browser-context freshness", () => {
    const body = aggregate(); expect(cacheBasis(body, source, ids).numerical_cache).toBe("matching-ready");
    body.entries[0].report!.values[1].status = "unavailable";
    expect(cacheBasis(body, source, ids)).toMatchObject({ numerical_cache: "partial-required-coverage", missing_descriptor_ids: ["hbd"] });
    body.entries[0].report = null; body.entries[0].status = "pending";
    expect(cacheBasis(body, source, ids).missing_descriptor_ids).toEqual(ids);
  });
  it("keeps ready and partial first selections out of numerical-cold samples in combined suites", () => {
    const body = aggregate();
    expect(classifyFirstSelection(cacheBasis(body, source, ids), false)).toBe("shared-cache-ready");
    body.entries[0].report!.values[1].status = "unavailable";
    expect(classifyFirstSelection(cacheBasis(body, source, ids), false)).toBe("shared-cache-partial");
    body.entries[0].report = null; body.entries[0].status = "pending";
    expect(classifyFirstSelection(cacheBasis(body, source, ids), false)).toBe("numerical-cold-missing");
  });
  it("requires a positive cold-store opt-in and refuses ready or partial focused specimens", () => {
    expect(coldRequirement(undefined)).toBe(false); expect(coldRequirement("0")).toBe(false); expect(coldRequirement("1")).toBe(true);
    for (const invalid of ["true", "", "2"]) expect(() => coldRequirement(invalid)).toThrow();
    const body = aggregate(); expect(() => classifyFirstSelection(cacheBasis(body, source, ids), true)).toThrow(/Focused cold/);
    body.entries[0].report!.values[1].status = "unavailable";
    expect(() => classifyFirstSelection(cacheBasis(body, source, ids), true)).toThrow(/Focused cold/);
    body.entries[0].report = null; body.entries[0].status = "pending";
    expect(classifyFirstSelection(cacheBasis(body, source, ids), true)).toBe("numerical-cold-missing");
  });
  it("refuses stale source membership and multi-entry baseline ambiguity", () => {
    expect(sameSource(source, { ...source, atom_ids: [3, 1] })).toBe(false);
    expect(() => cacheBasis(aggregate(), { ...source, source_artifact_id: "old" }, ids)).toThrow(/exact source/);
    const body = aggregate(); body.entries.push(body.entries[0]); expect(() => cacheBasis(body, source, ids)).toThrow();
  });
  it("checks exact unrounded boundary outcomes separately from the production evaluator", () => {
    const rows = expectedCriteria(registry, "ro5", report());
    expect(rows[0]).toMatchObject({ value: "Value: 500.00000000000006 g/mol", criterion: "Criterion: ≤ 500 g/mol", outcome: "Not met" });
    expect(rows.slice(1).map(row => row.outcome)).toEqual(["Met", "Met", "Met"]);
  });
  it("refuses method mismatch and missing criteria instead of displaying a fabricated zero", () => {
    const changed = report(); changed.policy_version += "changed";
    expect(() => expectedCriteria(registry, "ro5", changed)).toThrow(/method/);
    changed.policy_version = registry.descriptor_method.policy_version; changed.values[0].value = null;
    expect(() => expectedCriteria(registry, "ro5", changed)).toThrow(/missing or failed/);
  });
  it("qualifies source-bound vectors with exact integer agreement and the approved float tolerance", () => {
    const expected = report(), actual = report(); actual.values[0].value! += 5e-11;
    expect(() => assertReport(actual, expected, ids)).not.toThrow();
    expected.values[0].value = 500; actual.values[0].value = 500 + 5e-11;
    expect(() => assertReport(actual, expected, ids)).not.toThrow();
    actual.values[1].value! += 1e-12; expect(() => assertReport(actual, expected, ids)).toThrow(/hbd/);
    actual.values[1].value = 1; actual.input_hash = "b".repeat(64);
    expect(() => assertReport(actual, expected, ids)).toThrow(/input hash/);
  });
  it("keeps the immutable-original context hash distinct from the no-recovery numerical oracle", () => {
    const independent = report(), contextual = report(), actual = report();
    independent.provenance = ["current_explicit_graph"];
    contextual.input_hash = actual.input_hash = "b".repeat(64);
    contextual.provenance = actual.provenance = ["exact_immutable_source_match"];
    expect(() => assertReport(actual, independent, ids, contextual)).not.toThrow();
    expect(() => assertReport(actual, independent, ids)).toThrow(/input hash/);
    actual.input_hash = independent.input_hash;
    expect(() => assertReport(actual, independent, ids, contextual)).toThrow(/input hash/);
    actual.input_hash = contextual.input_hash; actual.provenance = independent.provenance;
    expect(() => assertReport(actual, independent, ids, contextual)).toThrow(/provenance/);
  });
  it("refuses changed numerical, method and charge facts even when context hashes match", () => {
    const independent = report(), contextual = report(), actual = report();
    contextual.input_hash = actual.input_hash = "b".repeat(64);
    actual.values[0].value! += 2e-10;
    expect(() => assertReport(actual, independent, ids, contextual)).toThrow(/molecular_weight/);
    actual.values[0].value = independent.values[0].value;
    contextual.policy_version += "changed";
    expect(() => assertReport(actual, independent, ids, contextual)).toThrow(/policy_version/);
    contextual.policy_version = actual.policy_version;
    actual.contains_formally_charged_atoms = true;
    expect(() => assertReport(actual, independent, ids, contextual)).toThrow(/charge-presence/);
  });
  it("keeps hidden/missing timing null and a signed retirement relative to ACK", () => {
    const sample: Sample = { label: "edit", event: "click", armedAt: 9, startedAt: 10, eventTrusted: true,
      targetProfile: "ro5", expectedRows: [], oldRows: [], currentAt: 40, retirementUnavailable: "Hidden at trigger" };
    expect(durations(sample, 25)).toMatchObject({ feedback_ms: null, current_criteria_ms: 30, retirement_ms: null,
      retirement_relative_to_ack_ms: null, retirement_unavailable_reason: "Hidden at trigger", visible_current_criteria_ms: null });
    sample.retiredAt = 20; expect(durations(sample, 25).retirement_relative_to_ack_ms).toBe(-5);
    sample.currentAt = 8; expect(() => durations(sample)).toThrow(/precedes/);
    sample.currentAt = 40; sample.eventTrusted = false; expect(() => durations(sample)).toThrow(/trusted/);
  });
  it("requires visible feedback and records its actual status, native-value or command basis", async () => {
    const originalFetch = window.fetch, originalBody = document.body.innerHTML;
    const listeners = vi.spyOn(document, "addEventListener");
    window.fetch = vi.fn().mockResolvedValue(new Response("{}"));
    const page = { addInitScript: (callback: () => void) => { callback(); return Promise.resolve(); } } as unknown as Parameters<typeof installObservation>[0];
    document.body.innerHTML = '<div class="ligand-profile" aria-hidden="true"><select><option value="ro5">Ro5</option></select><div role="status">Updating profile</div></div><button disabled>Command</button>';
    for (const node of document.querySelectorAll("select, [role=status], button")) {
      vi.spyOn(node, "getBoundingClientRect").mockReturnValue({ x: 10, y: 10, left: 10, right: 110, top: 10, bottom: 30, width: 100, height: 20, toJSON: () => ({}) });
    }
    await installObservation(page);
    const state = window.profilePerformance, root = document.querySelector(".ligand-profile")!;
    const sample = (event: "change" | "click", trusted = true): Sample => ({ label: "feedback", event, eventTrusted: trusted,
      armedAt: 0, startedAt: 0, targetProfile: "ro5", expectedRows: [], oldRows: [] });
    let observation = 0;
    const tick = async () => { root.setAttribute("data-observation", String(++observation)); await new Promise(done => setTimeout(done, 0)); };
    try {
      state.sample = sample("click"); await tick(); expect(state.sample.feedbackAt).toBeUndefined();
      root.removeAttribute("aria-hidden"); await tick(); expect(state.sample.feedbackBasis).toBe("visible-status");
      (root.querySelector('[role="status"]') as HTMLElement).style.visibility = "hidden";
      state.sample = sample("change"); await tick(); expect(state.sample.feedbackBasis).toBe("native-selected-value");
      root.setAttribute("aria-hidden", "true"); state.control = document.querySelector("button")!;
      state.sample = sample("click"); await tick(); expect(state.sample.feedbackBasis).toBe("disabled-command");
      state.sample = sample("click", false); await tick(); expect(state.sample.feedbackAt).toBeUndefined();
    } finally {
      state.observer.disconnect();
      for (const [kind, listener, options] of listeners.mock.calls) {
        if (kind === "change") document.removeEventListener(kind, listener, options);
      }
      listeners.mockRestore(); window.fetch = originalFetch; document.body.innerHTML = originalBody;
    }
  });
  it("requires a successful observed automatic response with exact source and independent vector", () => {
    const request: FetchRecord = { at: 10, timeOrigin: 1000, method: "POST", path: "/api/v1/projects/project/ligand-properties/read",
      body: {}, status: 200, responseAt: 20, observedAt: 21, response: aggregate() };
    expect(matchingReady([request], source, report(), ids)).toMatchObject({ input_hash: "a".repeat(64), binding_key: "binding", observed_at: 21 });
    expect(matchingReady([request], { ...source, instance_id: "other" }, report(), ids)).toBeNull();
    delete request.observedAt; expect(matchingReady([request], source, report(), ids)).toBeNull();
  });
  it("counts metadata, consumer allocation and demand separately from read-only requests", () => {
    const request = (method: string, path: string): FetchRecord => ({ at: 1, timeOrigin: 1, body: null, method, path });
    const base = "/api/v1/projects/project/ligand-properties";
    expect(requestCounts([request("GET", "/api/v1/ligand-profiles/registry"), request("POST", base + "/consumers"),
      request("PUT", base + "/consumers/id"), request("POST", base + "/read"), request("DELETE", base + "/consumers/id")]))
      .toEqual({ requests: 5, metadata: 1, allocations: 1, demands: 1, reads: 1, releases: 1 });
  });
});
