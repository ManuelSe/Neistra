import type { Project, Selection } from "../api/types";

export interface SelectionTargetCapture {
  project: Project;
  projectId: string;
  expectedRevision: number;
  projectEpoch: number;
  /** The initiating store value distinguishes a newer selection intent. */
  seed: Selection;
  selection: Selection;
  artifacts: Readonly<Record<string, string>>;
}

export interface SelectionTargetContext {
  activeProjectId: string | null;
  selectionProjectId: string | null;
  projectEpoch: number;
  project: Project | undefined;
  selection: Selection;
}

/** Capture an explicit operand. An entry fallback is never a geometry selection. */
export function captureSelectionTarget(project: Project, selection: Selection, projectEpoch: number): SelectionTargetCapture {
  if (!selection.atoms.length) throw new Error("Select atoms before opening a geometry tool.");
  const entries = new Map(project.entries.map(entry => [entry.id, entry]));
  const artifacts: Record<string, string> = {};
  const ids = new Map<string, Set<number>>();
  for (const reference of selection.atoms) {
    const entry = entries.get(reference.structure_id);
    if (!entry?.current_artifact_id) throw new Error("A selected structure is unavailable. Select the current atoms again.");
    if (entry.locked) throw new Error(`Unlock ${entry.name} before editing its coordinates.`);
    if (!ids.has(entry.id)) ids.set(entry.id, new Set(entry.atom_ids));
    if (!ids.get(entry.id)!.has(reference.atom_id)) throw new Error("Some selected atoms are no longer present. Select the current atoms again.");
    artifacts[entry.id] = entry.current_artifact_id;
  }
  return { project, projectId: project.id, expectedRevision: project.revision, projectEpoch,
    seed: selection, selection: structuredClone(selection), artifacts: Object.freeze(artifacts) };
}

export function assertSelectionTargetCurrent(capture: SelectionTargetCapture, context: SelectionTargetContext): void {
  if (context.activeProjectId !== capture.projectId || context.selectionProjectId !== capture.projectId
    || context.project?.id !== capture.projectId || context.projectEpoch !== capture.projectEpoch
    || context.selection !== capture.seed || context.project.revision !== capture.expectedRevision) {
    throw new Error("The project or selection changed. Open the tool again for the current target.");
  }
  const entries = new Map(context.project.entries.map(entry => [entry.id, entry]));
  for (const [id, artifact] of Object.entries(capture.artifacts)) {
    const entry = entries.get(id);
    if (!entry || entry.current_artifact_id !== artifact || entry.locked) {
      throw new Error("The captured structures changed or became locked. Open the tool again for the current target.");
    }
  }
}
