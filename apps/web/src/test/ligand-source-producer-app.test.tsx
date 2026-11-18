import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { ApiError, workspacePresentationApi } from "../api/client";
import type { Project } from "../api/types";
import type * as ControlsModule from "../components/LigandDesignationControls";
import type { LigandDesignationControls } from "../components/LigandDesignationControls";
import type { ProjectInspector } from "../components/ProjectInspector";
import { ligandApi } from "../ligands/api";
import { captureArtifactSource, getLigandInventoryOwner, inventorySourceKey, type VerifiedArtifactSource } from "../ligands/inventoryQualification";
import type { LigandCandidatesRead } from "../ligands/types";
import { useMinimizationStore } from "../minimization/store";
import { useEditingStore } from "../store/editing";
import { useNavigationStore } from "../store/navigation";
import { useSelectionStore } from "../store/selection";
import { useWorkspaceStore } from "../store/workspace";
import { structureQueryKey } from "../structures/query";
import { molecularEntry, molecularProject, proteinProjection } from "./molecular-fixtures";

type Controls = ComponentProps<typeof LigandDesignationControls>;
const seen = vi.hoisted(() => ({ controls: null as Controls | null }));
vi.mock("../components/LigandDesignationControls", async importOriginal => {
  const actual = await importOriginal<typeof ControlsModule>();
  return { LigandDesignationControls: (props: Controls) => { seen.controls = props; return <actual.LigandDesignationControls {...props} />; } };
});
vi.mock("../components/ProjectInspector", () => ({ ProjectInspector: (props: ComponentProps<typeof ProjectInspector>) => props.ligandControls }));
vi.mock("../components/WorkspaceCanvas", () => ({ WorkspaceCanvas: () => null }));
vi.mock("../components/LowerPanel", () => ({ LowerPanel: () => null }));
const clients: QueryClient[] = [];
beforeEach(() => {
  localStorage.clear(); vi.restoreAllMocks(); seen.controls = null;
  useSelectionStore.getState().setProject(null); useEditingStore.getState().setProject(null);
  useMinimizationStore.getState().setProject(null); useNavigationStore.getState().setProject(null);
  vi.spyOn(workspacePresentationApi, "read").mockResolvedValue({ schema_version: 1, revision: 0, camera: null, updated_at: null });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
}
function inventory(project: Project, entryId = project.entries[0].id): LigandCandidatesRead {
  const entry = project.entries.find(value => value.id === entryId)!;
  return { project_id: project.id, entry_id: entry.id, artifact_id: entry.current_artifact_id,
    designation: entry.ligand_designation, input_hash: "inventory", resolver_version: "ligand-instance-v3", total: 1, offset: 0, limit: 12,
    designated_candidate: null, warnings: [], selectable_candidate_keys: ["candidate"], candidates: [{ candidate_key: "candidate", atom_ids: [1, 2], residue_ids: [1],
      component_ids: ["LIG"], label: "Exact instance", locations: [], boundary_status: "qualified", potential_ligand: true,
      reason_codes: [], provenance: [], heavy_atom_count: 2, formal_charge: 0, formula: "C2H6", molecular_weight: 30,
      chemistry_status: "qualified", chemistry_reason: null, chemical_input_hash: "chemistry", occurrence_count: null,
      occurrence_basis: null, occurrence_reason: "occurrence_count_not_qualified" }] };
}
async function setup(legacy = false, count = 1) {
  const entries = Array.from({ length: count }, (_, index) => molecularEntry(`entry-${index}`, `Entry ${index}`, "protein"));
  for (const entry of entries) if (!legacy) entry.ligand_designation = { ...entry.ligand_designation, status: "selection_required" };
  const project = molecularProject(entries); project.has_uncheckpointed_changes = false;
  const other = { ...molecularProject([]), id: "other", name: "Other" };
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(query); query.setQueryData(["project", project.id], project); query.setQueryData(["project", other.id], other);
  for (const entry of entries) query.setQueryData(structureQueryKey(project.id, entry.id, entry.current_artifact_id), proteinProjection());
  vi.spyOn(globalThis, "fetch").mockImplementation(input => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(Response.json(path.endsWith(`/projects/${project.id}`) ? project : path.endsWith(`/projects/${other.id}`) ? other
      : path === "/api/v1/projects" ? [project, other].map(value => ({ ...value, entry_count: value.entries.length })) : []));
  });
  const candidateReads = vi.spyOn(ligandApi, "candidates").mockImplementation((_projectId, entry) => Promise.resolve(inventory(project, entry.id)));
  vi.spyOn(ligandApi, "depiction").mockImplementation((_projectId, entry) => Promise.resolve({ entry_id: entry.id, artifact_id: entry.current_artifact_id,
    candidate_key: "candidate", status: "ready", reason: null, input_hash: "chemistry", cache_key: "drawing-key",
    artifact: { id: "drawing", filename: "ligand.svg", media_type: "image/svg+xml", sha256: "digest", size: 100, download_url: "/artifact/drawing.svg" },
    implementation: "ligand-2d-v1", library_version: "pinned", formula: "C2H6", molecular_weight: 30, formal_charge: 0, provenance: "source" }));
  useWorkspaceStore.setState({ activeProjectId: project.id, mobilePanel: null });
  render(<QueryClientProvider client={query}><App /></QueryClientProvider>);
  await waitFor(() => expect(useSelectionStore.getState().projectId).toBe(project.id));
  act(() => useNavigationStore.getState().inspect(project.id, entries[0].id));
  await waitFor(() => expect(seen.controls?.entryId).toBe(entries[0].id));
  return { entry: entries[0], project, other, query, candidateReads, owner: getLigandInventoryOwner(query) };
}
function provedError(source: VerifiedArtifactSource, code = "artifact_integrity_error", role: "current" | "original" = "current") {
  return new ApiError(code === "artifact_not_found" ? 404 : 409, code, "Controlled molecular source failure", [], [], null, role,
    { kind: "valid", identity: { project_id: source.projectId, entry_id: source.entryId, current_artifact_id: source.currentArtifactId, original_artifact_id: source.originalArtifactId } });
}
async function openChoice() {
  await userEvent.click(screen.getByRole("button", { name: "Choose" }));
  const dialog = screen.getByRole("dialog");
  expect(await within(dialog).findByText("C2H6", { exact: true })).toBeVisible();
  expect(await within(dialog).findByRole("img", { name: /2D depiction/ })).toBeVisible();
  await userEvent.click(within(dialog).getByRole("radio")); return dialog;
}

