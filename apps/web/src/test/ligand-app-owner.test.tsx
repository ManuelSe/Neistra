import userEvent from "@testing-library/user-event";
import { ViewerMeasurements } from "../components/ViewerMeasurements";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import { ApiError, projectApi, workspacePresentationApi } from "../api/client";
import type { CoordinateTransform, Project } from "../api/types";
import type * as LigandControlsModule from "../components/LigandDesignationControls";
import type { LigandDesignationControls } from "../components/LigandDesignationControls";
import type { ProjectInspector } from "../components/ProjectInspector";
import type { WorkspaceCanvas } from "../components/WorkspaceCanvas";
import { ligandApi } from "../ligands/api";
import type { LigandCandidatesRead } from "../ligands/types";
import { useMinimizationStore } from "../minimization/store";
import { useEditingStore } from "../store/editing";
import { useNavigationStore } from "../store/navigation";
import { useSelectionStore } from "../store/selection";
import { useWorkspaceStore } from "../store/workspace";
import { structureQueryKey } from "../structures/query";
import { molecularEntry, molecularProject, proteinProjection } from "./molecular-fixtures";

type Controls = ComponentProps<typeof LigandDesignationControls>;
const seen = vi.hoisted(() => ({ renderMeasurements: false, controls: null as Controls | null,
  inspector: null as ComponentProps<typeof ProjectInspector> | null,
  workspace: null as ComponentProps<typeof WorkspaceCanvas> | null }));
