import { expect, it, vi } from "vitest";
import { Mesh } from "molstar/lib/mol-geo/geometry/mesh/mesh";
import { Lines } from "molstar/lib/mol-geo/geometry/lines/lines";
import type { Representation } from "molstar/lib/mol-repr/representation";
import { MarkerAction } from "molstar/lib/mol-util/marker-action";
import { SurfaceVisualRegistry } from "../viewer/surface/objects";
import { surfaceWireframe, surfaceWireframeBytes } from "../viewer/surface/wireframe";
import type { SurfaceGeometry } from "../viewer/surface/protocol";
import type { Structure } from "molstar/lib/mol-model/structure";
import { attachSurfaceGeometry, attachSurfaceWireframe, detachSurfaceGeometry,
  SelectionSurfaceProvider, SelectionSurfaceWireframeProvider } from "../viewer/surface/visual";

const geometry: SurfaceGeometry = {
  vertices: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 1, 0),
  normals: new Float32Array(12), indices: Uint32Array.of(0, 1, 2, 1, 3, 2),
  groups: Float32Array.of(0, 1, 1, 1), atomIds: Uint32Array.of(10, 99),
  evidence: { cells: 1, activeCells: 1, meshBytes: 144, meshBoundBytes: 144, workingBoundBytes: 144, durationMs: 0 },
};

it("derives the exact pinned native triangle edges and atom-owner groups without changing the molecular mesh", async () => {
  const before = structuredClone(geometry);
  const reserve = vi.fn();
  const lines = await surfaceWireframe(geometry, new AbortController().signal, reserve);
  const mesh = Mesh.create(geometry.vertices, geometry.indices, geometry.normals, geometry.groups, 4, 2);
  const reference = Lines.fromMesh(mesh);
  for (const key of ["mappingBuffer", "indexBuffer", "groupBuffer", "startBuffer", "endBuffer"] as const) {
    expect(lines[key].ref.value).toEqual(reference[key].ref.value);
  }
  expect(lines.lineCount).toBe(6);
  const actualBytes = [lines.mappingBuffer, lines.indexBuffer, lines.groupBuffer, lines.startBuffer, lines.endBuffer]
    .reduce((sum, cell) => sum + cell.ref.value.byteLength, 0);
  expect(reserve).toHaveBeenCalledWith(actualBytes + lines.lineCount * 4 + (geometry.atomIds.length + 2) * 4);
  expect(actualBytes).toBe(surfaceWireframeBytes(6));
  for (const key of ["vertices", "normals", "indices", "groups", "atomIds"] as const) {
    expect(Array.from(geometry[key])).toEqual(Array.from(before[key]));
  }
  expect(geometry.evidence).toEqual(before.evidence);
});

it("rejects unsafe display allocation, cancellation and exhausted aggregate reservations before creating lines", async () => {
  for (const count of [-3, 1, Infinity, Number.MAX_SAFE_INTEGER, 3_300_000]) {
    expect(() => surfaceWireframeBytes(count)).toThrow();
  }
  const controller = new AbortController(); controller.abort();
  const reserve = vi.fn();
  await expect(surfaceWireframe(geometry, controller.signal, reserve)).rejects.toThrow();
  expect(reserve).not.toHaveBeenCalled();
  await expect(surfaceWireframe(geometry, new AbortController().signal, () => { throw new Error("retained limit"); })).rejects.toThrow("retained limit");
});

it("releases the previous display binding when switching solid/mesh or disposing a component", () => {
  const structure = { elementCount: geometry.atomIds.length } as Structure;
  attachSurfaceGeometry(structure, geometry);
  expect(SelectionSurfaceProvider.isApplicable(structure)).toBe(true);
  attachSurfaceWireframe(structure, Lines.createEmpty());
  expect(SelectionSurfaceProvider.isApplicable(structure)).toBe(false);
  expect(SelectionSurfaceWireframeProvider.isApplicable(structure)).toBe(true);
  attachSurfaceGeometry(structure, geometry);
  expect(SelectionSurfaceWireframeProvider.isApplicable(structure)).toBe(false);
  detachSurfaceGeometry(structure);
  expect(SelectionSurfaceProvider.isApplicable(structure)).toBe(false);
  expect(SelectionSurfaceWireframeProvider.isApplicable(structure)).toBe(false);
});

it("selects all primitives of one surface without selecting its same-entry neighbor, and rejects detached representations", () => {
  const registry = new SurfaceVisualRegistry();
  const a = { mark: vi.fn() } as unknown as Representation.Any;
  const b = { mark: vi.fn() } as unknown as Representation.Any;
  const id = { entryId: "entry", surfaceId: "first" };
  const unbind = registry.register(a, id);
  registry.register(b, { entryId: "entry", surfaceId: "second" });
  const selected = vi.fn(); const unsubscribe = registry.subscribe(selected);
  expect(registry.pick(a)).toBe(true);
  expect(selected).toHaveBeenCalledWith(id);
  expect(a.mark).toHaveBeenLastCalledWith({ kind: "every-loci" }, MarkerAction.Highlight);
  expect(b.mark).toHaveBeenLastCalledWith({ kind: "every-loci" }, MarkerAction.RemoveHighlight);
  unbind(); expect(registry.pick(a)).toBe(false);
  registry.clearVisuals(); expect(registry.pick(b)).toBe(false);
  registry.register(b, id);
  expect(b.mark).toHaveBeenLastCalledWith({ kind: "every-loci" }, MarkerAction.Highlight);
  unsubscribe(); registry.pick(b); expect(selected).toHaveBeenCalledTimes(1);
  registry.select(null);
  expect(b.mark).toHaveBeenLastCalledWith({ kind: "every-loci" }, MarkerAction.RemoveHighlight);
  registry.dispose(); expect(registry.pick(b)).toBe(false);
});
