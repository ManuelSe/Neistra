import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronLeft,
  Copy,
  Ellipsis,
  Eye,
  EyeOff,
  FolderPlus,
  FlaskConical,
  Focus,
  Lock,
  LockOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Entry, Project } from "../api/types";
import { IconButton } from "./IconButton";

interface ProjectBrowserProps {
  project: Project | undefined;
  onCollapse?: () => void;
  onRename: (entry: Entry) => void;
  onDuplicate: (entry: Entry) => void;
  onVisibility: (entry: Entry) => void;
  onLock: (entry: Entry) => void;
  onIsolate: (entry: Entry) => void;
  onGroup: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
}

function EntryRow({
  entry,
  onRename,
  onDuplicate,
  onVisibility,
  onLock,
  onIsolate,
  onGroup,
  onDelete,
}: Omit<ProjectBrowserProps, "project" | "onCollapse"> & { entry: Entry }) {
  return (
    <div className={`entry-row ${entry.visible ? "" : "entry-hidden"}`} data-entry-id={entry.id}>
      <FlaskConical size={16} className="entry-type-icon" />
      <div className="entry-copy">
        <span>{entry.name}</span>
        <small>{entry.structure_type}</small>
      </div>
      {entry.dirty ? <span className="entry-dirty" aria-label="Modified" /> : null}
      <IconButton
        label={entry.visible ? `Hide ${entry.name}` : `Show ${entry.name}`}
        onClick={() => onVisibility(entry)}
      >
        {entry.visible ? <Eye size={15} /> : <EyeOff size={15} />}
      </IconButton>
      <IconButton
        label={entry.locked ? `Unlock ${entry.name}` : `Lock ${entry.name}`}
        onClick={() => onLock(entry)}
      >
        {entry.locked ? <Lock size={15} /> : <LockOpen size={15} />}
      </IconButton>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <IconButton label={`Actions for ${entry.name}`}>
            <Ellipsis size={16} />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="dropdown-content" sideOffset={5} align="end">
            <DropdownMenu.Item className="dropdown-item" onSelect={() => onRename(entry)}>
              <Pencil size={15} /> Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => onDuplicate(entry)}>
              <Copy size={15} /> Duplicate
            </DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => onIsolate(entry)}>
              <Focus size={15} /> Isolate
            </DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => onGroup(entry)}>
              <FolderPlus size={15} /> Add to new group
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="dropdown-separator" />
            <DropdownMenu.Item
              className="dropdown-item danger"
              onSelect={() => onDelete(entry)}
            >
              <Trash2 size={15} /> Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

export function ProjectBrowser({ project, onCollapse, ...actions }: ProjectBrowserProps) {
  const groupedIds = new Set(project?.entries.filter((entry) => entry.group_id).map((entry) => entry.id));
  const ungrouped = project?.entries.filter((entry) => !groupedIds.has(entry.id)) ?? [];

  return (
    <section className="panel-content project-browser" aria-label="Project browser">
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">Project</span>
          <h2>Structures</h2>
        </div>
        {onCollapse ? (
          <IconButton label="Collapse project browser" onClick={onCollapse}>
            <ChevronLeft size={17} />
          </IconButton>
        ) : null}
      </div>
      <div className="panel-scroll">
        {!project ? (
          <p className="empty-label">No project open</p>
        ) : project.entries.length === 0 ? (
          <div className="empty-panel">
            <FlaskConical size={28} />
            <p>No structures</p>
          </div>
        ) : (
          <>
            {project.groups.map((group) => {
              const entries = project.entries.filter((entry) => entry.group_id === group.id);
              return (
                <div className="entry-group" key={group.id}>
                  <div className="group-heading">
                    <span>{group.name}</span>
                    <small>{entries.length}</small>
                  </div>
                  {entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} {...actions} />
                  ))}
                </div>
              );
            })}
            {ungrouped.length > 0 ? (
              <div className="entry-group">
                {project.groups.length > 0 ? (
                  <div className="group-heading">
                    <span>Ungrouped</span>
                    <small>{ungrouped.length}</small>
                  </div>
                ) : null}
                {ungrouped.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} {...actions} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

