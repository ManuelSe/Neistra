import type { QueryClient } from "@tanstack/react-query";
import type { Project, StructureProjection } from "../api/types";
import { patchStructureProjection } from "./transforms";

/** Publish geometry immediately, then refresh the immutable artifact's complete data.
 * Coordinate history can also change provenance/warnings, including after reload.
 */
export function seedCoordinateProjections(query: QueryClient, previous: Project | undefined, next: Project): void {
  for (const patch of next.structure_patches ?? []) {
    const prior = previous?.entries.find(entry => entry.id === patch.entry_id)?.current_artifact_id;
    const key = ["structure", next.id, patch.entry_id, patch.artifact_id];
    const source = query.getQueryData<StructureProjection>(key)
      ?? (prior ? query.getQueryData<StructureProjection>(["structure", next.id, patch.entry_id, prior]) : undefined);
    if (source) {
      query.setQueryData(key, patchStructureProjection(source, patch));
      void query.invalidateQueries({ queryKey: key });
    }
  }
}
