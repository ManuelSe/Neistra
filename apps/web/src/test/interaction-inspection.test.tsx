import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AtomReference, StructureProjection } from "../api/types";
import { interactionApi } from "../api/client";
import { canonicalSelection } from "../selection/selection";
import { useInteractionStore } from "../store/interactions";
import { interactionParticipants, interactionRecordKey } from "../interactions/presentation";
import { captureSelectionTarget, captureLigandTarget, resolveInteractionLigands } from "../interactions/target";
import { INTERACTION_KINDS, type InteractionDisplayState, type InteractionRecord, type InteractionResult } from "../interactions/types";
import { useInteractionInspection, type InteractionNativeState } from "../interactions/useInteractionInspection";
import { interactionKey } from "../interactions/useInteractions";
import * as visibilityFilter from "../interactions/filter";
import type { MolecularViewer, ViewerStructure } from "../viewer/MolecularViewer";
import { componentHierarchy, molecularEntry, molecularProject, proteinStructure, viewerSettings } from "./molecular-fixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const ref = (structure_id: string, atom_id: number): AtomReference => ({ structure_id, atom_id });
function fixture() {
  const entries = ["a", "b"].map(id => molecularEntry(id, `Entry ${id}`, "protein"));
  const project = molecularProject(entries);
  const projections = new Map(entries.map(entry => {
    const normalized = proteinStructure();
    normalized.residues = normalized.residues.map(residue => ({ ...residue, component_type: "ligand" }));
    return [entry.id, { entry_id: entry.id, artifact_id: entry.current_artifact_id!, structure: normalized,
      hierarchy: componentHierarchy(normalized), viewer: { format: "mmcif", data: "projection" } } satisfies StructureProjection] as const;
  }));
  const structures: ViewerStructure[] = entries.map(entry => ({ entryId: entry.id, label: entry.name,
    normalized: projections.get(entry.id)!.structure, hierarchy: projections.get(entry.id)!.hierarchy,
    projection: projections.get(entry.id)!.viewer, atomIds: entry.atom_ids, settings: viewerSettings() }));
  const records: InteractionRecord[] = [
    { kind: "hydrogen_bond", scope: "inter", participants: [[ref("a", 1), ref("a", 2)], [ref("b", 1)]], endpoints: [[0, 0, 0], [2, 0, 0]], geometry: { distance: 2, donor_acceptor_distance: 3, donor_angle: 180 } },
    { kind: "salt_bridge", scope: "inter", participants: [[ref("a", 3)], [ref("b", 2)]], endpoints: [[0, 0, 0], [4, 0, 0]], geometry: { distance: 3.5, charge_1: 1, charge_2: -1 } },
    { kind: "clash", scope: "intra", participants: [[ref("a", 1)], [ref("a", 3)]], endpoints: [[0, 0, 0], [1, 0, 0]], geometry: { distance: 1, overlap: 1.4 } },
  ];
  const inputs = entries.map(entry => ({ entry_id: entry.id, artifact_id: entry.current_artifact_id! }));
  const result: InteractionResult = { profile: "interaction-v1", frame: "workspace-cartesian", inputs, records,
    coverage: Object.fromEntries(INTERACTION_KINDS.map(kind => [kind, { status: "complete", assessed_atoms: 6, skipped_atoms: 0 }])) as InteractionResult["coverage"],
    warnings: [{ entry_id: "a", code: "explicit_hydrogens_required", message: "Prepare supplied H at the known donor.", atom_ids: [2] }], candidate_comparisons: 2 };
  const store = useInteractionStore.getState();
  store.setProject("reset"); store.setProject(project.id);
  store.toggleType("hydrogen_bond"); store.toggleType("salt_bridge"); store.publish(project.id, interactionKey(project.id, inputs), result);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["project", project.id], project);
  const onSelect = vi.fn<(atoms: AtomReference[]) => void>();
  const focusAtoms = vi.fn<(atoms: AtomReference[]) => void>();
  const viewer = { current: { focusAtoms } as unknown as MolecularViewer };
  const props = { project, selection: canonicalSelection([]), projections, structures, isolation: null,
    paused: false, busy: false, viewerReady: true, viewReady: true, viewer,
    native: null as InteractionNativeState | null, renderFailure: null, onSelect };
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const hook = renderHook(next => useInteractionInspection(next), { initialProps: props, wrapper });
  function acknowledge(shown = records.slice(0, 2), extra: Partial<InteractionDisplayState> = {}) {
    const state: InteractionDisplayState = { displayKey: hook.result.current.displayKey, sceneGeneration: 1, status: "ready",
      installedRecordKeys: shown.map(interactionRecordKey), countsByKind: Object.fromEntries(INTERACTION_KINDS.map(kind => [kind, shown.filter(record => record.kind === kind).length])) as InteractionDisplayState["countsByKind"], ...extra };
    props.native = { viewer: viewer.current, state }; hook.rerender({ ...props });
  }
  return { ...hook, props, records, analysisResult: result, store, queryClient, onSelect, focusAtoms, acknowledge };
}

