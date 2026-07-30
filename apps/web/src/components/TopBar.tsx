import {
  FolderTree,
  History,
  Moon,
  PanelRight,
  Redo2,
  Save,
  Sun,
  Undo2,
} from "lucide-react";
import type { Project } from "../api/types";
import type { Theme } from "../store/workspace";
import { IconButton } from "./IconButton";

interface TopBarProps {
  project: Project | undefined;
  theme: Theme;
  busy: boolean;
  compact: boolean;
  onProjects: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTheme: () => void;
  onMobilePanel: (panel: "projects" | "inspector" | "history") => void;
}

export function TopBar({
  project,
  theme,
  busy,
  compact,
  onProjects,
  onSave,
  onUndo,
  onRedo,
  onTheme,
  onMobilePanel,
}: TopBarProps) {
  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={onProjects} aria-label="Projects">
        <img src="/molweave-mark.svg" alt="" />
        <span className="brand-name">MolWeave</span>
      </button>
      <button type="button" className="project-switcher" onClick={onProjects}>
        <span className="project-switcher-label">{project?.name ?? "No project open"}</span>
        {project?.has_uncheckpointed_changes ? (
          <span className="dirty-indicator" aria-label="Unsaved changes" />
        ) : null}
      </button>

      <div className="topbar-actions">
        {compact ? (
          <>
            <IconButton label="Project browser" onClick={() => onMobilePanel("projects")}>
              <FolderTree size={18} />
            </IconButton>
            <IconButton label="History" onClick={() => onMobilePanel("history")}>
              <History size={18} />
            </IconButton>
            <IconButton label="Inspector" onClick={() => onMobilePanel("inspector")}>
              <PanelRight size={18} />
            </IconButton>
          </>
        ) : null}
        <IconButton
          label={project?.history.undo_description ? `Undo: ${project.history.undo_description}` : "Undo"}
          disabled={!project?.history.can_undo || busy}
          onClick={onUndo}
        >
          <Undo2 size={18} />
        </IconButton>
        <IconButton
          label={project?.history.redo_description ? `Redo: ${project.history.redo_description}` : "Redo"}
          disabled={!project?.history.can_redo || busy}
          onClick={onRedo}
        >
          <Redo2 size={18} />
        </IconButton>
        <IconButton
          label="Save checkpoint"
          disabled={!project?.has_uncheckpointed_changes || busy}
          onClick={onSave}
        >
          <Save size={18} />
        </IconButton>
        <span className="toolbar-separator" />
        <IconButton
          label={theme === "light" ? "Use dark theme" : "Use light theme"}
          onClick={onTheme}
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </IconButton>
      </div>
    </header>
  );
}

