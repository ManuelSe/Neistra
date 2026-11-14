import type { MolecularViewer } from "../viewer/MolecularViewer";
import { expect, it, vi } from "vitest";
import { createSurfaceManagerSession } from "../surfaces/surfaceManagerSession";
import { replaySurfacePreviews } from "../surfaces/surfacePreviewBinding";
import { molecularEntry, surfaceObject } from "./molecular-fixtures";

function fixture() {
  const entry = molecularEntry("owner", "Molecule", "ligand");
  entry.viewer_settings.surface_objects = [surfaceObject("first", { kind: "entry" }), surfaceObject("second", { kind: "entry" })];
  const session = createSurfaceManagerSession("project");
  for (const [index, surface] of entry.viewer_settings.surface_objects.entries()) {
    const identity = { entryId: entry.id, surfaceId: surface.id };
    const token = session.beginPreview(identity, entry, surface);
    session.preview(identity, { ...surface.appearance, opacity: index === 0 ? 0.2 : 0.7 }, index === 0 ? "saving" : "uncertain", token);
  }
  return { entry, session };
}

it("rebinds pending and uncertain intent to a replacement viewer without publishing commands", async () => {
  const { entry, session } = fixture(), apply = vi.fn<MolecularViewer["previewSurfaceAppearance"]>().mockResolvedValue(undefined);
  await replaySurfacePreviews(session, { previewSurfaceAppearance: apply }, () => [entry], () => true);
  expect(apply.mock.calls.map(([identity, appearance]) => [identity, (appearance as { opacity: number }).opacity])).toEqual([
    [{ entryId: "owner", surfaceId: "first" }, 0.2], [{ entryId: "owner", surfaceId: "second" }, 0.7],
  ]);
  expect(entry.viewer_settings.surface_objects.map(surface => surface.appearance.opacity)).toEqual([0.45, 0.45]);
});

it("does not replay a retired token after an asynchronous earlier installation", async () => {
  const { entry, session } = fixture(); let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const apply = vi.fn<MolecularViewer["previewSurfaceAppearance"]>().mockImplementationOnce(() => held).mockResolvedValue(undefined);
  const replay = replaySurfacePreviews(session, { previewSurfaceAppearance: apply }, () => [entry], () => true);
  expect(apply).toHaveBeenCalledTimes(1);
  session.clearPreview({ entryId: "owner", surfaceId: "second" }); release(); await replay;
  expect(apply).toHaveBeenCalledTimes(1);
});

it("reads a superseding token immediately before its application", async () => {
  const { entry, session } = fixture(); let release!: () => void;
  const apply = vi.fn<MolecularViewer["previewSurfaceAppearance"]>().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const replay = replaySurfacePreviews(session, { previewSurfaceAppearance: apply }, () => [entry], () => true);
  const surface = entry.viewer_settings.surface_objects[1], identity = { entryId: entry.id, surfaceId: surface.id };
  const token = session.beginPreview(identity, entry, surface);
  session.preview(identity, { ...surface.appearance, opacity: 0.9 }, "saving", token);
  release(); await replay;
  expect(apply).toHaveBeenLastCalledWith(identity, expect.objectContaining({ opacity: 0.9 }));
});

it("rejects confirmed, conflicting, hidden and removed owners from current canonical data", async () => {
  const { entry, session } = fixture(), apply = vi.fn<MolecularViewer["previewSurfaceAppearance"]>().mockResolvedValue(undefined);
  const current = structuredClone(entry);
  current.viewer_settings.surface_objects[0].appearance.opacity = 0.2; // Already confirmed.
  current.viewer_settings.surface_objects[1].appearance.opacity = 0.8; // Conflicting publication.
  await replaySurfacePreviews(session, { previewSurfaceAppearance: apply }, () => [current], () => true);
  await replaySurfacePreviews(session, { previewSurfaceAppearance: apply }, () => [{ ...entry, visible: false }], () => true);
  await replaySurfacePreviews(session, { previewSurfaceAppearance: apply }, () => [], () => true);
  expect(apply).not.toHaveBeenCalled();
});

it("stops when the viewer or project is retired during an earlier installation", async () => {
  const { entry, session } = fixture(); let release!: () => void, alive = true;
  const apply = vi.fn<MolecularViewer["previewSurfaceAppearance"]>().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const replay = replaySurfacePreviews(session, { previewSurfaceAppearance: apply }, () => [entry], () => alive);
  alive = false; release(); await replay;
  expect(apply).toHaveBeenCalledTimes(1);
});