it("reports shown records only from the matching final native receipt", () => {
  const h = fixture();
  expect(h.result.current.panel.status.phase).toBe("rendering");
  expect(h.result.current.panel.categories.salt_bridge).toMatchObject({ detected: 1, shown: null });
  h.acknowledge([h.records[0]]);
  expect(h.result.current.panel.status.message).toContain("1 shown · 2 detected");
  expect(h.result.current.panel.categories.salt_bridge.shown).toBe(0);
  expect(h.result.current.panel.categories.hydrogen_bond.shown).toBe(1);
  h.acknowledge([h.records[0]], { displayKey: "retired-key" });
  expect(h.result.current.panel.status.phase).toBe("rendering");
  h.props.native = { viewer: {} as MolecularViewer, state: { ...h.props.native!.state, displayKey: h.result.current.displayKey } };
  h.rerender({ ...h.props });
  expect(h.result.current.panel.categories.hydrogen_bond.shown).toBeNull();
});

it("reuses display work across native receipts and changing irrelevant renderer wrappers", () => {
  const filtering = vi.spyOn(visibilityFilter, "filterInteractions");
  const h = fixture(), records = h.result.current.displayRecords, key = h.result.current.displayKey;
  filtering.mockClear();
  h.props.structures = h.props.structures.map(source => ({ ...source, atomIds: [...source.atomIds],
    projection: { ...source.projection }, pockets: {} }));
  h.rerender({ ...h.props });
  h.acknowledge(); h.rerender({ ...h.props });
  expect(filtering).not.toHaveBeenCalled();
  expect(h.result.current.displayRecords).toBe(records);
  expect(h.result.current.displayKey).toBe(key);
  act(() => { h.result.current.panel.onAppearanceChange("hydrogen_bond", { width: 4 }); });
  expect(filtering).not.toHaveBeenCalled();
  expect(h.result.current.displayRecords).toBe(records);
  expect(h.result.current.displayKey).not.toBe(key);
  h.props.structures = h.props.structures.map((source, index) => index ? source : { ...source,
    settings: { ...source.settings, components: { ...source.settings.components, ligands: false } } });
  h.rerender({ ...h.props });
  expect(filtering).toHaveBeenCalledOnce();
  expect(h.result.current.displayRecords).toHaveLength(0);
  expect(Object.keys(filtering.mock.calls[0][2][0]).sort()).toEqual(["entryId", "hierarchy", "normalized", "settings"]);
});

it.each(["entryId", "normalized", "hierarchy", "settings"] as const)("invalidates the display when the consumed %s source changes", field => {
  const filtering = vi.spyOn(visibilityFilter, "filterInteractions");
  const h = fixture(), before = h.result.current.displayRecords;
  filtering.mockClear();
  h.props.structures = h.props.structures.map((source, index) => index ? source : {
    ...source, [field]: field === "entryId" ? "replacement-entry" : { ...source[field] },
  });
  h.rerender({ ...h.props });
  expect(filtering).toHaveBeenCalledOnce();
  expect(h.result.current.displayRecords).not.toBe(before);
});

