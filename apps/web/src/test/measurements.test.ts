import { describe, expect, it, vi } from "vitest";
import { formatMeasurement, measurePoints, measurementValue } from "../measurements/geometry";
import type { AtomReference, NormalizedStructure } from "../api/types";
import { atomInspection, inspectSelectionGeometry } from "../selection/inspection";
import { structureInspectionIndex } from "../structures/inspectionIndex";
import { proteinStructure } from "./molecular-fixtures";

describe("measurement reference geometry", () => {
  it("matches backend distance, angle, and signed dihedral references", () => {
    expect(measurePoints("distance", [[0, 0, 0], [1, 2, 2]])).toBeCloseTo(3);
    expect(
      measurePoints("angle", [[1, 0, 0], [0, 0, 0], [0, 1, 0]]),
    ).toBeCloseTo(90);
    expect(
      measurePoints("dihedral", [
        [1, 0, 0],
        [0, 0, 0],
        [0, 1, 0],
        [0, 1, 1],
      ]),
    ).toBeCloseTo(-90);
  });

  it("rejects degenerate geometry", () => {
    expect(() =>
      measurePoints("angle", [[0, 0, 0], [0, 0, 0], [1, 0, 0]]),
    ).toThrow(/undefined/);
  });

  it("refuses nonfinite coordinates and overflowing derived distance", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => measurePoints("distance", [[0, 0, 0], [value, 0, 0]])).toThrow(/finite/);
      expect(formatMeasurement("distance", value)).toBe("Unavailable");
    }
    expect(() => measurePoints("distance", [[1e308, 0, 0], [-1e308, 0, 0]])).toThrow(/numerical/);
    expect(() => measurePoints("angle", [[1e308, 0, 0], [-1e308, 0, 0], [0, 1, 0]])).toThrow(/undefined/);
  });

  it("does not display missing source coordinate placeholders as a valid zero", () => {
    const structure = proteinStructure();
    structure.warnings.push({ code: "missing_coordinates", message: "Missing", operation: "import", severity: "warning", field: "coordinates", blocking: false });
    expect(measurementValue("distance", [1, 2].map(atom_id => ({ structure_id: "entry", atom_id })), new Map([["entry", structure]]))).toBeNull();
  });

  it("qualifies saved and quick geometry against the same missing-coordinate source facts", () => {
    const source = proteinStructure();
    source.atoms[0] = { ...source.atoms[0], coordinates: [0, 0, 0] };
    source.atoms[1] = { ...source.atoms[1], coordinates: [0, 0, 3] };
    const targets = [1, 2].map(atom_id => ({ structure_id: "entry", atom_id }));
    const missing = { ...source, source: { facts: { missing_coordinates: true } } } as NormalizedStructure;
    const structures = new Map([["entry", missing]]);
    expect(measurementValue("distance", targets, structures)).toBeNull();
    expect(inspectSelectionGeometry(targets, null, structures).status).toBe("unavailable");
    // A new immutable current artifact recovers without deleting the durable refs.
    structures.set("entry", source);
    expect(measurementValue("distance", targets, structures)).toBe(3);
    expect(inspectSelectionGeometry(targets, null, structures).status).toBe("ready");
  });

  it("requires the chosen kind's exact cardinality and distinct stable entry/atom pairs", () => {
    const source = proteinStructure();
    const refs: AtomReference[] = [1, 2].map(atom_id => ({ structure_id: "entry", atom_id }));
    const structures = new Map([["entry", source]]);
    expect(measurementValue("angle", refs, structures)).toBeNull();
    expect(measurementValue("dihedral", [...refs, refs[0]], structures)).toBeNull();
    expect(measurementValue("distance", [refs[0], refs[0]], structures)).toBeNull();
    const other = { ...source, atoms: [{ ...source.atoms[0], coordinates: [3, 0, 0] as [number, number, number] }] };
    structures.set("other", other);
    expect(measurementValue("distance", [refs[0], { structure_id: "other", atom_id: 1 }], structures)).toBe(3);
    structures.delete("other");
    expect(measurementValue("distance", [refs[0], { structure_id: "other", atom_id: 1 }], structures)).toBeNull();
  });

  it("shares one cold source index and only looks up the requested endpoints on warm saved reads", () => {
    const source = proteinStructure();
    const template = source.atoms[0];
    const atoms = Array.from({ length: 100000 }, (_, i) => ({ ...template, id: i + 1, source_index: i,
      coordinates: [i, 0, 0] as [number, number, number] }));
    let sourceReads = 0;
    Object.defineProperty(source, "atoms", { get: () => { sourceReads++; return atoms; } });
    const structures = new Map([["entry", source]]);
    const targets = [99999, 100000].map(atom_id => ({ structure_id: "entry", atom_id }));
    atomInspection(targets[0], structures, new Map());
    const index = structureInspectionIndex(source);
    const get = vi.spyOn(index.atoms, "get");
    for (let i = 0; i < 20; i++) expect(measurementValue("distance", targets, structures)).toBe(1);
    expect(get).toHaveBeenCalledTimes(40);
    expect(sourceReads).toBe(1);
    get.mockRestore();
  });
});
