import type { Structure } from "molstar/lib/mol-model/structure";
import { surfaceInput } from "../viewer/surface/visual";
import { describe, expect, it } from "vitest";
import { computeSurface, surfaceAdmission } from "../viewer/surface/geometry";
import { extractionAllocation, groupingAllocation, checkWorkingAllocation } from "../viewer/surface/allocation";
import type { SurfaceInput } from "../viewer/surface/protocol";
import { SURFACE_PROFILE } from "../viewer/surface/protocol";
import { ensureReasonableResolution } from "molstar/lib/mol-repr/structure/visual/util/common";
import { Vec3 } from "molstar/lib/mol-math/linear-algebra";

function atoms(xs: number[], ids = xs.map((_, i) => i + 11)): SurfaceInput {
  const ordered = ids.map((id, index) => ({ id, x: xs[index] })).sort((a, b) => a.id - b.id);
  return { kind: "fragment", atomIds: Uint32Array.from(ordered, row => row.id), x: Float64Array.from(ordered, row => row.x), y: new Float64Array(xs.length),
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

  it("removes physically buried interface faces rather than retaining two isolated unit shells", async () => {
    const combined = await computeSurface({ ...atoms([0, 2]), kind: "entry" });
    const separate = [await computeSurface(atoms([0])), await computeSurface(atoms([2]))];
    // A solvent-excluded boundary cannot lie inside either physical atom.
    // Permit one declared 0.5 Å grid step for discretization, independently of mesh construction.
    const minimumAllowedDistance = 1.7 - 0.5;
    const buriedVertices = (vertices: Float32Array) => {
      let count = 0;
      for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
        if (Math.hypot(x, y, z) < minimumAllowedDistance
          || Math.hypot(x - 2, y, z) < minimumAllowedDistance) count++;
      }
      return count;
    };
    expect(buriedVertices(combined.vertices)).toBe(0);
    expect(separate.reduce((sum, shell) => sum + buriedVertices(shell.vertices), 0)).toBeGreaterThan(0);
  });

  it("has no hidden parent context and retains arbitrary stable IDs", async () => {
    const first = await computeSurface(atoms([0], [700]));
    const repeat = await computeSurface(atoms([0], [700]));
    expect(first.vertices).toEqual(repeat.vertices);
    const withNeighbor = await computeSurface(atoms([0, 2], [700, 9]));
    expect(first.vertices).not.toEqual(withNeighbor.vertices);
    expect(withNeighbor.atomIds).toEqual(Uint32Array.of(9, 700));
  });

  it("rejects atom, spatial, identity and mesh allocation limits before expensive allocation", () => {
    expect(() => surfaceAdmission(atoms(Array.from({ length: 100_001 }, () => 0)))).toThrow("100,000");
    expect(() => surfaceAdmission(atoms([0, 1e8]))).toThrow("grid-cell");
    expect(() => surfaceAdmission(atoms([NaN]))).toThrow("finite");
    expect(() => surfaceAdmission(atoms([0, 1], [7, 7]))).toThrow("mapping");
    expect(() => extractionAllocation(30_000_000, 20_000_000, 64_000_000, [400, 400, 400], 800_000_000)).toThrow("512 MiB");
    expect(() => groupingAllocation(100, 10_000_000, 10_000_000, 10_000_000, 100)).toThrow("512 MiB");
    expect(() => checkWorkingAllocation(2 * 1024 ** 3 + 1)).toThrow("2 GiB");
  });
});


it("rejects oversized projected components before reading atom arrays", () => {
  const oversized = { elementCount: 100_001, get units() { throw new Error("Atom arrays must not be read"); } };
  expect(() => surfaceInput(oversized as unknown as Structure, [])).toThrow("100,000");
});

it("admits the exact atom boundary without weakening dispersed-coordinate rejection", () => {
  const input = atoms(Array.from({ length: 100_000 }, (_, i) => i % 100));
  expect(surfaceAdmission(input).cells).toBeLessThan(64_000_000);
  expect(() => surfaceAdmission({ ...input, x: new Float64Array(100_000).fill(Infinity) })).toThrow("finite");
});

it("admits exactly 64 million padded cells and rejects the next grid width", () => {
  const input = atoms([0, 195.4]); input.y[1] = 195.4; input.z[1] = 195.4;
  expect(surfaceAdmission(input).dimensions).toEqual([400, 400, 400]);
  expect(surfaceAdmission(input).cells).toBe(64_000_000);
  input.x[1] = 196;
  expect(() => surfaceAdmission(input)).toThrow("64 million");
});

it("admits entry counts independently and rejects unsupported source kinds and crop combinations", () => {
  const entry = { ...atoms(Array.from({ length: 249_999 }, () => 0)), kind: "entry" as const };
  expect(surfaceAdmission(entry).cells).toBeGreaterThan(0);
  expect(() => surfaceAdmission({ ...atoms(Array.from({ length: 250_000 }, () => 0)), kind: "entry" })).toThrow("249,999");
  expect(() => surfaceAdmission({ ...entry, kind: "fragment" })).toThrow("100,000");
  expect(() => surfaceAdmission({ ...atoms([0]), kind: undefined } as unknown as SurfaceInput)).toThrow("source kind");
  expect(() => surfaceAdmission({ ...atoms([0]), kind: "invalid" } as unknown as SurfaceInput)).toThrow("source kind");
  expect(() => surfaceAdmission({ ...atoms([0]), kind: "pocket" })).toThrow("crop mismatch");
  expect(() => surfaceAdmission({ ...atoms([0]), pocket: { profile: "pocket-v1", seeds: Float64Array.of(0, 0, 0), radius: 5 } })).toThrow("crop mismatch");
  expect(() => surfaceAdmission({ ...atoms([0, 2]), atomIds: Uint32Array.of(9, 7) })).toThrow("mapping");
});

it("refuses the entry extraction boundary before reading component atoms", () => {
  const oversized = { elementCount: 250_000, get units() { throw new Error("Atom arrays must not be read"); } };
  expect(() => surfaceInput(oversized as unknown as Structure, [], "entry")).toThrow("249,999");
});

it("keeps the fixed grid on a wide thin source that triggers the native adaptive-resolution guard", async () => {
  const input = { ...atoms([0, 400]), kind: "entry" as const }; input.y[1] = 400;
  const nativeAdaptive = ensureReasonableResolution({ min: Vec3.create(0, 0, 0), max: Vec3.create(400, 400, 0) }, SURFACE_PROFILE);
  expect(nativeAdaptive.resolution).toBeGreaterThan(0.5);
  const admission = surfaceAdmission(input);
  expect(admission.dimensions).toEqual([809, 809, 9]);
  expect(admission.cells).toBe(5_890_329);
  const geometry = await computeSurface(input);
  expect(geometry.evidence.cells).toBe(5_890_329);
  expect(geometry.indices.length).toBeGreaterThan(0);
}, 20_000);
