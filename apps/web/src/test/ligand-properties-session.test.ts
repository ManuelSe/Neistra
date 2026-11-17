import { afterEach, describe, expect, it, vi } from "vitest";
import { LigandPropertySession } from "../ligandProperties/session";
import { ApiError } from "../api/client";
import type { LigandPropertyApi, PropertyAggregate } from "../ligandProperties/types";
import { deferredProperty, fullCoverageTarget, pendingPropertySubset, propertyAllocation, propertyPreferences, propertyRegistry, propertyResult, propertyTarget } from "./ligand-properties-fixtures";

const sessions: LigandPropertySession[] = [];
afterEach(() => { sessions.splice(0).forEach(session => session.deactivate()); vi.useRealTimers(); });
function setup(owns = () => true) {
  const api: LigandPropertyApi = { registry: vi.fn().mockResolvedValue(propertyRegistry), preferences: vi.fn().mockResolvedValue(propertyPreferences),
    savePreferences: vi.fn().mockResolvedValue(propertyPreferences), allocate: vi.fn().mockResolvedValue(propertyAllocation()), read: vi.fn().mockResolvedValue(propertyResult()),
    demand: vi.fn().mockResolvedValue(propertyResult(propertyTarget(), "pending")), release: vi.fn().mockResolvedValue({}) };
  const session = new LigandPropertySession(() => owns, api); sessions.push(session);
  return { session, api };
}
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

