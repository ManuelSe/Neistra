import type { AtomReference, Entry, SurfaceAppearance, SurfaceObject, SurfaceSource } from "../api/types";
import type { SurfaceIdentity } from "../viewer/surface/objects";

export interface SurfaceCreationRequest {
  id: string;
  kind?: SurfaceSource["kind"];
  entryId?: string;
  selection: AtomReference[];
}

export interface SurfaceSourceDraft {
  identity: SurfaceIdentity;
  baseline: string;
  source: SurfaceSource;
  radiusText?: string;
}

export interface SurfaceAppearancePreview {
  identity: SurfaceIdentity;
  token: number;
  appearance: SurfaceAppearance;
  phase: "gesture" | "saving" | "uncertain";
  baseline: { appearance: SurfaceAppearance; source: string; entryVisible: boolean; surfaceVisible: boolean };
}

export const surfaceObjectKey = (identity: SurfaceIdentity) => JSON.stringify([identity.entryId, identity.surfaceId]);
export const sameAppearance = (a: SurfaceAppearance, b: SurfaceAppearance) =>
  a.color_by === b.color_by && a.custom_color === b.custom_color && a.opacity === b.opacity
  && a.mode === b.mode && a.inherit_atom_colors === b.inherit_atom_colors;

export function previewDisposition(preview: SurfaceAppearancePreview, entry?: Entry, surface?: SurfaceObject): "retain" | "confirmed" | "retired" {
  if (!entry || !surface || entry.visible !== preview.baseline.entryVisible || surface.visible !== preview.baseline.surfaceVisible
    || sourceFingerprint(surface.source) !== preview.baseline.source) return "retired";
  if (preview.phase !== "gesture" && sameAppearance(surface.appearance, preview.appearance)) return "confirmed";
  return sameAppearance(surface.appearance, preview.baseline.appearance) ? "retain" : "retired";
}

/** Source identity excludes appearance, coordinates and disposable renderer state. */
export function sourceFingerprint(source: SurfaceSource): string {
  if (source.kind === "entry") return "entry";
  if (source.kind === "fragment") return JSON.stringify([source.kind, source.profile, [...source.atom_ids].sort((a, b) => a - b)]);
  return JSON.stringify([source.kind, source.profile, source.radius, [...source.seed_atom_references]
    .sort((a, b) => a.structure_id.localeCompare(b.structure_id) || a.atom_id - b.atom_id)]);
}

export function draftSource(draft: SurfaceSourceDraft): SurfaceSource | null {
  if (draft.source.kind !== "pocket") return draft.source;
  const text = draft.radiusText ?? String(draft.source.radius), radius = Number(text);
  if (!text.trim() || !Number.isFinite(radius) || radius < 2 || radius > 12 || !Number.isInteger(radius * 2)) return null;
  return { ...draft.source, radius };
}

export function sourceDraftProblem(draft: SurfaceSourceDraft, entries: readonly Entry[]): string | null {
  const owner = entries.find(entry => entry.id === draft.identity.entryId);
  const current = owner?.viewer_settings.surface_objects.find(surface => surface.id === draft.identity.surfaceId);
  if (!owner || !current) return "This surface no longer exists.";
  if (sourceFingerprint(current.source) !== draft.baseline) return "The saved source changed. Revert or recapture the selection before applying.";
  const value = draftSource(draft);
  if (!value) return "Use a radius from 2 to 12 Å in 0.5 Å steps.";
  if (value.kind !== current.source.kind) return "The surface source changed. Revert before editing.";
  if (value.kind === "fragment") {
    const available = new Set(owner.atom_ids);
    if (!value.atom_ids.length || value.atom_ids.some(id => !available.has(id))) return "Captured atoms are unavailable. Recapture a current selection.";
  } else if (value.kind === "pocket") {
    const available = new Map(entries.map(entry => [entry.id, new Set(entry.atom_ids)]));
    if (!value.seed_atom_references.length || value.seed_atom_references.some(atom => !available.get(atom.structure_id)?.has(atom.atom_id))) {
      return "Captured seeds are unavailable. Recapture a current selection.";
    }
  }
  return null;
}

