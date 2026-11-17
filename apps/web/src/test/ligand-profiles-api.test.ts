import { afterEach, describe, expect, it, vi } from "vitest";
import metadata from "../../../../tests/fixtures/profiles/registry.json";
import { ligandProfileApi } from "../ligandProfiles/api";
import { profileConstraints } from "../ligandProfiles/validate";

afterEach(() => { vi.unstubAllGlobals(); });
describe("profile metadata transport", () => {
  it("qualifies unknown HTTP JSON into an immutable registry with usable compiled constraints", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata), { status: 200 })); vi.stubGlobal("fetch", fetch);
    const controller = new AbortController(), registry = await ligandProfileApi.registry(controller.signal);
    expect(fetch).toHaveBeenCalledWith("/api/v1/ligand-profiles/registry", expect.objectContaining({ signal: controller.signal }));
    expect(Object.isFrozen(registry)).toBe(true); expect(profileConstraints(registry, "ro5")).toHaveLength(4);
  });
  it("rejects malformed successful metadata instead of trusting its TypeScript shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...metadata, constraints: [] }), { status: 200 })));
    await expect(ligandProfileApi.registry()).rejects.toThrow();
  });
  it("propagates a scoped HTTP failure for explicit recovery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "unavailable", message: "Unavailable" } }), { status: 503 })));
    await expect(ligandProfileApi.registry()).rejects.toMatchObject({ status: 503 });
  });
});
