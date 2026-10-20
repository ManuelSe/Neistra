/** Native observation only. Never imported by production. */
import { PluginStateObject } from "molstar/lib/mol-plugin-state/objects";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { Loci } from "molstar/lib/mol-model/loci";
import type { MolstarEngine } from "../viewer/MolstarEngine";
import type { AtomReference } from "../api/types";
import { canonicalSelection } from "../selection/selection";
import type { PickingTarget } from "../viewer/pickingTargets";

export function observeHover(engine: MolstarEngine) {
  const native = engine as unknown as { plugin: PluginUIContext; syncQueue: Promise<void>;
    hoverTarget: { atoms: AtomReference[] } | null; heldPointers: Set<number>; generation: number; boundGeneration: number;
    pickingTarget(loci: Loci): PickingTarget; referencesFromLoci(loci: Loci): AtomReference[] };
  let resolutions = 0;
  const originalResolve = native.pickingTarget.bind(native);
  native.pickingTarget = function(loci) { resolutions++; return originalResolve(loci); };
  let hoverSamples = 0, markerActions = 0, cameraEvents = 0;
  const stopCamera = engine.subscribeCamera(() => { cameraEvents++; });
  let lastHover: { atoms: AtomReference[]; buttons: number } | null = null;
  const hover = native.plugin.behaviors.interaction.hover.subscribe(({ current, buttons }) => {
    hoverSamples++; lastHover = { atoms: native.referencesFromLoci(current.loci), buttons };
  });
  const provider = () => { markerActions++; };
  native.plugin.managers.interactivity.lociHighlights.addProvider(provider);
  return {
    inspect() {
      const highlighted: AtomReference[] = [], selected: AtomReference[] = [];
      for (const cell of native.plugin.state.data.cells.values()) {
        if (!PluginStateObject.Molecule.Structure.Representation3D.is(cell.obj)) continue;
        const repr = cell.obj.data.repr;
        for (const object of repr.renderObjects) {
          const values = object.values;
          const groups = values.uGroupCount.ref.value, instances = values.instanceCount.ref.value;
          const markers = values.tMarker.ref.value.array;
          for (let instanceId = 0; instanceId < instances; instanceId++) for (let groupId = 0; groupId < groups; groupId++) {
            const marker = markers[instanceId * groups + groupId];
            if (!marker) continue;
            const atoms = native.referencesFromLoci(repr.getLoci({ objectId: object.id, groupId, instanceId }));
            // Atom primitives independently establish exact rendered membership;
            // bonds may identify two endpoints and are deliberately excluded.
            if (atoms.length !== 1) continue;
            if (marker & 1) highlighted.push(...atoms);
            if (marker & 2) selected.push(...atoms);
          }
        }
      }
      return { highlighted: canonicalSelection(highlighted).atoms, selected: canonicalSelection(selected).atoms,
        hoverSamples, markerActions, resolutions, cameraEvents, camera: engine.getCamera(), lastHover,
        target: native.hoverTarget?.atoms ?? [], held: native.heldPointers.size,
        busy: native.plugin.isBusy, generation: native.generation, boundGeneration: native.boundGeneration };
    },
    dispose() { stopCamera(); native.pickingTarget = originalResolve; hover.unsubscribe(); native.plugin.managers.interactivity.lociHighlights.removeProvider(provider); },
  };
}