describe("actual App molecular-source write retirement", () => {
  it.each(["artifact_integrity_error", "artifact_not_found"])("withholds cached composition/drawing/Use after legacy %s", async code => {
    const state = await setup();
    const command = vi.spyOn(ligandApi, "designate").mockRejectedValue(new ApiError(code === "artifact_not_found" ? 404 : 409, code, "Controlled molecular input failure"));
    const dialog = await openChoice(); await userEvent.click(within(dialog).getByRole("button", { name: "Use ligand" }));
    await waitFor(() => expect(command).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByRole("button", { name: "Use ligand" })).toBeDisabled();
    expect(within(dialog).queryByText("C2H6", { exact: true })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("img", { name: /2D depiction/ })).not.toBeInTheDocument();
    expect(state.owner.qualification(inventorySourceKey(state.project, state.entry)).blocked).toBe(true);
    expect(state.candidateReads.mock.calls).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(await within(dialog).findByText("C2H6", { exact: true })).toBeVisible();
    expect(state.owner.qualification(inventorySourceKey(state.project, state.entry)).blocked).toBe(false);
  });

  it.each(["structure_artifact_conflict", "revision_conflict", "network_error"])("preserves independently qualified composition for untagged %s", async code => {
    await setup(); vi.spyOn(ligandApi, "designate").mockRejectedValue(new ApiError(code === "network_error" ? 0 : 409, code, "Controlled semantic/transport rejection"));
    const dialog = await openChoice(); await userEvent.click(within(dialog).getByRole("button", { name: "Use ligand" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Use ligand" })).toBeEnabled());
    expect(within(dialog).getByText("C2H6", { exact: true })).toBeVisible(); expect(within(dialog).getByRole("img", { name: /2D depiction/ })).toBeVisible();
  });

  it("records a delayed captured A source failure after feedback ownership moved to another project", async () => {
    const state = await setup(), pending = deferred<Project>(), source = captureArtifactSource(state.project.id, state.entry);
    vi.spyOn(ligandApi, "designate").mockReturnValue(pending.promise);
    const dialog = await openChoice(); await userEvent.click(within(dialog).getByRole("button", { name: "Use ligand" }));
    act(() => useWorkspaceStore.getState().setActiveProjectId(state.other.id));
    await act(async () => { pending.reject(provedError(source)); await pending.promise.catch(() => undefined); });
    expect(state.owner.qualification(inventorySourceKey(state.project, state.entry)).blocked).toBe(true);
    expect(useWorkspaceStore.getState().activeProjectId).toBe(state.other.id);
    act(() => useWorkspaceStore.getState().setActiveProjectId(state.project.id));
    expect(state.owner.qualification(inventorySourceKey(state.project, state.entry)).blocked).toBe(true);
  });

  it("keeps a replacement B source qualified when a delayed A proof arrives", async () => {
    const state = await setup(), pending = deferred<Project>(), source = captureArtifactSource(state.project.id, state.entry);
    vi.spyOn(ligandApi, "designate").mockReturnValue(pending.promise);
    const dialog = await openChoice(); await userEvent.click(within(dialog).getByRole("button", { name: "Use ligand" }));
    const b = { ...state.entry, current_artifact_id: "replacement-B" }, project = { ...state.project, revision: state.project.revision + 1, entries: [b] };
    act(() => { state.query.setQueryData(["project", project.id], project); });
    await act(async () => { pending.reject(provedError(source)); await pending.promise.catch(() => undefined); });
    expect(state.owner.qualification(inventorySourceKey(state.project, state.entry)).blocked).toBe(true);
    expect(state.owner.qualification(inventorySourceKey(project, b)).blocked).toBe(false);
  });

  it.each([1, 2])("attributes actual legacy resolve failure to one exact member of a %d-entry request", async count => {
    const pending = deferred<Project>(); const resolve = vi.spyOn(ligandApi, "resolve").mockReturnValue(pending.promise);
    const state = await setup(true, count); await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    const requested = resolve.mock.calls[0][2]; expect(requested).toHaveLength(count);
    const failed = state.project.entries.find(entry => entry.id === requested.at(-1))!;
    await act(async () => { pending.reject(provedError(captureArtifactSource(state.project.id, failed))); await pending.promise.catch(() => undefined); });
    expect(state.owner.qualification(inventorySourceKey(state.project, failed)).blocked).toBe(true);
    for (const entry of state.project.entries.filter(entry => entry.id !== failed.id)) expect(state.owner.qualification(inventorySourceKey(state.project, entry)).blocked).toBe(false);
  });

  it("does not invent identity for an untagged one-entry resolve failure", async () => {
    const pending = deferred<Project>(); const resolve = vi.spyOn(ligandApi, "resolve").mockReturnValue(pending.promise);
    const state = await setup(true); await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    await act(async () => { pending.reject(new ApiError(409, "artifact_integrity_error", "Legacy batch failure")); await pending.promise.catch(() => undefined); });
    expect(state.owner.qualification(inventorySourceKey(state.project, state.entry)).blocked).toBe(false);
  });

  it("does not fabricate a molecular read for a failing Clear command", async () => {
    const state = await setup(); vi.spyOn(ligandApi, "designate").mockRejectedValue(new ApiError(409, "artifact_integrity_error", "Impossible unproved Clear read"));
    await act(async () => { await seen.controls!.onDesignate(state.entry, null).catch(() => undefined); });
    expect(state.owner.qualification(inventorySourceKey(state.project, state.entry)).blocked).toBe(false);
  });
});
