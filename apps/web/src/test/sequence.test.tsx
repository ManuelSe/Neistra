import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Selection } from "../api/types";
import { SequenceViewer } from "../components/SequenceViewer";
import { proteinSequenceRows } from "../selection/sequence";
import { useSequenceNavigationStore } from "../store/sequenceNavigation";
import { useWorkspaceStore } from "../store/workspace";
import { ProjectInspector } from "../components/ProjectInspector";
import { emptySelection } from "../selection/selection";
import type { ResidueSelectionRequest } from "../selection/gestures";
import { useSelectionStore } from "../store/selection";
import { molecularProject, proteinProjection } from "./molecular-fixtures";

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function Harness({ initialSelection = emptySelection(), onSelectResidue, projection = proteinProjection() }: {
  initialSelection?: Selection; onSelectResidue?: (request: ResidueSelectionRequest) => void; projection?: ReturnType<typeof proteinProjection>;
} = {}) {
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [pickingGranularity, setPickingGranularity] =
    useState<Selection["granularity"]>("atom");
  const project = molecularProject();
  useSelectionStore.getState().setProject(project.id);
  useSequenceNavigationStore.getState().setProject(project.id);
  return (
    <>
    <SequenceViewer projectId={project.id} rows={proteinSequenceRows({ entryId: "protein", normalized: projection.structure, hierarchy: projection.hierarchy }).map(row => ({ ...row, key: JSON.stringify(["protein", row.componentId, row.chainId]), entryId: "protein", entryName: "Receptor", artifactId: "current-protein", current: true }))}
      loading={false} failed={false} selection={selection} onHide={() => undefined}
      onSelectResidue={request => {
        if (onSelectResidue) onSelectResidue(request);
        else {
          useSelectionStore.getState().replace(selection);
          useSelectionStore.getState().applyResidue(request, { projectId: project.id, artifactId: "current-protein", source: { entryId: "protein", normalized: projection.structure, hierarchy: projection.hierarchy } });
          setSelection(useSelectionStore.getState().selection);
        }
      }} />
    <ProjectInspector
      project={molecularProject()}
      selection={selection}
      pickingGranularity={pickingGranularity}
      onPickingGranularity={setPickingGranularity}
      busy={false}
      onApply={() => undefined}
      onApplySelection={() => undefined}
      onClearSelection={() => setSelection(emptySelection())}
      onExpandSelection={() => undefined}
      onInvertSelection={() => undefined}
      onPredicateSelection={() => undefined}
      onSpatialSelection={() => undefined}
      onSaveSelection={() => undefined}
      onLoadSelection={() => undefined}
      onDeleteSelection={() => undefined}
    />
    </>
  );
}

function InspectorForProject({ project }: { project: Project }) {
  return (
    <ProjectInspector
      project={project}
      selection={emptySelection()}
      pickingGranularity="atom"
      busy={false}
      onApply={() => undefined}
      onApplySelection={() => undefined}
      onPickingGranularity={() => undefined}
      onClearSelection={() => undefined}
      onExpandSelection={() => undefined}
      onInvertSelection={() => undefined}
      onPredicateSelection={() => undefined}
      onSpatialSelection={() => undefined}
      onSaveSelection={() => undefined}
      onLoadSelection={() => undefined}
      onDeleteSelection={() => undefined}
    />
  );
}

