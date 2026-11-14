import { parsePresentationMirror, serializePresentationMirror, WORKSPACE_PRESENTATION_MIRROR_KEY, type PresentationMirrorV1 } from "./mirror";
import type {
  CameraPresentationTarget, InitialFitTicket, SessionCamera, WorkspacePresentationClock,
  WorkspacePresentationDependencies, WorkspacePresentationSnapshot, WorkspacePresentationV1,
} from "./types";
import { copySessionCamera, parseSessionCamera, parseWorkspacePresentation, sameSessionCamera } from "./validation";

const defaultClock: WorkspacePresentationClock = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: timer => clearTimeout(timer),
};
const freezeCamera = (camera: SessionCamera | null): SessionCamera | null => {
  if (!camera) return null;
  const copy = copySessionCamera(camera);
  Object.freeze(copy.position); Object.freeze(copy.target); Object.freeze(copy.up);
  return Object.freeze(copy);
};
const conflictMessage = "The saved view changed elsewhere. Save current view to keep this pose.";
const unsavedMessage = "View changes are not saved. Retry when the connection is available.";

/** One installation camera, independent of project commands and disposable viewers. */
export class WorkspacePresentationController {
  private snapshot: WorkspacePresentationSnapshot = Object.freeze({ hydrated: false, camera: null,
    revision: null, status: "loading", problem: null, message: null, navigationGeneration: 0 });
  private listeners = new Set<() => void>();
  private readonly clock: WorkspacePresentationClock;
  private running = false;
  private initialized = false;
  private hydration: Promise<void> | undefined;
  private startupMirror: PresentationMirrorV1 | null = null;
  private recoveryIssue: string | null = null;
  private displayIssue: string | null = null;
  private pendingIntent: { generation: number; binding: number | null } | null = null;
  private dirty = false;
  private baseRevision: number | null = null;
  private acknowledged: SessionCamera | null = null;
  private blocked = false;
  private conflict = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstUnsentAt: number | undefined;
  private lastInputAt: number | undefined;
  private inFlight: Promise<void> | undefined;
  private refreshFlight: Promise<void> | undefined;
  private explicitRefresh = false;
  private bindingSerial = 0;
  private binding: { target: CameraPresentationTarget; token: number; restorationGeneration: number; unsubscribe: () => void } | undefined;
  private fitEligible = false;
  private fitConsumed = false;
  private fitClaim: { binding: number; generation: number; active: boolean } | undefined;

