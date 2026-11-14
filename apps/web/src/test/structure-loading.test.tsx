import { surfaceObject } from "./molecular-fixtures";
import { PresentationContext } from "../presentation/context";
import type { PresentationController } from "../presentation/controller";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AtomReference,
  CameraState,
  CoordinatePatch,
  Project,
  Selection,
  SelectionGranularity,
  SelectionMode,
  StructureProjection,
} from "../api/types";
import { StructureViewer as ProductionStructureViewer } from "../components/StructureViewer";
import type {
  MolecularViewer,
  ViewerStructure,
} from "../viewer/MolecularViewer";
import { componentHierarchy, viewerSettings } from "./molecular-fixtures";
import type { SessionCamera } from "../workspacePresentation/types";
import type { WorkspacePresentationV1 } from "../workspacePresentation/types";
import { WorkspacePresentationController } from "../workspacePresentation/controller";
import { useWorkspaceStore } from "../store/workspace";
import { useEditingStore } from "../store/editing";
import type { SurfaceStatus } from "../viewer/surface/runtime";

type StructureViewerOverrides =
  | "onPickingGranularity"
  | "selectionColorMode"
  | "onSelectionColorModeChange";
type StructureViewerProps = Omit<
  ComponentProps<typeof ProductionStructureViewer>,
  StructureViewerOverrides
> & Partial<Pick<
  ComponentProps<typeof ProductionStructureViewer>,
  StructureViewerOverrides
>>;

function StructureViewer({
  onPickingGranularity = () => undefined,
  selectionColorMode = "carbon",
  onSelectionColorModeChange = () => undefined,
  ...props
}: StructureViewerProps) {
  return (
    <ProductionStructureViewer
      {...props}
      onPickingGranularity={onPickingGranularity}
      selectionColorMode={selectionColorMode}
      onSelectionColorModeChange={onSelectionColorModeChange}
    />
  );
}

function entry(id: string, visible: boolean) {
  return {
    id,
    group_id: null,
    name: id === "protein" ? "Receptor" : "Ligand",
    description: null,
    structure_type: id === "protein" ? ("protein" as const) : ("ligand" as const),
    original_filename: `${id}.pdb`,
    source_format: "pdb",
    atom_count: 3,
    atom_ids: [1, 2, 3],
    bond_count: 1,
    residue_count: 1,
    conformer_count: 1,
    warnings: [],
    viewer_settings: viewerSettings(id === "protein" ? "cartoon" : "ball-and-stick"),
    original_artifact_id: `original-${id}`,
    current_artifact_id: `current-${id}`,
    visible,
    locked: false,
    user_metadata: {},
    dirty: false,
    job_links: [],
    generated_results: [],
    created_at: "2026-07-30T10:00:00Z",
    modified_at: "2026-07-30T10:00:00Z",
  };
}

function project(proteinVisible = true, ligandVisible = false): Project {
  return {
    schema_version: 2,
    id: "project-1",
    name: "Viewer project",
    description: null,
    revision: 1,
    checkpoint_revision: 0,
    has_uncheckpointed_changes: true,
    created_at: "2026-07-30T10:00:00Z",
    modified_at: "2026-07-30T10:00:00Z",
    entries: [entry("protein", proteinVisible), entry("ligand", ligandVisible)],
    groups: [],
    saved_selections: [],
    measurements: [],
    scenes: [],
    structure_patches: [],
    topology_patches: [],
    history: {
      can_undo: true,
      can_redo: false,
      undo_description: "Import structures",
      redo_description: null,
      retained_commands: 1,
      limit: 200,
    },
  };
}

function projection(entryId: string): StructureProjection {
  const structure: StructureProjection["structure"] = {
    schema_version: 1,
    title: entryId,
    structure_type: entryId === "protein" ? "protein" : "ligand",
    chains: [],
    atoms: [
      {
        id: 1,
        name: "C1",
        element: "C",
        coordinates: [0, 0, 0],
        residue_id: entryId === "ligand" ? 1 : null,
        formal_charge: null,
        source_index: 0,
        alternate_location: null,
        occupancy: null,
        b_factor: null,
        inferred_fields: [],
      },
    ],
    bonds: [],
    residues:
      entryId === "ligand"
        ? [
            {
              id: 1,
              chain_id: 1,
              name: "LIG",
              author_number: 1,
              label_number: 1,
              insertion_code: null,
              component_type: "ligand",
            },
          ]
        : [],
    conformers: [],
    warnings: [],
  };
  return {
    entry_id: entryId,
    structure,
    hierarchy: componentHierarchy(structure),
    viewer: {
      format: entryId === "protein" ? "mmcif" : "sdf",
      data: `viewer data for ${entryId}`,
    },
  };
}

class FakeViewer implements MolecularViewer {
  sessionCamera: SessionCamera | null = null;
  sessionCameraListeners = new Set<(camera: SessionCamera) => void>();
  getSessionCamera() { return this.sessionCamera; }
  setSessionCamera(camera: SessionCamera) { this.sessionCamera = structuredClone(camera); }
  subscribeSessionCamera(listener: (camera: SessionCamera) => void) {
    this.sessionCameraListeners.add(listener);
    return () => { this.sessionCameraListeners.delete(listener); };
  }
  subscribeDrawable(listener: (drawable: boolean) => void) { void listener; return () => {}; }
  setInteractions = vi.fn(async () => {});
  mounted = false;
  mounts = 0;
  disposed = false;
  backgroundColors: string[] = [];
  syncs: ViewerStructure[][] = [];
  replacements: ViewerStructure[] = [];
  selections: AtomReference[][] = [];
  granularities: SelectionGranularity[] = [];
  focusTargets: AtomReference[][] = [];
  fits = 0;
  coordinatePatches: {
    patch: CoordinatePatch;
    mode: "preview" | "commit";
  }[] = [];
  listener:
    | ((event: {
        atoms: AtomReference[];
        granularity: SelectionGranularity;
        mode: SelectionMode;
      }) => void)
    | undefined;

