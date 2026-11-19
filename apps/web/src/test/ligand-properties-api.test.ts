import { afterEach, describe, expect, it, vi } from "vitest";
import { ligandPropertyApi } from "../ligandProperties/api";
import { propertyAllocation, propertyPreferences, propertyRegistry } from "./ligand-properties-fixtures";

afterEach(() => vi.restoreAllMocks());
describe("property protocol boundaries", () => {
  it("reads qualified registry and installation preferences", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(propertyRegistry)).mockResolvedValueOnce(Response.json(propertyPreferences));
    await expect(ligandPropertyApi.registry()).resolves.toEqual(propertyRegistry);
    await expect(ligandPropertyApi.preferences()).resolves.toEqual(propertyPreferences);
  });
  it.each([[], { revision: 0 }, { ...propertyPreferences, enabled_categories: ["composition", "composition"] }])("rejects malformed options without creating defaults", async response => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(response));
    await expect(ligandPropertyApi.preferences()).rejects.toThrow("could not be qualified");
  });
  it.each([[], { ...propertyRegistry, definitions: [] }, { ...propertyRegistry, policy_version: "different-policy" }])("rejects an unqualified property catalog", async response => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(response));
    await expect(ligandPropertyApi.registry()).rejects.toThrow("could not be qualified");
  });
  it("sends independent preference revision and asks the server to allocate ownership", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(propertyPreferences))
      .mockResolvedValueOnce(Response.json(propertyAllocation()));
    await ligandPropertyApi.savePreferences(7, ["composition"]); await ligandPropertyApi.allocate("project-1");
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({ expected_revision: 7, enabled_categories: ["composition"] }));
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/projects/project-1/ligand-properties/consumers");
    expect(fetcher.mock.calls[1][1]?.body).toBeUndefined();
  });
});
