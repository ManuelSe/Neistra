import { afterEach, describe, expect, it, vi } from "vitest";
import { LinesBuilder } from "molstar/lib/mol-geo/geometry/lines/lines-builder";
import { interactionLines } from "../viewer/interactionGeometry";
import type { InteractionRecord } from "../interactions/types";
import { INTERACTION_GEOMETRY_SEGMENT_LIMIT, InteractionGeometryLimitError, preflightInteractionGeometry } from "../viewer/interactionGeometryBudget";
import { INTERACTION_KINDS } from "../interactions/types";

function record(kind: InteractionRecord["kind"], distance: number): InteractionRecord {
  return { kind, scope: "inter", participants: [[{ structure_id: "a", atom_id: 1 }], [{ structure_id: "b", atom_id: 1 }]],
    endpoints: [[0, 0, 0], [distance, 0, 0]], geometry: { distance } };
}

afterEach(() => vi.restoreAllMocks());

function neighbor(value: number, increment: bigint): number {
  const floats = Float64Array.of(value), integers = new BigUint64Array(floats.buffer);
  integers[0] += increment;
  return floats[0];
}

describe("atomic interaction geometry admission", () => {
  it("rejects an extreme finite marker before entering the native builder", () => {
    const create = vi.spyOn(LinesBuilder, "create").mockImplementation(() => { throw new Error("Builder entered before preflight"); });
    expect(() => interactionLines([record("salt_bridge", 1e308)]))
      .toThrow("Interaction markers exceed the display geometry limit.");
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses before accessing retained geometry and leaves every previous native buffer unchanged", () => {
    const previous = interactionLines([record("salt_bridge", 7.1)]);
    const cells = [previous.startBuffer, previous.endBuffer, previous.groupBuffer, previous.indexBuffer];
    const bytes = cells.map(cell => new Uint8Array(cell.ref.value.buffer, cell.ref.value.byteOffset, cell.ref.value.byteLength).slice());
    let previousRead = false;
    const guarded = new Proxy(previous, { get(target, property) { previousRead = true; return Reflect.get(target, property) as unknown; } });
    const create = vi.spyOn(LinesBuilder, "create").mockImplementation(() => { throw new Error("Retained builder entered"); });
    expect(() => interactionLines([record("salt_bridge", 1e308)], guarded)).toThrow(InteractionGeometryLimitError);
    expect(previousRead).toBe(false);
    expect(create).not.toHaveBeenCalled();
    for (let i = 0; i < cells.length; i++) {
      expect(new Uint8Array(cells[i].ref.value.buffer, cells[i].ref.value.byteOffset, cells[i].ref.value.byteLength)).toEqual(bytes[i]);
    }
  });

  it("admits the exact aggregate estimate and refuses one extra estimated segment without allocating native geometry", () => {
    expect(INTERACTION_GEOMETRY_SEGMENT_LIMIT).toBe(500_000);
    const contacts = Array.from({ length: 20_000 }, () => record("hydrogen_bond", 10));
    const create = vi.spyOn(LinesBuilder, "create").mockImplementation(() => { throw new Error("Large geometry allocation forbidden in this test"); });
    expect(preflightInteractionGeometry(contacts)).toBe(500_000);
    contacts[contacts.length - 1] = record("hydrogen_bond", 10.5);
    expect(() => preflightInteractionGeometry(contacts)).toThrow(InteractionGeometryLimitError);
    expect(create).not.toHaveBeenCalled();
  });

  it("includes a complete extra cycle for repeated-addition drift at the frozen salt boundary", () => {
    const salt = record("salt_bridge", 7.1);
    expect(interactionLines([salt]).lineCount).toBe(21);
    expect(preflightInteractionGeometry([salt])).toBe(22);
    for (const kind of INTERACTION_KINDS.filter(kind => kind !== "clash")) {
      for (const distance of [neighbor(7.1, -1n), 7.1, neighbor(7.1, 1n), 0.71, neighbor(0.71, 1n), 0.43, neighbor(0.43, -1n)]) {
        const item = record(kind, distance);
        expect(preflightInteractionGeometry([item])).toBeGreaterThanOrEqual(interactionLines([item]).lineCount);
      }
    }
  });

  it("preserves all six positive tiny markers and the three-axis coincident clash", () => {
    for (const kind of INTERACTION_KINDS) {
      const tiny = record(kind, 1e-12);
      expect(interactionLines([tiny]).lineCount).toBe(1);
      expect(preflightInteractionGeometry([tiny])).toBeGreaterThanOrEqual(1);
      const zero = record(kind, 0);
      expect(preflightInteractionGeometry([zero])).toBe(kind === "clash" ? 3 : 0);
      expect(interactionLines([zero]).lineCount).toBe(kind === "clash" ? 3 : 0);
    }
  });

  it("retains drawing eligibility for missing/nonfinite endpoints without publishing nonfinite error fields", () => {
    const absent = { ...record("salt_bridge", 1), endpoints: [] };
    const nonfinite = record("salt_bridge", Number.POSITIVE_INFINITY);
    expect(preflightInteractionGeometry([absent, nonfinite])).toBe(0);
    for (const kind of INTERACTION_KINDS.filter(kind => kind !== "clash")) {
      expect(() => preflightInteractionGeometry([record(kind, 1e308)])).toThrow(InteractionGeometryLimitError);
    }
    const extreme = record("salt_bridge", 1e308), before = JSON.stringify(extreme);
    let refusal: InteractionGeometryLimitError | undefined;
    try { preflightInteractionGeometry([extreme]); }
    catch (error: unknown) { if (error instanceof InteractionGeometryLimitError) refusal = error; else throw error; }
    expect(refusal).toBeInstanceOf(InteractionGeometryLimitError);
    expect(refusal?.code).toBe("interaction_geometry_limit");
    expect(refusal?.limit).toBe(500_000);
    expect(refusal?.message).not.toMatch(/Infinity|NaN/);
    expect(refusal?.message).toContain("Detected contacts remain available in Contacts");
    expect(JSON.stringify(extreme)).toBe(before);
  });
});