vi.mock("../components/LigandDesignationControls", async importOriginal => {
  const actual = await importOriginal<typeof LigandControlsModule>();
  return { LigandDesignationControls: (props: Controls) => {
    seen.controls = props; return <actual.LigandDesignationControls {...props} />;
  } };
});
vi.mock("../components/ProjectInspector", () => ({ ProjectInspector: (props: ComponentProps<typeof ProjectInspector>) => {
  seen.inspector = props; return props.ligandControls;
} }));
vi.mock("../components/WorkspaceCanvas", () => ({ WorkspaceCanvas: (props: ComponentProps<typeof WorkspaceCanvas>) => {
  seen.workspace = props;
  const session = props.measurementSession;
  return seen.renderMeasurements && session && props.project ? <ViewerMeasurements session={session} project={props.project}
    sceneAvailable={false} busy={false} inspection={{ projectId: props.project.id, viewer: undefined, sources: [],
      selection: props.selection, order: null, structures: new Map(), entries: props.project.entries, paused: false, onOrder: () => undefined }}
    onUpdate={() => Promise.resolve()} onDelete={() => Promise.resolve()} onSelect={() => undefined}
    onReturnFocus={() => undefined} /> : null;
} }));
vi.mock("../components/LowerPanel", () => ({ LowerPanel: () => null }));
const clients: QueryClient[] = [];
beforeEach(() => {
  localStorage.clear(); vi.restoreAllMocks(); seen.renderMeasurements = false; seen.controls = null; seen.inspector = null; seen.workspace = null;
  useSelectionStore.getState().setProject(null); useEditingStore.getState().setProject(null);
  useMinimizationStore.getState().setProject(null); useNavigationStore.getState().setProject(null);
  vi.spyOn(workspacePresentationApi, "read").mockResolvedValue({ schema_version: 1, revision: 0, camera: null, updated_at: null });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function inventory(project: Project): LigandCandidatesRead {
  const entry = project.entries[0];
  return { project_id: project.id, entry_id: entry.id, artifact_id: entry.current_artifact_id,
    designation: entry.ligand_designation, input_hash: "inventory", resolver_version: "ligand-instance-v3",
    total: 1, offset: 0, limit: 12, designated_candidate: null, warnings: [], selectable_candidate_keys: ["candidate"],
    candidates: [{ candidate_key: "candidate", atom_ids: [1, 2], residue_ids: [1], component_ids: ["LIG"],
      label: "Exact instance", locations: [], boundary_status: "qualified", potential_ligand: true,
      reason_codes: [], provenance: [], heavy_atom_count: 2, formal_charge: 0, formula: "C2H6",
      molecular_weight: 30, chemistry_status: "qualified", chemistry_reason: null, chemical_input_hash: "chemistry",
      occurrence_count: null, occurrence_basis: null, occurrence_reason: "occurrence_count_not_qualified" }] };
}
async function setup(legacy = false, strict = false) {
  const entry = molecularEntry("protein", "Entry", "protein");
  if (!legacy) entry.ligand_designation = { ...entry.ligand_designation, status: "selection_required" };
  const project = molecularProject([entry]); project.has_uncheckpointed_changes = false;
  const other = { ...molecularProject([]), id: "other", name: "Other" };
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(query); query.setQueryData(["project", project.id], project); query.setQueryData(["project", other.id], other);
  query.setQueryData(structureQueryKey(project.id, entry.id, entry.current_artifact_id), proteinProjection());
  vi.spyOn(globalThis, "fetch").mockImplementation(input => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(Response.json(path.endsWith(`/projects/${project.id}`) ? project
      : path.endsWith(`/projects/${other.id}`) ? other
        : path === "/api/v1/projects" ? [project, other].map(value => ({ ...value, entry_count: value.entries.length })) : []));
  });
  vi.spyOn(ligandApi, "candidates").mockResolvedValue(inventory(project));
  vi.spyOn(ligandApi, "depiction").mockResolvedValue({ entry_id: entry.id, artifact_id: entry.current_artifact_id,
    candidate_key: "candidate", status: "unavailable", reason: "not_qualified", input_hash: null,
    cache_key: null, artifact: null, implementation: "ligand-2d-v1", library_version: "pinned",
    formula: null, molecular_weight: null, formal_charge: null, provenance: null });
  useWorkspaceStore.setState({ activeProjectId: project.id, mobilePanel: null });
  const content = <QueryClientProvider client={query}><App /></QueryClientProvider>;
  render(strict ? <StrictMode>{content}</StrictMode> : content);
  await waitFor(() => expect(useSelectionStore.getState().projectId).toBe(project.id));
  act(() => useNavigationStore.getState().inspect(project.id, entry.id));
  if (!window.matchMedia("(max-width: 840px)").matches) {
    await waitFor(() => expect(seen.controls?.entryId).toBe(entry.id));
  }
  return { entry, project, other, query };
}
function leaveAndReturn(other: Project, project: Project) {
  useWorkspaceStore.getState().setActiveProjectId(other.id);
  useWorkspaceStore.getState().setActiveProjectId(project.id);
}

it("refuses a retained callback through same-batched project ABA before mutation preflight", async () => {
  const f = await setup(), callback = seen.controls!.onDesignate;
  const designate = vi.spyOn(ligandApi, "designate");
  const epoch = useSelectionStore.getState().projectEpoch;
  act(() => leaveAndReturn(f.other, f.project));
  expect(useSelectionStore.getState().projectEpoch).toBe(epoch);
  await expect(callback(f.entry, "candidate", "inventory")).rejects.toThrow("context changed");
  expect(designate).not.toHaveBeenCalled();
  expect(screen.queryByText("Change stored locally.")).toBeNull();
});

it("checks ownership again between mutation admission and dispatch", async () => {
  const f = await setup(), designate = vi.spyOn(ligandApi, "designate");
  const old = seen.controls!;
  let saving!: ReturnType<Controls["onDesignate"]>;
  await act(async () => {
    saving = old.onDesignate(f.entry, "candidate", "inventory");
    const observed = saving.catch((error: unknown) => error);
    leaveAndReturn(f.other, f.project);
    expect(await observed).toBeInstanceOf(ApiError);
  });
  expect(designate).not.toHaveBeenCalled();
  expect(screen.queryByText("Change stored locally.")).toBeNull();
});

it.each(["success", "failure"] as const)("retires held %s feedback through project ABA while preserving its own monotonic cache", async outcome => {
  const f = await setup(), held = deferred<Project>();
  const designate = vi.spyOn(ligandApi, "designate").mockReturnValue(held.promise);
  let saving!: ReturnType<Controls["onDesignate"]>;
  act(() => { saving = seen.controls!.onDesignate(f.entry, "candidate", "inventory"); });
  const caught = saving.catch((error: unknown) => error);
  await waitFor(() => expect(designate).toHaveBeenCalledOnce());
  act(() => leaveAndReturn(f.other, f.project));
  await act(async () => {
    if (outcome === "success") held.resolve({ ...f.project, revision: f.project.revision + 1 });
    else held.reject(new Error("Retired ligand failure"));
    await caught;
  });
  expect(screen.queryByText("Change stored locally.")).toBeNull();
  expect(screen.queryByText("Retired ligand failure")).toBeNull();
  expect(f.query.getQueryData<Project>(["project", f.project.id])?.revision)
    .toBe(f.project.revision + (outcome === "success" ? 1 : 0));
  expect(f.query.getQueryData(["project", f.other.id])).toEqual(f.other);
});

it("retires held designation across numerical preview entry and Cancel in one batch", async () => {
  const f = await setup(), held = deferred<Project>();
  const designate = vi.spyOn(ligandApi, "designate").mockReturnValue(held.promise);
  let saving!: ReturnType<Controls["onDesignate"]>;
  act(() => { saving = seen.controls!.onDesignate(f.entry, "candidate", "inventory"); });
  await waitFor(() => expect(designate).toHaveBeenCalledOnce());
  const inspector = seen.inspector!;
  const transform: CoordinateTransform = { entry_id: f.entry.id, scope: "structure", selection: useSelectionStore.getState().selection,
    translation: [1, 0, 0], rotation_degrees: [0, 0, 0], pivot_mode: "custom", pivot: [0, 0, 0] };
  let result: void | string;
  await act(async () => {
    await inspector.onPreviewTransform!(transform);
    inspector.onClearTransformPreview!();
    held.resolve({ ...f.project, revision: f.project.revision + 1 }); result = await saving;
  });
  expect(result!).toBe("superseded");
  expect(screen.queryByText("Change stored locally.")).toBeNull();
});

it("does not close the real chooser from an older acknowledgement than current cached state", async () => {
  const f = await setup(), held = deferred<Project>();
  const designate = vi.spyOn(ligandApi, "designate").mockReturnValue(held.promise);
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  fireEvent.click(await screen.findByRole("radio"));
  fireEvent.click(screen.getByRole("button", { name: "Use ligand" }));
  await waitFor(() => expect(designate).toHaveBeenCalledOnce());
  const newer = { ...f.project, revision: f.project.revision + 2 };
  act(() => { f.query.setQueryData(["project", f.project.id], newer); });
  await act(async () => { held.resolve({ ...f.project, revision: f.project.revision + 1 }); await held.promise; });
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("The project changed while saving. Review the current ligand choice.");
  expect(f.query.getQueryData(["project", f.project.id])).toEqual(newer);
});

it("preserves a new chooser and its selected radio after a retired success", async () => {
  const f = await setup(), held = deferred<Project>();
  const designate = vi.spyOn(ligandApi, "designate").mockReturnValue(held.promise);
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  fireEvent.click(await screen.findByRole("radio"));
  fireEvent.click(screen.getByRole("button", { name: "Use ligand" }));
  await waitFor(() => expect(designate).toHaveBeenCalledOnce());
  act(() => leaveAndReturn(f.other, f.project));
  await act(async () => { held.resolve({ ...f.project, revision: f.project.revision + 1 }); await held.promise; });
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByRole("radio")).toBeChecked();
  expect(screen.queryByText("Change stored locally.")).toBeNull();
});

