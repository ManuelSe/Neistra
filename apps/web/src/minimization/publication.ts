import type { Job, Project } from "../api/types";
import {
  createPublicationJournal, publicationId, validPublicationAttempt,
  type PublicationJournal, type QuickPublicationAttempt,
} from "./publicationJournal";

export type { QuickPublicationAttempt } from "./publicationJournal";
export interface QuickPublicationReceipt { jobId: string; revision: number; proposalSha256: string }
export interface QuickPublicationState {
  phase: "idle" | "submitting" | "reconciling" | "uncertain";
  attempt: QuickPublicationAttempt | null;
  receipt: QuickPublicationReceipt | null;
  error: string | null;
}
export interface QuickPublicationPorts {
  sendApply: (attempt: QuickPublicationAttempt) => Promise<Project>;
  readProject: (projectId: string) => Promise<Project>;
  readJob: (jobId: string) => Promise<Job>;
  acceptProject: (project: Project) => void;
  notice: (projectId: string, text: string, error: boolean, lifetime?: "transient" | "persistent") => void;
}
const idle: QuickPublicationState = Object.freeze({ phase: "idle", attempt: null, receipt: null, error: null });
const unknown = "Couldn’t confirm whether coordinates were applied. Project changes remain paused. Open minimization to check.";
const message = (error: unknown) => error instanceof Error ? error.message : "Minimization application failed.";
const definiteRejection = (error: unknown) => {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 409;
};
function checkedProject(project: Project, projectId: string): Project {
  if (!project || typeof project !== "object" || project.schema_version !== 2 ||
    project.id !== projectId || !Number.isSafeInteger(project.revision) || project.revision < 0 ||
    ![project.entries, project.groups, project.saved_selections, project.measurements,
      project.scenes, project.structure_patches, project.topology_patches].every(Array.isArray) ||
    !project.history || typeof project.history !== "object") {
    throw new Error("Publication recovery returned an invalid project.");
  }
  return project;
}
/** Runtime validation of server-owned evidence; current entries may already be deleted. */
export function quickApplicationReceipt(job: Job, attempt: QuickPublicationAttempt): QuickPublicationReceipt | null {
  if (job.id !== attempt.jobId || job.project_id !== attempt.projectId || job.job_type !== "coordinates.quick_minimize") {
    throw new Error("Publication recovery returned a different job.");
  }
  const raw: unknown = job.provenance?.quick_minimization_application;
  if (raw === undefined) return null;
  if (job.status !== "completed" || !raw || typeof raw !== "object") throw new Error("Invalid minimization application evidence.");
  const record = raw as Record<string, unknown>;
  const entries = record.entry_ids;
  if (!Array.isArray(job.inputs) || !job.inputs.every(input =>
    input && publicationId(input.entry_id))) throw new Error("Invalid minimization input identity.");
  const inputs = new Set(job.inputs.map(input => input.entry_id));
  if (record.proposal_sha256 !== attempt.proposalSha256 ||
    !Number.isSafeInteger(record.revision) || (record.revision as number) <= attempt.expectedRevision ||
    !Array.isArray(entries) || !entries.length || !entries.every(publicationId) ||
    new Set(entries).size !== entries.length || !entries.every(id => inputs.has(id))) {
    throw new Error("Invalid minimization application evidence.");
  }
  return { jobId: job.id, revision: record.revision as number, proposalSha256: attempt.proposalSha256 };
}

