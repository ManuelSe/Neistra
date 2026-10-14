import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertTriangle,
  Info,
  ListTree,
  ChevronUp,
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
  GripVertical,
  Lock,
  LockOpen,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Entry,
  Project,
  Selection,
  SelectionMode,
  StructureType,
  ViewerSettings,
} from "../api/types";
import { captureGroupScope, groupLabels, groupScopeSummary, type GroupScope } from "../groups/membership";
import { useGroupDrag } from "../groups/useGroupDrag";
import type { DragEvent } from "react";
import { emptySelection, selectionMode } from "../selection/selection";
import { IconButton } from "./IconButton";
import { StructureHierarchy } from "./StructureHierarchy";
import { EntryDetails } from "./EntryDetails";
import { useNavigationStore } from "../store/navigation";
import { useWorkspaceStore } from "../store/workspace";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";

interface ProjectBrowserProps {
  project: Project | undefined;
  selection?: Selection;
  selectedEntryIds?: Set<string>;
  onSelectEntries?: (entries: Entry[], mode: SelectionMode) => void;
  onSelectHierarchy?: (selection: Selection, mode: SelectionMode) => void;
  onHierarchyVisibility?: (
    entry: Entry,
    key: keyof Omit<ViewerSettings["components"], "hydrogens">,
  ) => void;
  onCollapse?: () => void;
  onRename: (entry: Entry) => void;
  onDuplicate: (entry: Entry) => void;
  onVisibility: (entry: Entry) => void;
  onLock: (entry: Entry) => void;
  onIsolate: (entry: Entry) => void;
  onGroup: (entry: Entry, scope: GroupScope) => void;
  onMoveGroup?: (scope: GroupScope) => void;
  onRemoveGroup?: (scope: GroupScope) => void;
  onMembershipMenuClose?: (scope: GroupScope) => void;
  busy?: boolean;
  onMoveMembership?: (scope: GroupScope, groupId: string | null) => void;
  onDelete: (entry: Entry) => void;
  onExport: (entry: Entry) => void;
}

