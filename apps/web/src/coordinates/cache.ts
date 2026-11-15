import type { QueryClient } from "@tanstack/react-query";
import type { Project, StructureProjection } from "../api/types";
import { patchStructureProjection } from "./transforms";
import { isCompleteProjection, structureQueryKey } from "../structures/query";

/** Publish geometry immediately, then refresh the immutable artifact's complete data.
 * Coordinate history can also change provenance/warnings, including after reload.
 */
export function seedCoordinateProjections(query: QueryClient, previous: Project | undefined, next: Project): void {
  for (const patch of next.structure_patches ?? []) {
    const prior = previous?.id === next.id
      ? previous.entries.find(entry => entry.id === patch.entry_id)?.current_artifact_id : undefined;
    const key = structureQueryKey(next.id, patch.entry_id, patch.artifact_id);
    const current = query.getQueryData<StructureProjection>(key);
    if (isCompleteProjection(current, patch.entry_id, patch.artifact_id)) continue;
    const source = current
      ?? (prior ? query.getQueryData<StructureProjection>(structureQueryKey(next.id, patch.entry_id, prior)) : undefined);
    if (source?.entry_id === patch.entry_id && (source.artifact_id === patch.artifact_id || source.artifact_id === prior)) {
      query.setQueryData(key, { ...patchStructureProjection(source, patch),
        artifact_id: patch.artifact_id, projection_state: "coordinate-seed" as const });
      void query.invalidateQueries({ queryKey: key });
    }
  }
}
