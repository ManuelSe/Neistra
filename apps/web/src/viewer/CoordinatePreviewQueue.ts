import type { CoordinatePatch } from "../api/types";
import type { MolecularViewer } from "./MolecularViewer";

/** One active renderer operation and only the latest pending preview frame. */
export class CoordinatePreviewQueue {
  private pending: CoordinatePatch[] | null = null;
  private preparePending = false;
  private commits: CoordinatePatch[] = [];
  private applied = new Set<string>();
  private running = false;
  private disposed = false;
  private epoch = 0;
  private gpuWait: AbortController | null = null;
  constructor(private readonly viewer: Pick<MolecularViewer, "applyCoordinatePatch" | "clearCoordinatePreview" | "prepareCoordinatePreview">, private readonly onError: (error: unknown) => void) {}

  set(patches: CoordinatePatch[], prepare = false) {
    if (this.disposed) return;
    this.epoch += 1;
    this.pending = patches;
    this.preparePending = prepare;
    if (!patches.length || !prepare) this.gpuWait?.abort();
    void this.drain();
  }

  commit(patches: CoordinatePatch[]) {
    if (this.disposed) return;
    this.epoch += 1;
    this.pending = null;
    this.commits.push(...patches);
    this.gpuWait?.abort();
    void this.drain();
  }

  dispose() {
    this.disposed = true;
    this.gpuWait?.abort();
    this.pending = null;
    this.commits = [];
  }

  private shouldAbortPreview(epoch: number) {
    return this.disposed || this.epoch !== epoch || this.commits.length > 0;
  }

  private async drain() {
    if (this.running || this.disposed) return;
    this.running = true;
    try {
      while (!this.disposed && (this.pending !== null || this.commits.length)) {
        if (this.commits.length) {
          const commits = this.commits.splice(0);
          for (const patch of commits) {
            await this.viewer.applyCoordinatePatch(patch, "commit");
            this.applied.delete(patch.entry_id);
          }
          continue;
        }
        // Native buffers may still be in use after a state update resolves. Yield
        // without blocking the UI, then consume the latest frame that arrived while
        // waiting. Cancellation/commits take precedence over that obsolete frame.
        if (this.pending?.length && this.preparePending && this.viewer.prepareCoordinatePreview) {
          this.gpuWait = new AbortController();
          try { await this.viewer.prepareCoordinatePreview(this.gpuWait.signal); }
          finally { this.gpuWait = null; }
        }
        if (this.disposed) break;
        if (this.commits.length || this.pending === null) continue;
        const patches = this.pending;
        const epoch = this.epoch;
        this.pending = null;
        const ids = new Set(patches.map(patch => patch.entry_id));
        for (const id of this.applied) {
          if (this.shouldAbortPreview(epoch)) break;
          if (!ids.has(id)) { await this.viewer.clearCoordinatePreview(id); this.applied.delete(id); }
        }
        for (const patch of patches) {
          if (this.shouldAbortPreview(epoch)) break;
          // Track before awaiting: partial failures still require restoration.
          this.applied.add(patch.entry_id);
          await this.viewer.applyCoordinatePatch(patch, "preview");
        }
      }
    } catch (error) {
      this.pending = null;
      this.commits = [];
      if (!this.disposed) this.onError(error);
    } finally {
      this.running = false;
    }
  }
}
