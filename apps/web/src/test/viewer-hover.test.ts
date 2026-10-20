import { expect, it, vi } from "vitest";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import { PluginBehaviors } from "molstar/lib/mol-plugin/behavior";
import type { Representation } from "molstar/lib/mol-repr/representation";
import { EmptyLoci, EveryLoci } from "molstar/lib/mol-model/loci";
import { MarkerAction } from "molstar/lib/mol-util/marker-action";
import { applicationHoverBehaviors, markMolecularHover } from "../viewer/hover";
import { SurfaceVisualRegistry } from "../viewer/surface/objects";

it("removes only competing native hover while retaining selection, labels and camera behaviors", () => {
  const defaults = DefaultPluginUISpec().behaviors;
  const actual = applicationHoverBehaviors(defaults);
  expect(actual).toHaveLength(defaults.length - 1);
  expect(actual.some(b => b.transformer === PluginBehaviors.Representation.HighlightLoci)).toBe(false);
  for (const b of defaults) if (b.transformer !== PluginBehaviors.Representation.HighlightLoci) expect(actual).toContain(b);
});

it("keeps both active and inactive managed surfaces outside queued molecular highlight actions", () => {
  const registry = new SurfaceVisualRegistry();
  const surface = { mark: vi.fn() } as unknown as Representation.Any;
  const other = { mark: vi.fn() } as unknown as Representation.Any;
  const molecule = { mark: vi.fn() } as unknown as Representation.Any;
  registry.register(surface, { entryId: "entry", surfaceId: "first" });
  registry.register(other, { entryId: "entry", surfaceId: "other" });
  registry.pick(surface);
  const mark = vi.fn();
  for (const action of [MarkerAction.Highlight, MarkerAction.RemoveHighlight]) {
    markMolecularHover([surface, molecule, other], registry, EmptyLoci, action, mark);
    expect(mark).toHaveBeenLastCalledWith({ repr: molecule,
      loci: action === MarkerAction.RemoveHighlight ? EveryLoci : EmptyLoci }, action);
  }
  expect(mark).toHaveBeenCalledTimes(2);
  expect(surface.mark).toHaveBeenLastCalledWith({ kind: "every-loci" }, MarkerAction.Highlight);
});
