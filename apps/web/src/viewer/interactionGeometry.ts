import { Lines } from "molstar/lib/mol-geo/geometry/lines/lines";
import { LinesBuilder } from "molstar/lib/mol-geo/geometry/lines/lines-builder";
import { Shape } from "molstar/lib/mol-model/shape";
import { ShapeRepresentation } from "molstar/lib/mol-repr/shape/representation";
import { Color } from "molstar/lib/mol-util/color";
import type { InteractionKind, InteractionRecord } from "../interactions/types";

export const INTERACTION_COLORS: Record<InteractionKind, number> = {
  clash: 0xdb3850, hydrogen_bond: 0x1597b0, hydrophobic: 0xa88836,
  pi_pi: 0x9567c4, cation_pi: 0x5079d3, salt_bridge: 0xd56b30,
};
const patterns: Record<InteractionKind, number[]> = {
  clash: [1], hydrogen_bond: [0.25, 0.18], hydrophobic: [0.08, 0.18],
  pi_pi: [0.45, 0.2], cation_pi: [0.45, 0.15, 0.08, 0.15], salt_bridge: [0.18, 0.1, 0.18, 0.25],
};

export function interactionLines(records: InteractionRecord[]) {
  const builder = LinesBuilder.create();
  records.forEach((record, group) => {
    const [a, b] = record.endpoints;
    if (!a || !b) return;
    const distance = Math.hypot(...a.map((value, index) => b[index] - value));
    const pattern = record.kind === "clash" ? [distance] : patterns[record.kind];
    if (!distance) return;
    let offset = 0, index = 0;
    while (offset < distance) {
      const end = Math.min(distance, offset + pattern[index % pattern.length]);
      if (index % 2 === 0) {
        const start = a.map((value, axis) => value + (b[axis] - value) * offset / distance);
        const stop = a.map((value, axis) => value + (b[axis] - value) * end / distance);
        builder.add(start[0], start[1], start[2], stop[0], stop[1], stop[2], group);
      }
      offset = end; index++;
    }
  });
  return builder.getLines();
}

export function createInteractionRepresentation() {
  return ShapeRepresentation<InteractionRecord[], Lines, typeof Lines.Params>(
    (_ctx, records) => Shape.create("Molecular interactions", records, interactionLines(records), group => Color(INTERACTION_COLORS[records[group].kind]), () => 1, () => ""),
    Lines.Utils,
  );
}
