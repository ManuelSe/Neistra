import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { Project } from "../api/types";
import { LigandProperties } from "../components/LigandProperties";
import { getLigandInventoryOwner, inventorySourceKey, type InventoryVerificationFailure } from "../ligands/inventoryQualification";
import { unresolvedLigandDesignation, type LigandCandidatesRead } from "../ligands/types";
import { PROPERTY_PREFERENCES_KEY, PROPERTY_REGISTRY_KEY, propertyInputKey } from "../ligandProperties/context";
import { PropertyInputOwner } from "../ligandProperties/ownership";
import { LigandPropertySession, propertySourceIdentity, propertyTargetKey, type PropertyTarget } from "../ligandProperties/session";
import type { LigandPropertyApi, PropertyAggregate } from "../ligandProperties/types";
import { useLigandProperties, usePropertySourceVerification } from "../ligandProperties/useProperties";
import { deferredProperty, pendingPropertySubset, propertyAllocation, propertyPreferences, propertyProject, propertyRegistry, propertyResult, propertyTarget } from "./ligand-properties-fixtures";

const releases: (() => void)[] = [];
afterEach(() => { cleanup(); releases.splice(0).reverse().forEach(release => release()); vi.useRealTimers(); });
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function inventory(source = propertySourceIdentity(propertyTarget()), offset = 0) {
  const key = ["ligand-candidates", "ligand-instance-v3", source.projectId, source.entryId,
    source.currentArtifactId, source.originalArtifactId, "ligand-exact-representation-v2", "ligand-occurrence-v1", "designation", offset, 12];
  const data: LigandCandidatesRead = { project_id: source.projectId, entry_id: source.entryId, artifact_id: source.currentArtifactId,
    resolver_version: "ligand-instance-v3", designation: unresolvedLigandDesignation(), input_hash: "inventory-transport-fixture",
    total: 0, offset, limit: 12, candidates: [], selectable_candidate_keys: [], designated_candidate: null, warnings: [] };
  return { key, data };
}
function setup(wire = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(PROPERTY_REGISTRY_KEY, propertyRegistry); client.setQueryData(PROPERTY_PREFERENCES_KEY, propertyPreferences);
  const inventoryOwner = getLigandInventoryOwner(client);
  let target = propertyTarget(), paused = false;
  const owner = new PropertyInputOwner(() => ({ activeProjectId: target.projectId, inspectedEntryId: target.source.entry_id,
    sourceIdentity: propertySourceIdentity(target), inputKey: propertyTargetKey(target), paused }));
  const api: LigandPropertyApi = { registry: vi.fn().mockResolvedValue(propertyRegistry), preferences: vi.fn().mockResolvedValue(propertyPreferences),
    savePreferences: vi.fn().mockResolvedValue(propertyPreferences), allocate: vi.fn().mockResolvedValue(propertyAllocation()),
    read: vi.fn().mockImplementation(() => Promise.resolve(propertyResult(target))),
    demand: vi.fn().mockImplementation(() => Promise.resolve(propertyResult(target, "pending"))), release: vi.fn().mockResolvedValue({}) };
  const session = new LigandPropertySession(value => owner.capture(value), api);
  const stop = wire ? inventoryOwner.subscribeVerificationFailures(failure => session.invalidateSource(failure.source, failure.token,
    failure.reason, () => owner.retireSource(failure.source))) : () => {};
  releases.push(() => { stop(); session.deactivate(); inventoryOwner.deactivate(); client.clear(); });
  return { client, inventoryOwner, session, owner, api,
    select(next: PropertyTarget, nextPaused = false) { target = next; paused = nextPaused; owner.observe(); },
    fail(code = "artifact_integrity_error", source = propertySourceIdentity(target), offset = 0) {
      return client.fetchQuery({ queryKey: inventory(source, offset).key,
        queryFn: () => Promise.reject(new ApiError(409, code, "Controlled source verification failure")), staleTime: 0 }).catch(() => undefined);
    },
    qualify(source = propertySourceIdentity(target)) {
      const value = inventory(source);
      return client.fetchQuery({ queryKey: value.key, queryFn: () => Promise.resolve(value.data), staleTime: 0 });
    } };
}
function ui(strict = false) {
  const state = setup(false); let project = propertyProject(), pausedReason: string | null = null;
  project.entries[0].original_artifact_id = "original-a";
  const owner = new PropertyInputOwner(() => ({ activeProjectId: project.id, inspectedEntryId: "entry-a", paused: !!pausedReason,
    sourceIdentity: { projectId: project.id, entryId: "entry-a", currentArtifactId: project.entries[0].current_artifact_id,
      originalArtifactId: project.entries[0].original_artifact_id },
    inputKey: propertyInputKey(project.id, project.entries[0], propertyRegistry, propertyPreferences) }));
  const session = new LigandPropertySession(value => owner.capture(value), state.api); releases.push(() => session.deactivate());
  function Harness({ visible }: { visible: boolean }) {
    useLayoutEffect(() => { owner.activate(); session.activate(); owner.observe(); return () => { owner.deactivate(); session.deactivate(); }; }, []);
    usePropertySourceVerification(state.inventoryOwner, session, owner);
    const presentation = useLigandProperties({ project, entryId: "entry-a", pausedReason, session, owner });
    return visible ? <LigandProperties state={presentation} session={session} /> : null;
  }
  const view = (visible = true) => {
    const element = <QueryClientProvider client={state.client}><Tooltip.Provider><Harness visible={visible} /></Tooltip.Provider></QueryClientProvider>;
    return strict ? <StrictMode>{element}</StrictMode> : element;
  };
  const rendered = render(view());
  return { ...state, owner, session,
    update(next: { project?: Project; preview?: boolean; visible?: boolean } = {}) {
      act(() => { project = next.project ?? project; if (next.preview !== undefined) pausedReason = next.preview ? "Preview" : null;
        owner.observe(); rendered.rerender(view(next.visible)); });
    } };
}

