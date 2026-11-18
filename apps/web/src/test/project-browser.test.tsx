import { useWorkspaceStore } from "../store/workspace";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectBrowser } from "../components/ProjectBrowser";
import type { Entry, SelectionMode } from "../api/types";
import { molecularProject } from "./molecular-fixtures";
import type { GroupScope } from "../groups/membership";

const actions = {
  onRename: vi.fn(),
  onDuplicate: vi.fn(),
  onVisibility: vi.fn(),
  onLock: vi.fn(),
  onIsolate: vi.fn(),
  onGroup: vi.fn(),
  onDelete: vi.fn(),
  onExport: vi.fn(),
};

function renderBrowser(element: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Tooltip.Provider>{element}</Tooltip.Provider></QueryClientProvider>);
}

describe("project browser selection and discovery", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("searches, filters, sorts, and collapses grouped entries", async () => {
    const user = userEvent.setup();
    renderBrowser(<ProjectBrowser project={molecularProject()} {...actions} />);
    const listbox = screen.getByLabelText("Project structures");

    expect([...listbox.querySelectorAll(".entry-select")].map((row) => row.textContent)).toEqual([
      expect.stringContaining("Receptor"),
      expect.stringContaining("Ligand"),
    ]);
    await user.click(screen.getByText("Filter and sort"));
    await user.selectOptions(screen.getByLabelText("Sort structures"), "atoms");
    expect(listbox.querySelectorAll(".entry-select")[0]).toHaveTextContent("Receptor");
    await user.type(screen.getByPlaceholderText("Search structures"), "lig");
    expect(listbox.querySelectorAll(".entry-select")).toHaveLength(1);
    expect(listbox.querySelector(".entry-select")).toHaveTextContent("Ligand");
    await user.clear(screen.getByPlaceholderText("Search structures"));
    await user.selectOptions(screen.getByLabelText("Filter structure type"), "protein");
    expect(listbox.querySelectorAll(".entry-select")).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText("Filter structure type"), "all");
    await user.click(screen.getByLabelText("Collapse Target"));
    expect(listbox.querySelector("[data-entry-id='protein'] .entry-select")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Expand Target"));
    expect(listbox.querySelector("[data-entry-id='protein'] .entry-select")).toBeInTheDocument();
  });

  it("emits replace, additive, subtractive, and group multi-selection operations", () => {
    const onSelectEntries = vi.fn();
    renderBrowser(
      <ProjectBrowser
        project={molecularProject()}
        selectedEntryIds={new Set(["protein"])}
        onSelectEntries={onSelectEntries}
        {...actions}
      />,
    );
    const listbox = screen.getByLabelText("Project structures");
    const receptor = listbox.querySelector("[data-entry-id='protein'] .entry-select")!;
    const ligand = listbox.querySelector("[data-entry-id='ligand'] .entry-select")!;
    expect(receptor).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(receptor);
    fireEvent.click(ligand, { ctrlKey: true });
    fireEvent.click(ligand, { altKey: true });
    fireEvent.click(within(screen.getByText("Target").closest(".group-heading")!).getByText("Target"));

    const calls = onSelectEntries.mock.calls as [Entry[], SelectionMode][];
    expect(calls.map((call) => call[1])).toEqual([
      "replace",
      "toggle",
      "subtract",
      "replace",
    ]);
    expect(calls[3][0].map((entry) => entry.id)).toEqual(["protein"]);
  });
  it("retains empty group headings while filtering and in projects without entries", async () => {
    const user = userEvent.setup();
    const project = molecularProject();
    project.groups.push({ ...project.groups[0], id: "empty", name: "Empty" });
    const { rerender } = renderBrowser(<ProjectBrowser project={project} {...actions} />);
    expect(screen.getByText("Empty")).toBeVisible();
    await user.type(screen.getByPlaceholderText("Search structures"), "nothing");
    expect(screen.getByText("No matching structures")).toBeVisible();
    expect(screen.getByText("Empty")).toBeVisible();
    expect(screen.getByText("Target")).toBeVisible();
    rerender(<QueryClientProvider client={new QueryClient()}><Tooltip.Provider><ProjectBrowser project={{ ...project, entries: [] }} {...actions} /></Tooltip.Provider></QueryClientProvider>);
    expect(screen.getByText("No structures")).toBeVisible();
    expect(screen.getByText("Target")).toBeVisible();
    expect(screen.getByText("Empty")).toBeVisible();
  });

  it("hands focus to the replacement row when membership completes before menu teardown", async () => {
    const user = userEvent.setup();
    const onMenuClose = vi.fn((scope: GroupScope) => {
      expect(scope.originEntryId).toBe("protein");
      const row = document.querySelector('[data-group-id="ungrouped"] [data-entry-id="protein"]');
      expect(row).not.toBeNull();
      row!.querySelector<HTMLButtonElement>(".entry-menu-trigger")!.focus();
    });
    function Browser() {
      const [project, setProject] = useState(molecularProject);
      return <ProjectBrowser project={project} {...actions}
        onMembershipMenuClose={onMenuClose}
        onRemoveGroup={() => setProject(current => ({
          ...current, entries: current.entries.map(entry => entry.id === "protein" ? { ...entry, group_id: null } : entry),
        }))} />;
    }
    renderBrowser(<Browser />);
    const original = screen.getByRole("button", { name: "Actions for Receptor" });
    await user.click(original);
    await user.click(screen.getByRole("menuitem", { name: /^Remove from group$/ }));
    await waitFor(() => expect(onMenuClose).toHaveBeenCalledOnce());
    expect(original.isConnected).toBe(false);
    expect(screen.getByRole("button", { name: "Actions for Receptor" })).toHaveFocus();
  });
  it("preserves rapid search edits, caret and type patches without remounting the input", async () => {
    renderBrowser(<ProjectBrowser project={molecularProject()} {...actions} />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Search structures" });
    await userEvent.type(input, "Ligand"); await userEvent.keyboard("{ArrowLeft}{ArrowLeft}X");
    expect(input).toHaveFocus(); expect(input).toHaveValue("LigaXnd"); expect(input.selectionStart).toBe(5);
    await userEvent.click(screen.getByText("Filter and sort"));
    await userEvent.selectOptions(screen.getByLabelText("Filter structure type"), "ligand");
    expect(useWorkspaceStore.getState().browserFilters).toEqual({ search: "LigaXnd", type: "ligand" });
    expect(screen.getByRole("textbox", { name: "Search structures" })).toBe(input);
  });
  it("retains search/type through presenter unmount and responsive replacement without retargeting inspection", async () => {
    const project = molecularProject(), view = renderBrowser(<ProjectBrowser project={project} {...actions} />);
    await userEvent.type(screen.getByPlaceholderText("Search structures"), "Ligand");
    await userEvent.click(screen.getByText("Filter and sort")); await userEvent.selectOptions(screen.getByLabelText("Filter structure type"), "ligand");
    const before = structuredClone(project);
    view.unmount();
    const media = window.matchMedia;
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ ...media(query),
      matches: query.includes("max-width: 840px") || query.includes("any-pointer: coarse") }));
    renderBrowser(<ProjectBrowser project={project} {...actions} />);
    expect(screen.getByRole("tab", { name: "Entries" })).toBeVisible();
    expect(screen.getByPlaceholderText("Search structures")).toHaveValue("Ligand");
    expect(screen.getByLabelText("Filter structure type")).toHaveValue("ligand");
    expect(project).toEqual(before);
    expect(document.querySelectorAll(".entry-row")).toHaveLength(1);
  });
  it("does not apply a rendered previous project's patch to the active project", () => {
    const workspace = useWorkspaceStore.getState(); workspace.setActiveProjectId("other");
    const current = useWorkspaceStore.getState();
    current.patchBrowserFilters({ projectId: "other", visit: current.browserFilterVisit }, { search: "new project" });
    renderBrowser(<ProjectBrowser project={molecularProject()} {...actions} />);
    fireEvent.change(screen.getByPlaceholderText("Search structures"), { target: { value: "stale callback" } });
    expect(useWorkspaceStore.getState().browserFilters.search).toBe("new project");
  });
});

beforeEach(() => {
  useWorkspaceStore.getState().setActiveProjectId(null);
  useWorkspaceStore.getState().setActiveProjectId("project-1");
  // JSDOM has no layout: place resize handles away from pointer origin.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-panel-resize-handle-id") ? new DOMRect(1000, 1000, 6, 100) : new DOMRect(0, 0, 320, 800);
  });
});
