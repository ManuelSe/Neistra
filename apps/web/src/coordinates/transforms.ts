import type {
  CoordinatePatch,
  CoordinateTransform,
  NormalizedStructure,
  Point3D,
  StructureProjection,
} from "../api/types";

type Matrix3 = [Point3D, Point3D, Point3D];

function multiply(left: Matrix3, right: Matrix3): Matrix3 {
  return left.map((row) =>
    right[0].map(
      (_, column) =>
        row[0] * right[0][column] +
        row[1] * right[1][column] +
        row[2] * right[2][column],
    ),
  ) as Matrix3;
}

export function eulerRotationMatrix(rotationDegrees: Point3D): Matrix3 {
  const [x, y, z] = rotationDegrees.map((value) => (value * Math.PI) / 180);
  const rx: Matrix3 = [
    [1, 0, 0],
    [0, Math.cos(x), -Math.sin(x)],
    [0, Math.sin(x), Math.cos(x)],
  ];
  const ry: Matrix3 = [
    [Math.cos(y), 0, Math.sin(y)],
    [0, 1, 0],
    [-Math.sin(y), 0, Math.cos(y)],
  ];
  const rz: Matrix3 = [
    [Math.cos(z), -Math.sin(z), 0],
    [Math.sin(z), Math.cos(z), 0],
    [0, 0, 1],
  ];
  return multiply(rz, multiply(ry, rx));
}

export function coordinateCentroid(
  structure: NormalizedStructure,
  atomIds?: Iterable<number>,
): Point3D {
  const requested = atomIds ? new Set(atomIds) : null;
  const points = structure.atoms.filter((atom) => !requested || requested.has(atom.id));
  if (points.length === 0) throw new Error("A transform pivot requires at least one atom.");
  return points
    .reduce<Point3D>(
      (sum, atom) => [
        sum[0] + atom.coordinates[0] / points.length,
        sum[1] + atom.coordinates[1] / points.length,
        sum[2] + atom.coordinates[2] / points.length,
      ],
      [0, 0, 0],
    );
}

export function previewTransform(
  structure: NormalizedStructure,
  transform: CoordinateTransform,
): CoordinatePatch {
  const selectedIds = transform.selection.atoms
    .filter((atom) => atom.structure_id === transform.entry_id)
    .map((atom) => atom.atom_id);
  const atomIds =
    transform.scope === "structure"
      ? structure.atoms.map((atom) => atom.id)
      : selectedIds;
  const pivot =
    transform.pivot_mode === "custom"
      ? transform.pivot
      : transform.pivot_mode === "selection_centroid"
        ? coordinateCentroid(structure, atomIds)
        : coordinateCentroid(structure);
  if (!pivot) throw new Error("Custom pivot is required.");
  const rotation = eulerRotationMatrix(transform.rotation_degrees);
  const requested = new Set(atomIds);
  return {
    entry_id: transform.entry_id,
    artifact_id: "preview",
    atom_ids: atomIds,
    coordinates: structure.atoms
      .filter((atom) => requested.has(atom.id))
      .map((atom) => {
        const relative: Point3D = [
          atom.coordinates[0] - pivot[0],
          atom.coordinates[1] - pivot[1],
          atom.coordinates[2] - pivot[2],
        ];
        return [
          rotation[0][0] * relative[0] +
            rotation[0][1] * relative[1] +
            rotation[0][2] * relative[2] +
            pivot[0] +
            transform.translation[0],
          rotation[1][0] * relative[0] +
            rotation[1][1] * relative[1] +
            rotation[1][2] * relative[2] +
            pivot[1] +
            transform.translation[1],
          rotation[2][0] * relative[0] +
            rotation[2][1] * relative[1] +
            rotation[2][2] * relative[2] +
            pivot[2] +
            transform.translation[2],
        ];
      }),
  };
}

export function patchStructureProjection(
  projection: StructureProjection,
  patch: CoordinatePatch,
): StructureProjection {
  if (projection.entry_id !== patch.entry_id) return projection;
  const coordinates = new Map(
    patch.atom_ids.map((atomId, index) => [atomId, patch.coordinates[index]]),
  );
  return {
    ...projection,
    structure: {
      ...projection.structure,
      atoms: projection.structure.atoms.map((atom) => {
        const point = coordinates.get(atom.id);
        return point ? { ...atom, coordinates: point } : atom;
      }),
    },
  };
}
