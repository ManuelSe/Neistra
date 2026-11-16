import { ApiError } from "../api/client";
import type { Project } from "../api/types";

interface ResolutionPorts {
  current: (projectId: string) => boolean;
  resolve: (project: Project, entryIds: string[]) => Promise<Project>;
  read: (projectId: string) => Promise<Project>;
  accept: (project: Project) => void;
}

/** Reconcile one competing revision without retrying changed context or bad input. */
export async function completeLegacyLigands(project: Project, entryIds: string[], ports: ResolutionPorts): Promise<Project> {
  const guard = () => {
    if (!ports.current(project.id)) throw new ApiError(409, "ligand_context_changed", "Ligand recognition paused after the context changed.");
  };
  guard();
  try {
    return await ports.resolve(project, entryIds);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "revision_conflict") throw error;
    guard();
    const current = await ports.read(project.id);
    guard();
    if (current.id !== project.id) throw new Error("Ligand recognition returned a different project.");
    ports.accept(current);
    return ports.resolve(current, entryIds);
  }
}
