import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { StructureProjection } from "../api/types";
import { seedCoordinateProjections } from "../coordinates/cache";
import { isCompleteProjection, structureQueryKey, structureQueryOptions } from "../structures/query";
import { molecularProject, proteinProjection } from "./molecular-fixtures";

const clients: QueryClient[] = [];
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); });
function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(value); return value;
}
function projection(artifactId: string, element = "C") {
  const value = proteinProjection(); value.artifact_id = artifactId;
  value.structure.atoms[0].element = element;
  return value;
}
const reply = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

it("sends the exact artifact condition and fetch cancellation signal", async () => {
  const data = projection("artifact/with spaces");
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(data));
  const cache = client();
  await expect(cache.fetchQuery(structureQueryOptions("project", "protein", data.artifact_id))).resolves.toEqual(data);
  const [path, init] = fetch.mock.calls[0];
  const url = new URL(typeof path === "string" ? path : path instanceof URL ? path.href : path.url, "http://localhost");
  expect(url.pathname).toBe("/api/v1/projects/project/entries/protein/structure");
  expect(url.searchParams.get("expected_artifact_id")).toBe(data.artifact_id);
  expect(init?.signal).toBeInstanceOf(AbortSignal);
});

it.each(["missing", "artifact", "entry", "null"])("rejects %s response identity before cache insertion", async failure => {
  const data: Partial<StructureProjection> | null = failure === "null" ? null : projection("requested");
  if (data && failure === "missing") delete data.artifact_id;
  if (data && failure === "artifact") data.artifact_id = "other";
  if (data && failure === "entry") data.entry_id = "other";
  vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(data));
  const cache = client(), options = structureQueryOptions("project", "protein", "requested");
  await expect(cache.fetchQuery(options)).rejects.toMatchObject({ status: 409, code: "structure_identity_mismatch" });
  expect(cache.getQueryData(options.queryKey)).toBeUndefined();
});

it("does not retain an Undo-time response under the edited artifact when Redo loads it again", async () => {
  const carbon = projection("carbon", "C"), nitrogen = projection("nitrogen", "N");
  let release!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValueOnce(reply(nitrogen));
  const cache = client();
  cache.setQueryData(structureQueryKey("project", "protein", "carbon"), carbon);
  const options = structureQueryOptions("project", "protein", "nitrogen");
  const held = cache.fetchQuery(options);
  const rejected = expect(held).rejects.toBeInstanceOf(ApiError);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  // Undo selects the existing carbon artifact before the held read is dispatched.
  expect(await cache.fetchQuery(structureQueryOptions("project", "protein", "carbon"))).toEqual(carbon);
  release(reply(carbon));
  await rejected;
  expect(cache.getQueryData(options.queryKey)).toBeUndefined();
  // Redo must perform a fresh conditional read, rather than reuse the carbon payload.
  const redone = await cache.fetchQuery(options);
  expect(redone.artifact_id).toBe("nitrogen");
  expect(redone.structure.atoms[0].element).toBe("N");
  expect(cache.getQueryData(structureQueryKey("project", "protein", "carbon"))).toEqual(carbon);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("shares one immutable read and only aborts when its last observer retires", async () => {
  let release!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const cache = client(), options = structureQueryOptions("project", "protein", "held");
  const first = new QueryObserver(cache, options), second = new QueryObserver(cache, options);
  const stopFirst = first.subscribe(() => {}), stopSecond = second.subscribe(() => {});
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const signal = fetch.mock.calls[0][1]!.signal!;
  stopFirst(); expect(signal.aborted).toBe(false);
  stopSecond(); expect(signal.aborted).toBe(true);
  release(reply(projection("held")));
  await Promise.resolve(); await Promise.resolve();
  expect(cache.getQueryData(options.queryKey)).toBeUndefined();
});

it("keeps a delayed previous project response separate from the current project", async () => {
  let release!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValueOnce(reply(projection("new", "N")));
  const cache = client();
  const previous = structureQueryOptions("previous", "protein", "old");
  const observer = new QueryObserver(cache, previous), stop = observer.subscribe(() => {});
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  stop();
  const current = structureQueryOptions("current", "protein", "new");
  await cache.fetchQuery(current);
  release(reply(projection("old", "C")));
  await Promise.resolve(); await Promise.resolve();
  expect(cache.getQueryData(previous.queryKey)).toBeUndefined();
  expect(cache.getQueryData<StructureProjection>(current.queryKey)?.structure.atoms[0].element).toBe("N");
});

it("refreshes provisional coordinate provenance for imperative readers and observers", async () => {
  const old = projection("old"), complete = projection("new");
  complete.structure.atoms[0].coordinates = [3, 4, 5];
  complete.structure.warnings = [{ code: "new_provenance", message: "Current artifact diagnostic", severity: "warning", operation: "coordinates", field: "coordinates", blocking: false }];
  let release!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const cache = client(), project = molecularProject(); project.entries[0].current_artifact_id = "old";
  const next = structuredClone(project); next.entries[0].current_artifact_id = "new";
  next.structure_patches = [{ entry_id: "protein", artifact_id: "new", atom_ids: [1], coordinates: [[3, 4, 5]] }];
  cache.setQueryData(structureQueryKey(project.id, "protein", "old"), old);
  seedCoordinateProjections(cache, project, next);
  const options = structureQueryOptions(project.id, "protein", "new");
  const seed = cache.getQueryData<StructureProjection>(options.queryKey)!;
  expect(seed.artifact_id).toBe("new");
  expect(seed.structure.atoms[0].coordinates).toEqual([3, 4, 5]);
  expect(isCompleteProjection(seed, "protein", "new")).toBe(false);
  const observer = new QueryObserver(cache, options), stop = observer.subscribe(() => {});
  const loaded = cache.fetchQuery(options);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  release(reply(complete));
  await expect(loaded).resolves.toEqual(complete);
  await waitFor(() => expect(isCompleteProjection(observer.getCurrentResult().data, "protein", "new")).toBe(true));
  expect(cache.getQueryData(structureQueryKey(project.id, "protein", "old"))).toEqual(old);
  stop();
});

it("keeps an already complete immutable projection when a coordinate patch arrives", () => {
  const cache = client(), project = molecularProject(), complete = projection("new");
  const next = structuredClone(project); next.entries[0].current_artifact_id = "new";
  next.structure_patches = [{ entry_id: "protein", artifact_id: "new", atom_ids: [1], coordinates: [[3, 4, 5]] }];
  const key = structureQueryKey(project.id, "protein", "new");
  cache.setQueryData(key, complete);
  seedCoordinateProjections(cache, project, next);
  expect(cache.getQueryData(key)).toBe(complete);
  expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
});
