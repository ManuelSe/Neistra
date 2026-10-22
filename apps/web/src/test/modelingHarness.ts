import type { ModelPreview } from "../api/types";
import { StructureElement, Unit, type Structure } from "molstar/lib/mol-model/structure";
import { OrderedSet } from "molstar/lib/mol-data/int";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { MolstarEngine } from "../viewer/MolstarEngine";

/** Read exact native component and overpaint membership after a topology rebuild. */
export async function inspectNativeAppearance(engine: MolstarEngine, entryId: string) {
  const native = engine as unknown as { syncQueue: Promise<void>; plugin: PluginUIContext;
    loaded: Map<string, { structure: Structure; atomIds: number[] }> };
  await native.syncQueue;
  const loaded = native.loaded.get(entryId);
  if (!loaded) return [];
  const ids = (loci: StructureElement.Loci) => {
    const result = new Set<number>();
    for (const element of loci.elements) OrderedSet.forEach(element.indices, index => {
      result.add(loaded.atomIds[element.unit.model.atomicHierarchy.atomSourceIndex.value(element.unit.elements[index])]);
    });
    return [...result].sort((a,b) => a-b);
  };
  return [...native.plugin.state.data.cells.values()].flatMap(cell => {
    const tag = cell.transform.tags?.find(value => value.startsWith("molweave-representation-"));
    if (!tag) return [];
    const structure = native.plugin.state.data.cells.get(cell.transform.parent)?.obj?.data as Structure | undefined;
    if (!structure?.units || !structure.models.some(model => loaded.structure.models.includes(model))) return [];
    const colors = [...native.plugin.state.data.cells.values()].filter(child => child.transform.parent === cell.transform.ref
      && child.transform.transformer.id.includes("overpaint")).flatMap(child => {
      const values = child.params?.values as { layers: { bundle: StructureElement.Bundle; color: number }[] } | undefined;
      return (values?.layers ?? []).map(layer => ({ color: layer.color,
        atomIds: ids(StructureElement.Bundle.toLoci(layer.bundle, loaded.structure)) }));
    });
    return [{ tag, atomIds: ids(StructureElement.Loci.all(structure)), colors }];
  });
}

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

/** Read actual native atomic positions and immutable base rows; never writes previews. */
export async function inspectCoordinatePreview(engine: MolstarEngine) {
  const native = engine as unknown as { syncQueue: Promise<void>; coordinatePreviews: Map<string, unknown>;
    loaded: Map<string, { atomIds: number[]; baseCoordinates: Map<number, number[]>; structure: Structure }> };
  await native.syncQueue;
  return { previews: [...native.coordinatePreviews.keys()], canonicalAtoms: engine.getRenderedAtomReferences(),
    entries: [...native.loaded].map(([id, loaded]) => ({ id, atoms: loaded.atomIds.map((_, row) => {
      const model = loaded.structure.models[0], atomic = model.atomicConformation;
      const id = loaded.atomIds[model.atomicHierarchy.atomSourceIndex.value(row)];
      return { atom_id: id, base: loaded.baseCoordinates.get(id), displayed: [atomic.x[row], atomic.y[row], atomic.z[row]] };
    }) })) };
}

/** Trusted UI event to real native coordinate transform completion and next paint. */
export function measureCoordinatePreviewEvent(engine: MolstarEngine, target: Element, show: boolean, eventType: "click" | "change" = show ? "change" : "click"): Promise<number> {
  const native = engine as unknown as { syncQueue: Promise<void>; coordinatePreviews: Map<string, unknown> };
  return new Promise((resolve, reject) => {
    target.addEventListener(eventType, event => {
      if (!event.isTrusted) { reject(new Error("Trusted UI event required")); return; }
      const start = performance.now();
      const sample = () => {
        if ((native.coordinatePreviews.size > 0) === show) void native.syncQueue.then(() => requestAnimationFrame(() => resolve(performance.now() - start)), reject);
        else if (performance.now() - start > 5000) reject(new Error("Coordinate preview did not settle"));
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, { once: true, capture: true });
  });
}

/** Bounded readback during timing: exact native fixed-row checks without serializing
 * every loaded coordinate through the browser automation protocol. */
export async function inspectCoordinateSummary(engine: MolstarEngine, movable: { structure_id: string; atom_id: number }[]) {
  const native = engine as unknown as { syncQueue: Promise<void>; coordinatePreviews: Map<string, unknown>;
    loaded: Map<string, { atomIds: number[]; baseCoordinates: Map<number, number[]>; structure: Structure }> };
  await native.syncQueue;
  const selected = new Set(movable.map(a => `${a.structure_id}/${a.atom_id}`));
  let fixedExact = true, moving = 0;
  let firstMovable: { entry_id: string; atom_id: number; coordinates: number[] } | null = null;
  for (const [entry, loaded] of native.loaded) {
    const model = loaded.structure.models[0], atomic = model.atomicConformation;
    for (let row = 0; row < loaded.atomIds.length; row++) {
      const id = loaded.atomIds[model.atomicHierarchy.atomSourceIndex.value(row)], base = loaded.baseCoordinates.get(id)!;
      const point = [atomic.x[row], atomic.y[row], atomic.z[row]];
      const changed = point.some((v, axis) => v !== base[axis]);
      if (selected.has(`${entry}/${id}`)) {
        if (changed) moving++;
        firstMovable ??= { entry_id: entry, atom_id: id, coordinates: point };
      } else if (changed) fixedExact = false;
    }
  }
  return { previews: [...native.coordinatePreviews.keys()], canonicalCount: engine.getRenderedAtomReferences().length, fixedExact, moving, firstMovable };
}

export async function coordinatePreviewEntries(engine: MolstarEngine) {
  const native = engine as unknown as { syncQueue: Promise<void>; coordinatePreviews: Map<string, unknown> };
  await native.syncQueue;
  return [...native.coordinatePreviews.keys()];
}
