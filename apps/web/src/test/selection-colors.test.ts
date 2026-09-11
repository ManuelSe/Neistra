import { Color } from "molstar/lib/mol-util/color";
import { describe, expect, it } from "vitest";
import { selectionColorLayers } from "../viewer/selectionColors";
import { proteinProjection } from "./molecular-fixtures";

describe("selection color projection", () => {
  it("uses native element colors independently of entry themes and preserves exact memberships", () => {
    const template = proteinProjection().structure.atoms[0];
    const atoms = ["C", "O", "N", "H", "S", "Cl", "Xx"].map((element, index) =>
      ({ ...template, id: index + 1, element }));
    const layers = selectionColorLayers([
      { color: "#ff00ff", atom_ids: [1] },
      { color: "element", atom_ids: [2, 3, 4, 5, 6, 7, 999] },
    ], atoms);
    const byAtom = new Map(layers.flatMap((layer) => layer.atomIds.map((id) => [id, layer.color])));
    expect(byAtom.get(1)).toBe(0xff00ff);
    expect(byAtom.get(2)).toBe(Color.lighten(Color(0xff0d0d), 0.2));
    expect(byAtom.get(3)).toBe(Color.lighten(Color(0x3050f8), 0.2));
    expect(byAtom.get(4)).toBe(0xffffff);
    expect(byAtom.get(5)).toBe(Color.lighten(Color(0xffff30), 0.2));
    expect(byAtom.get(6)).toBe(Color.lighten(Color(0x1ff01f), 0.2));
    expect(byAtom.get(7)).toBeDefined();
    expect(byAtom.has(999)).toBe(false);
    expect(layers.flatMap((layer) => layer.atomIds)).toHaveLength(7);
  });
});
