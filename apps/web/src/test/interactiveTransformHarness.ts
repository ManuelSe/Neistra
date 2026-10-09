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
  };
  const events: AtomReference[][] = [];
  const unsubscribe = engine.subscribeSelection(event => events.push(event.atoms));
  const inspect = () => {
    const loaded = internals.loaded.get(source.entryId);
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
    return { camera: engine.getCamera(), coordinates: [...coordinates].sort(([a], [b]) => a - b),
      inheritedSurfaces: internals.inheritedSurfaceRefs.get(source.entryId)?.length ?? 0,
      previewCues: internals.movementCueRefs.has(source.entryId) ? 1 : 0, events: [...events],
    };
  };
  return { engine, source, inspect, dispose: () => { unsubscribe(); engine.dispose(); } };
}
