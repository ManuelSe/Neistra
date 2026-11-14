import { describe, expect, it } from "vitest";
import { Camera } from "molstar/lib/mol-canvas3d/camera";
import { Vec3, Vec4 } from "molstar/lib/mol-math/linear-algebra";
import { nativeCameraState, portableCamera, sessionCamera } from "../viewer/sessionCamera";
import type { SessionCamera } from "../workspacePresentation/types";
import { parseSessionCamera } from "../workspacePresentation/validation";

type Point = [number, number, number];
const viewport = { x: 0, y: 0, width: 900, height: 600 };
const roll = Math.PI / 6;
// This fixture's basis is known analytically: the eye looks down world -Z,
// rolled 30 degrees clockwise. It does not derive expectations from the bridge.
const right: Point = [Math.cos(roll), -Math.sin(roll), 0];
const up: Point = [Math.sin(roll), Math.cos(roll), 0];
const back: Point = [0, 0, 1];
const cameraFixture = (mode: SessionCamera["mode"]): SessionCamera => ({
  mode, position: [3, -2, 25], target: [3, -2, 5], up: [...up], radius: 4, fov: Math.PI / 3,
});
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const point = (camera: SessionCamera, horizontal: number, vertical: number, depth = 0): Point =>
  camera.target.map((axis, index) => axis + horizontal * right[index] + vertical * up[index] + depth * back[index]) as Point;

// All matrix operations are double precision. This relative tolerance allows
// accumulated rounding; at the fixture viewport it is below 1e-9 pixels.
function close(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1, Math.abs(expected)) * 1e-12);
}
function closePoint(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((axis, index) => close(actual[index], axis));
}
function renderCamera(camera: SessionCamera, sphere = { center: camera.target, radius: 9 }, scale = 1) {
  const state = nativeCameraState(camera, sphere, viewport, scale);
  const native = new Camera(state, { ...viewport });
  native.scale = scale;
  expect(native.update()).toBe(true);
  expect([native.view, native.projection, native.projectionView, native.inverseProjectionView]
    .every(matrix => matrix.every(Number.isFinite))).toBe(true);
  return native;
}
function project(camera: Camera, world: Point): number[] {
  return [...camera.project(Vec4(), Vec3.create(...world))];
}