describe("bidirectional sequence selection", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(104);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
    useWorkspaceStore.getState().setSequenceDisplay("expanded");
  });
  afterEach(() => {
    cleanup();
    useWorkspaceStore.getState().setSequenceDisplay("expanded");
    useSequenceNavigationStore.getState().setProject(null);
    useSelectionStore.getState().setProject(null);
    vi.restoreAllMocks();
  });

  it("turns sequence residue clicks into the common selection and reflects them in summary", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const projection =
        url.includes("/protein/") ? proteinProjection() : {
          ...proteinProjection(),
          entry_id: "ligand",
          structure: {
            ...proteinProjection().structure,
            structure_type: "ligand" as const,
            chains: [],
            residues: [],
            atoms: [],
          },
        };
      return Promise.resolve(
        new Response(JSON.stringify(projection), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrapper(client) });

    const residue = await screen.findByRole("button", { name: /GLY 10/ });
    await user.click(residue);
    expect(residue).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(residue, { metaKey: true });
    expect(residue).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(residue, { ctrlKey: true });
    expect(residue).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("tab", { name: "selection" }));
    await waitFor(() => {
      const summary = screen.getByLabelText("Current selection summary");
      expect(summary).toHaveTextContent("Atoms2");
      expect(summary).toHaveTextContent("Residues1");
      expect(summary).toHaveTextContent("Chains1");
      expect(summary).toHaveTextContent("Structures1");
    });
  });

  it("shows insertion codes and partial coverage and emits owned shared residue actions", async () => {
    const projection = proteinProjection();
    projection.structure.residues[0].insertion_code = "A";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(projection), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    useSelectionStore.getState().setProject(molecularProject().id);
    const onSelectResidue = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness initialSelection={{ schema_version: 1, granularity: "atom", source: "viewer",
      atoms: [{ structure_id: "protein", atom_id: 1 }] }} onSelectResidue={onSelectResidue} projection={projection} />, { wrapper: wrapper(client) });
    const residue = await screen.findByRole("button", { name: /GLY 10A/ });
    expect(residue).toHaveAttribute("aria-pressed", "mixed");
    expect(residue).toHaveAccessibleName(/chain A in Receptor/);
    fireEvent.click(residue, { shiftKey: true });
    expect(onSelectResidue).toHaveBeenLastCalledWith({ projectId: molecularProject().id,
      projectEpoch: useSelectionStore.getState().projectEpoch, entryId: "protein",
      artifactId: molecularProject().entries[0].current_artifact_id, residueId: 1,
      mode: "add", shift: true, source: "sequence" });
    fireEvent.click(residue, { ctrlKey: true, shiftKey: true });
    expect(onSelectResidue.mock.lastCall?.[0]).toMatchObject({ mode: "toggle", shift: true });
    fireEvent.click(residue, { altKey: true, ctrlKey: true });
    expect(onSelectResidue.mock.lastCall?.[0]).toMatchObject({ mode: "subtract", shift: false });
  });

  it("returns from automatic project details to selection after the first import", async () => {
    const project = molecularProject();
    const emptyProject = { ...project, entries: [] };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<InspectorForProject project={emptyProject} />, {
      wrapper: wrapper(client),
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "details" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    view.rerender(<InspectorForProject project={project} />);
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "selection" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getByLabelText("Current selection summary")).toBeInTheDocument();
  });

  it("moves residue focus without selecting and activates the focused residue with shared modifiers", async () => {
    const onSelectResidue = vi.fn();
    render(<Harness onSelectResidue={onSelectResidue} />, { wrapper: wrapper(new QueryClient()) });
    const first = await screen.findByRole("button", { name: /^GLY 10 ·/ });
    const last = screen.getByRole("button", { name: /^ALA 11 ·/ });
    first.focus(); fireEvent.keyDown(first, { key: "End" });
    await waitFor(() => expect(last).toHaveFocus());
    expect(onSelectResidue).not.toHaveBeenCalled();
    fireEvent.click(last, { shiftKey: true });
    expect(onSelectResidue).toHaveBeenLastCalledWith(expect.objectContaining({ residueId: 2, mode: "add", shift: true, source: "sequence" }));
    fireEvent.keyDown(last, { key: "Home" });
    await waitFor(() => expect(first).toHaveFocus());
  });

  it("collapses independently while retaining selection and the lower-panel preference", async () => {
    useWorkspaceStore.getState().setLowerCollapsed(true);
    const user = userEvent.setup();
    render(<Harness initialSelection={{ schema_version: 1, granularity: "residue", source: "viewer",
      atoms: [{ structure_id: "protein", atom_id: 1 }, { structure_id: "protein", atom_id: 2 }] }} />, { wrapper: wrapper(new QueryClient()) });
    await screen.findByRole("button", { name: /^GLY 10 ·/ });
    await user.click(screen.getByRole("button", { name: "Collapse sequences" }));
    expect(screen.queryByRole("button", { name: /^GLY 10 ·/ })).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().lowerCollapsed).toBe(true);
    await user.click(screen.getByRole("button", { name: "Expand sequences" }));
    expect(await screen.findByRole("button", { name: /^GLY 10 ·/ })).toHaveAttribute("aria-pressed", "true");
    expect(useWorkspaceStore.getState().lowerCollapsed).toBe(true);
    useWorkspaceStore.getState().setLowerCollapsed(false);
  });

  it("shows an updating projection without accepting stale residue actions", async () => {
    const projection = proteinProjection();
    const onSelectResidue = vi.fn();
    const rows = proteinSequenceRows({ entryId: "protein", normalized: projection.structure, hierarchy: projection.hierarchy })
      .map(row => ({ ...row, entryId: "protein", entryName: "Receptor", artifactId: "retired", current: false }));
    render(<SequenceViewer projectId="project" rows={rows} selection={emptySelection()} loading failed={false}
      onSelectResidue={onSelectResidue} onHide={() => undefined} />);
    const residue = await screen.findByRole("button", { name: /^GLY 10 ·/ });
    expect(residue).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(residue);
    expect(onSelectResidue).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Updating");
  });

  it("does not reclaim outside focus when a previously focused residue disappears", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const projection = proteinProjection();
    const client = new QueryClient();
    const view = render(<Harness projection={projection} />, { wrapper: wrapper(client) });
    const residue = await screen.findByRole("button", { name: /^GLY 10 ·/ });
    act(() => residue.focus());
    act(() => residue.blur());
    expect(document.body).toHaveFocus();
    const updated = proteinProjection();
    updated.structure.residues = updated.structure.residues.filter(r => r.id !== 1);
    updated.structure.atoms = updated.structure.atoms.filter(a => a.residue_id !== 1);
    updated.structure.bonds = [];
    updated.hierarchy.components[0].residue_ids = [2];
    view.rerender(<Harness projection={updated} />);
    await screen.findByRole("button", { name: /^ALA 11 ·/ });
    expect(document.body).toHaveFocus();
    expect(screen.getByRole("button", { name: "Collapse sequences" })).not.toHaveFocus();
  });
});
