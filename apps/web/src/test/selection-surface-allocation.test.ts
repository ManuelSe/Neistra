import { expect, it } from "vitest";
import { Tensor } from "molstar/lib/mol-math/linear-algebra";
import { computeMarchingCubesMesh } from "molstar/lib/mol-geo/util/marching-cubes/algorithm";
import { countSurfaceMesh, extractionAllocation, groupingAllocation, checkMeshAllocation, checkWorkingAllocation } from "../viewer/surface/allocation";
import { SURFACE_LIMITS, SURFACE_PROFILE } from "../viewer/surface/protocol";

it("bounds native extraction across every marching-cubes corner configuration", async () => {
  const space = Tensor.Space([2, 2, 2], [0, 1, 2], Float32Array);
  const corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  for (let mask = 0; mask < 256; mask++) {
    const field = Tensor.create(space, space.create());
    corners.forEach(([x, y, z], i) => space.set(field.data, x, y, z, mask & (1 << i) ? 0 : 2));
    const count = countSurfaceMesh(field);
    const mesh = await computeMarchingCubesMesh({ scalarField: field, isoLevel: SURFACE_PROFILE.probeRadius }).run();
    expect(count.vertices).toBe(mesh.vertexCount);
    expect(count.triangles).toBe(mesh.triangleCount);
    expect(count.activeCells).toBe(mask === 0 || mask === 255 ? 0 : 1);
  }
});

it("accounts native fractional chunk rounding and final owner mapping", () => {
  // Native triangle chunk is ceil(32769 / 32 * 4), not ceil(vertex chunk) * 4.
  const value = extractionAllocation(1, 4098, 32769, [3, 3, 3641], 0);
  expect(value.capacity).toBe(1025 * 28 + 2 * 4097 * 12);
  const grouping = groupingAllocation(100, 10, 5, 2, 1000, 400);
  expect(grouping.capacity).toBe(16 * 28 + 5 * 12 + 400 + 1024 * 40);
});

it("enforces exact mesh/working boundary and unsafe arithmetic", () => {
  expect(checkMeshAllocation(SURFACE_LIMITS.meshBytes)).toBe(SURFACE_LIMITS.meshBytes);
  expect(() => checkMeshAllocation(SURFACE_LIMITS.meshBytes + 1)).toThrow("512 MiB");
  expect(checkWorkingAllocation(SURFACE_LIMITS.workingBytes)).toBe(SURFACE_LIMITS.workingBytes);
  for (const bytes of [SURFACE_LIMITS.workingBytes + 1, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => checkWorkingAllocation(bytes)).toThrow("2 GiB");
  }
});
