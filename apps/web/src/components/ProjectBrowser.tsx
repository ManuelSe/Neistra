import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  FileOutput,
  FolderPlus,
  FlaskConical,
  Focus,
  Lock,
  LockOpen,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import type { Entry, Project, SelectionMode, StructureType } from "../api/types";
import { selectionMode } from "../selection/selection";
import { IconButton } from "./IconButton";

interface ProjectBrowserProps {
  project: Project | undefined;
  selectedEntryIds?: Set<string>;
  onSelectEntries?: (entries: Entry[], mode: SelectionMode) => void;
  onCollapse?: () => void;
  onRename: (entry: Entry) => void;
  onDuplicate: (entry: Entry) => void;
  onVisibility: (entry: Entry) => void;
  onLock: (entry: Entry) => void;
  onIsolate: (entry: Entry) => void;
  onGroup: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  onExport: (entry: Entry) => void;
}

type BrowserActions = Omit<
  ProjectBrowserProps,
  "project" | "selectedEntryIds" | "onSelectEntries" | "onCollapse"
>;

function EntryRow({
  entry,
  selected,
  onSelect,
  onRename,
  onDuplicate,
  onVisibility,
  onLock,
  onIsolate,
  onGroup,
  onDelete,
  onExport,
}: BrowserActions & {
  entry: Entry;
  selected: boolean;
  onSelect: (mode: SelectionMode) => void;
}) {
  const keyboardSelect = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(selectionMode(event.nativeEvent));
  };
  return (
    <div
      className={`entry-row ${entry.visible ? "" : "entry-hidden"} ${selected ? "selected" : ""}`}
      data-entry-id={entry.id}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={(event) => onSelect(selectionMode(event.nativeEvent))}
      onKeyDown={keyboardSelect}
    >
      <FlaskConical size={16} className="entry-type-icon" />
      <div className="entry-copy">
        <span>{entry.name}</span>
        <small title={entry.warnings.map((warning) => warning.message).join("\n")}>
          {entry.source_format ?? entry.structure_type} / {entry.atom_count} atoms
          {entry.warnings.length > 0 ? ` / ${entry.warnings.length} warnings` : ""}
        </small>
      </div>
      {entry.dirty ? <span className="entry-dirty" aria-label="Modified" /> : null}
      <div className="entry-actions" onClick={(event) => event.stopPropagation()}>
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
              <DropdownMenu.Item className="dropdown-item" onSelect={() => onExport(entry)}>
                <FileOutput size={15} /> Export
              </DropdownMenu.Item>
              {entry.original_artifact_id ? (
                <DropdownMenu.Item className="dropdown-item" asChild>
                  <a href={`/api/v1/artifacts/${entry.original_artifact_id}`} download>
                    <Download size={15} /> Download original
                  </a>
                </DropdownMenu.Item>
              ) : null}
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
    </div>
  );
}

export function ProjectBrowser({
  project,
  selectedEntryIds = new Set(),
  onSelectEntries,
  onCollapse,
  ...actions
}: ProjectBrowserProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<StructureType | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "type" | "atoms" | "modified">("name");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const entries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...(project?.entries ?? [])]
      .filter(
        (entry) =>
          (typeFilter === "all" || entry.structure_type === typeFilter) &&
          (!query ||
            entry.name.toLocaleLowerCase().includes(query) ||
            entry.original_filename?.toLocaleLowerCase().includes(query)),
      )
      .sort((left, right) =>
        sortBy === "atoms"
          ? right.atom_count - left.atom_count || left.name.localeCompare(right.name)
          : sortBy === "modified"
            ? right.modified_at.localeCompare(left.modified_at)
            : sortBy === "type"
              ? left.structure_type.localeCompare(right.structure_type) ||
                left.name.localeCompare(right.name)
              : left.name.localeCompare(right.name),
      );
  }, [project?.entries, search, sortBy, typeFilter]);
  const ungrouped = entries.filter((entry) => entry.group_id === null);

  const toggleGroup = (groupId: string) =>
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  const groupHeading = (
    id: string,
    name: string,
    groupEntries: Entry[],
  ) => (
    <div className="group-heading">
      <button
        type="button"
        className="group-toggle"
        aria-label={`${collapsedGroups.has(id) ? "Expand" : "Collapse"} ${name}`}
        onClick={() => toggleGroup(id)}
      >
        {collapsedGroups.has(id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      <button
        type="button"
        className="group-select"
        onClick={(clickEvent) =>
          onSelectEntries?.(groupEntries, selectionMode(clickEvent.nativeEvent))
        }
      >
        <span>{name}</span>
        <small>{groupEntries.length}</small>
      </button>
    </div>
  );

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
      <div className="browser-controls">
        <label className="browser-search">
          <Search size={14} />
          <span className="sr-only">Search structures</span>
          <input
            value={search}
            placeholder="Search structures"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="browser-selects">
          <select
            aria-label="Filter structure type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as StructureType | "all")}
          >
            <option value="all">All types</option>
            <option value="protein">Protein</option>
            <option value="ligand">Ligand</option>
            <option value="complex">Complex</option>
            <option value="solvent">Solvent</option>
            <option value="unknown">Unknown</option>
          </select>
          <select
            aria-label="Sort structures"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
          >
            <option value="name">Name</option>
            <option value="type">Type</option>
            <option value="atoms">Atom count</option>
            <option value="modified">Modified</option>
          </select>
        </div>
      </div>
      <div className="panel-scroll browser-results" role="listbox" aria-multiselectable="true">
        {!project ? (
          <p className="empty-label">No project open</p>
        ) : project.entries.length === 0 ? (
          <div className="empty-panel">
            <FlaskConical size={28} />
            <p>No structures</p>
          </div>
        ) : entries.length === 0 ? (
          <p className="empty-label">No matching structures</p>
        ) : (
          <>
            {project.groups.map((group) => {
              const groupEntries = entries.filter((entry) => entry.group_id === group.id);
              if (groupEntries.length === 0) return null;
              return (
                <div className="entry-group" key={group.id}>
                  {groupHeading(group.id, group.name, groupEntries)}
                  {!collapsedGroups.has(group.id)
                    ? groupEntries.map((entry) => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          selected={selectedEntryIds.has(entry.id)}
                          onSelect={(mode) => onSelectEntries?.([entry], mode)}
                          {...actions}
                        />
                      ))
                    : null}
                </div>
              );
            })}
            {ungrouped.length > 0 ? (
              <div className="entry-group">
                {project.groups.length > 0
                  ? groupHeading("ungrouped", "Ungrouped", ungrouped)
                  : null}
                {!collapsedGroups.has("ungrouped")
                  ? ungrouped.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        selected={selectedEntryIds.has(entry.id)}
                        onSelect={(mode) => onSelectEntries?.([entry], mode)}
                        {...actions}
                      />
                    ))
                  : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
