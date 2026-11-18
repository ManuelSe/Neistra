import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { getLigandInventoryOwner, MAX_INVENTORY_SOURCE_KEY_BYTES, MAX_INVENTORY_SOURCE_RECORDS,
  type LigandInventoryOwner } from "../ligands/inventoryQualification";
import { unresolvedLigandDesignation, type LigandCandidatesRead } from "../ligands/types";

const resources: { client: QueryClient; owner: LigandInventoryOwner }[] = [];
afterEach(() => { resources.splice(0).forEach(({ client, owner }) => { owner.deactivate(); client.clear(); }); });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const owner = getLigandInventoryOwner(client); resources.push({ client, owner }); return { client, owner };
}
function source(index: number, padding = "") {
  const projectId = `project-${index}`, entryId = `entry-${index}${padding}`, artifactId = `artifact-${index}`, originalId = `original-${index}`;
  const key = ["ligand-candidates", "ligand-instance-v3", projectId, entryId, artifactId, originalId,
    "ligand-exact-representation-v2", "ligand-occurrence-v1", "designation", 0, 12] as const;
  const data: LigandCandidatesRead = { project_id: projectId, entry_id: entryId, artifact_id: artifactId,
    resolver_version: "ligand-instance-v3", designation: unresolvedLigandDesignation(), input_hash: `inventory-${index}`,
    total: 0, offset: 0, limit: 12, candidates: [], selectable_candidate_keys: [], designated_candidate: null, warnings: [] };
  return { key, data, source: JSON.stringify([projectId, entryId, artifactId, originalId]) };
}
function page(value: ReturnType<typeof source>, offset: number) {
  return { ...value, key: [...value.key.slice(0, 9), offset, 12], data: { ...value.data, offset } };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
}
function records(owner: LigandInventoryOwner): Map<string, Record<string, unknown>> {
  const value: unknown = Reflect.get(owner, "barriers");
  if (!(value instanceof Map)) throw new Error("Qualification metadata collection is unavailable for independent byte accounting.");
  return value as Map<string, Record<string, unknown>>;
}
function assertBudget(owner: LigandInventoryOwner, forbidden?: unknown) {
  const entries = [...records(owner)], bytes = entries.reduce((sum, [key]) => sum + new TextEncoder().encode(key).byteLength, 0);
  expect(entries.length).toBeLessThanOrEqual(128); expect(bytes).toBeLessThanOrEqual(65_536);
  expect(owner.retention().records).toBe(entries.length); expect(owner.retention().sourceKeyBytes).toBe(bytes);
  for (const [, record] of entries) {
    expect(Object.keys(record).sort()).toEqual(["blocked", "bytes", "recovery", "token"]);
    expect([undefined, "source_conflict", "artifact_unavailable", "retry_required"]).toContain(record.recovery);
    for (const value of Object.values(record)) { expect(value).not.toBeInstanceOf(Error); if (forbidden) expect(value).not.toBe(forbidden); }
    expect(record.token).toEqual({}); expect(Object.isFrozen(record.token)).toBe(true);
  }
  return { records: entries.length, bytes };
}
const qualify = (client: QueryClient, value: ReturnType<typeof source>) => client.fetchQuery({ queryKey: value.key,
  staleTime: 0, queryFn: () => Promise.resolve(value.data) });

