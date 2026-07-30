import { ChevronRight, FilePenLine } from "lucide-react";
import { useEffect, useState } from "react";
import type { Project } from "../api/types";
import { IconButton } from "./IconButton";

interface ProjectInspectorProps {
  project: Project | undefined;
  busy: boolean;
  onApply: (name: string, description: string | null) => void;
  onCollapse?: () => void;
}

export function ProjectInspector({
  project,
  busy,
  onApply,
  onCollapse,
}: ProjectInspectorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
  }, [project?.id, project?.name, project?.description]);

  const changed =
    !!project && (name.trim() !== project.name || description !== (project.description ?? ""));

  return (
    <section className="panel-content inspector" aria-label="Project inspector">
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">Inspector</span>
          <h2>Project details</h2>
        </div>
        {onCollapse ? (
          <IconButton label="Collapse inspector" onClick={onCollapse}>
            <ChevronRight size={17} />
          </IconButton>
        ) : null}
      </div>
      {!project ? (
        <div className="empty-panel">
          <FilePenLine size={28} />
          <p>No project selected</p>
        </div>
      ) : (
        <form
          className="inspector-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && changed) onApply(name.trim(), description.trim() || null);
          }}
        >
          <label>
            Name
            <input
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              maxLength={2000}
              rows={5}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <dl className="project-facts">
            <div>
              <dt>Structures</dt>
              <dd>{project.entries.length}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{project.revision}</dd>
            </div>
            <div>
              <dt>Checkpoint</dt>
              <dd>{project.checkpoint_revision}</dd>
            </div>
          </dl>
          <button className="primary-button" type="submit" disabled={!changed || busy || !name.trim()}>
            Apply changes
          </button>
        </form>
      )}
    </section>
  );
}

