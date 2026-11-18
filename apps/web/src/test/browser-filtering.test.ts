import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyBrowserFilters, matchesBrowserFilters, type BrowserFilterScope } from "../browser/filtering";
import { useWorkspaceStore } from "../store/workspace";
import { WORKSPACE_STORAGE_KEY } from "../theme";
import { molecularEntry } from "./molecular-fixtures";

const state = () => useWorkspaceStore.getState();
const scope = (): BrowserFilterScope => ({ projectId: state().activeProjectId, visit: state().browserFilterVisit });
beforeEach(() => { state().setActiveProjectId(null); state().setActiveProjectId("A"); localStorage.clear(); });
afterEach(() => { state().setActiveProjectId(null); localStorage.clear(); });

describe("existing shared browser matching semantics", () => {
  const entry = { ...molecularEntry("ethanol", "Ethanol", "ligand"), original_filename: "Archived_INPUT.SDF" };
  for (const [search, type, expected] of [
    ["", "all", true], ["  EthANOL  ", "all", true], ["archived_input", "all", true],
    [".sdf", "ligand", true], ["ethanol", "protein", false], ["missing", "all", false],
    ["  ", "ligand", true], ["ethanol archived", "all", false],
  ] as const) it(`matches ${JSON.stringify(search)} / ${type}: ${expected}`, () => {
    expect(matchesBrowserFilters(entry, { search, type })).toBe(expected);
  });
  it("handles null filenames without manufacturing a match", () => {
    expect(matchesBrowserFilters({ ...entry, name: "Other", original_filename: null }, { search: "archived", type: "all" })).toBe(false);
  });
  it("keeps visibility and group membership independent of predicate membership", () => {
    const hidden = { ...entry, visible: false, group_id: "collapsed" };
    expect(matchesBrowserFilters(hidden, emptyBrowserFilters)).toBe(true);
  });
  it("recomputes rename and Undo against the current entry without changing inputs", () => {
    const filters = { search: "ethanol", type: "all" } as const;
    expect(matchesBrowserFilters(entry, filters)).toBe(true);
    expect(matchesBrowserFilters({ ...entry, name: "Renamed" }, filters)).toBe(false);
    expect(matchesBrowserFilters(entry, filters)).toBe(true);
    expect(filters).toEqual({ search: "ethanol", type: "all" });
  });
});

describe("transient project-visit filter intent", () => {
  it("merges rapid captured patches into the current fields", () => {
    const captured = scope();
    expect(state().patchBrowserFilters(captured, { search: "ethanol" })).toBe(true);
    expect(state().patchBrowserFilters(captured, { type: "ligand" })).toBe(true);
    expect(state().browserFilters).toEqual({ search: "ethanol", type: "ligand" });
    expect(state().patchBrowserFilters(captured, { search: "eth" })).toBe(true);
    expect(state().browserFilters).toEqual({ search: "eth", type: "ligand" });
  });
  it("resets atomically only on an actual active-project switch", () => {
    state().patchBrowserFilters(scope(), { search: "ethanol", type: "ligand" });
    const previousVisit = state().browserFilterVisit, previous = state().browserFilters;
    state().setActiveProjectId("A");
    expect(state().browserFilterVisit).toBe(previousVisit); expect(state().browserFilters).toBe(previous);
    const publications: unknown[] = [], release = useWorkspaceStore.subscribe(value => publications.push({
      id: value.activeProjectId, filters: value.browserFilters, differentVisit: value.browserFilterVisit !== previousVisit,
    }));
    state().setActiveProjectId("B"); release();
    expect(publications).toEqual([{ id: "B", filters: { search: "", type: "all" }, differentVisit: true }]);
  });
  it("rejects old callbacks through A to B to A without losing newer intent", () => {
    const oldA = scope(); state().setActiveProjectId("B"); const oldB = scope(); state().setActiveProjectId("A");
    const current = scope(); state().patchBrowserFilters(current, { search: "current", type: "protein" });
    expect(state().patchBrowserFilters(oldA, { search: "late A" })).toBe(false);
    expect(state().patchBrowserFilters(oldB, { type: "ligand" })).toBe(false);
    expect(state().browserFilters).toEqual({ search: "current", type: "protein" });
  });
  it("rejects a mismatched project even with the current visit token", () => {
    expect(state().patchBrowserFilters({ projectId: "B", visit: state().browserFilterVisit }, { search: "stale" })).toBe(false);
    expect(state().browserFilters).toEqual(emptyBrowserFilters);
  });
  it("excludes filter inputs and tokens from persisted preferences", () => {
    state().patchBrowserFilters(scope(), { search: "not durable", type: "complex" });
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY)!) as { state: Record<string, unknown> };
    expect(saved.state).not.toHaveProperty("browserFilters"); expect(saved.state).not.toHaveProperty("browserFilterVisit");
    expect(saved.state.activeProjectId).toBe("A");
  });
  it("ignores injected stored filters and tokens while retaining current same-project intent", async () => {
    state().patchBrowserFilters(scope(), { search: "current", type: "protein" }); const visit = state().browserFilterVisit;
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: { activeProjectId: "A",
      browserFilters: { search: "injected", type: "complex" }, browserFilterVisit: "injected-token" }, version: 0 }));
    await useWorkspaceStore.persist.rehydrate();
    expect(state().browserFilters).toEqual({ search: "current", type: "protein" }); expect(state().browserFilterVisit).toBe(visit);
  });
  it("restoring a different active project starts an empty fresh visit", async () => {
    state().patchBrowserFilters(scope(), { search: "current", type: "ligand" }); const visit = state().browserFilterVisit;
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: { activeProjectId: "B",
      browserFilters: { search: "injected", type: "protein" }, browserFilterVisit: {} }, version: 0 }));
    await useWorkspaceStore.persist.rehydrate();
    expect(state().activeProjectId).toBe("B"); expect(state().browserFilters).toEqual(emptyBrowserFilters);
    expect(state().browserFilterVisit).not.toBe(visit);
  });
});