interface SessionSnapshot {
  drafts: Readonly<Record<string, SurfaceSourceDraft>>;
  previews: Readonly<Record<string, SurfaceAppearancePreview>>;
  working: boolean;
  feedback: { text: string; failed: boolean; recheck?: boolean } | null;
}

/** Small project-local UI session, retained by App across viewer remounts. */
export class SurfaceManagerSession {
  private snapshot: SessionSnapshot = { drafts: {}, previews: {}, working: false, feedback: null };
  private listeners = new Set<() => void>();
  private serial = 0;
  constructor(readonly projectId: string) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  hasUnappliedDrafts = () => Object.keys(this.snapshot.drafts).length > 0;
  private publish(change: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
  setWorking(value: boolean) { this.publish({ working: value }); }
  setFeedback(feedback: SessionSnapshot["feedback"]) { this.publish({ feedback }); }
  stageSource(identity: SurfaceIdentity, saved: SurfaceSource, source: SurfaceSource, radiusText?: string, recapture = false) {
    const key = surfaceObjectKey(identity), previous = this.snapshot.drafts[key];
    const baseline = previous && !recapture ? previous.baseline : sourceFingerprint(saved);
    const draft = { identity: { ...identity }, baseline, source: structuredClone(source), radiusText };
    const parsed = draftSource(draft);
    if (parsed && sourceFingerprint(parsed) === baseline) { this.revertSource(identity); return; }
    this.publish({ drafts: { ...this.snapshot.drafts, [key]: draft } });
  }
  revertSource(identity: SurfaceIdentity) {
    const drafts = { ...this.snapshot.drafts }; delete drafts[surfaceObjectKey(identity)]; this.publish({ drafts });
  }
  acceptSource(identity: SurfaceIdentity, submitted: SurfaceSourceDraft) {
    if (this.snapshot.drafts[surfaceObjectKey(identity)] === submitted) this.revertSource(identity);
  }
  beginPreview(identity: SurfaceIdentity, entry: Entry, surface: SurfaceObject) {
    const key = surfaceObjectKey(identity), token = ++this.serial;
    const appearance = { ...surface.appearance };
    this.publish({ previews: { ...this.snapshot.previews, [key]: { identity: { ...identity }, token, appearance,
      phase: "gesture", baseline: { appearance, source: sourceFingerprint(surface.source), entryVisible: entry.visible, surfaceVisible: surface.visible } } } });
    return token;
  }
  preview(identity: SurfaceIdentity, appearance: SurfaceAppearance, phase: SurfaceAppearancePreview["phase"], token: number) {
    const key = surfaceObjectKey(identity), current = this.snapshot.previews[key];
    if (!current || current.token !== token) return false;
    this.publish({ previews: { ...this.snapshot.previews, [key]: { ...current, appearance: { ...appearance }, phase } } });
    return true;
  }
  clearPreview(identity: SurfaceIdentity, token?: number) {
    const key = surfaceObjectKey(identity);
    if (token !== undefined && this.snapshot.previews[key]?.token !== token) return false;
    const previews = { ...this.snapshot.previews }; delete previews[key]; this.publish({ previews }); return true;
  }
  reconcile(entries: readonly Entry[]) {
    const current = new Map(entries.flatMap(entry => entry.viewer_settings.surface_objects.map(surface => [surfaceObjectKey({ entryId: entry.id, surfaceId: surface.id }), { entry, surface }] as const)));
    let changed = false;
    const drafts = { ...this.snapshot.drafts };
    for (const key of Object.keys(drafts)) if (!current.has(key)) { delete drafts[key]; changed = true; }
    const previews = { ...this.snapshot.previews }, released: SurfaceAppearancePreview[] = [];
    for (const [key, preview] of Object.entries(previews)) {
      const owner = current.get(key);
      if (previewDisposition(preview, owner?.entry, owner?.surface) !== "retain") { delete previews[key]; released.push(preview); changed = true; }
    }
    if (changed) this.publish({ drafts, previews });
    return released;
  }
}

export const createSurfaceManagerSession = (projectId: string) => new SurfaceManagerSession(projectId);
