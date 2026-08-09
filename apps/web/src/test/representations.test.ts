import { describe, expect, it } from "vitest";
import type { ViewerSettings } from "../api/types";
import {
  addRepresentation,
  colorSchemes,
  removeRepresentation,
  representationStyles,
} from "../viewer/settings";

const settings: ViewerSettings = {
  representations: [
    {
      id: "primary",
      style: "cartoon",
      color_by: "element",
      custom_color: "#3b82f6",
      opacity: 1,
    },
  ],
  selection_representations: [],
  components: {
    hydrogens: true,
    solvent: true,
    ions: true,
    ligands: true,
    protein: true,
  },
  labels: { atoms: false, residues: false, chains: false, structure: false },
};

describe("representation settings", () => {
  it("exposes every required representation and color scheme", () => {
    expect(representationStyles).toEqual([
      "cartoon",
      "backbone",
      "line",
      "stick",
      "thick-stick",
      "ball-and-stick",
      "space-filling",
      "surface",
    ]);
    expect(colorSchemes).toEqual([
      "element",
      "chain",
      "residue",
      "secondary-structure",
      "structure",
      "custom",
    ]);
  });

  it("supports coexistence and preserves at least one representation", () => {
    const expanded = addRepresentation(settings, "surface", "surface");
    expect(expanded.representations.map((item) => item.style)).toEqual([
      "cartoon",
      "surface",
    ]);
    expect(removeRepresentation(expanded, "surface").representations).toHaveLength(1);
    expect(removeRepresentation(settings, "primary")).toBe(settings);
  });
});
