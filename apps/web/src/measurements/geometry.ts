import type {
  AtomReference,
  MeasurementKind,
  NormalizedStructure,
} from "../api/types";

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
  if (length <= Number.EPSILON) throw new Error("Measurement geometry is undefined");
  return vector.map((value) => value / length) as Point;
}

export function measurePoints(kind: MeasurementKind, points: Point[]): number {
  const expected = { distance: 2, angle: 3, dihedral: 4 }[kind];
  if (points.length !== expected) throw new Error(`${kind} requires ${expected} atoms`);
  if (kind === "distance") return Math.hypot(...subtract(points[1], points[0]));
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

export function measurementValue(
  kind: MeasurementKind,
  references: AtomReference[],
  structures: Map<string, NormalizedStructure>,
): number | null {
  const points = references.map((reference) => {
    const atom = structures
      .get(reference.structure_id)
      ?.atoms.find((candidate) => candidate.id === reference.atom_id);
    return atom?.coordinates;
  });
  if (points.some((point) => point === undefined)) return null;
  try {
    return measurePoints(kind, points as Point[]);
  } catch {
    return null;
  }
}

export function formatMeasurement(kind: MeasurementKind, value: number | null): string {
  if (value === null) return "Unavailable";
  return kind === "distance" ? `${value.toFixed(2)} Å` : `${value.toFixed(1)}°`;
}