describe("current property binding session", () => {
  it("withholds incompatible numbers immediately and ignores a held earlier source", async () => {
    const { session, api } = setup(); const old = deferredProperty<PropertyAggregate>();
    vi.mocked(api.read).mockReturnValueOnce(old.promise).mockResolvedValueOnce(propertyResult(propertyTarget("source-c")));
    session.connect(propertyTarget());
    const next = propertyTarget("source-c");
    expect(session.view(next)).toEqual({ status: "pending" });
    session.connect(next); await settle();
    old.resolve(pendingPropertySubset()); await settle();
    expect(session.view(next).current?.source.source_artifact_id).toBe("source-c");
    expect(session.view(propertyTarget()).current).toBeUndefined();
  });
  it("rejects an ownership retirement before a held read can schedule any work", async () => {
    let owns = true; const { session, api } = setup(() => owns);
    const read = deferredProperty<PropertyAggregate>(); vi.mocked(api.read).mockReturnValueOnce(read.promise);
    session.connect(propertyTarget()); owns = false; read.resolve(propertyResult(propertyTarget(), "pending")); await settle();
    expect(api.demand).not.toHaveBeenCalled(); expect(session.view(propertyTarget()).current).toBeUndefined();
  });
  it("uses a ready aggregate without submitting or polling", async () => {
    vi.useFakeTimers(); const { session, api } = setup(); session.connect(propertyTarget()); await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(session.view(propertyTarget()).status).toBe("ready"); expect(api.read).toHaveBeenCalledTimes(1); expect(api.demand).not.toHaveBeenCalled();
  });
  it("automatically demands pending data, polls once and releases the finished consumer", async () => {
    vi.useFakeTimers(); const { session, api } = setup();
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(propertyTarget(), "pending")).mockResolvedValueOnce(propertyResult());
    session.connect(propertyTarget()); await settle();
    expect(api.demand).toHaveBeenCalledTimes(1); expect(session.view(propertyTarget()).status).toBe("pending");
    await vi.advanceTimersByTimeAsync(750);
    expect(session.view(propertyTarget()).status).toBe("ready"); expect(api.release).toHaveBeenCalledWith("project-1", "test-consumer", 2);
    await vi.advanceTimersByTimeAsync(60_000); expect(api.read).toHaveBeenCalledTimes(2);
  });
  it("retains explicit cancellation through refetch time and reconnect until Retry", async () => {
    vi.useFakeTimers(); const { session, api } = setup();
    vi.mocked(api.read).mockResolvedValue(propertyResult(propertyTarget(), "pending"));
    session.connect(propertyTarget()); await settle(); session.cancel(propertyTarget());
    expect(session.view(propertyTarget()).status).toBe("cancelled");
    session.connect(propertyTarget()); await vi.advanceTimersByTimeAsync(120_000);
    expect(api.read).toHaveBeenCalledTimes(1); expect(api.demand).toHaveBeenCalledTimes(1);
    session.retry(propertyTarget()); await settle();
    expect(api.read).toHaveBeenCalledTimes(2); expect(api.demand).toHaveBeenCalledTimes(2);
    const sequences = vi.mocked(api.demand).mock.calls.map(call => call[2].sequence);
    expect(sequences[1]).toBeGreaterThan(sequences[0]);
  });
  it("an explicit connection-owner release permits automatic work when that owner reconnects", async () => {
    const { session, api } = setup(); vi.mocked(api.read).mockResolvedValue(propertyResult(propertyTarget(), "pending"));
    const disconnect = session.connect(propertyTarget()); await settle(); disconnect();
    session.connect(propertyTarget()); await settle();
    expect(api.demand).toHaveBeenCalledTimes(2); expect(session.view(propertyTarget()).status).toBe("pending");
  });
  it("preserves an exactly qualified binding for preview Cancel, Undo and returning to an entry", async () => {
    const { session, api } = setup(); const disconnect = session.connect(propertyTarget()); await settle(); disconnect();
    expect(session.view(propertyTarget()).status).toBe("ready");
    expect(session.view(propertyTarget("other-source")).current).toBeUndefined();
    const held = deferredProperty<PropertyAggregate>(); vi.mocked(api.read).mockReturnValueOnce(held.promise);
    session.connect(propertyTarget());
    expect(session.view(propertyTarget()).status).toBe("ready");
    held.resolve(propertyResult()); await settle();
  });
  it.each(["source", "method", "coverage", "finite"])("rejects unqualified %s results and permits an explicit successful recovery", async kind => {
    const { session, api } = setup(); const wrong = propertyResult();
    if (kind === "source") wrong.entries[0].source = propertyTarget("wrong").source;
    if (kind === "method") wrong.entries[0].report!.policy_version = "wrong-policy";
    if (kind === "coverage") wrong.entries[0].report!.coverage = [];
    if (kind === "finite") wrong.entries[0].report!.values[0].value = Infinity;
    vi.mocked(api.read).mockResolvedValueOnce(wrong).mockResolvedValueOnce(propertyResult());
    session.connect(propertyTarget()); await settle();
    expect(session.view(propertyTarget()).status).toBe("failed"); expect(session.view(propertyTarget()).current).toBeUndefined();
    session.retry(propertyTarget()); await settle(); expect(session.view(propertyTarget()).status).toBe("ready");
  });
  it("does not restart terminal unsupported input", async () => {
    vi.useFakeTimers(); const { session, api } = setup(); vi.mocked(api.read).mockResolvedValue(propertyResult(propertyTarget(), "unavailable"));
    session.connect(propertyTarget()); await settle(); await vi.advanceTimersByTimeAsync(60_000);
    expect(session.view(propertyTarget()).status).toBe("unavailable"); expect(api.demand).not.toHaveBeenCalled(); expect(api.read).toHaveBeenCalledTimes(1);
  });
  it("old cleanup cannot stop a replacement connection, and retry is released by its actual mount", async () => {
    vi.useFakeTimers(); const { session, api } = setup(); vi.mocked(api.read).mockResolvedValue(propertyResult(propertyTarget(), "pending"));
    const old = session.connect(propertyTarget()); await settle(); const current = session.connect(propertyTarget()); await settle();
    old(); session.retry(propertyTarget()); await settle(); current();
    const calls = vi.mocked(api.read).mock.calls.length; await vi.advanceTimersByTimeAsync(60_000); expect(api.read).toHaveBeenCalledTimes(calls);
  });
  it("deactivation retires held work while a logical mount replay can connect", async () => {
    const { session, api } = setup(); const held = deferredProperty<PropertyAggregate>(); vi.mocked(api.read).mockReturnValueOnce(held.promise);
    session.connect(propertyTarget()); session.deactivate(); held.resolve(propertyResult()); await settle();
    session.retry(propertyTarget()); expect(api.read).toHaveBeenCalledTimes(1);
    session.connect(propertyTarget()); await settle(); expect(session.view(propertyTarget()).status).toBe("ready");
  });
  it("bounds qualified binding retention while keeping the current result", async () => {
    const { session, api } = setup();
    for (let index = 0; index < 66; index++) { const target = propertyTarget(`source-${index}`); vi.mocked(api.read).mockResolvedValueOnce(propertyResult(target)); session.connect(target); await settle(); }
    expect(session.view(propertyTarget("source-0")).current).toBeUndefined();
    expect(session.view(propertyTarget("source-65")).status).toBe("ready");
  });
  it("a late allocation after cancellation is released without submitting old input", async () => {
    const { session, api } = setup(); const held = deferredProperty<PropertyAggregate>();
    vi.mocked(api.allocate).mockReturnValueOnce(held.promise);
    vi.mocked(api.read).mockResolvedValue(propertyResult(propertyTarget(), "pending"));
    session.connect(propertyTarget()); await settle(); session.cancel(propertyTarget());
    held.resolve(propertyAllocation()); await settle();
    expect(api.demand).not.toHaveBeenCalled(); expect(api.release).toHaveBeenCalledWith("project-1", "test-consumer", 1);
    session.connect(propertyTarget()); await settle(); expect(api.allocate).toHaveBeenCalledTimes(1);
    expect(session.view(propertyTarget()).status).toBe("cancelled");
  });
  it("coalesces an allocation across source replacement and demands only the current source", async () => {
    const { session, api } = setup(); const held = deferredProperty<PropertyAggregate>();
    vi.mocked(api.allocate).mockReturnValueOnce(held.promise);
    const next = propertyTarget("source-c");
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(propertyTarget(), "pending")).mockResolvedValueOnce(propertyResult(next, "pending"));
    vi.mocked(api.demand).mockResolvedValueOnce(propertyResult(next));
    session.connect(propertyTarget()); await settle(); session.connect(next); await settle();
    expect(api.allocate).toHaveBeenCalledTimes(1); held.resolve(propertyAllocation()); await settle();
    expect(api.demand).toHaveBeenCalledTimes(1); expect(vi.mocked(api.demand).mock.calls[0][2].entries[0]).toEqual(next.source);
    expect(session.view(next).status).toBe("ready");
  });
  it("issues project-specific tokens and never transfers a token to another project", async () => {
    const { session, api } = setup(); const next = { ...propertyTarget(), projectId: "project-2" };
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(propertyTarget(), "pending")).mockResolvedValueOnce(propertyResult(next, "pending"));
    vi.mocked(api.allocate).mockResolvedValueOnce(propertyAllocation()).mockResolvedValueOnce(propertyAllocation("project-2", "consumer-two"));
    vi.mocked(api.demand).mockResolvedValueOnce(propertyResult(propertyTarget(), "pending")).mockResolvedValueOnce(propertyResult(next));
    session.connect(propertyTarget()); await settle(); session.connect(next); await settle();
    expect(vi.mocked(api.demand).mock.calls.map(call => call.slice(0, 2))).toEqual([["project-1", "test-consumer"], ["project-2", "consumer-two"]]);
  });
  it("recovers an expired owner exactly once without an allocation retry loop", async () => {
    const { session, api } = setup(); vi.mocked(api.read).mockResolvedValue(propertyResult(propertyTarget(), "pending"));
    vi.mocked(api.allocate).mockResolvedValueOnce(propertyAllocation()).mockResolvedValueOnce(propertyAllocation("project-1", "replacement"));
    vi.mocked(api.demand).mockRejectedValue(new ApiError(409, "property_consumer_expired", "expired"));
    session.connect(propertyTarget()); await settle(); await settle();
    expect(api.allocate).toHaveBeenCalledTimes(2); expect(api.demand).toHaveBeenCalledTimes(2);
    expect(session.view(propertyTarget()).status).toBe("failed");
  });
  it("Cancel retires a held PUT and preserves the latch after its late acknowledgement", async () => {
    const { session, api } = setup(); const held = deferredProperty<PropertyAggregate>();
    vi.mocked(api.read).mockResolvedValue(propertyResult(propertyTarget(), "pending"));
    vi.mocked(api.demand).mockReturnValueOnce(held.promise);
    session.connect(propertyTarget()); await settle(); session.cancel(propertyTarget());
    expect(api.release).toHaveBeenCalledWith("project-1", "test-consumer", 2);
    held.resolve(propertyResult()); await settle(); session.connect(propertyTarget()); await settle();
    expect(session.view(propertyTarget()).status).toBe("cancelled"); expect(api.demand).toHaveBeenCalledTimes(1);
  });
  it("bounds concurrent allocations and permits explicit recovery after retired requests finish", async () => {
    const { session, api } = setup(); const first = deferredProperty<PropertyAggregate>(), second = deferredProperty<PropertyAggregate>();
    const target2 = { ...propertyTarget(), projectId: "project-2" }, target3 = { ...propertyTarget(), projectId: "project-3" };
    vi.mocked(api.allocate).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValueOnce(propertyAllocation("project-3", "third"));
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(propertyTarget(), "pending"))
      .mockResolvedValueOnce(propertyResult(target2, "pending")).mockResolvedValue(propertyResult(target3, "pending"));
    vi.mocked(api.demand).mockResolvedValue(propertyResult(target3));
    session.connect(propertyTarget()); await settle(); session.connect(target2); await settle(); session.connect(target3); await settle();
    expect(api.allocate).toHaveBeenCalledTimes(2); expect(session.view(target3).status).toBe("failed");
    first.resolve(propertyAllocation()); second.resolve(propertyAllocation("project-2", "second")); await settle();
    session.retry(target3); await settle(); expect(api.allocate).toHaveBeenCalledTimes(3); expect(session.view(target3).status).toBe("ready");
  });
  it("known failed qualification cannot resurrect old numbers when the bounded failure fence is evicted", async () => {
    const { session, api } = setup(); session.connect(propertyTarget()); await settle();
    vi.mocked(api.read).mockRejectedValue(new Error("source could not be verified"));
    session.connect(propertyTarget()); await settle();
    for (let index = 0; index < 65; index++) { session.connect(propertyTarget(`failed-${index}`)); await settle(); }
    expect(session.view(propertyTarget()).current).toBeUndefined();
  });
  it("publishes qualified current subsets before a held demand response completes", async () => {
    const { session, api } = setup(); const held = deferredProperty<PropertyAggregate>();
    vi.mocked(api.read).mockResolvedValueOnce(pendingPropertySubset()); vi.mocked(api.demand).mockReturnValueOnce(held.promise);
    session.connect(propertyTarget()); await settle();
    expect(session.view(propertyTarget()).status).toBe("pending");
    expect(session.view(propertyTarget()).current?.report?.coverage).toEqual(["heavy_atom_count", "molecular_weight"]);
    held.resolve(propertyResult()); await settle(); expect(session.view(propertyTarget()).status).toBe("ready");
  });
  it.each(["method", "unknown", "duplicate", "order", "coverage_values", "finite", "integer", "status_reason"])("rejects malformed pending %s before publishing values or demand", async kind => {
    const { session, api } = setup(); const pending = pendingPropertySubset(); const report = pending.entries[0].report!;
    if (kind === "method") report.policy_version = "obsolete-policy";
    if (kind === "unknown") { report.coverage[0] = "unknown"; report.values[0].descriptor_id = "unknown"; }
    if (kind === "duplicate") { report.coverage[1] = report.coverage[0]; report.values[1] = { ...report.values[0] }; }
    if (kind === "order") { report.coverage.reverse(); report.values.reverse(); }
    if (kind === "coverage_values") report.values[0].descriptor_id = "molecular_weight";
    if (kind === "finite") report.values[0].value = NaN;
    if (kind === "integer") report.values[0].value = 3.5;
    if (kind === "status_reason") report.values[0] = { descriptor_id: "heavy_atom_count", status: "unavailable", value: 3, reason: "unsupported" };
    vi.mocked(api.read).mockResolvedValueOnce(pending); session.connect(propertyTarget()); await settle();
    expect(session.view(propertyTarget()).status).toBe("failed"); expect(session.view(propertyTarget()).current).toBeUndefined();
    expect(api.demand).not.toHaveBeenCalled();
  });
  it("still refuses an incomplete ready report with otherwise valid subset coverage", async () => {
    const { session, api } = setup(); const pending = pendingPropertySubset(); pending.entries[0].status = "ready";
    vi.mocked(api.read).mockResolvedValueOnce(pending); session.connect(propertyTarget()); await settle();
    expect(session.view(propertyTarget()).status).toBe("failed"); expect(session.view(propertyTarget()).current).toBeUndefined();
  });
  it("renews unchanged pending demand with the same sequence and advances for explicit Retry", async () => {
    vi.useFakeTimers(); const { session, api } = setup(); vi.mocked(api.read).mockResolvedValue(propertyResult(propertyTarget(), "pending"));
    session.connect(propertyTarget()); await settle(); await vi.advanceTimersByTimeAsync(41_000);
    expect(api.demand).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(api.demand).mock.calls;
    expect(calls.map(call => call[2].sequence)).toEqual([1, 1, 1]);
    expect(calls[1][2]).toEqual(calls[0][2]); expect(calls[2][2]).toEqual(calls[0][2]);
    session.retry(propertyTarget()); await settle(); expect(vi.mocked(api.demand).mock.calls.at(-1)?.[2].sequence).toBe(3);
  });
  it("immediately projects fourteen qualified fields to a held two-field request without new work", async () => {
    const { session, api } = setup(); const full = fullCoverageTarget();
    const subset = { ...full, descriptorIds: full.descriptorIds.slice(0, 2) }, held = deferredProperty<PropertyAggregate>();
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(full)).mockReturnValueOnce(held.promise);
    session.connect(full); await settle(); session.connect(subset);
    const projected = session.view(subset);
    expect(projected.status).toBe("ready"); expect(projected.current?.report?.coverage).toEqual(subset.descriptorIds);
    expect(projected.current?.report?.values.map(value => value.value)).toEqual([46.069, 3]);
    expect(api.demand).not.toHaveBeenCalled();
    held.resolve(propertyResult(subset)); await settle();
    expect(session.view(full).current?.report?.coverage).toHaveLength(14);
  });
  it("expands a two-field cache to fourteen with only missing coverage pending", async () => {
    const { session, api } = setup(); const full = fullCoverageTarget(), subset = { ...full, descriptorIds: full.descriptorIds.slice(0, 2) };
    const read = deferredProperty<PropertyAggregate>(), demand = deferredProperty<PropertyAggregate>();
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(subset)).mockReturnValueOnce(read.promise);
    vi.mocked(api.demand).mockReturnValueOnce(demand.promise);
    session.connect(subset); await settle(); session.connect(full);
    expect(session.view(full).status).toBe("pending"); expect(session.view(full).current?.report?.coverage).toEqual(subset.descriptorIds);
    expect(api.demand).not.toHaveBeenCalled();
    read.resolve(pendingPropertySubset(full, subset.descriptorIds)); await settle();
    expect(api.demand).toHaveBeenCalledTimes(1); expect(session.view(full).current?.report?.coverage).toEqual(subset.descriptorIds);
    demand.resolve(propertyResult(full)); await settle(); expect(session.view(full).status).toBe("ready");
  });
  it("fences every mask after a subset source failure until an actual current qualified response", async () => {
    const { session, api } = setup(); const full = fullCoverageTarget(), subset = { ...full, descriptorIds: full.descriptorIds.slice(0, 2) };
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(full)).mockRejectedValueOnce(new ApiError(409, "structure_artifact_conflict", "changed"));
    session.connect(full); await settle(); session.connect(subset); await settle();
    expect(session.view(subset).status).toBe("unavailable"); expect(session.view(full).current).toBeUndefined();
    // A response with no qualified report does not requalify the failed input.
    vi.mocked(api.read).mockResolvedValue(propertyResult(full, "pending"));
    vi.mocked(api.demand).mockResolvedValue(propertyResult(full, "pending"));
    for (const mask of [full.descriptorIds.slice(0, 1), full.descriptorIds.slice(2, 4), full.descriptorIds]) {
      const target = { ...full, descriptorIds: mask }; session.connect(target); await settle();
      expect(session.view(target).current).toBeUndefined();
    }
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(subset)); session.connect(subset); await settle();
    expect(session.view(subset).status).toBe("ready");
    expect(session.view(full).status).toBe("pending"); expect(session.view(full).current?.report?.coverage).toEqual(subset.descriptorIds);
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(full)); session.connect(full); await settle();
    expect(session.view(full).status).toBe("ready"); expect(session.view(full).current?.report?.coverage).toHaveLength(14);
  });
  it("does not merge prior fields when a qualified current report changes scientific input hash", async () => {
    const { session, api } = setup(); const full = fullCoverageTarget(), subset = { ...full, descriptorIds: full.descriptorIds.slice(0, 2) };
    const replacement = propertyResult(subset); replacement.entries[0].report!.input_hash = "b".repeat(64);
    replacement.entries[0].report!.values[0].value = 60.096;
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(full)).mockResolvedValueOnce(replacement);
    session.connect(full); await settle(); session.connect(subset); await settle();
    expect(session.view(full).status).toBe("pending"); expect(session.view(full).current?.report?.coverage).toEqual(subset.descriptorIds);
    expect(session.view(subset).current?.report?.values[0].value).toBe(60.096);
  });
  it.each(["project", "current", "original", "instance", "membership", "implementation", "policy", "library"])("isolates cached values and source fences from mismatched %s identity", async kind => {
    const { session, api } = setup(); const full = fullCoverageTarget(), subset = { ...full, descriptorIds: full.descriptorIds.slice(0, 2) };
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(full)); session.connect(full); await settle();
    const other = { ...subset, source: { ...subset.source, atom_ids: [...subset.source.atom_ids] }, registry: { ...subset.registry } };
    if (kind === "project") other.projectId = "different-project";
    if (kind === "current") other.source.source_artifact_id = "different-current";
    if (kind === "original") other.originalArtifactId = "different-original";
    if (kind === "instance") other.source.instance_id = "00000000-0000-4000-8000-000000000002";
    if (kind === "membership") other.source.atom_ids = [1, 2, 3, 4];
    if (kind === "implementation") other.registry.implementation_version = "different-implementation";
    if (kind === "policy") other.registry.policy_version = "different-policy";
    if (kind === "library") other.registry.library_version = "different-library";
    other.registry.definitions = other.registry.definitions.map(definition => ({ ...definition,
      implementation_version: other.registry.implementation_version, policy_version: other.registry.policy_version, library_version: other.registry.library_version }));
    expect(session.view(other).current).toBeUndefined();
    vi.mocked(api.read).mockRejectedValueOnce(new ApiError(409, "structure_artifact_conflict", "changed"));
    session.connect(subset); await settle();
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(other)); session.connect(other); await settle();
    expect(session.view(other).status).toBe("ready"); expect(session.view(full).current).toBeUndefined();
  });
  it("a retired mask acknowledgement cannot clear a newer base-input qualification fence", async () => {
    const { session, api } = setup(); const full = fullCoverageTarget(), subset = { ...full, descriptorIds: full.descriptorIds.slice(0, 2) };
    const old = deferredProperty<PropertyAggregate>(), current = deferredProperty<PropertyAggregate>();
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(full)).mockReturnValueOnce(old.promise)
      .mockRejectedValueOnce(new ApiError(409, "structure_artifact_conflict", "changed")).mockReturnValueOnce(current.promise);
    session.connect(full); await settle(); session.connect(subset); await settle(); session.connect(full); await settle();
    expect(session.view(full).status).toBe("unavailable");
    session.connect(full); old.resolve(propertyResult(subset)); await settle();
    expect(session.view(full).current).toBeUndefined();
    current.resolve(propertyResult(full)); await settle(); expect(session.view(full).status).toBe("ready");
  });
  it("retires a backend-cancelled request status immediately when explicit Retry starts", async () => {
    const { session, api } = setup(), held = deferredProperty<PropertyAggregate>();
    vi.mocked(api.read).mockResolvedValueOnce(propertyResult(propertyTarget(), "cancelled")).mockReturnValueOnce(held.promise);
    session.connect(propertyTarget()); await settle(); expect(session.view(propertyTarget()).status).toBe("cancelled");
    session.retry(propertyTarget()); expect(session.view(propertyTarget()).status).toBe("pending");
    held.resolve(propertyResult()); await settle(); expect(session.view(propertyTarget()).status).toBe("ready");
  });
});
