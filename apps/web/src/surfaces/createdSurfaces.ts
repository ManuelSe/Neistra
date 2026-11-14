import type { Project, SurfaceCreateItem, SurfaceIdentity } from "../api/types";

/** A successful command owns its returned additions, including duplicate requests. */
export function createdSurfaceIdentities(before: Project, after: Project, items: readonly SurfaceCreateItem[]): SurfaceIdentity[] {
  const uncertain = () => new Error("Surface definitions were saved, but their new identities could not be confirmed. Inspect Surfaces before creating again.");
  if (before.id !== after.id) throw uncertain();
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.entry_id, (counts.get(item.entry_id) ?? 0) + 1);
  const additions = new Map<string, SurfaceIdentity[]>();
  for (const [entryId, count] of counts) {
    const previous = before.entries.find(entry => entry.id === entryId);
    const current = after.entries.find(entry => entry.id === entryId);
    if (!previous || !current) throw uncertain();
    const known = new Set(previous.viewer_settings.surface_objects.map(surface => surface.id));
    const created = current.viewer_settings.surface_objects.filter(surface => !known.has(surface.id));
    if (created.length !== count || new Set(created.map(surface => surface.id)).size !== count) throw uncertain();
    additions.set(entryId, created.map(surface => ({ entryId, surfaceId: surface.id })));
  }
  return items.map(item => {
    const identity = additions.get(item.entry_id)?.shift();
    if (!identity) throw uncertain();
    return identity;
  });
}