  mount(): Promise<void> {
    this.mounted = true;
    this.mounts += 1;
    return Promise.resolve();
  }

  setBackgroundColor(cssColor: string): void {
    this.backgroundColors.push(cssColor);
  }

  syncStructures(structures: ViewerStructure[]): Promise<void> {
    this.syncs.push(structures);
    return Promise.resolve();
  }

  replaceStructure(structure: ViewerStructure): Promise<void> {
    this.replacements.push(structure);
    return Promise.resolve();
  }

  applyCoordinatePatch(
    patch: CoordinatePatch,
    mode: "preview" | "commit",
  ): Promise<void> {
    this.coordinatePatches.push({ patch, mode });
    return Promise.resolve();
  }

  clearCoordinatePreview(): Promise<void> {
    return Promise.resolve();
  }

  setSelection(atoms: AtomReference[]): void {
    this.selections.push(atoms);
  }

  setPickingGranularity(granularity: SelectionGranularity): void {
    this.granularities.push(granularity);
  }

  setMeasurements(): Promise<void> {
    return Promise.resolve();
  }

  setIsolation(): Promise<void> {
    return Promise.resolve();
  }

  getCamera(): CameraState | null {
    return null;
  }

  getMovementView() { return null; }
  getRenderedAtomReferences(): AtomReference[] { return []; }
  setMovementMode(): void {}

  setCamera(camera?: CameraState): void { void camera; }

  setCameraMode(): void {}

  zoom(): void {}

  focusAtoms(atoms: AtomReference[]): void {
    this.focusTargets.push(atoms);
  }

  fitVisible(): void {
    this.fits += 1;
  }

  subscribeCamera(): () => void {
    return () => undefined;
  }

  subscribeSelection(listener: NonNullable<FakeViewer["listener"]>): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  subscribeSurfaces(listener?: (statuses: SurfaceStatus[]) => void): () => void { void listener; return () => {}; }
  subscribeSurfaceSelection(): () => void { return () => {}; }
  setActiveSurface(): void {}
  cancelSurface(): void {}
  retrySurface(): void {}
  previewSurfaceAppearance(): Promise<void> { return Promise.resolve(); }
  resize(): void {}

  dispose(): void {
    this.disposed = true;
  }
}

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.toString() : input.url;
}