describe("verified source retirement across inventory and property authority", () => {
  it.each(["artifact_integrity_error", "artifact_not_found", "structure_artifact_conflict"])("retires displayed numbers and captured authority for %s until a fresh property READ", async code => {
    const state = ui(); await screen.findByText("Properties current");
    // The controlled property transport independently supplies three heavy atoms and ethanol mass.
    expect(screen.getByText("46.069")).toHaveTextContent("g/mol");
    const captured = state.owner.capture(propertyTarget()), epoch = state.owner.connectionSnapshot();
    let observedAfterPurge = false;
    const stop = state.session.subscribe(() => { observedAfterPurge = !captured() && !state.session.view(propertyTarget()).current; });
    await act(async () => { await state.fail(code); }); stop();
    expect(observedAfterPurge).toBe(true); expect(captured()).toBe(false);
    expect(state.owner.connectionSnapshot()).toBe(epoch);
    expect(screen.queryByText("46.069")).not.toBeInTheDocument();
    expect(screen.queryByText("Properties current")).not.toBeInTheDocument();
    const value = inventory(); state.client.setQueryData(value.key, value.data);
    await act(async () => { await state.qualify(); });
    expect(state.inventoryOwner.qualification(inventorySourceKey({ id: "project-1" }, {
      id: "entry-a", current_artifact_id: "artifact-a", original_artifact_id: "original-a" })).blocked).toBe(false);
    expect(screen.queryByText("46.069")).not.toBeInTheDocument(); expect(state.api.read).toHaveBeenCalledTimes(1);
    expect(state.api.demand).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Properties current"); expect(screen.getByText("46.069")).toBeVisible();
    expect(state.api.read).toHaveBeenCalledTimes(2); expect(state.api.demand).not.toHaveBeenCalled(); expect(captured()).toBe(false);
  });

  it("keeps the App bridge active while presentation is hidden, including StrictMode and preview Cancel", async () => {
    const state = ui(true); await screen.findByText("Properties current"); const reads = vi.mocked(state.api.read).mock.calls.length;
    state.update({ visible: false }); await act(async () => { await state.fail(); });
    state.update(); expect(screen.queryByText("46.069")).not.toBeInTheDocument(); expect(state.api.read).toHaveBeenCalledTimes(reads);
    const fresh = deferredProperty<PropertyAggregate>(); vi.mocked(state.api.read).mockReturnValueOnce(fresh.promise);
    state.update({ preview: true }); state.update({ preview: false });
    expect(screen.queryByText("46.069")).not.toBeInTheDocument();
    await act(async () => { fresh.resolve(propertyResult()); await fresh.promise; });
    await screen.findByText("Properties current");
  });

  it.each(["read", "demand"])("rejects an older held %s and a second failure during fresh Retry", async phase => {
    const state = setup(), target = propertyTarget(), old = deferredProperty<PropertyAggregate>();
    if (phase === "read") vi.mocked(state.api.read).mockReturnValueOnce(old.promise);
    else {
      vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(target, "pending"));
      vi.mocked(state.api.demand).mockReturnValueOnce(old.promise);
    }
    state.session.connect(target); await settle(); const captured = state.owner.capture(target);
    const signal = phase === "read" ? vi.mocked(state.api.read).mock.calls[0][2] : vi.mocked(state.api.demand).mock.calls[0][3];
    await state.fail(); expect(signal?.aborted).toBe(true); expect(captured()).toBe(false);
    if (phase === "demand") expect(state.api.release).toHaveBeenCalledWith("project-1", "test-consumer", 2);
    old.resolve(propertyResult()); await settle(); expect(state.session.view(target).current).toBeUndefined();
    const fresh = deferredProperty<PropertyAggregate>(); vi.mocked(state.api.read).mockReturnValueOnce(fresh.promise);
    state.session.retry(target); await settle(); const retryCapture = state.owner.capture(target);
    await state.fail("artifact_not_found", propertySourceIdentity(target), 12);
    fresh.resolve(propertyResult()); await settle(); expect(retryCapture()).toBe(false); expect(state.session.view(target).current).toBeUndefined();
    state.session.retry(target); await settle(); expect(state.session.view(target).current?.report?.values[0].value).toBe(3);
    expect(state.session.view(target).status).toBe("ready");
  });

  it("purges coverage, method, membership and instance aliases while preserving another original artifact", async () => {
    const state = setup(false), session = new LigandPropertySession(() => () => true, state.api); releases.push(() => session.deactivate());
    const base = propertyTarget(), aliases = [base, { ...base, descriptorIds: ["heavy_atom_count"] },
      { ...base, registry: { ...base.registry, policy_version: "other-policy" } },
      { ...base, source: { ...base.source, instance_id: "another-instance", atom_ids: [1, 2] } }];
    const other = { ...base, originalArtifactId: "other-original" };
    for (const target of [...aliases, other]) { vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(target)); session.connect(target); await settle(); }
    const stop = state.inventoryOwner.subscribeVerificationFailures(failure => session.invalidateSource(failure.source, failure.token, failure.reason)); releases.push(stop);
    await state.fail();
    for (const target of aliases) expect(session.view(target).current).toBeUndefined();
    expect(session.view(other).current?.report?.values[0].value).toBe(3);
    const held = deferredProperty<PropertyAggregate>(); vi.mocked(state.api.read).mockReturnValueOnce(held.promise);
    session.connect(aliases[1]); expect(session.view(base).current).toBeUndefined();
    held.resolve(propertyResult(aliases[1])); await settle();
    expect(session.view(base).status).toBe("pending"); expect(session.view(base).current?.report?.coverage).toEqual(["heavy_atom_count"]);
    expect(session.view(base).current?.report?.coverage).not.toContain("molecular_weight");
  });

  it("requires a property READ even when a fresh consumer result is ready", async () => {
    vi.useFakeTimers(); const state = setup(), target = propertyTarget(); state.session.connect(target); await settle(); await state.fail();
    vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(target, "pending"));
    vi.mocked(state.api.demand).mockResolvedValueOnce(propertyResult());
    state.session.retry(target); await settle(); expect(state.session.view(target).current).toBeUndefined(); expect(state.session.view(target).status).toBe("pending");
    await vi.advanceTimersByTimeAsync(750); expect(state.session.view(target).status).toBe("ready"); expect(state.api.read).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed fresh reports and accepts a valid fresh partial READ without reviving missing coverage", async () => {
    const state = setup(), target = propertyTarget(); state.session.connect(target); await settle(); await state.fail();
    const bad = propertyResult(); bad.entries[0].report!.policy_version = "wrong-policy";
    vi.mocked(state.api.read).mockResolvedValueOnce(bad); state.session.retry(target); await settle(); expect(state.session.view(target).current).toBeUndefined();
    vi.mocked(state.api.read).mockResolvedValueOnce(pendingPropertySubset(target, ["heavy_atom_count"]));
    state.session.retry(target); await settle(); expect(state.session.view(target).current?.report?.coverage).toEqual(["heavy_atom_count"]);
    expect(state.session.view(target).status).toBe("pending");
  });

  it("preserves explicit Cancel through failure, candidate recovery and reconnect until Retry", async () => {
    const state = setup(), target = propertyTarget();
    vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(target, "pending")); state.session.connect(target); await settle();
    state.session.cancel(target); await state.fail(); await state.qualify(); state.session.connect(target); await settle();
    expect(state.session.view(target).status).toBe("cancelled"); expect(state.api.read).toHaveBeenCalledTimes(1);
    state.session.retry(target); await settle(); expect(state.session.view(target).status).toBe("ready");
  });

  it.each(["transport", "project", "entry", "current", "original", "metadata pressure"])("preserves numeric authority and active work for %s", async mode => {
    const state = setup(), target = propertyTarget(); state.session.connect(target); await settle(); const captured = state.owner.capture(target);
    const epoch = state.owner.snapshot(), source = propertySourceIdentity(target);
    if (mode === "metadata pressure") for (let i = 0; i < 150; i++) await state.qualify({ ...source, entryId: `other-${i}` });
    else await state.fail(mode === "transport" ? "network_unavailable" : "artifact_integrity_error", {
      ...source, ...(mode === "project" ? { projectId: "another-project" } : mode === "entry" ? { entryId: "another-entry" }
        : mode === "current" ? { currentArtifactId: "another-current" } : mode === "original" ? { originalArtifactId: "another-original" } : {}),
    });
    expect(state.owner.snapshot()).toBe(epoch); expect(captured()).toBe(true);
    expect(state.session.view(target).status).toBe("ready"); expect(state.session.view(target).current?.report?.values[1].value).toBe(46.069);
    expect(state.api.read).toHaveBeenCalledTimes(1); expect(state.api.demand).not.toHaveBeenCalled();
  });

  it("does not interrupt unrelated in-flight work or repeat failure-driven reads", async () => {
    const state = setup(), target = propertyTarget(), pending = deferredProperty<PropertyAggregate>();
    vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(target, "pending"));
    vi.mocked(state.api.demand).mockReturnValueOnce(pending.promise);
    state.session.connect(target); await settle();
    const signal = vi.mocked(state.api.demand).mock.calls[0][3];
    await state.fail("artifact_not_found", { ...propertySourceIdentity(target), entryId: "other-entry" });
    expect(signal?.aborted).toBe(false); expect(state.api.release).not.toHaveBeenCalled();
    expect(state.api.read).toHaveBeenCalledTimes(1); expect(state.api.demand).toHaveBeenCalledTimes(1);
    pending.resolve(propertyResult()); await settle(); expect(state.session.view(target).status).toBe("ready");
    const before = state.api.read;
    await state.fail(); await state.fail("artifact_not_found"); await state.qualify();
    expect(before).toHaveBeenCalledTimes(1); expect(state.session.view(target).current).toBeUndefined();
  });

  it("installs a fresh property read after an existing cached inventory failure without treating that cache fact as a report", async () => {
    const state = setup(false), target = propertyTarget(); await state.fail();
    const stop = state.inventoryOwner.subscribeVerificationFailures(failure => state.session.invalidateSource(failure.source, failure.token,
      failure.reason, () => state.owner.retireSource(failure.source))); releases.push(stop);
    expect(state.session.view(target).current).toBeUndefined();
    state.session.connect(target); await settle(); expect(state.session.view(target).status).toBe("ready");
    expect(state.inventoryOwner.qualification(JSON.stringify(["project-1", "entry-a", "artifact-a", "original-a"])).blocked).toBe(true);
    expect(state.api.read).toHaveBeenCalledTimes(1); expect(state.api.demand).not.toHaveBeenCalled();
  });

  it("keeps failed source A retired through A→B→A/Undo and original replacement until each fresh READ", async () => {
    const state = setup(), a = propertyTarget(), b = propertyTarget("artifact-b"); state.session.connect(a); await settle();
    await state.fail(); state.select(b); vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(b)); state.session.connect(b); await settle();
    const oldB = state.owner.capture(b), heldA = deferredProperty<PropertyAggregate>();
    state.select(a); vi.mocked(state.api.read).mockReturnValueOnce(heldA.promise); state.session.connect(a);
    expect(state.session.view(a).current).toBeUndefined(); expect(oldB()).toBe(false);
    const replacement = { ...a, originalArtifactId: "replacement-original" }; state.select(replacement);
    vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(replacement)); state.session.connect(replacement); await settle();
    heldA.resolve(propertyResult(a)); await settle(); expect(state.session.view(a).current).toBeUndefined();
    expect(state.session.view(replacement).status).toBe("ready");
  });

  it("emits exact fixed facts after the candidate barrier and before cancelling same-source inventory pages", async () => {
    const state = setup(), target = propertyTarget(), source = propertySourceIdentity(target);
    state.session.connect(target); await settle();
    const older = deferredProperty<LigandCandidatesRead>(), page = inventory(source, 12); let signal: AbortSignal | undefined;
    const work = state.client.fetchQuery({ queryKey: page.key, queryFn: context => { signal = context.signal; return older.promise; } }).catch(() => undefined);
    let observed = false;
    const stop = state.inventoryOwner.subscribeVerificationFailures(failure => {
      observed = true; expect(failure.source).toEqual(source); expect(failure.reason).toBe("artifact_unavailable");
      expect(Object.isFrozen(failure.token)).toBe(true);
      expect(state.inventoryOwner.qualification(JSON.stringify([source.projectId, source.entryId, source.currentArtifactId, source.originalArtifactId])).blocked).toBe(true);
      expect(state.session.view(target).current).toBeUndefined(); expect(signal?.aborted).toBe(false);
    });
    await state.fail(); stop(); expect(observed).toBe(true); expect(signal?.aborted).toBe(true);
    older.resolve(page.data); await work; expect(state.session.view(target).current).toBeUndefined();
  });

  it("cannot bypass READ qualification through bounded failure eviction and a ready consumer result", async () => {
    vi.useFakeTimers(); const state = setup(false), first = propertyTarget();
    const session = new LigandPropertySession(() => () => true, state.api); releases.push(() => session.deactivate());
    const stop = state.inventoryOwner.subscribeVerificationFailures(failure => session.invalidateSource(failure.source, failure.token, failure.reason)); releases.push(stop);
    for (let i = 0; i < 70; i++) {
      const target = { ...first, source: { ...first.source, entry_id: `failed-${i}` } };
      vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(target)); session.connect(target); await settle();
      await state.fail("artifact_integrity_error", propertySourceIdentity(target));
    }
    const retired = { ...first, source: { ...first.source, entry_id: "failed-0" } };
    expect(session.view(retired).current).toBeUndefined();
    vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(retired, "pending")).mockResolvedValueOnce(propertyResult(retired));
    vi.mocked(state.api.demand).mockResolvedValueOnce(propertyResult(retired));
    session.connect(retired); await settle(); expect(session.view(retired).current).toBeUndefined();
    await vi.advanceTimersByTimeAsync(750); expect(session.view(retired).status).toBe("ready");
    expect(session.view(retired).current?.source.entry_id).toBe("failed-0");
    const failures: unknown = Reflect.get(session, "sourceFailures"); expect((failures as Map<string, unknown>).size).toBeLessThanOrEqual(64);
  });

  it("bounds repeated source failures without error retention and preserves unrelated current qualification", async () => {
    const state = setup(), target = propertyTarget(); state.session.connect(target); await settle();
    const events: InventoryVerificationFailure[] = []; const stop = state.inventoryOwner.subscribeVerificationFailures(event => { events.push(event); });
    const source = propertySourceIdentity(target);
    for (let i = 0; i < 2000; i++) {
      const other = { ...source, entryId: `unrelated-${i}` }; await state.fail("artifact_integrity_error", other);
      state.client.removeQueries({ queryKey: inventory(other).key, exact: true });
    }
    stop(); expect(new Set(events.map(event => event.token)).size).toBe(2000);
    expect(state.inventoryOwner.retention().records).toBeLessThanOrEqual(128); expect(state.inventoryOwner.retention().sourceKeyBytes).toBeLessThanOrEqual(65_536);
    for (const name of ["values", "requests", "sourceFailures"]) {
      const records: unknown = Reflect.get(state.session, name); expect(records).toBeInstanceOf(Map);
      expect((records as Map<string, unknown>).size).toBeLessThanOrEqual(64);
      expect(JSON.stringify([...(records as Map<string, unknown>).values()])).not.toContain("Controlled source verification failure");
    }
    const failures: unknown = Reflect.get(state.session, "sourceFailures");
    expect((failures as Map<string, unknown>).size).toBe(0);
    expect(state.session.view(target).status).toBe("ready"); expect(state.api.read).toHaveBeenCalledTimes(1);
  });
});

