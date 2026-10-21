import { useMinimizationPreview } from "../minimization/useMinimizationPreview";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { jobApi, minimizationApi, quickMinimizationApi } from "../api/client";
import type { Job, MinimizationProposal, Selection, Project, QuickMinimizationProposal } from "../api/types";
import { calculationComponents, minimizationRequest } from "../minimization/context";
import { coordinatePatches } from "../minimization/preview";
import { useMinimizationStore } from "../minimization/store";
import { useMinimization } from "../minimization/useMinimization";
import { useMinimizationShortcut } from "../minimization/useMinimizationShortcut";
import { useWorkspaceStore } from "../store/workspace";
import { molecularEntry, molecularProject, proteinStructure } from "./molecular-fixtures";

const selection: Selection = { schema_version: 1, granularity: "atom", source: "inspector", atoms: [{ structure_id: "protein", atom_id: 1 }] };
const project = () => molecularProject([molecularEntry("protein", "Protein", "protein"), { ...molecularEntry("ligand", "Hidden ligand", "ligand"), visible: false, locked: true }]);
function sources() {
  const protein = proteinStructure();
  protein.active_conformer_id = 7;
  // Sparse canonical bonds must not crop a polymer chain.
  protein.atoms[2].coordinates = [100, 0, 0];
  const ligand = proteinStructure();
  ligand.residues = []; ligand.chains = []; ligand.atoms = [ligand.atoms[0]];
  ligand.atoms[0].residue_id = null;
  return new Map([["protein", { artifactId: "current-protein", structure: protein }], ["ligand", { artifactId: "current-ligand", structure: ligand }]]);
}
function proposal(): MinimizationProposal {
  return { schema_version: 1, job_id: "job", proposal_sha256: "digest", applicable: true, unavailable_reason: null,
    entries: [{ entry_id: "protein", conformer_id: 7, atom_ids: [1], coordinates: [[0, 1, 0]] }],
    report: { schema_version: 1, model: "amber-local-v1", outcome: "converged", reason: "Converged", parameters: { schema_version: 1, model: "amber-local-v1", mode: "isolated", selection, captured_inputs: [], max_iterations: 500 },
      units: {}, initial_energy: 10, final_energy: 1, maximum_gradient: 1, gradient_tolerance: 10, iterations: 3, evaluations: 5, maximum_displacement: 1, rms_displacement: 1, residual_clashes: 0, movable_count: 1, fixed_count: 2, toolchain: {}, warnings: [], elapsed_seconds: 1 } };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); useMinimizationStore.getState().dismiss(); useMinimizationStore.getState().setProject(null); });