it("retires shown counts and Focus during a native source failure without repeating chemistry", () => {
  const analyze = vi.spyOn(interactionApi, "analyze");
  const h = fixture(), key = interactionRecordKey(h.records[0]);
  h.acknowledge([h.records[0]]);
  act(() => { h.result.current.panel.onInspectContact(key); });
  expect(h.result.current.panel.inspected?.focusUnavailable).toBeNull();
  h.acknowledge([], { status: "error", error: "The molecular scene is unavailable. Reload the structures before displaying interactions." });
  expect(h.result.current.panel.status.phase).toBe("error");
  expect(h.result.current.panel.status.message).toContain("molecular scene is unavailable");
  expect(h.result.current.panel.categories.hydrogen_bond.shown).toBeNull();
  expect(h.result.current.panel.inspected?.focusUnavailable).toContain("display is unavailable");
  act(() => { h.result.current.panel.onFocusContact(key); });
  expect(h.focusAtoms).not.toHaveBeenCalled();
  const failedKey = h.result.current.displayKey;
  expect(h.result.current.panel.retryLabel).toBe("Retry interaction display");
  act(() => { h.result.current.panel.onRetry?.(); });
  expect(h.result.current.displayKey).not.toBe(failedKey);
  expect(h.result.current.panel.categories.hydrogen_bond.shown).toBeNull();
  expect(analyze).not.toHaveBeenCalled();
  expect(h.onSelect).not.toHaveBeenCalled();
  h.acknowledge([h.records[0]]);
  expect(h.result.current.panel.status.phase).toBe("ready");
  expect(h.result.current.panel.inspected?.focusUnavailable).toBeNull();
});

it("explains coincident marker endpoints while keeping detected participants selectable", () => {
  const h = fixture();
  const coincident: InteractionRecord = { ...h.records[0], kind: "pi_pi", endpoints: [[0, 0, 0], [0, 0, 0]], geometry: { distance: 0, plane_angle: 0, offset_1: 0, offset_2: 0 } };
  act(() => {
    h.store.toggleType("pi_pi");
    h.store.publish(h.props.project.id, interactionKey(h.props.project.id, h.analysisResult.inputs), { ...h.analysisResult, records: [coincident] });
  });
  const key = interactionRecordKey(coincident);
  h.acknowledge([]);
  act(() => { h.result.current.panel.onInspectContact(key); });
  expect(h.result.current.panel.categories.pi_pi).toMatchObject({ detected: 1, shown: 0 });
  expect(h.result.current.panel.inspected?.focusUnavailable).toContain("coincident interaction endpoints");
  expect(h.result.current.panel.inspected?.selectUnavailable).toBeNull();
  expect(h.result.current.panel.status.message).not.toContain("participants hidden");
  act(() => { h.result.current.panel.onFocusContact(key); h.result.current.panel.onSelectContact(key); });
  expect(h.focusAtoms).not.toHaveBeenCalled();
  expect(h.onSelect).toHaveBeenCalledWith(interactionParticipants(coincident));
});

it("captures a partial donor group and keeps that target independent of Select participants", () => {
  const h = fixture();
  h.props.selection = canonicalSelection([ref("a", 1)]); h.rerender({ ...h.props });
  act(() => { h.result.current.panel.onTargetModeChange("selection"); });
  expect(h.result.current.panel.status.message).toBe("Capture a selection");
  act(() => { h.result.current.panel.onCaptureSelection(); });
  expect(h.result.current.panel.contacts).toHaveLength(1);
  const key = h.result.current.panel.contacts[0].key;
  h.acknowledge([h.records[0]]);
  act(() => { h.result.current.panel.onInspectContact(key); });
  expect(h.result.current.panel.inspected?.focusUnavailable).toBeNull();
  act(() => { h.result.current.panel.onFocusContact(key); h.result.current.panel.onSelectContact(key); });
  expect(h.focusAtoms).toHaveBeenCalledWith(interactionParticipants(h.records[0]));
  expect(h.onSelect).toHaveBeenCalledWith([ref("a", 1), ref("a", 2), ref("b", 1)]);
  h.props.selection = canonicalSelection([ref("a", 3)]); h.rerender({ ...h.props });
  expect(h.result.current.panel.contacts.map(row => row.key)).toEqual([key]);
  expect(useInteractionStore.getState().selectionTarget?.atoms).toEqual([ref("a", 1)]);
  expect(h.result.current.panel.target.selectionChanged).toBe(true);
});

