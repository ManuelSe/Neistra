import { OrderedSet } from "molstar/lib/mol-data/int";
import { getBoundary } from "molstar/lib/mol-math/geometry/boundary";
import { calcMolecularSurface } from "molstar/lib/mol-math/geometry/molecular-surface";
import { computeMarchingCubesMesh } from "molstar/lib/mol-geo/util/marching-cubes/algorithm";
import { Mesh } from "molstar/lib/mol-geo/geometry/mesh/mesh";
import { RuntimeContext } from "molstar/lib/mol-task";
import { SURFACE_LIMITS, SURFACE_PROFILE, type SurfaceGeometry, type SurfaceInput } from "./protocol";

export function surfaceAdmission(input: SurfaceInput) {
  const n = input.atomIds.length;
  if (!n || n > SURFACE_LIMITS.atoms) throw new Error("Surface requires 1–20,000 visible atoms.");
  if ([input.x, input.y, input.z, input.radii].some((a) => a.length !== n)
    || new Set(input.atomIds).size !== n || input.atomIds.some((id) => id === 0)) {
    throw new Error("Invalid surface atom mapping.");
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let maxRadius = 0;
  for (let i = 0; i < n; i++) {
    const radius = input.radii[i];
    if (!Number.isFinite(radius) || radius < 0.5 || radius > 10) throw new Error("Invalid surface radius.");
    maxRadius = Math.max(maxRadius, radius);
    for (const [axis, values] of [input.x, input.y, input.z].entries()) {
      const value = values[i];
      if (!Number.isFinite(value)) throw new Error("Surface coordinates must be finite.");
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  // Matches pinned calcMolecularSurface's center box + max physical radius + grid spacing.
  const padding = maxRadius + SURFACE_PROFILE.resolution;
  const dimensions = min.map((low, axis) => Math.ceil(
    ((max[axis] + padding) - (low - padding)) / SURFACE_PROFILE.resolution,
  ));
  const cells = dimensions.reduce((a, b) => a * b, 1);
  if (!Number.isSafeInteger(cells) || cells <= 0 || cells > SURFACE_LIMITS.cells) {
    throw new Error("Surface exceeds the 4 million grid-cell limit; select a smaller region.");
  }
  return { cells, maxRadius, dimensions };
}

/** Count intersected cells, without extracting geometry or copying the native algorithm. */
export function meshAllocationBound(activeCells: number, cells: number, dimensions: readonly number[]) {
  // Native MC: <=12 edge vertices + 5 triangles per intersected cell. Uniform groups
  // (without geometric subdivision) can add <=3 vertices/triangle. 28 bytes/vertex
  // (position, normal, group), 12/triangle. Include initial array chunk rounding.
  const meshBoundBytes = activeCells * ((12 + 15) * 28 + 5 * 12);
  const vertexChunk = Math.min(262144, Math.max(cells / 32, 1024));
  const chunkSlack = Math.ceil(vertexChunk) * 28 + Math.ceil(Math.min(65536, vertexChunk * 4)) * 12 + 64 * 1024;
  // Fields, two MC edge-cache slices, original/chunked/compacted mesh buffers,
  // plus bounded input, lookup/neighbor arrays and conservative object overhead.
  const workingBoundBytes = cells * 8 + dimensions[0] * dimensions[1] * 24
    + 4 * (meshBoundBytes + chunkSlack) + SURFACE_LIMITS.atoms * 256;
  if (meshBoundBytes + chunkSlack > SURFACE_LIMITS.meshBytes) {
    throw new Error("Surface mesh allocation exceeds 64 MiB; select a smaller region.");
  }
  return { meshBoundBytes, workingBoundBytes };
}

export async function computeSurface(input: SurfaceInput, progress: (message: string) => void = () => {}): Promise<SurfaceGeometry> {
  const started = performance.now();
  const admission = surfaceAdmission(input);
  const indices = OrderedSet.ofBounds(0, input.atomIds.length);
  const position = { x: input.x, y: input.y, z: input.z, indices };
  const boundary = getBoundary(position);
  const radii = Float32Array.from(input.radii, (r) => r + SURFACE_PROFILE.probeRadius);
  progress("Computing surface field");
  const result = await calcMolecularSurface(RuntimeContext.Synchronous,
    { ...position, radius: radii, id: Int32Array.from(input.atomIds, (_, i) => i) },
    boundary, admission.maxRadius, boundary.box, SURFACE_PROFILE);
  const { field, idField, transform } = result;
  if (field.data.length !== admission.cells) throw new Error("Surface grid admission mismatch.");
  const [nx, ny, nz] = field.space.dimensions;
  const get = (x: number, y: number, z: number) => field.space.get(field.data, x, y, z) < SURFACE_PROFILE.probeRadius;
  let activeCells = 0;
  for (let x = 0; x < nx - 1; x++) for (let y = 0; y < ny - 1; y++) for (let z = 0; z < nz - 1; z++) {
    const first = get(x, y, z);
    if (get(x + 1, y, z) !== first || get(x, y + 1, z) !== first || get(x + 1, y + 1, z) !== first
      || get(x, y, z + 1) !== first || get(x + 1, y, z + 1) !== first
      || get(x, y + 1, z + 1) !== first || get(x + 1, y + 1, z + 1) !== first) activeCells++;
  }
  const bound = meshAllocationBound(activeCells, admission.cells, admission.dimensions);
  progress("Building surface mesh");
  const mesh = await computeMarchingCubesMesh({ scalarField: field, idField, isoLevel: SURFACE_PROFILE.probeRadius }).run();
  Mesh.transform(mesh, transform);
  // Flat atom-associated groups support both WebGL generations without changing
  // geometry. This follows Mol*'s supported no-subdivision path, not custom chemistry.
  Mesh.uniformTriangleGroup(mesh, false);
  const vertices = mesh.vertexBuffer.ref.value.slice(0, mesh.vertexCount * 3);
  const normals = mesh.normalBuffer.ref.value.slice(0, mesh.vertexCount * 3);
  const groups = mesh.groupBuffer.ref.value.slice(0, mesh.vertexCount);
  const triangles = mesh.indexBuffer.ref.value.slice(0, mesh.triangleCount * 3);
  const meshBytes = vertices.byteLength + normals.byteLength + groups.byteLength + triangles.byteLength;
  if (meshBytes > SURFACE_LIMITS.meshBytes || meshBytes > bound.meshBoundBytes
    || !mesh.triangleCount || vertices.some((v) => !Number.isFinite(v))
    || normals.some((v) => !Number.isFinite(v))
    || groups.some((g) => !Number.isInteger(g) || g < 0 || g >= input.atomIds.length)
    || triangles.some((i) => i >= mesh.vertexCount)) throw new Error("Surface geometry failed validation.");
  return { vertices, normals, indices: triangles, groups, atomIds: input.atomIds,
    evidence: { cells: admission.cells, activeCells, meshBytes, ...bound, durationMs: performance.now() - started } };
}
