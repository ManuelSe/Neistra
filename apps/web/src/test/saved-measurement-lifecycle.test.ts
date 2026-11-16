import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { MolstarEngine } from "../viewer/MolstarEngine";
import type { ViewerMeasurement, ViewerStructure } from "../viewer/MolecularViewer";
import type { SavedMeasurementData } from "../viewer/savedMeasurementGeometry";
import type { CoordinatePatch, Point3D } from "../api/types";
import type { SurfaceSyncSnapshot } from "../viewer/surfaceReconciliation";
import { componentHierarchy, proteinStructure, viewerSettings } from "./molecular-fixtures";

interface BatchProbe {
  data: SavedMeasurementData;
  prepare: ReturnType<typeof vi.fn<(current: () => boolean) => Promise<boolean>>>;
  attach: ReturnType<typeof vi.fn>;
  retire: ReturnType<typeof vi.fn>;
  current?: () => boolean;
}
const control = vi.hoisted(() => ({ batches: [] as BatchProbe[], next: undefined as Promise<void> | undefined }));

vi.mock("../viewer/savedMeasurementGeometry", () => ({
  savedMeasurementData: (measurements: ViewerMeasurement[]) => ({ records: measurements.filter(item => item.visible) }),
  SavedMeasurementBatch: class {
    readonly prepare = vi.fn(async (current: () => boolean) => {
      this.current = current;
      if (this.held) await this.held;
      return current();
    });
    readonly attach = vi.fn(() => true);
    readonly retire = vi.fn();
    readonly held = control.next;
    current?: () => boolean;
    constructor(readonly data: SavedMeasurementData) { control.next = undefined; control.batches.push(this); }
  },
}));

interface Probe {
  plugin: PluginUIContext;
  generation: number;
  boundGeneration: number;
  interactionSourceGeneration: number;
  interactionSourceOperation: number;
  interactionSourceCompleted: number;
  interactionSourceError: string | undefined;
  measurements: ViewerMeasurement[];
  measurementRefs: string[];
  measurementEpoch: number;
  savedMeasurementBatch: BatchProbe | undefined;
  stagedMeasurementBatches: Set<BatchProbe>;
  loaded: Map<string, { baseCoordinates: Map<number, Point3D> }>;
  structures: ViewerStructure[];
  surfaceSyncSnapshot: SurfaceSyncSnapshot;
  modelPreview: unknown;
  applyMeasurements(): Promise<void>;
  loadStructure(this: void, source: ViewerStructure): Promise<void>;
  addStructureLabels(source: ViewerStructure): Promise<void>;
  applySelection(): void;
  applyModelPreview(): Promise<void>;
  applyInteractions(): Promise<void>;
  commitScene(this: void): void;
  clearHover(): void;
  detachSurface(entryId: string): Promise<void>;
  updateCoordinates(loaded: unknown, coordinates: Map<number, Point3D>): Promise<void>;
  restorePreviewRepresentations(source: ViewerStructure): Promise<void>;
  prepareSurfaces(entryId: string): Promise<void>;
}

const engines: MolstarEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); control.batches.length = 0; control.next = undefined; vi.restoreAllMocks(); });

