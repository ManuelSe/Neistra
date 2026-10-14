import { Lines } from "molstar/lib/mol-geo/geometry/lines/lines";
import { checkMeshAllocation, checkWorkingAllocation } from "./allocation";
import type { SurfaceGeometry } from "./protocol";

/** Native wide-line layout: 4 vertices and 6 indices per triangle edge. */
export function surfaceWireframeBytes(indexCount: number) {
  if (!Number.isSafeInteger(indexCount) || indexCount < 0 || indexCount % 3) throw new Error("Invalid surface triangle count.");
  return checkMeshAllocation(indexCount * 168);
}

/** Same triangle edges/groups as native Lines.fromMesh, with exact buffers and cooperative yields. */
export async function surfaceWireframe(geometry: SurfaceGeometry, signal: AbortSignal,
  reserve: (bytes: number) => void): Promise<Lines> {
  signal.throwIfAborted();
  const count = geometry.indices.length;
  const bytes = surfaceWireframeBytes(count);
  // Native Lines.groupMapping retains one index per line and group offsets;
  // its two temporary bucket arrays each have one entry per line.
  const retainedBytes = checkMeshAllocation(bytes + count * 4 + (geometry.atomIds.length + 2) * 4);
  checkWorkingAllocation(geometry.evidence.meshBytes + retainedBytes + count * 8);
  reserve(retainedBytes);
  const mappings = new Float32Array(count * 8), indices = new Uint32Array(count * 6),
    groups = new Float32Array(count * 4), starts = new Float32Array(count * 12), ends = new Float32Array(count * 12);
  for (let edge = 0; edge < count; edge++) {
    if (edge % 4095 === 0) {
      signal.throwIfAborted();
      if (edge) await new Promise<void>(resolve => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
    const triangle = edge - edge % 3;
    const offset = edge % 3;
    const from = geometry.indices[triangle + (offset === 2 ? 1 : 0)];
    const to = geometry.indices[triangle + (offset === 0 ? 1 : 2)];
    const group = geometry.groups[from];
    for (let vertex = 0; vertex < 4; vertex++) {
      groups[edge * 4 + vertex] = group;
      for (let axis = 0; axis < 3; axis++) {
        starts[edge * 12 + vertex * 3 + axis] = geometry.vertices[from * 3 + axis];
        ends[edge * 12 + vertex * 3 + axis] = geometry.vertices[to * 3 + axis];
      }
    }
    mappings.set([-1, -1, 1, -1, -1, 1, 1, 1], edge * 8);
    const v = edge * 4;
    indices.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], edge * 6);
  }
  signal.throwIfAborted();
  return Lines.create(mappings, indices, groups, starts, ends, new Uint32Array(0), count, count * 4, 0);
}
