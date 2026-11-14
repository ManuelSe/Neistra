import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { Representation } from "molstar/lib/mol-repr/representation";
import type { SurfaceStatus } from "../viewer/surface/runtime";
import { Unit, type Structure } from "molstar/lib/mol-model/structure";
import type { AtomReference, Point3D } from "../api/types";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { MolstarEngine } from "../viewer/MolstarEngine";

/** Native viewer qualification, never imported by the production application. */
export async function mountInteractiveTransformHarness(target: HTMLElement, source: ViewerStructure) {
  const engine = new MolstarEngine();
  await engine.mount(target);
  await engine.syncStructures([source]);
  const internals = engine as unknown as {
    loaded: Map<string, { structure: Structure; atomIds: number[] }>;
    movementCueRefs: Map<string, string>;
    updateCoordinates: (...args: unknown[]) => Promise<void>;
    syncQueue: Promise<void>;
    surfaces: { statuses(): SurfaceStatus[] };
  };
  // Combined surfaces finish after molecular synchronization. Qualification waits
  // for that actual lifecycle explicitly; coordinate callbacks stay independent.
  const settled = async () => {
    await internals.syncQueue;
    const deadline = performance.now() + 120_000;
    while (internals.surfaces.statuses().some(status => status.state === "queued" || status.state === "rendering")) {
      if (performance.now() > deadline) throw new Error("Movement fixture surface did not settle.");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await internals.syncQueue;
  };
  await settled();
  const coordinateUpdates = new Set<() => void>();
  const updateCoordinates = internals.updateCoordinates.bind(engine);
  internals.updateCoordinates = async (...args) => {
    await updateCoordinates(...args);
    coordinateUpdates.forEach(listener => listener());
  };
  const events: AtomReference[][] = [];
  const unsubscribe = engine.subscribeSelection(event => events.push(event.atoms));
  const inspect = () => ({ ...inspectInteractiveTransform(engine, source.entryId), events: [...events] });
  return { engine, source, inspect, settled,
    onCoordinatesUpdated: (listener: () => void) => { coordinateUpdates.add(listener); return () => { coordinateUpdates.delete(listener); }; },
    dispose: () => { coordinateUpdates.clear(); unsubscribe(); engine.dispose(); } };
}

/** Read native coordinates and navigation ownership rather than canvas appearance. */
export function inspectInteractiveTransform(engine: MolstarEngine, entryId: string) {
  const internals = engine as unknown as {
    loaded: Map<string, { structure: Structure; atomIds: number[] }>;
    surfaceBindings: Map<string, { entryId: string; channel: string; representationRef?: string }>;
    movementCueRefs: Map<string, string>;
    movementInteraction: string;
    plugin?: PluginUIContext;
  };
  const loaded = internals.loaded.get(entryId);
  const coordinates = new Map<number, Point3D>();
  for (const unit of loaded?.structure.units ?? []) {
    if (!Unit.isAtomic(unit)) continue;
    for (let i = 0; i < unit.elements.length; i++) {
      const element = unit.elements[i];
      const index = unit.model.atomicHierarchy.atomSourceIndex.value(element);
      const id = loaded!.atomIds[index];
      const c = unit.model.atomicConformation;
      coordinates.set(id, [c.x[element], c.y[element], c.z[element]]);
    }
  }
  return {
    camera: engine.getCamera(), coordinates: [...coordinates].sort(([a], [b]) => a - b),
    // Keep the existing report field, but observe installed combined entry
    // representations instead of the retired unit-surface reference map.
    inheritedSurfaces: [...internals.surfaceBindings.values()].filter(binding => {
      if (binding.entryId !== entryId || binding.channel !== "entry" || !binding.representationRef) return false;
      const cell = internals.plugin?.state.data.cells.get(binding.representationRef);
      const repr = (cell?.obj?.data as { repr?: Representation.Any } | undefined)?.repr;
      return repr?.renderObjects.some(object => object.state.visible && object.values.drawCount.ref.value > 0);
    }).length,
    previewCues: internals.movementCueRefs.has(entryId) ? 1 : 0,
    movementActive: internals.movementInteraction !== "inactive",
    movementInteraction: internals.movementInteraction,
    navigationTriggers: Object.values(internals.plugin?.canvas3d?.attribs.trackball.bindings ?? {})
      .reduce((count, binding) => count + binding.triggers.length, 0),
  };
}
