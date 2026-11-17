import type { Project } from "../api/types";

export interface ProjectCommandContext {
  assertDispatchable(): void;
  ownsFeedback(): boolean;
}

export interface ProjectCommand {
  readonly projectId: string;
  readonly operation: () => Promise<Project>;
  readonly feedback?: "quiet";
  readonly context?: ProjectCommandContext;
}

/** Capture source ownership together with the command, before any asynchronous preflight. */
export function captureProjectCommand(projectId: string, operation: () => Promise<Project>, feedback?: "quiet", context?: ProjectCommandContext): ProjectCommand {
  return Object.freeze({ projectId, operation, ...(feedback ? { feedback } : {}), ...(context ? { context } : {}) });
}

/** The guard must run at dispatch, after any awaited mutation preflight. */
export function dispatchProjectCommand(command: ProjectCommand, assertWritable: (projectId: string) => void): Promise<Project> {
  command.context?.assertDispatchable();
  assertWritable(command.projectId);
  return command.operation();
}
