import type { HydrogenPolicy, Project, Selection } from "../api/types";

/** Captured authored operands, independent of native model/ghost identities. */
export function placementContext(project: Project, entryId: string | undefined, selection: Selection, generation: number, policy: HydrogenPolicy): string {
  const entry = project.entries.find(candidate => candidate.id === entryId);
  return JSON.stringify([project.id, generation, project.revision, entryId, entry?.current_artifact_id, selection, policy]);
}
