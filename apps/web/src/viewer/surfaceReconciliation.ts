import type { SurfaceIdentity, SurfaceObject } from "../api/types";
import type { ViewerStructure } from "./MolecularViewer";

export const surfaceIdentityKey = (identity: SurfaceIdentity) => JSON.stringify([identity.entryId, identity.surfaceId]);
export const surfaceDefinitionKey = (source: ViewerStructure, surface: SurfaceObject) =>
  JSON.stringify([surface.source, source.pockets?.[surface.id] ?? null]);

interface EntrySnapshot {
  entryId: string;
  label: string;
  normalized: ViewerStructure["normalized"];
  hierarchy: ViewerStructure["hierarchy"];
  projection: ViewerStructure["projection"];
  atomIds: number[];
  settings: string;
  surfaces: Map<string, { definition: string; appearance: string; visible: boolean; name: string }>;
}
export interface SurfaceSyncSnapshot { isolation: string; entries: EntrySnapshot[] }

/** Only display definitions are serialized; molecular data retains immutable identity. */
export function captureSurfaceSync(sources: readonly ViewerStructure[], isolation: unknown): SurfaceSyncSnapshot {
  return { isolation: JSON.stringify(isolation), entries: sources.map(source => {
    const { surface_objects: surfaces, ...settings } = source.settings;
    return { entryId: source.entryId, label: source.label, normalized: source.normalized,
      hierarchy: source.hierarchy, projection: { ...source.projection }, atomIds: [...source.atomIds],
      settings: JSON.stringify(settings), surfaces: new Map(surfaces.map(surface => [surface.id, {
        definition: surfaceDefinitionKey(source, surface), appearance: JSON.stringify(surface.appearance),
        visible: surface.visible, name: surface.name,
      }])) };
  }) };
}

/** Undefined requires the existing conservative molecular rebuild. */
export function surfaceSyncChanges(previous: SurfaceSyncSnapshot | undefined, next: SurfaceSyncSnapshot): SurfaceIdentity[] | undefined {
  if (!previous || previous.isolation !== next.isolation || previous.entries.length !== next.entries.length) return undefined;
  const changes: SurfaceIdentity[] = [];
  for (let index = 0; index < next.entries.length; index++) {
    const a = previous.entries[index], b = next.entries[index];
    if (a.entryId !== b.entryId || a.label !== b.label || a.normalized !== b.normalized || a.hierarchy !== b.hierarchy
      || a.projection.format !== b.projection.format || a.projection.data !== b.projection.data || a.settings !== b.settings
      || a.atomIds.length !== b.atomIds.length || a.atomIds.some((id, i) => id !== b.atomIds[i])) return undefined;
    for (const id of new Set([...a.surfaces.keys(), ...b.surfaces.keys()])) {
      const old = a.surfaces.get(id), current = b.surfaces.get(id);
      if (!old || !current || old.definition !== current.definition || old.appearance !== current.appearance
        || old.visible !== current.visible || old.name !== current.name) changes.push({ entryId: b.entryId, surfaceId: id });
    }
  }
  return changes;
}

/** One running update and one replaceable latest intent per surface object. */
export class SurfaceUpdateQueue {
  private tasks = new Map<string, { latest?: () => Promise<void>; promise: Promise<void> }>();
  private disposed = false;
  request(key: string, update: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const previous = this.tasks.get(key);
    if (previous) { previous.latest = update; return previous.promise; }
    const task: { latest?: () => Promise<void>; promise: Promise<void> } = { latest: update, promise: Promise.resolve() };
    this.tasks.set(key, task);
    task.promise = Promise.resolve().then(async () => {
      let failure: { error: unknown } | undefined;
      try {
        while (!this.disposed && task.latest) {
          const latest = task.latest; task.latest = undefined;
          try { await latest(); failure = undefined; }
          catch (error) { failure = { error }; }
        }
        if (failure) throw failure.error;
      } finally {
        if (this.tasks.get(key) === task) this.tasks.delete(key);
      }
    });
    return task.promise;
  }
  dispose() { this.disposed = true; for (const task of this.tasks.values()) task.latest = undefined; this.tasks.clear(); }
}