function deferred() {
  let resolve!: () => void, reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function measurement(name = "distance"): ViewerMeasurement {
  return { id: name, name, kind: "distance", label: `${name} 1.00 Å`, visible: true,
    atom_references: [{ structure_id: "entry", atom_id: 1 }, { structure_id: "entry", atom_id: 2 }],
    warnings: [], created_at: "2026-11-16T00:00:00Z", modified_at: "2026-11-16T00:00:00Z" };
}
function source(): ViewerStructure {
  const normalized = proteinStructure();
  return { entryId: "entry", artifactId: "artifact", label: "Entry", normalized, settings: viewerSettings(),
    hierarchy: componentHierarchy(normalized), atomIds: normalized.atoms.map(atom => atom.id), projection: { format: "mmcif", data: "" } };
}
function setup() {
  const engine = new MolstarEngine(); engines.push(engine);
  const state = engine as unknown as Probe;
  const canvas = { add: vi.fn(), remove: vi.fn() };
  const plugin = { canvas3d: canvas, clear: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    representation: { structure: { themes: {} } } };
  state.plugin = plugin as unknown as PluginUIContext;
  vi.spyOn(state, "clearHover").mockImplementation(() => {});
  vi.spyOn(state, "applySelection").mockImplementation(() => {});
  vi.spyOn(state, "commitScene").mockImplementation(() => {});
  vi.spyOn(state, "applyInteractions").mockResolvedValue();
  vi.spyOn(state, "applyModelPreview").mockResolvedValue();
  vi.spyOn(state, "loadStructure").mockResolvedValue();
  vi.spyOn(state, "addStructureLabels").mockResolvedValue();
  vi.spyOn(state, "detachSurface").mockResolvedValue();
  vi.spyOn(state, "prepareSurfaces").mockResolvedValue();
  vi.spyOn(state, "restorePreviewRepresentations").mockResolvedValue();
  const coordinates = vi.spyOn(state, "updateCoordinates").mockResolvedValue();
  return { engine, state, plugin, canvas, coordinates };
}

describe("saved native batch source ownership", () => {
  it("installs only after the rebuilt source generation and operation have completed", async () => {
    const h = setup(), held = deferred();
    h.state.measurements = [measurement()];
    h.plugin.clear.mockReturnValueOnce(held.promise);
    const syncing = h.engine.syncStructures([source()]);
    await vi.waitFor(() => expect(h.plugin.clear).toHaveBeenCalledOnce());
    expect(control.batches).toHaveLength(0);
    expect(h.state.interactionSourceCompleted).not.toBe(h.state.interactionSourceOperation);
    held.resolve(); await syncing;
    expect(control.batches).toHaveLength(1);
    expect(control.batches[0].current?.()).toBe(true);
    expect(h.state.boundGeneration).toBe(h.state.generation);
    expect(h.state.interactionSourceCompleted).toBe(h.state.interactionSourceOperation);
    expect(h.state.measurementRefs).toEqual(["distance"]);
  });

  it("does no staging for an identical warm payload and synchronously retires deleted records", async () => {
    const h = setup(), m = measurement();
    await h.engine.setMeasurements([m]);
    const batch = control.batches[0];
    await h.engine.setMeasurements([{ ...m, atom_references: m.atom_references.map(atom => ({ ...atom })) }]);
    expect(control.batches).toHaveLength(1); expect(batch.attach).toHaveBeenCalledOnce();
    const clearing = h.engine.setMeasurements([]);
    expect(batch.retire).toHaveBeenCalled(); expect(h.state.savedMeasurementBatch).toBeUndefined();
    await clearing; expect(h.state.measurementRefs).toEqual([]); expect(control.batches).toHaveLength(1);
  });

  it("cannot attach a held older record payload after a new measurement intent", async () => {
    const h = setup(), held = deferred(); control.next = held.promise;
    const first = h.engine.setMeasurements([measurement("old")]);
    await vi.waitFor(() => expect(control.batches).toHaveLength(1));
    const old = control.batches[0];
    const latest = h.engine.setMeasurements([measurement("new")]);
    expect(old.retire).toHaveBeenCalled(); expect(old.current?.()).toBe(false);
    held.resolve(); await first; await latest;
    expect(old.attach).not.toHaveBeenCalled();
    expect(h.state.measurementRefs).toEqual(["new"]);
    expect(h.state.stagedMeasurementBatches.size).toBe(0);
  });

  it("retires synchronously on source replacement before a queued clear and never restores the old batch", async () => {
    const h = setup(), held = deferred(); control.next = held.promise;
    const saving = h.engine.setMeasurements([measurement()]);
    await vi.waitFor(() => expect(control.batches).toHaveLength(1));
    const old = control.batches[0], syncing = h.engine.syncStructures([source()]);
    expect(old.current?.()).toBe(false); expect(old.retire).toHaveBeenCalled();
    held.resolve(); await saving; await syncing;
    expect(old.attach).not.toHaveBeenCalled();
    expect(control.batches[1].attach).toHaveBeenCalledOnce(); expect(h.state.measurementRefs).toEqual(["distance"]);
  });

  it("keeps a failed source empty and recovers only from a successfully rebuilt source", async () => {
    const h = setup(); await h.engine.setMeasurements([measurement()]);
    const old = control.batches[0];
    vi.mocked(h.state.loadStructure).mockRejectedValueOnce(new Error("source failed"));
    await expect(h.engine.syncStructures([source()])).rejects.toThrow("source failed");
    expect(old.retire).toHaveBeenCalled(); expect(h.state.savedMeasurementBatch).toBeUndefined();
    expect(h.state.measurementRefs).toEqual([]);
    await h.state.applyMeasurements(); expect(control.batches).toHaveLength(1);
    await h.engine.syncStructures([source()]);
    expect(control.batches).toHaveLength(2); expect(h.state.measurementRefs).toEqual(["distance"]);
  });

  it("cleans a prepared off-canvas batch if scene finalization fails before publication", async () => {
    const h = setup(); h.state.measurements = [measurement()];
    vi.mocked(h.state.commitScene).mockImplementationOnce(() => { throw new Error("scene refused"); });
    await expect(h.engine.syncStructures([source()])).rejects.toThrow("scene refused");
    expect(control.batches).toHaveLength(1); expect(control.batches[0].retire).toHaveBeenCalled();
    expect(control.batches[0].attach).not.toHaveBeenCalled();
    expect(h.state.stagedMeasurementBatches.size).toBe(0); expect(h.state.savedMeasurementBatch).toBeUndefined();
  });

  it("pauses before a queued coordinate preview and restores only after explicit cancellation", async () => {
    const h = setup(), held = deferred(); control.next = held.promise;
    const starting = h.engine.setMeasurements([measurement()]);
    await vi.waitFor(() => expect(control.batches).toHaveLength(1));
    const old = control.batches[0];
    const patch: CoordinatePatch = { entry_id: "entry", artifact_id: "preview", atom_ids: [1], coordinates: [[9, 0, 0]] };
    const previewing = h.engine.applyCoordinatePatch(patch, "preview");
    expect(old.current?.()).toBe(false); expect(old.retire).toHaveBeenCalled();
    held.resolve(); await starting; await previewing;
    expect(old.attach).not.toHaveBeenCalled(); expect(control.batches).toHaveLength(1);
    await h.engine.clearCoordinatePreview("entry");
    expect(control.batches).toHaveLength(2); expect(control.batches[1].attach).toHaveBeenCalledOnce();
  });

  it("rebuilds measurements after a completed coordinate commit including the no-op path", async () => {
    const h = setup(); await h.engine.setMeasurements([measurement()]);
    const loaded = { baseCoordinates: new Map<number, Point3D>([[1, [0, 0, 0]], [2, [1, 0, 0]]]) };
    h.state.loaded.set("entry", loaded);
    h.state.structures = [source()];
    const held = deferred(); h.coordinates.mockReturnValueOnce(held.promise);
    const committing = h.engine.applyCoordinatePatch({ entry_id: "entry", artifact_id: "next", atom_ids: [1], coordinates: [[2, 0, 0]] }, "commit");
    await vi.waitFor(() => expect(h.coordinates).toHaveBeenCalledOnce());
    expect(control.batches).toHaveLength(1); expect(h.state.savedMeasurementBatch).toBeUndefined();
    held.resolve(); await committing;
    expect(control.batches).toHaveLength(2); expect(control.batches[1].current?.()).toBe(true);
    await h.engine.applyCoordinatePatch({ entry_id: "entry", artifact_id: "same", atom_ids: [1], coordinates: [[2, 0, 0]] }, "commit");
    expect(control.batches).toHaveLength(3); expect(control.batches[2].current?.()).toBe(true);
  });

  it("restores unaffected measurements after a committed patch for an unloaded entry", async () => {
    const h = setup(); await h.engine.setMeasurements([measurement()]);
    await h.engine.applyCoordinatePatch({ entry_id: "hidden", artifact_id: "next", atom_ids: [1], coordinates: [[2, 0, 0]] }, "commit");
    expect(control.batches).toHaveLength(2); expect(control.batches[1].current?.()).toBe(true);
  });

  it("does not restore saved labels after failed coordinate work until successful source recovery", async () => {
    const h = setup(); await h.engine.setMeasurements([measurement()]);
    h.state.loaded.set("entry", { baseCoordinates: new Map<number, Point3D>([[1, [0, 0, 0]], [2, [1, 0, 0]]]) });
    h.state.structures = [source()];
    h.coordinates.mockRejectedValueOnce(new Error("coordinates refused"));
    await expect(h.engine.applyCoordinatePatch({ entry_id: "entry", artifact_id: "next", atom_ids: [1], coordinates: [[2, 0, 0]] }, "commit")).rejects.toThrow("coordinates refused");
    expect(h.state.savedMeasurementBatch).toBeUndefined();
    await h.engine.clearCoordinatePreview("entry");
    expect(control.batches).toHaveLength(1);
    await h.engine.syncStructures([source()]);
    expect(control.batches).toHaveLength(2); expect(control.batches[1].current?.()).toBe(true);
  });

  it("pauses on model previews and restores the retained saved data after removal", async () => {
    const h = setup(); await h.engine.setMeasurements([measurement()]);
    const old = control.batches[0];
    const preview = {} as NonNullable<Parameters<MolstarEngine["setModelPreview"]>[0]>;
    await h.engine.setModelPreview(preview);
    expect(old.retire).toHaveBeenCalled(); expect(h.state.measurementRefs).toEqual([]);
    await h.state.applyMeasurements(); expect(control.batches).toHaveLength(1);
    await h.engine.setModelPreview(null);
    expect(control.batches).toHaveLength(2); expect(control.batches[1].attach).toHaveBeenCalledOnce();
  });

  it("rebuilds source-bound batches for artifact-only replacement without clearing the molecular scene", async () => {
    const h = setup(), original = source(); h.state.measurements = [measurement()];
    await h.engine.syncStructures([original]);
    const old = control.batches[0]; h.plugin.clear.mockClear();
    await h.engine.syncStructures([{ ...original, artifactId: "next-artifact" }]);
    expect(old.retire).toHaveBeenCalled(); expect(h.plugin.clear).not.toHaveBeenCalled();
    expect(control.batches).toHaveLength(2); expect(control.batches[1].current?.()).toBe(true);
  });

  it("settles a retired native error without reattaching or rejecting the newer scene owner", async () => {
    const h = setup(), held = deferred(); control.next = held.promise;
    const first = h.engine.setMeasurements([measurement("old")]);
    await vi.waitFor(() => expect(control.batches).toHaveLength(1));
    const newer = h.engine.setMeasurements([measurement("new")]);
    held.reject(new Error("retired native build failed"));
    await expect(first).resolves.toBeUndefined(); await newer;
    expect(control.batches[0].attach).not.toHaveBeenCalled(); expect(h.state.measurementRefs).toEqual(["new"]);
  });

  it("never installs a held batch after plugin replacement or disposal", async () => {
    const h = setup(), held = deferred(); control.next = held.promise;
    const first = h.engine.setMeasurements([measurement()]);
    await vi.waitFor(() => expect(control.batches).toHaveLength(1));
    const batch = control.batches[0]; h.engine.dispose();
    expect(batch.retire).toHaveBeenCalled(); expect(batch.current?.()).toBe(false);
    held.resolve(); await first;
    expect(batch.attach).not.toHaveBeenCalled(); expect(h.state.stagedMeasurementBatches.size).toBe(0);
    expect(h.state.savedMeasurementBatch).toBeUndefined();
  });

  it("rejects held native work from a replaced plugin even with equal generation and source operation", async () => {
    const h = setup(), held = deferred(); control.next = held.promise;
    const first = h.engine.setMeasurements([measurement()]);
    await vi.waitFor(() => expect(control.batches).toHaveLength(1));
    const batch = control.batches[0];
    h.state.plugin = { ...h.plugin } as unknown as PluginUIContext;
    held.resolve(); await first;
    expect(batch.current?.()).toBe(false); expect(batch.attach).not.toHaveBeenCalled();
    expect(batch.retire).toHaveBeenCalled(); expect(h.state.stagedMeasurementBatches.size).toBe(0);
  });
});
