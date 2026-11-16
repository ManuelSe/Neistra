import { describe, expect, it } from "vitest";
import { formatMeasurement, measurePoints, measurementValue } from "../measurements/geometry";
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
});
