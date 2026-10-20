import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { minimizationApi } from "../api/client";
import type { Job, MinimizationProposal, Selection } from "../api/types";
import { calculationComponents, minimizationRequest } from "../minimization/context";
import { proposalGeometry } from "../minimization/preview";
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
  expect(proposalGeometry(result, inputs).atoms).toEqual([{ preview_id: "protein/1", element: "C", coordinates: [0, 1, 0] }]);
  expect(JSON.stringify([...inputs])).toBe(before);
  result.entries[0].coordinates[0][0] = Infinity;
  expect(() => proposalGeometry(result, inputs)).toThrow("captured selection");
  result.entries = []; expect(() => proposalGeometry(result, inputs)).toThrow("omits");
  result.entries = [...proposal().entries, ...proposal().entries]; expect(() => proposalGeometry(result, inputs)).toThrow("captured selection");
  result.entries = proposal().entries; result.entries[0].conformer_id = 1; expect(() => proposalGeometry(result, inputs)).toThrow("conformer");
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
  const commit = vi.fn();
  const hook = renderHook(() => useMinimization(p, selection, commit), { wrapper });
  return { ...hook, client, commit, p };
}
it("Ctrl+M captures, submits automatic work exactly once and never implicitly applies coordinates", async () => {
  const source = vi.spyOn(minimizationApi, "source").mockResolvedValue(sources().get("protein")!.structure);
  vi.spyOn(minimizationApi, "capabilities").mockResolvedValue({ model: "amber-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} });
  const submit = vi.spyOn(minimizationApi, "submit").mockResolvedValue({ id: "job", status: "cancelled" } as Job);
  const apply = vi.spyOn(minimizationApi, "apply");
  const w = workflow();
  await act(async () => { const first = w.result.current.quick(); await w.result.current.quick(); await first; });
  expect(source).toHaveBeenCalledOnce(); expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.calls[0][1]).toMatchObject({ mode: "automatic", selection, max_iterations: 500 });
  expect(submit.mock.calls[0][1].context).toBeUndefined(); expect(submit.mock.calls[0][1].conformers).toBeUndefined();
  expect(apply).not.toHaveBeenCalled(); expect(w.commit).not.toHaveBeenCalled();
  expect(w.result.current.state.jobId).toBe("job"); w.client.clear();
});
it("does not submit or resurrect the panel after source capture is discarded", async () => {
  let resolve!: (value: ReturnType<typeof proteinStructure>) => void;
  vi.spyOn(minimizationApi, "source").mockImplementation(() => new Promise(done => { resolve = done; }));
  const submit = vi.spyOn(minimizationApi, "submit"); const w = workflow();
  let pending!: Promise<void>;
  act(() => { pending = w.result.current.quick(); });
  await waitFor(() => expect(resolve).toBeDefined());
  act(() => w.result.current.dismiss());
  await act(async () => { resolve(sources().get("protein")!.structure); await pending; });
  expect(submit).not.toHaveBeenCalled(); expect(w.result.current.open).toBe(false); w.client.clear();
});
it("keeps a failed prerequisite as an inspectable setup and never submits it", async () => {
  vi.spyOn(minimizationApi, "source").mockResolvedValue(sources().get("protein")!.structure);
  vi.spyOn(minimizationApi, "capabilities").mockResolvedValue({ model: "amber-local-v1", available: false, unavailable_reason: "Install locked AmberTools", prerequisites: [], scientific_limits: [], limits: {} });
  const submit = vi.spyOn(minimizationApi, "submit"); const w = workflow();
  await act(async () => { await w.result.current.quick(); });
  expect(submit).not.toHaveBeenCalled(); expect(w.result.current.open).toBe(true);
  expect(w.result.current.error).toBe("Install locked AmberTools"); expect(w.result.current.state.draft).not.toBeNull();
  expect(w.result.current.state.loading).toBe(false); w.client.clear();
});
it("does not submit across a project switch during capability discovery", async () => {
  vi.spyOn(minimizationApi, "source").mockResolvedValue(sources().get("protein")!.structure);
  let finish!: () => void;
  vi.spyOn(minimizationApi, "capabilities").mockImplementation(() => new Promise(resolve => { finish = () => resolve({ model: "amber-local-v1", available: true, unavailable_reason: null, prerequisites: [], scientific_limits: [], limits: {} }); }));
  const submit = vi.spyOn(minimizationApi, "submit"); const w = workflow();
  let pending!: Promise<void>; act(() => { pending = w.result.current.quick(); });
  await waitFor(() => expect(finish).toBeDefined());
  act(() => { useWorkspaceStore.setState({ activeProjectId: "other" }); useMinimizationStore.getState().setProject("other"); });
  await act(async () => { finish(); await pending; });
  expect(submit).not.toHaveBeenCalled(); expect(w.result.current.open).toBe(false); w.client.clear();
});
