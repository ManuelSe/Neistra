import type { CoordinatePatch } from "../api/types";
import type { MolecularViewer } from "./MolecularViewer";

/** One active renderer operation and only the latest pending preview frame. */
export class CoordinatePreviewQueue {
  private pending: CoordinatePatch[] | null = null;
  private commits: CoordinatePatch[] = [];
  private applied = new Set<string>();
  private running = false;
  private disposed = false;
  constructor(private readonly viewer: Pick<MolecularViewer, "applyCoordinatePatch" | "clearCoordinatePreview">, private readonly onError: (error: unknown) => void) {}

  set(patches: CoordinatePatch[]) {
    if (this.disposed) return;
    this.pending = patches;
    void this.drain();
  }

  commit(patches: CoordinatePatch[]) {
    if (this.disposed) return;
    this.pending = null;
    this.commits.push(...patches);
    void this.drain();
  }

  dispose() {
    this.disposed = true;
    this.pending = null;
    this.commits = [];
  }

  private shouldAbortPreview() {
    return this.disposed || this.commits.length > 0 || this.pending?.length === 0;
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
        const patches = this.pending!;
        this.pending = null;
        const ids = new Set(patches.map(patch => patch.entry_id));
        for (const id of this.applied) {
          if (!ids.has(id)) { await this.viewer.clearCoordinatePreview(id); this.applied.delete(id); }
        }
        for (const patch of patches) {
          if (this.shouldAbortPreview()) break;
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
