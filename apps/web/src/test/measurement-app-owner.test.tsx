import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import { projectApi, workspacePresentationApi } from "../api/client";
import type { Project } from "../api/types";
import type { WorkspaceCanvas } from "../components/WorkspaceCanvas";
import type { MeasurementSession } from "../measurements/session";
import { useSelectionStore } from "../store/selection";
import { useWorkspaceStore } from "../store/workspace";
import { useEditingStore } from "../store/editing";
import { useMinimizationStore } from "../minimization/store";
import { structureQueryKey } from "../structures/query";
import { molecularEntry, molecularProject, proteinProjection } from "./molecular-fixtures";

const seen = vi.hoisted(() => ({ session: null as MeasurementSession | null }));
vi.mock("../components/WorkspaceCanvas", () => ({
  WorkspaceCanvas: (props: ComponentProps<typeof WorkspaceCanvas>) => { seen.session = props.measurementSession ?? null; return null; },
}));
vi.mock("../components/ProjectInspector", () => ({ ProjectInspector: () => null }));
vi.mock("../components/LowerPanel", () => ({ LowerPanel: () => null }));

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); seen.session = null;
  useSelectionStore.getState().setProject(null); useEditingStore.getState().setProject(null); useMinimizationStore.getState().setProject(null);
  vi.spyOn(workspacePresentationApi, "read").mockResolvedValue({ schema_version: 1, revision: 0, camera: null, updated_at: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function setup() {
  const project = molecularProject([molecularEntry("protein", "Protein", "protein")]);
  const other = { ...molecularProject([]), id: "other", name: "Other" };
  const source = proteinProjection();
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  query.setQueryData(["project", project.id], project); query.setQueryData(["project", other.id], other);
  query.setQueryData(structureQueryKey(project.id, "protein", "current-protein"), source);
  vi.spyOn(globalThis, "fetch").mockImplementation(input => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(Response.json(path.endsWith(`/projects/${project.id}`) ? project
      : path.endsWith(`/projects/${other.id}`) ? other
        : path === "/api/v1/projects" ? [project, other].map(p => ({ ...p, entry_count: p.entries.length })) : []));
  });
  useWorkspaceStore.setState({ activeProjectId: project.id, mobilePanel: null });
  render(<QueryClientProvider client={query}><App /></QueryClientProvider>);
  await waitFor(() => expect(useSelectionStore.getState().projectId).toBe(project.id));
  const session = seen.session!;
  act(() => { session.open(); session.useSelection([1, 2].map(atom_id => ({ structure_id: "protein", atom_id }))); session.setName("Owned distance"); });
  expect(session.value()).not.toBeNull();
  return { project, other, query, session };
}

it("keeps explicit Promise Save on the guarded App command path and preserves its order", async () => {
  const f = await setup();
  const next = { ...f.project, revision: f.project.revision + 1 };
  const create = vi.spyOn(projectApi, "createMeasurement").mockResolvedValue(next);
  let saved = false;
  await act(async () => { saved = await f.session.save(); });
  expect(saved).toBe(true);
  expect(create).toHaveBeenCalledExactlyOnceWith({ id: f.project.id, revision: f.project.revision }, "Owned distance", "distance",
    [1, 2].map(atom_id => ({ structure_id: "protein", atom_id })));
  expect(f.query.getQueryData<Project>(["project", f.project.id])?.revision).toBe(next.revision);
  expect(f.session.snapshot()).toMatchObject({ name: "", saving: false, notice: "Saved Owned distance." });
  expect(screen.queryByText("Change stored locally.")).toBeNull();
});

it("retires a held Save during A→B→A before React can update selection epoch, accepting only its own cache", async () => {
  const f = await setup();
  let finish!: (next: Project) => void;
  vi.spyOn(projectApi, "createMeasurement").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let saved!: Promise<boolean>;
  act(() => { saved = f.session.save(); });
  await waitFor(() => expect(finish).toBeDefined());
  const epoch = useSelectionStore.getState().projectEpoch;
  act(() => {
    useWorkspaceStore.getState().setActiveProjectId(f.other.id);
    expect(f.session.snapshot().open).toBe(false);
    useWorkspaceStore.getState().setActiveProjectId(f.project.id);
    f.session.open();
  });
  expect(useSelectionStore.getState().projectEpoch).toBe(epoch);
  // Close/reopen owns a new draft even though the previous server request is pending.
  const newer = f.session.snapshot();
  await act(async () => { finish({ ...f.project, revision: f.project.revision + 1 }); await saved; });
  expect(f.session.snapshot()).toBe(newer);
  expect(f.query.getQueryData<Project>(["project", f.project.id])?.revision).toBe(f.project.revision + 1);
  expect(f.query.getQueryData<Project>(["project", f.other.id])).toEqual(f.other);
  expect(screen.queryByText("Change stored locally.")).toBeNull();
});

it("synchronously pauses the draft at editing/minimization boundaries and preserves target refs", async () => {
  const f = await setup(), original = f.session.snapshot().slots;
  act(() => useEditingStore.getState().setOpen(true));
  expect(f.session.snapshot().acquiring).toBe(false);
  act(() => { useEditingStore.getState().setOpen(false); f.session.activate(0);
    useMinimizationStore.getState().begin(f.project, useSelectionStore.getState().selection); });
  expect(f.session.snapshot().acquiring).toBe(false);
  expect(f.session.value()).toBeNull();
  expect(f.session.snapshot().slots).toEqual(original);
});
