import { describe, expect, it } from "vitest";
import { surfacePruningWarnings } from "../selection/surfaceWarnings";
import { molecularProject, surfaceObject } from "./molecular-fixtures";

describe("surface topology notices", () => {
  it("names pruned and removed definitions in live state and scenes without changing molecular warnings", () => {
    const before = molecularProject();
    const entry = before.entries[0];
    entry.atom_ids = [1, 2];
    entry.viewer_settings.surface_objects = [surfaceObject("f", { kind: "fragment", profile: "molecular-v1", atom_ids: [1, 2] }), surfaceObject("p", { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: entry.id, atom_id: 2 }] })];
    before.scenes = [{ id: "scene", name: "Saved view", entry_states: [{ entry_id: entry.id, visible: true, viewer_settings: structuredClone(entry.viewer_settings) }] } as typeof before.scenes[number]];
    const after = structuredClone(before);
    after.entries[0].atom_ids = [1];
    after.entries[0].viewer_settings.surface_objects = [surfaceObject("f", { kind: "fragment", profile: "molecular-v1", atom_ids: [1] })];
    after.scenes[0].entry_states[0].viewer_settings.surface_objects = [];
    const warnings = surfacePruningWarnings(before, after);
    expect(warnings).toHaveLength(4);
    expect(warnings.join(" ")).toContain("deleted references");
    expect(warnings.join(" ")).toContain("no captured seeds");
    expect(warnings.join(" ")).toContain("Scene “Saved view”");
    expect(after.entries[0].warnings).toEqual(before.entries[0].warnings);
    expect(surfacePruningWarnings(after, before)).toEqual([]);
  });
  it("does not warn on explicit display edits, object deletion, or project changes", () => {
    const before = molecularProject();
    before.entries[0].viewer_settings.surface_objects = [surfaceObject("f", { kind: "fragment", profile: "molecular-v1", atom_ids: [1] })];
    const after = structuredClone(before);
    after.entries[0].viewer_settings.surface_objects = [];
    expect(surfacePruningWarnings(before, after)).toEqual([]);
    after.id = "different-project";
    after.entries = [];
    expect(surfacePruningWarnings(before, after)).toEqual([]);
  });
});
