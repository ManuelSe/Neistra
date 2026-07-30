import { FolderPlus } from "lucide-react";
import type { Project } from "../api/types";

interface WorkspaceCanvasProps {
  project: Project | undefined;
  loading: boolean;
  onCreate: () => void;
}

export function WorkspaceCanvas({ project, loading, onCreate }: WorkspaceCanvasProps) {
  if (loading) {
    return (
      <main className="workspace-canvas" aria-busy="true">
        <div className="loading-mark" />
        <span className="sr-only">Loading workspace</span>
      </main>
    );
  }

  return (
    <main className="workspace-canvas">
      <div className="canvas-grid" aria-hidden="true" />
      {!project ? (
        <div className="canvas-empty">
          <img src="/molweave-mark.svg" alt="" />
          <h1>No project open</h1>
          <button type="button" className="primary-button" onClick={onCreate}>
            <FolderPlus size={17} />
            Create project
          </button>
        </div>
      ) : (
        <div className="project-stage">
          <div className="stage-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1>{project.name}</h1>
          <p>
            {project.entries.length} {project.entries.length === 1 ? "structure" : "structures"}
          </p>
          <div className={`checkpoint-state ${project.has_uncheckpointed_changes ? "dirty" : ""}`}>
            {project.has_uncheckpointed_changes ? "Changes stored locally" : "Checkpoint saved"}
          </div>
        </div>
      )}
    </main>
  );
}