it("includes full chains independent of display and discovers hidden fixed context without choosing it", () => {
  const inputs = sources(); const p = project();
  const components = calculationComponents(p, inputs, selection);
  expect(components[0].atomIds).toEqual([1, 2, 3]);
  expect(components[1]).toMatchObject({ hidden: true, nearby: true, mandatory: false });
  const isolated = minimizationRequest(p, selection, inputs, components, new Set(), "isolated", 500);
  expect(isolated.context).toEqual([]); expect(isolated.conformers).toEqual({ protein: 7 });
  const environment = minimizationRequest(p, selection, inputs, components, new Set([components[1].key]), "environment", 500);
  expect(environment.context).toEqual([{ entry_id: "ligand", atom_ids: [1] }, { entry_id: "protein", atom_ids: [1, 2, 3] }]);
  expect(environment.conformers).toEqual({ protein: 7, ligand: 1 });
  p.entries[0].locked = true;
  expect(() => minimizationRequest(p, selection, inputs, components, new Set(), "isolated", 500)).toThrow("Unlock");
});
it("refuses stale inputs, absent atoms, invalid iterations and implicit multi-component isolation", () => {
  const p = project(), inputs = sources(), components = calculationComponents(p, inputs, selection);
  p.entries[0].current_artifact_id = "changed";
  expect(() => minimizationRequest(p, selection, inputs, components, new Set(), "isolated", 500)).toThrow("source changed");
  for (const iterations of [0, 2001, NaN, 1.5]) expect(() => minimizationRequest(project(), selection, inputs, components, new Set(), "isolated", iterations)).toThrow("iterations");
  const both = { ...selection, atoms: [...selection.atoms, { structure_id: "ligand", atom_id: 1 }] };
  expect(() => minimizationRequest(project(), both, inputs, calculationComponents(p, inputs, both), new Set(), "isolated", 500)).toThrow("environment mode");
  expect(() => minimizationRequest(project(), { ...selection, atoms: [{ structure_id: "protein", atom_id: 999 }] }, inputs, components, new Set(), "isolated", 500)).toThrow("unavailable");
});
it("builds disposable preview geometry without mutating sources and refuses malformed or incomplete proposals", () => {
  const inputs = sources(), before = JSON.stringify([...inputs]); const result = proposal();
  expect(coordinatePatches(result.report.parameters.selection, result.entries, inputs)).toEqual([{ entry_id: "protein", artifact_id: "current-protein", atom_ids: [1], coordinates: [[0, 1, 0]] }]);
  expect(JSON.stringify([...inputs])).toBe(before);
  result.entries[0].coordinates[0][0] = Infinity;
  expect(() => coordinatePatches(result.report.parameters.selection, result.entries, inputs)).toThrow("captured selection");
  result.entries = []; expect(() => coordinatePatches(result.report.parameters.selection, result.entries, inputs)).toThrow("omits");
  result.entries = [...proposal().entries, ...proposal().entries]; expect(() => coordinatePatches(result.report.parameters.selection, result.entries, inputs)).toThrow("captured selection");
  result.entries = proposal().entries; result.entries[0].conformer_id = 1; expect(() => coordinatePatches(result.report.parameters.selection, result.entries, inputs)).toThrow("conformer");
});
it("captures selection and invalidates late callbacks on discard, project switch and ABA", () => {
  const store = useMinimizationStore.getState(), mutable = structuredClone(selection);
  const generation = store.begin(project(), mutable);
  mutable.atoms[0].atom_id = 99;
  expect(useMinimizationStore.getState().draft?.selection.atoms[0].atom_id).toBe(1);
  store.dismiss(); store.patch(generation, { preview: true, open: true });
  expect(useMinimizationStore.getState().open).toBe(false);
  store.setProject("other"); store.setProject("project-1"); store.patch(generation, { open: true });
  expect(useMinimizationStore.getState().open).toBe(false);
});
it("handles Ctrl+M once while respecting typing, composition modifiers, repeated keys and modal ownership", () => {
  const run = vi.fn();
  function Shortcut() { useMinimizationShortcut(true, run); return <input aria-label="Typing" />; }
  const view = render(<Shortcut />);
  fireEvent.keyDown(window, { key: "m", ctrlKey: true }); expect(run).toHaveBeenCalledTimes(1);
  for (const extra of [{ repeat: true }, { isComposing: true }, { shiftKey: true }, { altKey: true }, { metaKey: true }]) fireEvent.keyDown(window, { key: "m", ctrlKey: true, ...extra });
  fireEvent.keyDown(view.getByRole("textbox"), { key: "m", ctrlKey: true });
  const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); document.body.append(dialog);
  fireEvent.keyDown(window, { key: "m", ctrlKey: true }); dialog.remove();
  expect(run).toHaveBeenCalledTimes(1); view.unmount();
  fireEvent.keyDown(window, { key: "m", ctrlKey: true }); expect(run).toHaveBeenCalledTimes(1);
});
function workflow() {
  const p = project(); useWorkspaceStore.setState({ activeProjectId: p.id }); useMinimizationStore.getState().setProject(p.id);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const commit = vi.fn((operation: () => Promise<Project>) => operation());
  const hook = renderHook(() => { const w = useMinimization(p, selection, commit); return { ...w, ...useMinimizationPreview(p, w) }; }, { wrapper });
  return { ...hook, client, commit, p };
}
it("Ctrl+M submits quick work exactly once and never applies cancelled work", async () => {
  const source = vi.spyOn(minimizationApi, "source").mockResolvedValue(sources().get("protein")!.structure);
  vi.spyOn(quickMinimizationApi, "capabilities").mockResolvedValue({ model: "quick-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} });
  const submit = vi.spyOn(quickMinimizationApi, "submit").mockResolvedValue({ id: "job", status: "cancelled" } as Job);
  const apply = vi.spyOn(quickMinimizationApi, "apply");
  const w = workflow();
  await act(async () => { const first = w.result.current.quick(); await w.result.current.quick(); await first; });
  expect(source).not.toHaveBeenCalled(); expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.calls[0][1]).toMatchObject({ mode: "automatic", selection, max_iterations: 500 });
  expect(submit.mock.calls[0][1]).not.toHaveProperty("context"); expect(submit.mock.calls[0][1]).not.toHaveProperty("conformers");
  expect(apply).not.toHaveBeenCalled(); expect(w.commit).not.toHaveBeenCalled();
  expect(w.result.current.state.jobId).toBe("job"); w.client.clear();
});
it("does not submit or resurrect the panel after capability discovery is discarded", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof quickMinimizationApi.capabilities>>) => void;
  vi.spyOn(quickMinimizationApi, "capabilities").mockImplementation(() => new Promise(done => { resolve = done; }));
  const submit = vi.spyOn(quickMinimizationApi, "submit"); const w = workflow();
  let pending!: Promise<void>;
  act(() => { pending = w.result.current.quick(); });
  await waitFor(() => expect(resolve).toBeDefined());
  act(() => w.result.current.dismiss());
  await act(async () => { resolve({ model: "quick-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} }); await pending; });
  expect(submit).not.toHaveBeenCalled(); expect(w.result.current.open).toBe(false); w.client.clear();
});
it("keeps a failed prerequisite as an inspectable setup and never submits it", async () => {
  vi.spyOn(minimizationApi, "source").mockResolvedValue(sources().get("protein")!.structure);
  vi.spyOn(quickMinimizationApi, "capabilities").mockResolvedValue({ model: "quick-local-v1", available: false, unavailable_reason: "Quick model disabled", prerequisites: [], scientific_limits: [], limits: {} });
  const submit = vi.spyOn(quickMinimizationApi, "submit"); const w = workflow();
  await act(async () => { await w.result.current.quick(); });
  expect(submit).not.toHaveBeenCalled(); expect(w.result.current.open).toBe(true);
  expect(w.result.current.error).toBe("Quick model disabled"); expect(w.result.current.state.draft).not.toBeNull();
  expect(w.result.current.state.loading).toBe(false); w.client.clear();
});
it("does not submit across a project switch during capability discovery", async () => {
  vi.spyOn(minimizationApi, "source").mockResolvedValue(sources().get("protein")!.structure);
  let finish!: () => void;
  vi.spyOn(quickMinimizationApi, "capabilities").mockImplementation(() => new Promise(resolve => { finish = () => resolve({ model: "quick-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} }); }));
  const submit = vi.spyOn(quickMinimizationApi, "submit"); const w = workflow();
  let pending!: Promise<void>; act(() => { pending = w.result.current.quick(); });
  await waitFor(() => expect(finish).toBeDefined());
  act(() => { useWorkspaceStore.setState({ activeProjectId: "other" }); useMinimizationStore.getState().setProject("other"); });
  await act(async () => { finish(); await pending; });
  expect(submit).not.toHaveBeenCalled(); expect(w.result.current.open).toBe(false); w.client.clear();
});

it("cancels a submission that returns after its session was discarded", async () => {
  vi.spyOn(minimizationApi, "source").mockResolvedValue(sources().get("protein")!.structure);
  vi.spyOn(quickMinimizationApi, "capabilities").mockResolvedValue({ model: "quick-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} });
  let finish!: (job: Job) => void;
  vi.spyOn(quickMinimizationApi, "submit").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const cancel = vi.spyOn(jobApi, "cancel").mockResolvedValue({ id: "late", status: "cancelled" } as Job);
  const w = workflow(); let pending!: Promise<void>;
  act(() => { pending = w.result.current.quick(); });
  await waitFor(() => expect(finish).toBeDefined());
  act(() => w.result.current.dismiss());
  await act(async () => { finish({ id: "late", status: "queued" } as Job); await pending; });
  expect(cancel).toHaveBeenCalledWith("late"); expect(w.result.current.open).toBe(false);
  expect(w.commit).not.toHaveBeenCalled(); w.client.clear();
});

it("shows live selected-row patches and clears immediately while cancellation is pending", async () => {
  vi.spyOn(minimizationApi, "source").mockResolvedValue(sources().get("protein")!.structure);
  vi.spyOn(quickMinimizationApi, "capabilities").mockResolvedValue({ model: "quick-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} });
  const job = { id: "live", status: "running", provenance: { project_revision: project().revision } } as unknown as Job;
  vi.spyOn(quickMinimizationApi, "submit").mockResolvedValue(job); vi.spyOn(jobApi, "get").mockResolvedValue(job);
  const frame = { schema_version: 1 as const, job_id: "live", status: "running", capture_sha256: "capture", selection,
    sources: [{ entry_id: "protein", artifact_id: "current-protein", conformer_id: 7 }],
    frame: { sequence: 1, iteration: 1, published_at: Date.now() / 1000, entries: proposal().entries }, unavailable_reason: null };
  vi.spyOn(quickMinimizationApi, "live").mockResolvedValue(frame);
  let finish!: (job: Job) => void;
  vi.spyOn(jobApi, "cancel").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const w = workflow(); await act(async () => { await w.result.current.quick(); });
  await waitFor(() => expect(w.result.current.patches).toHaveLength(1));
  expect(w.result.current.patches[0].atom_ids).toEqual([1]); expect(w.commit).not.toHaveBeenCalled();
  let pending!: Promise<void>; act(() => { pending = w.result.current.cancel(); });
  expect(w.result.current.patches).toEqual([]);
  await act(async () => { finish({ ...job, status: "cancelled" }); await pending; });
  expect(w.result.current.patches).toEqual([]); w.client.clear();
});

it("keeps job/frame reads and Cancel presentation out of the App command subscription", async () => {
  const p = project(); useWorkspaceStore.setState({ activeProjectId: p.id }); useMinimizationStore.getState().setProject(p.id);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(minimizationApi, "source").mockResolvedValue(sources().get("protein")!.structure);
  vi.spyOn(quickMinimizationApi, "capabilities").mockResolvedValue({ model: "quick-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} });
  const job = { id: "local-read", status: "running", provenance: { project_revision: p.revision } } as unknown as Job;
  vi.spyOn(quickMinimizationApi, "submit").mockResolvedValue(job); vi.spyOn(jobApi, "get").mockResolvedValue(job);
  let sequence = 1;
  vi.spyOn(quickMinimizationApi, "live").mockImplementation(() => Promise.resolve({ schema_version: 1, job_id: job.id, status: "running", capture_sha256: "capture", selection,
    sources: [{ entry_id: "protein", artifact_id: "current-protein", conformer_id: 7 }], frame: { sequence, iteration: sequence, published_at: Date.now() / 1000, entries: proposal().entries }, unavailable_reason: null }));
  vi.spyOn(jobApi, "cancel").mockImplementation(() => new Promise(() => {}));
  let parentRenders = 0, commands!: ReturnType<typeof useMinimization>, view!: ReturnType<typeof useMinimizationPreview>;
  function Viewer({ workflow }: { workflow: ReturnType<typeof useMinimization> }) { view = useMinimizationPreview(p, workflow); return null; }
  function AppCommands() { parentRenders++; commands = useMinimization(p, selection, vi.fn()); return <Viewer workflow={commands} />; }
  render(<QueryClientProvider client={client}><AppCommands /></QueryClientProvider>);
  const initialRenders = parentRenders;
  await act(async () => { await commands.quick(); });
  expect(parentRenders).toBe(initialRenders);
  await waitFor(() => expect(view.patches).toHaveLength(1));
  const before = parentRenders, firstPatches = view.patches;
  await act(async () => { await client.invalidateQueries({ queryKey: ["minimization-live"] }); });
  expect(view.patches).toBe(firstPatches); // An unchanged latest snapshot does not rerender geometry.
  sequence = 2;
  await act(async () => { await client.invalidateQueries({ queryKey: ["minimization-live"] }); });
  await waitFor(() => expect(view.liveIteration).toBe(2));
  expect(parentRenders).toBe(before);
  sequence = 1;
  await act(async () => { await client.invalidateQueries({ queryKey: ["minimization-live"] }); });
  expect(view.liveIteration).toBe(2); // A delayed older response cannot revive an older pose.
  act(() => { void commands.cancel(); });
  expect(view.patches).toEqual([]); expect(parentRenders).toBe(before);
  client.clear();
});

function quickProposal(): QuickMinimizationProposal {
  const old = proposal();
  return { ...old, report: { ...old.report, schema_version: 1, model: "quick-local-v1", outcome: "improved", method: "MMFF94", coverage: "complete",
    assumptions: [], helper_count: 0, cap_count: 0, modeled_atoms: { protein: [1] }, timings: {}, termination_kind: "iteration_limit",
    parameters: { schema_version: 1, model: "quick-local-v1", requested_selection: selection, selection,
      captured_inputs: [{ entry_id: "protein", artifact_id: "current-protein", sha256: "a".repeat(64), conformer_id: 7, atom_ids: [1, 2, 3] }],
      mode: "automatic", context_entry_ids: [], expand_hydrogens: true, allow_repair: true, max_iterations: 500 } } };
}
function completedQuick() {
  vi.spyOn(quickMinimizationApi, "capabilities").mockResolvedValue({ model: "quick-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} });
  const job = { id: "job", job_type: "coordinates.quick_minimize", status: "completed", provenance: { project_revision: project().revision } } as unknown as Job;
  vi.spyOn(quickMinimizationApi, "submit").mockResolvedValue(job);
  vi.spyOn(jobApi, "get").mockResolvedValue(job);
  vi.spyOn(minimizationApi, "source").mockResolvedValue(sources().get("protein")!.structure);
  return job;
}
it("automatically applies a useful quick proposal once as an owning-session command", async () => {
  completedQuick();
  vi.spyOn(quickMinimizationApi, "proposal").mockResolvedValue(quickProposal());
  const apply = vi.spyOn(quickMinimizationApi, "apply").mockResolvedValue({ ...project(), revision: project().revision + 1 });
  const w = workflow();
  await act(async () => { await w.result.current.quick(); });
  await waitFor(() => expect(w.result.current.state.applied).toBe(true));
  expect(apply).toHaveBeenCalledExactlyOnceWith(w.p.id, "job", w.p.revision, "digest");
  expect(w.commit).toHaveBeenCalledOnce();
  expect(w.result.current.patches).toEqual([]);
  await act(async () => { await w.client.invalidateQueries({ queryKey: ["minimization-proposal"] }); });
  expect(apply).toHaveBeenCalledOnce(); w.client.clear();
});
it("Cancel disarms automatic publication even if a completed proposal returns later", async () => {
  const job = completedQuick();
  let finish!: (proposal: QuickMinimizationProposal) => void;
  vi.spyOn(quickMinimizationApi, "proposal").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  vi.spyOn(jobApi, "cancel").mockResolvedValue({ ...job, status: "completed" });
  const apply = vi.spyOn(quickMinimizationApi, "apply"); const w = workflow();
  await act(async () => { await w.result.current.quick(); });
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => { await w.result.current.cancel(); finish(quickProposal()); });
  await waitFor(() => expect(w.result.current.proposal).toBeDefined());
  expect(apply).not.toHaveBeenCalled(); expect(w.commit).not.toHaveBeenCalled(); w.client.clear();
});
it("inspecting a retained completed quick job never arms automatic publication", async () => {
  completedQuick(); vi.spyOn(quickMinimizationApi, "proposal").mockResolvedValue(quickProposal());
  const apply = vi.spyOn(quickMinimizationApi, "apply"); const w = workflow();
  act(() => useMinimizationStore.getState().inspect(w.p.id, "job"));
  await waitFor(() => expect(w.result.current.proposal).toBeDefined());
  expect(w.result.current.isQuick).toBe(true); expect(apply).not.toHaveBeenCalled(); w.client.clear();
});
it("quick settings submit exact masks and chosen hidden context independently of AMBER", async () => {
  vi.spyOn(quickMinimizationApi, "capabilities").mockResolvedValue({ model: "quick-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} });
  const submit = vi.spyOn(quickMinimizationApi, "submit").mockResolvedValue({ id: "settings", status: "cancelled" } as Job);
  const w = workflow();
  await act(async () => { await w.result.current.configure("quick"); });
  await act(async () => { await w.result.current.mode("environment"); });
  act(() => w.result.current.include("ligand", true));
  act(() => w.result.current.expandHydrogens(false));
  act(() => w.result.current.allowRepair(false));
  await act(async () => { await w.result.current.run(); });
  expect(submit.mock.calls[0][1]).toMatchObject({ mode: "environment", context_entry_ids: ["ligand"], expand_hydrogens: false, allow_repair: false });
  w.client.clear();
});

it("preserves the quick session across viewer remounts and cancels when App command ownership ends", async () => {
  const p = project(); useWorkspaceStore.setState({ activeProjectId: p.id }); useMinimizationStore.getState().setProject(p.id);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(quickMinimizationApi, "capabilities").mockResolvedValue({ model: "quick-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} });
  const job = { id: "owned", job_type: "coordinates.quick_minimize", status: "running", provenance: { project_revision: p.revision } } as unknown as Job;
  vi.spyOn(quickMinimizationApi, "submit").mockResolvedValue(job); vi.spyOn(jobApi, "get").mockResolvedValue(job);
  vi.spyOn(quickMinimizationApi, "live").mockResolvedValue({ schema_version: 1, job_id: job.id, status: "running", capture_sha256: null, selection: null, sources: [], frame: null, unavailable_reason: null });
  const cancel = vi.spyOn(jobApi, "cancel").mockResolvedValue({ ...job, status: "cancelled" });
  let commands!: ReturnType<typeof useMinimization>;
  function Viewer() { useMinimizationPreview(p, commands); return null; }
  function AppCommands({ viewer }: { viewer: boolean }) { commands = useMinimization(p, selection, vi.fn()); return viewer ? <Viewer /> : null; }
  const view = render(<QueryClientProvider client={client}><AppCommands viewer /></QueryClientProvider>);
  await act(async () => { await commands.quick(); });
  view.rerender(<QueryClientProvider client={client}><AppCommands viewer={false} /></QueryClientProvider>);
  expect(useMinimizationStore.getState().autoApply).toBe(true);
  view.rerender(<QueryClientProvider client={client}><AppCommands viewer /></QueryClientProvider>);
  expect(useMinimizationStore.getState().jobId).toBe(job.id);
  view.unmount();
  expect(useMinimizationStore.getState().autoApply).toBe(false);
  expect(cancel).toHaveBeenCalledWith(job.id); client.clear();
});

it("opening settings disarms a late completion before cancellation returns", async () => {
  const job = completedQuick();
  const running = { ...job, status: "running" } as Job;
  vi.mocked(quickMinimizationApi.submit).mockResolvedValue(running);
  vi.mocked(jobApi.get).mockResolvedValue(running);
  vi.spyOn(quickMinimizationApi, "live").mockResolvedValue({ schema_version: 1, job_id: job.id, status: "running", capture_sha256: null, selection: null, sources: [], frame: null, unavailable_reason: null });
  let cancelled!: (job: Job) => void;
  vi.spyOn(jobApi, "cancel").mockImplementation(() => new Promise(resolve => { cancelled = resolve; }));
  const apply = vi.spyOn(quickMinimizationApi, "apply");
  const w = workflow();
  await act(async () => { await w.result.current.quick(); });
  let pending!: Promise<void>;
  act(() => { pending = w.result.current.configure("quick"); });
  expect(useMinimizationStore.getState()).toMatchObject({ autoApply: false, live: false, preview: false });
  await act(async () => { await w.result.current.finishQuick(quickProposal()); });
  expect(apply).not.toHaveBeenCalled(); expect(w.commit).not.toHaveBeenCalled();
  await act(async () => { cancelled({ ...job, status: "cancelled" }); await pending; });
  expect(w.result.current.state.draft).toBeDefined();
  expect(w.result.current.state.autoApply).toBe(false); w.client.clear();
});
