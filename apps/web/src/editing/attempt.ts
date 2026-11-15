import { ApiError } from "../api/client";
import type { EditAttemptReceipt, HydrogenReconciliationReport, HydrogenReport, MolecularWarning, SelectionEditResult } from "../api/types";

/** An owned submission is reported by App state; a pre-dispatch rejection stays local. */
export class EditApplyError extends Error {
  constructor(error: unknown, readonly attemptId: string | null) {
    super(error instanceof Error ? error.message : "The edit could not be submitted."); this.name = "EditApplyError";
  }
}
export interface EditAttemptIdentity {
  id: string; projectId: string; entryId: string; expectedRevision: number; artifactId: string;
  kind: "model" | "selection"; targetLabel: string; operation: string;
}
export interface EditAttemptFeedback {
  warnings: MolecularWarning[]; report?: HydrogenReport | null; reconciliation?: HydrogenReconciliationReport | null;
}
export interface EditReview {
  revision: number; artifactId: string | null; undo: string | null; redo: string | null;
  /** Exact artifact/lock context remains in memory; never persist this potentially large key. */
  contextKey: string; identityUnavailable?: boolean;
}
export interface PersistedEditReview { revision: number; artifactId: string | null; identityUnavailable?: boolean }
export const compactEditReview = (review: EditReview): PersistedEditReview => ({ revision: review.revision, artifactId: review.artifactId,
  ...(review.identityUnavailable ? { identityUnavailable: true } : {}) });
export interface EditAttemptRecord {
  phase: "idle" | "submitting" | "reconciling" | "saved" | "not_applied" | "unknown";
  identity: EditAttemptIdentity | null; error: string | null; feedback?: EditAttemptFeedback;
  serverInstanceId?: string; committedRevision?: number; committedArtifactId?: string;
  review?: EditReview; acknowledged?: PersistedEditReview;
}
export interface JournalUncertainty {
  id: string; reason: "unreadable_previous_edit_information"; outcome: "unknown";
  acknowledgedProjects: { projectId: string; reviewedContext: PersistedEditReview }[];
}
export interface EditAttemptSnapshot extends EditAttemptRecord {
  previous?: readonly EditAttemptRecord[];
  journalRecovery?: { kind: "invalid" | "unavailable"; markerId: string | null; acknowledged: boolean };
  canReview?: boolean;
}
export interface EditAttemptJournalRow { identity: EditAttemptIdentity; acknowledged?: PersistedEditReview }
export interface EditAttemptJournalEnvelope { schemaVersion: 2; rows: EditAttemptJournalRow[]; uncertainty?: JournalUncertainty }
export type EditAttemptJournalRead = { kind: "absent" } | { kind: "ready"; rows: EditAttemptJournalRow[]; uncertainty?: JournalUncertainty }
  | { kind: "invalid"; rows: EditAttemptJournalRow[] } | { kind: "unavailable" };
export interface EditAttemptJournal { read: () => EditAttemptJournalRead; write: (value: EditAttemptJournalEnvelope) => void }
const idle: EditAttemptSnapshot = Object.freeze({ phase: "idle", identity: null, error: null });
const describe = (error: unknown) => error instanceof Error ? error.message : "The molecular edit did not return a confirmed result.";
const ownedBlocks = (value: EditAttemptRecord) => Boolean(value.identity && !(value.phase === "unknown" && value.acknowledged) && ["submitting", "reconciling", "unknown"].includes(value.phase));
export const editAttemptBlocksWrites = (value: EditAttemptSnapshot) => Boolean(value.journalRecovery && !value.journalRecovery.acknowledged)
  || ownedBlocks(value) || Boolean(value.previous?.some(ownedBlocks));