it("retains visibility choices and appearance without repeating cached chemistry", () => {
  const analyze = vi.spyOn(interactionApi, "analyze");
  const h = fixture(), before = JSON.stringify(h.props.project), cached = useInteractionStore.getState().cache;
  act(() => { h.result.current.panel.onAppearanceChange("hydrogen_bond", { color: "#abcdef", width: 4 }); h.result.current.panel.onShowChange(false); });
  expect(h.result.current.panel.status.message).toBe("Hidden · choices retained");
  expect(h.result.current.displayRecords).toHaveLength(0);
  act(() => { h.result.current.panel.onShowChange(true); });
  expect(h.result.current.panel.choices.types).toEqual(["hydrogen_bond", "salt_bridge"]);
  expect(h.result.current.panel.appearance.hydrogen_bond).toEqual({ color: "#abcdef", width: 4 });
  expect(useInteractionStore.getState().cache).toBe(cached);
  expect(analyze).not.toHaveBeenCalled();
  expect(JSON.stringify(h.props.project)).toBe(before);
});

it("retires inspected evidence on a new artifact even when structural record keys repeat", () => {
  const h = fixture(), key = interactionRecordKey(h.records[0]);
  act(() => { h.result.current.panel.onInspectContact(key); });
  expect(h.result.current.panel.inspected).not.toBeNull();
  const oldSelect = h.result.current.panel.onSelectContact;
  const project = { ...h.props.project, entries: h.props.project.entries.map(entry => entry.id === "a" ? { ...entry, current_artifact_id: "new-a" } : entry) };
  h.queryClient.setQueryData(["project", project.id], project);
  act(() => { oldSelect(key); });
  expect(h.onSelect).not.toHaveBeenCalled();
  h.props.project = project; h.rerender({ ...h.props });
  expect(h.result.current.panel.inspected).toBeNull();
  expect(h.result.current.panel.resultIdentity).toBeNull();
});

it("marks changed whole-ligand membership and allows deliberate recapture of the same instance", () => {
  const h = fixture();
  const candidate = resolveInteractionLigands(h.props.project.entries, h.props.projections)[0];
  act(() => { h.store.captureTarget(captureLigandTarget(candidate)!); });
  expect(h.result.current.panel.target.needsUpdate).toBe(false);
  const previous = h.props.projections.get("a")!;
  const projection = structuredClone(previous);
  projection.artifact_id = "new-a";
  projection.structure.atoms.push({ ...projection.structure.atoms[0], id: 4 });
  h.props.project = { ...h.props.project, entries: h.props.project.entries.map(entry => entry.id === "a" ? { ...entry, atom_ids: [1, 2, 3, 4], current_artifact_id: "new-a" } : entry) };
  h.props.projections = new Map(h.props.projections).set("a", projection);
  h.queryClient.setQueryData(["project", h.props.project.id], h.props.project);
  h.rerender({ ...h.props });
  expect(h.result.current.panel.target.needsUpdate).toBe(true);
  expect(useInteractionStore.getState().ligandTarget?.atoms).toEqual(candidate.atoms);
  act(() => { h.result.current.panel.onLigandChange(candidate.key); });
  expect(h.result.current.panel.target.needsUpdate).toBe(false);
  expect(useInteractionStore.getState().ligandTarget?.atoms).toContainEqual(ref("a", 4));
});

