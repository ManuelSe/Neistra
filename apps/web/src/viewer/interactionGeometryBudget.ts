import type { InteractionRecord } from "../interactions/types";
import { interactionHasDisplayGeometry, INTERACTION_PATTERNS } from "../interactions/styles";

/** Conservative line-segment admission ceiling, not a heap or latency guarantee. */
export const INTERACTION_GEOMETRY_SEGMENT_LIMIT = 500_000;

export class InteractionGeometryLimitError extends Error {
  readonly code = "interaction_geometry_limit";
  readonly limit = INTERACTION_GEOMETRY_SEGMENT_LIMIT;

  constructor() {
    super("Interaction markers exceed the display geometry limit. Detected contacts remain available in Contacts. Narrow the target or show fewer types.");
    this.name = "InteractionGeometryLimitError";
  }
}

/** Admit the entire overlay before touching native builder/retained buffers. */
export function preflightInteractionGeometry(records: readonly InteractionRecord[]): number {
  let segments = 0;
  for (const record of records) {
    if (!interactionHasDisplayGeometry(record)) continue;
    const [a, b] = record.endpoints;
    const distance = Math.hypot(...a.map((value, axis) => b[axis] - value));
    const remaining = INTERACTION_GEOMETRY_SEGMENT_LIMIT - segments;
    let estimate: number;
    if (record.kind === "clash") {
      estimate = distance > 0 ? 1 : 3;
    } else {
      const pattern = INTERACTION_PATTERNS[record.kind];
      const period = pattern.reduce((sum, length) => sum + length, 0);
      const dashes = pattern.length / 2;
      // Native repeated addition may cross a rounded period boundary. Keep one
      // extra cycle; an ideal-period ceil alone can undercount actual geometry.
      const cycles = Math.ceil(distance / period) + 1;
      if (!Number.isSafeInteger(cycles) || cycles > Math.floor(remaining / dashes)) {
        throw new InteractionGeometryLimitError();
      }
      estimate = cycles * dashes;
    }
    if (!Number.isSafeInteger(estimate) || estimate > remaining) throw new InteractionGeometryLimitError();
    segments += estimate;
  }
  return segments;
}