it("accepts current success and closes the real chooser while stopping acquisition without losing targets", async () => {
  const f = await setup();
  const session = seen.workspace!.measurementSession!;
  act(() => { session.open(); session.useSelection([1, 2].map(atom_id => ({ structure_id: f.entry.id, atom_id }))); });
  const targets = session.snapshot().slots, selection = useSelectionStore.getState().selection;
  const designate = vi.spyOn(ligandApi, "designate").mockResolvedValue({ ...f.project, revision: f.project.revision + 1,
    entries: [{ ...f.entry, ligand_designation: { ...f.entry.ligand_designation, status: "cleared" } }] });
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  expect(session.snapshot().acquiring).toBe(false); expect(session.snapshot().slots).toEqual(targets);
  fireEvent.click(await screen.findByRole("radio"));
  fireEvent.click(screen.getByRole("button", { name: "Use ligand" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(designate).toHaveBeenCalledOnce();
  expect(useSelectionStore.getState().selection).toBe(selection);
  expect(f.query.getQueryData<Project>(["project", f.project.id])?.revision).toBe(f.project.revision + 1);
});

it("retires quiet legacy errors across same-batched project ABA", async () => {
  const held = deferred<Project>();
  const resolve = vi.spyOn(ligandApi, "resolve").mockReturnValue(held.promise);
  const f = await setup(true);
  await waitFor(() => expect(resolve).toHaveBeenCalledOnce());
  resolve.mockImplementation(() => new Promise(() => undefined));
  act(() => leaveAndReturn(f.other, f.project));
  await act(async () => { held.reject(new Error("Retired legacy failure")); await held.promise.catch(() => undefined); });
  expect(screen.queryByText("Retired legacy failure")).toBeNull();
});


it("rechecks at dispatch after preflight side effects synchronously change project visits", async () => {
  const f = await setup(), designate = vi.spyOn(ligandApi, "designate");
  let armed = true;
  const stop = useMinimizationStore.subscribe(() => {
    if (!armed) return;
    armed = false; leaveAndReturn(f.other, f.project);
  });
  try {
    await act(async () => {
      await expect(seen.controls!.onDesignate(f.entry, "candidate", "inventory")).rejects.toThrow("context changed");
    });
  } finally { stop(); }
  expect(armed).toBe(false);
  expect(designate).not.toHaveBeenCalled();
  expect(screen.queryByText("Change stored locally.")).toBeNull();
});

it.each(["source", "navigation", "editing preview"] as const)("retires retained manual ownership through batched %s ABA", async transition => {
  const f = await setup(), old = seen.controls!, designate = vi.spyOn(ligandApi, "designate");
  act(() => {
    if (transition === "source") {
      f.query.setQueryData(["project", f.project.id], { ...f.project, entries: [{ ...f.entry, current_artifact_id: "replacement" }] });
      f.query.setQueryData(["project", f.project.id], f.project);
    } else if (transition === "navigation") {
      useNavigationStore.getState().inspect(f.project.id, "another-entry");
      useNavigationStore.getState().inspect(f.project.id, f.entry.id);
    } else {
      useEditingStore.getState().setRotationDraft({ context: "current", open: true, movingEndpointId: 1, angle: "45" });
      useEditingStore.getState().setRotationDraft(null);
    }
  });
  await expect(old.onDesignate(f.entry, "candidate", "inventory")).rejects.toThrow("context changed");
  expect(designate).not.toHaveBeenCalled();
});

it("never retries legacy resolution after a held conflict reread is retired", async () => {
  const first = deferred<Project>(), held = deferred<Project>();
  const resolve = vi.spyOn(ligandApi, "resolve").mockReturnValueOnce(first.promise);
  // Install the spy before App captures its read port, then independently
  // release the invalidation fetch and hold only the conflict reread.
  const originalGet = projectApi.get;
  const get = vi.spyOn(projectApi, "get").mockImplementation(originalGet);
  const f = await setup(true);
  await waitFor(() => expect(resolve).toHaveBeenCalledOnce());
  get.mockClear().mockResolvedValue(f.project)
    .mockResolvedValueOnce(f.project).mockReturnValueOnce(held.promise);
  await act(async () => { first.reject(new ApiError(409, "revision_conflict", "Competing revision")); await first.promise.catch(() => undefined); });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  resolve.mockImplementation(() => new Promise(() => undefined));
  act(() => leaveAndReturn(f.other, f.project));
  await act(async () => { held.resolve({ ...f.project, revision: f.project.revision + 2 }); await held.promise; });
  // A new open visit may start its own attempt, but the retired reread is never
  // published or used as the expected revision of a retry.
  expect(resolve.mock.calls.some(call => call[1] === f.project.revision + 2)).toBe(false);
  expect(f.query.getQueryData<Project>(["project", f.project.id])?.revision).toBe(f.project.revision);
  expect(screen.queryByText("Change stored locally.")).toBeNull();
});

it.each(["success", "failure"] as const)("keeps a reopened chooser and focus after old Use %s", async outcome => {
  const f = await setup(), held = deferred<Project>();
  const designate = vi.spyOn(ligandApi, "designate").mockReturnValue(held.promise);
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  fireEvent.click(await screen.findByRole("radio"));
  fireEvent.click(screen.getByRole("button", { name: "Use ligand" }));
  await waitFor(() => expect(designate).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  const heading = screen.getByRole("heading", { name: "Choose ligand of interest" });
  heading.focus();
  await act(async () => {
    if (outcome === "success") held.resolve({ ...f.project, revision: f.project.revision + 1 });
    else held.reject(new Error("Old chooser failure"));
    await held.promise.catch(() => undefined);
  });
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(heading).toHaveFocus();
  expect(screen.queryByText("Old chooser failure")).toBeNull();
  expect(screen.queryByText("Change stored locally.")).toBeNull();
  expect(screen.getByRole("button", { name: "Use ligand" })).toBeDisabled();
});

it.each(["success", "failure"] as const)("keeps a newly opened chooser after pending summary Clear %s", async outcome => {
  const f = await setup(), held = deferred<Project>();
  const designate = vi.spyOn(ligandApi, "designate").mockReturnValue(held.promise);
  fireEvent.click(screen.getByRole("button", { name: "Leave unassigned" }));
  await waitFor(() => expect(designate).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  await screen.findByRole("radio");
  await act(async () => {
    if (outcome === "success") held.resolve({ ...f.project, revision: f.project.revision + 1 });
    else held.reject(new Error("Old Clear failure"));
    await held.promise.catch(() => undefined);
  });
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.queryByText("Old Clear failure")).toBeNull();
  expect(screen.queryByText("Change stored locally.")).toBeNull();
});


it("qualifies editing pending synchronously before a retained callback can dispatch", async () => {
  const f = await setup(), old = seen.controls!, designate = vi.spyOn(ligandApi, "designate");
  await act(async () => {
    useEditingStore.getState().setPending(true);
    await expect(old.onDesignate(f.entry, "candidate", "inventory")).rejects.toThrow("context changed");
    useEditingStore.getState().setPending(false);
  });
  expect(designate).not.toHaveBeenCalled();
});

it.each(["editing", "minimization"] as const)("refuses %s work admitted between preflight and dispatch", async mode => {
  const f = await setup(), designate = vi.spyOn(ligandApi, "designate");
  let armed = true;
  const stop = useMinimizationStore.subscribe(() => {
    if (!armed) return;
    armed = false;
    if (mode === "editing") useEditingStore.getState().setPending(true);
    else {
      const current = useMinimizationStore.getState();
      current.patch(current.generation, { applying: true });
    }
  });
  try {
    await act(async () => {
      await expect(seen.controls!.onDesignate(f.entry, "candidate", "inventory")).rejects.toThrow("context changed");
    });
  } finally {
    stop();
    act(() => {
      useEditingStore.getState().setPending(false);
      const current = useMinimizationStore.getState(); current.patch(current.generation, { applying: false });
    });
  }
  expect(armed).toBe(false); expect(designate).not.toHaveBeenCalled();
});


it("completes one legacy baseline after StrictMode setup replay without stranding its queue", async () => {
  const held = deferred<Project>();
  const resolve = vi.spyOn(ligandApi, "resolve").mockReturnValue(held.promise);
  const f = await setup(true, true);
  await waitFor(() => expect(resolve).toHaveBeenCalledOnce());
  await waitFor(() => expect(f.query.isFetching()).toBe(0));
  await act(async () => { held.resolve({ ...f.project, revision: f.project.revision + 1,
    entries: [{ ...f.entry, ligand_designation: { ...f.entry.ligand_designation, status: "not_applicable",
      resolver_version: "ligand-instance-v3", assessed_at: "2026-11-17T00:00:00Z", assessed_revision: f.project.revision + 1 } }],
  }); await held.promise; });
  await waitFor(() => expect(f.query.getQueryData<Project>(["project", f.project.id])?.entries[0].ligand_designation.status).toBe("not_applicable"));
  expect(screen.queryByText(/The ligand context changed/)).toBeNull();
});


it("consumes ligand-modal and compact-inspector Escape separately while retaining the real measurement draft", async () => {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ ...matchMedia(query), matches: query === "(max-width: 840px)" }));
  seen.renderMeasurements = true;
  const f = await setup(), user = userEvent.setup();
  const session = seen.workspace!.measurementSession!;
  const selection = useSelectionStore.getState().selection;
  act(() => {
    session.open(); session.setKind("angle");
    expect(session.useSelection([3, 1, 2].map(atom_id => ({ structure_id: f.entry.id, atom_id })))).toBe(true);
    session.setName("Retained ordered angle"); session.pickInViewer();
  });
  const slots = session.snapshot().slots;
  const tool = screen.getByRole("dialog", { name: "Measurements" });
  await user.click(screen.getByRole("button", { name: "Inspector" }));
  const drawer = screen.getByRole("dialog", { name: "Inspector panel" });
  await user.click(within(drawer).getByRole("button", { name: "Choose" }));
  const ligand = screen.getByRole("dialog", { name: "Choose ligand of interest" });
  (await within(ligand).findByRole("radio")).focus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Choose ligand of interest" })).toBeNull();
  expect(drawer).toBeVisible();
  expect(within(drawer).getByRole("button", { name: "Choose" })).toHaveFocus();
  expect(session.snapshot()).toMatchObject({ open: true, acquiring: false, name: "Retained ordered angle", slots });
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Inspector panel" })).toBeNull();
  expect(tool).toBeVisible();
  expect(session.snapshot()).toMatchObject({ open: true, acquiring: false, name: "Retained ordered angle", slots });
  await waitFor(() => expect(screen.getByRole("button", { name: "Inspector" })).toHaveFocus());
  await user.click(within(tool).getByRole("button", { name: "Review targets" }));
  expect(within(tool).getByLabelText("Measurement name")).toHaveValue("Retained ordered angle");
  expect(session.snapshot().slots).toEqual([3, 1, 2].map(atom_id => ({ structure_id: f.entry.id, atom_id })));
  expect(useSelectionStore.getState().selection).toBe(selection);
});


it.each(["project ABA", "batched preview Cancel"] as const)("retires occurrence retry feedback through %s using the App owner", async transition => {
  const f = await setup(), user = userEvent.setup(), first = inventory(f.project);
  first.candidates[0].occurrence_reason = "occurrence_work_busy";
  const candidates = vi.spyOn(ligandApi, "candidates").mockResolvedValue(first);
  await user.click(screen.getByRole("button", { name: "Choose" })); await screen.findByRole("radio");
  const held = deferred<LigandCandidatesRead>();
  candidates.mockReturnValueOnce(held.promise);
  await user.click(screen.getByRole("button", { name: "Retry counts" }));
  const heading = screen.getByRole("heading", { name: "Choose ligand of interest" });
  if (transition === "project ABA") act(() => leaveAndReturn(f.other, f.project));
  else {
    const inspector = seen.inspector!;
    const transform: CoordinateTransform = { entry_id: f.entry.id, scope: "structure", selection: useSelectionStore.getState().selection,
      translation: [1, 0, 0], rotation_degrees: [0, 0, 0], pivot_mode: "custom", pivot: [0, 0, 0] };
    await act(async () => { await inspector.onPreviewTransform!(transform); inspector.onClearTransformPreview!(); });
  }
  heading.focus();
  const known = inventory(f.project);
  known.candidates[0] = { ...known.candidates[0], occurrence_count: 2,
    occurrence_basis: "qualified_representation_v1", occurrence_reason: null };
  await act(async () => { held.resolve(known); await held.promise; });
  expect(heading).toHaveFocus();
  expect(screen.queryByText("Occurrence counts updated.")).not.toBeInTheDocument();
});
