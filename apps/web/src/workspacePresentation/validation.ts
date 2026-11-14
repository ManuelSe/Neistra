import type { SessionCamera, WorkspacePresentationV1 } from "./types";

type Vector = [number, number, number];
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const cameraFields = new Set(["mode", "position", "target", "up", "radius", "fov"]);
const presentationFields = new Set(["schema_version", "revision", "camera", "updated_at"]);
const vector = (value: unknown): value is Vector => Array.isArray(value) && value.length === 3 && value.every(finite);
const norm = (value: Vector) => Math.sqrt(value[0] * value[0] + value[1] * value[1] + value[2] * value[2]);
const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalized = (value: Vector): Vector | null => {
  const length = norm(value), reciprocal = 1 / length;
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(reciprocal)) return null;
  const result: Vector = [value[0] * reciprocal, value[1] * reciprocal, value[2] * reciprocal];
  return result.every(Number.isFinite) ? result : null;
};

/** Validate the arithmetic used by the pinned camera, not just finite inputs. */
export function parseSessionCamera(value: unknown): SessionCamera | null {
  if (!record(value) || Object.keys(value).some(key => !cameraFields.has(key)) || (value.mode !== "perspective" && value.mode !== "orthographic")
    || !vector(value.position) || !vector(value.target) || !vector(value.up)
    || !finite(value.radius) || value.radius <= 0 || !finite(value.fov) || value.fov <= 0 || value.fov >= Math.PI) return null;
  const delta: Vector = [value.position[0] - value.target[0], value.position[1] - value.target[1], value.position[2] - value.target[2]];
  if (!delta.every(Number.isFinite) || delta.every(axis => Math.abs(axis) < 0.000001)) return null;
  const z = normalized(delta);
  if (!z) return null;
  // Native lookAt crosses the unscaled up vector. Checking only a normalized
  // version would miss overflow/underflow in that actual operation.
  const x = normalized(cross(value.up, z));
  const y = x && normalized(cross(z, x));
  if (!x || !y) return null;
  for (const basis of [x, y, z]) {
    if (!Number.isFinite(basis[0] * value.position[0] + basis[1] * value.position[1] + basis[2] * value.position[2])) return null;
  }
  const tangent = Math.tan(value.fov / 2), span = 2 * tangent * norm(delta), reciprocalSpan = 1 / span;
  if (!Number.isFinite(tangent) || tangent <= 0 || !Number.isFinite(span) || span <= 0
    || !Number.isFinite(reciprocalSpan) || reciprocalSpan <= 0) return null;
  return copySessionCamera({ mode: value.mode, position: value.position, target: value.target, up: value.up, radius: value.radius, fov: value.fov });
}

export function copySessionCamera(camera: SessionCamera): SessionCamera {
  return { mode: camera.mode, position: [...camera.position], target: [...camera.target], up: [...camera.up], radius: camera.radius, fov: camera.fov };
}

export function sameSessionCamera(a: SessionCamera | null, b: SessionCamera | null): boolean {
  return a === b || Boolean(a && b && a.mode === b.mode && a.radius === b.radius && a.fov === b.fov
    && a.position.every((axis, index) => axis === b.position[index])
    && a.target.every((axis, index) => axis === b.target[index]) && a.up.every((axis, index) => axis === b.up[index]));
}

export function parseWorkspacePresentation(value: unknown): WorkspacePresentationV1 | null {
  if (!record(value) || Object.keys(value).some(key => !presentationFields.has(key)) || value.schema_version !== 1 || !Number.isSafeInteger(value.revision)
    || (value.revision as number) < 0 || (value.updated_at !== null && (typeof value.updated_at !== "string"
      || !Number.isFinite(Date.parse(value.updated_at))))) return null;
  const camera = value.camera === null ? null : parseSessionCamera(value.camera);
  if (value.camera !== null && !camera) return null;
  if ((value.revision === 0 && (camera !== null || value.updated_at !== null))
    || (value.revision !== 0 && (camera === null || value.updated_at === null))) return null;
  return { schema_version: 1, revision: value.revision as number, camera, updated_at: value.updated_at };
}
