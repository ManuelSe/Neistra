import { afterEach, expect, it, vi } from "vitest";
import { projectApi } from "../api/client";

afterEach(() => vi.restoreAllMocks());

it("binds a disposable contact read to the requested artifact without a revision write", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
  const abort = new AbortController();
  await expect(projectApi.contacts({ id: "project" }, "entry", 3, 0.5, {
    expectedArtifactId: "current-source", signal: abort.signal,
  })).resolves.toEqual([]);
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("/api/v1/projects/project/contacts");
  expect(init?.signal).toBe(abort.signal);
  expect(init?.method).toBe("POST");
  expect(JSON.parse(init?.body as string)).toEqual({
    entry_id: "entry", cutoff: 3, minimum_distance: 0.5, expected_artifact_id: "current-source",
  });
});

it("preserves the existing optional-source contact request and inclusive zero minimum", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
  await projectApi.contacts({ id: "project" }, "entry", 2, 0);
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({
    entry_id: "entry", cutoff: 2, minimum_distance: 0,
  });
});

it.each([
  [429, "contacts_busy"], [409, "contacts_stale"], [413, "contacts_capacity"],
])("surfaces whole-read refusal %s without retrying stale intent", async (status, code) => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    detail: { code, message: "Analyze current coordinates." },
  }), { status }));
  await expect(projectApi.contacts({ id: "project" }, "entry", 2, 0.5)).rejects.toMatchObject({ status, code });
  expect(fetch).toHaveBeenCalledOnce();
});

it("aborts the held transport without changing cancellation into a connectivity error", async () => {
  const abort = new AbortController();
  const cancelled = new DOMException("Aborted", "AbortError");
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(cancelled), { once: true });
  }));
  const result = projectApi.contacts({ id: "project" }, "entry", 2, 0.5, { signal: abort.signal });
  const rejected = expect(result).rejects.toBe(cancelled);
  abort.abort();
  await rejected;
  expect(fetch).toHaveBeenCalledOnce();
});
