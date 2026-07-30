import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project, StructureProjection } from "../api/types";
import { StructureViewer } from "../components/StructureViewer";
import type {
  MolecularViewer,
  ViewerStructure,
} from "../viewer/MolecularViewer";

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
    bond_count: 1,
    residue_count: 1,
    conformer_count: 1,
    warnings: [],
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
  return {
    entry_id: entryId,
    structure: {
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
          residue_id: null,
          formal_charge: null,
          source_index: 0,
          alternate_location: null,
          occupancy: null,
          b_factor: null,
          inferred_fields: [],
        },
      ],
      bonds: [],
      residues: [],
      conformers: [],
      warnings: [],
    },
    viewer: {
      format: entryId === "protein" ? "mmcif" : "sdf",
      data: `viewer data for ${entryId}`,
    },
  };
}

class FakeViewer implements MolecularViewer {
  mounted = false;
  disposed = false;
  syncs: ViewerStructure[][] = [];

  mount(): Promise<void> {
    this.mounted = true;
    return Promise.resolve();
  }

  syncStructures(structures: ViewerStructure[]): Promise<void> {
    this.syncs.push(structures);
    return Promise.resolve();
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
      <StructureViewer project={project()} createViewer={createViewer} />,
      { wrapper: wrapper(queryClient) },
    );

    await waitFor(() => {
      expect(fake.syncs.at(-1)?.map((item) => item.entryId)).toEqual(["protein"]);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestUrl(fetchSpy.mock.calls[0][0])).toContain("/protein/structure");

    rerender(
      <StructureViewer project={project(true, true)} createViewer={createViewer} />,
    );
    await waitFor(() => {
      expect(fake.syncs.at(-1)?.map((item) => item.entryId)).toEqual([
        "protein",
        "ligand",
      ]);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    rerender(
      <StructureViewer project={project(false, false)} createViewer={createViewer} />,
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
    render(<StructureViewer project={project()} createViewer={() => fake} />, {
      wrapper: wrapper(queryClient),
    });

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
});
