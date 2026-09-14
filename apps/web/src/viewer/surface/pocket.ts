import { checkMeshAllocation, checkWorkingAllocation } from "./allocation";
import type { PocketCrop, SurfaceGeometry } from "./protocol";

export function validatePocketCrop(crop: PocketCrop) {
  if (crop.profile !== "pocket-v1" || !Number.isFinite(crop.radius)
    || crop.radius < 2 || crop.radius > 12 || !Number.isInteger(crop.radius * 2)) {
    throw new Error("Pocket radius must be 2–12 Å in 0.5 Å steps.");
  }
  if (!crop.seeds.length || crop.seeds.length % 3 || crop.seeds.some((value) => !Number.isFinite(value))) {
    throw new Error("Pocket seeds require finite atom coordinates.");
  }
  // Input copies and index entries are bounded separately from receptor atoms.
  return checkWorkingAllocation(crop.seeds.byteLength * 3 + crop.seeds.length / 3 * 128);
}

/** Allocate the worker seed buffer only after admission, without a JS flat copy. */
export function createPocketCrop(seeds: readonly { coordinates: readonly number[] }[], radius: number): PocketCrop {
  checkWorkingAllocation(seeds.length * (24 * 3 + 128));
  const coordinates = new Float64Array(seeds.length * 3);
  seeds.forEach((seed, i) => {
    if (seed.coordinates.length !== 3) throw new Error("Pocket seeds require three coordinates.");
    coordinates.set(seed.coordinates, i * 3);
  });
  const crop: PocketCrop = { profile: "pocket-v1", seeds: coordinates, radius };
  validatePocketCrop(crop);
  return crop;
}

/** Keep whole native triangles; no interpolation, capping, repair or new normals. */
export function cropPocketSurface(source: SurfaceGeometry, crop: PocketCrop): SurfaceGeometry {
  const seedBytes = validatePocketCrop(crop);
  const vertexCount = source.vertices.length / 3, triangleCount = source.indices.length / 3;
  // Full source and compact output coexist with marks, remapping and seed index.
  const workingBoundBytes = checkWorkingAllocation(source.evidence.workingBoundBytes
    + source.evidence.meshBytes + triangleCount + vertexCount * 4 + seedBytes);
  const buckets = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const { radius, seeds } = crop;
  for (let i = 0; i < seeds.length; i += 3) {
    const cell = key(...[0, 1, 2].map((axis) => Math.floor(seeds[i + axis] / radius)) as [number, number, number]);
    const bucket = buckets.get(cell);
    if (bucket) bucket.push(i); else buckets.set(cell, [i]);
  }
  const retained = new Uint8Array(triangleCount);
  const mapping = new Int32Array(vertexCount).fill(-1);
  let keptTriangles = 0, keptVertices = 0;
  for (let t = 0; t < triangleCount; t++) {
    const a = source.indices[t * 3] * 3, b = source.indices[t * 3 + 1] * 3, c = source.indices[t * 3 + 2] * 3;
    const x = (source.vertices[a] + source.vertices[b] + source.vertices[c]) / 3;
    const y = (source.vertices[a + 1] + source.vertices[b + 1] + source.vertices[c + 1]) / 3;
    const z = (source.vertices[a + 2] + source.vertices[b + 2] + source.vertices[c + 2]) / 3;
    const bx = Math.floor(x / radius), by = Math.floor(y / radius), bz = Math.floor(z / radius);
    let keep = false;
    for (let dx = -1; dx <= 1 && !keep; dx++) for (let dy = -1; dy <= 1 && !keep; dy++) for (let dz = -1; dz <= 1 && !keep; dz++) {
      for (const i of buckets.get(key(bx + dx, by + dy, bz + dz)) ?? []) {
        if ((x - seeds[i]) ** 2 + (y - seeds[i + 1]) ** 2 + (z - seeds[i + 2]) ** 2 <= radius ** 2) { keep = true; break; }
      }
    }
    if (!keep) continue;
    retained[t] = 1; keptTriangles++;
    for (let corner = 0; corner < 3; corner++) {
      const index = source.indices[t * 3 + corner];
      if (mapping[index] === -1) mapping[index] = keptVertices++;
    }
  }
  const meshBytes = checkMeshAllocation(keptVertices * 28 + keptTriangles * 12 + source.atomIds.byteLength);
  const vertices = new Float32Array(keptVertices * 3), normals = new Float32Array(keptVertices * 3);
  const groups = new Float32Array(keptVertices), indices = new Uint32Array(keptTriangles * 3);
  for (let old = 0; old < vertexCount; old++) {
    const next = mapping[old];
    if (next < 0) continue;
    vertices.set(source.vertices.subarray(old * 3, old * 3 + 3), next * 3);
    normals.set(source.normals.subarray(old * 3, old * 3 + 3), next * 3);
    groups[next] = source.groups[old];
  }
  let offset = 0;
  for (let t = 0; t < triangleCount; t++) if (retained[t]) {
    for (let corner = 0; corner < 3; corner++) indices[offset++] = mapping[source.indices[t * 3 + corner]];
  }
  return { vertices, normals, indices, groups, atomIds: source.atomIds,
    evidence: { ...source.evidence, meshBytes, workingBoundBytes,
      sourceTriangles: triangleCount, keptTriangles } };
}

/** Display isolation never changes receptor context or the cached patch. */
export function isolatePocketSurface(source: SurfaceGeometry, atomIds: ReadonlySet<number> | null): SurfaceGeometry {
  if (atomIds === null) return source;
  let count = 0;
  for (let i = 0; i < source.indices.length; i += 3) {
    const owner = source.atomIds[source.groups[source.indices[i]]];
    if (atomIds.has(owner)) count += 3;
  }
  const indices = new Uint32Array(count);
  let offset = 0;
  for (let i = 0; i < source.indices.length; i += 3) {
    if (atomIds.has(source.atomIds[source.groups[source.indices[i]]])) {
      indices.set(source.indices.subarray(i, i + 3), offset); offset += 3;
    }
  }
  return { ...source, indices };
}