it("separates hidden participants from a negative result and rejects stale hidden superset records", () => {
  const h = fixture();
  h.props.structures = h.props.structures.map(source => source.entryId === "b" ? {
    ...source, settings: { ...source.settings, components: { ...source.settings.components, ligands: false } },
  } : source);
  h.rerender({ ...h.props }); h.acknowledge([]);
  expect(h.result.current.panel.status.message).toContain("0 shown · 2 detected");
  h.props.project = { ...h.props.project, entries: h.props.project.entries.map(entry => entry.id === "b" ? { ...entry, visible: false } : entry) };
  h.props.structures = h.props.structures.filter(source => source.entryId !== "b");
  h.rerender({ ...h.props }); h.acknowledge([]);
  expect(h.result.current.panel.status.message).toContain("0 shown · 0 detected");
  h.props.project = { ...h.props.project, entries: h.props.project.entries.map(entry => entry.id === "b" ? { ...entry, current_artifact_id: "changed-hidden" } : entry) };
  h.rerender({ ...h.props }); h.acknowledge([]);
  expect(h.result.current.panel.status.message).toContain("0 shown · 0 detected");
});

it("selects exact known warning IDs and refuses late actions against newer canonical state", () => {
  const h = fixture(), key = h.result.current.panel.warnings[0].key;
  act(() => { h.result.current.panel.onSelectWarning(key); });
  expect(h.onSelect).toHaveBeenCalledExactlyOnceWith([ref("a", 2)]);
  const project = { ...h.props.project, entries: h.props.project.entries.map(entry => entry.id === "a" ? { ...entry, atom_ids: [1, 3] } : entry) };
  h.queryClient.setQueryData(["project", project.id], project);
  act(() => { h.result.current.panel.onSelectWarning(key); });
  expect(h.onSelect).toHaveBeenCalledTimes(1);
});

it("does not expose stale Focus/Select actions during previews and independent scope changes", () => {
  const h = fixture(), key = interactionRecordKey(h.records[0]);
  h.acknowledge(); act(() => { h.result.current.panel.onInspectContact(key); });
  h.props.paused = true; h.rerender({ ...h.props });
  expect(h.result.current.panel.status.message).toBe("Paused during preview");
  expect(h.result.current.panel.inspected?.focusUnavailable).toContain("preview");
  act(() => { h.result.current.panel.onFocusContact(key); h.result.current.panel.onSelectContact(key); });
  expect(h.focusAtoms).not.toHaveBeenCalled(); expect(h.onSelect).not.toHaveBeenCalled();
  h.props.paused = false; h.rerender({ ...h.props });
  act(() => { h.result.current.panel.onToggleScope("inter"); });
  expect(h.result.current.panel.status.message).toBe("Choose Inter or Intra");
  expect(h.result.current.panel.inspected).toBeNull();
});

it("resets all transient controls on project change while same-project remount retains intent", () => {
  const h = fixture();
  act(() => { h.store.captureTarget(captureSelectionTarget([ref("a", 1)])!); h.store.setShow(false); h.store.setCollapsed(true); h.store.changeAppearance("clash", { width: 6 }); });
  h.unmount();
  h.store.setProject(h.props.project.id);
  expect(useInteractionStore.getState()).toMatchObject({ show: false, collapsed: true, targetMode: "selection" });
  h.store.setProject("another-project");
  expect(useInteractionStore.getState()).toMatchObject({ show: true, collapsed: false, targetMode: "all", inspectedKey: null, inspectedResultKey: null, selectionTarget: null, ligandTarget: null, cache: null, choices: { types: [], inter: true, intra: false } });
  expect(useInteractionStore.getState().appearance.clash.width).toBe(2.5);
});

it("retains the captured ligand label after removal without choosing another instance", () => {
  const h = fixture();
  act(() => { h.result.current.panel.onTargetModeChange("ligand"); });
  const candidate = h.result.current.panel.target.candidates[0];
  act(() => { h.result.current.panel.onLigandChange(candidate.key); });
  h.props.project = { ...h.props.project, entries: h.props.project.entries.filter(entry => entry.id !== candidate.entryId) };
  h.queryClient.setQueryData(["project", h.props.project.id], h.props.project);
  h.rerender({ ...h.props });
  expect(h.result.current.panel.target.label).toBe(`${candidate.label} · unavailable`);
  expect(h.result.current.panel.target.ligandKey).toBe(candidate.key);
  expect(h.result.current.panel.target.needsUpdate).toBe(true);
  expect(useInteractionStore.getState().ligandTarget?.entryId).toBe(candidate.entryId);
});