function depictionKey(source = propertySourceIdentity(propertyTarget())): unknown[] {
  return ["ligand-depiction", "ligand-instance-v3", "ligand-2d-v1", "committed", source.projectId, source.entryId,
    source.currentArtifactId, source.originalArtifactId, "ligand-exact-representation-v2", "qualified-inventory", "candidate-key", 240, 180];
}
async function failDepiction(state: ReturnType<typeof setup>, code: string, provenance: "current" | "original" | null = null,
  key = depictionKey(), status = code === "artifact_not_found" ? 404 : 409) {
  await state.client.fetchQuery({ queryKey: key, staleTime: 0,
    queryFn: () => Promise.reject(new ApiError(status, code, "Controlled depiction boundary", [], [], null, provenance)),
  }).catch(() => undefined);
}

describe("depiction molecular-source verification channel", () => {
  it.each(["current", "original"] as const)("rejects %s provenance without that artifact in the request source", async role => {
    const state = setup(), key = depictionKey(), events: InventoryVerificationFailure[] = [];
    key[role === "current" ? 6 : 7] = null;
    const stop = state.inventoryOwner.subscribeVerificationFailures(event => { events.push(event); });
    await failDepiction(state, "artifact_integrity_error", role, key); stop();
    expect(events).toHaveLength(0); expect(state.inventoryOwner.retention().records).toBe(0);
  });

  it.each([
    ["structure_artifact_conflict", null], ["artifact_integrity_error", "current"], ["artifact_integrity_error", "original"],
    ["artifact_not_found", "current"], ["artifact_not_found", "original"],
  ] as const)("retires displayed numbers for %s/%s and recovers only through fresh property READ", async (code, provenance) => {
    const state = ui(); await screen.findByText("Properties current");
    const captured = state.owner.capture(propertyTarget()), epoch = state.owner.connectionSnapshot();
    expect(screen.getByText("46.069")).toBeVisible();
    await act(async () => { await failDepiction(state, code, provenance); });
    expect(captured()).toBe(false); expect(state.owner.connectionSnapshot()).toBe(epoch);
    expect(screen.queryByText("46.069")).not.toBeInTheDocument(); expect(screen.queryByText("Properties current")).not.toBeInTheDocument();
    const sourceKey = JSON.stringify(["project-1", "entry-a", "artifact-a", "original-a"]);
    expect(state.inventoryOwner.qualification(sourceKey).blocked).toBe(true);
    await act(async () => { await state.client.fetchQuery({ queryKey: depictionKey(), staleTime: 0, queryFn: () => Promise.resolve({ status: "ready" }) }); });
    expect(state.inventoryOwner.qualification(sourceKey).blocked).toBe(true);
    await act(async () => { await state.qualify(); });
    expect(state.inventoryOwner.qualification(sourceKey).blocked).toBe(false);
    expect(screen.queryByText("46.069")).not.toBeInTheDocument(); expect(state.api.read).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Retry" })); await screen.findByText("Properties current");
    expect(screen.getByText("46.069")).toBeVisible(); expect(state.api.read).toHaveBeenCalledTimes(2); expect(state.api.demand).not.toHaveBeenCalled();
    expect(captured()).toBe(false);
  });

  it.each(["derived integrity", "derived missing", "transport", "wrong status", "preview", "old resolver", "old chemistry", "old drawing",
    "malformed identity", "malformed inventory", "malformed candidate", "malformed dimensions", "extra key", "project", "entry", "current", "original"])(
    "preserves independently qualified numeric authority for %s", async mode => {
      const state = setup(), target = propertyTarget(); state.session.connect(target); await settle();
      const captured = state.owner.capture(target), epoch = state.owner.snapshot(), key = depictionKey();
      if (mode === "preview") key[3] = "preview-unavailable";
      if (mode === "old resolver") key[1] = "old-resolver";
      if (mode === "old chemistry") key[8] = "old-chemistry";
      if (mode === "old drawing") key[2] = "old-drawing";
      if (mode === "malformed identity") key[6] = {};
      if (mode === "malformed inventory") key[9] = undefined;
      if (mode === "malformed candidate") key[10] = null;
      if (mode === "malformed dimensions") key[11] = -1;
      if (mode === "extra key") key.push("extra");
      if (mode === "project") key[4] = "other-project";
      if (mode === "entry") key[5] = "other-entry";
      if (mode === "current") key[6] = "other-current";
      if (mode === "original") key[7] = "other-original";
      const code = mode === "derived integrity" ? "artifact_integrity_error" : mode === "derived missing" ? "artifact_not_found"
        : mode === "transport" ? "network_error" : "structure_artifact_conflict";
      await failDepiction(state, code, null, key, mode === "wrong status" ? 503 : code === "artifact_not_found" ? 404 : 409);
      expect(captured()).toBe(true); expect(state.owner.snapshot()).toBe(epoch); expect(state.session.view(target).status).toBe("ready");
      expect(state.session.view(target).current?.report?.values[1].value).toBe(46.069);
      expect(state.api.read).toHaveBeenCalledTimes(1); expect(state.api.demand).not.toHaveBeenCalled();
    },
  );

  it.each(["read", "demand"])("retires held property %s and candidate pages before late results can cross a depiction failure", async phase => {
    const state = setup(), target = propertyTarget(), held = deferredProperty<PropertyAggregate>();
    if (phase === "read") vi.mocked(state.api.read).mockReturnValueOnce(held.promise);
    else { vi.mocked(state.api.read).mockResolvedValueOnce(propertyResult(target, "pending")); vi.mocked(state.api.demand).mockReturnValueOnce(held.promise); }
    state.session.connect(target); await settle(); const captured = state.owner.capture(target);
    const signal = phase === "read" ? vi.mocked(state.api.read).mock.calls[0][2] : vi.mocked(state.api.demand).mock.calls[0][3];
    const page = inventory(propertySourceIdentity(target), 12), older = deferredProperty<LigandCandidatesRead>(); let inventorySignal: AbortSignal | undefined;
    const work = state.client.fetchQuery({ queryKey: page.key, queryFn: context => { inventorySignal = context.signal; return older.promise; } }).catch(() => undefined);
    let observed = false;
    const stop = state.inventoryOwner.subscribeVerificationFailures(failure => {
      observed = true; expect(failure.source).toEqual(propertySourceIdentity(target)); expect(failure.reason).toBe("source_conflict");
      expect(state.inventoryOwner.qualification(JSON.stringify(["project-1", "entry-a", "artifact-a", "original-a"])).blocked).toBe(true);
      expect(captured()).toBe(false); expect(state.session.view(target).current).toBeUndefined(); expect(inventorySignal?.aborted).toBe(false);
    });
    await failDepiction(state, "structure_artifact_conflict"); stop();
    expect(observed).toBe(true); expect(signal?.aborted).toBe(true); expect(inventorySignal?.aborted).toBe(true);
    held.resolve(propertyResult()); older.resolve(page.data); await work; await settle(); expect(state.session.view(target).current).toBeUndefined();
    state.session.retry(target); await settle(); expect(state.session.view(target).status).toBe("ready");
  });

  it("acknowledges old depiction errors only after a fresh inventory check and never on reactivation", async () => {
    const state = setup(), target = propertyTarget(); state.session.connect(target); await settle();
    await failDepiction(state, "structure_artifact_conflict"); await state.qualify();
    state.session.retry(target); await settle(); const captured = state.owner.capture(target);
    state.inventoryOwner.deactivate(); state.inventoryOwner.activate();
    expect(captured()).toBe(true); expect(state.session.view(target).status).toBe("ready");
    expect(state.api.read).toHaveBeenCalledTimes(2);
  });
});
