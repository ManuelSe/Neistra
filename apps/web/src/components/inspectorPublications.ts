import { notifyManager, type QueryClient } from "@tanstack/react-query";

type Subscribe = (listener: () => void) => () => void;

/** Match the query observers' notification batch, so the boundary and the child
 * publish in the same React commit rather than two separately scheduled commits.
 */
export function inspectorQueryPublications(client: QueryClient, current: () => { projectId: string | null; entryId: string | null }): Subscribe {
  return listener => {
    let active = true;
    const notify = notifyManager.batchCalls((projectId: string, entryId: string) => {
      const latest = current();
      if (active && latest.projectId === projectId && latest.entryId === entryId) listener();
    });
    const stop = client.getQueryCache().subscribe(event => {
      const { projectId, entryId } = current();
      if (event.type !== "updated" || !projectId || !entryId) return;
      const key = event.query.queryKey as readonly unknown[];
      if ((key[0] === "ligand-candidates" && key[2] === projectId && key[3] === entryId)
        || (key[0] === "ligand-depiction" && key[4] === projectId && key[5] === entryId)) notify(projectId, entryId);
    });
    return () => { active = false; stop(); };
  };
}

/** Presentation notifications only. Existing producers retain all data and ownership. */
export class InspectorPublications {
  private revision = 0;
  private readonly listeners = new Set<() => void>();
  private release: (() => void)[] = [];
  constructor(private readonly sources: readonly Subscribe[] = []) {}
  snapshot = () => this.revision;
  publish = () => { this.revision++; for (const listener of this.listeners) listener(); };
  subscribe: Subscribe = listener => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.release = this.sources.map(subscribe => subscribe(this.publish));
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) { this.release.forEach(stop => stop()); this.release = []; }
    };
  };
}
