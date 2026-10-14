import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Project, StructureProjection } from "../api/types";
import { molecularApi } from "../api/client";
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