describe("bounded installed inventory qualification owner", () => {
  for (const recovered of [false, true]) for (const wide of [false, true]) {
    it(`bounds 2000 ${recovered ? "failed/recovered" : "failed"}/removed sources with ${wide ? "UTF-8 byte pressure" : "record pressure"}`, async () => {
      const { client, owner } = setup(), error = new Error("Failure with an intentionally large original graph", {
        cause: { warnings: Array.from({ length: 1000 }, () => "original response warning") },
      });
      expect(MAX_INVENTORY_SOURCE_RECORDS).toBe(128); expect(MAX_INVENTORY_SOURCE_KEY_BYTES).toBe(65_536);
      for (let i = 0; i < 2000; i++) {
        const current = source(i, wide ? "🙂".repeat(300) : "");
        await client.fetchQuery({ queryKey: current.key, queryFn: () => Promise.reject(error) }).catch(() => undefined);
        expect(owner.qualification(current.source).blocked).toBe(true);
        if (recovered) { await qualify(client, current); expect(owner.qualification(current.source).blocked).toBe(false); }
        client.removeQueries({ queryKey: current.key, exact: true });
        expect(owner.retention().records).toBeLessThanOrEqual(128); expect(owner.retention().sourceKeyBytes).toBeLessThanOrEqual(65_536);
      }
      expect(client.getQueryCache().getAll()).toHaveLength(0); const retained = assertBudget(owner, error);
      if (wide) expect(retained.records).toBeLessThan(128); else expect(retained.records).toBe(128);
      expect(owner.retention().unknownRequiresCheck).toBe(true);
      const old = source(0, wide ? "🙂".repeat(300) : "");
      expect(owner.qualification(old.source).blocked).toBe(true);
      const before = owner.retention(); client.setQueryData(old.key, old.data);
      expect(owner.retention()).toEqual(before); expect(owner.qualification(old.source).blocked).toBe(true);
      client.clear(); owner.deactivate();
      expect(getLigandInventoryOwner(client)).toBe(owner); expect(owner.retention()).toEqual(before);
      client.setQueryData(old.key, old.data); expect(owner.qualification(old.source).blocked).toBe(true);
      await qualify(client, old); expect(owner.qualification(old.source).blocked).toBe(false); assertBudget(owner, error);
    });
  }

  it("does not recreate evicted failure facts from old or manual cache publications, but accepts a genuine fresh check", async () => {
    const { client, owner } = setup(), lost = source(1);
    await client.fetchQuery({ queryKey: lost.key, queryFn: () => Promise.reject(new ApiError(409, "artifact_integrity_error", "Failed")) }).catch(() => undefined);
    const historical = client.getQueryCache().find({ queryKey: lost.key })!;
    client.removeQueries({ queryKey: lost.key, exact: true });
    for (let i = 2; i <= 130; i++) { const current = source(i); await qualify(client, current); client.removeQueries({ queryKey: current.key, exact: true }); }
    const before = owner.retention(); expect(records(owner).has(lost.source)).toBe(false);
    historical.setData(lost.data); client.setQueryData(lost.key, lost.data);
    expect(owner.retention()).toEqual(before); expect(owner.qualification(lost.source).blocked).toBe(true);
    await qualify(client, lost); expect(owner.qualification(lost.source).blocked).toBe(false); assertBudget(owner);
  });

  it("does not let an old held success cross an eviction/recreation token", async () => {
    const { client, owner } = setup(), current = source(1), older = deferred<LigandCandidatesRead>(); let oldSignal!: AbortSignal;
    const oldWork = client.fetchQuery({ queryKey: current.key, queryFn: ({ signal }) => { oldSignal = signal; return older.promise; } });
    const oldToken = records(owner).get(current.source)!.token;
    for (let i = 2; i <= 129; i++) { const other = source(i); await qualify(client, other); client.removeQueries({ queryKey: other.key, exact: true }); }
    expect(records(owner).has(current.source)).toBe(false); expect(oldSignal.aborted).toBe(false);
    const newer = page(current, 12), fresh = deferred<LigandCandidatesRead>();
    const freshWork = client.fetchQuery({ queryKey: newer.key, queryFn: () => fresh.promise });
    const newToken = records(owner).get(current.source)!.token; expect(newToken).not.toBe(oldToken);
    older.resolve(current.data); await oldWork; expect(owner.qualification(current.source).blocked).toBe(true);
    client.setQueryData(current.key, current.data); expect(owner.qualification(current.source).blocked).toBe(true);
    fresh.resolve(newer.data); await freshWork; expect(owner.qualification(current.source).blocked).toBe(false); assertBudget(owner);
  });

  it("uses a new failure token to retire a pending Retry and requires the next real check", async () => {
    const { client, owner } = setup(), current = source(1), otherPage = page(current, 12);
    await client.fetchQuery({ queryKey: current.key, queryFn: () => Promise.reject(new Error("First failure")) }).catch(() => undefined);
    const firstToken = records(owner).get(current.source)!.token, old = deferred<LigandCandidatesRead>();
    let oldSignal!: AbortSignal;
    const oldWork = client.fetchQuery({ queryKey: current.key, queryFn: ({ signal }) => { oldSignal = signal; return old.promise; } });
    oldWork.catch(() => undefined);
    await client.fetchQuery({ queryKey: otherPage.key, queryFn: () => Promise.reject(new Error("Second failure")) }).catch(() => undefined);
    expect(records(owner).get(current.source)!.token).not.toBe(firstToken); expect(oldSignal.aborted).toBe(true);
    old.resolve(current.data); await oldWork.catch(() => undefined); expect(owner.qualification(current.source).blocked).toBe(true);
    await qualify(client, current); expect(owner.qualification(current.source).blocked).toBe(false);
  });

  it("requires matching source metadata as well as a fresh admitted fetch token", async () => {
    const { client, owner } = setup();
    for (let i = 0; i < 129; i++) { const current = source(i); await qualify(client, current); client.removeQueries({ queryKey: current.key, exact: true }); }
    const current = source(0);
    await client.fetchQuery({ queryKey: current.key, queryFn: () => Promise.resolve({ ...current.data, entry_id: "different-entry" }) });
    expect(owner.qualification(current.source).blocked).toBe(true);
    client.setQueryData(current.key, current.data); expect(owner.qualification(current.source).blocked).toBe(true);
    await qualify(client, current); expect(owner.qualification(current.source).blocked).toBe(false);
  });

  it("keeps weak recovered-error acknowledgements through manual data and reactivation", async () => {
    const { client, owner } = setup(), current = source(1);
    await client.fetchQuery({ queryKey: current.key, queryFn: () => Promise.reject(new Error("Failed once")) }).catch(() => undefined);
    await qualify(client, current); const token = records(owner).get(current.source)!.token;
    owner.deactivate(); client.setQueryData(current.key, current.data); owner.activate();
    expect(owner.qualification(current.source).blocked).toBe(false); expect(records(owner).get(current.source)!.token).toBe(token);
    owner.deactivate(); owner.activate(); expect(owner.qualification(current.source).blocked).toBe(false);
  });

  it("preserves retained unrelated qualification and work when metadata for an older source is evicted", async () => {
    const { client, owner } = setup(), failed = source(1), retained = source(2);
    await client.fetchQuery({ queryKey: failed.key, queryFn: () => Promise.reject(new Error("Old failure")) }).catch(() => undefined);
    await qualify(client, retained); const pending = deferred<LigandCandidatesRead>(); let signal!: AbortSignal;
    const work = client.fetchQuery({ queryKey: retained.key, queryFn: ({ signal: current }) => { signal = current; return pending.promise; } });
    for (let i = 3; i <= 129; i++) { const current = source(i); await qualify(client, current); client.removeQueries({ queryKey: current.key, exact: true }); }
    expect(records(owner).has(failed.source)).toBe(false); expect(owner.qualification(failed.source).blocked).toBe(true);
    expect(owner.qualification(retained.source).blocked).toBe(false); expect(signal.aborted).toBe(false);
    pending.resolve(retained.data); await work; expect(owner.qualification(retained.source).blocked).toBe(false); assertBudget(owner);
  });

  it("declines oversized UTF-8 source keys without admitting metadata or recovering from publication", async () => {
    const { client, owner } = setup(), current = source(1, "界".repeat(24_000));
    expect(current.source.length).toBeLessThan(65_536); expect(new TextEncoder().encode(current.source).byteLength).toBeGreaterThan(65_536);
    expect(owner.qualification(current.source).blocked).toBe(true); expect(owner.qualification(current.source).error).toBe("retry_required");
    await qualify(client, current); client.setQueryData(current.key, current.data);
    expect(owner.retention().records).toBe(0); expect(owner.retention().sourceKeyBytes).toBe(0);
    expect(owner.qualification(current.source).blocked).toBe(true);
    const ordinary = source(2); await qualify(client, ordinary); expect(owner.qualification(ordinary.source).blocked).toBe(false);
  });

  for (const [code, classification] of [["structure_artifact_conflict", "source_conflict"], ["artifact_integrity_error", "artifact_unavailable"],
    ["artifact_not_found", "artifact_unavailable"], ["unexpected_failure", "retry_required"]] as const) {
    it(`retains only the bounded ${classification} classification for ${code}`, async () => {
      const { client, owner } = setup(), current = source(1), error = new ApiError(409, code, "Original response text".repeat(1000));
      await client.fetchQuery({ queryKey: current.key, queryFn: () => Promise.reject(error) }).catch(() => undefined);
      expect(owner.qualification(current.source).error).toBe(classification); assertBudget(owner, error);
      expect(client.getQueryState(current.key)?.error).toBe(error);
    });
  }
});
