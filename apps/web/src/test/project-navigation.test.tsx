import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Project, StructureProjection } from "../api/types";
import { molecularApi } from "../api/client";
import { useState } from "react";
import { EntryDetails } from "../components/EntryDetails";
import { ComponentDetails } from "../components/ComponentDetails";
import { ProjectBrowser } from "../components/ProjectBrowser";
import { useNavigationStore } from "../store/navigation";
import { useWorkspaceStore } from "../store/workspace";
import { componentHierarchy, molecularProject, proteinStructure } from "./molecular-fixtures";

const actions = { onRename: vi.fn(), onDuplicate: vi.fn(), onVisibility: vi.fn(), onLock: vi.fn(),
  onIsolate: vi.fn(), onGroup: vi.fn(), onDelete: vi.fn(), onExport: vi.fn() };
const structure = proteinStructure();
const projection: StructureProjection = { entry_id: "protein", structure,
  hierarchy: componentHierarchy(structure), viewer: { format: "mmcif", data: "projection" } };

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  useWorkspaceStore.setState({ browserLayout: [60, 40], componentsCollapsed: false });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-panel-resize-handle-id") ? new DOMRect(1000, 1000, 6, 100) : new DOMRect(0, 0, 320, 800);
  });
  vi.spyOn(molecularApi, "structure").mockResolvedValue(projection);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function browser(project: Project, onSelectEntries = vi.fn()) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Tooltip.Provider><ProjectBrowser project={project} onSelectEntries={onSelectEntries} {...actions} /></Tooltip.Provider>
  </QueryClientProvider>;
}

it("keeps explicit browsing independent of selection, remembers expansion across targets and remounts", async () => {
  const user = userEvent.setup();
  const project = molecularProject();
  const select = vi.fn();
  const rendered = render(browser(project, select));
  expect(screen.getByText("Choose an entry to browse components")).toBeVisible();
  expect(molecularApi.structure).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Actions for Receptor" }));
  await user.click(screen.getByRole("menuitem", { name: "Components" }));
  await screen.findByRole("button", { name: /^Select Protein in/ });
  expect(select).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /^Expand Protein in/ }));
  expect(screen.getByText("Protein chain A")).toBeVisible();
  fireEvent.click(document.querySelector('[data-entry-id="ligand"] .entry-select')!, { ctrlKey: true });
  expect(select).toHaveBeenLastCalledWith([project.entries[1]], "add");
  expect(useNavigationStore.getState().inspectedEntryId).toBe("ligand");
  fireEvent.click(document.querySelector('[data-entry-id="protein"] .entry-select')!, { altKey: true });
  expect(select).toHaveBeenLastCalledWith([project.entries[0]], "subtract");
  await screen.findByText("Protein chain A");
  rendered.unmount();
  render(browser(project, select));
  await screen.findByText("Protein chain A");
  expect(useNavigationStore.getState().entries.protein.categories).toEqual(["protein"]);
});

it("retains filtered browsing, clears deletion and project changes, and does not reactivate on Undo", async () => {
  const project = molecularProject();
  const view = render(browser(project));
  fireEvent.click(document.querySelector('[data-entry-id="protein"] .entry-select')!);
  await screen.findByRole("button", { name: /^Select Protein in/ });
  fireEvent.change(screen.getByPlaceholderText("Search structures"), { target: { value: "Ligand" } });
  expect(screen.getByText("Outside displayed entry list")).toBeVisible();
  expect(useNavigationStore.getState().inspectedEntryId).toBe("protein");
  view.rerender(browser({ ...project, entries: project.entries.filter(entry => entry.id !== "protein") }));
  await waitFor(() => expect(useNavigationStore.getState().inspectedEntryId).toBeNull());
  view.rerender(browser(project));
  expect(useNavigationStore.getState().inspectedEntryId).toBeNull();
  useNavigationStore.getState().inspect(project.id, "ligand");
  view.rerender(browser({ ...project, id: "other-project" }));
  await waitFor(() => expect(useNavigationStore.getState().projectId).toBe("other-project"));
  expect(useNavigationStore.getState().inspectedEntryId).toBeNull();
  expect(useNavigationStore.getState().entries).toEqual({});
});

