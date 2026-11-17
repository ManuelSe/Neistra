import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { molecularApi, projectApi } from "../api/client";
import type { AtomReference, Contact, Project, StructureProjection } from "../api/types";
import { ViewerMeasurements } from "../components/ViewerMeasurements";
import { MeasurementSession } from "../measurements/session";
import { emptySelection } from "../selection/selection";
import { useNavigationStore } from "../store/navigation";
import { useSelectionStore } from "../store/selection";
import { useWorkspaceStore } from "../store/workspace";
import { structureQueryKey, structureQueryOptions } from "../structures/query";
import { componentHierarchy, molecularEntry, molecularProject, proteinStructure } from "./molecular-fixtures";

const ref = (structure_id: string, atom_id = 1): AtomReference => ({ structure_id, atom_id });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup() {
  const entries = ["a", "b", "c", "d", "e"].map(id => ({ ...molecularEntry(id, id, "ligand"), visible: false, locked: true }));
  const project = molecularProject(entries), query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const payloads = new Map<string, StructureProjection>();
  const points: [number, number, number][] = [[1, 0, 0], [0, 0, 0], [0, 1, 0], [0, 1, 1], [2, 2, 2]];
  entries.forEach((entry, i) => {
    const structure = proteinStructure(); structure.atoms[0] = { ...structure.atoms[0], coordinates: points[i] };
    entry.atom_ids = structure.atoms.map(atom => atom.id); entry.atom_count = structure.atoms.length;
    const payload: StructureProjection = { entry_id: entry.id, artifact_id: entry.current_artifact_id!, structure,
      hierarchy: componentHierarchy(structure), viewer: { format: "sdf", data: "fixture" } };
    payloads.set(entry.id, payload); query.setQueryData(structureQueryKey(project.id, entry.id, entry.current_artifact_id), payload);
  });
  project.measurements = [{ id: "saved", name: "Saved torsion", kind: "dihedral", visible: true,
    atom_references: ["a", "b", "c", "d"].map(id => ref(id)), warnings: [], created_at: project.created_at, modified_at: project.modified_at }];
  query.setQueryData(["project", project.id], project);
  useWorkspaceStore.setState({ activeProjectId: project.id }); useSelectionStore.getState().setProject(project.id);
  useNavigationStore.getState().setProject(project.id);
  const session = new MeasurementSession({
    context: () => ({ project: query.getQueryData<Project>(["project", project.id]), activeProjectId: useWorkspaceStore.getState().activeProjectId,
      selectionProjectId: useSelectionStore.getState().projectId, projectEpoch: useSelectionStore.getState().projectEpoch, paused: false, busy: false }),
    structures: references => new Map(references.flatMap(reference => {
      const current = query.getQueryData<Project>(["project", project.id])?.entries.find(entry => entry.id === reference.structure_id);
      const source = query.getQueryData<StructureProjection>(structureQueryKey(project.id, reference.structure_id, current?.current_artifact_id));
      return source ? [[reference.structure_id, source.structure] as const] : [];
    })), create: () => Promise.resolve("current"),
  });
  session.open(); const select = vi.fn();
  const content = (current: Project, paused = false) => <QueryClientProvider client={query}><Tooltip.Provider>
    <ViewerMeasurements session={session} project={current} sceneAvailable={false} busy={false}
      inspection={{ projectId: current.id, viewer: undefined, sources: [], selection: emptySelection(), order: null,
        structures: new Map(), entries: current.entries, paused, onOrder: vi.fn() }}
      onUpdate={() => Promise.resolve()} onDelete={() => Promise.resolve()} onSelect={select} onReturnFocus={vi.fn()} />
  </Tooltip.Provider></QueryClientProvider>;
  const view = render(content(project));
  const count = (id: string, artifact = `current-${id}`) => query.getQueryCache().find({ queryKey: structureQueryKey(project.id, id, artifact), exact: true })?.getObserversCount() ?? 0;
  return { project, query, payloads, session, select, view, content, count };
}

