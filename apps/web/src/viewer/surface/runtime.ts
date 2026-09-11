import { SurfaceCalculator } from "./client";
import { surfaceAdmission } from "./geometry";
import { SURFACE_LIMITS, type SurfaceGeometry, type SurfaceInput } from "./protocol";

export interface SurfaceStatus {
  entryId: string;
  label: string;
  state: "queued" | "rendering" | "ready" | "cancelled" | "fallback" | "hidden";
  message: string;
}
interface Request {
  key: string;
  controller: AbortController;
  geometry?: SurfaceGeometry;
  status: SurfaceStatus;
  notify: (geometry?: SurfaceGeometry) => void;
}

/** Transient, viewer-owned geometry; saved membership is never mutated here. */
export class SurfaceRuntime {
  private requests = new Map<string, Request>();
  private listeners = new Set<(statuses: SurfaceStatus[]) => void>();
  constructor(private calculator = new SurfaceCalculator()) {}

  subscribe(listener: (statuses: SurfaceStatus[]) => void) {
    this.listeners.add(listener);
    listener(this.statuses());
    return () => { this.listeners.delete(listener); };
  }
  statuses() { return [...this.requests.values()].map((request) => request.status); }
  retain(entries: ReadonlySet<string>) {
    for (const id of this.requests.keys()) if (!entries.has(id)) this.remove(id);
  }
  remove(entryId: string) {
    const request = this.requests.get(entryId);
    this.requests.delete(entryId);
    request?.controller.abort();
    this.emit();
  }
  cancel(entryId: string) {
    const request = this.requests.get(entryId);
    if (!request || !["queued", "rendering"].includes(request.status.state)) return;
    request.controller.abort();
    request.status = { ...request.status, state: "cancelled", message: "Cancelled · lines shown. Membership kept." };
    request.notify();
    this.emit();
  }
  fail(entryId: string, message: string) {
    const request = this.requests.get(entryId);
    if (!request) return;
    request.controller.abort();
    request.geometry = undefined;
    request.status = { ...request.status, state: "fallback", message: `${message} Lines shown. Membership kept.` };
    this.emit();
  }
  request(entryId: string, label: string, input: SurfaceInput | null,
    notify: (geometry?: SurfaceGeometry) => void, unavailable?: string) {
    // Exact identity avoids hash collisions and excludes camera, colors and current selection.
    const key = input ? JSON.stringify([input.atomIds, input.x, input.y, input.z, input.radii, unavailable]) : `hidden:${unavailable ?? ""}`;
    const previous = this.requests.get(entryId);
    if (previous?.key === key) {
      previous.notify = notify;
      previous.status.label = label;
      if (!["queued", "rendering"].includes(previous.status.state)) notify(previous.geometry);
      this.emit();
      return;
    }
    this.remove(entryId);
    const request: Request = { key, controller: new AbortController(), notify,
      status: { entryId, label, state: input ? "queued" : "hidden", message: input ? "Queued" : "Hidden by visibility filters" } };
    this.requests.set(entryId, request);
    this.emit();
    if (!input) {
      if (unavailable) { this.fail(entryId, unavailable); notify(); }
      return;
    }
    try {
      if (unavailable) throw new Error(unavailable);
      surfaceAdmission(input);
    } catch (error) {
      this.fail(entryId, error instanceof Error ? error.message : "Surface input is unavailable.");
      notify();
      return;
    }
    void this.calculator.compute(input, request.controller.signal, (message) => {
      if (this.requests.get(entryId) !== request || request.controller.signal.aborted) return;
      request.status = { ...request.status, state: "rendering", message };
      this.emit();
    }).then((geometry) => {
      if (this.requests.get(entryId) !== request || request.controller.signal.aborted) return;
      const retained = [...this.requests.values()].reduce((sum, value) => sum + (value.geometry?.evidence.meshBytes ?? 0), 0);
      if (retained + geometry.evidence.meshBytes > SURFACE_LIMITS.retainedBytes) throw new Error("Viewer surface memory limit reached.");
      request.geometry = geometry;
      request.status = { ...request.status, state: "ready", message: `${input.atomIds.length.toLocaleString()} atoms · ready` };
      request.notify(geometry);
      this.emit();
    }).catch((error: unknown) => {
      if (this.requests.get(entryId) !== request || request.controller.signal.aborted) return;
      this.fail(entryId, error instanceof Error ? error.message : "Surface rendering failed.");
      request.notify();
    });
  }
  dispose() { this.retain(new Set()); this.calculator.dispose(); this.listeners.clear(); }
  private emit() { for (const listener of this.listeners) listener(this.statuses()); }
}
