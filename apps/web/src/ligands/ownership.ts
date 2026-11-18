import { ApiError } from "../api/client";
import type { Project } from "../api/types";

export interface LigandOwnerContext {
  activeProjectId: string | null;
  project: Project | undefined;
  inspectedEntryId: string | null;
  paused: boolean;
  blocked: boolean;
}

export interface LigandCommandOwner {
  readonly ownsFeedback: () => boolean;
  readonly assertDispatchable: (project: Project, entryIds: readonly string[]) => void;
}

const sourceKeys = new WeakMap<Project, string>();
function sources(project: Project | undefined): string {
  if (!project) return "";
  let key = sourceKeys.get(project);
  if (key === undefined) {
    key = JSON.stringify(project.entries.map(entry => [entry.id, entry.current_artifact_id,
      entry.original_artifact_id]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    sourceKeys.set(project, key);
  }
  return key;
}

/** Synchronous visits cannot be restored by a batched A→B→A or preview Cancel. */
export class LigandIntentOwner {
  private active = true;
  private generation = 0;
  private navigation = 0;
  private visit = 0;
  private previous: { projectId: string | null; sources: string; entryId: string | null; paused: boolean } | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly read: () => LigandOwnerContext) {}

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.generation + this.navigation;
  openVisit = () => this.visit;

  observe = () => this.refresh(true);

  private refresh(notify: boolean) {
    const current = this.read();
    const next = { projectId: current.activeProjectId, sources: sources(current.project),
      entryId: current.inspectedEntryId, paused: current.paused };
    const previous = this.previous;
    this.previous = next;
    if (!previous) return;
    let changed = false;
    if (previous.projectId !== next.projectId) { this.visit++; this.generation++; changed = true; }
    else if (previous.sources !== next.sources || previous.paused !== next.paused) { this.generation++; changed = true; }
    if (previous.entryId !== next.entryId) { this.navigation++; changed = true; }
    if (changed && notify) for (const listener of this.listeners) listener();
  }

  /** Numerical preview publication runs before React or any subscription render. */
  retire = () => {
    this.generation++;
    for (const listener of this.listeners) listener();
  };

  // Effect setup replay is the same logical mount. True unmount disables every
  // retained owner immediately; a newly mounted App creates a different owner.
  activate = () => { this.active = true; };
  deactivate = () => { this.active = false; };

  capture(manual: boolean): LigandCommandOwner {
    // Capture can run during App render. Store subscriptions publish retirement;
    // this last synchronous check must not notify React from another render.
    this.refresh(false);
    const generation = this.generation, navigation = this.navigation;
    const owner = this.read().activeProjectId;
    const ownsFeedback = () => {
      this.observe();
      const current = this.read();
      return this.active && generation === this.generation && (!manual || navigation === this.navigation)
        && current.activeProjectId === owner && !current.paused;
    };
    return {
      ownsFeedback,
      assertDispatchable: (project, entryIds) => {
        const current = this.read().project;
        if (!ownsFeedback() || this.read().blocked || !current || current.id !== project.id || current.revision !== project.revision
          || entryIds.some(id => {
            const before = project.entries.find(entry => entry.id === id);
            const after = current.entries.find(entry => entry.id === id);
            return !before || !after || before.current_artifact_id !== after.current_artifact_id
              || before.original_artifact_id !== after.original_artifact_id;
          })) {
          throw new ApiError(409, "ligand_context_changed", "The ligand context changed. Review the current entry before choosing it.");
        }
      },
    };
  }
}
