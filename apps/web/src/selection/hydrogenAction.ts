import type { CapturedHydrogenTarget, HydrogenAppearanceChange, Project, Selection } from "../api/types";
import { captureProjectCommand, type ProjectCommand } from "../coordinates/projectCommand";
import { canonicalSelection } from "./selection";

export interface HydrogenActionContext {
  activeProjectId: string | null;
  selectionProjectId: string | null;
  projectEpoch: number;
  selection: Selection;
  project: Project | undefined;
}

export function captureHydrogenTarget(project: Project, projectEpoch: number,
  seed: Selection, target: Selection): CapturedHydrogenTarget {
  const entries = new Map(project.entries.map(entry => [entry.id, entry]));
  const artifactIds: Record<string, string> = {};
  for (const id of new Set(seed.atoms.map(atom => atom.structure_id))) {
    const artifact = entries.get(id)?.current_artifact_id;
    if (!artifact) throw new Error("The selected structure is unavailable. Reopen styling to retry.");
    artifactIds[id] = artifact;
  }
  if (!target.atoms.length || target.atoms.some(atom => !artifactIds[atom.structure_id])) {
    throw new Error("No current hydrogen targets are available for this selection.");
  }
  return Object.freeze({ projectId: project.id, projectEpoch, seed,
    artifactIds: Object.freeze(artifactIds),
    target: canonicalSelection(target.atoms.map(atom => ({ ...atom })), "atom", "inspector") });
}

export function assertHydrogenTargetCurrent(capture: CapturedHydrogenTarget, context: HydrogenActionContext): void {
  if (context.activeProjectId !== capture.projectId || context.selectionProjectId !== capture.projectId
    || context.project?.id !== capture.projectId || context.projectEpoch !== capture.projectEpoch
    || context.selection !== capture.seed) {
    throw new Error("The selection or project changed. Choose the hydrogen setting again.");
  }
  const entries = new Map(context.project.entries.map(entry => [entry.id, entry]));
  if (Object.entries(capture.artifactIds).some(([id, artifact]) => entries.get(id)?.current_artifact_id !== artifact)) {
    throw new Error("The selected structures changed. Reopen styling to resolve current hydrogens.");
  }
}

/** Preserve the captured revision and operand through asynchronous mutation preflight. */
export function hydrogenAppearanceCommand(project: Project, change: HydrogenAppearanceChange,
  capture: CapturedHydrogenTarget, context: () => HydrogenActionContext,
  send: (project: Project, target: Selection, change: HydrogenAppearanceChange) => Promise<Project>): ProjectCommand {
  if (project.id !== capture.projectId) throw new Error("The hydrogen target belongs to another project.");
  assertHydrogenTargetCurrent(capture, context());
  return captureProjectCommand(project.id, () => {
    assertHydrogenTargetCurrent(capture, context());
    return send(project, capture.target, change);
  }, "quiet");
}
