import { FolderPlus, Upload } from "lucide-react";
import type { Project } from "../api/types";
import { StructureViewer } from "./StructureViewer";

interface WorkspaceCanvasProps {
  project: Project | undefined;
  loading: boolean;
  onCreate: () => void;
  onImport: () => void;
}

export function WorkspaceCanvas({
  project,
  loading,
  onCreate,
  onImport,
}: WorkspaceCanvasProps) {
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
      ) : project.entries.length === 0 ||
        !project.entries.some((entry) => entry.current_artifact_id) ? (
        <div className="project-stage">
          <div className="stage-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1>{project.name}</h1>
          <p>
            {project.entries.length}{" "}
            {project.entries.length === 1 ? "structure" : "structures"}
          </p>
          <div className={`checkpoint-state ${project.has_uncheckpointed_changes ? "dirty" : ""}`}>
            {project.has_uncheckpointed_changes ? "Changes stored locally" : "Checkpoint saved"}
          </div>
          <button type="button" className="secondary-button stage-import" onClick={onImport}>
            <Upload size={16} /> Import structures
          </button>
        </div>
      ) : (
        <StructureViewer project={project} />
      )}
    </main>
  );
}
