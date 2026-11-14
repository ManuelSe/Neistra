import { describe, expect, it, vi } from "vitest";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { captureSurfaceSync, surfaceSyncChanges, SurfaceUpdateQueue } from "../viewer/surfaceReconciliation";
import { componentHierarchy, proteinStructure, surfaceObject, viewerSettings } from "./molecular-fixtures";

function source(id = "entry"): ViewerStructure {
  const normalized = proteinStructure();
  return { entryId: id, label: id, normalized, hierarchy: componentHierarchy(normalized),
    projection: { format: "mmcif", data: "unchanged molecular projection" }, atomIds: normalized.atoms.map(atom => atom.id),
    settings: { ...viewerSettings(), surface_objects: [surfaceObject("first", { kind: "entry" }), surfaceObject("second", { kind: "entry" })] } };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(finish => { resolve = finish; });
  return { promise, resolve };
}

describe("narrow surface reconciliation", () => {
  it("detects only affected objects without serializing molecular data", () => {
    const a = source(), b = source("unrelated");
    Object.defineProperty(a.normalized, "toJSON", { value: () => { throw new Error("Molecules must not be serialized"); } });
    const before = captureSurfaceSync([a, b], null);
    expect(surfaceSyncChanges(before, captureSurfaceSync([a, b], null))).toEqual([]);
    a.settings.surface_objects[0].name = "Renamed";
    a.settings.surface_objects[0].appearance.opacity = 0.25;
    expect(surfaceSyncChanges(before, captureSurfaceSync([a, b], null))).toEqual([{ entryId: "entry", surfaceId: "first" }]);
    a.settings.surface_objects = [a.settings.surface_objects[1], surfaceObject("third", { kind: "fragment", profile: "molecular-v1", atom_ids: [1] })];
    expect(surfaceSyncChanges(before, captureSurfaceSync([a, b], null))).toEqual([
      { entryId: "entry", surfaceId: "first" }, { entryId: "entry", surfaceId: "third" },
    ]);
  });

  it("includes explicit source and resolved seed dependencies", () => {
    const a = source();
    const before = captureSurfaceSync([a], null);
    a.pockets = { first: { radius: 5, seeds: [{ reference: { structure_id: "hidden", atom_id: 9 }, coordinates: [0, 0, 0] }], dependencyKey: "seed-coordinates-1" } };
    expect(surfaceSyncChanges(before, captureSurfaceSync([a], null))).toEqual([{ entryId: "entry", surfaceId: "first" }]);
    const current = captureSurfaceSync([a], null);
    a.pockets.first.seeds[0].coordinates[0] = 2;
    expect(surfaceSyncChanges(current, captureSurfaceSync([a], null))).toEqual([{ entryId: "entry", surfaceId: "first" }]);
  });

  it("retains conservative rebuilds for molecular, ordinary display and isolation changes", () => {
    const a = source(), before = captureSurfaceSync([a], null);
    for (const changed of [
      { ...a, label: "New entry label" }, { ...a, normalized: { ...a.normalized } }, { ...a, hierarchy: { ...a.hierarchy } },
      { ...a, projection: { ...a.projection, data: "new projection" } }, { ...a, atomIds: [...a.atomIds].reverse() },
      { ...a, settings: { ...a.settings, components: { ...a.settings.components, protein: false } } },
    ]) expect(surfaceSyncChanges(before, captureSurfaceSync([changed], null))).toBeUndefined();
    expect(surfaceSyncChanges(before, captureSurfaceSync([a], [{ structure_id: a.entryId, atom_id: 1 }]))).toBeUndefined();
    expect(surfaceSyncChanges(before, captureSurfaceSync([], null))).toBeUndefined();
    expect(surfaceSyncChanges(undefined, before)).toBeUndefined();
  });
});

describe("bounded latest surface display updates", () => {
  it("retains one running update and only the latest input while it is held", async () => {
    const queue = new SurfaceUpdateQueue(), gate = deferred(), calls: number[] = [];
    const first = queue.request("surface", async () => { calls.push(0); await gate.promise; });
    await Promise.resolve();
    let last = first;
    for (let i = 1; i <= 1000; i++) last = queue.request("surface", () => { calls.push(i); return Promise.resolve(); });
    expect(calls).toEqual([0]); expect(last).toBe(first);
    gate.resolve(); await last;
    expect(calls).toEqual([0, 1000]);
    await queue.request("surface", () => { calls.push(1001); return Promise.resolve(); });
    expect(calls).toEqual([0, 1000, 1001]);
  });

  it("recovers a superseded failure and keeps object identities independent", async () => {
    const queue = new SurfaceUpdateQueue(), gate = deferred(), latest = vi.fn(() => Promise.resolve());
    const first = queue.request("first", async () => { await gate.promise; throw new Error("Superseded update failed"); });
    await Promise.resolve();
    const final = queue.request("first", latest), other = vi.fn(() => Promise.resolve());
    await queue.request("second", other); expect(other).toHaveBeenCalledOnce();
    gate.resolve(); await first; await final; expect(latest).toHaveBeenCalledOnce();
    await expect(queue.request("first", () => Promise.reject(new Error("Current failure")))).rejects.toThrow("Current failure");
    await queue.request("first", latest); expect(latest).toHaveBeenCalledTimes(2);
  });

  it("retires queued previews on disposal", async () => {
    const queue = new SurfaceUpdateQueue(), gate = deferred(), retired = vi.fn(() => Promise.resolve());
    const first = queue.request("surface", () => gate.promise);
    await Promise.resolve();
    const pending = queue.request("surface", retired);
    queue.dispose(); gate.resolve(); await first; await pending;
    await queue.request("surface", retired); expect(retired).not.toHaveBeenCalled();
  });
});
