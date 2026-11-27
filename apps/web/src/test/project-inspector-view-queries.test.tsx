import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectInspector, type InspectorView } from "../components/ProjectInspector";
import { emptySelection } from "../selection/selection";
import { structureQueryKey } from "../structures/query";
import { molecularEntry, molecularProject, proteinProjection } from "./molecular-fixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("preserves exact-source qualification and deferred reads across ligand/tools visits", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const entry = { ...molecularEntry("hidden", "Hidden protein", "protein"), visible: false, current_artifact_id: "current" };
  const project = molecularProject([entry]);
  project.measurements = [{ id: "saved", name: "Saved distance", kind: "distance", visible: true,
    atom_references: [1, 2].map(atom_id => ({ structure_id: entry.id, atom_id })), warnings: [],
    created_at: project.created_at, modified_at: project.modified_at }];
  const complete = proteinProjection();
  complete.entry_id = entry.id; complete.artifact_id = entry.current_artifact_id;
  complete.structure.atoms[0] = { ...complete.structure.atoms[0], coordinates: [0, 0, 0] };
  complete.structure.atoms[1] = { ...complete.structure.atoms[1], coordinates: [0, 0, 5] };
  const key = structureQueryKey(project.id, entry.id, entry.current_artifact_id);
  client.setQueryData(key, { ...complete, projection_state: "coordinate-seed" as const });
  let release!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const noop = () => undefined;
  const tree = (view: InspectorView) => <QueryClientProvider client={client}><Tooltip.Provider><ProjectInspector
    project={project} view={view} task="measurements" selection={emptySelection()} pickingGranularity="atom" busy={false}
    ligandControls={<p>Ligand information body</p>} onApply={noop} onApplySelection={noop} onPickingGranularity={noop}
    onClearSelection={noop} onExpandSelection={noop} onInvertSelection={noop} onPredicateSelection={noop}
    onSpatialSelection={noop} onSaveSelection={noop} onLoadSelection={noop} onDeleteSelection={noop}
  /></Tooltip.Provider></QueryClientProvider>;
  const row = () => screen.getByLabelText("Name for Saved distance").closest(".measurement-row");
  const rendered = render(tree("ligand"));
  try {
    await act(async () => { await Promise.resolve(); });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Ligand information body")).toBeVisible();
    rendered.rerender(tree("tools"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][0]).toBe(`/api/v1/projects/${project.id}/entries/${entry.id}/structure?expected_artifact_id=${entry.current_artifact_id}`);
    expect(row()).toHaveTextContent("Unavailable");
    await act(async () => { release(new Response(JSON.stringify(complete), { status: 200 })); await Promise.resolve(); });
    await waitFor(() => expect(row()).toHaveTextContent("5.00 Å"));
    const owner = rendered.container.querySelector(".inspector-scroll")!;
    const toolsVisit = owner.getAttribute("data-inspector-visit");
    fetch.mockRejectedValue(new Error("Source read failed"));
    await act(async () => { await client.refetchQueries({ queryKey: key, exact: true }); });
    expect(client.getQueryData(key)).toEqual(complete);
    await waitFor(() => expect(row()).toHaveTextContent("Unavailable"));
    rendered.rerender(tree("ligand"));
    expect(owner.getAttribute("data-inspector-visit")).not.toBe(toolsVisit);
    rendered.rerender(tree("tools"));
    expect(screen.getByRole("tab", { name: "measurements" })).toHaveAttribute("aria-selected", "true");
    expect(row()).toHaveTextContent("Unavailable");
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    let recovery!: Promise<void>;
    act(() => { recovery = client.refetchQueries({ queryKey: key, exact: true }); });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    rendered.rerender(tree("ligand")); rendered.rerender(tree("tools"));
    expect(row()).toHaveTextContent("Unavailable");
    await act(async () => { release(new Response(JSON.stringify(complete), { status: 200 })); await recovery; });
    await waitFor(() => expect(row()).toHaveTextContent("5.00 Å"));
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally { client.clear(); }
});
