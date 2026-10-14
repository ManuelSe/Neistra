import type { Project, ViewerSettings } from "../api/types";

/** Explain topology reconciliation without changing immutable molecular warnings. */
export function surfacePruningWarnings(before: Project, after: Project): string[] {
  if (before.id !== after.id) return [];
  const remaining = new Map(after.entries.map(entry => [entry.id, new Set(entry.atom_ids)]));
  if (!before.entries.some(entry => entry.atom_ids.some(id => !remaining.get(entry.id)?.has(id)))) return [];
  const warnings: string[] = [];
  const compare = (oldSettings: ViewerSettings, settings: ViewerSettings | undefined, context: string) => {
    if (!settings) return; // Deleting an owner is already an explicit user action.
    for (const old of oldSettings.surface_objects) {
      if (old.source.kind === "entry") continue;
      const current = settings.surface_objects.find(surface => surface.id === old.id);
      if (!current) warnings.push(`${context}: surface “${old.name}” was removed because no captured ${old.source.kind === "fragment" ? "atoms" : "seeds"} remain.`);
      else if (JSON.stringify(current.source) !== JSON.stringify(old.source)) warnings.push(`${context}: deleted references were removed from surface “${old.name}”.`);
    }
  };
  for (const entry of before.entries) compare(entry.viewer_settings, after.entries.find(item => item.id === entry.id)?.viewer_settings, entry.name);
  for (const scene of before.scenes) {
    const current = after.scenes.find(item => item.id === scene.id);
    for (const entry of scene.entry_states) compare(entry.viewer_settings, current?.entry_states.find(item => item.entry_id === entry.entry_id)?.viewer_settings, `Scene “${scene.name}”`);
  }
  return warnings;
}