it("releases actual draft source observers from four to two to zero while preserving another consumer", async () => {
  const f = setup();
  const external = new QueryObserver(f.query, structureQueryOptions(f.project.id, "a", "current-a")); const release = external.subscribe(() => undefined);
  try {
    act(() => { f.session.setKind("dihedral"); f.session.useSelection(["a", "b", "c", "d"].map(id => ref(id))); });
    await waitFor(() => expect(["a", "b", "c", "d"].map(id => f.count(id))).toEqual([2, 1, 1, 1]));
    act(() => { f.session.setKind("distance"); f.session.useSelection([ref("a"), ref("b")]); });
    await waitFor(() => expect(["a", "b", "c", "d"].map(id => f.count(id))).toEqual([2, 1, 0, 0]));
    act(() => f.session.remove(1));
    await waitFor(() => expect(["a", "b", "c", "d"].map(id => f.count(id))).toEqual([2, 0, 0, 0]));
    act(() => f.session.close());
    await waitFor(() => expect(["a", "b", "c", "d"].map(id => f.count(id))).toEqual([1, 0, 0, 0]));
  } finally { release(); }
});

it("releases the one expanded record's four observers on collapse and retires replaced source keys", async () => {
  const f = setup(), user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Saved measurements/ }));
  await user.click(screen.getByRole("button", { name: "Inspect measurement Saved torsion" }));
  await waitFor(() => expect(["a", "b", "c", "d"].map(id => f.count(id))).toEqual([1, 1, 1, 1]));
  const replacement = { ...f.project, revision: f.project.revision + 1, entries: f.project.entries.map(entry => entry.id === "a" ? { ...entry, current_artifact_id: "new-a" } : entry) };
  act(() => {
    f.query.setQueryData(["project", f.project.id], replacement);
    f.query.setQueryData(structureQueryKey(f.project.id, "a", "new-a"), { ...f.payloads.get("a")!, artifact_id: "new-a" });
    f.view.rerender(f.content(replacement));
  });
  await waitFor(() => { expect(f.count("a")).toBe(0); expect(f.count("a", "new-a")).toBe(1); });
  await user.click(screen.getByRole("button", { name: /^Saved measurements/ }));
  await waitFor(() => expect([f.count("a", "new-a"), ...["b", "c", "d"].map(id => f.count(id))]).toEqual([0, 0, 0, 0]));
  expect(replacement.entries.every(entry => !entry.visible && entry.locked)).toBe(true);
});

it("synchronously retires contact row actions on disclosure collapse before React unmount and admits a new disclosure owner", async () => {
  const f = setup(), user = userEvent.setup();
  const rows: Contact[] = [{ atom_1: ref("a", 1), atom_2: ref("a", 2), distance: 2.4 }];
  const api = vi.spyOn(projectApi, "contacts").mockResolvedValue(rows);
  act(() => useNavigationStore.getState().inspect(f.project.id, "a"));
  await user.click(screen.getByRole("button", { name: "Close contacts" }));
  await user.click(screen.getByRole("button", { name: "Find contacts" }));
  const row = await screen.findByRole("button", { name: "Atoms 1–2 2.40 Å" });
  const collapse = screen.getByRole("button", { name: "Close contacts" });
  act(() => { fireEvent.click(collapse); fireEvent.click(row); });
  expect(f.select).not.toHaveBeenCalled();
  expect(api.mock.calls[0][4]?.signal?.aborted).toBe(true);
  await user.click(screen.getByRole("button", { name: "Close contacts" }));
  await user.click(screen.getByRole("button", { name: "Find contacts" }));
  await user.click(await screen.findByRole("button", { name: "Atoms 1–2 2.40 Å" }));
  expect(f.select).toHaveBeenCalledExactlyOnceWith([rows[0].atom_1, rows[0].atom_2]);
});

it("aborts a held contact request at collapse and discards its completion after reopening", async () => {
  const f = setup(), user = userEvent.setup(); let finish!: (rows: Contact[]) => void;
  const api = vi.spyOn(projectApi, "contacts").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  act(() => useNavigationStore.getState().inspect(f.project.id, "a"));
  await user.click(screen.getByRole("button", { name: "Close contacts" }));
  await user.click(screen.getByRole("button", { name: "Find contacts" }));
  await user.click(screen.getByRole("button", { name: "Close contacts" }));
  expect(api.mock.calls[0][4]?.signal?.aborted).toBe(true);
  await user.click(screen.getByRole("button", { name: "Close contacts" }));
  await act(async () => { finish([{ atom_1: ref("a", 1), atom_2: ref("a", 2), distance: 2.4 }]); await Promise.resolve(); });
  expect(screen.queryByRole("button", { name: /^Atoms/ })).toBeNull(); expect(api).toHaveBeenCalledOnce();
});

