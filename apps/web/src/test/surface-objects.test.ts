import { expect, it, vi } from "vitest";
import { Mesh } from "molstar/lib/mol-geo/geometry/mesh/mesh";
import { Lines } from "molstar/lib/mol-geo/geometry/lines/lines";
import type { Representation } from "molstar/lib/mol-repr/representation";
import { MarkerAction } from "molstar/lib/mol-util/marker-action";
import { SurfaceVisualRegistry } from "../viewer/surface/objects";
import { surfaceWireframe, surfaceWireframeBytes } from "../viewer/surface/wireframe";
import type { SurfaceGeometry } from "../viewer/surface/protocol";
import { SURFACE_LIMITS } from "../viewer/surface/protocol";
import { Structure } from "molstar/lib/mol-model/structure";
import { parsePDB } from "molstar/lib/mol-io/reader/pdb/parser";
import { trajectoryFromPDB } from "molstar/lib/mol-model-formats/structure/pdb";
import { attachSurfaceGeometry, attachSurfaceWireframe, detachSurfaceGeometry,
  SelectionSurfaceProvider, SelectionSurfaceWireframeProvider, surfaceDisplayGeometry } from "../viewer/surface/visual";

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

it("includes owner mappings and isolation buffers in the exact active working boundary", async () => {
  const count = geometry.indices.length;
  const nativeRetained = surfaceWireframeBytes(count) + count * 4 + (geometry.atomIds.length + 2) * 4;
  const baseline = geometry.evidence.meshBytes + nativeRetained + count * 8;
  const extra = SURFACE_LIMITS.workingBytes - baseline;
  const reserve = vi.fn();
  await expect(surfaceWireframe(geometry, new AbortController().signal, reserve, extra)).resolves.toBeDefined();
  expect(reserve).toHaveBeenCalledWith(nativeRetained);
  reserve.mockClear();
  for (const invalid of [extra + 1, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(surfaceWireframe(geometry, new AbortController().signal, reserve, invalid)).rejects.toThrow("2 GiB");
  }
  expect(reserve).not.toHaveBeenCalled();
});

it("releases the previous display binding when switching solid/mesh or disposing a component", async () => {
  const pdb = "HETATM    1   C1 LIG A   1       0.000   0.000   0.000  1.00 10.00           C  \nHETATM    2   C2 LIG A   1       2.000   0.000   0.000  1.00 10.00           C  \nEND\n";
  const parsed = await parsePDB(pdb).run();
  if (parsed.isError) throw new Error(parsed.message);
  const structure = Structure.ofModel((await trajectoryFromPDB(parsed.result).run()).representative);
  const display = await surfaceDisplayGeometry(structure, [10, 99], geometry, new AbortController().signal, () => {});
  attachSurfaceGeometry(structure, display.geometry);
  expect(SelectionSurfaceProvider.isApplicable(structure)).toBe(true);
  attachSurfaceWireframe(structure, Lines.createEmpty());
  expect(SelectionSurfaceProvider.isApplicable(structure)).toBe(false);
  expect(SelectionSurfaceWireframeProvider.isApplicable(structure)).toBe(true);
  attachSurfaceGeometry(structure, display.geometry);
  expect(SelectionSurfaceWireframeProvider.isApplicable(structure)).toBe(false);
  detachSurfaceGeometry(structure);
  expect(SelectionSurfaceProvider.isApplicable(structure)).toBe(false);
  expect(SelectionSurfaceWireframeProvider.isApplicable(structure)).toBe(false);
});

it("keeps surfaces passive while retaining current and retired identities", () => {
  const registry = new SurfaceVisualRegistry();
  const a = { mark: vi.fn(), setState: vi.fn() } as unknown as Representation.Any;
  const b = { mark: vi.fn(), setState: vi.fn() } as unknown as Representation.Any;
  const id = { entryId: "entry", surfaceId: "first" };
  const unbind = registry.register(a, id);
  registry.register(b, { entryId: "entry", surfaceId: "second" });
  expect(registry.identityFor(a)).toEqual(id);
  for (const repr of [a, b]) {
    expect(repr.mark).toHaveBeenCalledExactlyOnceWith({ kind: "every-loci" }, MarkerAction.Clear);
    expect(repr.setState).toHaveBeenCalledExactlyOnceWith({ pickable: false, markerActions: 0 });
  }
  unbind();
  expect(registry.identityFor(a)).toBeNull();
  expect(registry.isRetired(a)).toBe(true);
  expect(registry.isManaged(a)).toBe(true);
  registry.clearVisuals();
  expect(registry.identityFor(b)).toBeNull();
  expect(registry.isRetired(b)).toBe(true);
  registry.register(b, id);
  expect(registry.isRetired(b)).toBe(false);
  expect(registry.identityFor(b)).toEqual(id);
  registry.dispose();
  expect(registry.identityFor(b)).toBeNull();
});

it("keeps a renewed representation binding alive when an older unregister callback arrives", () => {
  const registry = new SurfaceVisualRegistry(), repr = { mark: vi.fn(), setState: vi.fn() } as unknown as Representation.Any;
  const old = registry.register(repr, { entryId: "entry", surfaceId: "old" });
  const current = registry.register(repr, { entryId: "entry", surfaceId: "current" });
  old();
  expect(registry.identityFor(repr)).toEqual({ entryId: "entry", surfaceId: "current" });
  expect(registry.isRetired(repr)).toBe(false);
  current(); expect(registry.isRetired(repr)).toBe(true); expect(registry.identityFor(repr)).toBeNull();
  expect(registry.isManaged({} as Representation.Any)).toBe(false);
});
