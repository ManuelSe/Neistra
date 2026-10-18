import type { ModelPreview } from "../api/types";
import { Unit, type Structure } from "molstar/lib/mol-model/structure";
import type { MolstarEngine } from "../viewer/MolstarEngine";

/** Read native connectivity without writing model, selection or camera state. */
export async function displayedBonds(engine: MolstarEngine, entryId: string): Promise<number[][]> {
  const native = engine as unknown as { syncQueue: Promise<void>; loaded: Map<string, { structure: Structure; atomIds: number[] }> };
  await native.syncQueue;
  const loaded = native.loaded.get(entryId);
  if (!loaded) return [];
  const pairs = new Map<string, number[]>();
  const add = (unitA: Unit.Atomic, indexA: number, unitB: Unit.Atomic, indexB: number) => {
    const a = loaded.atomIds[unitA.model.atomicHierarchy.atomSourceIndex.value(unitA.elements[indexA])];
    const b = loaded.atomIds[unitB.model.atomicHierarchy.atomSourceIndex.value(unitB.elements[indexB])];
    const pair = [a, b].sort((x, y) => x - y); pairs.set(pair.join(":"), pair);
  };
  for (const unit of loaded.structure.units) if (Unit.isAtomic(unit)) {
    for (let i = 0; i < unit.bonds.a.length; i++) add(unit, unit.bonds.a[i], unit, unit.bonds.b[i]);
  }
  for (const edge of loaded.structure.interUnitBonds.edges) {
    const a = loaded.structure.unitMap.get(edge.unitA), b = loaded.structure.unitMap.get(edge.unitB);
    if (Unit.isAtomic(a) && Unit.isAtomic(b)) add(a, edge.indexA, b, edge.indexB);
  }
  return [...pairs.values()];
}

/** Read only native proposal attachment and picking flags. */
export async function inspectModelPreview(engine: MolstarEngine) {
  const native = engine as unknown as {
    syncQueue: Promise<void>;
    modelPreview: ModelPreview | null;
    modelPreviewRepresentation: { renderObjects: { state: { pickable: boolean }; values: { drawCount: { ref: { value: number } } } }[] };
    plugin: { canvas3d?: { reprCount: { value: number } } };
  };
  await native.syncQueue;
  return { preview: native.modelPreview, objects: native.modelPreviewRepresentation.renderObjects.map(object => ({ pickable: object.state.pickable, drawCount: object.values.drawCount.ref.value })),
    representations: native.plugin.canvas3d?.reprCount.value ?? 0, canonicalAtoms: engine.getRenderedAtomReferences() };
}

/** Measure native work from the trusted UI event, excluding automation/JSON transfer.
 * Reads the existing queue/geometry; never submits a preview or changes its owner.
 */
export function measurePreviewEvent(engine: MolstarEngine, target: Element, show: boolean): Promise<number> {
  const native = engine as unknown as {
    syncQueue: Promise<void>; modelPreview: ModelPreview | null;
    modelPreviewRepresentation: { renderObjects: { values: { drawCount: { ref: { value: number } } } }[] };
  };
  return new Promise((resolve, reject) => {
    target.addEventListener(show ? "change" : "click", event => {
      if (!event.isTrusted) { reject(new Error("A trusted native UI event is required")); return; }
      const start = performance.now();
      const sample = () => {
        const ready = show ? !!native.modelPreview && native.modelPreviewRepresentation.renderObjects.some(o => o.values.drawCount.ref.value > 0) : !native.modelPreview;
        if (ready) {
          void native.syncQueue.then(() => requestAnimationFrame(() => resolve(performance.now() - start)), reject);
        } else if (performance.now() - start > 5000) reject(new Error("Native preview event did not settle"));
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, { once: true, capture: true });
  });
}
