import { cropPocketSurface, validatePocketCrop } from "./pocket";
import { checkWorkingAllocation, fieldAllocation, countSurfaceMesh, extractionAllocation, groupingAllocation } from "./allocation";
import { OrderedSet } from "molstar/lib/mol-data/int";
import { getBoundary } from "molstar/lib/mol-math/geometry/boundary";
import { calcMolecularSurface } from "molstar/lib/mol-math/geometry/molecular-surface";
import { computeMarchingCubesMesh } from "molstar/lib/mol-geo/util/marching-cubes/algorithm";
import { Mesh } from "molstar/lib/mol-geo/geometry/mesh/mesh";
import { RuntimeContext } from "molstar/lib/mol-task";
import { SURFACE_LIMITS, SURFACE_PROFILE, type SurfaceGeometry, type SurfaceInput } from "./protocol";

export function surfaceAdmission(input: SurfaceInput) {
  if (input.pocket) validatePocketCrop(input.pocket);
  const n = input.atomIds.length;
  if (!n || n > SURFACE_LIMITS.atoms) throw new Error("Surface requires 1–100,000 atoms.");
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
    throw new Error("Surface exceeds the 64 million grid-cell limit.");
  }
  return { cells, maxRadius, dimensions, fieldBytes: checkWorkingAllocation(fieldAllocation(cells, dimensions, n) + (input.pocket ? validatePocketCrop(input.pocket) : 0)) };
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
  progress("Checking mesh allocations");
  const counts = countSurfaceMesh(field);
  const extraction = extractionAllocation(counts.vertices, counts.triangles, admission.cells,
    admission.dimensions, admission.fieldBytes);
  progress("Building surface mesh");
  const mesh = await computeMarchingCubesMesh({ scalarField: field, idField, isoLevel: SURFACE_PROFILE.probeRadius }).run();
  if (mesh.vertexCount > counts.vertices || mesh.triangleCount > counts.triangles) {
    throw new Error("Surface extraction allocation mismatch.");
  }
  const rawBytes = mesh.vertexBuffer.ref.value.byteLength + mesh.normalBuffer.ref.value.byteLength
    + mesh.groupBuffer.ref.value.byteLength + mesh.indexBuffer.ref.value.byteLength;
  const meshIndices = mesh.indexBuffer.ref.value, atomGroups = mesh.groupBuffer.ref.value;
  let mixed = 0;
  for (let i = 0; i < mesh.triangleCount * 3; i += 3) {
    if (atomGroups[meshIndices[i]] !== atomGroups[meshIndices[i + 1]] || atomGroups[meshIndices[i]] !== atomGroups[meshIndices[i + 2]]) mixed++;
  }
  const grouping = groupingAllocation(rawBytes, mesh.vertexCount, mesh.triangleCount, mixed, admission.fieldBytes, input.atomIds.byteLength);
  const bound = { meshBoundBytes: grouping.capacity,
    workingBoundBytes: Math.max(admission.fieldBytes, extraction.workingBytes, grouping.workingBytes) };
  Mesh.transform(mesh, transform);
  // Flat atom-associated groups support both WebGL generations without changing
  // geometry. This follows Mol*'s supported no-subdivision path, not custom chemistry.
  Mesh.uniformTriangleGroup(mesh, false);
  const vertices = mesh.vertexBuffer.ref.value.slice(0, mesh.vertexCount * 3);
  const normals = mesh.normalBuffer.ref.value.slice(0, mesh.vertexCount * 3);
  const groups = mesh.groupBuffer.ref.value.slice(0, mesh.vertexCount);
  const triangles = mesh.indexBuffer.ref.value.slice(0, mesh.triangleCount * 3);
  const meshBytes = vertices.byteLength + normals.byteLength + groups.byteLength + triangles.byteLength + input.atomIds.byteLength;
  if (meshBytes > SURFACE_LIMITS.meshBytes || meshBytes > bound.meshBoundBytes
    || !mesh.triangleCount || vertices.some((v) => !Number.isFinite(v))
    || normals.some((v) => !Number.isFinite(v))
    || groups.some((g) => !Number.isInteger(g) || g < 0 || g >= input.atomIds.length)
    || triangles.some((i) => i >= mesh.vertexCount)) throw new Error("Surface geometry failed validation.");
  const geometry = { vertices, normals, indices: triangles, groups, atomIds: input.atomIds,
    evidence: { cells: admission.cells, activeCells: counts.activeCells, meshBytes, ...bound, durationMs: performance.now() - started } };
  if (!input.pocket) return geometry;
  progress("Cropping protein pocket");
  const pocket = cropPocketSurface(geometry, input.pocket);
  pocket.evidence.durationMs = performance.now() - started;
  return pocket;
}
