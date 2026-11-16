import { useEffect, useReducer, useRef } from "react";
import type { Project } from "../api/types";

export interface LegacyResolutionPorts {
  project: Project | undefined;
  activeProjectId: string | null;
  priorityEntryId: string | null;
  blocked: boolean;
  resolve: (project: Project, entryIds: string[]) => Promise<Project>;
  onError: (projectId: string, error: unknown) => void;
}

/** Controlled migration completion, once per open epoch, independently of panels. */
export function useLegacyLigandResolution(ports: LegacyResolutionPorts): void {
  const current = useRef(ports);
  current.current = ports;
  const work = useRef<{ projectId: string | null; visit: number; captured: boolean; queue: string[]; running: boolean }>({
    projectId: null, visit: 0, captured: false, queue: [], running: false,
  });
  const [tick, resume] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const state = work.current;
    const input = current.current;
    if (state.projectId !== input.activeProjectId) {
      state.projectId = input.activeProjectId;
      state.visit += 1;
      state.captured = false;
      state.queue = [];
    }
    const project = input.project;
    if (!project || project.id !== input.activeProjectId) return;
    if (!state.captured) {
      state.captured = true;
      state.queue = project.entries.filter(entry => {
        const value = entry.ligand_designation;
        return value.status === "unresolved" && value.source_artifact_id === null
          && value.instance_id === null && value.reason_code === null
          && value.resolver_version === null && value.assessed_at === null;
      }).map(entry => entry.id);
    }
    if (input.blocked || state.running || !state.queue.length) return;
    const priority = state.queue.indexOf(input.priorityEntryId ?? "");
    const batch = priority >= 0 ? state.queue.splice(priority, 1) : state.queue.splice(0, 12);
    // Remove attempts before dispatch. Ordinary revisions, Undo and failures do
    // not reseed this epoch or repeatedly invoke an expensive unsupported input.
    const owner = project.id;
    const visit = state.visit;
    state.running = true;
    void input.resolve(project, batch).catch(error => {
      if (state.visit === visit && state.projectId === owner && current.current.activeProjectId === owner) {
        current.current.onError(owner, error);
      }
    }).finally(() => {
      state.running = false;
      resume();
    });
  }, [ports.project, ports.activeProjectId, ports.priorityEntryId, ports.blocked, tick]);
}
