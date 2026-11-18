import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Entry, Project } from "../api/types";
import { ligandApi } from "./api";
import type { LigandCandidate, LigandCandidatesRead, LigandDepictionRead } from "./types";

import { INVENTORY_POLICY, INVENTORY_CHEMISTRY_POLICY, INVENTORY_OCCURRENCE_POLICY,
  getLigandInventoryOwner, useInventoryQualification, type LigandInventoryOwner, type InventoryQualification } from "./inventoryQualification";
export { LigandInventoryOwner, getLigandInventoryOwner, useInventoryQualification } from "./inventoryQualification";
export type { InventoryQualification } from "./inventoryQualification";

export const PAGE_SIZE = 12;
export const POLICY = INVENTORY_POLICY;
const CHEMISTRY_POLICY = INVENTORY_CHEMISTRY_POLICY;
const DRAWING_POLICY = "ligand-2d-v1";
const OCCURRENCE_POLICY = INVENTORY_OCCURRENCE_POLICY;
const abortError = () => new DOMException("The depiction request was cancelled", "AbortError");

// Keep visible-page requests within the backend's two-drawing admission limit.
// Queued requests retain only closures and are removed immediately on retirement.
let activeDrawings = 0;
const drawingQueue: (() => void)[] = [];
export function queuedDepiction<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let started = false, settled = false;
    const complete = (outcome: { value: T } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      if (started) { activeDrawings--; drawingQueue.shift()?.(); }
      if ("error" in outcome) reject(outcome.error instanceof Error ? outcome.error : new Error("The depiction request failed."));
      else resolve(outcome.value);
    };
    const abort = () => {
      if (!started) {
        const index = drawingQueue.indexOf(start);
        if (index >= 0) drawingQueue.splice(index, 1);
      }
      complete({ error: abortError() });
    };
    const start = () => {
      if (signal.aborted) { abort(); return; }
      started = true;
      activeDrawings++;
      void Promise.resolve().then(() => {
        if (signal.aborted) throw abortError();
        return operation();
      }).then(
        value => complete({ value }), error => complete({ error }),
      );
    };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    if (activeDrawings < 2) start();
    else if (drawingQueue.length < 24) drawingQueue.push(start);
    else complete({ error: new Error("Other depictions are still loading. Try again.") });
  });
}

export function sourceKey(project: Project, entry: Entry) {
  return JSON.stringify([project.id, entry.id, entry.current_artifact_id, entry.original_artifact_id]);
}
export function designationKey(entry: Entry) {
  const value = entry.ligand_designation;
  return JSON.stringify([value.status, value.instance_id, value.origin, value.selected_at,
    value.resolver_version, value.assessed_at, value.assessed_revision]);
}
export function transientOccurrenceCounts(data: LigandCandidatesRead | undefined): boolean {
  return data?.candidates.some(candidate => candidate.occurrence_count === null
    && (candidate.occurrence_reason === "occurrence_work_busy" || candidate.occurrence_reason === "occurrence_work_limit")) ?? false;
}

export function inventoryOptions(project: Project, entry: Entry, offset: number, qualification?: InventoryQualification) {
  return {
    queryKey: ["ligand-candidates", POLICY, project.id, entry.id, entry.current_artifact_id,
      entry.original_artifact_id, CHEMISTRY_POLICY, OCCURRENCE_POLICY, designationKey(entry), offset, PAGE_SIZE],
    queryFn: ({ signal }: { signal: AbortSignal }) => ligandApi.candidates(project.id, entry, offset, signal),
    staleTime: (query: { state: { data: LigandCandidatesRead | undefined } }) => qualification?.blocked || transientOccurrenceCounts(query.state.data) ? 0 : Infinity,
    gcTime: 60_000,
    retry: false,
  };
}
export function currentInventory(data: LigandCandidatesRead | undefined, project: Project, entry: Entry) {
  return data?.project_id === project.id && data.entry_id === entry.id
    && data.artifact_id === entry.current_artifact_id && data.resolver_version === POLICY ? data : undefined;
}

