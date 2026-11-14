import { expect, it } from "vitest";
import { createdSurfaceIdentities } from "../surfaces/createdSurfaces";
import { molecularEntry, molecularProject, surfaceObject } from "./molecular-fixtures";

function fixture() {
  const before = molecularProject([molecularEntry("a", "A", "ligand"), molecularEntry("b", "B", "ligand")]);
  before.entries[0].viewer_settings.surface_objects = [surfaceObject("existing", { kind: "entry" })];
  const after = structuredClone(before);
  after.entries[0].viewer_settings.surface_objects.push(surfaceObject("a1", { kind: "entry" }), surfaceObject("a2", { kind: "entry" }));
  after.entries[1].viewer_settings.surface_objects.push(surfaceObject("b1", { kind: "entry" }));
  return { before, after };
}

it("identifies duplicate and interleaved creations in request order without name/source matching", () => {
  const { before, after } = fixture();
  after.entries.reverse();
  expect(createdSurfaceIdentities(before, after, [
    { entry_id: "a", source: { kind: "entry" } }, { entry_id: "b", source: { kind: "entry" } },
    { entry_id: "a", source: { kind: "entry" } },
  ])).toEqual([{ entryId: "a", surfaceId: "a1" }, { entryId: "b", surfaceId: "b1" }, { entryId: "a", surfaceId: "a2" }]);
  expect(before.entries[0].viewer_settings.surface_objects.map(surface => surface.id)).toEqual(["existing"]);
});

it("refuses missing or extra per-owner results instead of activating an arbitrary surface", () => {
  const { before, after } = fixture();
  expect(() => createdSurfaceIdentities(before, after, [{ entry_id: "a", source: { kind: "entry" } }])).toThrow("Inspect Surfaces before creating again");
  expect(() => createdSurfaceIdentities(before, before, [{ entry_id: "b", source: { kind: "entry" } }])).toThrow("could not be confirmed");
});

it("refuses duplicate returned identities and replies belonging to another project", () => {
  const { before, after } = fixture();
  after.entries[0].viewer_settings.surface_objects[2].id = "a1";
  expect(() => createdSurfaceIdentities(before, after, [
    { entry_id: "a", source: { kind: "entry" } }, { entry_id: "a", source: { kind: "entry" } },
  ])).toThrow("could not be confirmed");
  after.id = "other";
  expect(() => createdSurfaceIdentities(before, after, [])).toThrow("could not be confirmed");
});

it("refuses a missing owner rather than using the current active entry", () => {
  const { before, after } = fixture();
  expect(() => createdSurfaceIdentities(before, after, [{ entry_id: "retired", source: { kind: "entry" } }])).toThrow("could not be confirmed");
});
