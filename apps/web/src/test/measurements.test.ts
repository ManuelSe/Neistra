import { describe, expect, it } from "vitest";
import { measurePoints } from "../measurements/geometry";

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
});
