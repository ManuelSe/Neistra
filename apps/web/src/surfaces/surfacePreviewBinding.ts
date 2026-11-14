import type { Entry } from "../api/types";
import type { MolecularViewer } from "../viewer/MolecularViewer";
import { previewDisposition, type SurfaceManagerSession } from "./surfaceManagerSession";

/** Rebind transient intent after a disposable viewer has received canonical data. */
export async function replaySurfacePreviews(
  session: SurfaceManagerSession,
  viewer: Pick<MolecularViewer, "previewSurfaceAppearance">,
  entries: () => readonly Entry[],
  isCurrent: () => boolean,
): Promise<void> {
  for (const key of Object.keys(session.getSnapshot().previews)) {
    if (!isCurrent()) return;
    // Read each token after the preceding asynchronous application, so a retired
    // or superseded preview cannot be resurrected from an earlier snapshot.
    const preview = session.getSnapshot().previews[key];
    if (!preview) continue;
    const owner = entries().find(entry => entry.id === preview.identity.entryId);
    const surface = owner?.viewer_settings.surface_objects.find(item => item.id === preview.identity.surfaceId);
    if (previewDisposition(preview, owner, surface) !== "retain") continue;
    await viewer.previewSurfaceAppearance(preview.identity, preview.appearance);
  }
}
