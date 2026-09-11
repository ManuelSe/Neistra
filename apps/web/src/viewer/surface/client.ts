import { SURFACE_LIMITS, type SurfaceGeometry, type SurfaceInput, type SurfaceWorkerResponse } from "./protocol";

/** A viewer owns one queue: even requests for distinct entries never run concurrently. */
export class SurfaceCalculator {
  private queue: Promise<unknown> = Promise.resolve();
  private active: AbortController | undefined;
  private disposed = false;
  constructor(private readonly makeWorker = () => new Worker(new URL("./surface.worker.ts", import.meta.url), { type: "module" })) {}

  compute(input: SurfaceInput, signal: AbortSignal, progress?: (message: string) => void): Promise<SurfaceGeometry> {
    const next = this.queue.then(() => {
      signal.throwIfAborted();
      if (this.disposed) throw new DOMException("Surface viewer disposed.", "AbortError");
      return this.run(input, signal, progress);
    });
    this.queue = next.catch(() => {});
    return next;
  }

  dispose() { this.disposed = true; this.active?.abort(); }

  private run(input: SurfaceInput, signal: AbortSignal, progress?: (message: string) => void): Promise<SurfaceGeometry> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      this.active = controller;
      let worker: Worker | undefined;
      let settled = false;
      const cleanup = () => {
        settled = true;
        clearTimeout(timeout);
        worker?.terminate();
        signal.removeEventListener("abort", abort);
        controller.signal.removeEventListener("abort", abort);
        this.active = undefined;
      };
      const abort = () => { cleanup(); reject(new DOMException("Surface rendering cancelled.", "AbortError")); };
      const timeout = setTimeout(() => { cleanup(); reject(new Error("Surface exceeded the 30 second calculation limit.")); }, SURFACE_LIMITS.deadlineMs);
      signal.addEventListener("abort", abort, { once: true });
      controller.signal.addEventListener("abort", abort, { once: true });
      try {
        worker = this.makeWorker();
        worker.onmessage = ({ data }: MessageEvent<SurfaceWorkerResponse>) => {
          if (settled) return;
          if (data.kind === "progress") { progress?.(data.message); return; }
          cleanup();
          if (data.kind === "complete") resolve(data.geometry);
          else reject(new Error(data.message));
        };
        worker.onerror = () => { cleanup(); reject(new Error("Surface worker failed.")); };
        // Clone input: the caller retains it for geometry identity/caching.
        worker.postMessage(input);
      } catch (error) { cleanup(); reject(error instanceof Error ? error : new Error("Surface worker could not start.")); }
    });
  }
}
