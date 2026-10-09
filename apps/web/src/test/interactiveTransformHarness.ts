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
    inheritedSurfaceRefs: Map<string, string[]>;
    movementCueRefs: Map<string, string>;
    updateCoordinates: (...args: unknown[]) => Promise<void>;
  };
  const coordinateUpdates = new Set<() => void>();
  const updateCoordinates = internals.updateCoordinates.bind(engine);
  internals.updateCoordinates = async (...args) => {
    await updateCoordinates(...args);
    coordinateUpdates.forEach(listener => listener());
  };
  const events: AtomReference[][] = [];
  const unsubscribe = engine.subscribeSelection(event => events.push(event.atoms));
  const inspect = () => ({ ...inspectInteractiveTransform(engine, source.entryId), events: [...events] });
  return { engine, source, inspect,
    onCoordinatesUpdated: (listener: () => void) => { coordinateUpdates.add(listener); return () => { coordinateUpdates.delete(listener); }; },
    dispose: () => { coordinateUpdates.clear(); unsubscribe(); engine.dispose(); } };
}

/** Read native coordinates and navigation ownership rather than canvas appearance. */
export function inspectInteractiveTransform(engine: MolstarEngine, entryId: string) {
  const internals = engine as unknown as {
    loaded: Map<string, { structure: Structure; atomIds: number[] }>;
    inheritedSurfaceRefs: Map<string, string[]>;
    movementCueRefs: Map<string, string>;
    movementCamera: unknown;
    plugin?: { canvas3d?: { attribs: { trackball: { bindings: Record<string, { triggers: unknown[] }> } } } };
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
    inheritedSurfaces: internals.inheritedSurfaceRefs.get(entryId)?.length ?? 0,
    previewCues: internals.movementCueRefs.has(entryId) ? 1 : 0,
    movementActive: Boolean(internals.movementCamera),
    navigationTriggers: Object.values(internals.plugin?.canvas3d?.attribs.trackball.bindings ?? {})
      .reduce((count, binding) => count + binding.triggers.length, 0),
  };
}
