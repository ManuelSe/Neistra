import type {
  AtomReference,
  MeasurementKind,
  NormalizedStructure,
} from "../api/types";
import { structureInspectionIndex } from "../structures/inspectionIndex";

type Point = [number, number, number];

function subtract(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Point, b: Point): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Point, b: Point): Point {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function unit(vector: Point): Point {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length <= Number.EPSILON) throw new Error("Measurement geometry is undefined");
  return vector.map((value) => value / length) as Point;
}

export function measurePoints(kind: MeasurementKind, points: Point[]): number {
  const expected = { distance: 2, angle: 3, dihedral: 4 }[kind];
  if (points.length !== expected) throw new Error(`${kind} requires ${expected} atoms`);
  if (points.some(point => point.length !== 3 || !point.every(Number.isFinite))) {
    throw new Error("Measurement coordinates must be finite 3D points");
  }
  if (kind === "distance") {
    const value = Math.hypot(...subtract(points[1], points[0]));
    if (!Number.isFinite(value)) throw new Error("Measurement geometry is outside numerical limits");
    return value;
  }
  if (kind === "angle") {
    const a = unit(subtract(points[0], points[1]));
    const b = unit(subtract(points[2], points[1]));
    return (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI;
  }
  const bond1 = subtract(points[1], points[0]);
  const bond2 = subtract(points[2], points[1]);
  const bond3 = subtract(points[3], points[2]);
  const middle = unit(bond2);
  const normal1 = unit(cross(bond1, bond2));
  const normal2 = unit(cross(bond2, bond3));
  return (
    (Math.atan2(dot(cross(middle, normal1), normal2), dot(normal1, normal2)) *
      180) /
    Math.PI
  );
}

/** Current-source qualification shared by deliberate, quick and saved geometry. */
export function measurementCoordinates(
  references: readonly AtomReference[],
  structures: ReadonlyMap<string, NormalizedStructure>,
): { status: "ready"; points: Point[] } | { status: "unavailable"; reason: string } {
  const keys = references.map(reference => JSON.stringify([reference.structure_id, reference.atom_id]));
  if (new Set(keys).size !== references.length) return { status: "unavailable", reason: "Choose distinct atom targets." };
  const points: Point[] = [];
  for (const reference of references) {
    const structure = structures.get(reference.structure_id);
    if (!structure) return { status: "unavailable", reason: "Current atom coordinates are not loaded." };
    const index = structureInspectionIndex(structure);
    const atom = index.atoms.get(reference.atom_id);
    if (!atom) return { status: "unavailable", reason: "A selected atom is no longer available." };
    if (index.missingCoordinates) return { status: "unavailable", reason: "Source coordinates are missing." };
    if (atom.coordinates.length !== 3 || !atom.coordinates.every(Number.isFinite)) {
      return { status: "unavailable", reason: "Atom coordinates are not finite 3D points." };
    }
    points.push(atom.coordinates);
  }
  return { status: "ready", points };
}

export function measurementValue(
  kind: MeasurementKind,
  references: readonly AtomReference[],
  structures: ReadonlyMap<string, NormalizedStructure>,
): number | null {
  if (references.length !== { distance: 2, angle: 3, dihedral: 4 }[kind]) return null;
  const coordinates = measurementCoordinates(references, structures);
  if (coordinates.status !== "ready") return null;
  try {
    return measurePoints(kind, coordinates.points);
  } catch {
    return null;
  }
}

export function formatMeasurement(kind: MeasurementKind, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return kind === "distance" ? `${value.toFixed(2)} Å` : `${value.toFixed(1)}°`;
}