it("does not admit a search from a retained Find action after disclosure collapse in the same batch", async () => {
  const f = setup(), user = userEvent.setup(), api = vi.spyOn(projectApi, "contacts").mockResolvedValue([]);
  act(() => useNavigationStore.getState().inspect(f.project.id, "a"));
  await user.click(screen.getByRole("button", { name: "Close contacts" }));
  const find = screen.getByRole("button", { name: "Find contacts" });
  const collapse = screen.getByRole("button", { name: "Close contacts" });
  act(() => { fireEvent.click(collapse); fireEvent.click(find); });
  expect(api).not.toHaveBeenCalled();
});

it("retires contact rows and Find admission synchronously before compact viewer picking", async () => {
  const f = setup(), user = userEvent.setup();
  const rows: Contact[] = [{ atom_1: ref("a", 1), atom_2: ref("a", 2), distance: 2.4 }];
  const api = vi.spyOn(projectApi, "contacts").mockResolvedValue(rows);
  act(() => useNavigationStore.getState().inspect(f.project.id, "a"));
  await user.click(screen.getByRole("button", { name: "Close contacts" }));
  await user.click(screen.getByRole("button", { name: "Find contacts" }));
  const row = await screen.findByRole("button", { name: "Atoms 1–2 2.40 Å" });
  const find = screen.getByRole("button", { name: "Find contacts" });
  const compact = screen.getByRole("button", { name: "Pick in viewer" });
  act(() => { fireEvent.click(compact); fireEvent.click(row); fireEvent.click(find); });
  expect(f.select).not.toHaveBeenCalled(); expect(api).toHaveBeenCalledOnce();
  expect(api.mock.calls[0][4]?.signal?.aborted).toBe(true);
  expect(f.session.snapshot().minimized).toBe(true);
});


it("explains an expanded saved angle after committed source movement and clears the reason after Undo", async () => {
  const f = setup(), user = userEvent.setup();
  const measurement = { ...f.project.measurements[0], name: "Saved angle", kind: "angle" as const,
    atom_references: ["a", "b", "c"].map(id => ref(id)) };
  const original = { ...f.project, measurements: [measurement] };
  act(() => { f.query.setQueryData(["project", original.id], original); f.view.rerender(f.content(original)); });
  await user.click(screen.getByRole("button", { name: /^Saved measurements/ }));
  const summary = screen.getByRole("button", { name: "Inspect measurement Saved angle" });
  await user.click(summary);
  await waitFor(() => expect(summary).toHaveTextContent("90.0°"));
  const name = screen.getByRole("textbox", { name: "Name for Saved angle" });
  await user.clear(name); await user.type(name, "Retained rename");
  const movedSource = structuredClone(f.payloads.get("a")!);
  movedSource.artifact_id = "moved-a"; movedSource.structure.atoms[0].coordinates = [0, 0, 0];
  const moved = { ...original, revision: original.revision + 1,
    entries: original.entries.map(entry => entry.id === "a" ? { ...entry, current_artifact_id: "moved-a" } : entry) };
  act(() => {
    f.query.setQueryData(structureQueryKey(original.id, "a", "moved-a"), movedSource);
    f.query.setQueryData(["project", original.id], moved); f.view.rerender(f.content(moved));
  });
  const reason = "Measurement geometry is undefined or outside numerical limits.";
  expect(await screen.findByText(reason)).toBeVisible();
  expect(summary).toHaveTextContent("Unavailable"); expect(name).toHaveValue("Retained rename");
  expect(screen.getByRole("button", { name: "Select participants" })).toBeEnabled();
  expect(moved.measurements[0].atom_references).toEqual(measurement.atom_references);
  const undone = { ...original, revision: moved.revision + 1 };
  act(() => { f.query.setQueryData(["project", original.id], undone); f.view.rerender(f.content(undone)); });
  await waitFor(() => expect(summary).toHaveTextContent("90.0°"));
  expect(screen.queryByText(reason)).toBeNull(); expect(name).toHaveValue("Retained rename");
  expect(undone.measurements[0].atom_references).toEqual(measurement.atom_references);
});

