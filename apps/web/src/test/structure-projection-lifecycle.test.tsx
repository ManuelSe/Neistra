import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { structureQueryOptions } from "../structures/query";
import { proteinProjection } from "./molecular-fixtures";

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); });

function Projection() {
  const query = useQuery(structureQueryOptions("project", "protein", "current-protein"));
  return <output>{query.data?.artifact_id ?? "Loading"}</output>;
}

it("dispatches one live immutable read through StrictMode effect retirement and re-subscription", async () => {
  const client = new QueryClient(); clients.push(client);
  let release!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const view = render(<StrictMode><QueryClientProvider client={client}><Projection /></QueryClientProvider></StrictMode>);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const signal = fetch.mock.calls[0][1]!.signal!;
  expect(signal.aborted).toBe(false);
  const data = proteinProjection();
  await act(async () => { release(Response.json(data)); await Promise.resolve(); });
  await waitFor(() => expect(screen.getByText("current-protein")).toBeVisible());
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(["structure", "project", "protein", "current-protein"])).toEqual(data);
  view.unmount();
});
