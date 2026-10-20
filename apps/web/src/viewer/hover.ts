import { PluginBehaviors } from "molstar/lib/mol-plugin/behavior";
import type { PluginSpec } from "molstar/lib/mol-plugin/spec";
import type { Representation } from "molstar/lib/mol-repr/representation";
import { EveryLoci, type Loci } from "molstar/lib/mol-model/loci";
import { MarkerAction } from "molstar/lib/mol-util/marker-action";
import type { SurfaceVisualRegistry } from "./surface/objects";

/** One owner replaces native hover, including its independent Shift-range path. */
export const applicationHoverBehaviors = (behaviors: PluginSpec.Behavior[]) =>
  behaviors.filter(behavior => behavior.transformer !== PluginBehaviors.Representation.HighlightLoci);

/** Canvas marking is queued. Exclude independent surfaces instead of trying to
 * restore their active highlight before a queued removal has actually run. */
export function markMolecularHover(
  representations: Iterable<Representation.Any>,
  surfaces: SurfaceVisualRegistry,
  loci: Loci,
  action: MarkerAction,
  mark: (target: Representation.Loci, action: MarkerAction) => void,
): void {
  // A coordinate refresh can retain marker buffers while replacing their model
  // root. Old-root loci then cannot remove the retained marks. This sole owner
  // clears the ordinary hover plane independently of molecular root identity.
  const current = action === MarkerAction.RemoveHighlight ? EveryLoci : loci;
  for (const repr of representations) if (!surfaces.identityFor(repr)) mark({ repr, loci: current }, action);
}
