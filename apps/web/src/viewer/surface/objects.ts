import { EveryLoci } from "molstar/lib/mol-model/loci";
import type { Representation } from "molstar/lib/mol-repr/representation";
import { MarkerAction } from "molstar/lib/mol-util/marker-action";
import type { SurfaceIdentity } from "../../api/types";
export type { SurfaceIdentity } from "../../api/types";

/** Application identity; never a Mol* ref, residue, or atom selection. */
export const sameSurface = (a: SurfaceIdentity | null, b: SurfaceIdentity | null) =>
  a === b || Boolean(a && b && a.entryId === b.entryId && a.surfaceId === b.surfaceId);

/** Disposable representation bindings, separate from canonical molecular selection. */
export class SurfaceVisualRegistry {
  private visuals = new Map<Representation.Any, SurfaceIdentity>();
  private retired = new WeakSet<Representation.Any>();
  private active: SurfaceIdentity | null = null;
  private listeners = new Set<(surface: SurfaceIdentity) => void>();

  register(representation: Representation.Any, identity: SurfaceIdentity) {
    const owner = { entryId: identity.entryId, surfaceId: identity.surfaceId };
    this.visuals.set(representation, owner);
    this.retired.delete(representation);
    if (sameSurface(identity, this.active)) representation.mark(EveryLoci, MarkerAction.Highlight);
    return () => {
      if (this.visuals.get(representation) !== owner) return;
      this.visuals.delete(representation); this.retired.add(representation);
    };
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
  isRetired(representation: Representation.Any | undefined): boolean {
    return Boolean(representation && this.retired.has(representation));
  }
  isManaged(representation: Representation.Any | undefined): boolean {
    return Boolean(representation && (this.visuals.has(representation) || this.retired.has(representation)));
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
  clearVisuals() { for (const representation of this.visuals.keys()) this.retired.add(representation); this.visuals.clear(); }
  dispose() { this.clearVisuals(); this.active = null; this.listeners.clear(); }
}
