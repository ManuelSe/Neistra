import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { StrictMode, useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { getLigandInventoryOwner, inventorySourceKey, type VerifiedArtifactSource, type InventoryVerificationFailure } from "../ligands/inventoryQualification";
import { unresolvedLigandDesignation, type LigandCandidatesRead } from "../ligands/types";
import { PropertyInputOwner } from "../ligandProperties/ownership";
import { LigandPropertySession, propertySourceIdentity, propertyTargetKey, type PropertyTarget } from "../ligandProperties/session";
import type { LigandPropertyApi, PropertyAggregate, PropertyCurrent } from "../ligandProperties/types";
import { usePropertySourceVerification } from "../ligandProperties/useProperties";
import { deferredProperty, propertyAllocation, propertyPreferences, propertyRegistry, propertyResult, propertyTarget } from "./ligand-properties-fixtures";

const disposals: (() => void)[] = [];
afterEach(() => { cleanup(); disposals.splice(0).reverse().forEach(dispose => dispose()); vi.useRealTimers(); });
const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function inventory(source: VerifiedArtifactSource) {
  const key = ["ligand-candidates", "ligand-instance-v3", source.projectId, source.entryId, source.currentArtifactId,
    source.originalArtifactId, "ligand-exact-representation-v2", "ligand-occurrence-v1", "designation", 0, 12];
  const data: LigandCandidatesRead = { project_id: source.projectId, entry_id: source.entryId, artifact_id: source.currentArtifactId,
    designation: unresolvedLigandDesignation(), input_hash: "inventory", resolver_version: "ligand-instance-v3", total: 0,
    offset: 0, limit: 12, candidates: [], selectable_candidate_keys: [], designated_candidate: null, warnings: [] };
  return { key, data };
}
function physical(target = propertyTarget(), role: "current" | "original" = "current", kind = "bytes"): PropertyAggregate {
  const response = propertyResult(target, "failed"), source = propertySourceIdentity(target);
  response.entries[0].reason = kind === "metadata" ? "Source is missing. Restore and retry." : "Source failed integrity verification or is missing.";
  response.entries[0].source_failure = { reason: "artifact_unavailable", source_verification: role,
    source_identity: { project_id: source.projectId, entry_id: source.entryId,
      current_artifact_id: source.currentArtifactId, original_artifact_id: source.originalArtifactId } };
  return response;
}
function setup(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const inventoryOwner = getLigandInventoryOwner(client);
  let target = propertyTarget(), paused = false;
  const input = new PropertyInputOwner(() => ({ activeProjectId: target.projectId, inspectedEntryId: target.source.entry_id,
    sourceIdentity: propertySourceIdentity(target), inputKey: propertyTargetKey(target), paused }));
  const api: LigandPropertyApi = { registry: vi.fn().mockResolvedValue(propertyRegistry), preferences: vi.fn().mockResolvedValue(propertyPreferences),
    savePreferences: vi.fn().mockResolvedValue(propertyPreferences), allocate: vi.fn().mockImplementation((id: string) => Promise.resolve(propertyAllocation(id))),
    read: vi.fn().mockImplementation(() => Promise.resolve(propertyResult(target))),
    demand: vi.fn().mockImplementation(() => Promise.resolve(propertyResult(target, "pending"))), release: vi.fn().mockResolvedValue({}) };
  const session = new LigandPropertySession(value => input.capture(value), api);
  const events = vi.fn<(failure: InventoryVerificationFailure) => void>(); disposals.push(inventoryOwner.subscribeVerificationFailures(events));
  function Bridge({ visible }: { visible: boolean }) {
    useLayoutEffect(() => { session.activate(); input.activate(); return () => { session.deactivate(); input.deactivate(); }; }, []);
    usePropertySourceVerification(inventoryOwner, session, input);
    return visible ? <span>Visible</span> : null;
  }
  const view = (visible = true) => <QueryClientProvider client={client}>{strict ? <StrictMode><Bridge visible={visible} /></StrictMode> : <Bridge visible={visible} />}</QueryClientProvider>;
  const rendered = render(view());
  disposals.push(() => { session.deactivate(); inventoryOwner.deactivate(); client.clear(); });
  const qualification = (value = target) => inventoryOwner.qualification(inventorySourceKey({ id: value.projectId }, {
    id: value.source.entry_id, current_artifact_id: value.source.source_artifact_id, original_artifact_id: value.originalArtifactId }));
  return { client, inventoryOwner, session, input, api, events, qualification,
    select(next: PropertyTarget, preview = false) { target = next; paused = preview; input.observe(); },
    hide() { rendered.rerender(view(false)); }, show() { rendered.rerender(view()); },
    async qualify(value = target) { const query = inventory(propertySourceIdentity(value));
      await client.fetchQuery({ queryKey: query.key, queryFn: () => Promise.resolve(query.data), staleTime: 0 }); },
  };
}

describe("physical property result publication to canonical source authority", () => {
  it.each(["current", "original"] as const)("quarantines all six real producer classifications for %s, once, without demand or polling", async role => {
    vi.useFakeTimers();
    for (const kind of ["bytes", "file", "metadata"]) {
      const state = setup(), target = propertyTarget();
      state.session.connect(target); await settle(); expect(state.session.view(target).status).toBe("ready");
      const captured = state.input.capture(target); let retiredBeforeNotification = false;
      const stop = state.inventoryOwner.subscribe(() => { retiredBeforeNotification = !captured() && !state.session.view(target).current; });
      vi.mocked(state.api.read).mockResolvedValueOnce(physical(target, role, kind));
      state.session.retry(target); await settle();
      expect(state.events).toHaveBeenCalledTimes(1); expect(state.qualification().blocked).toBe(true);
      expect(state.events.mock.calls[0][0].source).toEqual(propertySourceIdentity(target));
      expect(retiredBeforeNotification).toBe(true); expect(state.session.view(target).current).toBeUndefined();
      expect(state.api.allocate).not.toHaveBeenCalled(); expect(state.api.demand).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2500); expect(state.api.read).toHaveBeenCalledTimes(2); stop();
      // Numeric warm reuse independently needs a new verified property READ.
      await state.qualify(); expect(state.qualification().blocked).toBe(false);
      expect(state.session.view(target).current).toBeUndefined(); expect(captured()).toBe(false);
      state.session.retry(target); await settle(); expect(state.session.view(target).status).toBe("ready");
      expect(state.api.demand).not.toHaveBeenCalled(); expect(state.events).toHaveBeenCalledTimes(1);
    }
  });

  it.each(["read", "demand"])("retires its own verified %s and releases demand exactly once", async phase => {
    const state = setup(), target = propertyTarget();
    vi.mocked(state.api.read).mockResolvedValueOnce(phase === "read" ? physical() : propertyResult(target, "pending"));
    vi.mocked(state.api.demand).mockResolvedValueOnce(physical(target, "original"));
    state.session.connect(target); await settle();
    expect(state.events).toHaveBeenCalledTimes(1); expect(state.qualification().blocked).toBe(true);
    expect(state.session.view(target).current).toBeUndefined();
    expect(state.api.demand).toHaveBeenCalledTimes(phase === "read" ? 0 : 1);
    expect(state.api.release).toHaveBeenCalledTimes(phase === "read" ? 0 : 1);
  });

  it("fresh numeric warm recovery cannot silently requalify candidate facts", async () => {
    const state = setup(), target = propertyTarget(); vi.mocked(state.api.read).mockResolvedValueOnce(physical());
    state.session.connect(target); await settle(); expect(state.qualification().blocked).toBe(true);
    state.session.retry(target); await settle();
    expect(state.session.view(target).status).toBe("ready"); expect(state.qualification().blocked).toBe(true);
    expect(state.api.demand).not.toHaveBeenCalled(); expect(state.events).toHaveBeenCalledTimes(1);
  });

  it.each(["project_id", "entry_id", "current_artifact_id", "original_artifact_id"] as const)("rejects physical provenance for another %s", async field => {
    const state = setup(), bad = physical(); bad.entries[0].source_failure!.source_identity[field] = "unrelated";
    vi.mocked(state.api.read).mockResolvedValueOnce(bad); state.session.connect(propertyTarget()); await settle();
    expect(state.events).not.toHaveBeenCalled(); expect(state.qualification().blocked).toBe(false);
    expect(state.session.view(propertyTarget()).current).toBeUndefined(); expect(state.api.demand).not.toHaveBeenCalled();
  });

  it.each([
    null, {}, { source_identity: null }, { source_identity: {}, source_verification: "current", reason: "artifact_unavailable" },
    { source_identity: { project_id: "project-1", entry_id: "entry-a", current_artifact_id: "artifact-a" }, source_verification: "original", reason: "artifact_unavailable" },
    { source_identity: { project_id: "project-1", entry_id: "entry-a", current_artifact_id: "artifact-a", original_artifact_id: null }, source_verification: "original", reason: "artifact_unavailable" },
  ])("does not infer physical authority from malformed fact %j", async fact => {
    const state = setup(), bad = physical(); bad.entries[0].source_failure = fact as PropertyCurrent["source_failure"];
    vi.mocked(state.api.read).mockResolvedValueOnce(bad); state.session.connect(propertyTarget()); await settle();
    expect(state.events).not.toHaveBeenCalled(); expect(state.qualification().blocked).toBe(false);
    expect(state.session.view(propertyTarget()).current).toBeUndefined();
  });

  it.each(["role", "reason", "report", "empty_id"])("rejects contradictory physical %s evidence", async kind => {
    const state = setup(), response = physical(), fact = response.entries[0].source_failure!;
    if (kind === "role") Object.assign(fact, { source_verification: "derived" });
    else if (kind === "reason") Object.assign(fact, { reason: "worker_lost" });
    else if (kind === "empty_id") fact.source_identity.original_artifact_id = "";
    else response.entries[0].report = propertyResult().entries[0].report;
    vi.mocked(state.api.read).mockResolvedValueOnce(response); state.session.connect(propertyTarget()); await settle();
    expect(state.events).not.toHaveBeenCalled(); expect(state.qualification().blocked).toBe(false);
    expect(state.session.view(propertyTarget()).current).toBeUndefined(); expect(state.api.demand).not.toHaveBeenCalled();
  });

  it.each(["ready", "pending", "unavailable", "cancelled"] as const)("rejects contradictory %s with a physical failure", async status => {
    const state = setup(), response = physical(); response.entries[0].status = status;
    vi.mocked(state.api.read).mockResolvedValueOnce(response); state.session.connect(propertyTarget()); await settle();
    expect(state.events).not.toHaveBeenCalled(); expect(state.qualification().blocked).toBe(false);
    expect(state.session.view(propertyTarget()).current).toBeUndefined(); expect(state.api.demand).not.toHaveBeenCalled();
  });

  it.each(["network", "designation", "worker", "capacity", "chemistry", "derived_report"])("keeps candidate authority for %s failures", async kind => {
    const state = setup(), response = propertyResult(propertyTarget(), ["capacity", "chemistry"].includes(kind) ? "unavailable" : "failed");
    response.entries[0].reason = "Source failed integrity verification or is missing."; // Text is never proof.
    if (["network", "designation"].includes(kind)) vi.mocked(state.api.read).mockRejectedValueOnce(new ApiError(kind === "network" ? 0 : 409,
      kind === "network" ? "network_error" : "structure_artifact_conflict", "Controlled nonphysical failure"));
    else vi.mocked(state.api.read).mockResolvedValueOnce(response);
    state.session.connect(propertyTarget()); await settle(); expect(state.events).not.toHaveBeenCalled();
    expect(state.qualification().blocked).toBe(false); expect(state.api.demand).not.toHaveBeenCalled();
  });

  it("retires every cached coverage/method/instance alias while preserving exact original and unrelated source", async () => {
    const state = setup(), target = propertyTarget();
    const aliases = [target, { ...target, descriptorIds: ["heavy_atom_count"] }, { ...target, registry: { ...target.registry, policy_version: "other" } },
      { ...target, source: { ...target.source, instance_id: "other-instance", atom_ids: [1, 2] } }];
    const others = [{ ...target, originalArtifactId: "other-original" }, { ...target, projectId: "another-project" },
      { ...target, source: { ...target.source, entry_id: "another-entry" } }, propertyTarget("other-current")];
    for (const value of [...aliases, ...others]) {
      state.select(value); state.session.connect(value); await settle(); expect(state.session.view(value).status).toBe("ready");
    }
    state.select(target); vi.mocked(state.api.read).mockResolvedValueOnce(physical()); state.session.connect(target); await settle();
    expect(state.events).toHaveBeenCalledTimes(1);
    for (const value of aliases) expect(state.session.view(value).current).toBeUndefined();
    for (const value of others) expect(state.session.view(value).status).toBe("ready");
  });

  it.each(["read", "demand"])("rejects held %s physical A after A→B→A and explicit Cancel", async phase => {
    const state = setup(), a = propertyTarget(), held = deferredProperty<PropertyAggregate>();
    if (phase === "read") vi.mocked(state.api.read).mockReturnValueOnce(held.promise);
    else { vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(a, "pending")); vi.mocked(state.api.demand).mockReturnValueOnce(held.promise); }
    state.session.connect(a); await settle(); state.select(propertyTarget("B")); state.select(a); // Same frame ABA invalidates capture.
    held.resolve(physical(a)); await settle(); expect(state.events).not.toHaveBeenCalled();
    const cancelled = deferredProperty<PropertyAggregate>(); vi.mocked(state.api.read).mockReturnValueOnce(cancelled.promise);
    state.session.connect(a); await settle(); state.session.cancel(a); cancelled.resolve(physical(a)); await settle();
    expect(state.events).not.toHaveBeenCalled(); expect(state.session.view(a).status).toBe("cancelled");
    state.session.retry(a); await settle(); expect(state.session.view(a).status).toBe("ready");
  });

  it.each(["read", "demand"])("rejects old held successful %s after a new physical fact and a second failure during Retry", async phase => {
    const state = setup(), target = propertyTarget(), held = deferredProperty<PropertyAggregate>();
    if (phase === "read") vi.mocked(state.api.read).mockReturnValueOnce(held.promise);
    else { vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(target, "pending")); vi.mocked(state.api.demand).mockReturnValueOnce(held.promise); }
    state.session.connect(target); await settle();
    state.inventoryOwner.recordSourceFailure({ source: propertySourceIdentity(target), reason: "artifact_unavailable" });
    held.resolve(propertyResult()); await settle(); expect(state.session.view(target).current).toBeUndefined();
    const retry = deferredProperty<PropertyAggregate>(); vi.mocked(state.api.read).mockReturnValueOnce(retry.promise);
    state.session.retry(target); await settle(); state.inventoryOwner.recordSourceFailure({ source: propertySourceIdentity(target), reason: "source_conflict" });
    retry.resolve(propertyResult()); await settle(); expect(state.session.view(target).current).toBeUndefined();
    vi.mocked(state.api.read).mockResolvedValueOnce(physical()); state.session.retry(target); await settle();
    expect(state.events).toHaveBeenCalledTimes(3); expect(state.api.read).toHaveBeenCalledTimes(3);
  });

  it("retains the production bridge through hidden StrictMode presentation, preview, remount and Undo", async () => {
    const state = setup(true), target = propertyTarget(); state.session.connect(target); await settle();
    const captured = state.input.capture(target); state.hide();
    vi.mocked(state.api.read).mockResolvedValueOnce(physical()); state.session.retry(target); await settle();
    expect(state.events).toHaveBeenCalledTimes(1); expect(captured()).toBe(false); expect(state.qualification().blocked).toBe(true);
    state.show(); expect(state.session.view(target).current).toBeUndefined(); expect(state.api.read).toHaveBeenCalledTimes(2);
    state.select(target, true); state.select(target); // Preview Cancel permits fresh READ without inventing recovery.
    const fresh = deferredProperty<PropertyAggregate>(); vi.mocked(state.api.read).mockReturnValueOnce(fresh.promise);
    state.session.connect(target); await settle(); expect(state.session.view(target).current).toBeUndefined();
    fresh.resolve(propertyResult()); await settle(); expect(state.session.view(target).status).toBe("ready");
    expect(state.qualification().blocked).toBe(true);
    state.select(propertyTarget("edited")); state.session.connect(propertyTarget("edited")); await settle();
    state.select(target); vi.mocked(state.api.read).mockResolvedValueOnce(physical(target, "original")); state.session.connect(target); await settle();
    expect(state.session.view(target).current).toBeUndefined(); expect(state.events).toHaveBeenCalledTimes(2);
    expect(state.api.demand).not.toHaveBeenCalled(); expect(captured()).toBe(false);
  });

  it("source-verified demand success cannot bypass a fresh property READ recovery fence", async () => {
    vi.useFakeTimers(); const state = setup(), target = propertyTarget();
    vi.mocked(state.api.read).mockResolvedValueOnce(physical()); state.session.connect(target); await settle();
    vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(target, "pending"));
    vi.mocked(state.api.demand).mockResolvedValueOnce(propertyResult(target));
    const fresh = deferredProperty<PropertyAggregate>(); vi.mocked(state.api.read).mockReturnValueOnce(fresh.promise);
    state.session.retry(target); await settle(); expect(state.session.view(target).current).toBeUndefined();
    expect(state.session.view(target).status).toBe("pending");
    await vi.advanceTimersByTimeAsync(750); expect(state.session.view(target).current).toBeUndefined();
    fresh.resolve(propertyResult()); await settle(); expect(state.session.view(target).status).toBe("ready");
    expect(state.qualification().blocked).toBe(true); expect(state.events).toHaveBeenCalledTimes(1);
  });
});
