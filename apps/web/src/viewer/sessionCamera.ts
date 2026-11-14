import { Camera } from "molstar/lib/mol-canvas3d/camera";
import { Vec3 } from "molstar/lib/mol-math/linear-algebra";
import { BoundaryHelper } from "molstar/lib/mol-math/geometry/boundary-helper";
import type { GraphicsRenderObject } from "molstar/lib/mol-gl/render-object";
import type { CameraState } from "../api/types";
import type { SessionCamera } from "../workspacePresentation/types";
import { parseSessionCamera } from "../workspacePresentation/validation";

/** Portable scenes deliberately retain their existing camera wire format. */
export function portableCamera(camera: SessionCamera): CameraState {
  return { mode: camera.mode, position: [...camera.position], target: [...camera.target],
    up: [...camera.up], radius: camera.radius };
}

export function sessionCamera(snapshot: Camera.Snapshot, logicalRadius = snapshot.radius): SessionCamera | null {
  return parseSessionCamera({ mode: snapshot.mode, position: [...snapshot.position],
    target: [...snapshot.target], up: [...snapshot.up], radius: logicalRadius, fov: snapshot.fov });
}

export function drawableRenderObject(object: GraphicsRenderObject): boolean {
  return !object.state.disposed && object.state.visible && object.state.alphaFactor * object.values.alpha.ref.value > 0
    && object.values.drawCount.ref.value > 0 && object.values.boundingSphere.ref.value.radius > 0;
}

/** Public cached canvas spheres can remain stale with native automatic reset off. */
export function renderedSceneBounds(objects: readonly GraphicsRenderObject[], visibleOnly = false) {
  const helper = new BoundaryHelper("98");
  const included = objects.filter(object => visibleOnly ? drawableRenderObject(object)
    : !object.state.disposed && object.values.drawCount.ref.value > 0 && object.values.boundingSphere.ref.value.radius > 0);
  for (const object of included) helper.includeSphere(object.values.boundingSphere.ref.value);
  helper.finishedIncludeStep();
  for (const object of included) helper.radiusSphere(object.values.boundingSphere.ref.value);
  return helper.getSphere();
}

/** Clipping is disposable scene data; it must never change the remembered pose. */
type NativeSessionState = Pick<Camera.Snapshot, "mode" | "position" | "target" | "up" | "fov" | "radius" | "radiusMax" | "minNear" | "minFar" | "clipFar">;

export function nativeCameraState(camera: SessionCamera,
  sphere: { center: ArrayLike<number>; radius: number },
  viewport: { width: number; height: number }, scale = 1): NativeSessionState {
  const position = Vec3.create(...camera.position), target = Vec3.create(...camera.target);
  const distance = Vec3.distance(position, target);
  const extent = Math.hypot(...camera.target.map((value, axis) => value - sphere.center[axis])) + sphere.radius;
  if (!Number.isFinite(extent) || extent < 0 || !Number.isFinite(scale) || scale <= 0) {
    throw new Error("The scene has invalid camera clipping bounds.");
  }
  // Beyond the complete scene and the eye-to-target distance, a larger logical
  // focus radius adds no visible content. Bound its native counterpart without
  // narrowing the persisted positive-radius contract.
  let radius = Math.max(0.01, extent, Math.min(camera.radius, Math.max(distance, extent)));
  const radiusMax = Math.max(radius, distance, 0.01);
  const minNear = Math.min(1, distance * scale / 1000);
  const base = { mode: camera.mode, position, target, up: Vec3.create(...camera.up),
    fov: camera.fov, radiusMax, minNear, minFar: 0, clipFar: true };
  const validProjection = (candidateRadius: number) => {
    const probe = new Camera({ ...base, radius: candidateRadius },
      { x: 0, y: 0, width: Math.max(1, viewport.width), height: Math.max(1, viewport.height) });
    probe.scale = scale;
    return probe.update() && Number.isFinite(probe.zoom) && probe.zoom > 0
      && [probe.view, probe.projection, probe.projectionView, probe.inverseProjectionView]
        .every(matrix => matrix.every(Number.isFinite));
  };
  // At extreme distances, forming near*far can overflow while the pose itself
  // remains valid. Include the eye in derived clipping to keep near small.
  if (!validProjection(radius)) {
    radius = Math.max(radius, distance);
    if (!validProjection(radius)) throw new Error("The saved view cannot be projected in this viewport.");
  }
  return { ...base, radius, radiusMax: Math.max(radiusMax, radius) };
}