/** App lifetime, with independent guards and requests for each source project. */
export class QuickPublicationSession {
  private states = new Map<string, QuickPublicationState>();
  private flights = new Map<string, Promise<Project>>();
  private listeners = new Set<() => void>();
  constructor(private readonly ports: QuickPublicationPorts, private readonly journal: PublicationJournal = createPublicationJournal()) {}
  snapshot = (projectId: string): QuickPublicationState => this.states.get(projectId) ?? idle;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(projectId: string, state: QuickPublicationState) {
    this.states.set(projectId, Object.freeze(state)); this.listeners.forEach(listener => listener());
  }
  assertWritable = (projectId: string) => {
    if (this.snapshot(projectId).phase !== "idle") throw new Error("Confirm the pending minimization outcome before changing this project.");
  };
  private flight(projectId: string, operation: () => Promise<Project>): Promise<Project> {
    const current = this.flights.get(projectId);
    if (current) return current;
    const promise = Promise.resolve().then(operation).finally(() => {
      if (this.flights.get(projectId) === promise) this.flights.delete(projectId);
    });
    this.flights.set(projectId, promise);
    return promise;
  }
  private uncertain(projectId: string, error: unknown): never {
    this.publish(projectId, { ...this.snapshot(projectId), phase: "uncertain", error: message(error) });
    this.ports.notice(projectId, `${unknown} ${message(error)}`, true);
    throw error instanceof Error ? error : new Error(message(error));
  }
  private settle(project: Project, receipt: QuickPublicationReceipt | null) {
    this.ports.acceptProject(project);
    // A failed removal leaves a harmless descriptor that is checked on next load.
    this.journal.remove(project.id);
    this.publish(project.id, { ...idle, receipt });
  }
  start = (requested: QuickPublicationAttempt): Promise<Project> => {
    if (!validPublicationAttempt(requested)) return Promise.reject(new Error("Invalid minimization publication request."));
    if (!this.states.has(requested.projectId)) {
      const saved = this.journal.read(requested.projectId);
      if (saved.kind !== "absent") {
        this.publish(requested.projectId, {
          phase: "uncertain", attempt: saved.kind === "valid" ? saved.attempt : null,
          receipt: null, error: "A previous minimization outcome must be checked before submitting another application.",
        });
        return Promise.reject(new Error("A previous minimization outcome must be checked before submitting another application."));
      }
    }
    const state = this.snapshot(requested.projectId);
    const pending = this.flights.get(requested.projectId);
    if (pending && state.attempt &&
      state.attempt.jobId === requested.jobId && state.attempt.proposalSha256 === requested.proposalSha256 &&
      state.attempt.expectedRevision === requested.expectedRevision && state.attempt.origin === requested.origin) return pending;
    try { this.assertWritable(requested.projectId); } catch (error) { return Promise.reject(error instanceof Error ? error : new Error(message(error))); }
    const attempt = Object.freeze({ ...requested });
    if (!this.journal.write(attempt)) {
      const error = new Error("Could not save minimization recovery information. Coordinates were not submitted.");
      this.ports.notice(attempt.projectId, error.message, true);
      return Promise.reject(error);
    }
    this.publish(attempt.projectId, { phase: "submitting", attempt, receipt: null, error: null });
    return this.flight(attempt.projectId, () => this.send(attempt, false));
  };
  private async send(attempt: QuickPublicationAttempt, retry: boolean): Promise<Project> {
    let next: Project;
    try {
      next = checkedProject(await this.ports.sendApply(attempt), attempt.projectId);
      if (next.revision <= attempt.expectedRevision) throw new Error("Application response did not confirm a coordinate command.");
    } catch (error) {
      if (!retry && definiteRejection(error)) {
        this.journal.remove(attempt.projectId);
        this.publish(attempt.projectId, { ...idle, error: message(error) });
        this.ports.notice(attempt.projectId, message(error), true);
        throw error;
      }
      return this.reconcile(attempt.projectId);
    }
    try {
      this.settle(next, { jobId: attempt.jobId, proposalSha256: attempt.proposalSha256, revision: next.revision });
    } catch { return this.reconcile(attempt.projectId); }
    this.ports.notice(attempt.projectId, "Quick minimization was stored locally.", false, "transient");
    return next;
  }
  private async reconcile(projectId: string): Promise<Project> {
    const attempt = this.snapshot(projectId).attempt;
    this.publish(projectId, { ...this.snapshot(projectId), phase: "reconciling", error: null });
    let project: Project;
    let receipt: QuickPublicationReceipt | null;
    try {
      project = checkedProject(await this.ports.readProject(projectId), projectId);
      if (!attempt) {
        this.ports.acceptProject(project);
        throw new Error("Recovery information is invalid or unavailable; an application outcome cannot be verified.");
      }
      receipt = quickApplicationReceipt(await this.ports.readJob(attempt.jobId), attempt);
      if (receipt && project.revision < receipt.revision) {
        project = checkedProject(await this.ports.readProject(projectId), projectId);
        if (project.revision < receipt.revision) throw new Error("Project snapshot predates the recorded minimization.");
      }
      if (project.revision < attempt.expectedRevision) throw new Error("Project snapshot predates the publication request.");
    } catch (error) { return this.uncertain(projectId, error); }
    if (receipt) {
      try { this.settle(project, receipt); } catch (error) { return this.uncertain(projectId, error); }
      this.ports.notice(projectId, "Quick minimization was recorded once. Current project refreshed; later edits and Undo are preserved.", false);
      return project;
    }
    if (project.revision > attempt.expectedRevision) {
      try { this.settle(project, null); } catch (error) { return this.uncertain(projectId, error); }
      const error = new Error("Project changed before this result was recorded. Run a new minimization.");
      this.publish(projectId, { ...idle, error: error.message });
      this.ports.notice(projectId, error.message, true);
      throw error;
    }
    try { this.ports.acceptProject(project); } catch (error) { return this.uncertain(projectId, error); }
    return this.uncertain(projectId, new Error("No application is confirmed yet. Refresh the result or explicitly retry the same application."));
  }
  refresh = (projectId: string): Promise<Project> => {
    if (this.snapshot(projectId).phase === "idle") return Promise.reject(new Error("No pending minimization needs recovery."));
    return this.flight(projectId, () => this.reconcile(projectId));
  };
  retry = (projectId: string): Promise<Project> => {
    const state = this.snapshot(projectId);
    const pending = this.flights.get(projectId);
    if (pending) return pending;
    if (state.phase !== "uncertain" || !state.attempt) return Promise.reject(new Error("No valid minimization application is available to retry."));
    if (!this.journal.write(state.attempt)) {
      const error = new Error("Could not save minimization recovery information. Retry was not submitted.");
      this.publish(projectId, { ...state, error: error.message });
      this.ports.notice(projectId, error.message, true);
      return Promise.reject(error);
    }
    this.publish(projectId, { ...state, phase: "submitting", error: null });
    return this.flight(projectId, () => this.send(state.attempt!, true));
  };
  attachProject = async (projectId: string): Promise<void> => {
    if (this.states.has(projectId)) return;
    const saved = this.journal.read(projectId);
    if (saved.kind === "absent") return;
    const state: QuickPublicationState = {
      phase: "uncertain", attempt: saved.kind === "valid" ? saved.attempt : null,
      receipt: null, error: null,
    };
    this.publish(projectId, state);
    try { await this.refresh(projectId); } catch { /* The source-project guard and notice retain the diagnostic. */ }
  };
}
export type QuickPublicationController = Pick<QuickPublicationSession,
  "snapshot" | "subscribe" | "start" | "refresh" | "retry" | "attachProject" | "assertWritable">;
