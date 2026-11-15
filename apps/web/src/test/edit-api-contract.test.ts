import { afterEach, expect, it, vi } from "vitest";
import { projectApi } from "../api/client";
import type { ModelPreview, Selection } from "../api/types";
import { molecularEntry, molecularProject } from "./molecular-fixtures";
const project = molecularProject([molecularEntry("ligand", "Ligand", "ligand")]);
const operand: Selection = { schema_version: 1, atoms: [{ structure_id: "ligand", atom_id: 1 }], granularity: "atom", source: "viewer" };
afterEach(() => vi.restoreAllMocks());
it.each([{ operation: "atom.element", element: "N" } as const, { operation: "residue.mutate", target_name: "VAL" } as const])("tags one deliberate Apply without changing its payload: %s", async action => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  await projectApi.selectionEdit(project, "ligand", "current-ligand", operand, action, "preserve", "uuid");
  const [url, init] = fetch.mock.calls[0];
  expect(url).toContain(action.operation === "residue.mutate" ? "/selection-edits" : "/model-edits");
  expect(init?.headers).toEqual({ "Content-Type": "application/json", "X-Neistra-Edit-Attempt": "uuid" });
  const payload: unknown = JSON.parse(typeof init?.body === "string" ? init.body : "null"); expect(payload).toEqual({ expected_revision: project.revision, expected_artifact_id: "current-ligand", selection: operand, action,
    ...(action.operation === "residue.mutate" ? {} : { hydrogen_policy: "preserve" }) }); expect(fetch).toHaveBeenCalledOnce();
});
it("retains AbortSignal and Retry-After for disposable preview admission without an attempt header", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: { code: "editing_busy", message: "Busy" } }), { status: 429, headers: { "Retry-After": "1" } }));
  const abort = new AbortController();
  await expect(projectApi.modelPreview(project, "ligand", "current-ligand", operand, { operation: "bond.rotate", moving_endpoint_id: 2, angle_degrees: 30 }, "preserve", abort.signal)).rejects.toMatchObject({ status: 429, code: "editing_busy", retryAfterMs: 1000 });
  expect(fetch.mock.calls[0][1]?.signal).toBe(abort.signal); expect(fetch.mock.calls[0][1]?.headers).toEqual({ "Content-Type": "application/json" }); expect(fetch).toHaveBeenCalledOnce();
});
it("never retries Apply admission failure and reads the owned receipt through its dedicated endpoint", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ detail: { code: "editing_busy", message: "Busy" } }), { status: 429, headers: { "Retry-After": "1" } })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
  await expect(projectApi.selectionEdit(project, "ligand", "current-ligand", operand, { operation: "atom.delete" }, "preserve", "uuid")).rejects.toMatchObject({ code: "editing_busy" });
  expect(fetch).toHaveBeenCalledOnce(); await projectApi.editAttempt(project.id, "uuid");
  expect(fetch.mock.calls[1][0]).toBe(`/api/v1/projects/${project.id}/edit-attempts/uuid`); expect(fetch).toHaveBeenCalledTimes(2);
});
it("leaves an untagged legacy Apply compatible", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({} as ModelPreview), { status: 200 }));
  await projectApi.selectionEdit(project, "ligand", "current-ligand", operand, { operation: "atom.delete" });
  expect(fetch.mock.calls[0][1]?.headers).toEqual({ "Content-Type": "application/json" });
});
