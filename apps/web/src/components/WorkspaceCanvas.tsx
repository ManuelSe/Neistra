import type { ExpandSelection } from "../selection/expansion";
import { FolderPlus, Upload } from "lucide-react";
import type {
  CameraState,
  CoordinatePatch,
  Project,
  Scene,
  Selection,
  SelectionGranularity,
  SelectionMode,
  SelectionRepresentationStyle,
  StructureProjection,
  ViewerSettings,
} from "../api/types";
import type { Theme } from "../store/workspace";
import { StructureViewer } from "./StructureViewer";
import { Brand } from "./Brand";

interface WorkspaceCanvasProps {
  project: Project | undefined;
  theme: Theme;
  selection: Selection;
  pickingGranularity: SelectionGranularity;
  onPickingGranularity: (granularity: SelectionGranularity) => void;
  onViewerSelection: (selection: Selection, mode: SelectionMode) => void;
  loading: boolean;
  onCreate: () => void;
  onImport: () => void;
  busy?: boolean;
  coordinatePreview?: CoordinatePatch | null;
  onUpdateSettings?: (entryId: string, settings: ViewerSettings) => Promise<void>;
  onCreateScene?: (name: string, camera: CameraState) => Promise<void>;
  onApplyScene?: (scene: Scene) => Promise<void>;
  onDeleteScene?: (scene: Scene) => Promise<void>;
  onLoadSelectionStructures?: () => Promise<Map<string, StructureProjection>>;
  onExpandDistance?: ExpandSelection;
  onSelectionStyle?: (
    action: "apply" | "reset",
    style?: SelectionRepresentationStyle,
  ) => Promise<void>;
}

export function WorkspaceCanvas({
  project,
  theme,
  selection,
  pickingGranularity,
  onPickingGranularity,
  onViewerSelection,
  loading,
  onCreate,
  onImport,
  busy,
  coordinatePreview,
  onUpdateSettings,
  onCreateScene,
  onApplyScene,
  onDeleteScene,
  onLoadSelectionStructures,
  onSelectionStyle,
  onExpandDistance,
}: WorkspaceCanvasProps) {
  if (loading) {
    return (
      <main className="workspace-canvas" aria-busy="true">
        <div className="workspace-loading">
          <Brand variant="icon" />
          <span role="status">Loading Neistra workspace</span>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace-canvas">
      <div className="canvas-grid" aria-hidden="true" />
      {!project ? (
        <div className="canvas-empty">
          <Brand variant="lockup" className="welcome-brand" />
          <p className="workspace-tagline">Shape molecular structure.</p>
          <h1>No project open</h1>
          <button type="button" className="primary-button" onClick={onCreate}>
            <FolderPlus size={17} />
            Create project
          </button>
        </div>
      ) : project.entries.length === 0 ||
        !project.entries.some((entry) => entry.current_artifact_id) ? (
        <div className="project-stage">
          <Brand className="stage-brand" />
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
        <StructureViewer
          project={project}
          theme={theme}
          selection={selection}
          pickingGranularity={pickingGranularity}
          onPickingGranularity={onPickingGranularity}
          onViewerSelection={onViewerSelection}
          busy={busy}
          coordinatePreview={coordinatePreview}
          onUpdateSettings={onUpdateSettings}
          onCreateScene={onCreateScene}
          onApplyScene={onApplyScene}
          onDeleteScene={onDeleteScene}
          onLoadSelectionStructures={onLoadSelectionStructures}
          onSelectionStyle={onSelectionStyle}
          onExpandDistance={onExpandDistance}
        />
      )}
    </main>
  );
}
