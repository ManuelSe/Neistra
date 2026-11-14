import { EveryLoci } from "molstar/lib/mol-model/loci";
import type { Representation } from "molstar/lib/mol-repr/representation";
import { MarkerAction } from "molstar/lib/mol-util/marker-action";
import type { SurfaceIdentity } from "../../api/types";
export type { SurfaceIdentity } from "../../api/types";

/** Disposable representation bindings, separate from canonical molecular selection. */
export class SurfaceVisualRegistry {
  private visuals = new Map<Representation.Any, SurfaceIdentity>();
  private retired = new WeakSet<Representation.Any>();

  register(representation: Representation.Any, identity: SurfaceIdentity) {
    const owner = { entryId: identity.entryId, surfaceId: identity.surfaceId };
    this.visuals.set(representation, owner);
    this.retired.delete(representation);
    makeSurfacePassive(representation);
    return () => {
      if (this.visuals.get(representation) !== owner) return;
      this.visuals.delete(representation); this.retired.add(representation);
    };
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
  clearVisuals() { for (const representation of this.visuals.keys()) this.retired.add(representation); this.visuals.clear(); }
  dispose() { this.clearVisuals(); }
}

/** Surfaces are visual context; only ordinary molecular representations receive input/marks. */
export function makeSurfacePassive(representation: Representation.Any): void {
  // Clear marks acquired during installation or retained by a reused visual before masking.
  representation.mark(EveryLoci, MarkerAction.Clear);
  representation.setState({ pickable: false, markerActions: 0 });
}
