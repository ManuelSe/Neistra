import { describe, expect, it } from "vitest";
import type { LinesValues } from "molstar/lib/mol-gl/renderable/lines";
import { defaultInteractionAppearance, INTERACTION_COLORS, INTERACTION_PATTERNS, normalizeInteractionAppearance } from "../interactions/styles";
import { createInteractionRepresentation } from "../viewer/interactionGeometry";
import type { InteractionRecord } from "../interactions/types";

describe("shared interaction appearance", () => {
  it("preserves established colors, native pattern grammar and independent reset defaults", () => {
    const first = defaultInteractionAppearance(), second = defaultInteractionAppearance();
    expect(first.hydrogen_bond).toEqual({ color: "#1597b0", width: 2.5 });
    expect(first.clash.color).toBe(`#${INTERACTION_COLORS.clash.toString(16)}`);
    expect(INTERACTION_PATTERNS.cation_pi).toEqual([0.45, 0.15, 0.08, 0.15]);
    expect(INTERACTION_PATTERNS.salt_bridge).toEqual([0.18, 0.1, 0.18, 0.25]);
    first.clash.color = "#000000";
    expect(second.clash.color).toBe("#db3850");
  });

  it("refuses invalid colors and nonfinite widths and bounds supported widths", () => {
    const value = defaultInteractionAppearance();
    value.clash = { color: "red", width: NaN };
    value.cation_pi.width = Infinity;
    value.hydrophobic.width = 0;
    value.pi_pi.width = 99;
    expect(normalizeInteractionAppearance(value)).toMatchObject({
      clash: { color: "#db3850", width: 2.5 }, cation_pi: { width: 2.5 }, hydrophobic: { width: 1 }, pi_pi: { width: 6 },
    });
  });

  it("updates per-category color and width without changing canonical geometry or attached buffers", async () => {
    let appearance = defaultInteractionAppearance();
    const representation = createInteractionRepresentation(() => appearance);
    const records: InteractionRecord[] = ["hydrogen_bond", "clash"].map((kind, index) => ({
      kind: kind as InteractionRecord["kind"], scope: "inter", participants: [[{ structure_id: "a", atom_id: index + 1 }], [{ structure_id: "b", atom_id: index + 1 }]],
      endpoints: [[index, 0, 0], [index, 0, 3.5]], geometry: { distance: 3.5 },
    }));
    const canonical = JSON.stringify(records);
    try {
      await representation.createOrUpdate({ sizeFactor: 2.5 }, records).run();
      const before = representation.renderObjects[0].values as LinesValues;
      const cell = before.aStart, endpoints = Array.from(before.aStart.ref.value), draws = before.drawCount.ref.value;
      appearance = { ...appearance, clash: { color: "#123456", width: 5 } };
      await representation.createOrUpdate({ sizeFactor: 2.5 }, records).run();
      const after = representation.renderObjects[0].values as LinesValues;
      expect(after.aStart).toBe(cell);
      expect(Array.from(after.aStart.ref.value)).toEqual(endpoints);
      expect(after.drawCount.ref.value).toBe(draws);
      expect(Array.from(after.tColor.ref.value.array.slice(3, 6))).toEqual([0x12, 0x34, 0x56]);
      expect(after.uSizeFactor.ref.value).toBe(2.5);
      expect(Array.from(after.tSize.ref.value.array.slice(0, 3))).not.toEqual(Array.from(after.tSize.ref.value.array.slice(3, 6)));
      expect(JSON.stringify(records)).toBe(canonical);
    } finally { representation.destroy(); }
  });
});
