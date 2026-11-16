/** Native observation only. Never imported by production. */
import { PluginStateObject } from "molstar/lib/mol-plugin-state/objects";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { Loci } from "molstar/lib/mol-model/loci";
import type { MolstarEngine } from "../viewer/MolstarEngine";
import type { AtomReference } from "../api/types";
import { canonicalSelection } from "../selection/selection";
import type { PickingTarget } from "../viewer/pickingTargets";
import type { ViewerAtomHover } from "../viewer/MolecularViewer";

export function observeHover(engine: MolstarEngine) {
  const native = engine as unknown as { plugin: PluginUIContext; syncQueue: Promise<void>;
    hoverTarget: { atoms: AtomReference[] } | null; heldPointers: Set<number>; generation: number; boundGeneration: number;
    pickingTarget(loci: Loci): PickingTarget; referencesFromLoci(loci: Loci): AtomReference[] };
  let resolutions = 0;
  const originalResolve = native.pickingTarget.bind(native);
  native.pickingTarget = function(loci) { resolutions++; return originalResolve(loci); };
  let hoverSamples = 0, markerActions = 0, cameraEvents = 0;
  const stopCamera = engine.subscribeCamera(() => { cameraEvents++; });
  let atomHoverPublications = 0;
  let atomHover: ViewerAtomHover | null = null;
  let publishedAt = 0, pointerAt: number | null = null;
  const informationTimings: { reference: AtomReference; artifactId: string | null; sceneGeneration: number;
    nativeEventToTextMs: number; pointerToTextMs: number | null; text: string }[] = [];
  const pointer = (event: PointerEvent) => {
    if (event.isTrusted && event.target instanceof HTMLCanvasElement && event.target.closest(".molstar-host")) pointerAt = performance.now();
    else pointerAt = null;
  };
  document.addEventListener("pointermove", pointer, true);
  const stopAtomHover = engine.subscribeAtomHover(event => {
    atomHoverPublications++;
    atomHover = event;
    publishedAt = performance.now();
  });
  const information = document.querySelector('[data-testid="viewer-atom-information"]');
  const informationObserver = new MutationObserver(() => {
    if (!atomHover || !information) return;
    const now = performance.now();
    informationTimings.push({ reference: { ...atomHover.reference }, artifactId: atomHover.source.artifactId ?? null,
      sceneGeneration: atomHover.sceneGeneration, nativeEventToTextMs: now - publishedAt,
      pointerToTextMs: pointerAt === null ? null : now - pointerAt, text: information.textContent ?? "" });
  });
  if (information) informationObserver.observe(information, { childList: true, characterData: true, subtree: true });
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
        atomHoverPublications, atomHover: atomHover ? { reference: { ...atomHover.reference },
          artifactId: atomHover.source.artifactId ?? null, sceneGeneration: atomHover.sceneGeneration } : null,
        informationTimings: [...informationTimings],
        target: native.hoverTarget?.atoms ?? [], held: native.heldPointers.size,
        busy: native.plugin.isBusy, generation: native.generation, boundGeneration: native.boundGeneration };
    },
    dispose() {
      stopCamera(); stopAtomHover(); informationObserver.disconnect(); document.removeEventListener("pointermove", pointer, true);
      native.pickingTarget = originalResolve; hover.unsubscribe(); native.plugin.managers.interactivity.lociHighlights.removeProvider(provider);
    },
  };
}
