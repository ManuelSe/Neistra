import { propertyTargetKey, type PropertyTarget } from "./session";

export interface PropertyOwnerContext {
  activeProjectId: string | null;
  inspectedEntryId: string | null;
  inputKey: string;
  paused: boolean;
}

/** Synchronous exact-target visits, independent of unrelated project entries. */
export class PropertyInputOwner {
  private generation = 0;
  private active = true;
  private previous: PropertyOwnerContext | null = null;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly read: () => PropertyOwnerContext) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.generation;
  activate = () => { this.active = true; };
  deactivate = () => { this.active = false; };
  observe = () => { this.refresh(true); };
  private refresh(notify: boolean): PropertyOwnerContext {
    const current = this.read(), previous = this.previous;
    this.previous = current;
    if (previous && (previous.activeProjectId !== current.activeProjectId || previous.inspectedEntryId !== current.inspectedEntryId
      || previous.inputKey !== current.inputKey || previous.paused !== current.paused)) {
      this.generation++;
      if (notify) for (const listener of this.listeners) listener();
    }
    return current;
  }
  isPaused = () => this.refresh(false).paused;
  matches(target: PropertyTarget): boolean {
    const current = this.refresh(false);
    return this.active && !current.paused && current.activeProjectId === target.projectId
      && current.inspectedEntryId === target.source.entry_id && current.inputKey === propertyTargetKey(target);
  }
  capture(target: PropertyTarget): () => boolean {
    this.refresh(false);
    const generation = this.generation;
    return () => { this.refresh(true); return generation === this.generation && this.matches(target); };
  }
}
