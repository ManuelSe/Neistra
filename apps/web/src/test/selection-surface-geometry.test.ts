import type { Structure } from "molstar/lib/mol-model/structure";
import { surfaceInput } from "../viewer/surface/visual";
import { describe, expect, it } from "vitest";
import { computeSurface, meshAllocationBound, surfaceAdmission } from "../viewer/surface/geometry";
import type { SurfaceInput } from "../viewer/surface/protocol";

function atoms(xs: number[], ids = xs.map((_, i) => i + 11)): SurfaceInput {
  return { atomIds: Uint32Array.from(ids), x: Float64Array.from(xs), y: new Float64Array(xs.length),
    z: new Float64Array(xs.length), radii: new Float32Array(xs.length).fill(1.7) };
}

describe("selection surface geometry", () => {
  it("approximates an isolated atom's physical sphere, with finite mapped mesh and bounded allocations", async () => {
    const result = await computeSurface(atoms([0], [42]));
    expect(result.atomIds).toEqual(Uint32Array.of(42));
    expect(result.indices.length).toBeGreaterThan(100);
    const distances = [];
    for (let i = 0; i < result.vertices.length; i += 3) distances.push(Math.hypot(...result.vertices.slice(i, i + 3)));
    expect(Math.min(...distances)).toBeGreaterThan(1.7 - 0.5);
    expect(Math.max(...distances)).toBeLessThan(1.7 + 0.5);
    expect(new Set(result.groups)).toEqual(new Set([0]));
    expect(result.evidence.meshBytes).toBeLessThan(result.evidence.meshBoundBytes);
    expect(result.evidence.workingBoundBytes).toBeGreaterThan(result.evidence.meshBytes);
  });

  it("computes one union for overlapping atoms and distinct islands for separated atoms", async () => {
    const near = await computeSurface(atoms([0, 2]));
    const far = await computeSurface(atoms([0, 10]));
    expect(new Set(near.groups)).toEqual(new Set([0, 1]));
    expect(new Set(far.groups)).toEqual(new Set([0, 1]));
    // No triangles bridge the empty interval between separated spheres.
    for (let i = 0; i < far.indices.length; i += 3) {
      const xs = [...far.indices.slice(i, i + 3)].map((j) => far.vertices[j * 3]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(2);
    }
    expect(Math.max(...near.vertices.filter((_, i) => i % 3 === 0))).toBeLessThan(4.2);
  });

  it("has no hidden parent context and retains arbitrary stable IDs", async () => {
    const first = await computeSurface(atoms([0], [700]));
    const repeat = await computeSurface(atoms([0], [700]));
    expect(first.vertices).toEqual(repeat.vertices);
    const withNeighbor = await computeSurface(atoms([0, 2], [700, 9]));
    expect(first.vertices).not.toEqual(withNeighbor.vertices);
    expect(withNeighbor.atomIds).toEqual(Uint32Array.of(700, 9));
  });

  it("rejects atom, spatial, identity and mesh allocation limits before expensive allocation", () => {
    expect(() => surfaceAdmission(atoms(Array.from({ length: 20_001 }, () => 0)))).toThrow("20,000");
    expect(() => surfaceAdmission(atoms([0, 1e8]))).toThrow("grid-cell");
    expect(() => surfaceAdmission(atoms([NaN]))).toThrow("finite");
    expect(() => surfaceAdmission(atoms([0, 1], [7, 7]))).toThrow("mapping");
    expect(() => meshAllocationBound(100_000, 4_000_000, [100, 100, 400])).toThrow("allocation");
  });
});


it("rejects oversized projected components before reading atom arrays", () => {
  const oversized = { elementCount: 20_001, get units() { throw new Error("Atom arrays must not be read"); } };
  expect(() => surfaceInput(oversized as unknown as Structure, [])).toThrow("20,000");
});
