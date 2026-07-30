import { ChevronDown, History } from "lucide-react";
import type { Project } from "../api/types";
import { IconButton } from "./IconButton";

interface HistoryPanelProps {
  project: Project | undefined;
  onCollapse?: () => void;
}

export function HistoryPanel({ project, onCollapse }: HistoryPanelProps) {
  return (
    <section className="panel-content history-panel" aria-label="History">
      <div className="panel-header compact-header">
        <div className="history-title">
          <History size={16} />
          <h2>History</h2>
        </div>
        {onCollapse ? (
          <IconButton label="Collapse history" onClick={onCollapse}>
            <ChevronDown size={17} />
          </IconButton>
        ) : null}
      </div>
      <div className="history-content">
        {!project ? (
          <p className="empty-label">No project open</p>
        ) : (
          <>
            <div className="history-stat">
              <span>Current revision</span>
              <strong>{project.revision}</strong>
            </div>
            <div className="history-stat">
              <span>Saved checkpoint</span>
              <strong>{project.checkpoint_revision}</strong>
            </div>
            <div className="history-stat wide">
              <span>Next undo</span>
              <strong>{project.history.undo_description ?? "None"}</strong>
            </div>
            <div className="history-stat wide">
              <span>Next redo</span>
              <strong>{project.history.redo_description ?? "None"}</strong>
            </div>
            <div className="history-capacity">
              {project.history.retained_commands} / {project.history.limit}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

