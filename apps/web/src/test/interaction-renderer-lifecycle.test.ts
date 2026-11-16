import { describe, expect, it, vi } from "vitest";
import { MolstarEngine } from "../viewer/MolstarEngine";
import type { InteractionDisplayState, InteractionRecord } from "../interactions/types";
import { interactionRecordKey } from "../interactions/presentation";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { componentHierarchy, proteinStructure, viewerSettings } from "./molecular-fixtures";
import { captureSurfaceSync, type SurfaceSyncSnapshot } from "../viewer/surfaceReconciliation";
import type { AtomReference } from "../api/types";
import { InteractionGeometryLimitError } from "../viewer/interactionGeometryBudget";

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
  interactions: InteractionRecord[];
  interactionRepresentation: { createOrUpdate: ReturnType<typeof vi.fn>; setState: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  coordinatePreviews: Map<string, unknown>;
  nonpolarHydrogenIds: Map<string, Set<number>>;
  syncQueue: Promise<void>;
  isolation: AtomReference[] | null;
  surfaceSyncSnapshot: SurfaceSyncSnapshot;
  generation: number;
  boundGeneration: number;
  loaded: Map<string, { baseCoordinates: Map<number, [number, number, number]> }>;
  loadStructure(source: ViewerStructure): Promise<void>;
  addStructureLabels(source: ViewerStructure): Promise<void>;
  applySelection(): void;
  applyMeasurements(): Promise<void>;
  applyModelPreview(): Promise<void>;
  commitScene(): void;
  clearHover(): void;
  detachSurface(entryId: string): Promise<void>;
  updateCoordinates(loaded: unknown, coordinates: Map<number, [number, number, number]>): Promise<void>;
  restorePreviewRepresentations(source: ViewerStructure): Promise<void>;
  prepareSurfaces(entryId: string): Promise<void>;
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
  it("refuses an entire over-budget overlay before native update and recovers a narrowed cached set without rebuilding the healthy source", async () => {
    const h = setup();
    const overBudget: InteractionRecord[] = [{ ...record(), kind: "salt_bridge", endpoints: [[0, 0, 0], [1e308, 0, 0]] }];
    const before = JSON.stringify(overBudget);
    for (const displayKey of ["long-contact", "same-contact-retry"]) {
      await expect(h.engine.setInteractions(overBudget, { displayKey })).resolves.toBeUndefined();
      expect(h.state.interactionRepresentation.createOrUpdate).not.toHaveBeenCalled();
      expect(h.draw.add).not.toHaveBeenCalled();
      expect(h.receipts.at(-1)).toMatchObject({ displayKey, status: "error", installedRecordKeys: [], countsByKind: { salt_bridge: 0, clash: 0 } });
      expect(h.receipts.at(-1)?.error).toContain("Narrow the target or show fewer types");
      expect(h.state.interactions).toBe(overBudget);
    }
    expect(JSON.stringify(overBudget)).toBe(before);
    await h.engine.setInteractions([record()], { displayKey: "narrowed" });
    expect(h.state.interactionRepresentation.createOrUpdate).toHaveBeenCalledOnce();
    expect(h.state.plugin.clear).not.toHaveBeenCalled();
    expect(h.receipts.at(-1)).toMatchObject({ displayKey: "narrowed", status: "ready", installedRecordKeys: [interactionRecordKey(record())] });
  });

  it("keeps measurement acknowledgment and source restoration healthy after controlled drawing refusal", async () => {
    const h = setup(), build = mockRebuild(h.state);
    const oversized: InteractionRecord = { ...record(), kind: "salt_bridge", endpoints: [[0, 0, 0], [1e308, 0, 0]] };
    await expect(h.engine.setInteractions([oversized], { displayKey: "controlled-refusal" })).resolves.toBeUndefined();
    await expect(h.engine.setMeasurements([])).resolves.toBeUndefined();
    expect(build.measurements).not.toHaveBeenCalled();
    await h.engine.setMeasurements([{ id: "distance", name: "Distance", kind: "distance", label: "Distance",
      atom_references: [{ structure_id: "a", atom_id: 1 }, { structure_id: "b", atom_id: 1 }], visible: true,
      warnings: [], created_at: "2026-11-15T00:00:00Z", modified_at: "2026-11-15T00:00:00Z" }]);
    expect(build.measurements).toHaveBeenCalledOnce();
    await expect(h.engine.syncStructures([source("a"), source("b")])).resolves.toBeUndefined();
    await expect(h.engine.clearCoordinatePreview("a")).resolves.toBeUndefined();
    expect(h.state.boundGeneration).toBe(1);
    expect(h.receipts.at(-1)).toMatchObject({ status: "error", error: new InteractionGeometryLimitError().message, installedRecordKeys: [] });
    expect(h.draw.add).not.toHaveBeenCalled();
  });

  it("counts only drawable native records while preserving coincident clash markers", async () => {
    const h = setup();
    const coincident: InteractionRecord = { ...record(), kind: "pi_pi", endpoints: [[0, 0, 0], [0, 0, 0]], geometry: { distance: 0 } };
    const clash: InteractionRecord = { ...record(), endpoints: [[0, 0, 0], [0, 0, 0]] };
    const before = JSON.stringify(coincident);
    await h.engine.setInteractions([coincident], { displayKey: "coincident-ring-centers" });
    expect(h.receipts.at(-1)).toMatchObject({ status: "ready", installedRecordKeys: [], countsByKind: { pi_pi: 0 } });
    expect(h.draw.add).not.toHaveBeenCalled();
    await h.engine.setInteractions([coincident, clash], { displayKey: "mixed-coincident" });
    expect(h.state.interactionRepresentation.createOrUpdate).toHaveBeenCalledWith({ sizeFactor: 2.5 }, [clash]);
    expect(h.receipts.at(-1)).toMatchObject({ installedRecordKeys: [interactionRecordKey(clash)], countsByKind: { pi_pi: 0, clash: 1 } });
    expect(JSON.stringify(coincident)).toBe(before);
  });

  it.each(["load", "labels", "measurements"] as const)("retains failed molecular %s state across appearance retries until full source recovery", async stage => {
    const h = setup();
    await h.engine.setInteractions([record()], { displayKey: "healthy" });
    h.receipts.length = 0; h.draw.add.mockClear();
    const build = mockRebuild(h.state), held = deferred();
    if (stage === "load") build.load.mockResolvedValueOnce(undefined);
    build[stage].mockImplementationOnce(() => held.promise);
    const currentSources = [source("a"), source("b")];
    const install = h.engine.syncStructures(currentSources);
    const refused = expect(install).rejects.toThrow("Native molecular source refused");
    await vi.waitFor(() => expect(build[stage]).toHaveBeenCalledTimes(stage === "load" ? 2 : 1));
    const appearanceRetry = h.engine.setInteractions([record()], { displayKey: "appearance-retry" });
    held.reject(new Error("Native molecular source refused"));
    await refused; await appearanceRetry;
    expect(h.draw.add).not.toHaveBeenCalled();
    expect(h.receipts.some(value => value.status === "ready")).toBe(false);
    expect(h.receipts.at(-1)).toMatchObject({ displayKey: "appearance-retry", status: "error", installedRecordKeys: [], countsByKind: { clash: 0 } });
    expect(h.receipts.at(-1)?.error).toContain("Molecular display unavailable");
    await h.engine.setInteractions([record()], { displayKey: "retry-again" });
    expect(h.receipts.at(-1)).toMatchObject({ displayKey: "retry-again", status: "error", installedRecordKeys: [] });
    await h.engine.setInteractions([], { displayKey: "empty-retry" });
    expect(h.receipts.at(-1)).toMatchObject({ displayKey: "empty-retry", status: "error", installedRecordKeys: [] });
    await h.engine.setInteractions([record()], { displayKey: "recover" });
    await h.engine.syncStructures(currentSources);
    expect(h.draw.add).toHaveBeenCalledOnce();
    expect(h.receipts.at(-1)).toMatchObject({ sceneGeneration: 2, status: "ready", installedRecordKeys: [interactionRecordKey(record())] });
  });

  it("keeps newer source pending when a superseded molecular install rejects", async () => {
    const h = setup();
    await h.engine.setInteractions([record()], { displayKey: "source-owner" });
    h.receipts.length = 0; h.draw.add.mockClear();
    const oldLabels = deferred(), newClear = deferred(), build = mockRebuild(h.state);
    build.labels.mockImplementationOnce(() => oldLabels.promise);
    const clear = vi.spyOn(h.state.plugin, "clear");
    clear.mockResolvedValueOnce(undefined).mockImplementationOnce(() => newClear.promise);
    const old = h.engine.syncStructures([source("a"), source("b")]);
    const refused = expect(old).rejects.toThrow("Retired molecular installation refused");
    await vi.waitFor(() => expect(build.labels).toHaveBeenCalledOnce());
    const current = h.engine.syncStructures([source("a"), source("b")]);
    oldLabels.reject(new Error("Retired molecular installation refused")); await refused;
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(2));
    expect(h.receipts.some(value => value.status === "error" || value.status === "ready")).toBe(false);
    expect(h.receipts.at(-1)).toMatchObject({ status: "pending", sceneGeneration: 2, installedRecordKeys: [] });
    newClear.resolve(); await current;
    expect(h.receipts.at(-1)).toMatchObject({ status: "ready", sceneGeneration: 2, installedRecordKeys: [interactionRecordKey(record())] });
  });

  it("waits for a queued coordinate operation after a successful held full install without losing progress", async () => {
    const h = setup();
    await h.engine.setInteractions([record()], { displayKey: "source-progress" });
    h.receipts.length = 0; h.draw.add.mockClear();
    const loadHeld = deferred(), patchHeld = deferred(), build = mockRebuild(h.state);
    const loaded = (item: ViewerStructure) => {
      h.state.loaded.set(item.entryId, { baseCoordinates: new Map(item.normalized.atoms.map(atom => [atom.id, atom.coordinates])) });
      return Promise.resolve();
    };
    build.load.mockImplementation(loaded).mockImplementationOnce(async item => { await loadHeld.promise; await loaded(item); });
    vi.spyOn(h.state, "detachSurface").mockResolvedValue();
    vi.spyOn(h.state, "prepareSurfaces").mockResolvedValue();
    const update = vi.spyOn(h.state, "updateCoordinates").mockImplementation(() => patchHeld.promise);
    const install = h.engine.syncStructures([source("a"), source("b")]);
    await vi.waitFor(() => expect(build.load).toHaveBeenCalledOnce());
    const patch = h.engine.applyCoordinatePatch({ entry_id: "a", artifact_id: "moved", atom_ids: [1], coordinates: [[0.1, 0, 0]] }, "commit");
    loadHeld.resolve(); await install;
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(h.receipts.some(value => value.status === "ready")).toBe(false);
    expect(h.draw.add).not.toHaveBeenCalled();
    patchHeld.resolve(); await patch;
    const moved: InteractionRecord = { ...record(), endpoints: [[0.1, 0, 0], [2, 0, 0]], geometry: { distance: 1.9, overlap: 1.5 } };
    await h.engine.setInteractions([moved], { displayKey: "current-coordinates" });
    expect(h.draw.add).toHaveBeenCalledOnce();
    expect(h.receipts.at(-1)).toMatchObject({ status: "ready", sceneGeneration: 1, displayKey: "current-coordinates", installedRecordKeys: [interactionRecordKey(moved)] });
  });

  it("does not clear a failed coordinate install with display retry or preview Cancel, and forces actual source recovery", async () => {
    const h = setup(), originalSources = h.state.structures;
    h.state.surfaceSyncSnapshot = captureSurfaceSync(originalSources, null);
    h.state.loaded.set("a", { baseCoordinates: new Map(originalSources[0].normalized.atoms.map(atom => [atom.id, atom.coordinates])) });
    vi.spyOn(h.state, "detachSurface").mockResolvedValue();
    vi.spyOn(h.state, "prepareSurfaces").mockResolvedValue();
    vi.spyOn(h.state, "restorePreviewRepresentations").mockResolvedValue();
    const held = deferred(), update = vi.spyOn(h.state, "updateCoordinates").mockResolvedValue();
    update.mockImplementationOnce(() => held.promise);
    await h.engine.setInteractions([record()], { displayKey: "healthy" });
    h.receipts.length = 0; h.draw.add.mockClear();
    const patch = h.engine.applyCoordinatePatch({ entry_id: "a", artifact_id: "changed", atom_ids: [1], coordinates: [[9, 0, 0]] }, "commit");
    const refused = expect(patch).rejects.toThrow("Coordinate installation refused");
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    const retry = h.engine.setInteractions([record()], { displayKey: "after-patch" });
    held.reject(new Error("Coordinate installation refused")); await refused; await retry;
    expect(h.draw.add).not.toHaveBeenCalled();
    expect(h.receipts.some(value => value.status === "ready")).toBe(false);
    expect(h.receipts.at(-1)).toMatchObject({ status: "error", installedRecordKeys: [] });
    await h.engine.clearCoordinatePreview("a");
    expect(h.receipts.at(-1)).toMatchObject({ status: "error", installedRecordKeys: [] });
    mockRebuild(h.state);
    await h.engine.syncStructures(originalSources);
    expect(h.state.plugin.clear).toHaveBeenCalledOnce();
    expect(h.draw.add).toHaveBeenCalledOnce();
    expect(h.receipts.at(-1)).toMatchObject({ sceneGeneration: 1, status: "ready", installedRecordKeys: [interactionRecordKey(record())] });
  });

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
