import { describe, expect, it } from "vitest";
import { createSurfaceManagerSession, draftSource, sourceDraftProblem, surfaceObjectKey } from "../surfaces/surfaceManagerSession";
import { molecularEntry, surfaceObject } from "./molecular-fixtures";

describe("surface manager source session", () => {
  it("keeps captured sources independently across rows and unrelated authoritative updates", () => {
    const session = createSurfaceManagerSession("project");
    const entry = molecularEntry("protein", "Protein", "protein");
    const fragment = surfaceObject("f", { kind: "fragment", profile: "molecular-v1", atom_ids: [1] });
    const pocket = surfaceObject("p", { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: entry.id, atom_id: 1 }] });
    entry.viewer_settings.surface_objects = [fragment, pocket];
    const f = { entryId: entry.id, surfaceId: "f" }, p = { entryId: entry.id, surfaceId: "p" };
    session.stageSource(f, fragment.source, { kind: "fragment", profile: "molecular-v1", atom_ids: [2] });
    session.stageSource(p, pocket.source, pocket.source, "6");
    entry.current_artifact_id = "new-coordinates"; fragment.appearance.opacity = 0.2;
    session.reconcile([entry]);
    expect(session.hasUnappliedDrafts()).toBe(true);
    expect(sourceDraftProblem(session.getSnapshot().drafts[surfaceObjectKey(f)], [entry])).toBeNull();
    expect(draftSource(session.getSnapshot().drafts[surfaceObjectKey(p)])).toMatchObject({ radius: 6 });
    session.revertSource(f);
    expect(Object.keys(session.getSnapshot().drafts)).toEqual([surfaceObjectKey(p)]);
  });

  it("requires explicit recapture for changed sources or missing stable identities", () => {
    const session = createSurfaceManagerSession("project"), entry = molecularEntry("e", "Entry", "protein");
    const surface = surfaceObject("f", { kind: "fragment", profile: "molecular-v1", atom_ids: [1] });
    entry.viewer_settings.surface_objects = [surface];
    const identity = { entryId: entry.id, surfaceId: surface.id }, key = surfaceObjectKey(identity);
    session.stageSource(identity, surface.source, { kind: "fragment", profile: "molecular-v1", atom_ids: [2] });
    entry.atom_ids = [1, 3];
    expect(sourceDraftProblem(session.getSnapshot().drafts[key], [entry])).toMatch(/unavailable/);
    surface.source = { kind: "fragment", profile: "molecular-v1", atom_ids: [3] };
    expect(sourceDraftProblem(session.getSnapshot().drafts[key], [entry])).toMatch(/saved source changed/);
    session.stageSource(identity, surface.source, { kind: "fragment", profile: "molecular-v1", atom_ids: [1] }, undefined, true);
    expect(sourceDraftProblem(session.getSnapshot().drafts[key], [entry])).toBeNull();
  });

  it("keeps invalid radius text without creating a scientific value and removes exact reversions", () => {
    const session = createSurfaceManagerSession("project");
    const identity = { entryId: "e", surfaceId: "p" }, key = surfaceObjectKey(identity);
    const source = { kind: "pocket" as const, profile: "pocket-v1" as const, radius: 5, seed_atom_references: [{ structure_id: "e", atom_id: 1 }] };
    session.stageSource(identity, source, source, "");
    expect(draftSource(session.getSnapshot().drafts[key])).toBeNull();
    expect(session.getSnapshot().drafts[key].radiusText).toBe("");
    session.stageSource(identity, source, source, "5.0");
    expect(session.hasUnappliedDrafts()).toBe(false);
  });

  it("does not clear a newer draft when an earlier publication completes", () => {
    const session = createSurfaceManagerSession("project");
    const identity = { entryId: "e", surfaceId: "f" }, key = surfaceObjectKey(identity);
    const source = { kind: "fragment" as const, profile: "molecular-v1" as const, atom_ids: [1] };
    session.stageSource(identity, source, { ...source, atom_ids: [2] });
    const submitted = session.getSnapshot().drafts[key];
    session.stageSource(identity, source, { ...source, atom_ids: [3] });
    session.acceptSource(identity, submitted);
    expect(session.getSnapshot().drafts[key].source).toEqual({ ...source, atom_ids: [3] });
  });

  it("prunes removed and conflicted inactive previews without allowing retired tokens to recreate them", () => {
    const session = createSurfaceManagerSession("project"), entry = molecularEntry("e", "Entry", "protein");
    const surface = surfaceObject("surface", { kind: "entry" });
    entry.viewer_settings.surface_objects = [surface];
    const identity = { entryId: entry.id, surfaceId: surface.id };
    const token = session.beginPreview(identity, entry, surface);
    session.preview(identity, { ...surface.appearance, opacity: 0.2 }, "saving", token);
    const released = session.reconcile([]);
    expect(released.map(item => item.token)).toEqual([token]);
    expect(session.getSnapshot().previews).toEqual({});
    expect(session.preview(identity, { ...surface.appearance, opacity: 0.3 }, "uncertain", token)).toBe(false);
    const next = session.beginPreview(identity, entry, surface);
    session.preview(identity, { ...surface.appearance, opacity: 0.6 }, "saving", next);
    surface.appearance = { ...surface.appearance, opacity: 0.6 };
    expect(session.reconcile([entry]).map(item => item.token)).toEqual([next]);
    expect(session.getSnapshot().previews).toEqual({});
  });
});