type BrowserActions = Omit<
  ProjectBrowserProps,
  | "project"
  | "selection"
  | "selectedEntryIds"
  | "onSelectEntries"
  | "onSelectHierarchy"
  | "onHierarchyVisibility"
  | "onCollapse"
  | "onMoveMembership"
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
  onMoveGroup,
  onRemoveGroup,
  onMembershipMenuClose,
  busy,
  captureScope,
  canUngroup,
  scopeSummary,
  onDragStart,
  onDragEnd,
  onDelete,
  onExport,
  inspected,
  onInspect,
  onDetails,
}: BrowserActions & {
  entry: Entry;
  selected: boolean;
  inspected: boolean;
  onInspect: () => void;
  onDetails: () => void;
  captureScope: () => GroupScope;
  canUngroup: boolean;
  scopeSummary: string;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
  onSelect: (mode: SelectionMode) => void;
}) {
  const membershipMenuScope = useRef<GroupScope | null>(null);
  const openingDetails = useRef(false);
  return (
    <div
      className={`entry-row ${entry.visible ? "" : "entry-hidden"} ${selected ? "selected" : ""}`}
      data-entry-id={entry.id}
      data-inspected={inspected || undefined}
    >
      {onDragStart ? <span className="entry-drag-handle" draggable={!busy}
        aria-hidden="true" title={`Drag ${entry.name} to a group`}
        onDragStart={onDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span> : null}
      <button
        type="button"
        className="entry-select"
        aria-pressed={selected}
        onClick={(event) => onSelect(selectionMode(event.nativeEvent))}
      >
        <FlaskConical size={16} className="entry-type-icon" />
        <span className="entry-copy">
          <span>{entry.name}</span>

        </span>
        {entry.warnings.length ? <span className="entry-warning"><AlertTriangle size={13} aria-hidden="true" /><span className="sr-only">{entry.warnings.length} warnings; open Details for messages</span></span> : null}
        {entry.dirty ? <span className="entry-dirty"><span className="sr-only">Modified</span></span> : null}
      </button>
      <div className="entry-actions">
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
            <IconButton className="entry-menu-trigger" label={`Actions for ${entry.name}`}>
              <Ellipsis size={16} />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="dropdown-content" sideOffset={5} align="end"
              onCloseAutoFocus={event => {
                if (openingDetails.current) { openingDetails.current = false; event.preventDefault(); return; }
                const scope = membershipMenuScope.current;
                if (!scope || !onMembershipMenuClose) return;
                membershipMenuScope.current = null;
                // Membership may remount this row before the menu focus scope
                // tears down. Resolve its replacement after that teardown.
                event.preventDefault();
                onMembershipMenuClose(scope);
              }}>
              <DropdownMenu.Item className="dropdown-item" onSelect={() => { openingDetails.current = true; onInspect(); }}>
                <ListTree size={15} /> Components
              </DropdownMenu.Item>
              <DropdownMenu.Item className="dropdown-item" onSelect={() => { openingDetails.current = true; onDetails(); }}>
                <Info size={15} /> Details
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="dropdown-separator" />
              <DropdownMenu.Item className="dropdown-item" onSelect={() => onRename(entry)}>
                <Pencil size={15} /> Rename
              </DropdownMenu.Item>
              <DropdownMenu.Item className="dropdown-item" onSelect={() => onDuplicate(entry)}>
                <Copy size={15} /> Duplicate
              </DropdownMenu.Item>
              <DropdownMenu.Item className="dropdown-item" onSelect={() => onIsolate(entry)}>
                <Focus size={15} /> Isolate
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="dropdown-separator" />
              <DropdownMenu.Label className="group-scope-label">{scopeSummary}</DropdownMenu.Label>
              {onMoveGroup ? <DropdownMenu.Item className="dropdown-item" disabled={busy} onSelect={() => onMoveGroup(captureScope())}>
                <FolderPlus size={15} /> Move to group…
              </DropdownMenu.Item> : null}
              {canUngroup && onRemoveGroup ? <DropdownMenu.Item className="dropdown-item" disabled={busy} onSelect={() => {
                const scope = captureScope();
                membershipMenuScope.current = scope;
                onRemoveGroup(scope);
              }}>
                Remove from group
              </DropdownMenu.Item> : null}
              <DropdownMenu.Item className="dropdown-item" disabled={busy} onSelect={() => onGroup(entry, captureScope())}>
                <FolderPlus size={15} /> Add to new group
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="dropdown-separator" />
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
  selection = emptySelection(),
  selectedEntryIds = new Set(),
  onSelectEntries,
  onSelectHierarchy = () => undefined,
  onHierarchyVisibility = () => undefined,
  onCollapse,
  onMoveMembership,
  ...actions
}: ProjectBrowserProps) {
  const compact = useMediaQuery("(max-width: 840px)");
  const navigation = useNavigationStore();
  const { browserLayout, componentsCollapsed, setBrowserLayout, setComponentsCollapsed } = useWorkspaceStore();
  const componentPanel = useRef<ImperativePanelHandle>(null);
  const paneHeading = useRef<HTMLHeadingElement>(null);
  const detailsReturn = useRef<{ projectId: string; entryId: string; launcher: HTMLElement | null } | null>(null);
  const [detailsEntryId, setDetailsEntryId] = useState<string | null>(null);
  useEffect(() => {
    if (!project) return;
    const state = useNavigationStore.getState();
    state.setProject(project.id);
    state.reconcile(project.id, project.entries.map(entry => entry.id));
  }, [project]);
  useEffect(() => { setDetailsEntryId(null); }, [project?.id]);
  useEffect(() => {
    if (!compact && componentPanel.current) {
      if (componentsCollapsed) componentPanel.current.collapse();
      else componentPanel.current.expand();
    }
  }, [compact, componentsCollapsed]);
  const inspected = project && navigation.projectId === project.id
    ? project.entries.find(entry => entry.id === navigation.inspectedEntryId) : undefined;
  const inspect = (entry: Entry, explicit = false) => {
    if (!project) return;
    useNavigationStore.getState().inspect(project.id, entry.id, explicit && compact);
    if (explicit && componentsCollapsed) setComponentsCollapsed(false);
    if (explicit) requestAnimationFrame(() => {
      const current = useNavigationStore.getState();
      if (current.projectId === project.id && current.inspectedEntryId === entry.id) paneHeading.current?.focus();
    });
  };
  const drag = useGroupDrag(project, actions.busy ?? false, onMoveMembership);
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
      .sort((left, right) => (
        sortBy === "atoms"
          ? right.atom_count - left.atom_count || left.name.localeCompare(right.name)
          : sortBy === "modified"
            ? right.modified_at.localeCompare(left.modified_at)
            : sortBy === "type"
              ? left.structure_type.localeCompare(right.structure_type) ||
                left.name.localeCompare(right.name)
              : left.name.localeCompare(right.name)
      ) || left.id.localeCompare(right.id),
      );
  }, [project?.entries, search, sortBy, typeFilter]);
  const labels = groupLabels(project?.groups ?? []);
  const canonicalIds = new Set(selection.atoms.map((atom) => atom.structure_id));
  const displayedIds = new Set(entries.map((entry) => entry.id));
  const selectedEntries = project?.entries.filter((entry) => canonicalIds.has(entry.id)) ?? [];
  const selectedSummary = groupScopeSummary({ entryIds: selectedEntries.map((entry) => entry.id), hiddenCount: selectedEntries.filter((entry) => !displayedIds.has(entry.id)).length });
  const selectedGrouped = selectedEntries.some((entry) => entry.group_id !== null);
  const captureScope = (entry: Entry) => captureGroupScope(project!, selection, entry.id, displayedIds, canonicalIds);
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

  const entryNode = (entry: Entry) => (
    <div className="entry-node" key={entry.id}>
      <EntryRow
        entry={entry}
        selected={selectedEntryIds.has(entry.id)}
        inspected={inspected?.id === entry.id}
        onSelect={(mode) => { inspect(entry); onSelectEntries?.([entry], mode); }}
        onInspect={() => inspect(entry, true)}
        onDetails={() => {
          detailsReturn.current = { projectId: project!.id, entryId: entry.id, launcher: document.querySelector<HTMLElement>(`[data-entry-id="${entry.id}"] .entry-menu-trigger`) };
          setDetailsEntryId(entry.id);
        }}
        {...actions}
        onDragStart={onMoveMembership ? (event) => drag.start(captureScope(entry), event) : undefined}
        onDragEnd={drag.cancel}
        captureScope={() => captureScope(entry)}
        canUngroup={canonicalIds.has(entry.id) ? selectedGrouped : entry.group_id !== null}
        scopeSummary={canonicalIds.has(entry.id) ? selectedSummary : groupScopeSummary({ entryIds: [entry.id], hiddenCount: 0 })}
      />

    </div>
  );

  const entryList = <div className="entry-pane">
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
        <details className="browser-filter-details"><summary>Filter and sort{typeFilter !== "all" ? " · filtered" : ""}</summary>
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
        </div></details>
      </div>
      {drag.scope ? <p className="group-drag-status" role="status">{groupScopeSummary(drag.scope)} Drop on a group or Ungrouped. Escape cancels.</p> : null}
      <div
        className="panel-scroll browser-results"
        aria-label="Project structures"
      >
        {!project ? (
          <p className="empty-label">No project open</p>
        ) : (
          <>
            {project.entries.length === 0 ? <div className="empty-panel"><FlaskConical size={28} /><p>No structures</p></div> :
              entries.length === 0 ? <p className="empty-label">No matching structures</p> : null}
            {project.groups.map((group) => {
              const groupEntries = entries.filter((entry) => entry.group_id === group.id);
              return (
                <div className={`entry-group ${drag.scope ? "group-drop-target" : ""} ${drag.hovered === group.id ? "group-drop-hover" : ""}`} key={group.id} data-group-id={group.id} {...drag.target(group.id)}>
                  {groupHeading(group.id, labels.get(group.id)!, groupEntries)}
                  {!collapsedGroups.has(group.id)
                    ? groupEntries.map(entryNode)
                    : null}
                </div>
              );
            })}
            {ungrouped.length > 0 || drag.scope ? (
              <div className={`entry-group ${drag.scope ? "group-drop-target" : ""} ${drag.hovered === "ungrouped" ? "group-drop-hover" : ""}`} data-group-id="ungrouped" {...drag.target(null)}>
                {project.groups.length > 0 || drag.scope
                  ? groupHeading("ungrouped", "Ungrouped", ungrouped)
                  : null}
                {!collapsedGroups.has("ungrouped")
                  ? ungrouped.map(entryNode)
                  : null}
              </div>
            ) : null}
          </>
        )}
      </div>
  </div>;
  const components = <section className="component-pane" aria-label="Component browser">
    <div className="component-pane-header">
      <h3 ref={paneHeading} tabIndex={-1}>Components</h3>
      {!compact ? <IconButton label="Collapse components" onClick={() => componentPanel.current?.collapse()}><ChevronDown size={15} /></IconButton> : null}
    </div>
    {inspected ? <div className="component-parent" data-inspected-entry-id={inspected.id}>
      <span title={inspected.name}>{inspected.name}</span>
      {!inspected.visible ? <small>Parent hidden</small> : null}
      {!displayedIds.has(inspected.id) || collapsedGroups.has(inspected.group_id ?? "ungrouped") ? <small>Outside displayed entry list</small> : null}
    </div> : null}
    {project && inspected?.current_artifact_id ? <StructureHierarchy
      projectId={project.id} entry={inspected} selection={selection}
      onSelect={onSelectHierarchy} onVisibility={onHierarchyVisibility} onFocusFallback={() => paneHeading.current?.focus()} />
      : <p className="empty-label">{inspected ? "No normalized structure available" : "Choose an entry to browse components"}</p>}
  </section>;
  return <section className="panel-content project-browser" aria-label="Project browser">
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
    {compact ? <>
      <div className="browser-tabs" role="tablist" aria-label="Project navigation">
        {(["entries", "components"] as const).map(tab => <button key={tab} type="button" role="tab"
          id={`browser-${tab}-tab`} aria-selected={navigation.tab === tab} aria-controls={`browser-${tab}-panel`}
          tabIndex={navigation.tab === tab ? 0 : -1}
          onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault(); const next = event.key === "Home" ? "entries" : event.key === "End" ? "components" : tab === "entries" ? "components" : "entries";
            navigation.setTab(next); document.getElementById(`browser-${next}-tab`)?.focus();
          } }} onClick={() => navigation.setTab(tab)}>{tab === "entries" ? "Entries" : "Components"}</button>)}
      </div>
      {(["entries", "components"] as const).map(tab => <div key={tab} id={`browser-${tab}-panel`}
        role="tabpanel" aria-labelledby={`browser-${tab}-tab`} className="browser-tab-panel" hidden={navigation.tab !== tab}>
        {navigation.tab === tab ? tab === "entries" ? entryList : components : null}
      </div>)}
    </> : <PanelGroup direction="vertical" id="project-navigation-panels" onLayout={setBrowserLayout}>
      <Panel id="entry-list-panel" defaultSize={browserLayout[0]} minSize={30}>{entryList}</Panel>
      <PanelResizeHandle className="resize-handle vertical" aria-label="Resize entries and components" />
      <Panel id="component-browser-panel" ref={componentPanel} defaultSize={browserLayout[1]}
        minSize={25} collapsible collapsedSize={7} onCollapse={() => setComponentsCollapsed(true)} onExpand={() => setComponentsCollapsed(false)}>
        {componentsCollapsed ? <button type="button" className="component-restore" onClick={() => componentPanel.current?.expand()}><ChevronUp size={15} /> Components</button> : components}
      </Panel>
    </PanelGroup>}
    <EntryDetails entry={project?.entries.find(entry => entry.id === detailsEntryId)} onClose={() => setDetailsEntryId(null)}
      onReturnFocus={() => {
        const origin = detailsReturn.current;
        if (!origin || useNavigationStore.getState().projectId !== origin.projectId) return;
        const launcher = origin.launcher?.isConnected ? origin.launcher
          : document.querySelector<HTMLElement>(`[data-entry-id="${origin.entryId}"] .entry-menu-trigger`);
        if (launcher?.isConnected) launcher.focus();
        else paneHeading.current?.focus();
      }} />
  </section>;
}