it("exposes complete metadata and warnings by keyboard and returns to the entry menu", async () => {
  const user = userEvent.setup();
  const project = molecularProject();
  project.entries[0].warnings = [{ code: "ambiguous", message: "Full scientific warning, never truncated", severity: "warning", operation: "import", field: null, blocking: false }];
  render(browser(project));
  const launcher = screen.getByRole("button", { name: "Actions for Receptor" });
  launcher.focus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("menuitem", { name: "Details" }));
  expect(screen.getByRole("dialog", { name: "Entry details" })).toHaveTextContent("Full scientific warning, never truncated");
  expect(screen.getByText("Original filename")).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(launcher).toHaveFocus());
  expect(useNavigationStore.getState().inspectedEntryId).toBeNull();
});

it("keeps late previous-entry data out of the current pane and retries a failed load", async () => {
  const user = userEvent.setup();
  let resolveOld!: (value: StructureProjection) => void;
  vi.mocked(molecularApi.structure).mockImplementation((_project, id) => id === "protein"
    ? new Promise(resolve => { resolveOld = resolve; }) : Promise.reject(new Error("Offline")));
  render(browser(molecularProject()));
  fireEvent.click(document.querySelector('[data-entry-id="protein"] .entry-select')!);
  expect(screen.getByText("Loading components")).toBeVisible();
  fireEvent.click(document.querySelector('[data-entry-id="ligand"] .entry-select')!);
  await screen.findByText("Component hierarchy unavailable");
  resolveOld(projection);
  await waitFor(() => expect(screen.queryByRole("button", { name: /^Select Protein in/ })).not.toBeInTheDocument());
  vi.mocked(molecularApi.structure).mockResolvedValue(projection);
  await user.click(screen.getByRole("button", { name: "Retry components" }));
  await screen.findByRole("button", { name: /^Select Protein in/ });
  expect(useNavigationStore.getState().inspectedEntryId).toBe("ligand");
});

it("separates disclosure, label and Details and restores the component launcher", async () => {
  const user = userEvent.setup();
  const project = molecularProject();
  const select = vi.fn();
  const hierarchySelect = vi.fn();
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><Tooltip.Provider><ProjectBrowser
    project={project} onSelectEntries={select} onSelectHierarchy={hierarchySelect} {...actions} /></Tooltip.Provider></QueryClientProvider>);
  fireEvent.click(document.querySelector('[data-entry-id="protein"] .entry-select')!);
  await screen.findByRole("button", { name: "Expand Protein in Receptor" });
  await user.click(screen.getByRole("button", { name: "Expand Protein in Receptor" }));
  expect(hierarchySelect).not.toHaveBeenCalled();
  const label = screen.getByRole("button", { name: "Select Protein chain A in Receptor" });
  fireEvent.click(label, { altKey: true });
  expect(hierarchySelect).toHaveBeenLastCalledWith(expect.objectContaining({ granularity: "chain" }), "subtract");
  const details = screen.getByRole("button", { name: "Details for Protein chain A in Receptor" });
  await user.click(details);
  expect(screen.getByRole("dialog", { name: "Component details" })).toHaveTextContent("Assigned by a documented residue or element fallback");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(details).toHaveFocus());
  expect(hierarchySelect).toHaveBeenCalledTimes(1);
});

