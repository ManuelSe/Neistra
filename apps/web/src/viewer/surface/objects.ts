import { EveryLoci } from "molstar/lib/mol-model/loci";
import type { Representation } from "molstar/lib/mol-repr/representation";
import { MarkerAction } from "molstar/lib/mol-util/marker-action";

/** Application identity; never a Mol* ref, residue, or atom selection. */
export interface SurfaceIdentity { entryId: string; surfaceId: string }

export const sameSurface = (a: SurfaceIdentity | null, b: SurfaceIdentity | null) =>
  a === b || Boolean(a && b && a.entryId === b.entryId && a.surfaceId === b.surfaceId);

/** Disposable representation bindings, separate from canonical molecular selection. */
export class SurfaceVisualRegistry {
  private visuals = new Map<Representation.Any, SurfaceIdentity>();
  private active: SurfaceIdentity | null = null;
  private listeners = new Set<(surface: SurfaceIdentity) => void>();

  register(representation: Representation.Any, identity: SurfaceIdentity) {
    this.visuals.set(representation, { ...identity });
    if (sameSurface(identity, this.active)) representation.mark(EveryLoci, MarkerAction.Highlight);
    return () => { this.visuals.delete(representation); };
  }
  pick(representation: Representation.Any | undefined) {
    const identity = this.identityFor(representation);
    if (!identity) return false;
    this.select(identity);
    for (const listener of this.listeners) listener({ ...identity });
    return true;
  }
  identityFor(representation: Representation.Any | undefined) {
    const identity = representation && this.visuals.get(representation);
    return identity ? { ...identity } : null;
  }
  select(identity: SurfaceIdentity | null) {
    this.active = identity ? { ...identity } : null;
    for (const [representation, owner] of this.visuals) {
      representation.mark(EveryLoci, sameSurface(owner, identity) ? MarkerAction.Highlight : MarkerAction.RemoveHighlight);
    }
  }
  subscribe(listener: (surface: SurfaceIdentity) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  clearVisuals() { this.visuals.clear(); }
  dispose() { this.clearVisuals(); this.active = null; this.listeners.clear(); }
}
