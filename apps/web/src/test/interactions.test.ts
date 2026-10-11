import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { interactionApi } from "../api/client";
import { useInteractionStore } from "../store/interactions";
import { interactionKey, useInteractions } from "../interactions/useInteractions";
import { interactionLines } from "../viewer/interactionGeometry";
import type { InteractionKind, InteractionRecord, InteractionResult } from "../interactions/types";
import { filterInteractions } from "../interactions/filter";
import { componentHierarchy, proteinStructure, viewerSettings } from "./molecular-fixtures";

const clash: InteractionRecord = { kind: "clash", scope: "inter", participants: [[{ structure_id: "a", atom_id: 1 }], [{ structure_id: "b", atom_id: 1 }]], endpoints: [[0, 0, 0], [2, 0, 0]], geometry: { distance: 2, overlap: 1.4 } };
describe("interaction session and geometry", () => {
  beforeEach(() => useInteractionStore.getState().setProject(`reset-${Math.random()}`));
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
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
    settings.selection_hidden_atoms = [];
    const ring: InteractionRecord = { ...bond, kind: "pi_pi", participants: [atoms.map(atom => ({ structure_id: "a", atom_id: atom.id }))] };
    expect(filterInteractions([ring], { ...choices, types: ["pi_pi"] }, [viewer], null)).toHaveLength(1);
    expect(filterInteractions([ring], { ...choices, types: ["pi_pi"] }, [viewer], [{ structure_id: "a", atom_id: atoms[0].id }])).toHaveLength(0);
  });
  it("debounces input changes, rejects obsolete responses, pauses and restores cached results", async () => {
    vi.useFakeTimers();
    const coverage = Object.fromEntries(["clash", "hydrogen_bond", "hydrophobic", "pi_pi", "cation_pi", "salt_bridge"].map(kind => [kind, { status: "complete", assessed_atoms: 2, skipped_atoms: 0 }])) as InteractionResult["coverage"];
    const makeResult = (artifact: string): InteractionResult => ({ profile: "interaction-v1", frame: "workspace-cartesian", inputs: [{ entry_id: "a", artifact_id: artifact }], records: [clash], coverage, warnings: [], candidate_comparisons: 1 });
    let first!: (result: InteractionResult) => void, second!: (result: InteractionResult) => void;
    const api = vi.spyOn(interactionApi, "analyze").mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
    useInteractionStore.getState().setProject("a"); useInteractionStore.getState().toggleType("clash");
    const hook = renderHook(({ artifact, paused }) => useInteractions("a", [{ entry_id: "a", artifact_id: artifact }], paused), { initialProps: { artifact: "1", paused: false } });
    await act(() => vi.advanceTimersByTimeAsync(249)); expect(api).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1)); expect(api).toHaveBeenCalledTimes(1);
    hook.rerender({ artifact: "2", paused: false });
    expect(api.mock.calls[0][2].aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => { first(makeResult("1")); await Promise.resolve(); });
    expect(hook.result.current.result).toBeNull();
    await act(async () => { second(makeResult("2")); await Promise.resolve(); });
    expect(hook.result.current.result?.inputs[0].artifact_id).toBe("2");
    hook.rerender({ artifact: "2", paused: true }); hook.rerender({ artifact: "2", paused: false });
    await act(() => vi.advanceTimersByTimeAsync(300)); expect(api).toHaveBeenCalledTimes(2);
    act(() => useInteractionStore.getState().toggleType("pi_pi" as InteractionKind));
    expect(api).toHaveBeenCalledTimes(2);
    hook.unmount();
    const remount = renderHook(() => useInteractions("a", [{ entry_id: "a", artifact_id: "2" }], false));
    expect(remount.result.current.result?.inputs[0].artifact_id).toBe("2");
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("reuses an immutable superset after hiding entries but invalidates changed artifacts", async () => {
    vi.useFakeTimers();
    const inputs = [{ entry_id: "a", artifact_id: "1" }, { entry_id: "b", artifact_id: "2" }];
    const result = { inputs, records: [clash] } as InteractionResult;
    const store = useInteractionStore.getState();
    store.setProject("p"); store.toggleType("clash"); store.publish("p", interactionKey("p", inputs), result);
    const api = vi.spyOn(interactionApi, "analyze").mockResolvedValue({ ...result, inputs: [{ entry_id: "a", artifact_id: "new" }] });
    const hook = renderHook(({ visible }) => useInteractions("p", visible, false), { initialProps: { visible: inputs } });
    hook.rerender({ visible: [inputs[0]] });
    expect(hook.result.current.result).toBe(result);
    await act(() => vi.advanceTimersByTimeAsync(300)); expect(api).not.toHaveBeenCalled();
    hook.rerender({ visible: inputs }); expect(hook.result.current.result).toBe(result);
    hook.rerender({ visible: [{ entry_id: "a", artifact_id: "new" }] });
    expect(hook.result.current.result).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(250)); expect(api).toHaveBeenCalledOnce();
  });
});
