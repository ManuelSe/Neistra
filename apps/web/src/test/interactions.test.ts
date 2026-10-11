import { beforeEach, describe, expect, it } from "vitest";
import { useInteractionStore } from "../store/interactions";
import { interactionKey } from "../interactions/useInteractions";
import { interactionLines } from "../viewer/interactionGeometry";
import type { InteractionRecord } from "../interactions/types";
import { filterInteractions } from "../interactions/filter";
import { componentHierarchy, proteinStructure, viewerSettings } from "./molecular-fixtures";

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
  it("suppresses a hydrogen bond when its explicit polar H or acceptor is hidden", () => {
    const base = proteinStructure();
    const atoms = base.atoms.slice(0, 3).map((atom, index) => ({ ...atom, element: index === 0 ? "H" : index === 1 ? "N" : "O" }));
    const structure = { ...base, atoms, bonds: [{ id: 1, atom_1_id: atoms[0].id, atom_2_id: atoms[1].id, order: 1, aromatic: false, stereo: null, inferred: false }] };
    const settings = viewerSettings();
    const viewer = { entryId: "a", label: "A", normalized: structure, atomIds: atoms.map(atom => atom.id), hierarchy: componentHierarchy(structure), settings, projection: { format: "mmcif" as const, data: "", warnings: [] } };
    const bond: InteractionRecord = { ...clash, kind: "hydrogen_bond", participants: [[{ structure_id: "a", atom_id: atoms[0].id }, { structure_id: "a", atom_id: atoms[1].id }], [{ structure_id: "a", atom_id: atoms[2].id }]] };
    const choices = { types: ["hydrogen_bond" as const], intra: true, inter: true };
    expect(filterInteractions([bond], choices, [viewer], null)).toHaveLength(1);
    settings.components.hydrogens = false;
    expect(filterInteractions([bond], choices, [viewer], null)).toHaveLength(0);
    settings.components.hydrogens = true;
    settings.selection_hidden_atoms = [atoms[2].id];
    expect(filterInteractions([bond], choices, [viewer], null)).toHaveLength(0);
  });
});
