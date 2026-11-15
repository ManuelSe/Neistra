import { describe, expect, it, vi } from "vitest";
import { MolstarEngine } from "../viewer/MolstarEngine";
import type { InteractionDisplayState, InteractionRecord } from "../interactions/types";
import { interactionRecordKey } from "../interactions/presentation";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { componentHierarchy, proteinStructure, viewerSettings } from "./molecular-fixtures";
import { captureSurfaceSync, type SurfaceSyncSnapshot } from "../viewer/surfaceReconciliation";
import type { AtomReference } from "../api/types";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
  return { promise, resolve, reject };
}

function source(id: string): ViewerStructure {
  const normalized = proteinStructure();
  return { entryId: id, label: id, normalized, hierarchy: componentHierarchy(normalized),
    projection: { format: "mmcif", data: "" }, atomIds: normalized.atoms.map(atom => atom.id), settings: viewerSettings() };
}

function record(atomId = 1): InteractionRecord {
  return { kind: "clash", scope: "inter", participants: [[{ structure_id: "a", atom_id: atomId }], [{ structure_id: "b", atom_id: atomId }]],
    endpoints: [[0, 0, 0], [2, 0, 0]], geometry: { distance: 2, overlap: 1.4 } };
}

interface EngineProbe {
  plugin: { canvas3d: ReturnType<typeof canvas>; clear: () => Promise<void> };
  structures: ViewerStructure[];
  interactionRepresentation: { createOrUpdate: ReturnType<typeof vi.fn>; setState: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  coordinatePreviews: Map<string, unknown>;
  nonpolarHydrogenIds: Map<string, Set<number>>;
  syncQueue: Promise<void>;
  isolation: AtomReference[] | null;
  surfaceSyncSnapshot: SurfaceSyncSnapshot;
  generation: number;
  boundGeneration: number;
  loadStructure(source: ViewerStructure): Promise<void>;
  addStructureLabels(source: ViewerStructure): Promise<void>;
  applySelection(): void;
  applyMeasurements(): Promise<void>;
  applyModelPreview(): Promise<void>;
  commitScene(): void;
  clearHover(): void;
}

function canvas() { return { add: vi.fn(), remove: vi.fn() }; }

function setup() {
  const engine = new MolstarEngine();
  const state = engine as unknown as EngineProbe;
  const draw = canvas();
  state.plugin = { canvas3d: draw, clear: vi.fn().mockResolvedValue(undefined) };
  state.structures = [source("a"), source("b")];
  const run = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  state.interactionRepresentation = { createOrUpdate: vi.fn(() => ({ run })), setState: vi.fn(), destroy: vi.fn() };
  const receipts: InteractionDisplayState[] = [];
  vi.spyOn(state, "clearHover").mockImplementation(() => {});
  engine.subscribeInteractionDisplay(value => receipts.push(value));
  return { engine, state, draw, run, receipts };
}

function mockRebuild(state: EngineProbe) {
  const load = vi.spyOn(state, "loadStructure").mockResolvedValue();
  const labels = vi.spyOn(state, "addStructureLabels").mockResolvedValue();
  const measurements = vi.spyOn(state, "applyMeasurements").mockResolvedValue();
  const model = vi.spyOn(state, "applyModelPreview").mockResolvedValue();
  vi.spyOn(state, "applySelection").mockImplementation(() => {});
  const commit = vi.spyOn(state, "commitScene").mockImplementation(() => {});
  return { load, labels, measurements, model, commit };
}

describe("current native interaction installation", () => {
  it("preserves installed records and readiness for repeated null isolation without rebuilding", async () => {
    const h = setup();
    h.state.surfaceSyncSnapshot = captureSurfaceSync(h.state.structures, null);
    await h.engine.setInteractions([record()], { displayKey: "installed" });
    const removes = h.draw.remove.mock.calls.length, updates = h.run.mock.calls.length, receipts = h.receipts.length;
    await h.engine.setIsolation(null);
    expect(h.draw.remove).toHaveBeenCalledTimes(removes);
    expect(h.run).toHaveBeenCalledTimes(updates);
    expect(h.receipts).toHaveLength(receipts);
    expect(h.receipts.at(-1)).toMatchObject({ status: "ready", installedRecordKeys: [interactionRecordKey(record())] });
    expect(h.state.plugin.clear).not.toHaveBeenCalled();
  });

  it("treats reordered and duplicate isolation references as the same installed target", async () => {
    const h = setup(), members = [{ structure_id: "a", atom_id: 1 }, { structure_id: "b", atom_id: 1 }];
    h.state.isolation = members;
    h.state.surfaceSyncSnapshot = captureSurfaceSync(h.state.structures, members);
    mockRebuild(h.state);
    await h.engine.setInteractions([record()], { displayKey: "isolated" });
    const removes = h.draw.remove.mock.calls.length, updates = h.run.mock.calls.length;
    await h.engine.setIsolation([members[1], members[0], members[1]]);
    expect(h.draw.remove).toHaveBeenCalledTimes(removes);
    expect(h.run).toHaveBeenCalledTimes(updates);
    expect(h.state.plugin.clear).not.toHaveBeenCalled();
    expect(h.receipts.at(-1)).toMatchObject({ status: "ready", installedRecordKeys: [interactionRecordKey(record())] });
  });

  it("retires a held update for changed isolation and acknowledges only the rebuilt target", async () => {
    const h = setup(), held = deferred();
    h.state.surfaceSyncSnapshot = captureSurfaceSync(h.state.structures, null);
    const rebuild = mockRebuild(h.state);
    h.run.mockImplementationOnce(() => held.promise);
    const original = h.engine.setInteractions([record(), record(2)], { displayKey: "isolation" });
    await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
    const changed = h.engine.setIsolation([{ structure_id: "a", atom_id: 2 }, { structure_id: "b", atom_id: 2 }]);
    expect(h.receipts.at(-1)).toMatchObject({ status: "pending", installedRecordKeys: [] });
    held.resolve(); await original; await changed;
    expect(h.draw.add).toHaveBeenCalledOnce();
    expect(h.state.plugin.clear).toHaveBeenCalledOnce();
    expect(rebuild.load).toHaveBeenCalledTimes(2);
    expect(h.receipts.filter(value => value.status === "ready")).toEqual([
      expect.objectContaining({ sceneGeneration: 1, installedRecordKeys: [interactionRecordKey(record(2))] }),
    ]);
  });

  it("does not let a retired scene adopt the next scene generation after held measurements", async () => {
    const h = setup();
    await h.engine.setInteractions([record()], { displayKey: "scene-owner" });
    h.receipts.length = 0; h.draw.add.mockClear();
    const oldMeasurements = deferred(), newSceneClear = deferred();
    const rebuild = mockRebuild(h.state);
    rebuild.measurements.mockImplementationOnce(() => oldMeasurements.promise);
    const clear = vi.spyOn(h.state.plugin, "clear");
    clear.mockResolvedValueOnce(undefined).mockImplementationOnce(() => newSceneClear.promise);
    const first = h.engine.syncStructures([source("a"), source("b")]);
    await vi.waitFor(() => expect(rebuild.measurements).toHaveBeenCalledOnce());
    const second = h.engine.syncStructures([source("a"), source("b")]);
    oldMeasurements.resolve(); await first;
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(2));
    expect(h.receipts.some(value => value.status === "ready")).toBe(false);
    expect(h.draw.add).not.toHaveBeenCalled();
    expect(rebuild.commit).not.toHaveBeenCalled();
    expect(h.state.boundGeneration).toBe(0);
    newSceneClear.resolve(); await second;
    expect(h.draw.add).toHaveBeenCalledOnce();
    expect(rebuild.commit).toHaveBeenCalledOnce();
    expect(h.state.boundGeneration).toBe(2);
    expect(h.receipts.at(-1)).toMatchObject({ sceneGeneration: 2, status: "ready", installedRecordKeys: [interactionRecordKey(record())] });
  });

  it("does not reinstall an obsolete held task after a synchronous clear", async () => {
    const h = setup(), held = deferred();
    h.run.mockImplementationOnce(() => held.promise);
    const first = h.engine.setInteractions([record()], { displayKey: "first" });
    await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
    const cleared = h.engine.setInteractions([], { displayKey: "cleared" });
    expect(h.draw.remove).toHaveBeenCalled();
    held.resolve(); await first; await cleared;
    expect(h.draw.add).not.toHaveBeenCalled();
    expect(h.state.interactionRepresentation.setState).not.toHaveBeenCalled();
    const ready = h.receipts.filter(value => value.status === "ready");
    expect(ready).toHaveLength(1);
    expect(ready).toMatchObject([{ displayKey: "cleared", installedRecordKeys: [], countsByKind: { clash: 0 } }]);
  });

  it("publishes only the superseding request after held geometry completion", async () => {
    const h = setup(), held = deferred();
    h.run.mockImplementationOnce(() => held.promise);
    const first = h.engine.setInteractions([record()], { displayKey: "old" });
    await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
    const next = record(2), second = h.engine.setInteractions([next], { displayKey: "new" });
    held.resolve(); await first; await second;
    expect(h.draw.add).toHaveBeenCalledOnce();
    const ready = h.receipts.filter(value => value.status === "ready");
    expect(ready).toHaveLength(1);
    expect(ready).toMatchObject([{ displayKey: "new", installedRecordKeys: [interactionRecordKey(next)], countsByKind: { clash: 1 } }]);
    expect(h.state.interactionRepresentation.setState).toHaveBeenCalledWith({ pickable: false, markerActions: 0 });
  });

  it("never adds or publishes ready after disposal during a held update", async () => {
    const h = setup(), held = deferred();
    h.run.mockImplementationOnce(() => held.promise);
    const pending = h.engine.setInteractions([record()], { displayKey: "retired" });
    await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
    h.engine.dispose();
    held.resolve(); await pending;
    expect(h.draw.add).not.toHaveBeenCalled();
    expect(h.state.interactionRepresentation.setState).not.toHaveBeenCalled();
    expect(h.state.interactionRepresentation.destroy).toHaveBeenCalled();
    expect(h.receipts.some(value => value.status === "ready")).toBe(false);
  });

  it("rejects old installation while a structural rebuild waits and acknowledges the new scene", async () => {
    const h = setup(), held = deferred();
    h.run.mockImplementationOnce(() => held.promise);
    const first = h.engine.setInteractions([record()], { displayKey: "scene" });
    await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
    for (const method of ["loadStructure", "addStructureLabels", "applyMeasurements", "applyModelPreview"] as const) vi.spyOn(h.state, method).mockResolvedValue();
    vi.spyOn(h.state, "applySelection").mockImplementation(() => {});
    vi.spyOn(h.state, "commitScene").mockImplementation(() => {});
    const rebuilt = h.engine.syncStructures([source("a"), source("b")]);
    expect(h.receipts.at(-1)).toMatchObject({ status: "pending", sceneGeneration: 1, installedRecordKeys: [] });
    held.resolve(); await first; await rebuilt;
    expect(h.draw.add).toHaveBeenCalledOnce();
    expect(h.receipts.filter(value => value.status === "ready")).toEqual([
      expect.objectContaining({ displayKey: "scene", sceneGeneration: 1, installedRecordKeys: [interactionRecordKey(record())] }),
    ]);
  });

  it("pauses before a queued preview can change coordinates, then restores only after Cancel", async () => {
    const h = setup(), held = deferred();
    h.run.mockImplementationOnce(() => held.promise);
    const pending = h.engine.setInteractions([record()], { displayKey: "preview" });
    await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
    const preview = h.engine.applyCoordinatePatch({ entry_id: "not-loaded", artifact_id: "preview", atom_ids: [1], coordinates: [[9, 0, 0]] }, "preview");
    expect(h.receipts.at(-1)).toMatchObject({ status: "paused", installedRecordKeys: [] });
    held.resolve(); await pending; await preview;
    expect(h.draw.add).not.toHaveBeenCalled();
    await h.engine.clearCoordinatePreview("not-loaded");
    expect(h.draw.add).toHaveBeenCalledOnce();
    expect(h.receipts.at(-1)).toMatchObject({ status: "ready", installedRecordKeys: [interactionRecordKey(record())] });
  });

  it("reports current geometry errors without publishing ready, and allows retry", async () => {
    const h = setup();
    h.run.mockRejectedValueOnce(new Error("Native build refused"));
    await expect(h.engine.setInteractions([record()], { displayKey: "failed" })).rejects.toThrow("Native build refused");
    expect(h.draw.add).not.toHaveBeenCalled();
    expect(h.receipts.at(-1)).toMatchObject({ displayKey: "failed", status: "error", installedRecordKeys: [], error: "Native build refused" });
    await h.engine.setInteractions([record()], { displayKey: "retry" });
    expect(h.draw.add).toHaveBeenCalledOnce();
    expect(h.receipts.at(-1)).toMatchObject({ displayKey: "retry", status: "ready" });
  });

  it("does not publish a retired error under a newer display key", async () => {
    const h = setup(), held = deferred();
    h.run.mockImplementationOnce(() => held.promise);
    const first = h.engine.setInteractions([record()], { displayKey: "old" });
    await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
    const second = h.engine.setInteractions([record(2)], { displayKey: "new" });
    held.reject(new Error("Retired native failure")); await first; await second;
    expect(h.receipts.some(value => value.status === "error")).toBe(false);
    expect(h.receipts.at(-1)).toMatchObject({ displayKey: "new", status: "ready" });
  });

  it("acknowledges the final native hydrogen filter and protects receipt ownership", async () => {
    const h = setup(), source = h.state.structures[0];
    source.normalized.atoms[0] = { ...source.normalized.atoms[0], element: "H" };
    source.settings.components.hydrogens = true;
    source.settings.components.nonpolar_hydrogens = false;
    h.state.nonpolarHydrogenIds.set("a", new Set([1]));
    await h.engine.setInteractions([record()], { displayKey: "native-hidden" });
    expect(h.draw.add).not.toHaveBeenCalled();
    expect(h.receipts.at(-1)).toMatchObject({ status: "ready", installedRecordKeys: [], countsByKind: { clash: 0 } });
    h.receipts.at(-1)!.countsByKind.clash = 42;
    const listener = vi.fn<(value: InteractionDisplayState) => void>();
    const release = h.engine.subscribeInteractionDisplay(listener);
    expect(listener.mock.calls.at(-1)?.[0].countsByKind.clash).toBe(0);
    release();
  });
});
