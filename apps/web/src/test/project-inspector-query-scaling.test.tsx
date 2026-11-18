import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectInspector } from "../components/ProjectInspector";
import { emptySelection } from "../selection/selection";
import { structureQueryKey } from "../structures/query";
import { molecularEntry, molecularProject, proteinProjection } from "./molecular-fixtures";

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

function inspector(project: ComponentProps<typeof ProjectInspector>["project"], client: QueryClient) {
  const noop = () => undefined;
  return <QueryClientProvider client={client}><Tooltip.Provider><ProjectInspector
    project={project} selection={emptySelection()} pickingGranularity="atom" busy={false}
    onApply={noop} onApplySelection={noop} onPickingGranularity={noop} onClearSelection={noop}
    onExpandSelection={noop} onInvertSelection={noop} onPredicateSelection={noop}
    onSpatialSelection={noop} onSaveSelection={noop} onLoadSelection={noop} onDeleteSelection={noop}
  /></Tooltip.Provider></QueryClientProvider>;
}

it("keeps inspector projection work linear across 100 and 1000 hidden eligible entries", async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(QueryObserver.prototype, "trackProp");
  if (!originalDescriptor || typeof originalDescriptor.value !== "function") throw new Error("Query property tracking is unavailable");
  const originalTrackProp = originalDescriptor.value as QueryObserver["trackProp"];
  const samples: { entries: number; trackedProperties: number; entryIdReads: number }[] = [];
  let trackedProperties = 0;
  // Count actual library work without retaining millions of mock call records.
  QueryObserver.prototype.trackProp = function (key) { trackedProperties++; originalTrackProp.call(this, key); };
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected molecular read"));
  try {
    for (const count of [100, 1000]) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
      clients.push(client);
      const entries = Array.from({ length: count }, (_, index) => ({
        ...molecularEntry(`protein-${index}`, `Protein ${index}`, "protein"), visible: false,
      }));
      const project = molecularProject(entries);
      for (const entry of entries) {
        const projection = proteinProjection();
        projection.entry_id = entry.id;
        projection.artifact_id = entry.current_artifact_id!;
        client.setQueryData(structureQueryKey(project.id, entry.id, entry.current_artifact_id), projection);
      }
      let entryIdReads = 0;
      for (const entry of entries) {
        const id = entry.id;
        Object.defineProperty(entry, "id", { enumerable: true, get: () => { entryIdReads++; return id; } });
      }
      trackedProperties = 0;
      render(inspector(project, client));
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByRole("region", { name: "Project inspector" })).toBeInTheDocument();
      const observed = client.getQueryCache().findAll({ queryKey: ["structure", project.id] });
      expect(observed).toHaveLength(count);
      expect(observed.every(query => query.getObserversCount() > 0)).toBe(true);
      samples.push({ entries: count, trackedProperties, entryIdReads });
      cleanup();
      client.clear();
    }
    expect(fetch).not.toHaveBeenCalled();
    console.info("Inspector projection work", JSON.stringify(samples));
    for (const sample of samples) {
      expect(sample.trackedProperties, JSON.stringify(samples)).toBeLessThanOrEqual(sample.entries * 16);
      expect(sample.entryIdReads, JSON.stringify(samples)).toBeLessThanOrEqual(sample.entries * 30);
    }
  } finally { Object.defineProperty(QueryObserver.prototype, "trackProp", originalDescriptor); }
}, 20_000);

function measuredProject(id: string, artifact = "current-hidden") {
  const entry = { ...molecularEntry("hidden", "Hidden protein", "protein"), visible: false, current_artifact_id: artifact };
  const project = { ...molecularProject([entry]), id };
  project.measurements = [{ id: "saved", name: "Saved distance", kind: "distance", visible: true,
    atom_references: [1, 2].map(atom_id => ({ structure_id: entry.id, atom_id })), warnings: [],
    created_at: project.created_at, modified_at: project.modified_at }];
  return project;
}

function projection(artifact: string, distance: number) {
  const value = proteinProjection();
  value.entry_id = "hidden"; value.artifact_id = artifact;
  value.structure.atoms[0] = { ...value.structure.atoms[0], coordinates: [0, 0, 0] };
  value.structure.atoms[1] = { ...value.structure.atoms[1], coordinates: [0, 0, distance] };
  return value;
}

function queryClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client); return client;
}

const savedRow = () => screen.getByLabelText("Name for Saved distance").closest(".measurement-row");

it("keeps hidden-source seed, completion, retained-data failure and recovery notifications", async () => {
  const client = queryClient(), project = measuredProject("project-a", "old");
  client.setQueryData(structureQueryKey(project.id, "hidden", "old"), projection("old", 3));
  const fetch = vi.spyOn(globalThis, "fetch");
  let release!: (response: Response) => void;
  fetch.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const view = render(inspector(project, client));
  await userEvent.setup().click(screen.getByRole("tab", { name: "measurements" }));
  expect(savedRow()).toHaveTextContent("3.00 Å");
  const next = measuredProject(project.id, "new"), key = structureQueryKey(project.id, "hidden", "new");
  const seed = { ...projection("new", 5), projection_state: "coordinate-seed" as const };
  act(() => { client.setQueryData(key, seed); });
  view.rerender(inspector(next, client));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(savedRow()).toHaveTextContent("Unavailable");
  const complete = projection("new", 5);
  await act(async () => { release(new Response(JSON.stringify(complete), { status: 200 })); await Promise.resolve(); });
  await waitFor(() => expect(savedRow()).toHaveTextContent("5.00 Å"));
  fetch.mockRejectedValue(new Error("Physical source unavailable"));
  await act(async () => { await client.refetchQueries({ queryKey: key, exact: true }); });
  expect(client.getQueryData(key)).toEqual(complete);
  await waitFor(() => expect(savedRow()).toHaveTextContent("Unavailable"));
  act(() => { client.setQueryData(key, complete); });
  await waitFor(() => expect(savedRow()).toHaveTextContent("5.00 Å"));
});

it("rejects held prior-project work through project ABA and entry removal", async () => {
  const client = queryClient(), first = measuredProject("project-a", "old");
  let release!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const view = render(inspector(first, client));
  await userEvent.setup().click(screen.getByRole("tab", { name: "measurements" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(savedRow()).toHaveTextContent("Unavailable");
  const second = measuredProject("project-b", "other");
  client.setQueryData(structureQueryKey(second.id, "hidden", "other"), projection("other", 7));
  view.rerender(inspector(second, client));
  await waitFor(() => expect(savedRow()).toHaveTextContent("7.00 Å"));
  const returned = measuredProject(first.id, "new");
  client.setQueryData(structureQueryKey(returned.id, "hidden", "new"), projection("new", 9));
  view.rerender(inspector(returned, client));
  await waitFor(() => expect(savedRow()).toHaveTextContent("9.00 Å"));
  await act(async () => { release(new Response(JSON.stringify(projection("old", 3)), { status: 200 })); await Promise.resolve(); });
  expect(savedRow()).toHaveTextContent("9.00 Å");
  expect(client.getQueryData(structureQueryKey(first.id, "hidden", "old"))).toBeUndefined();
  view.rerender(inspector({ ...returned, entries: [] }, client));
  await waitFor(() => expect(screen.getByRole("tab", { name: "details" })).toHaveAttribute("aria-selected", "true"));
  await userEvent.setup().click(screen.getByRole("tab", { name: "measurements" }));
  await waitFor(() => expect(savedRow()).toHaveTextContent("Unavailable"));
  expect(fetch).toHaveBeenCalledTimes(1);
});
