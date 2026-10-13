import { describe, expect, it } from "vitest";
import type { LinesValues } from "molstar/lib/mol-gl/renderable/lines";
import { createInteractionRepresentation, INTERACTION_COLORS } from "../viewer/interactionGeometry";
import type { InteractionRecord } from "../interactions/types";

const record = (kind: InteractionRecord["kind"], x: number): InteractionRecord => ({
  kind, scope: "inter", participants: [[{ structure_id: "a", atom_id: 1 }], [{ structure_id: "b", atom_id: 1 }]],
  endpoints: [[x, 0, 0], [x, 0, 3.5]], geometry: { distance: 3.5 },
});

describe("attached native interaction buffers", () => {
  it("updates endpoints, capacity, groups and colors through growth, reorder, shrink and empty restoration", async () => {
    const representation = createInteractionRepresentation();
    try {
      let cells: Pick<LinesValues, "aStart" | "aEnd" | "aGroup" | "elements"> | undefined;
      for (const records of [
        [record("clash", 0)],
        [record("clash", 10), record("pi_pi", 20), record("cation_pi", 30)],
        [record("salt_bridge", 30), record("hydrogen_bond", 10), record("hydrophobic", 20)],
        [record("pi_pi", 40)], [], [record("clash", 50)],
      ]) {
        await representation.createOrUpdate({ sizeFactor: 2.5 }, records).run();
        const values = representation.renderObjects[0].values as LinesValues;
        if (cells) for (const key of ["aStart", "aEnd", "aGroup", "elements"] as const) expect(values[key]).toBe(cells[key]);
        cells = values;
        const draw = values.drawCount.ref.value;
        expect(draw).toBeLessThanOrEqual(values.elements.ref.value.length);
        const groups = Array.from(values.aGroup.ref.value.slice(0, draw / 6 * 4));
        expect([...new Set(groups)]).toEqual(records.map((_, i) => i));
        for (let vertex = 0; vertex < groups.length; vertex++) {
          const item = records[groups[vertex]];
          const start = Array.from(values.aStart.ref.value.slice(vertex * 3, vertex * 3 + 3));
          const end = Array.from(values.aEnd.ref.value.slice(vertex * 3, vertex * 3 + 3));
          expect(start[0]).toBe(item.endpoints[0][0]); expect(end[0]).toBe(item.endpoints[1][0]);
          expect(start[2]).toBeGreaterThanOrEqual(0); expect(end[2]).toBeLessThanOrEqual(3.5);
        }
        for (let i = 0; i < records.length; i++) {
          const hex = INTERACTION_COLORS[records[i].kind];
          expect(Array.from(values.tColor.ref.value.array.slice(i * 3, i * 3 + 3))).toEqual([hex >> 16, hex >> 8 & 255, hex & 255]);
        }
      }
    } finally { representation.destroy(); }
  });

  it("renders coincident clashes at their exact shared coordinate without inventing endpoints", async () => {
    const representation = createInteractionRepresentation();
    const clash = { ...record("clash", 4), endpoints: [[4, 2, 1], [4, 2, 1]] } as InteractionRecord;
    const before = JSON.stringify(clash);
    try {
      await representation.createOrUpdate({}, [clash]).run();
      const values = representation.renderObjects[0].values as LinesValues;
      expect(values.drawCount.ref.value).toBe(18);
      for (let axis = 0; axis < 3; axis++) {
        const start = values.aStart.ref.value.slice(axis * 12, axis * 12 + 3);
        const end = values.aEnd.ref.value.slice(axis * 12, axis * 12 + 3);
        for (let k = 0; k < 3; k++) {
          expect((start[k] + end[k]) / 2).toBeCloseTo(clash.endpoints[0][k]);
          expect(end[k] - start[k]).toBeCloseTo(k === axis ? 0.3 : 0);
        }
      }
      expect(JSON.stringify(clash)).toBe(before);
    } finally { representation.destroy(); }
  });
});
