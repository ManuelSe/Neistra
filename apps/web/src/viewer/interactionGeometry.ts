import { Lines } from "molstar/lib/mol-geo/geometry/lines/lines";
import { LinesBuilder } from "molstar/lib/mol-geo/geometry/lines/lines-builder";
import { Shape } from "molstar/lib/mol-model/shape";
import { ShapeRepresentation } from "molstar/lib/mol-repr/shape/representation";
import { Color } from "molstar/lib/mol-util/color";
import type { InteractionAppearance, InteractionRecord } from "../interactions/types";
import { defaultInteractionAppearance, interactionHasDisplayGeometry, INTERACTION_PATTERNS, normalizeInteractionAppearance } from "../interactions/styles";
import { preflightInteractionGeometry } from "./interactionGeometryBudget";
export { INTERACTION_COLORS } from "../interactions/styles";

export function interactionLines(records: InteractionRecord[], previous?: Lines) {
  preflightInteractionGeometry(records);
  // ShapeRepresentation retains these ValueCells on its existing render object.
  // Reusing geometry updates attached buffers, not only draw counts and colors.
  const builder = LinesBuilder.create(2048, 1024, previous);
  records.forEach((record, group) => {
    if (!interactionHasDisplayGeometry(record)) return;
    const [a, b] = record.endpoints;
    if (!a || !b) return;
    const distance = Math.hypot(...a.map((value, index) => b[index] - value));
    const pattern = record.kind === "clash" ? [distance] : INTERACTION_PATTERNS[record.kind];
    if (!distance) {
      if (record.kind === "clash") {
        for (let axis = 0; axis < 3; axis++) {
          const start = [...a], stop = [...a];
          start[axis] -= 0.15; stop[axis] += 0.15;
          builder.add(start[0], start[1], start[2], stop[0], stop[1], stop[2], group);
        }
      }
      return;
    }
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

export function createInteractionRepresentation(appearance: () => InteractionAppearance = defaultInteractionAppearance) {
  return ShapeRepresentation<InteractionRecord[], Lines, typeof Lines.Params>(
    (_ctx, records, _props, previous) => {
      const styles = normalizeInteractionAppearance(appearance());
      return Shape.create("Molecular interactions", records, interactionLines(records, previous?.geometry),
        group => Color.fromHexStyle(styles[records[group].kind].color),
        group => styles[records[group].kind].width / 2.5,
        () => "", undefined, records.length);
    },
    Lines.Utils,
  );
}