function canonicalMembers(ids: number[]): boolean {
  return ids.length > 0 && ids.every((id, index) => Number.isSafeInteger(id) && id > 0 && (index === 0 || id > ids[index - 1]));
}
export function currentDesignatedCandidate(data: LigandCandidatesRead | undefined, project: Project, entry: Entry): LigandCandidate | undefined {
  const inventory = currentInventory(data, project, entry), designation = entry.ligand_designation, reported = inventory?.designation;
  const candidate = inventory?.offset === 0 ? inventory.designated_candidate : null;
  return designation.status === "resolved" && !!designation.instance_id && !!designation.source_artifact_id
    && designation.source_artifact_id === entry.current_artifact_id && reported?.status === "resolved"
    && reported.instance_id === designation.instance_id && reported.source_artifact_id === designation.source_artifact_id
    && designationKey({ ...entry, ligand_designation: reported }) === designationKey(entry)
    && candidate && canonicalMembers(designation.atom_ids) && canonicalMembers(reported.atom_ids) && canonicalMembers(candidate.atom_ids)
    && reported.atom_ids.length === designation.atom_ids.length && candidate.atom_ids.length === designation.atom_ids.length
    && designation.atom_ids.every((id, index) => id === candidate.atom_ids[index] && id === reported.atom_ids[index]) ? candidate : undefined;
}
export function depictionOptions(project: Project, entry: Entry, inventory: LigandCandidatesRead | undefined,
  candidate: LigandCandidate | undefined, paused: boolean, slot = 0, enabled = true) {
  return { queryKey: ["ligand-depiction", POLICY, DRAWING_POLICY, paused ? "preview-unavailable" : "committed", project.id, entry.id,
    entry.current_artifact_id, entry.original_artifact_id, CHEMISTRY_POLICY, inventory?.input_hash,
    candidate?.candidate_key ?? `unused-${slot}`, 240, 180],
  enabled: enabled && !paused && !!candidate,
  queryFn: ({ signal }: { signal: AbortSignal }) => queuedDepiction(() => {
    if (!candidate) throw new Error("No current ligand instance is available.");
    return ligandApi.depiction(project.id, entry, candidate.candidate_key, signal);
  }, signal), staleTime: Infinity, gcTime: 60_000, retry: false };
}
export function currentDepiction(data: LigandDepictionRead | undefined, entry: Entry, candidate: LigandCandidate | undefined, paused: boolean) {
  return !paused && candidate && data?.entry_id === entry.id && data.artifact_id === entry.current_artifact_id
    && data.candidate_key === candidate.candidate_key && data.implementation === DRAWING_POLICY
    && (data.status !== "ready" || data.input_hash === candidate.chemical_input_hash) ? data : undefined;
}
export interface DesignatedLigandContext {
  readonly key: string; readonly entry: Entry | undefined; readonly inventory: LigandCandidatesRead | undefined;
  readonly candidate: LigandCandidate | undefined; readonly qualification: InventoryQualification;
  readonly owner: LigandInventoryOwner; readonly pausedReason: string | null;
  readonly pending: boolean; readonly error: unknown; readonly retry: () => void;
  readonly drawing: LigandDepictionRead | undefined; readonly drawingPending: boolean; readonly drawingFailed: boolean;
  readonly retryDrawing: () => void; readonly onPublication?: () => void;
}
export function useDesignatedLigandContext({ project, entryId, pausedReason, owner: supplied, depiction = true, onPublication }: {
  project: Project | undefined; entryId: string | null; pausedReason: string | null; owner?: LigandInventoryOwner;
  depiction?: boolean; onPublication?: () => void;
}): DesignatedLigandContext {
  const client = useQueryClient(), owner = supplied ?? getLigandInventoryOwner(client);
  const entry = project?.entries.find(entry => entry.id === entryId), qualification = useInventoryQualification(project, entry, owner);
  const summary = useQuery(project && entry ? { ...inventoryOptions(project, entry, 0, qualification), enabled: entry.ligand_designation.status === "resolved" }
    : { queryKey: ["ligand-candidates", "unavailable", project?.id ?? null, entryId], queryFn: () => Promise.reject(new Error("Choose a current entry.")), enabled: false });
  const inventory = project && entry && !summary.isError && !qualification.blocked ? currentInventory(summary.data, project, entry) : undefined;
  const candidate = project && entry ? currentDesignatedCandidate(inventory, project, entry) : undefined;
  const drawing = useQuery(project && entry ? depictionOptions(project, entry, inventory, candidate, !!pausedReason, 0,
    depiction && !!candidate && ["qualified", "source_instance"].includes(candidate.boundary_status))
    : { queryKey: ["ligand-depiction", "unavailable", project?.id ?? null, entryId], queryFn: () => Promise.reject(new Error("Choose a current entry.")), enabled: false });
  return { key: project && entry ? `${sourceKey(project, entry)}:${designationKey(entry)}` : "", entry, owner, qualification,
    inventory, candidate, pausedReason, pending: summary.isPending && !!entry && entry.ligand_designation.status === "resolved",
    error: summary.isError ? summary.error : qualification.blocked ? qualification.error ?? new Error("The molecular source needs checking.") : null,
    retry: () => { void summary.refetch({ cancelRefetch: false }); },
    drawing: entry && !drawing.isError ? currentDepiction(drawing.data, entry, candidate, !!pausedReason) : undefined,
    drawingPending: drawing.isFetching, drawingFailed: drawing.isError, retryDrawing: () => { void drawing.refetch(); }, onPublication };
}
