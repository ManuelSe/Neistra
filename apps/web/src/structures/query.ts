import { queryOptions } from "@tanstack/react-query";
import { molecularApi } from "../api/client";
import type { StructureProjection } from "../api/types";

export const structureQueryKey = (projectId: string, entryId: string, artifactId: string | null | undefined) =>
  ["structure", projectId, entryId, artifactId] as const;

/** A coordinate seed is drawable, but does not certify chemistry or provenance. */
export function isCompleteProjection(
  projection: StructureProjection | undefined,
  entryId: string,
  artifactId: string | null | undefined,
): projection is StructureProjection {
  return Boolean(artifactId && projection?.entry_id === entryId
    && projection.artifact_id === artifactId && projection.projection_state !== "coordinate-seed");
}

/** Every observer and imperative loader shares the immutable identity and cancellation. */
export function structureQueryOptions(projectId: string, entryId: string, artifactId: string | null | undefined) {
  return queryOptions({
    queryKey: structureQueryKey(projectId, entryId, artifactId),
    queryFn: async ({ signal }) => {
      if (!projectId || !entryId || !artifactId) throw new Error("The molecular artifact is unavailable.");
      // Settle synchronous cleanup/re-subscription before starting an abandoned read.
      await Promise.resolve();
      signal.throwIfAborted();
      return molecularApi.structure(projectId, entryId, artifactId, signal);
    },
    enabled: Boolean(projectId && entryId && artifactId),
    retry: false,
    // fetchQuery must also refresh a continuity seed, even if it was just inserted.
    staleTime: query => isCompleteProjection(query.state.data, entryId, artifactId) ? Number.POSITIVE_INFINITY : 0,
  });
}
