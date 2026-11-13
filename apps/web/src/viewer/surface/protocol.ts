/** Fixed molecular profile. Changes require scientific review and a new profile ID. */
export const SURFACE_PROFILE = {
  id: "molecular-v1", probeRadius: 1.4, resolution: 0.5, probePositions: 36,
  opacity: 0.45,
} as const;
export const SURFACE_LIMITS = {
  atoms: 100_000, entryAtoms: 249_999, cells: 64_000_000, meshBytes: 512 * 1024 * 1024,
  retainedBytes: 1024 * 1024 * 1024, workingBytes: 2 * 1024 * 1024 * 1024, deadlineMs: 120_000,
} as const;

export type SurfaceChannel = "entry" | "fragment" | "pocket";
export const surfaceKey = (entryId: string, channel: SurfaceChannel, surfaceId: string = channel) =>
  surfaceId === channel ? `${channel}:${entryId}` : JSON.stringify([entryId, surfaceId]);
export interface PocketCrop { profile: "pocket-v1"; seeds: Float64Array; radius: number }

export function surfaceAtomLimit(kind: SurfaceChannel): number {
  if (kind === "entry") return SURFACE_LIMITS.entryAtoms;
  if (kind === "fragment" || kind === "pocket") return SURFACE_LIMITS.atoms;
  throw new Error("Invalid surface source kind.");
}

export function validateSurfaceAtomCount(kind: SurfaceChannel, count: number): void {
  const limit = surfaceAtomLimit(kind);
  if (!Number.isSafeInteger(count) || count < 1 || count > limit) {
    throw new Error(kind === "entry" ? "Entry surface requires 1–249,999 atoms." : "Surface requires 1–100,000 atoms.");
  }
}

/** Calculation arrays and owner groups use strictly ascending canonical atom IDs. */
export interface SurfaceInput {
  kind: SurfaceChannel;
  pocket?: PocketCrop;
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
    sourceTriangles?: number;
    keptTriangles?: number;
  };
}
export type SurfaceWorkerResponse =
  | { kind: "progress"; message: string }
  | { kind: "complete"; geometry: SurfaceGeometry }
  | { kind: "error"; message: string };
