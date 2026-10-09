import type {
  AtomReference, CameraState, CoordinatePatch, Point3D, Project,
  RotationMatrix, Selection, SelectionTransform, StructureProjection,
} from "../api/types";
import { canonicalSelection } from "../selection/selection";

export type MovementMode = "rotate" | "translate" | "depth";
type Quaternion = [number, number, number, number];
export interface MovementPose {
  rotation: Quaternion;
  translation: Point3D;
}
export interface MovementCapture {
  project: Project;
  selection: Selection;
  centroid: Point3D;
  originals: CoordinatePatch[];
  artifacts: ReadonlyMap<string, string>;
  hiddenCount: number;
  crossingBonds: number;
}
export interface MovementView {
  camera: CameraState;
  height: number;
  /** Pinned viewer field of view, in radians. */
  fov: number;
}

const add = (a: Point3D, b: Point3D): Point3D => a.map((v, i) => v + b[i]) as Point3D;
const scale = (a: Point3D, n: number): Point3D => a.map(v => v * n) as Point3D;
const dot = (a: Point3D, b: Point3D) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a: Point3D, b: Point3D): Point3D => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
function unit(a: Point3D): Point3D {
  const length = Math.hypot(...a);
  if (!Number.isFinite(length) || length < 1e-12) throw new Error("The viewer camera basis is unavailable.");
  return scale(a, 1 / length);
}

export function initialMovementPose(): MovementPose {
  return { rotation: [0, 0, 0, 1], translation: [0, 0, 0] };
}

/** Copy operation inputs; never retain mutable coordinate arrays from the cache. */
export function captureMovement(
  project: Project, selection: Selection, structures: ReadonlyMap<string, StructureProjection>,
  rendered: readonly AtomReference[],
): MovementCapture {
  const captured = canonicalSelection(selection.atoms.map(atom => ({ ...atom })), selection.granularity, selection.source);
  if (!captured.atoms.length) throw new Error("Select atoms before starting Move selection.");
  const renderedKeys = new Set(rendered.map(atom => `${atom.structure_id}:${atom.atom_id}`));
  const groups = new Map<string, number[]>();
  for (const atom of captured.atoms) {
    const ids = groups.get(atom.structure_id) ?? [];
    ids.push(atom.atom_id);
    groups.set(atom.structure_id, ids);
  }
  const originals: CoordinatePatch[] = [];
  const artifacts = new Map<string, string>();
  let crossingBonds = 0;
  let hiddenCount = 0;
  let centroid: Point3D = [0, 0, 0];
  for (const [entryId, ids] of groups) {
    const entry = project.entries.find(item => item.id === entryId);
    if (!entry?.current_artifact_id) throw new Error("A selected structure is no longer available.");
    if (entry.locked) throw new Error(`Unlock ${entry.name} before moving the selection.`);
    const projection = structures.get(entryId);
    if (!projection || projection.entry_id !== entryId) throw new Error(`The selected structure ${entry.name} is not loaded.`);
    const atoms = new Map(projection.structure.atoms.map(atom => [atom.id, atom]));
    const coordinates = ids.map(id => {
      const atom = atoms.get(id);
      if (!atom || !atom.coordinates.every(Number.isFinite)) throw new Error("A selected atom is missing or has invalid coordinates.");
      const point = [...atom.coordinates] as Point3D;
      centroid = add(centroid, scale(point, 1 / captured.atoms.length));
      if (!renderedKeys.has(`${entryId}:${id}`)) hiddenCount++;
      return point;
    });
    const selected = new Set(ids);
    crossingBonds += projection.structure.bonds.filter(bond => selected.has(bond.atom_1_id) !== selected.has(bond.atom_2_id)).length;
    originals.push({ entry_id: entryId, artifact_id: entry.current_artifact_id, atom_ids: [...ids], coordinates });
    artifacts.set(entryId, entry.current_artifact_id);
  }
  if (hiddenCount === captured.atoms.length) throw new Error("Show selected atoms in the viewer before starting Move selection. Hidden atoms remain movement targets.");
  return { project: structuredClone(project), selection: captured, centroid, originals, artifacts, hiddenCount, crossingBonds };
}