it("preserves coordinate expansion and reconciles a removed focused category to the pane heading", async () => {
  const user = userEvent.setup();
  const project = molecularProject();
  const waterProjection: StructureProjection = structuredClone(projection);
  waterProjection.structure.atoms[2].residue_id = 2;
  waterProjection.structure.residues[1] = { ...waterProjection.structure.residues[1], name: "HOH", component_type: "water" };
  waterProjection.hierarchy.components[0].residue_ids = [1];
  waterProjection.hierarchy.components.push({ id: "water", category: "water", display_label: "Water residue", chain_ids: [1], residue_ids: [2], atom_ids: [], classification_source: "fallback", classification_status: "assigned", warnings: [] });
  vi.mocked(molecularApi.structure).mockResolvedValue(waterProjection);
  const client = new QueryClient();
  const content = (value: Project) => <QueryClientProvider client={client}><Tooltip.Provider><ProjectBrowser project={value} {...actions} /></Tooltip.Provider></QueryClientProvider>;
  const view = render(content(project));
  fireEvent.click(document.querySelector('[data-entry-id="protein"] .entry-select')!);
  await screen.findByRole("button", { name: "Expand Water in Receptor" });
  await user.click(screen.getByRole("button", { name: "Expand Water in Receptor" }));
  const moved = structuredClone(waterProjection);
  moved.structure.atoms[0].coordinates[0] += 1;
  vi.mocked(molecularApi.structure).mockResolvedValue(moved);
  const movedProject = { ...project, entries: project.entries.map(entry => entry.id === "protein" ? { ...entry, current_artifact_id: "coordinate-revision" } : entry) };
  view.rerender(content(movedProject));
  await screen.findByRole("button", { name: "Select Water residue in Receptor" });
  expect(useNavigationStore.getState().entries.protein.categories).toContain("water");
  const focused = screen.getByRole("button", { name: "Select Water residue in Receptor" });
  focused.focus();
  const removed = structuredClone(moved);
  removed.structure.atoms = removed.structure.atoms.filter(atom => atom.residue_id !== 2);
  removed.hierarchy.components = removed.hierarchy.components.filter(component => component.category !== "water");
  vi.mocked(molecularApi.structure).mockResolvedValue(removed);
  view.rerender(content({ ...movedProject, entries: movedProject.entries.map(entry => entry.id === "protein" ? { ...entry, current_artifact_id: "topology-revision" } : entry) }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Select Water residue in Receptor" })).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("heading", { name: "Components" })).toHaveFocus());
  expect(useNavigationStore.getState().entries.protein.categories).not.toContain("water");
  expect(useNavigationStore.getState().inspectedEntryId).toBe("protein");
});

it("keeps an external text interaction focused when molecular artifacts refresh", async () => {
  const project = molecularProject();
  const client = new QueryClient();
  const content = (value: Project) => <QueryClientProvider client={client}><Tooltip.Provider><ProjectBrowser project={value} {...actions} /></Tooltip.Provider></QueryClientProvider>;
  const view = render(content(project));
  fireEvent.click(document.querySelector('[data-entry-id="protein"] .entry-select')!);
  await screen.findByRole("button", { name: "Select Protein in Receptor" });
  const search = screen.getByPlaceholderText("Search structures");
  search.focus(); fireEvent.change(search, { target:{ value:"Receptor" } });
  view.rerender(content({ ...project, entries:project.entries.map(entry => entry.id === "protein" ? { ...entry, current_artifact_id:"refreshed-artifact" } : entry) }));
  await screen.findByRole("button", { name:"Select Protein in Receptor" });
  expect(search).toHaveFocus(); expect(search).toHaveValue("Receptor");
});

it("discards an outgoing Components focus callback after a project switch", async () => {
  const user = userEvent.setup();
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.push(callback); return frames.length; });
  const project = molecularProject();
  const client = new QueryClient();
  const content = (value: Project) => <QueryClientProvider client={client}><Tooltip.Provider><ProjectBrowser project={value} {...actions} /></Tooltip.Provider></QueryClientProvider>;
  const view = render(content(project));
  await user.click(screen.getByRole("button", { name:"Actions for Receptor" }));
  await user.click(screen.getByRole("menuitem", { name:"Components" }));
  const pending = frames.splice(0);
  view.rerender(content({ ...project, id:"new-project" }));
  const search = screen.getByPlaceholderText("Search structures"); search.focus();
  for (const callback of pending) callback(0);
  expect(search).toHaveFocus();
  expect(useNavigationStore.getState().inspectedEntryId).toBeNull();
});

for (const kind of ["entry", "component"] as const) {
  it(`preserves a later focused tool while ${kind} Details finishes closing`, async () => {
    const returned = vi.fn();
    function DialogHarness() {
      const [open, setOpen] = useState(true);
      return <>{kind === "entry" ? <EntryDetails entry={open ? molecularProject().entries[0] : undefined}
        onClose={() => setOpen(false)} onReturnFocus={returned} /> : <ComponentDetails
          details={open ? { title:"Source", parent:"Entry", atomCount:1, components:[], warnings:[] } : null}
          onClose={() => setOpen(false)} onReturnFocus={returned} />}
        <button type="button" data-next-tool>Next tool</button></>;
    }
    render(<Tooltip.Provider><DialogHarness /></Tooltip.Provider>);
    const next = document.querySelector<HTMLButtonElement>("[data-next-tool]")!;
    fireEvent.keyDown(document.activeElement!, { key:"Escape", code:"Escape" });
    next.focus();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1)); });
    expect(next).toHaveFocus();
    expect(returned).not.toHaveBeenCalled();
  });
}