export function definitelyUnapplied(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (["edit_attempt_already_submitted", "edit_attempt_token_conflict"].includes(error.code)) return false;
  return [400, 404, 409, 422, 429].includes(error.status) || error.code === "edit_attempts_unavailable";
}
/** App-owned requests, keyed by attempt identity even after another deliberate edit. */
export class EditAttemptController {
  private records = new Map<string, EditAttemptRecord>();
  private current = new Map<string, string>();
  private views = new Map<string, EditAttemptSnapshot>();
  private reviews = new Map<string, { owner: string; review?: EditReview; error?: string }>();
  private listeners = new Set<() => void>();
  private journalState: EditAttemptJournalRead["kind"] = "absent";
  private uncertainty: JournalUncertainty | undefined;
  constructor(private readonly journal?: EditAttemptJournal, private readonly uuid: () => string = () => crypto.randomUUID()) { this.adoptRead(this.readJournal()); }
  private readJournal(): EditAttemptJournalRead { try { return this.journal?.read() ?? { kind: "unavailable" }; } catch { return { kind: "unavailable" }; } }
  private adoptRead(value: EditAttemptJournalRead) {
    const existingProjects = new Set(this.current.keys());
    if (value.kind === "ready" || value.kind === "invalid") for (const row of value.rows) {
      if (!this.records.has(row.identity.id)) {
        this.records.set(row.identity.id, { phase: "unknown", identity: row.identity, acknowledged: row.acknowledged, error: "Earlier edit outcome is unknown. It may still arrive." });
        const prior = this.records.get(this.current.get(row.identity.projectId) ?? "");
        if (!prior || prior.acknowledged && (!row.acknowledged || !existingProjects.has(row.identity.projectId))) this.current.set(row.identity.projectId, row.identity.id);
      }
    }
    if (value.kind === "invalid" && this.journalState !== "invalid") this.uncertainty = {
      id: crypto.randomUUID(), reason: "unreadable_previous_edit_information", outcome: "unknown", acknowledgedProjects: [],
    };
    if (value.kind === "ready" && value.uncertainty) this.uncertainty = value.uncertainty;
    this.journalState = value.kind;
    this.pruneHistory(value.kind === "ready" || value.kind === "invalid" ? value.rows : []);
  }
  private pruneHistory(journalRows: readonly EditAttemptJournalRow[] = []) {
    // Merge before pruning. Journal order keeps older restored rows from becoming
    // recent merely because they were absent from this bounded in-memory archive.
    const orderedIds = new Set([...journalRows.map(row => row.identity.id), ...this.records.keys()]);
    const retired = [...orderedIds].flatMap(id => {
      const value = this.records.get(id);
      return value?.identity && !ownedBlocks(value) && this.current.get(value.identity.projectId) !== id ? [id] : [];
    });
    for (const id of retired.slice(0, Math.max(0, retired.length - 20))) this.records.delete(id);
  }
  private projectRecords(projectId: string) { return [...this.records.values()].filter(value => value.identity?.projectId === projectId); }
  recoveryOwner(projectId: string) { return JSON.stringify([this.current.get(projectId) ?? null, this.uncertainty?.id ?? null, this.projectRecords(projectId).map(value => value.identity!.id).sort()]); }
  private positivePending(projectId: string) { return this.projectRecords(projectId).some(value => ["submitting", "reconciling"].includes(value.phase)); }
  snapshot = (projectId: string): EditAttemptSnapshot => {
    if (this.views.has(projectId)) return this.views.get(projectId)!;
    const current = this.records.get(this.current.get(projectId) ?? ""), projectRecords = this.projectRecords(projectId);
    const journalRecovery: EditAttemptSnapshot["journalRecovery"] = this.journalState === "unavailable" ? { kind: "unavailable", markerId: this.uncertainty?.id ?? null, acknowledged: false }
      : this.uncertainty ? { kind: "invalid", markerId: this.uncertainty.id, acknowledged: this.uncertainty.acknowledgedProjects.some(value => value.projectId === projectId) } : undefined;
    if (!current && !journalRecovery) return idle;
    const local = this.reviews.get(projectId), sameOwner = local?.owner === this.recoveryOwner(projectId);
    const result: EditAttemptSnapshot = { ...(current ?? { ...idle, phase: "unknown" }), previous: projectRecords.filter(value => value !== current),
      ...(journalRecovery ? { journalRecovery } : {}), ...(sameOwner && local.review ? { review: local.review } : {}),
      error: sameOwner && local.error ? local.error : journalRecovery?.kind === "unavailable" ? "Edit recovery information could not be loaded. Editing is paused; check again when storage is available."
        : current?.error ?? (journalRecovery && !journalRecovery.acknowledged ? "Earlier edit information is unreadable. Its outcome remains unknown." : null),
      canReview: this.journalState !== "unavailable" && !this.positivePending(projectId) && (projectRecords.some(ownedBlocks) || Boolean(journalRecovery && !journalRecovery.acknowledged)),
    };
    this.views.set(projectId, result); return result;
  };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify() { this.views.clear(); this.listeners.forEach(listener => listener()); }
  reloadJournal() { this.adoptRead(this.readJournal()); this.notify(); }
  private rows(): EditAttemptJournalRow[] {
    return [...this.records.values()].flatMap(value => value.identity && (ownedBlocks(value) || value.acknowledged)
      ? [{ identity: value.identity, ...(value.acknowledged ? { acknowledged: value.acknowledged } : {}) }] : []);
  }
  private persist(): boolean {
    if (this.journalState === "invalid" || this.journalState === "unavailable") return false;
    const read = this.readJournal(); this.adoptRead(read);
    if (read.kind === "invalid" || read.kind === "unavailable") return false;
    try { this.journal?.write({ schemaVersion: 2, rows: this.rows(), ...(this.uncertainty ? { uncertainty: this.uncertainty } : {}) }); return Boolean(this.journal); }
    catch { this.journalState = "unavailable"; return false; }
  }
  private publish(record: EditAttemptRecord) {
    const identity = record.identity; if (!identity) return;
    const owned = { ...record }; delete (owned as EditAttemptSnapshot).previous; delete (owned as EditAttemptSnapshot).journalRecovery; delete (owned as EditAttemptSnapshot).canReview; delete owned.review;
    this.records.set(identity.id, owned);
    this.persist(); this.pruneHistory(); this.notify();
  }
  owns(projectId: string, id: string) { const value = this.snapshot(projectId); return value.identity?.id === id && !value.acknowledged; }
  assertWritable(projectId: string) { if (editAttemptBlocksWrites(this.snapshot(projectId))) throw new Error("Check the pending molecular edit or its recovery information before changing this project."); }
  private matchesOwner(projectId: string, owner: string) { return owner === this.recoveryOwner(projectId) || owner === this.current.get(projectId) && !this.snapshot(projectId).journalRecovery; }
  setReview(projectId: string, owner: string, review: EditReview) {
    if (!this.matchesOwner(projectId, owner) || !this.snapshot(projectId).canReview) return;
    this.reviews.set(projectId, { owner: this.recoveryOwner(projectId), review }); this.notify();
  }
  reviewFailed(projectId: string, owner: string, message: string) {
    if (!this.matchesOwner(projectId, owner)) return;
    this.reviews.set(projectId, { owner: this.recoveryOwner(projectId), error: message }); this.notify();
  }
  acknowledge(projectId: string, id: string, review: EditReview): boolean {
    if (this.current.get(projectId) !== id) return false;
    return this.acknowledgeRecovery(projectId, this.recoveryOwner(projectId), review);
  }
  acknowledgeRecovery(projectId: string, owner: string, review: EditReview): boolean {
    if (this.recoveryOwner(projectId) !== owner || !this.snapshot(projectId).canReview || JSON.stringify(this.snapshot(projectId).review) !== JSON.stringify(review)) return false;
    // Re-read before any replacement: a newer marker/identity must invalidate this review.
    const read = this.readJournal(); this.adoptRead(read); this.views.clear();
    if (read.kind === "unavailable" || this.recoveryOwner(projectId) !== owner || this.positivePending(projectId)) { this.notify(); return false; }
    const acknowledged = compactEditReview(review);
    const rows = this.rows().map(row => row.identity.projectId === projectId && !row.acknowledged ? { identity: row.identity, acknowledged } : row);
    const uncertainty = this.uncertainty ? { ...this.uncertainty, acknowledgedProjects: [
      ...this.uncertainty.acknowledgedProjects.filter(value => value.projectId !== projectId), { projectId, reviewedContext: acknowledged },
    ].slice(-64) } : undefined;
    const envelope: EditAttemptJournalEnvelope = { schemaVersion: 2, rows, ...(uncertainty ? { uncertainty } : {}) };
    try {
      if (!this.journal) throw new Error("No acknowledgment storage"); this.journal.write(envelope);
      const retained = this.readJournal();
      if (retained.kind !== "ready" || JSON.stringify(retained.rows) !== JSON.stringify(rows) || JSON.stringify(retained.uncertainty) !== JSON.stringify(uncertainty)) throw new Error("Acknowledgment was not retained");
    } catch {
      this.reviews.set(projectId, { owner, review, error: "Could not retain this acknowledgment. Editing remains paused; retry." }); this.notify(); return false;
    }
    for (const row of rows) if (row.identity.projectId === projectId && row.acknowledged) { const value = this.records.get(row.identity.id); if (value) this.records.set(row.identity.id, { ...value, acknowledged: row.acknowledged }); }
    this.uncertainty = uncertainty; this.journalState = "ready"; this.reviews.delete(projectId); this.notify(); return true;
  }
  async submit(identity: Omit<EditAttemptIdentity, "id">, send: (attemptId: string) => Promise<SelectionEditResult>): Promise<SelectionEditResult> {
    this.assertWritable(identity.projectId);
    const captured = Object.freeze({ ...identity, id: this.uuid() });
    this.current.set(identity.projectId, captured.id);
    this.publish({ phase: "submitting", identity: captured, error: null });
    try {
      try {
        const retainedRead = this.readJournal();
        const retained = retainedRead.kind === "ready" ? retainedRead.rows.find(row => row.identity.id === captured.id) : undefined;
        if (!retained || retained.acknowledged || JSON.stringify(retained.identity) !== JSON.stringify(captured)) throw new Error("Attempt identity was not retained");
      } catch { throw new ApiError(400, "edit_attempt_journal_unavailable", "Could not retain edit recovery information. Apply was not submitted; retry."); }
      const result = await send(captured.id), prior = this.records.get(captured.id);
      // A retired acknowledged record may have aged out while its request settled.
      if (!prior) return result;
      this.publish({ ...prior, phase: result.applied === false ? "not_applied" : "saved", error: null,
        feedback: { warnings: result.warnings, report: result.hydrogen_report, reconciliation: result.hydrogen_reconciliation_report },
        ...(result.applied !== false ? { committedRevision: result.project.revision,
          committedArtifactId: result.project.entries.find(entry => entry.id === identity.entryId)?.current_artifact_id ?? undefined } : {}),
      }); return result;
    } catch (error) {
      const prior = this.records.get(captured.id);
      if (prior && !["saved", "not_applied"].includes(prior.phase)) this.publish({ ...prior,
        phase: definitelyUnapplied(error) ? "not_applied" : "unknown", error: describe(error) });
      throw error;
    }
  }
  private async checkOwned(id: string, read: (identity: EditAttemptIdentity) => Promise<EditAttemptReceipt>): Promise<void> {
    const before = this.records.get(id), identity = before?.identity;
    if (!before || !identity || before.phase === "reconciling") return;
    this.publish({ ...before, review: undefined, phase: ["saved", "not_applied"].includes(before.phase) ? before.phase : "reconciling", error: null });
    const [receipt] = await Promise.allSettled([read(identity)]);
    const current = this.records.get(identity.id); if (!current) return;
    if (["saved", "not_applied"].includes(current.phase)) return;
    if (receipt.status === "rejected") { this.publish({ ...current, phase: "unknown", error: `${describe(receipt.reason)} Outcome remains unknown.` }); return; }
    const value = receipt.value;
    const matches = value && typeof value.server_instance_id === "string" && value.server_instance_id.length > 0
      && value.attempt_id === identity.id && value.project_id === identity.projectId && value.entry_id === identity.entryId && value.kind === identity.kind
      && value.expected_revision === identity.expectedRevision && value.expected_artifact_id === identity.artifactId
      && (!current.serverInstanceId || current.serverInstanceId === value.server_instance_id);
    if (!matches || value.phase === "unknown" || value.outcome === "unknown") {
      this.publish({ ...current, phase: "unknown", error: `This server cannot confirm the earlier edit. Review current state; do not repeat that Apply.` }); return;
    }
    if (value.outcome === "saved" && Number.isSafeInteger(value.committed_revision) && value.committed_revision! > identity.expectedRevision
      && typeof value.committed_artifact_id === "string" && value.committed_artifact_id.length > 0) {
      this.publish({ ...current, phase: "saved", error: null, serverInstanceId: value.server_instance_id,
        committedRevision: value.committed_revision!, committedArtifactId: value.committed_artifact_id });
    } else if (value.phase === "finished" && value.outcome === "not_applied") {
      this.publish({ ...current, phase: "not_applied", error: value.reason ? `${value.reason}` : `The edit was not applied.`, serverInstanceId: value.server_instance_id });
    } else if (value.phase === "pending" || value.phase === "finishing") {
      this.publish({ ...current, phase: "submitting", error: null, serverInstanceId: value.server_instance_id });
    } else this.publish({ ...current, phase: "unknown", error: `The response does not prove whether the edit was applied.` });
  }
  async check(projectId: string, read: (identity: EditAttemptIdentity) => Promise<EditAttemptReceipt>, refresh: () => Promise<void>): Promise<void> {
    this.reloadJournal(); this.reviews.delete(projectId); this.notify();
    const records = this.projectRecords(projectId).filter(value => !value.acknowledged && !["saved", "not_applied"].includes(value.phase));
    for (const value of records) await this.checkOwned(value.identity!.id, read);
    try {
      await refresh();
      const current = this.snapshot(projectId);
      if (current.identity && current.error?.startsWith("Current project refresh failed.")) this.publish({ ...current, error: null });
    }
    catch {
      const current = this.snapshot(projectId);
      if (current.identity) this.publish({ ...current, error: "Current project refresh failed. Editing recovery still needs review." });
      else this.reviews.set(projectId, { owner: this.recoveryOwner(projectId), error: "The current project could not be refreshed. Editing remains paused." });
      this.notify();
    }
  }

}