describe("lazy structure loading", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("requests only visible entries and synchronizes multiple projections", async () => {
    const fake = new FakeViewer();
    const createViewer = () => fake;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = requestUrl(input);
      const entryId = url.includes("/protein/") ? "protein" : "ligand";
      return Promise.resolve(
        new Response(JSON.stringify(projection(entryId)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender, unmount } = render(
      <StructureViewer
        project={project()}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={createViewer}
      />,
      { wrapper: wrapper(queryClient) },
    );

    // The host must have valid named semantics before any native renderer DOM exists.
    expect(screen.getByRole("region", { name: "3D molecular viewer" })).toBeVisible();
    await waitFor(() => {
      expect(fake.syncs.at(-1)?.map((item) => item.entryId)).toEqual(["protein"]);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestUrl(fetchSpy.mock.calls[0][0])).toContain("/protein/structure");

    const styled = project();
    styled.entries[0].viewer_settings.selection_representations = [
      { style: "thick-stick", atom_ids: [1] },
    ];
    styled.entries[0].viewer_settings.components.nonpolar_hydrogens = false;
    rerender(
      <StructureViewer
        project={styled}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={createViewer}
      />,
    );
    await waitFor(() => {
      expect(
        fake.syncs.at(-1)?.[0].settings.selection_representations,
      ).toEqual([{ style: "thick-stick", atom_ids: [1] }]);
      expect(
        fake.syncs.at(-1)?.[0].settings.components.nonpolar_hydrogens,
      ).toBe(false);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rerender(
      <StructureViewer
        project={project(true, true)}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={createViewer}
      />,
    );
    await waitFor(() => {
      expect(fake.syncs.at(-1)?.map((item) => item.entryId)).toEqual([
        "protein",
        "ligand",
      ]);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    rerender(
      <StructureViewer
        project={project(false, false)}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={createViewer}
      />,
    );
    await waitFor(() => expect(fake.syncs.at(-1)).toEqual([]));
    expect(screen.getByRole("region", { name: "3D molecular viewer" })).toBeVisible();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    unmount();
    expect(fake.disposed).toBe(true);
  });

  it("does not reload or rebuild the viewer for membership-only responses", async () => {
    const fake = new FakeViewer();
    const createViewer = () => fake;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(projection("protein")), { status: 200 }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const selected: Selection = { ...emptySelection, atoms: [{ structure_id: "protein", atom_id: 1 }] };
    const props = { theme: "light" as const, selection: selected, pickingGranularity: "atom" as const, onViewerSelection: vi.fn(), createViewer };
    const original = project();
    const { rerender } = render(<StructureViewer project={original} {...props} />, { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(1));
    const before = { syncs: fake.syncs.length, fits: fake.fits, selections: fake.selections.length };
    const moved = { ...original, revision: original.revision + 1, groups: [{ id: "new", parent_id: null, name: "New", created_at: original.created_at, modified_at: original.modified_at }], entries: original.entries.map((entry) => ({ ...entry, group_id: "new", dirty: true })) };
    rerender(<StructureViewer project={moved} {...props} />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fake.mounts).toBe(1);
    expect(fake.syncs).toHaveLength(before.syncs);
    expect(fake.fits).toBe(before.fits);
    expect(fake.selections).toHaveLength(before.selections);
    expect(fake.replacements).toEqual([]);
    expect(fake.coordinatePatches).toEqual([]);
    expect(props.onViewerSelection).not.toHaveBeenCalled();
  });

  it("surfaces a failed projection and retries successfully", async () => {
    const user = userEvent.setup();
    const fake = new FakeViewer();
    const update = vi.fn();
    const presentation = { bind: () => () => undefined, update } as unknown as PresentationController;
    let fails = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            fails
              ? { detail: { code: "structure_unavailable", message: "Snapshot missing" } }
              : projection("protein"),
          ),
          {
            status: fails ? 409 : 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <PresentationContext value={presentation}><StructureViewer
        project={project()}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={() => fake}
      /></PresentationContext>,
      { wrapper: wrapper(queryClient) },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "One or more structures could not be loaded.",
    );
    await waitFor(() => expect(update).toHaveBeenLastCalledWith(fake, "The molecular scene is unavailable", false));
    fails = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(fake.syncs.at(-1)?.map((item) => item.entryId)).toEqual(["protein"]),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(update).toHaveBeenLastCalledWith(fake, null, false));
  });

  it.each(["pending", "failed"] as const)("keeps exact entry warnings inspectable while a projection is %s", async mode => {
    const user = userEvent.setup();
    const fake = new FakeViewer();
    const current: Project = project();
    const warning = { code: "source_uncertain", message: "Source chemistry is uncertain.",
      severity: "warning" as const, operation: "import", field: null, blocking: false };
    current.entries[0].warnings = [warning, { ...warning }];
    current.entries[1].warnings = [{ ...warning, message: "Hidden entry warning." }];
    current.entries[0].atom_count = 250_000;
    const before = structuredClone(current);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => mode === "pending"
      ? new Promise<Response>(() => {})
      : Promise.resolve(new Response(JSON.stringify({ detail: { code: "structure_unavailable", message: "Snapshot missing" } }),
        { status: 409, headers: { "Content-Type": "application/json" } })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StructureViewer project={current} theme="light" selection={emptySelection}
      pickingGranularity="atom" onViewerSelection={() => undefined} createViewer={() => fake} />,
    { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    if (mode === "failed") expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    const syncs = fake.syncs.length;
    const trigger = screen.getByRole("button", { name: "Inspect 2 warnings for visible structures" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Structure warnings" })).toHaveAttribute("aria-modal", "false");
    expect(screen.getAllByText(warning.message)).toHaveLength(2);
    expect(screen.queryByText("Hidden entry warning.")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(current).toEqual(before);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fake.mounts).toBe(1);
    expect(fake.syncs).toHaveLength(syncs);
  });

  it("reflects application selection and emits only explicit viewer picks", async () => {
    const fake = new FakeViewer();
    const onViewerSelection = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(projection("protein")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const selected: Selection = {
      schema_version: 1,
      atoms: [{ structure_id: "protein", atom_id: 1 }],
      granularity: "atom",
      source: "sequence",
    };
    const { rerender } = render(
      <StructureViewer
        project={project()}
        theme="light"
        selection={selected}
        pickingGranularity="residue"
        onViewerSelection={onViewerSelection}
        createViewer={() => fake}
      />,
      { wrapper: wrapper(queryClient) },
    );

    await waitFor(() => expect(fake.selections.at(-1)).toEqual(selected.atoms));
    expect(fake.granularities.at(-1)).toBe("residue");
    expect(onViewerSelection).not.toHaveBeenCalled();

    fake.listener?.({
      atoms: [{ structure_id: "protein", atom_id: 1 }],
      granularity: "residue",
      mode: "add",
    });
    expect(onViewerSelection).toHaveBeenCalledOnce();
    expect(onViewerSelection).toHaveBeenCalledWith(
      { ...selected, granularity: "residue", source: "viewer" },
      "add",
    );

    rerender(
      <StructureViewer
        project={project()}
        theme="light"
        selection={{ ...selected, atoms: [] }}
        pickingGranularity="chain"
        onViewerSelection={onViewerSelection}
        createViewer={() => fake}
      />,
    );
    await waitFor(() => expect(fake.selections.at(-1)).toEqual([]));
    expect(fake.granularities.at(-1)).toBe("chain");
    expect(onViewerSelection).toHaveBeenCalledOnce();
  });

  it("routes quick camera actions without changing application selection", async () => {
    const user = userEvent.setup();
    const fake = new FakeViewer();
    const onViewerSelection = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const entryId = requestUrl(input).includes("/ligand/") ? "ligand" : "protein";
      return Promise.resolve(
        new Response(JSON.stringify(projection(entryId)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const selected: Selection = {
      schema_version: 1,
      atoms: [{ structure_id: "protein", atom_id: 1 }],
      granularity: "atom",
      source: "sequence",
    };
    render(
      <StructureViewer
        project={project(true, true)}
        theme="light"
        selection={selected}
        pickingGranularity="atom"
        onViewerSelection={onViewerSelection}
        createViewer={() => fake}
      />,
      { wrapper: wrapper(queryClient) },
    );

    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Fit all visible" }));
    await user.click(screen.getByRole("button", { name: "Focus selection" }));
    await user.click(
      screen.getByRole("button", { name: "Focus visible ligands" }),
    );

    expect(fake.fits).toBe(1);
    expect(fake.focusTargets).toEqual([
      selected.atoms,
      [{ structure_id: "ligand", atom_id: 1 }],
    ]);
    expect(onViewerSelection).not.toHaveBeenCalled();
  });

  it("patches only the affected coordinate model without a topology resync", async () => {
    const fake = new FakeViewer();
    const initial = project(true, true);
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const path =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const entryId = path.includes("/ligand/") ? "ligand" : "protein";
      return Promise.resolve(
        new Response(JSON.stringify(projection(entryId)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <StructureViewer
        project={initial}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={() => fake}
      />,
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(2));
    const syncCount = fake.syncs.length;
    const patch: CoordinatePatch = {
      entry_id: "protein",
      artifact_id: "coordinate-artifact",
      atom_ids: [1],
      coordinates: [[3, 4, 5]],
    };
    queryClient.setQueryData(
      ["structure", initial.id, "protein", patch.artifact_id],
      projection("protein"),
    );
    const next: Project = {
      ...initial,
      revision: 2,
      entries: initial.entries.map((item) =>
        item.id === "protein"
          ? { ...item, current_artifact_id: patch.artifact_id }
          : item,
      ),
      structure_patches: [patch],
    };

    view.rerender(
      <StructureViewer
        project={next}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={() => fake}
      />,
    );

    await waitFor(() =>
      expect(fake.coordinatePatches).toEqual([{ patch, mode: "commit" }]),
    );
    expect(fake.syncs).toHaveLength(syncCount);
  });

  it("reconciles a changed artifact without transient response patches after an interrupted Apply", async () => {
    const fake = new FakeViewer();
    const createViewer = () => fake;
    const initial = project();
    let current = projection("protein");
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify(current), { status: 200, headers: { "Content-Type": "application/json" } }),
    ));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = { theme: "light" as const, selection: emptySelection, pickingGranularity: "atom" as const,
      onViewerSelection: vi.fn(), createViewer };
    const view = render(<StructureViewer {...props} project={initial} />, { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(1));
    current = structuredClone(current);
    current.structure.atoms[0].coordinates = [7, 8, 9];
    const refreshed = { ...initial, revision: initial.revision + 1,
      entries: initial.entries.map(entry => entry.id === "protein" ? { ...entry, current_artifact_id: "reconciled-artifact" } : entry) };
    view.rerender(<StructureViewer {...props} project={refreshed} />);
    await waitFor(() => expect(fake.syncs.at(-1)?.[0].normalized.atoms[0].coordinates).toEqual([7, 8, 9]));
    expect(fake.coordinatePatches).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("replaces only the affected topology after its new artifact is loaded", async () => {
    const fake = new FakeViewer();
    const initial = project(true, true);
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const entryId = requestUrl(input).includes("/ligand/") ? "ligand" : "protein";
      return Promise.resolve(
        new Response(JSON.stringify(projection(entryId)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <StructureViewer
        project={initial}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={() => fake}
      />,
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(2));
    const syncCount = fake.syncs.length;
    const artifactId = "ligand-topology-2";
    const replacement = projection("ligand");
    replacement.structure.atoms = [1, 2, 3, 4].map((id) => ({
      ...replacement.structure.atoms[0],
      id,
      name: `C${id}`,
      source_index: id - 1,
    }));
    queryClient.setQueryData(
      ["structure", initial.id, "ligand", artifactId],
      replacement,
    );
    const next: Project = {
      ...initial,
      revision: 2,
      entries: initial.entries.map((item) =>
        item.id === "ligand"
          ? {
              ...item,
              atom_count: 4,
              atom_ids: [1, 2, 3, 4],
              current_artifact_id: artifactId,
            }
          : item,
      ),
      topology_patches: [{ entry_id: "ligand", artifact_id: artifactId }],
    };

    view.rerender(
      <StructureViewer
        project={next}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={() => fake}
      />,
    );

    await waitFor(() =>
      expect(fake.replacements.at(-1)?.normalized.atoms).toHaveLength(4),
    );
    expect(fake.replacements.at(-1)?.entryId).toBe("ligand");
    expect(fake.syncs).toHaveLength(syncCount);
  });

  it("uses a visible reduced-detail fallback above the recommended atom limit", async () => {
    const fake = new FakeViewer();
    const large = project();
    large.entries[0] = {
      ...large.entries[0],
      atom_count: 250_000,
      viewer_settings: {
        ...large.entries[0].viewer_settings,
        selection_representations: [
          { style: "space-filling", atom_ids: [1] },
        ],
        representations: [],
        surface_objects: [surfaceObject("surface", { kind: "entry" }, { opacity: 0.5 })],
        labels: {
          atoms: true,
          residues: true,
          chains: true,
          structure: true,
        },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(projection("protein")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <StructureViewer
        project={large}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={() => fake}
      />,
      { wrapper: wrapper(queryClient) },
    );

    expect(await screen.findByText("reduced detail")).toBeVisible();
    await waitFor(() => {
      expect(fake.syncs.at(-1)?.[0].settings.surface_objects[0].source.kind).toBe("entry");
    });
    expect(
      fake.syncs.at(-1)?.[0].settings.selection_representations,
    ).toEqual([{ style: "space-filling", atom_ids: [1] }]);
    expect(fake.syncs.at(-1)?.[0].settings.labels).toEqual({
      atoms: false,
      residues: false,
      chains: false,
      structure: true,
    });
  });

  it("updates the viewer background without remounting or resynchronizing structures", async () => {
    const fake = new FakeViewer();
    const createViewer = () => fake;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(projection("protein")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <StructureViewer
        project={project()}
        theme="dark"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={createViewer}
      />,
      { wrapper: wrapper(queryClient) },
    );

    await waitFor(() => {
      expect(fake.syncs).toHaveLength(1);
    });
    expect(fake.backgroundColors[0]).toBe("#171A1F");
    const syncCount = fake.syncs.length;

    view.rerender(
      <StructureViewer
        project={project()}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={createViewer}
      />,
    );

    await waitFor(() => {
      expect(fake.backgroundColors.at(-1)).toBe("#F4F1EB");
    });
    expect(fake.mounts).toBe(1);
    expect(fake.syncs).toHaveLength(syncCount);
  });

  it("surfaces viewer startup failures without hiding project status", async () => {
    const fake = new FakeViewer();
    fake.mount = () => Promise.reject(new Error("WebGL is unavailable."));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(projection("protein")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <StructureViewer
        project={project()}
        theme="light"
        selection={emptySelection}
        pickingGranularity="atom"
        onViewerSelection={() => undefined}
        createViewer={() => fake}
      />,
      { wrapper: wrapper(queryClient) },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("WebGL is unavailable.");
    expect(screen.getByRole("status")).toHaveTextContent("1 visible");
  });
});

const emptySelection: Selection = {
  schema_version: 1,
  atoms: [],
  granularity: "atom",
  source: "inspector",
};


it("ignores stale styling eligibility and closes the palette across project switches", async () => {
  const user = userEvent.setup();
  const fake = new FakeViewer();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let staleFailure = (_error: Error) => { void _error; };
  const first = new Promise<Map<string, StructureProjection>>((_resolve, reject) => { staleFailure = reject; });
  const next = projection("protein");
  next.structure.atoms[0] = { ...next.structure.atoms[0], id: 2, element: "H" };
  const load = vi.fn().mockReturnValueOnce(first).mockResolvedValue(new Map([["protein", next]]));
  const props: StructureViewerProps = { project: project(false, false), theme: "light",
    selection: { ...emptySelection, atoms: [{ structure_id: "protein", atom_id: 1 }] },
    pickingGranularity: "atom", onViewerSelection: vi.fn(), createViewer: () => fake,
    onLoadSelectionStructures: load, onSelectionStyle: vi.fn().mockResolvedValue(undefined),
    onAppearance: vi.fn().mockResolvedValue(undefined) };
  const view = render(<StructureViewer {...props} />, { wrapper: wrapper(queryClient) });
  await user.click(screen.getByRole("button", { name: "Style selection" }));
  expect(screen.getByLabelText("Selected non-polar hydrogens")).toBeDisabled();
  view.rerender(<StructureViewer {...props} selection={{ ...emptySelection, atoms: [{ structure_id: "protein", atom_id: 2 }] }} />);
  await waitFor(() => expect(screen.getByLabelText("Selected non-polar hydrogens")).toBeEnabled());
  await act(async () => { staleFailure(new Error("Old structure load failed")); await Promise.resolve(); });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Selected non-polar hydrogens")).toBeEnabled();
  view.rerender(<StructureViewer {...props} project={{ ...props.project, id: "other-project" }} />);
  expect(screen.queryByRole("dialog", { name: "Style selection" })).not.toBeInTheDocument();
  view.rerender(<StructureViewer {...props} />);
  expect(screen.queryByRole("dialog", { name: "Style selection" })).not.toBeInTheDocument();
  view.rerender(<StructureViewer {...props} onLoadSelectionStructures={undefined} />);
  await user.click(screen.getByRole("button", { name: "Style selection" }));
  expect(screen.queryByText("Checking explicit hydrogen targets…")).not.toBeInTheDocument();
  view.unmount();
  queryClient.clear();
});

it("loads hidden pocket seeds by artifact, keeps them invisible, and reuses style-only inputs", async () => {
  const fake = new FakeViewer(), createViewer = () => fake;
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const id = requestUrl(input).includes("/protein/") ? "protein" : "ligand";
    return Promise.resolve(new Response(JSON.stringify(projection(id)), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const current = project();
  current.entries[0].viewer_settings.surface_objects = [surfaceObject("pocket", {
    kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: "ligand", atom_id: 1 }],
  })];
  const props: StructureViewerProps = { project: current, theme: "light", selection: emptySelection,
    pickingGranularity: "atom", onViewerSelection: () => undefined, createViewer };
  const view = render(<StructureViewer {...props} />, { wrapper: wrapper(queryClient) });
  await waitFor(() => expect(fake.syncs.at(-1)?.[0].pockets?.pocket?.seeds).toHaveLength(1));
  expect(fake.syncs.at(-1)?.map((s) => s.entryId)).toEqual(["protein"]);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  const key = fake.syncs.at(-1)![0].pockets!.pocket.dependencyKey;
  const styled = structuredClone(current);
  styled.entries[0].viewer_settings.selection_hidden_atoms = [1];
  view.rerender(<StructureViewer {...props} project={styled} selection={{ ...emptySelection, atoms: [{ structure_id: "protein", atom_id: 1 }] }} />);
  await waitFor(() => expect(fake.syncs.at(-1)?.[0].settings.selection_hidden_atoms).toEqual([1]));
  expect(fake.syncs.at(-1)![0].pockets!.pocket.dependencyKey).toBe(key);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  const moved = structuredClone(styled);
  moved.entries[1].current_artifact_id = "new-ligand-coordinates";
  moved.structure_patches = [{ entry_id: "ligand", artifact_id: "new-ligand-coordinates", atom_ids: [1], coordinates: [[1, 2, 3]] }];
  view.rerender(<StructureViewer {...props} project={moved} />);
  await waitFor(() => expect(fake.coordinatePatches.some((item) => item.patch.entry_id === "ligand" && item.mode === "commit")).toBe(true));
  await waitFor(() => expect(fake.syncs.at(-1)?.[0].pockets?.pocket?.unavailable).toBeUndefined());
  expect(fetchSpy).toHaveBeenCalledTimes(3);
  expect(fake.syncs.at(-1)?.map((s) => s.entryId)).toEqual(["protein"]);
  expect(fake.syncs.at(-1)![0].pockets!.pocket.dependencyKey).not.toBe(key);
});

it("keeps loading through rendering and rejects obsolete rebuild completion and errors", async () => {
  cleanup(); vi.restoreAllMocks();
  const fake = new FakeViewer(), createViewer = () => fake;
  vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response(JSON.stringify(projection("protein")), {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
  const pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
  fake.syncStructures = () => new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = { project: project(), theme: "light" as const, selection: emptySelection,
    pickingGranularity: "atom" as const, onViewerSelection: vi.fn(), createViewer };
  const view = render(<StructureViewer {...props} />, { wrapper: wrapper(queryClient) });
  await waitFor(() => expect(pending.length).toBeGreaterThan(0));
  await waitFor(() => expect(screen.getByText(/1 visible \/ 1 loaded/)).toBeVisible());
  expect(screen.getByLabelText("Loading molecular structures")).toBeVisible();
  const previous = [...pending];
  const styled = structuredClone(props.project);
  styled.entries[0].viewer_settings.representations[0].opacity = 0.5;
  view.rerender(<StructureViewer {...props} project={styled} />);
  await waitFor(() => expect(pending.length).toBeGreaterThan(previous.length));
  await act(async () => {
    previous.forEach((item, index) => index ? item.reject(new Error("Obsolete render")) : item.resolve());
    await Promise.resolve();
  });
  expect(screen.getByLabelText("Loading molecular structures")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => { pending.at(-1)!.resolve(); await Promise.resolve(); });
  expect(screen.queryByLabelText("Loading molecular structures")).not.toBeInTheDocument();
  const completed = pending.length;
  const failing = structuredClone(styled);
  failing.entries[0].viewer_settings.representations[0].opacity = 0.6;
  view.rerender(<StructureViewer {...props} project={failing} />);
  await waitFor(() => expect(pending.length).toBeGreaterThan(completed));
  await act(async () => { pending.at(-1)!.reject(new Error("Current render failed")); await Promise.resolve(); });
  expect(screen.getByRole("alert")).toHaveTextContent("Current render failed");
  expect(screen.queryByLabelText("Loading molecular structures")).not.toBeInTheDocument();
  view.unmount(); queryClient.clear();
});

const savedCamera: SessionCamera = {
  mode: "orthographic", position: [21, -8, 47], target: [3, 4, -2],
  up: [1, 2, 0], radius: 0.003, fov: 0.57,
};
const navigatedCamera: SessionCamera = {
  mode: "perspective", position: [-14, 25, 63], target: [4, -2, 3],
  up: [2, 1, 0], radius: 11, fov: 0.92,
};
const fittedCamera: SessionCamera = {
  mode: "perspective", position: [0, 0, 18], target: [0, 0, 0],
  up: [0, 1, 0], radius: 7, fov: 0.73,
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

/** Emits accepted navigation separately from silent renderer restoration. */
class CameraViewer extends FakeViewer {
  restored: SessionCamera[] = [];
  sceneCameras: CameraState[] = [];
  cameraAtSync: (SessionCamera | null)[] = [];
  rendered: AtomReference[] = [];
  drawOnSync = true;
  commitDrawableOnSync = true;
  drawable = false;
  drawableListeners = new Set<(drawable: boolean) => void>();
  syncGate: Promise<void> | undefined;
  surfaceListener: ((statuses: SurfaceStatus[]) => void) | undefined;

  override setSessionCamera(camera: SessionCamera) {
    super.setSessionCamera(camera);
    this.restored.push(structuredClone(camera));
  }
  navigate(camera: SessionCamera) {
    this.sessionCamera = structuredClone(camera);
    for (const listener of this.sessionCameraListeners) listener(structuredClone(camera));
  }
  override getCamera(): CameraState | null {
    const camera = this.sessionCamera;
    return camera ? { mode: camera.mode, position: [...camera.position], target: [...camera.target],
      up: [...camera.up], radius: camera.radius } : null;
  }
  override setCamera(camera?: CameraState) {
    if (!camera) return;
    this.sceneCameras.push(structuredClone(camera));
    this.navigate({ ...camera, fov: this.sessionCamera?.fov ?? Math.PI / 4 });
  }
  override async syncStructures(structures: ViewerStructure[]) {
    this.cameraAtSync.push(structuredClone(this.sessionCamera));
    await super.syncStructures(structures);
    await this.syncGate;
    if (this.drawOnSync) {
      this.rendered = structures.flatMap(structure => structure.atomIds.map(atom_id => ({ structure_id: structure.entryId, atom_id })));
      if (this.commitDrawableOnSync) this.setDrawable(this.rendered.length > 0);
    }
  }
  override getRenderedAtomReferences() { return this.rendered; }
  override subscribeDrawable(listener: (drawable: boolean) => void) {
    this.drawableListeners.add(listener); listener(this.drawable);
    return () => { this.drawableListeners.delete(listener); };
  }
  setDrawable(drawable: boolean) {
    if (this.drawable === drawable) return;
    this.drawable = drawable;
    for (const listener of this.drawableListeners) listener(drawable);
  }
  override fitVisible() {
    super.fitVisible();
    if (this.drawable) this.navigate(fittedCamera);
  }
  override subscribeSurfaces(listener?: (statuses: SurfaceStatus[]) => void) {
    this.surfaceListener = listener;
    return () => { if (this.surfaceListener === listener) this.surfaceListener = undefined; };
  }
  surfaceReady() {
    this.setDrawable(true);
    this.surfaceListener?.([{ entryId: "protein", surfaceId: "entry", channel: "entry",
      label: "Receptor surface", state: "ready", message: "Ready" }]);
  }
}

describe("shared camera component lifecycle", () => {
  const controllers: WorkspacePresentationController[] = [];
  const clients: QueryClient[] = [];

  function controller(read: () => Promise<WorkspacePresentationV1>) {
    const memory = new Map<string, string>();
    const value = new WorkspacePresentationController({
      api: { read, write: (camera, revision) => Promise.resolve({ schema_version: 1, revision: revision + 1,
        camera, updated_at: "2026-11-14T03:00:00Z" }) },
      storage: { getItem: key => memory.get(key) ?? null, setItem: (key, content) => { memory.set(key, content); } },
    });
    controllers.push(value); value.start(); return value;
  }
  function props(cameraPresentation: WorkspacePresentationController, fake: CameraViewer, current = project()): StructureViewerProps {
    return { cameraPresentation, createViewer: () => fake, project: current, theme: "light",
      selection: emptySelection, pickingGranularity: "atom", onViewerSelection: vi.fn() };
  }
  function mount(options: StructureViewerProps) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    return render(<StructureViewer {...options} />, { wrapper: wrapper(client) });
  }
  const emptyPresentation = (): Promise<WorkspacePresentationV1> => Promise.resolve({ schema_version: 1, revision: 0, camera: null, updated_at: null });
  const savedPresentation = (): Promise<WorkspacePresentationV1> => Promise.resolve({ schema_version: 1, revision: 5,
    camera: savedCamera, updated_at: "2026-11-14T02:00:00Z" });

  beforeEach(() => {
    useWorkspaceStore.setState({ activeProjectId: "project-1" });
    useEditingStore.getState().setProject(null);
    useEditingStore.getState().setProject("project-1");
    vi.spyOn(globalThis, "fetch").mockImplementation(input => Promise.resolve(new Response(JSON.stringify(
      projection(requestUrl(input).includes("/ligand/") ? "ligand" : "protein")),
    { status: 200, headers: { "Content-Type": "application/json" } })));
  });
  afterEach(() => {
    cleanup();
    for (const value of controllers.splice(0)) value.stop();
    for (const client of clients.splice(0)) client.clear();
    useEditingStore.getState().setProject(null);
    useWorkspaceStore.setState({ activeProjectId: null });
    vi.restoreAllMocks();
  });

  it("seeds the complete saved pose before the first scene sync without fitting or losing FOV", async () => {
    const camera = controller(savedPresentation); await camera.hydrate();
    const fake = new CameraViewer(), options = props(camera, fake);
    const view = mount(options);
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(1));
    expect(fake.cameraAtSync.every(value => JSON.stringify(value) === JSON.stringify(savedCamera))).toBe(true);
    expect(fake.restored).toEqual([savedCamera]); expect(fake.fits).toBe(0);
    const styled = structuredClone(options.project);
    styled.entries[0].viewer_settings.representations[0].opacity = 0.4;
    view.rerender(<StructureViewer {...options} project={styled} />);
    await waitFor(() => expect(fake.syncs.at(-1)?.[0].settings.representations[0].opacity).toBe(0.4));
    expect(fake.getSessionCamera()).toEqual(savedCamera); expect(fake.fits).toBe(0);
    expect(camera.getSnapshot().navigationGeneration).toBe(0);
  });

  it("fits once globally and preserves later navigation across project, empty and responsive remounts", async () => {
    const camera = controller(emptyPresentation); await camera.hydrate();
    const first = new CameraViewer();
    const view = mount(props(camera, first));
    await waitFor(() => expect(first.fits).toBe(1));
    act(() => first.navigate(navigatedCamera));
    view.unmount();
    const second = new CameraViewer(), other = { ...project(false, false), id: "project-2" };
    useWorkspaceStore.setState({ activeProjectId: other.id });
    const options = props(camera, second, other), next = mount(options);
    await waitFor(() => expect(second.syncs.length).toBeGreaterThan(0));
    expect(second.syncs.at(-1)).toEqual([]); expect(second.getSessionCamera()).toEqual(navigatedCamera);
    const populated = { ...other, entries: project().entries };
    next.rerender(<StructureViewer {...options} project={populated} />);
    await waitFor(() => expect(second.syncs.at(-1)).toHaveLength(1));
    expect(second.fits).toBe(0); expect(second.getSessionCamera()).toEqual(navigatedCamera);
    next.unmount();
    const remounted = new CameraViewer();
    useWorkspaceStore.setState({ activeProjectId: "project-1" });
    mount(props(camera, remounted));
    await waitFor(() => expect(remounted.syncs.at(-1)).toHaveLength(1));
    expect(remounted.getSessionCamera()).toEqual(navigatedCamera); expect(remounted.fits).toBe(0);
    expect(first.fits + second.fits + remounted.fits).toBe(1);
  });

  it("keeps prehydration navigation when a delayed server pose arrives", async () => {
    const hydration = deferred<WorkspacePresentationV1>(), camera = controller(() => hydration.promise);
    const fake = new CameraViewer(); mount(props(camera, fake));
    await waitFor(() => expect(fake.mounted).toBe(true));
    expect(fake.syncs).toEqual([]);
    act(() => fake.navigate(navigatedCamera));
    await act(async () => { hydration.resolve(await savedPresentation()); await camera.hydrate(); });
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(1));
    expect(fake.restored).toEqual([]); expect(fake.getSessionCamera()).toEqual(navigatedCamera);
    expect(camera.getSnapshot().camera).toEqual(navigatedCamera); expect(fake.fits).toBe(0);
  });

  it("does not fit an initially held scene after newer navigation", async () => {
    const camera = controller(emptyPresentation); await camera.hydrate();
    const gate = deferred<void>(), fake = new CameraViewer(); fake.syncGate = gate.promise;
    mount(props(camera, fake));
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(1));
    act(() => fake.navigate(navigatedCamera));
    await act(async () => { gate.resolve(); await Promise.resolve(); });
    await waitFor(() => expect(fake.rendered.length).toBeGreaterThan(0));
    expect(fake.fits).toBe(0); expect(fake.getSessionCamera()).toEqual(navigatedCamera);
    expect(camera.getSnapshot().camera).toEqual(navigatedCamera);
  });

  it("waits for actual surface drawing before the single pristine fit", async () => {
    const camera = controller(emptyPresentation); await camera.hydrate();
    const fake = new CameraViewer(); fake.drawOnSync = false;
    const current = project(); current.entries[0].viewer_settings.representations = [];
    current.entries[0].viewer_settings.surface_objects = [surfaceObject("entry", { kind: "entry" })];
    mount(props(camera, fake, current));
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(1));
    await act(async () => { await Promise.resolve(); });
    expect(fake.fits).toBe(0); expect(camera.getSnapshot().camera).toBeNull();
    act(() => { fake.rendered = [{ structure_id: "protein", atom_id: 1 }]; fake.surfaceReady(); });
    await waitFor(() => expect(fake.fits).toBe(1));
    act(() => fake.surfaceReady());
    expect(fake.fits).toBe(1); expect(camera.getSnapshot().camera).toEqual(fittedCamera);
  });

  it("does not consume the initial fit when canonical references precede native drawable bounds", async () => {
    const camera = controller(emptyPresentation); await camera.hydrate();
    const fake = new CameraViewer(); fake.commitDrawableOnSync = false;
    mount(props(camera, fake));
    await waitFor(() => expect(fake.rendered).toEqual([{ structure_id: "protein", atom_id: 1 }]));
    await act(async () => { await Promise.resolve(); });
    expect(fake.drawable).toBe(false); expect(fake.fits).toBe(0);
    expect(fake.getSessionCamera()).toBeNull(); expect(camera.getSnapshot().camera).toBeNull();
    act(() => fake.setDrawable(true));
    await waitFor(() => expect(fake.fits).toBe(1));
    expect(fake.getSessionCamera()).toEqual(fittedCamera); expect(camera.getSnapshot().camera).toEqual(fittedCamera);
    act(() => { fake.setDrawable(false); fake.setDrawable(true); });
    expect(fake.fits).toBe(1);
  });

  it("releases an uncompleted fit on project replacement and ignores the retired installation", async () => {
    const camera = controller(emptyPresentation); await camera.hydrate();
    const gate = deferred<void>(), retired = new CameraViewer(); retired.syncGate = gate.promise;
    const previous = mount(props(camera, retired));
    await waitFor(() => expect(retired.syncs.at(-1)).toHaveLength(1));
    expect(retired.fits).toBe(0); previous.unmount();
    const current = new CameraViewer(), other = { ...project(), id: "project-2" };
    useWorkspaceStore.setState({ activeProjectId: other.id });
    mount(props(camera, current, other));
    await waitFor(() => expect(current.fits).toBe(1));
    await act(async () => { gate.resolve(); await Promise.resolve(); });
    expect(retired.fits).toBe(0); expect(current.fits).toBe(1);
    expect(current.getSessionCamera()).toEqual(fittedCamera); expect(camera.getSnapshot().camera).toEqual(fittedCamera);
  });

  it.each(["navigation", "replacement"] as const)("does not apply a held named-scene camera after %s supersedes it", async replacement => {
    const user = userEvent.setup(), camera = controller(emptyPresentation); await camera.hydrate();
    const publication = deferred<void>(), sceneSync = deferred<void>(), fake = new CameraViewer(); fake.syncGate = sceneSync.promise;
    const current = project();
    current.scenes = [{ id: "scene", name: "Captured scene", camera: { mode: "perspective", position: [0, 0, 25],
      target: [0, 0, 0], up: [0, 1, 0], radius: 10 }, entry_states: [], selection: emptySelection,
      created_at: "2026-11-14T02:00:00Z", modified_at: "2026-11-14T02:00:00Z" }];
    const apply = vi.fn(() => publication.promise), options = { ...props(camera, fake, current), onApplyScene: apply };
    const view = mount(options);
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Open viewer controls" }));
    await user.click(screen.getByRole("button", { name: "Captured scene" }));
    expect(apply).toHaveBeenCalledOnce(); expect(camera.getSnapshot().navigationGeneration).toBe(1);
    let live = fake;
    if (replacement === "navigation") act(() => fake.navigate(navigatedCamera));
    else {
      view.unmount();
      live = new CameraViewer();
      const other = { ...project(), id: "project-2" };
      useWorkspaceStore.setState({ activeProjectId: other.id });
      mount(props(camera, live, other));
      await waitFor(() => expect(live.syncs.at(-1)).toHaveLength(1));
      act(() => live.navigate(navigatedCamera));
    }
    await act(async () => { publication.resolve(); sceneSync.resolve(); await Promise.resolve(); });
    expect(fake.sceneCameras).toEqual([]); expect(live.sceneCameras).toEqual([]);
    expect(live.getSessionCamera()).toEqual(navigatedCamera); expect(fake.fits + (live === fake ? 0 : live.fits)).toBe(0);
  });

  it.each([
    { navigate: false, hydrateFirst: false }, { navigate: true, hydrateFirst: false },
    { navigate: false, hydrateFirst: true }, { navigate: true, hydrateFirst: true },
  ])("a failed prehydration scene reconciles saved state (newer input: $navigate, hydration first: $hydrateFirst)", async ({ navigate, hydrateFirst }) => {
    const user = userEvent.setup(), hydration = deferred<WorkspacePresentationV1>();
    const camera = controller(() => hydration.promise), publication = deferred<void>(), fake = new CameraViewer();
    const current = project();
    current.scenes = [{ id: "scene", name: "Captured scene", camera: { mode: "perspective", position: [0, 0, 25],
      target: [0, 0, 0], up: [0, 1, 0], radius: 10 }, entry_states: [], selection: emptySelection,
      created_at: "2026-11-14T02:00:00Z", modified_at: "2026-11-14T02:00:00Z" }];
    const apply = vi.fn(() => publication.promise), options = { ...props(camera, fake, current), onApplyScene: apply };
    mount(options);
    await waitFor(() => expect(fake.mounted).toBe(true));
    await user.click(screen.getByRole("button", { name: "Open viewer controls" }));
    await user.click(screen.getByRole("button", { name: "Captured scene" }));
    expect(apply).toHaveBeenCalledOnce(); expect(fake.syncs).toEqual([]);
    if (navigate) act(() => fake.navigate(navigatedCamera));
    const hydrate = async () => { hydration.resolve(await savedPresentation()); await camera.hydrate(); };
    if (hydrateFirst) await act(hydrate);
    await act(async () => { publication.reject(new Error("Scene publication failed")); await Promise.resolve(); });
    expect(screen.getByRole("alert")).toHaveTextContent("Scene publication failed");
    if (!hydrateFirst) await act(hydrate);
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(1));
    expect(fake.getSessionCamera()).toEqual(navigate ? navigatedCamera : savedCamera);
    expect(camera.getSnapshot().camera).toEqual(navigate ? navigatedCamera : savedCamera);
    expect(fake.restored).toEqual(navigate ? [] : [savedCamera]);
    expect(fake.sceneCameras).toEqual([]); expect(fake.fits).toBe(0);
    expect(options.onViewerSelection).not.toHaveBeenCalled();
  });

  it("keeps the saved camera when a newly created atom is selected", async () => {
    const camera = controller(savedPresentation); await camera.hydrate();
    const fake = new CameraViewer(), selection: Selection = { ...emptySelection,
      atoms: [{ structure_id: "ligand", atom_id: 1 }] };
    useEditingStore.getState().setFocusNewMolecule({ entryId: "ligand", atomId: 1, selection });
    mount({ ...props(camera, fake, project(true, true)), selection });
    await waitFor(() => expect(fake.syncs.at(-1)).toHaveLength(2));
    await waitFor(() => expect(useEditingStore.getState().focusNewMolecule).toBeNull());
    expect(fake.focusTargets).toEqual([]); expect(fake.fits).toBe(0); expect(fake.getSessionCamera()).toEqual(savedCamera);
  });
});
