import { SurfaceCalculator } from "./client";
import { surfaceAdmission } from "./geometry";
import { SURFACE_LIMITS, surfaceKey, type SurfaceChannel, type SurfaceGeometry, type SurfaceInput } from "./protocol";

export interface SurfaceStatus {
  entryId: string;
  channel: SurfaceChannel;
  label: string;
  state: "queued" | "rendering" | "ready" | "cancelled" | "fallback" | "hidden" | "empty";
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
    for (const [key, request] of this.requests) if (!entries.has(key)) this.remove(request.status.entryId, request.status.channel);
  }
  remove(entryId: string, channel: SurfaceChannel) {
    const id = surfaceKey(entryId, channel);
    const request = this.requests.get(id);
    this.requests.delete(id);
    request?.controller.abort();
    this.emit();
  }
  cancel(entryId: string, channel: SurfaceChannel) {
    const id = surfaceKey(entryId, channel);
    const request = this.requests.get(id);
    if (!request || !["queued", "rendering"].includes(request.status.state)) return;
    request.controller.abort();
    request.status = { ...request.status, state: "cancelled", message: channel === "pocket" ? "Cancelled · definition kept." : "Cancelled · lines shown. Membership kept." };
    request.notify();
    this.emit();
  }
  fail(entryId: string, channel: SurfaceChannel, message: string, linesShown = true) {
    const id = surfaceKey(entryId, channel);
    const request = this.requests.get(id);
    if (!request) return;
    request.controller.abort();
    request.geometry = undefined;
    request.status = { ...request.status, state: "fallback", message: `${message}${linesShown && channel === "fragment" ? " Lines shown." : ""} ${channel === "pocket" ? "Definition" : "Membership"} kept.` };
    this.emit();
  }
  request(entryId: string, channel: SurfaceChannel, label: string, dependencyKey: string, createInput: (() => SurfaceInput) | null,
    notify: (geometry?: SurfaceGeometry) => void, unavailable?: string) {
    const id = surfaceKey(entryId, channel);
    // Revision + effective membership identifies geometry. Input allocation is lazy:
    // cached color-only rebuilds neither serialize coordinates nor extract atoms.
    const key = JSON.stringify([dependencyKey, unavailable, Boolean(createInput)]);
    const previous = this.requests.get(id);
    if (previous?.key === key) {
      previous.notify = notify;
      previous.status.label = label;
      if (!["queued", "rendering"].includes(previous.status.state)) notify(previous.geometry);
      this.emit();
      return;
    }
    this.remove(entryId, channel);
    const request: Request = { key, controller: new AbortController(), notify,
      status: { entryId, channel, label, state: createInput ? "queued" : "hidden", message: createInput ? "Queued" : "Hidden by visibility filters" } };
    this.requests.set(id, request);
    this.emit();
    if (!createInput) {
      if (unavailable) { this.fail(entryId, channel, unavailable); notify(); }
      return;
    }
    let input: SurfaceInput;
    try {
      if (unavailable) throw new Error(unavailable);
      input = createInput();
      if ((channel === "pocket") !== Boolean(input.pocket)) throw new Error("Surface channel/profile mismatch.");
      surfaceAdmission(input);
    } catch (error) {
      this.fail(entryId, channel, error instanceof Error ? error.message : "Surface input is unavailable.");
      notify();
      return;
    }
    void this.calculator.compute(input, request.controller.signal, (message) => {
      if (this.requests.get(id) !== request || request.controller.signal.aborted) return;
      request.status = { ...request.status, state: "rendering", message };
      this.emit();
    }).then((geometry) => {
      if (this.requests.get(id) !== request || request.controller.signal.aborted) return;
      const retained = [...this.requests.values()].reduce((sum, value) => sum + (value.geometry ? value.geometry.evidence.meshBytes + (value.status.channel === "pocket" ? value.geometry.indices.byteLength : 0) : 0), 0);
      if (retained + geometry.evidence.meshBytes + (channel === "pocket" ? geometry.indices.byteLength : 0) > SURFACE_LIMITS.retainedBytes) throw new Error("Viewer surface memory limit reached.");
      request.geometry = geometry;
      request.status = { ...request.status, state: channel === "pocket" && !geometry.indices.length ? "empty" : "ready", message: channel === "pocket" && !geometry.indices.length ? "No protein surface within this radius. Definition kept." : `${input.atomIds.length.toLocaleString()} atoms · ready` };
      request.notify(geometry);
      this.emit();
    }).catch((error: unknown) => {
      if (this.requests.get(id) !== request || request.controller.signal.aborted) return;
      this.fail(entryId, channel, error instanceof Error ? error.message : "Surface rendering failed.");
      request.notify();
    });
  }
  dispose() { this.retain(new Set()); this.calculator.dispose(); this.listeners.clear(); }
  private emit() { for (const listener of this.listeners) listener(this.statuses()); }
}
