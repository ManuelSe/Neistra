import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { getLigandInventoryOwner, type LigandInventoryOwner, type VerifiedArtifactSource } from "../ligands/inventoryQualification";
import { unresolvedLigandDesignation, type LigandCandidatesRead } from "../ligands/types";

const resources: { client: QueryClient; owner: LigandInventoryOwner }[] = [];
afterEach(() => { resources.splice(0).forEach(({ client, owner }) => { owner.deactivate(); client.clear(); }); });
const source: VerifiedArtifactSource = { projectId: "project", entryId: "entry", currentArtifactId: "current", originalArtifactId: "original" };
const sourceKey = (value: VerifiedArtifactSource) => JSON.stringify([value.projectId, value.entryId, value.currentArtifactId, value.originalArtifactId]);
function page(value = source, offset = 0) {
  const key = ["ligand-candidates", "ligand-instance-v3", value.projectId, value.entryId, value.currentArtifactId, value.originalArtifactId,
    "ligand-exact-representation-v2", "ligand-occurrence-v1", "designation", offset, 12];
  const data: LigandCandidatesRead = { project_id: value.projectId, entry_id: value.entryId, artifact_id: value.currentArtifactId,
    resolver_version: "ligand-instance-v3", designation: unresolvedLigandDesignation(), input_hash: "inventory", offset, limit: 12,
    total: 0, candidates: [], selectable_candidate_keys: [], designated_candidate: null, warnings: [] };
  return { key, data };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const owner = getLigandInventoryOwner(client); resources.push({ client, owner }); return { client, owner };
}
function deferred<T>() {
  let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve };
}
const qualify = (client: QueryClient, value = page()) => client.fetchQuery({ queryKey: value.key, staleTime: 0, queryFn: () => Promise.resolve(value.data) });

describe("explicit bounded source-failure facts", () => {
  it.each([
    ["structure_artifact_conflict", 409, null], ["artifact_integrity_error", 409, "current"],
    ["artifact_integrity_error", 409, "original"], ["artifact_not_found", 404, "current"], ["artifact_not_found", 404, "original"],
  ] as const)("routes supported depiction source failure %s/%s/%s through the common fact boundary", async (code, status, role) => {
    const { client, owner } = setup(); await qualify(client);
    const key = ["ligand-depiction", "ligand-instance-v3", "ligand-2d-v1", "committed", source.projectId, source.entryId,
      source.currentArtifactId, source.originalArtifactId, "ligand-exact-representation-v2", "inventory", "candidate", 240, 180];
    const events: unknown[] = []; const stop = owner.subscribeVerificationFailures(event => { events.push(event); });
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiError(status, code, "Controlled source failure", [], [], null, role)) }).catch(() => undefined);
    stop(); expect(events).toHaveLength(1); expect(owner.qualification(sourceKey(source)).blocked).toBe(true);
    await qualify(client); expect(owner.qualification(sourceKey(source)).blocked).toBe(false);
  });

  it.each(["derived", "transport", "invalid role", "invalid identity", "other identity", "preview", "old policy"])("keeps %s depiction errors local", async mode => {
    const { client, owner } = setup(); await qualify(client);
    const key = ["ligand-depiction", "ligand-instance-v3", "ligand-2d-v1", mode === "preview" ? "preview-unavailable" : "committed", source.projectId, source.entryId,
      source.currentArtifactId, source.originalArtifactId, mode === "old policy" ? "old" : "ligand-exact-representation-v2", "inventory", "candidate", 240, 180];
    const error = new ApiError(mode === "transport" ? 503 : 409, mode === "transport" ? "network_error" : "artifact_integrity_error", "Controlled local error", [], [], null,
      mode === "derived" || mode === "transport" ? null : "current",
      mode === "invalid identity" ? { kind: "invalid" } : mode === "other identity" ? { kind: "valid", identity: {
        project_id: "another-project", entry_id: source.entryId, current_artifact_id: source.currentArtifactId, original_artifact_id: source.originalArtifactId,
      } } : { kind: "absent" }, mode === "invalid role");
    const events: unknown[] = []; const stop = owner.subscribeVerificationFailures(event => { events.push(event); });
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(error) }).catch(() => undefined); stop();
    expect(events).toHaveLength(0); expect(owner.qualification(sourceKey(source)).blocked).toBe(false);
  });

  it("installs the barrier and emits before retiring held same-source checks; only a fresh candidate check recovers", async () => {
    const { client, owner } = setup(), current = page(), other = page({ ...source, entryId: "other" });
    await qualify(client); await qualify(client, other);
    const old = deferred<LigandCandidatesRead>(), pending = page(source, 12); let signal: AbortSignal | undefined;
    const work = client.fetchQuery({ queryKey: pending.key, queryFn: context => { signal = context.signal; return old.promise; } }).catch(() => undefined);
    let observed = false;
    const stop = owner.subscribeVerificationFailures(failure => {
      observed = true; expect(failure.source).toEqual(source); expect(failure.reason).toBe("artifact_unavailable");
      expect(owner.qualification(sourceKey(source)).blocked).toBe(true); expect(signal?.aborted).toBe(false);
    });
    owner.recordSourceFailure({ source, reason: "artifact_unavailable" }); stop();
    expect(observed).toBe(true); expect(signal?.aborted).toBe(true); expect(owner.qualification(sourceKey({ ...source, entryId: "other" })).blocked).toBe(false);
    old.resolve(pending.data); await work; client.setQueryData(current.key, current.data);
    expect(owner.qualification(sourceKey(source)).blocked).toBe(true);
    const depiction = ["ligand-depiction", "ligand-instance-v3", "ligand-2d-v1", "committed", source.projectId, source.entryId,
      source.currentArtifactId, source.originalArtifactId, "ligand-exact-representation-v2", "inventory", "candidate", 240, 180];
    await client.fetchQuery({ queryKey: depiction, queryFn: () => Promise.resolve({ status: "ready" }) });
    expect(owner.qualification(sourceKey(source)).blocked).toBe(true);
    await qualify(client); expect(owner.qualification(sourceKey(source)).blocked).toBe(false);
    owner.deactivate(); owner.activate(); expect(owner.qualification(sourceKey(source)).blocked).toBe(false);
  });

  it("keeps delayed A failure source-only and bounds thousands of explicit facts after query removal", async () => {
    const { client, owner } = setup(), b = { ...source, currentArtifactId: "B" };
    await qualify(client, page(b));
    for (let i = 0; i < 2000; i++) {
      const a = { ...source, entryId: `A-${i}` };
      owner.recordSourceFailure({ source: a, reason: "source_conflict" });
      expect(owner.retention().records).toBeLessThanOrEqual(128); expect(owner.retention().sourceKeyBytes).toBeLessThanOrEqual(65536);
      const value = page(a); await qualify(client, value); client.removeQueries({ queryKey: value.key, exact: true });
    }
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    expect(owner.retention().unknownRequiresCheck).toBe(true);
    // B may have been conservatively evicted, but no unrelated query was cancelled or removed.
    expect(client.getQueryData(page(b).key)).toEqual(page(b).data);
    await qualify(client, page(b)); expect(owner.qualification(sourceKey(b)).blocked).toBe(false);
    owner.recordSourceFailure({ source, reason: "artifact_unavailable" });
    expect(owner.qualification(sourceKey(b)).blocked).toBe(false); expect(owner.qualification(sourceKey(source)).blocked).toBe(true);
  });
});