function compose(left: Quaternion, right: Quaternion): Quaternion {
  const [x,y,z,w] = left, [a,b,c,d] = right;
  const q: Quaternion = [w*a+x*d+y*c-z*b, w*b-x*c+y*d+z*a, w*c+x*b-y*a+z*d, w*d-x*a-y*b-z*c];
  const n = Math.hypot(...q);
  return q.map(v => v / n) as Quaternion;
}

function axisRotation(axis: Point3D, angle: number): Quaternion {
  const a = unit(axis), s = Math.sin(angle / 2);
  return [a[0]*s, a[1]*s, a[2]*s, Math.cos(angle / 2)];
}

export function movementMatrix(pose: MovementPose): RotationMatrix {
  const [x,y,z,w] = pose.rotation;
  return [
    [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
    [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
    [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)],
  ];
}

/** Screen deltas use the camera at drag start; screen Y is downward. */
export function movePose(
  capture: MovementCapture, start: MovementPose, mode: MovementMode,
  dx: number, dy: number, view: MovementView, sensitivity = 1,
): MovementPose {
  if (![dx, dy, sensitivity, view.height, view.fov].every(Number.isFinite) || view.height <= 0 || sensitivity <= 0 || view.fov <= 0 || view.fov >= Math.PI) {
    throw new Error("Movement requires finite deltas and a valid viewport.");
  }
  const forward = unit(add(view.camera.target, scale(view.camera.position, -1)));
  const right = unit(cross(forward, view.camera.up));
  const up = unit(cross(right, forward));
  if (mode === "rotate") {
    const yaw = axisRotation(up, dx * Math.PI / view.height * sensitivity);
    const pitch = axisRotation(right, dy * Math.PI / view.height * sensitivity);
    return { rotation: compose(pitch, compose(yaw, start.rotation)), translation: [...start.translation] };
  }
  const pivot = add(capture.centroid, start.translation);
  const distance = view.camera.mode === "orthographic"
    ? Math.hypot(...add(view.camera.target, scale(view.camera.position, -1)))
    : Math.max(1e-3, dot(add(pivot, scale(view.camera.position, -1)), forward));
  const units = 2 * distance * Math.tan(view.fov / 2) / view.height * sensitivity;
  const delta = mode === "depth" ? scale(forward, -dy * units) : add(scale(right, dx * units), scale(up, -dy * units));
  return { rotation: [...start.rotation], translation: add(start.translation, delta) };
}

export function movementRequest(capture: MovementCapture, pose: MovementPose): SelectionTransform {
  const rotation_matrix = movementMatrix(pose);
  const rotated = rotation_matrix.map(row => dot(row, capture.centroid)) as Point3D;
  return { selection: capture.selection, rotation_matrix, translation: add(add(capture.centroid, pose.translation), scale(rotated, -1)) };
}

export function movementPreview(capture: MovementCapture, pose: MovementPose): CoordinatePatch[] {
  const { rotation_matrix, translation } = movementRequest(capture, pose);
  return capture.originals.map(patch => ({
    ...patch, artifact_id: "preview",
    coordinates: patch.coordinates.map(point => add(rotation_matrix.map(row => dot(row, point)) as Point3D, translation)),
  }));
}

export function movementContextMatches(capture: MovementCapture, project: Project | undefined, selection: Selection): boolean {
  if (project?.id !== capture.project.id || project.revision !== capture.project.revision) return false;
  if (selection.atoms.length !== capture.selection.atoms.length) return false;
  return selection.atoms.every((atom, i) => atom.structure_id === capture.selection.atoms[i].structure_id && atom.atom_id === capture.selection.atoms[i].atom_id)
    && [...capture.artifacts].every(([id, artifact]) => {
      const entry = project.entries.find(item => item.id === id);
      return entry && !entry.locked && entry.current_artifact_id === artifact;
    });
}
