import { describe, expect, it } from "vitest";
import type {
  CoordinateTransform,
  NormalizedStructure,
  StructureProjection,
} from "../api/types";
import {
  eulerRotationMatrix,
  patchStructureProjection,
  previewTransform,
} from "../coordinates/transforms";

const structure: NormalizedStructure = {
  schema_version: 1,
  title: "Coordinate fixture",
  structure_type: "ligand",
  chains: [],
  residues: [],
  atoms: [
    {
      id: 1,
      name: "C1",
      element: "C",
      coordinates: [1, 0, 0],
      residue_id: null,
      formal_charge: null,
      source_index: 0,
      alternate_location: null,
      occupancy: null,
      b_factor: null,
      inferred_fields: [],
    },
    {
      id: 2,
      name: "O1",
      element: "O",
      coordinates: [0, 2, 0],
      residue_id: null,
      formal_charge: null,
      source_index: 1,
      alternate_location: null,
      occupancy: null,
      b_factor: null,
      inferred_fields: [],
    },
  ],
  bonds: [],
  conformers: [],
  warnings: [],
};

const selectedTransform: CoordinateTransform = {
  entry_id: "ligand",
  scope: "selection",
  selection: {
    schema_version: 1,
    atoms: [{ structure_id: "ligand", atom_id: 1 }],
    granularity: "atom",
    source: "inspector",
  },
  translation: [1, -2, 0.5],
  rotation_degrees: [0, 0, 90],
  pivot_mode: "custom",
  pivot: [0, 0, 0],
};

describe("coordinate transforms", () => {
  it("matches the backend X-then-Y-then-Z Euler convention", () => {
    const matrix = eulerRotationMatrix([90, 90, 0]);
    const transformed = [
      matrix[0][0],
      matrix[1][0],
      matrix[2][0],
    ];
    expect(transformed).toEqual([expect.closeTo(0, 12), 0, -1]);
  });

  it("previews only requested stable atom IDs with numeric command semantics", () => {
    const patch = previewTransform(structure, selectedTransform);
    expect(patch.atom_ids).toEqual([1]);
    expect(patch.coordinates[0]).toEqual([
      expect.closeTo(1, 12),
      expect.closeTo(-1, 12),
      0.5,
    ]);
  });

  it("patches a structure projection immutably", () => {
    const projection: StructureProjection = {
      entry_id: "ligand",
      structure,
      viewer: { format: "mol", data: "topology stays unchanged" },
    };
    const patched = patchStructureProjection(projection, {
      entry_id: "ligand",
      artifact_id: "artifact-2",
      atom_ids: [2],
      coordinates: [[7, 8, 9]],
    });

    expect(patched).not.toBe(projection);
    expect(patched.structure.atoms[0]).toBe(projection.structure.atoms[0]);
    expect(patched.structure.atoms[1].coordinates).toEqual([7, 8, 9]);
    expect(projection.structure.atoms[1].coordinates).toEqual([0, 2, 0]);
    expect(patched.viewer).toBe(projection.viewer);
  });
});