  constructor(private readonly dependencies: WorkspacePresentationDependencies) {
    this.clock = dependencies.clock ?? defaultClock;
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  /** Resumable after React effect replay; construction itself performs no I/O. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.initialize();
    void this.hydrate();
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    this.writeMirror();
  }

  hydrate(): Promise<void> {
    this.initialize();
    this.hydration ??= Promise.resolve().then(async () => {
      try {
        const server = this.validResponse(await this.dependencies.api.read());
        this.receiveServer(server, false);
      } catch {
        this.blocked = true;
        if (!this.dirty && !this.snapshot.camera && !this.pendingIntent && this.startupMirror) this.restore(this.startupMirror.camera);
        this.publish({ hydrated: true });
        this.setStatus("unsaved", "The saved view could not be loaded. Retry when the connection is available.");
      }
      this.schedule();
    });
    return this.hydration;
  }

  bind(target: CameraPresentationTarget): () => void {
    this.retireBinding();
    const token = ++this.bindingSerial;
    // Seed before subscribing. The target also excludes delayed restoration
    // events, so native event timing cannot turn hydration into new navigation.
    if (this.snapshot.camera) {
      const restored = copySessionCamera(this.snapshot.camera);
      try { target.setSessionCamera(restored); }
      catch { this.refuseDisplay(target, restored); }
    }
    const binding = { target, token, restorationGeneration: this.snapshot.navigationGeneration, unsubscribe: () => {} };
    this.binding = binding;
    const unsubscribeNavigation = target.subscribeSessionCamera(camera => {
      if (this.binding?.token === token && this.binding.target === target) this.acceptNavigation(camera);
    });
    const unsubscribeFailure = target.subscribeSessionCameraFailure?.(failed => {
      if (this.binding !== binding || binding.restorationGeneration !== this.snapshot.navigationGeneration) return;
      this.refuseDisplay(target, failed);
    });
    binding.unsubscribe = () => { unsubscribeNavigation(); unsubscribeFailure?.(); };
    if (this.binding !== binding) binding.unsubscribe();
    return () => { if (this.binding?.token === token) this.retireBinding(); };
  }

  acceptNavigation(value: SessionCamera): boolean {
    const camera = parseSessionCamera(value);
    if (!camera) return false;
    this.initialize();
    this.pendingIntent = null; this.displayIssue = null;
    this.fitConsumed = true; this.fitEligible = false; this.cancelFitClaim();
    const now = this.clock.now();
    if (!this.dirty) this.baseRevision = this.snapshot.revision ?? this.baseRevision;
    this.firstUnsentAt ??= now;
    this.lastInputAt = now;
    this.dirty = this.blocked || this.conflict || Boolean(this.inFlight)
      || this.snapshot.revision === null || !sameSessionCamera(camera, this.acknowledged);
    if (!this.dirty) { this.baseRevision = this.snapshot.revision; this.firstUnsentAt = undefined; this.lastInputAt = undefined; }
    this.publish({ camera: freezeCamera(camera), navigationGeneration: this.snapshot.navigationGeneration + 1 });
    this.writeMirror();
    this.refreshStatus();
    this.schedule();
    return true;
  }

  /** An explicit asynchronous camera action owns intent before its pose exists. */
  beginCameraIntent(): number {
    this.initialize();
    this.fitConsumed = true; this.fitEligible = false; this.cancelFitClaim();
    const generation = this.snapshot.navigationGeneration + 1;
    this.pendingIntent = { generation, binding: this.binding?.token ?? null };
    this.publish({ navigationGeneration: generation });
    return generation;
  }

  /** Failed asynchronous actions release their own intent without reviving fitting. */
  cancelCameraIntent(generation: number): void {
    if (this.pendingIntent?.generation !== generation || this.snapshot.navigationGeneration !== generation) return;
    this.pendingIntent = null;
    if (!this.snapshot.camera && this.snapshot.hydrated && this.acknowledged) this.restore(this.acknowledged);
    this.writeMirror();
    this.refreshStatus();
    this.schedule();
  }

  /** Retry reads first: an interrupted response may already have stored the pose. */
  retry(): Promise<void> { return this.refresh(false); }

  /** Explicit consent to replace a differing installation preference. */
  saveCurrentView(): Promise<void> { return this.refresh(true); }

  /** Local closure recovery is synchronous; the server attempt remains best effort. */
  flush(options?: { keepalive?: boolean }): Promise<void> {
    this.captureCurrentCamera();
    this.clearTimer();
    this.writeMirror();
    return this.save(options?.keepalive ?? false);
  }

  claimInitialFit(target: CameraPresentationTarget): InitialFitTicket | null {
    const binding = this.binding;
    if (!this.snapshot.hydrated || this.snapshot.revision === null || !this.fitEligible || this.fitConsumed
      || this.snapshot.camera || !binding || binding.target !== target || this.fitClaim) return null;
    const claim = { binding: binding.token, generation: this.snapshot.navigationGeneration, active: true };
    this.fitClaim = claim;
    return {
      complete: (drawable, fit) => {
        if (!drawable || !this.fitClaimCurrent(claim)) return false;
        // Calling a fit consumes the one opportunity even if a renderer fails.
        claim.active = false; this.fitClaim = undefined; this.fitConsumed = true; this.fitEligible = false;
        const generation = this.snapshot.navigationGeneration;
        const camera = fit();
        // Native explicit fitting can synchronously publish the same pose.
        if (this.binding?.token !== claim.binding) return false;
        if (this.snapshot.navigationGeneration !== generation) return sameSessionCamera(this.snapshot.camera, camera);
        return Boolean(camera && this.acceptNavigation(camera));
      },
      cancel: () => {
        if (this.fitClaim !== claim) return;
        claim.active = false; this.fitClaim = undefined;
      },
    };
  }

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const text = this.dependencies.storage.getItem(WORKSPACE_PRESENTATION_MIRROR_KEY);
      this.startupMirror = parsePresentationMirror(text);
      if (text !== null && !this.startupMirror) this.recoveryIssue = "Local view recovery data could not be read.";
    } catch { this.recoveryIssue = "Local view recovery is unavailable."; }
    if (this.startupMirror) {
      this.fitConsumed = true;
      this.baseRevision = this.startupMirror.base_revision;
      if (this.startupMirror.dirty) {
        this.dirty = true;
        this.firstUnsentAt = this.lastInputAt = this.clock.now();
        this.restore(this.startupMirror.camera);
      }
    }
    this.setStatus("loading", null);
  }

  private publish(change: Partial<WorkspacePresentationSnapshot>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...change });
    for (const listener of this.listeners) listener();
  }

  private setStatus(status: WorkspacePresentationSnapshot["status"], message: string | null): void {
    const problem: WorkspacePresentationSnapshot["problem"] = this.conflict ? "conflict"
      : this.displayIssue ? "display" : this.blocked ? "save" : this.recoveryIssue ? "recovery" : null;
    this.publish({ status, problem, message: [message, this.recoveryIssue].filter(Boolean).join(" ") || null });
  }

  private refreshStatus(): void {
    if (!this.snapshot.hydrated) this.setStatus("loading", null);
    else if (this.conflict) this.setStatus("conflict", conflictMessage);
    else if (this.displayIssue) this.setStatus("unsaved", this.displayIssue);
    else if (this.blocked) this.setStatus("unsaved", unsavedMessage);
    else this.setStatus(this.dirty || this.inFlight ? "saving" : "saved", null);
  }

  private restore(camera: SessionCamera | null): void {
    const previous = this.snapshot.camera;
    if (this.binding) this.binding.restorationGeneration = this.snapshot.navigationGeneration;
    this.publish({ camera: freezeCamera(camera) });
    if (camera && this.binding) {
      try { this.binding.target.setSessionCamera(copySessionCamera(camera)); this.displayIssue = null; }
      catch { this.refuseDisplay(this.binding.target, camera, previous); }
    } else this.displayIssue = null;
  }

  private refuseDisplay(target: CameraPresentationTarget, failed: SessionCamera, previous: SessionCamera | null = null): void {
    if (!sameSessionCamera(this.snapshot.camera, failed)) return;
    let fallback = previous;
    try {
      const live = target.getSessionCamera?.();
      if (live) fallback = parseSessionCamera(live);
    } catch { /* Keep a valid remembered fallback if native inspection is unavailable. */ }
    if (sameSessionCamera(fallback, failed)) fallback = null;
    this.publish({ camera: freezeCamera(fallback) });
    this.displayIssue = "The saved view cannot be displayed. Adjust the view or use Fit.";
    this.clearTimer();
    this.refreshStatus();
  }

  private validResponse(value: unknown): WorkspacePresentationV1 {
    const server = parseWorkspacePresentation(value);
    if (!server) throw new Error("The saved view response is invalid.");
    return server;
  }

  private receiveServer(server: WorkspacePresentationV1, explicit: boolean): void {
    this.acknowledged = server.camera ? copySessionCamera(server.camera) : null;
    this.publish({ hydrated: true, revision: server.revision });
    this.blocked = false; this.conflict = false;
    if (explicit && this.snapshot.camera) {
      this.baseRevision = server.revision;
      this.dirty = !sameSessionCamera(this.snapshot.camera, server.camera);
    } else if (this.dirty && this.snapshot.camera) {
      if (sameSessionCamera(this.snapshot.camera, server.camera)) {
        this.dirty = false; this.baseRevision = server.revision;
      } else if (this.baseRevision !== server.revision) {
        // Retain the ORIGINAL dirty base. Replacing it after a conflict would
        // allow the next reload to overwrite the external pose automatically.
        this.blocked = true; this.conflict = true;
      }
    } else {
      this.dirty = false; this.baseRevision = server.revision;
      if (!this.pendingIntent) this.restore(server.camera);
    }
    if (server.camera) { this.fitConsumed = true; this.fitEligible = false; }
    else if (!this.fitConsumed && !this.snapshot.camera && this.snapshot.navigationGeneration === 0) this.fitEligible = true;
    if (!this.dirty) { this.firstUnsentAt = undefined; this.lastInputAt = undefined; }
    else { this.firstUnsentAt ??= this.clock.now(); this.lastInputAt ??= this.clock.now(); }
    this.writeMirror();
    this.refreshStatus();
  }

  private writeMirror(): void {
    const camera = this.snapshot.camera;
    if (!camera || this.displayIssue || (!this.dirty && (this.snapshot.revision === null || !sameSessionCamera(camera, this.acknowledged)))) return;
    try {
      this.dependencies.storage.setItem(WORKSPACE_PRESENTATION_MIRROR_KEY, serializePresentationMirror({ schema_version: 1,
        camera, dirty: this.dirty, base_revision: this.dirty ? this.baseRevision : this.snapshot.revision }));
      this.recoveryIssue = null;
    } catch {
      this.recoveryIssue = "Local view recovery is unavailable.";
      this.refreshStatus();
    }
  }

  private clearTimer(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.clearTimer();
    if (!this.running || !this.snapshot.hydrated || this.snapshot.revision === null || !this.dirty
      || this.blocked || this.conflict || this.displayIssue || this.inFlight || this.refreshFlight) return;
    const now = this.clock.now();
    const due = Math.min((this.lastInputAt ?? now) + 250, (this.firstUnsentAt ?? now) + 2000);
    this.timer = this.clock.setTimeout(() => { this.timer = undefined; void this.save(false); }, Math.max(0, due - now));
  }

  private save(keepalive: boolean): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const camera = this.snapshot.camera, revision = this.snapshot.revision;
    if (!camera || revision === null || !this.snapshot.hydrated || !this.dirty || this.blocked || this.conflict || this.displayIssue || this.refreshFlight) return Promise.resolve();
    const submitted = copySessionCamera(camera), generation = this.snapshot.navigationGeneration;
    const previouslyAcknowledged = this.acknowledged;
    this.firstUnsentAt = undefined; this.lastInputAt = undefined;
    this.inFlight = Promise.resolve().then(async () => {
      try {
        const response = this.validResponse(await this.dependencies.api.write(submitted, revision, { keepalive }));
        if (!sameSessionCamera(response.camera, submitted) || (response.revision !== revision && response.revision !== revision + 1)
          || (response.revision === revision && !sameSessionCamera(submitted, previouslyAcknowledged))) {
          throw new Error("The saved view could not be confirmed.");
        }
        this.acknowledged = copySessionCamera(submitted);
        this.publish({ revision: response.revision });
        // An acknowledgement never restores a camera or clears later input.
        this.dirty = !sameSessionCamera(this.snapshot.camera, response.camera);
        this.baseRevision = response.revision;
        if (!this.dirty) { this.firstUnsentAt = undefined; this.lastInputAt = undefined; }
        if (this.dirty && generation !== this.snapshot.navigationGeneration) {
          this.firstUnsentAt ??= this.clock.now(); this.lastInputAt ??= this.clock.now();
        }
        this.writeMirror();
      } catch (error) {
        this.dirty = true; this.blocked = true;
        this.conflict = Boolean(error && typeof error === "object" && "code" in error && error.code === "presentation_revision_conflict");
        this.writeMirror();
      } finally {
        this.inFlight = undefined;
        this.refreshStatus();
        this.schedule();
      }
    });
    this.refreshStatus();
    return this.inFlight;
  }

  private refresh(explicit: boolean): Promise<void> {
    this.initialize();
    this.explicitRefresh ||= explicit;
    if (this.refreshFlight) return this.refreshFlight;
    this.clearTimer();
    this.setStatus("saving", explicit ? "Saving current view…" : "Checking saved view…");
    this.refreshFlight = Promise.resolve().then(async () => {
      try {
        await this.hydrate();
        if (this.inFlight) await this.inFlight;
        const server = this.validResponse(await this.dependencies.api.read());
        this.receiveServer(server, this.explicitRefresh);
      } catch {
        this.blocked = true;
        this.setStatus(this.conflict ? "conflict" : "unsaved", this.conflict
          ? "The saved view could not be checked. Try Save current view again when the connection is available." : unsavedMessage);
      } finally {
        this.explicitRefresh = false; this.refreshFlight = undefined;
      }
      await this.flush();
      this.schedule();
    });
    return this.refreshFlight;
  }

  private fitClaimCurrent(claim: { binding: number; generation: number; active: boolean }): boolean {
    return claim.active && this.fitClaim === claim && !this.fitConsumed && this.fitEligible
      && this.binding?.token === claim.binding && this.snapshot.navigationGeneration === claim.generation;
  }

  private cancelFitClaim(): void {
    if (this.fitClaim) this.fitClaim.active = false;
    this.fitClaim = undefined;
  }

  /** A final control update can precede its next native camera notification. */
  private captureCurrentCamera(): void {
    const binding = this.binding, generation = this.snapshot.navigationGeneration;
    if (!binding || !this.snapshot.camera || this.pendingIntent || this.displayIssue) return;
    let camera: SessionCamera | null = null;
    try { camera = parseSessionCamera(binding.target.getSessionCamera?.()); } catch { return; }
    if (!camera || this.binding !== binding || this.snapshot.navigationGeneration !== generation
      || !this.snapshot.camera || this.pendingIntent || this.displayIssue || sameSessionCamera(camera, this.snapshot.camera)) return;
    this.acceptNavigation(camera);
  }

  private retireBinding(): void {
    const retired = this.binding;
    this.captureCurrentCamera();
    this.cancelFitClaim();
    retired?.unsubscribe();
    this.binding = undefined;
    if (retired && this.pendingIntent?.binding === retired.token) this.cancelCameraIntent(this.pendingIntent.generation);
  }
}