describe("session camera projection and scene-independent pose", () => {
  for (const mode of ["perspective", "orthographic"] as const) {
    for (const scale of [1, 2]) {
      it(`restores analytic rolled landmarks and nondefault FOV in ${mode}, scale ${scale}`, () => {
        const saved = cameraFixture(mode), native = renderCamera(saved, undefined, scale);
        const distance = 20;
        const expectedZoom = viewport.height / ((2 * Math.tan(saved.fov / 2)) * distance * scale);
        close(native.zoom, expectedZoom);
        for (const [horizontal, vertical, depth] of [[0, 0, 0], [2, -3, 0], [-4, 1, 0], [1, 2, 4]]) {
          // Native view coordinates include the display scale. Perspective
          // magnification changes with depth; orthographic magnification does not.
          const eyeDistance = mode === "perspective" ? distance - depth : distance;
          const pixelsPerUnit = viewport.height / ((2 * Math.tan(saved.fov / 2)) * eyeDistance * scale);
          const world = point(saved, horizontal, vertical, depth).map(axis => axis * scale) as Point;
          const projected = project(native, world);
          close(projected[0], viewport.width / 2 + horizontal * scale * pixelsPerUnit);
          close(projected[1], viewport.height / 2 + vertical * scale * pixelsPerUnit);
          expect(projected.every(Number.isFinite)).toBe(true);
        }
        const basis: [Point, Point, Point] = [
          [native.view[0], native.view[4], native.view[8]],
          [native.view[1], native.view[5], native.view[9]],
          [native.view[2], native.view[6], native.view[10]],
        ];
        closePoint(basis[0], right); closePoint(basis[1], up); closePoint(basis[2], back);
        basis.forEach(axis => close(dot(axis, axis), 1));
        close(dot(basis[0], basis[1]), 0); close(dot(basis[0], basis[2]), 0); close(dot(basis[1], basis[2]), 0);
        closePoint(cross(basis[0], basis[1]), basis[2]);
        expect(sessionCamera(native.getSnapshot(), saved.radius)).toEqual(saved);
      });
    }

    it(`extends clipping for displaced geometry without moving the ${mode} camera`, () => {
      const saved = cameraFixture(mode), original = structuredClone(saved);
      const before = renderCamera(saved);
      const center: Point = [3, -2, -115];
      const after = renderCamera(saved, { center, radius: 3 });
      const landmarks = [point(saved, 0, 0), point(saved, 2, -3), point(saved, -4, 1), point(saved, 1, 2, 4)];
      landmarks.forEach(landmark => closePoint(project(after, landmark).slice(0, 2), project(before, landmark).slice(0, 2)));
      close(after.zoom, before.zoom);
      expect(after.getSnapshot().position).toEqual(saved.position);
      expect(after.getSnapshot().target).toEqual(saved.target);
      expect(after.getSnapshot().up).toEqual(saved.up);
      expect(after.getSnapshot().fov).toBe(saved.fov);
      for (const offset of [-3, 0, 3]) {
        const projected = project(after, [center[0], center[1], center[2] + offset]);
        // Include both ends of the displaced sphere along the viewing axis.
        expect(projected[2]).toBeGreaterThanOrEqual(-1e-10);
        expect(projected[2]).toBeLessThanOrEqual(1 + 1e-10);
      }
      expect(sessionCamera(after.getSnapshot(), saved.radius)).toEqual(saved);
      expect(saved).toEqual(original);
    });

    it(`keeps a distant ${mode} pose safe through an empty scene and tiny logical radius`, () => {
      const saved: SessionCamera = { ...cameraFixture(mode), position: [0, 0, 1_000_000], target: [0, 0, 0], up: [0, 1, 0], radius: 0.00001 };
      const state = nativeCameraState(saved, { center: [0, 0, 0], radius: 0 }, viewport);
      const native = new Camera(state, { ...viewport });
      expect(native.update()).toBe(true);
      // Independent documented control bound: ordinary ticks clamp eye distance
      // against radiusMax*1000 even when no new input is supplied.
      expect(state.radiusMax).toBeGreaterThan(0);
      expect(Number.isFinite(state.radiusMax * 1000)).toBe(true);
      expect(state.radiusMax * 1000).toBeGreaterThanOrEqual(1_000_000);
      expect(native.getSnapshot().position).toEqual(saved.position);
      close(native.zoom, viewport.height / (2 * Math.tan(saved.fov / 2) * 1_000_000));
      expect(sessionCamera(native.getSnapshot(), saved.radius)).toEqual(saved);
      const populated = renderCamera(saved, { center: [0, 0, -2_000_000], radius: 100 });
      expect(populated.getSnapshot().position).toEqual(saved.position);
      close(populated.zoom, native.zoom);
      expect(project(populated, [0, 0, -2_000_100])[2]).toBeLessThanOrEqual(1 + 1e-10);
    });

    for (const radius of [0.00001, Number.MAX_VALUE / 2]) {
      it(`preserves logical radius ${radius} while deriving finite ${mode} clipping`, () => {
        const saved = { ...cameraFixture(mode), radius };
        expect(parseSessionCamera(saved)).toEqual(saved);
        const native = renderCamera(saved);
        expect(native.getSnapshot().radius).toBeGreaterThanOrEqual(0.01);
        expect(Number.isFinite(native.near) && Number.isFinite(native.far)).toBe(true);
        expect(native.far).toBeGreaterThan(native.near);
        expect(sessionCamera(native.getSnapshot(), radius)).toEqual(saved);
      });
    }
  }

  it("retains the portable scene format and copies mutable camera vectors", () => {
    const saved = cameraFixture("perspective"), original = structuredClone(saved);
    const portable = portableCamera(saved);
    expect(Object.keys(portable).sort()).toEqual(["mode", "position", "radius", "target", "up"]);
    expect(portable).not.toHaveProperty("fov");
    portable.position[0] = 999; portable.target[1] = 999; portable.up[2] = 999;
    expect(saved).toEqual(original);
    const native = renderCamera(saved), captured = sessionCamera(native.getSnapshot(), saved.radius);
    native.position[0] = 999; native.target[1] = 999; native.up[2] = 999;
    expect(captured).toEqual(saved);
  });

  it("rejects a pose whose projection overflows the actual viewport before mutating its input", () => {
    const saved = { ...cameraFixture("perspective"), fov: 1e-307 };
    const original = structuredClone(saved);
    expect(parseSessionCamera(saved)).toEqual(saved);
    expect(() => nativeCameraState(saved, { center: saved.target, radius: 9 }, viewport)).toThrow("cannot be projected");
    expect(saved).toEqual(original);
  });
});
