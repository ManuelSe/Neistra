/** Fixed fragment profile. Changes require scientific review and a new profile ID. */
export const SURFACE_PROFILE = {
  id: "molecular-v1", probeRadius: 1.4, resolution: 0.5, probePositions: 36,
  opacity: 0.45,
} as const;
export const SURFACE_LIMITS = {
  atoms: 100_000, cells: 64_000_000, meshBytes: 512 * 1024 * 1024,
  retainedBytes: 1024 * 1024 * 1024, workingBytes: 2 * 1024 * 1024 * 1024, deadlineMs: 120_000,
} as const;

/** Dense serial groups map to the component's structural element iterator. */
export interface SurfaceInput {
  atomIds: Uint32Array;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  radii: Float32Array;
}
export interface SurfaceGeometry {
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  groups: Float32Array;
  atomIds: Uint32Array;
  evidence: {
    cells: number;
    activeCells: number;
    meshBytes: number;
    meshBoundBytes: number;
    workingBoundBytes: number;
    durationMs: number;
  };
}
export type SurfaceWorkerResponse =
  | { kind: "progress"; message: string }
  | { kind: "complete"; geometry: SurfaceGeometry }
  | { kind: "error"; message: string };
