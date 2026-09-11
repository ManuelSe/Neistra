import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AtomReference,
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

type StructureViewerProps = Omit<
  ComponentProps<typeof ProductionStructureViewer>,
  "onPickingGranularity"
> & {
  onPickingGranularity?: ComponentProps<
    typeof ProductionStructureViewer
  >["onPickingGranularity"];
};

function StructureViewer(props: StructureViewerProps) {
  return (
    <ProductionStructureViewer
      onPickingGranularity={() => undefined}
      {...props}
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
    schema_version: 1,
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

  getCamera() {
    return null;
  }

  setCamera(): void {}

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
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    unmount();
    expect(fake.disposed).toBe(true);
  });

  it("surfaces a failed projection and retries successfully", async () => {
    const user = userEvent.setup();
    const fake = new FakeViewer();
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "One or more structures could not be loaded.",
    );
    fails = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(fake.syncs.at(-1)?.map((item) => item.entryId)).toEqual(["protein"]),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
        representations: [
          {
            id: "surface",
            style: "surface",
            color_by: "element",
            custom_color: "#3b82f6",
            opacity: 0.5,
          },
        ],
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
      expect(fake.syncs.at(-1)?.[0].settings.representations[0].style).toBe("line");
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
