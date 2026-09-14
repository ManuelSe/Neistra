import { TriTable } from "molstar/lib/mol-geo/util/marching-cubes/tables";
import type { Tensor } from "molstar/lib/mol-math/linear-algebra";
import { SURFACE_LIMITS, SURFACE_PROFILE } from "./protocol";

const MiB = 1024 * 1024;
export function checkWorkingAllocation(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > SURFACE_LIMITS.workingBytes) {
    throw new Error("Surface working allocation exceeds 2 GiB; select a smaller region.");
  }
  return bytes;
}
export function checkMeshAllocation(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > SURFACE_LIMITS.meshBytes) {
    throw new Error("Surface mesh allocation exceeds 512 MiB; select a smaller region.");
  }
  return bytes;
}

/** Bounds the native fields, grid lookup, input copies and maximum neighbor lists. */
export function fieldAllocation(cells: number, dimensions: readonly number[], atoms: number) {
  // Physical radii >=0.5: native lookup cells (width >=1 Å) cannot exceed the
  // admitted 0.5 Å field grid. Include lookup build scratch and 2 input copies.
  // Native neighbor buffers grow at most to the atom count; no all-pairs storage.
  return checkWorkingAllocation(cells * 12 + dimensions.reduce((a, b) => a + b, 0) * 8
    + atoms * 256 + MiB);
}

/** Count actual crossing grid edges and native table triangles, without extracting a mesh. */
export function countSurfaceMesh(field: Tensor) {
  const [nx, ny, nz] = field.space.dimensions;
  const get = (x: number, y: number, z: number) => field.space.get(field.data, x, y, z) < SURFACE_PROFILE.probeRadius;
  let vertices = 0, triangles = 0, activeCells = 0;
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
    const a = get(x, y, z);
    // Each grid edge is counted once. This is an upper bound if native idField
    // omits a vertex; it never undercounts a valid edge used by marching cubes.
    if (x + 1 < nx && a !== get(x + 1, y, z)) vertices++;
    if (y + 1 < ny && a !== get(x, y + 1, z)) vertices++;
    if (z + 1 < nz && a !== get(x, y, z + 1)) vertices++;
    if (x + 1 === nx || y + 1 === ny || z + 1 === nz) continue;
    const mask = +a | (+get(x + 1, y, z) << 1) | (+get(x + 1, y + 1, z) << 2)
      | (+get(x, y + 1, z) << 3) | (+get(x, y, z + 1) << 4)
      | (+get(x + 1, y, z + 1) << 5) | (+get(x + 1, y + 1, z + 1) << 6)
      | (+get(x, y + 1, z + 1) << 7);
    if (mask !== 0 && mask !== 255) { activeCells++; triangles += TriTable[mask].length / 3; }
  }
  return { vertices, triangles, activeCells };
}

export function extractionAllocation(vertices: number, triangles: number, cells: number,
  dimensions: readonly number[], fieldBytes: number) {
  const nativeVertexChunk = Math.min(262144, Math.max(cells / 32, 1024));
  const vertexChunk = Math.ceil(nativeVertexChunk);
  const triangleChunk = Math.ceil(Math.min(65536, nativeVertexChunk * 4));
  const capacity = Math.max(1, Math.ceil(vertices / vertexChunk)) * vertexChunk * 28
    + Math.max(1, Math.ceil(triangles / triangleChunk)) * triangleChunk * 12;
  checkMeshAllocation(capacity);
  // Original chunks and compact output can coexist, alongside 2 native edge slices.
  const workingBytes = checkWorkingAllocation(fieldBytes + dimensions[0] * dimensions[1] * 24 + 2 * capacity + MiB);
  return { capacity, workingBytes };
}

export function groupingAllocation(rawBytes: number, vertices: number, triangles: number,
  mixedTriangles: number, fieldBytes: number, mappingBytes = 0) {
  // Native uniformTriangleGroup(false) appends precisely 3 vertices per mixed
  // triangle. It retains original indices in mesh metadata. Include chunk slack,
  // old/raw arrays, new chunks, compact arrays and the final transfer copies.
  const meshBytes = (vertices + mixedTriangles * 3) * 28 + triangles * 12;
  const capacity = checkMeshAllocation(meshBytes + mappingBytes + 1024 * 40);
  const workingBytes = checkWorkingAllocation(fieldBytes + 2 * rawBytes + 3 * capacity + MiB);
  return { capacity, workingBytes };
}
