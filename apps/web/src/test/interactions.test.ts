import { beforeEach, describe, expect, it } from "vitest";
import { useInteractionStore } from "../store/interactions";
import { interactionKey } from "../interactions/useInteractions";
import { interactionLines } from "../viewer/interactionGeometry";
import type { InteractionRecord } from "../interactions/types";

const clash: InteractionRecord = { kind: "clash", scope: "inter", participants: [[{ structure_id: "a", atom_id: 1 }], [{ structure_id: "b", atom_id: 1 }]], endpoints: [[0, 0, 0], [2, 0, 0]], geometry: { distance: 2, overlap: 1.4 } };
describe("interaction session and geometry", () => {
  beforeEach(() => useInteractionStore.getState().setProject(`reset-${Math.random()}`));
  it("retains choices on renderer remount, resets on project change and has independent scopes", () => {
    const store = useInteractionStore.getState();
    store.setProject("a"); store.toggleType("clash"); store.toggleScope("intra");
    store.setProject("a");
    expect(useInteractionStore.getState().choices).toEqual({ types: ["clash"], intra: true, inter: true });
    store.toggleScope("inter");
    expect(useInteractionStore.getState().choices.inter).toBe(false);
    store.setProject("b");
    expect(useInteractionStore.getState().choices).toEqual({ types: [], intra: false, inter: true });
  });
  it("keys only immutable inputs and profile, irrespective of entry order", () => {
    const a = { entry_id: "a", artifact_id: "1" }, b = { entry_id: "b", artifact_id: "2" };
    expect(interactionKey("project", [a, b])).toBe(interactionKey("project", [b, a]));
    expect(interactionKey("other", [a])).not.toBe(interactionKey("project", [a]));
  });
  it("builds batched line geometry with distinct patterns", () => {
    expect(interactionLines([clash]).lineCount).toBeGreaterThan(0);
    expect(interactionLines([{ ...clash, kind: "hydrogen_bond" }]).lineCount).toBeGreaterThan(interactionLines([clash]).lineCount);
    expect(interactionLines([]).lineCount).toBe(0);
  });
});
