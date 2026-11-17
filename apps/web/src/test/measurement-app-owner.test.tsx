import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSyncExternalStore, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import { projectApi, workspacePresentationApi } from "../api/client";
import type { Contact, CoordinateTransform, Measurement, Project } from "../api/types";
import { MeasurementContacts } from "../components/MeasurementContacts";
import type { ProjectInspector } from "../components/ProjectInspector";
import type { WorkspaceCanvas } from "../components/WorkspaceCanvas";
import type { MeasurementSession } from "../measurements/session";
import { useSelectionStore } from "../store/selection";
import { useWorkspaceStore } from "../store/workspace";
import { useEditingStore } from "../store/editing";
import { useMinimizationStore } from "../minimization/store";
import { structureQueryKey } from "../structures/query";
import { molecularEntry, molecularProject, proteinProjection } from "./molecular-fixtures";

const seen = vi.hoisted(() => ({ session: null as MeasurementSession | null, props: null as ComponentProps<typeof WorkspaceCanvas> | null, inspector: null as ComponentProps<typeof ProjectInspector> | null, renderContacts: false, contactSelect: vi.fn() }));
vi.mock("../components/WorkspaceCanvas", () => ({
  WorkspaceCanvas: (props: ComponentProps<typeof WorkspaceCanvas>) => {
    seen.session = props.measurementSession ?? null; seen.props = props;
    const session = props.measurementSession!;
    const draft = useSyncExternalStore(session.subscribe, session.snapshot);
    return seen.renderContacts && props.project && draft.open
      ? <MeasurementContacts key={draft.session} project={props.project} session={session} preferredEntryId="protein" paused={false} onSelect={seen.contactSelect} /> : null;
  },
}));
vi.mock("../components/ProjectInspector", () => ({ ProjectInspector: (props: ComponentProps<typeof ProjectInspector>) => { seen.inspector = props; return null; } }));
vi.mock("../components/LowerPanel", () => ({ LowerPanel: () => null }));

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); seen.session = null; seen.props = null; seen.inspector = null; seen.renderContacts = false; seen.contactSelect.mockClear();
  useSelectionStore.getState().setProject(null); useEditingStore.getState().setProject(null); useMinimizationStore.getState().setProject(null);
  vi.spyOn(workspacePresentationApi, "read").mockResolvedValue({ schema_version: 1, revision: 0, camera: null, updated_at: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function setup(dirty = true, measurements: Measurement[] = [], contacts = false) {
  seen.renderContacts = contacts;
  const project = molecularProject([molecularEntry("protein", "Protein", "protein")]);
  project.has_uncheckpointed_changes = dirty;
  project.measurements = measurements;
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


it("classifies recovery only on first load, so a retired Save cannot announce recovery on a later visit", async () => {
  const f = await setup(false);
  expect(screen.queryByText("Recovered locally stored changes.")).toBeNull();
  let finish!: (next: Project) => void;
  vi.spyOn(projectApi, "createMeasurement").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let saved!: Promise<boolean>;
  act(() => { saved = f.session.save(); });
  await waitFor(() => expect(finish).toBeDefined());
  act(() => {
    useWorkspaceStore.getState().setActiveProjectId(f.other.id);
    useWorkspaceStore.getState().setActiveProjectId(f.project.id);
    f.session.open(); f.session.setName("Later visit");
  });
  const newer = f.session.snapshot();
  await act(async () => {
    finish({ ...f.project, revision: f.project.revision + 1, has_uncheckpointed_changes: true });
    await saved;
  });
  // Await the actual App render triggered by the scheduled query notification.
  expect(await screen.findByLabelText("Unsaved changes")).toBeVisible();
  expect(f.session.snapshot()).toBe(newer);
  expect(screen.queryByText("Recovered locally stored changes.")).toBeNull();
  expect(screen.queryByText("Change stored locally.")).toBeNull();
});

it("still announces persisted dirty state on the first load of a fresh App", async () => {
  await setup(true);
  expect(await screen.findByText("Recovered locally stored changes.")).toBeVisible();
});


function savedRecord(name: string): Measurement {
  return { id: "saved", kind: "distance", name, visible: true,
    atom_references: [1, 2].map(atom_id => ({ structure_id: "protein", atom_id })),
    warnings: [], created_at: "2026-11-16T12:00:00Z", modified_at: "2026-11-16T12:00:00Z" };
}

it("does not clear a draft or announce Saved from an acknowledgement older than current cached state", async () => {
  const f = await setup();
  let finish!: (next: Project) => void;
  vi.spyOn(projectApi, "createMeasurement").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let saved!: Promise<boolean>;
  act(() => { saved = f.session.save(); });
  await waitFor(() => expect(finish).toBeDefined());
  const newer = { ...f.project, revision: f.project.revision + 2, measurements: [] };
  act(() => { f.query.setQueryData(["project", f.project.id], newer); });
  let result = true;
  await act(async () => {
    finish({ ...f.project, revision: f.project.revision + 1, measurements: [savedRecord("Owned distance")] });
    result = await saved;
  });
  expect(result).toBe(false);
  expect(f.query.getQueryData(["project", f.project.id])).toEqual(newer);
  expect(f.session.snapshot()).toMatchObject({ name: "Owned distance", saving: false,
    slots: [1, 2].map(atom_id => ({ structure_id: "protein", atom_id })),
    notice: "The project changed while Save was finishing. Check Saved measurements." });
});

it("does not announce an older saved-record rename after the cached record has changed again", async () => {
  const record = savedRecord("Original"), f = await setup(true, [record]);
  let finish!: (next: Project) => void;
  vi.spyOn(projectApi, "updateMeasurement").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let updating!: Promise<void>;
  act(() => { updating = seen.props!.onUpdateMeasurement!(record, "Renamed", true); });
  await waitFor(() => expect(finish).toBeDefined());
  const newer = { ...f.project, revision: f.project.revision + 2, measurements: [savedRecord("Later")] };
  act(() => { f.query.setQueryData(["project", f.project.id], newer); });
  await act(async () => {
    finish({ ...f.project, revision: f.project.revision + 1, measurements: [savedRecord("Renamed")] });
    await updating;
  });
  expect(f.query.getQueryData(["project", f.project.id])).toEqual(newer);
  expect(f.session.snapshot().notice).not.toBe("Updated Renamed.");
});


it("synchronously retires a held Save across numerical preview entry and Cancel before React renders", async () => {
  const f = await setup(false), inspector = seen.inspector!;
  let finish!: (next: Project) => void;
  vi.spyOn(projectApi, "createMeasurement").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const preview = inspector.onPreviewTransform!, clear = inspector.onClearTransformPreview!;
  let saved!: Promise<boolean>;
  act(() => { saved = f.session.save(); });
  await waitFor(() => expect(finish).toBeDefined());
  const generation = f.session.snapshot().generation;
  const transform: CoordinateTransform = { entry_id: "protein", scope: "structure",
    selection: useSelectionStore.getState().selection, translation: [1, 0, 0],
    rotation_degrees: [0, 0, 0], pivot_mode: "custom", pivot: [0, 0, 0] };
  await act(async () => {
    inspector.onInspectorTaskChange?.();
    await preview(transform);
    expect(f.session.inspectionAvailable()).toBe(false);
    expect(f.session.snapshot().generation).toBeGreaterThan(generation);
    clear();
    expect(f.session.inspectionAvailable()).toBe(true);
    finish({ ...f.project, revision: f.project.revision + 1 });
    await saved;
  });
  expect(f.session.snapshot()).toMatchObject({ name: "Owned distance", acquiring: false, saving: false,
    slots: [1, 2].map(atom_id => ({ structure_id: "protein", atom_id })) });
  expect(f.session.snapshot().notice).not.toBe("Saved Owned distance.");
});

it.each(["success", "failure"] as const)("keeps competing editor intent after a held Save %s", async outcome => {
  const f = await setup(false);
  let finish!: (next: Project) => void, fail!: (error: Error) => void;
  vi.spyOn(projectApi, "createMeasurement").mockImplementation(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
  let saved!: Promise<boolean>;
  act(() => { saved = f.session.save(); });
  await waitFor(() => expect(finish).toBeDefined());
  act(() => { useEditingStore.getState().setOpen(true); });
  expect(f.session.snapshot().acquiring).toBe(false);
  await act(async () => {
    if (outcome === "success") finish({ ...f.project, revision: f.project.revision + 1 });
    else fail(new Error("Save failed"));
    await saved;
  });
  expect(useEditingStore.getState().open).toBe(true);
  expect(f.session.snapshot()).toMatchObject({ acquiring: false, activeSlot: null, saving: false,
    name: outcome === "success" ? "" : "Owned distance",
    notice: outcome === "success" ? "Saved Owned distance." : "Save failed" });
});


it.each(["result", "pending"] as const)("synchronously retires a contact %s through numerical preview entry and Cancel", async phase => {
  const f = await setup(false, [], true), inspector = seen.inspector!;
  const rows: Contact[] = [{ atom_1: { structure_id: "protein", atom_id: 1 }, atom_2: { structure_id: "protein", atom_id: 2 }, distance: 1.4 }];
  let finish!: (value: Contact[]) => void;
  const pending = new Promise<Contact[]>(resolve => { finish = resolve; });
  const api = vi.spyOn(projectApi, "contacts").mockReturnValue(phase === "result" ? Promise.resolve(rows) : pending);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find contacts" })); await Promise.resolve(); });
  await waitFor(() => expect(api).toHaveBeenCalledOnce());
  const row = phase === "result" ? await screen.findByRole("button", { name: "Atoms 1–2 1.40 Å" }) : null;
  const transform: CoordinateTransform = { entry_id: "protein", scope: "structure",
    selection: useSelectionStore.getState().selection, translation: [1, 0, 0],
    rotation_degrees: [0, 0, 0], pivot_mode: "custom", pivot: [0, 0, 0] };
  await act(async () => {
    inspector.onInspectorTaskChange?.();
    await inspector.onPreviewTransform!(transform);
    expect(f.session.inspectionAvailable()).toBe(false);
    inspector.onClearTransformPreview!();
    if (row) fireEvent.click(row);
    else { finish(rows); await pending; }
  });
  expect(api.mock.calls[0][4]?.signal?.aborted).toBe(true);
  expect(seen.contactSelect).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Atoms 1–2 1.40 Å" })).toBeNull();
});
