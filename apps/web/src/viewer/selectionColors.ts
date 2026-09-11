import { ElementSymbolColors, ElementSymbolColorThemeParams, elementSymbolColor } from "molstar/lib/mol-theme/color/element-symbol";
import { ElementSymbol } from "molstar/lib/mol-model/structure/model/types";
import { getAdjustedColorMap } from "molstar/lib/mol-util/color/color";
import { Color } from "molstar/lib/mol-util/color";
import type { NormalizedStructure, SelectionColor } from "../api/types";

const elementColors = getAdjustedColorMap(ElementSymbolColors,
  ElementSymbolColorThemeParams.saturation.defaultValue,
  ElementSymbolColorThemeParams.lightness.defaultValue);

/** Resolve explicit element overrides with the pinned viewer palette, not a second palette. */
export function selectionColorLayers(assignments: SelectionColor[], atoms: NormalizedStructure["atoms"]) {
  if (!assignments.length) return [];
  const elements = new Map(atoms.map((atom) => [atom.id, atom.element]));
  const layers = new Map<Color, number[]>();
  for (const assignment of assignments) {
    for (const id of assignment.atom_ids) {
      const element = elements.get(id);
      if (element === undefined) continue;
      const color = assignment.color === "element"
        ? elementSymbolColor(elementColors, ElementSymbol(element.trim().toUpperCase()))
        : Color(Number.parseInt(assignment.color.slice(1), 16));
      const ids = layers.get(color) ?? [];
      ids.push(id);
      layers.set(color, ids);
    }
  }
  return [...layers].map(([color, atomIds]) => ({ color, atomIds }));
}
