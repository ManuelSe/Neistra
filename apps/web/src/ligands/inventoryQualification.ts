import { isCancelledError, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import type { Entry, Project } from "../api/types";
import type { LigandCandidatesRead } from "./types";

export const INVENTORY_POLICY = "ligand-instance-v3";
export const INVENTORY_CHEMISTRY_POLICY = "ligand-exact-representation-v2";
export const INVENTORY_OCCURRENCE_POLICY = "ligand-occurrence-v1";
export interface InventoryQualification { readonly blocked: boolean; readonly error: unknown }
interface InventoryQuery {
  readonly queryKey: readonly unknown[];
  readonly state: { readonly data: unknown; readonly error: unknown; readonly status: string;
    readonly errorUpdateCount: number; readonly fetchStatus: string };
}
interface SourceBarrier { generation: number; blocked: boolean; error: unknown }
export function inventorySourceKey(project: Pick<Project, "id">, entry: Pick<Entry, "id" | "current_artifact_id" | "original_artifact_id">): string {
  return JSON.stringify([project.id, entry.id, entry.current_artifact_id, entry.original_artifact_id]);
}
function querySource(query: InventoryQuery): string | null {
  const key = query.queryKey;
  return key[0] === "ligand-candidates" && key[1] === INVENTORY_POLICY && key[6] === INVENTORY_CHEMISTRY_POLICY
    && key[7] === INVENTORY_OCCURRENCE_POLICY && typeof key[2] === "string" && typeof key[3] === "string"
    && (typeof key[4] === "string" || key[4] === null) && (typeof key[5] === "string" || key[5] === null)
    ? JSON.stringify(key.slice(2, 6)) : null;
}
function matchingInventory(query: InventoryQuery): boolean {
  const data = query.state.data as LigandCandidatesRead | undefined;
  return !!data && data.project_id === query.queryKey[2] && data.entry_id === query.queryKey[3]
    && data.artifact_id === query.queryKey[4] && data.resolver_version === INVENTORY_POLICY;
}

/** Source failure facts and request-start barriers only; never molecular values.
 * A late success cannot requalify a check that began before a known failure.
 */
export class LigandInventoryOwner {
  private readonly barriers = new Map<string, SourceBarrier>();
  private readonly starts = new WeakMap<object, number>();
  private readonly observedErrors = new WeakMap<object, number>();
  private readonly listeners = new Set<() => void>();
  private release: (() => void) | null = null;
  private revision = 0;
  constructor(private readonly client: QueryClient) { this.scanErrors(); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  private notify() { this.revision++; for (const listener of this.listeners) listener(); }
  private fail(query: InventoryQuery, source: string, error: unknown) {
    const generation = (this.barriers.get(source)?.generation ?? 0) + 1;
    this.barriers.set(source, { generation, blocked: true, error });
    this.observedErrors.set(query, query.state.errorUpdateCount);
  }
  private scanErrors() {
    for (const query of this.client.getQueryCache().getAll()) {
      const source = querySource(query), count = query.state.errorUpdateCount;
      if (!source || isCancelledError(query.state.error) || (query.state.status !== "error" && !count)
        || this.observedErrors.get(query) === count) continue;
      this.fail(query, source, query.state.error); this.notify();
    }
  }
  private retire(source: string) {
    // TanStack cancels matching retryers synchronously before returning this promise.
    // Keep the generation guard too: cancellation never qualifies a cached response.
    void this.client.cancelQueries({ predicate: query => querySource(query) === source && query.state.fetchStatus !== "idle" });
  }
  activate = () => {
    if (this.release) return;
    this.release = this.client.getQueryCache().subscribe(event => {
      if (event.type !== "updated") return;
      const query = event.query, source = querySource(query);
      if (!source) return;
      if (event.action.type === "fetch") {
        this.starts.set(query, this.barriers.get(source)?.generation ?? 0);
      } else if (event.action.type === "error" && !isCancelledError(event.action.error)) {
        this.fail(query, source, event.action.error);
        this.retire(source); this.notify();
      } else if (event.action.type === "success" && !event.action.manual) {
        const barrier = this.barriers.get(source);
        if (!barrier?.blocked || this.starts.get(query) !== barrier.generation || !matchingInventory(query)) return;
        // Only a check begun after the latest failure acknowledges older error visits.
        for (const previous of this.client.getQueryCache().getAll()) if (querySource(previous) === source && previous.state.errorUpdateCount) {
          this.observedErrors.set(previous, previous.state.errorUpdateCount);
        }
        barrier.blocked = false; barrier.error = undefined; this.notify();
      }
    });
    this.scanErrors();
    for (const [source, barrier] of this.barriers) if (barrier.blocked) this.retire(source);
  };
  deactivate = () => { this.release?.(); this.release = null; };
  qualification(source: string): InventoryQualification {
    const barriers = this.barriers;
    return { get blocked() { return barriers.get(source)?.blocked ?? false; },
      get error() { return barriers.get(source)?.error; } };
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
