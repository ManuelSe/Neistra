import type { HydrogenAction, ModelPlacementAction, Project, Selection, SelectionEditAction } from "../api/types";

export type PlacementAction = Exclude<ModelPlacementAction, HydrogenAction>;

/** Coordinate-only torsion preserves H; authored chemistry uses automatic maintenance. */
export function placementHydrogenPolicy(action: Pick<SelectionEditAction, "operation"> | undefined): "preserve" | "automatic" {
  return action?.operation === "bond.rotate" ? "preserve" : "automatic";
}

/** Captured authored operands, independent of native model/ghost identities. */
export function placementContext(project: Project, entryId: string | undefined, selection: Selection, generation: number, action: Pick<SelectionEditAction, "operation"> | undefined): string {
  const entry = project.entries.find(candidate => candidate.id === entryId);
  return JSON.stringify([project.id, generation, project.revision, entryId, entry?.current_artifact_id, selection, placementHydrogenPolicy(action)]);
}
