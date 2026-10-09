import { ApiError } from "../api/client";
import type { AtomReference, Project, Selection, SelectionTransform, StructureProjection } from "../api/types";
import {
  captureMovement, initialMovementPose, movementContextMatches, movementRequest,
  type MovementCapture, type MovementPose,
} from "./interactiveTransform";

export interface MovementSessionState {
  phase: "idle" | "loading" | "active" | "submitting" | "reconciling" | "uncertain";
  capture: MovementCapture | null;
  pose: MovementPose;
}
export interface MovementSessionPorts {
  context: () => { project: Project | undefined; selection: Selection };
  load: (project: Project, entryIds: string[]) => Promise<Map<string, StructureProjection>>;
  rendered: () => AtomReference[];
  commit: (project: Project, transform: SelectionTransform) => Promise<Project>;
  refresh: (projectId: string) => Promise<Project>;
  accept: (project: Project) => void;
  notice: (projectId: string, text: string, error?: boolean) => void;
}

const idle = (): MovementSessionState => ({ phase: "idle", capture: null, pose: initialMovementPose() });

/** App-owned transaction. Async responses remain owned by their captured project. */
export class MovementSession {
  private state = idle();
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(private readonly ports: MovementSessionPorts) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(state: MovementSessionState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  async begin(): Promise<void> {
    if (this.state.phase !== "idle") return;
    const { project, selection } = this.ports.context();
    if (!project) return;
    const capturedProject = structuredClone(project);
    const capturedSelection = structuredClone(selection);
    const generation = ++this.generation;
    this.publish({ ...idle(), phase: "loading" });
    try {
      const structures = await this.ports.load(capturedProject, [...new Set(selection.atoms.map(atom => atom.structure_id))]);
      if (generation !== this.generation) return;
      const capture = captureMovement(capturedProject, capturedSelection, structures, this.ports.rendered());
      const context = this.ports.context();
      if (!movementContextMatches(capture, context.project, context.selection)) throw new Error("Move selection was discarded because its project or selection changed.");
      this.publish({ phase: "active", capture, pose: initialMovementPose() });
    } catch (error) {
      if (generation !== this.generation) return;
      this.publish(idle());
      this.ports.notice(project.id, error instanceof Error ? error.message : "Move selection could not start.", true);
    }
  }

  update(pose: MovementPose) {
    if (this.state.phase !== "active") return;
    this.publish({ ...this.state, pose });
  }

  /** Call before context mutation. Submitting requests cannot be recalled. */
  cancel(reason?: string, detach = false) {
    if (this.state.phase === "uncertain" && !detach) return;
    const projectId = this.state.capture?.project.id ?? this.ports.context().project?.id;
    ++this.generation;
    this.publish(idle());
    if (reason && projectId) this.ports.notice(projectId, reason);
  }

  guardContext() {
    if (!this.state.capture || this.state.phase !== "active") return;
    const { project, selection } = this.ports.context();
    if (!movementContextMatches(this.state.capture, project, selection)) {
      this.cancel("Move selection was discarded because its project or selection changed.");
    }
  }

  async apply(): Promise<void> {
    if (this.state.phase !== "active" || !this.state.capture) return;
    this.guardContext();
    if (this.state.phase !== "active" || !this.state.capture) return;
    const { capture, pose } = this.state;
    const generation = this.generation;
    this.publish({ ...this.state, phase: "submitting" });
    try {
      const next = await this.ports.commit(capture.project, movementRequest(capture, pose));
      // Even a late result updates only its captured project's authority cache.
      this.ports.accept(next);
      if (generation !== this.generation) return;
      this.publish(idle());
      this.ports.notice(capture.project.id, next.revision === capture.project.revision ? "Selection coordinates unchanged." : "Selection movement stored locally.");
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.code === "revision_conflict") {
        if (generation === this.generation) this.publish({ ...this.state, phase: "reconciling" });
        try {
          const current = await this.ports.refresh(capture.project.id);
          this.ports.accept(current);
          if (generation !== this.generation) return;
          const context = this.ports.context();
          if (!(error instanceof ApiError && error.code === "revision_conflict") && context.project?.id === capture.project.id && movementContextMatches(capture, current, context.selection)) {
            this.publish({ phase: "active", capture, pose });
            this.ports.notice(capture.project.id, "The response was interrupted. Reconciliation found the captured revision unchanged; you may retry Apply.", true);
            return;
          }
        } catch {
          // Never enable retry while the server outcome is unknown.
          if (generation === this.generation) {
            this.publish({ phase: "uncertain", capture, pose: initialMovementPose() });
            this.ports.notice(capture.project.id, "Movement outcome could not be reconciled. Refresh the project before making further changes.", true);
          }
          return;
        }
      }
      if (generation !== this.generation) return;
      this.publish(idle());
      this.ports.notice(capture.project.id, `Move selection was discarded. ${error instanceof Error ? error.message : "Apply failed."}`, true);
    }
  }

  async reconcile(): Promise<void> {
    if (this.state.phase !== "uncertain" || !this.state.capture) return;
    const projectId = this.state.capture.project.id;
    const generation = this.generation;
    this.publish({ ...this.state, phase: "reconciling" });
    try {
      const current = await this.ports.refresh(projectId);
      this.ports.accept(current);
      if (generation !== this.generation) return;
      this.publish(idle());
      this.ports.notice(projectId, "Project refreshed. Check its coordinates and history before starting a new movement.");
    } catch {
      if (generation !== this.generation) return;
      this.publish({ ...this.state, phase: "uncertain" });
      this.ports.notice(projectId, "The movement outcome is still unknown. Project changes remain paused until refresh succeeds.", true);
    }
  }
}
