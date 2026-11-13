import type { Project } from "../api/types";

export interface ProjectCommand {
  readonly projectId: string;
  readonly operation: () => Promise<Project>;
}

/** Capture source ownership together with the command, before any asynchronous preflight. */
export function captureProjectCommand(projectId: string, operation: () => Promise<Project>): ProjectCommand {
  return Object.freeze({ projectId, operation });
}

/** The guard must run at dispatch, after any awaited mutation preflight. */
export function dispatchProjectCommand(command: ProjectCommand, assertWritable: (projectId: string) => void): Promise<Project> {
  assertWritable(command.projectId);
  return command.operation();
}
