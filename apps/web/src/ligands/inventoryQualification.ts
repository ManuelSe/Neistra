import { isCancelledError, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import type { Entry, Project } from "../api/types";
import { ApiError } from "../api/client";
import type { LigandCandidatesRead } from "./types";

export const INVENTORY_POLICY = "ligand-instance-v3";
export const INVENTORY_CHEMISTRY_POLICY = "ligand-exact-representation-v2";
export const INVENTORY_OCCURRENCE_POLICY = "ligand-occurrence-v1";
export const MAX_INVENTORY_SOURCE_RECORDS = 128;
export const MAX_INVENTORY_SOURCE_KEY_BYTES = 64 * 1024;
export type InventoryRecovery = "source_conflict" | "artifact_unavailable" | "retry_required";
export interface InventoryQualification { readonly blocked: boolean; readonly error: InventoryRecovery | undefined }
export interface VerifiedArtifactSource {
  projectId: string; entryId: string; currentArtifactId: string | null; originalArtifactId: string | null;
}
export interface InventoryVerificationFailure {
  source: VerifiedArtifactSource; token: object; reason: "source_conflict" | "artifact_unavailable";
}
export interface VerifiedSourceFailure {
  source: VerifiedArtifactSource; reason: "source_conflict" | "artifact_unavailable";
}
export function captureArtifactSource(projectId: string, entry: Pick<Entry, "id" | "current_artifact_id" | "original_artifact_id">): VerifiedArtifactSource {
  return { projectId, entryId: entry.id, currentArtifactId: entry.current_artifact_id, originalArtifactId: entry.original_artifact_id };
}
export function sameVerifiedArtifactSource(left: VerifiedArtifactSource, right: VerifiedArtifactSource): boolean {
  return left.projectId === right.projectId && left.entryId === right.entryId
    && left.currentArtifactId === right.currentArtifactId && left.originalArtifactId === right.originalArtifactId;
}
function suppliedIdentityMatches(error: ApiError, source: VerifiedArtifactSource): boolean {
  if (error.sourceIdentity.kind === "invalid") return false;
  if (error.sourceIdentity.kind === "absent") return true;
  const identity = error.sourceIdentity.identity;
  return sameVerifiedArtifactSource(source, { projectId: identity.project_id, entryId: identity.entry_id,
    currentArtifactId: identity.current_artifact_id, originalArtifactId: identity.original_artifact_id });
}
function physicalReason(error: ApiError): VerifiedSourceFailure["reason"] | null {
  if (error.status === 409 && error.code === "structure_artifact_conflict") return "source_conflict";
  if (error.status === 409 && error.code === "artifact_integrity_error" || error.status === 404 && error.code === "artifact_not_found") return "artifact_unavailable";
  return null;
}
function taggedReadMatches(error: ApiError, source: VerifiedArtifactSource): boolean {
  return error.sourceVerification === "current" && source.currentArtifactId !== null
    || error.sourceVerification === "original" && source.originalArtifactId !== null;
}
export function ligandOperationSourceFailure(error: unknown, sources: readonly VerifiedArtifactSource[], operation: "use" | "clear" | "resolve"): VerifiedSourceFailure | null {
  if (!(error instanceof ApiError) || error.sourceIdentity.kind === "invalid" || error.sourceVerificationInvalid) return null;
  const reason = physicalReason(error);
  if (!reason) return null;
  const source = sources.find(candidate => suppliedIdentityMatches(error, candidate));
  if (!source) return null;
  if (operation === "resolve") {
    return error.sourceIdentity.kind === "valid" && taggedReadMatches(error, source) ? { source, reason } : null;
  }
  if (sources.length !== 1) return null;
  if (operation === "clear") {
    return reason === "source_conflict" && error.sourceVerification === "current"
      && error.sourceIdentity.kind === "absent" ? { source, reason } : null;
  }
  if (reason === "source_conflict") {
    // The same public code also reports semantic inventory-hash rejection.
    // Only the producer's physical current/original boundary establishes proof.
    return error.sourceVerification === "current" && error.sourceIdentity.kind === "absent"
      || taggedReadMatches(error, source) ? { source, reason } : null;
  }
  // Legacy Use has one molecular-input reader and no derived artifact readers.
  // Clear performs no molecular reads and cannot inherit this compatibility path.
  return error.sourceVerification === null || taggedReadMatches(error, source) ? { source, reason } : null;
}

interface InventoryQuery {
  readonly queryKey: readonly unknown[];
  readonly state: { readonly data: unknown; readonly error: unknown; readonly status: string;
    readonly errorUpdateCount: number; readonly fetchStatus: string };
}
interface SourceBarrier { token: object; blocked: boolean; recovery: InventoryRecovery | undefined; bytes: number }
function keyBytes(source: string): number | null {
  if (source.length > MAX_INVENTORY_SOURCE_KEY_BYTES) return null;
  const bytes = new TextEncoder().encode(source).byteLength;
  return bytes <= MAX_INVENTORY_SOURCE_KEY_BYTES ? bytes : null;
}
function recoveryFor(error: unknown): InventoryRecovery {
  if (error instanceof ApiError && error.status === 409 && error.code === "structure_artifact_conflict") return "source_conflict";
  if (error instanceof ApiError && ["artifact_integrity_error", "artifact_not_found"].includes(error.code)) return "artifact_unavailable";
  return "retry_required";
}
const declined: InventoryQualification = Object.freeze({ blocked: true, error: "retry_required" });
export function inventorySourceKey(project: Pick<Project, "id">, entry: Pick<Entry, "id" | "current_artifact_id" | "original_artifact_id">): string {
  return JSON.stringify([project.id, entry.id, entry.current_artifact_id, entry.original_artifact_id]);
}
interface SourceQuery {
  channel: "inventory" | "depiction"; key: string; identity: VerifiedArtifactSource;
}
function querySource(query: InventoryQuery): SourceQuery | null {
  const key = query.queryKey;
  let channel: SourceQuery["channel"], offset: number;
  if (key[0] === "ligand-candidates" && key[1] === INVENTORY_POLICY && key[6] === INVENTORY_CHEMISTRY_POLICY
    && key[7] === INVENTORY_OCCURRENCE_POLICY) { channel = "inventory"; offset = 2; }
  else if (key.length === 13 && key[0] === "ligand-depiction" && key[1] === INVENTORY_POLICY
    && key[2] === "ligand-2d-v1" && key[3] === "committed" && key[8] === INVENTORY_CHEMISTRY_POLICY
    && typeof key[9] === "string" && typeof key[10] === "string" && key[11] === 240 && key[12] === 180) {
    channel = "depiction"; offset = 4;
  } else return null;
  const [projectId, entryId, currentArtifactId, originalArtifactId] = key.slice(offset, offset + 4);
  if (typeof projectId !== "string" || typeof entryId !== "string"
    || (typeof currentArtifactId !== "string" && currentArtifactId !== null)
    || (typeof originalArtifactId !== "string" && originalArtifactId !== null)) return null;
  return { channel, key: JSON.stringify([projectId, entryId, currentArtifactId, originalArtifactId]),
    identity: { projectId, entryId, currentArtifactId, originalArtifactId } };
}
function queryRecovery(source: SourceQuery, error: unknown): InventoryRecovery | null {
  if (source.channel === "inventory") {
    return error instanceof ApiError && (error.sourceVerificationInvalid || !suppliedIdentityMatches(error, source.identity)) ? "retry_required" : recoveryFor(error);
  }
  // Depiction artifact errors may concern a derived SVG. Only the producer's
  // typed molecular-input provenance can make those failures source authority.
  if (!(error instanceof ApiError)) return null;
  if (error.sourceVerificationInvalid || !suppliedIdentityMatches(error, source.identity)) return null;
  if (error.status === 409 && error.code === "structure_artifact_conflict") return "source_conflict";
  if ((error.sourceVerification === "current" && source.identity.currentArtifactId !== null
    || error.sourceVerification === "original" && source.identity.originalArtifactId !== null)
    && (error.code === "artifact_integrity_error" && error.status === 409
      || error.code === "artifact_not_found" && error.status === 404)) return "artifact_unavailable";
  return null;
}
function matchingInventory(query: InventoryQuery): boolean {
  const data = query.state.data as LigandCandidatesRead | undefined;
  return !!data && data.project_id === query.queryKey[2] && data.entry_id === query.queryKey[3]
    && data.artifact_id === query.queryKey[4] && data.resolver_version === INVENTORY_POLICY;
}

/** Bounded source qualification facts and request-start tokens only; never molecular values.
 * A late success cannot requalify a check that began before a known failure.
 */
export class LigandInventoryOwner {
  private readonly barriers = new Map<string, SourceBarrier>();
  private readonly starts = new WeakMap<object, object>();
  private retainedKeyBytes = 0;
  private unknownRequiresCheck = false;
  private readonly observedErrors = new WeakMap<object, number>();
  private readonly listeners = new Set<() => void>();
  private readonly verificationListeners = new Set<(failure: InventoryVerificationFailure) => void>();
  private release: (() => void) | null = null;
  private revision = 0;
  constructor(private readonly client: QueryClient) { this.scanErrors(); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeVerificationFailures = (listener: (failure: InventoryVerificationFailure) => void) => {
    this.verificationListeners.add(listener); return () => { this.verificationListeners.delete(listener); };
  };
  snapshot = () => this.revision;
  private notify() { this.revision++; for (const listener of this.listeners) listener(); }
  private touch(source: string, barrier: SourceBarrier) {
    this.barriers.delete(source); this.barriers.set(source, barrier);
  }
  private admit(source: string): { barrier: SourceBarrier | undefined; evicted: boolean } {
    const existing = this.barriers.get(source);
    if (existing) { this.touch(source, existing); return { barrier: existing, evicted: false }; }
    const bytes = keyBytes(source);
    if (bytes === null) return { barrier: undefined, evicted: false };
    let evicted = false;
    while (this.barriers.size >= MAX_INVENTORY_SOURCE_RECORDS || this.retainedKeyBytes + bytes > MAX_INVENTORY_SOURCE_KEY_BYTES) {
      const oldest = this.barriers.entries().next().value!;
      this.barriers.delete(oldest[0]); this.retainedKeyBytes -= oldest[1].bytes;
      this.unknownRequiresCheck = true; evicted = true;
    }
    const barrier: SourceBarrier = { token: Object.freeze({}), blocked: this.unknownRequiresCheck,
      recovery: this.unknownRequiresCheck ? "retry_required" : undefined, bytes };
    this.barriers.set(source, barrier); this.retainedKeyBytes += bytes;
    return { barrier, evicted };
  }
  private recordFailure(source: VerifiedArtifactSource, reason: InventoryRecovery) {
    const key = JSON.stringify([source.projectId, source.entryId, source.currentArtifactId, source.originalArtifactId]);
    const { barrier } = this.admit(key);
    const token = Object.freeze({});
    if (barrier) { barrier.token = token; barrier.blocked = true; barrier.recovery = reason; }
    // Revoke downstream authority after the barrier, before cancellation or presentation publication.
    // Generic errors and metadata admission failures carry no physical-source failure authority.
    if (reason !== "retry_required") {
      const failure: InventoryVerificationFailure = { token, reason, source };
      for (const listener of this.verificationListeners) listener(failure);
    }
    this.retire(key); this.notify();
  }
  recordSourceFailure = (proof: VerifiedSourceFailure) => { this.recordFailure(proof.source, proof.reason); };
  private fail(query: InventoryQuery, source: SourceQuery, reason: InventoryRecovery) {
    this.observedErrors.set(query, query.state.errorUpdateCount);
    this.recordFailure(source.identity, reason);
  }
  private scanErrors() {
    for (const query of this.client.getQueryCache().getAll()) {
      const source = querySource(query), count = query.state.errorUpdateCount;
      if (!source || isCancelledError(query.state.error) || (query.state.status !== "error" && !count)
        || this.observedErrors.get(query) === count) continue;
      const reason = queryRecovery(source, query.state.error);
      if (reason === null) continue;
      this.fail(query, source, reason);
    }
  }
  private retire(source: string) {
    // TanStack cancels matching retryers synchronously before returning this promise.
    // Keep the token guard too: cancellation never qualifies a cached response.
    void this.client.cancelQueries({ predicate: query => querySource(query)?.key === source && query.state.fetchStatus !== "idle" });
  }
  activate = () => {
    if (this.release) return;
    this.release = this.client.getQueryCache().subscribe(event => {
      if (event.type !== "updated") return;
      const query = event.query, source = querySource(query);
      if (!source) return;
      if (event.action.type === "fetch") {
        if (source.channel !== "inventory") return;
        const { barrier, evicted } = this.admit(source.key);
        if (barrier) this.starts.set(query, barrier.token); else this.starts.delete(query);
        if (evicted) this.notify();
      } else if (event.action.type === "error" && !isCancelledError(event.action.error)) {
        const reason = queryRecovery(source, event.action.error);
        if (reason === null) return;
        this.fail(query, source, reason);
      } else if (event.action.type === "success" && !event.action.manual) {
        if (source.channel !== "inventory") return;
        const barrier = this.barriers.get(source.key);
        if (!barrier?.blocked || this.starts.get(query) !== barrier.token || !matchingInventory(query)) return;
        // Only a check begun after the latest failure acknowledges older error visits.
        for (const previous of this.client.getQueryCache().getAll()) if (querySource(previous)?.key === source.key && previous.state.errorUpdateCount) {
          this.observedErrors.set(previous, previous.state.errorUpdateCount);
        }
        barrier.blocked = false; barrier.recovery = undefined; this.touch(source.key, barrier); this.notify();
      }
    });
    this.scanErrors();
    for (const [source, barrier] of [...this.barriers]) if (barrier.blocked) this.retire(source);
  };
  deactivate = () => { this.release?.(); this.release = null; };
  retention() {
    return Object.freeze({ records: this.barriers.size, sourceKeyBytes: this.retainedKeyBytes,
      unknownRequiresCheck: this.unknownRequiresCheck });
  }
  qualification(source: string): InventoryQualification {
    if (keyBytes(source) === null) return declined;
    const isBlocked = () => this.barriers.get(source)?.blocked ?? this.unknownRequiresCheck;
    const recovery = (): InventoryRecovery | undefined => {
      const barrier = this.barriers.get(source);
      return barrier ? barrier.recovery : this.unknownRequiresCheck ? "retry_required" : undefined;
    };
    return { get blocked() { return isBlocked(); }, get error() { return recovery(); } };
  }
}
const clientOwners = new WeakMap<QueryClient, LigandInventoryOwner>();
export function getLigandInventoryOwner(client: QueryClient): LigandInventoryOwner {
  let owner = clientOwners.get(client);
  if (!owner) { owner = new LigandInventoryOwner(client); clientOwners.set(client, owner); }
  // The QueryClient owns this fallback lifetime, independently of responsive presenters.
  owner.activate();
  return owner;
}
export function useInventoryQualification(project: Project | undefined, entry: Entry | undefined, supplied?: LigandInventoryOwner): InventoryQualification {
  const client = useQueryClient(), owner = supplied ?? getLigandInventoryOwner(client);
  useSyncExternalStore(owner.subscribe, owner.snapshot);
  useLayoutEffect(() => { owner.activate(); }, [owner]);
  const source = project && entry ? inventorySourceKey(project, entry) : "";
  return useMemo(() => owner.qualification(source), [owner, source]);
}
