import { expect, it } from "vitest";
import { computeSurface } from "../viewer/surface/geometry";
import { cropPocketSurface, isolatePocketSurface, validatePocketCrop } from "../viewer/surface/pocket";
import { SURFACE_LIMITS, type SurfaceGeometry, type SurfaceInput } from "../viewer/surface/protocol";

const input: SurfaceInput = { atomIds: Uint32Array.of(11, 22, 33, 44), x: Float64Array.of(0, 2.5, 5, 7.5),
  y: new Float64Array(4), z: new Float64Array(4), radii: new Float32Array(4).fill(1.7) };
const crop = (seeds: number[], radius = 2.5) => ({ profile: "pocket-v1" as const, seeds: Float64Array.from(seeds), radius });
function triangleData(g: SurfaceGeometry, triangle: number) {
  return Array.from(g.indices.subarray(triangle * 3, triangle * 3 + 3)).flatMap((i) => [
    ...g.vertices.subarray(i * 3, i * 3 + 3), ...g.normals.subarray(i * 3, i * 3 + 3), g.atomIds[g.groups[i]],
  ]);
}

it("matches a full-context reference triangle-for-triangle with unchanged normals, winding and owners", async () => {
  const full = await computeSurface(input), definition = crop([0, 0, 0]);
  const patch = await computeSurface({ ...input, pocket: definition });
  const expected = [];
  // Independent brute-force cutoff, without the production spatial index.
  for (let t = 0; t < full.indices.length / 3; t++) {
    const ids = [...full.indices.subarray(t * 3, t * 3 + 3)];
    const center = [0, 1, 2].map((axis) => ids.reduce((sum, i) => sum + full.vertices[i * 3 + axis], 0) / 3);
    if (Math.hypot(...center) <= definition.radius) expected.push(triangleData(full, t));
  }
  expect(expected.length).toBeGreaterThan(0); expect(expected.length).toBeLessThan(full.indices.length / 3);
  expect(Array.from({ length: patch.indices.length / 3 }, (_, t) => triangleData(patch, t))).toEqual(expected);
  expect(patch.evidence.sourceTriangles).toBe(full.indices.length / 3);
  expect(patch.atomIds).toEqual(input.atomIds);
  expect(patch.evidence.meshBytes).toBeLessThan(full.evidence.meshBytes);
  const fragment = await computeSurface({ atomIds: Uint32Array.of(11), x: Float64Array.of(0),
    y: Float64Array.of(0), z: Float64Array.of(0), radii: Float32Array.of(1.7) });
  expect(patch.vertices).not.toEqual(fragment.vertices);
  const positions = new Set(Array.from({ length: fragment.vertices.length / 3 }, (_, i) => [...fragment.vertices.subarray(i * 3, i * 3 + 3)].join(",")));
  expect(Array.from({ length: patch.vertices.length / 3 }, (_, i) => [...patch.vertices.subarray(i * 3, i * 3 + 3)].join(",")).some((v) => !positions.has(v))).toBe(true);
});

it("uses an inclusive centroid cutoff and allows empty and disconnected patches", async () => {
  const full = await computeSurface(input);
  const empty = cropPocketSurface(full, crop([100, 100, 100]));
  expect(empty.indices.length).toBe(0); expect(empty.vertices.length).toBe(0);
  expect(empty.atomIds).toBe(full.atomIds);
  const left = cropPocketSurface(full, crop([0, 0, 0], 2));
  const right = cropPocketSurface(full, crop([7.5, 0, 0], 2));
  const both = cropPocketSurface(full, crop([0, 0, 0, 7.5, 0, 0], 2));
  expect(both.indices.length).toBe(left.indices.length + right.indices.length);
  const plane: SurfaceGeometry = { ...full, vertices: Float32Array.of(2, -1, -1, 2, 1, -1, 2, 0, 2),
    normals: Float32Array.of(1, 0, 0, 1, 0, 0, 1, 0, 0), indices: Uint32Array.of(0, 1, 2), groups: Float32Array.of(0, 0, 0) };
  expect(cropPocketSurface(plane, crop([0, 0, 0], 2)).indices.length).toBe(3);
  expect(cropPocketSurface(plane, crop([-0.001, 0, 0], 2)).indices.length).toBe(0);
});

it("filters isolation by receptor ownership without changing cached geometry or context", async () => {
  const patch = await computeSurface({ ...input, pocket: crop([2.5, 0, 0], 5) });
  const before = patch.indices.slice();
  const isolated = isolatePocketSurface(patch, new Set([22]));
  expect(isolated.indices.length).toBeGreaterThan(0);
  for (const i of isolated.indices) expect(patch.atomIds[patch.groups[i]]).toBe(22);
  expect(isolated.vertices).toBe(patch.vertices); expect(isolated.normals).toBe(patch.normals);
  expect(patch.indices).toEqual(before); expect(isolatePocketSurface(patch, null)).toBe(patch);
  expect(isolatePocketSurface(patch, new Set()).indices.length).toBe(0);
});

it("validates radius, finite seeds and combined active allocation before crop scratch allocation", async () => {
  for (const radius of [2, 2.5, 12]) expect(() => validatePocketCrop(crop([0, 0, 0], radius))).not.toThrow();
  for (const radius of [1.5, 12.5, 2.1, NaN, Infinity]) expect(() => validatePocketCrop(crop([0, 0, 0], radius))).toThrow();
  for (const seeds of [[], [0], [NaN, 0, 0], [0, Infinity, 0]]) expect(() => validatePocketCrop(crop(seeds))).toThrow();
  const full = await computeSurface(input);
  expect(() => cropPocketSurface({ ...full, evidence: { ...full.evidence, workingBoundBytes: SURFACE_LIMITS.workingBytes } }, crop([0, 0, 0]))).toThrow("2 GiB");
});