it.each([false, true])("explains source failure and retries on reopen with retained complete data=%s", async retained => {
  const f = setup(), user = userEvent.setup(), source = f.payloads.get("a")!;
  const key = structureQueryKey(f.project.id, "a", "current-a");
  if (!retained) f.query.removeQueries({ queryKey: key, exact: true });
  let fail!: (error: Error) => void, calls = 0;
  const held = new Promise<StructureProjection>((_resolve, reject) => { fail = reject; });
  vi.spyOn(molecularApi, "structure").mockImplementation((_project, id) => {
    if (id !== "a") return Promise.resolve(f.payloads.get(id)!);
    calls++; return calls === 1 ? held : Promise.resolve(source);
  });
  const external = new QueryObserver(f.query, structureQueryOptions(f.project.id, "a", "current-a"));
  const release = external.subscribe(() => undefined);
  try {
    await user.click(screen.getByRole("button", { name: /^Saved measurements/ }));
    const summary = screen.getByRole("button", { name: "Inspect measurement Saved torsion" });
    await user.click(summary);
    let refreshing: Promise<unknown> | undefined;
    if (retained) {
      expect(summary).not.toHaveTextContent("Unavailable");
      act(() => { refreshing = f.query.fetchQuery({ ...structureQueryOptions(f.project.id, "a", "current-a"), staleTime: 0 }).catch(() => undefined); });
    } else expect(await screen.findByText("Loading current target atom information…")).toBeVisible();
    await waitFor(() => expect(calls).toBe(1));
    await act(async () => { fail(new Error("Transient source failure")); await refreshing; });
    const reason = "Target atom information could not be loaded. Close and reopen this record to retry.";
    expect(await screen.findByText(reason)).toBeVisible();
    expect(summary).toHaveTextContent("Unavailable"); expect(f.count("a")).toBe(2);
    if (retained) expect(f.query.getQueryData(key)).toEqual(source);
    await user.click(summary);
    await waitFor(() => expect(f.count("a")).toBe(1));
    await user.click(summary);
    await waitFor(() => { expect(calls).toBe(2); expect(summary).not.toHaveTextContent("Unavailable"); });
    expect(screen.queryByText(reason)).toBeNull(); expect(f.count("a")).toBe(2);
    expect(f.project.measurements[0].atom_references).toEqual(["a", "b", "c", "d"].map(id => ref(id)));
  } finally { release(); }
});


it("prioritizes preview status, explains a missing target and restores saved value without changing references", async () => {
  const f = setup(), user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Saved measurements/ }));
  const summary = screen.getByRole("button", { name: "Inspect measurement Saved torsion" });
  await user.click(summary);
  await waitFor(() => expect(summary).toHaveTextContent("-90.0°"));
  act(() => { f.view.rerender(f.content(f.project, true)); });
  expect(await within(screen.getByRole("group", { name: "Actions for Saved torsion" })).findByText("Geometry unavailable during preview.")).toBeVisible();
  expect(summary).toHaveTextContent("Unavailable");
  const missing = { ...f.project, revision: f.project.revision + 1, entries: f.project.entries.filter(entry => entry.id !== "a") };
  act(() => { f.query.setQueryData(["project", f.project.id], missing); f.view.rerender(f.content(missing, true)); });
  expect(within(screen.getByRole("group", { name: "Actions for Saved torsion" })).getByText("Geometry unavailable during preview.")).toBeVisible();
  act(() => { f.view.rerender(f.content(missing)); });
  expect(await screen.findByText("A target structure is no longer available.")).toBeVisible();
  expect(summary).toHaveTextContent("Unavailable");
  await user.click(screen.getByRole("button", { name: "Select participants" }));
  expect(f.select).not.toHaveBeenCalled();
  expect(missing.measurements[0].atom_references).toEqual(["a", "b", "c", "d"].map(id => ref(id)));
  const restored = { ...f.project, revision: missing.revision + 1 };
  act(() => { f.query.setQueryData(["project", f.project.id], restored); f.view.rerender(f.content(restored)); });
  await waitFor(() => expect(summary).toHaveTextContent("-90.0°"));
  expect(screen.queryByText("A target structure is no longer available.")).toBeNull();
  expect(restored.measurements[0].atom_references).toEqual(missing.measurements[0].atom_references);
});
