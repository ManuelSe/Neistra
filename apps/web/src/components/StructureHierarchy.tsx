import { useQuery } from "@tanstack/react-query";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ChevronDown, ChevronRight, Eye, EyeOff, Info, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { molecularApi } from "../api/client";
import type { ComponentCategory, Entry, Selection, SelectionMode, StructureProjection, ViewerSettings } from "../api/types";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { buildComponentMembership, indexedCategorySelection, indexedComponentSelection, membershipSelectedState } from "../selection/componentMembership";
import { selectionMode } from "../selection/selection";
import { hierarchyRows, type CategoryDefinition, type HierarchyRow } from "../selection/hierarchyRows";
import { useSelectionStore } from "../store/selection";
import type { ResidueSelectionRequest } from "../selection/gestures";
import { emptyBrowsingState, useNavigationStore } from "../store/navigation";
import { ComponentDetails, type ComponentDetailsContent } from "./ComponentDetails";
import { IconButton } from "./IconButton";

type VisibilityKey = keyof Omit<ViewerSettings["components"], "hydrogens">;
interface StructureHierarchyProps {
  projectId: string; entry: Entry; selection: Selection;
  onSelect: (selection: Selection, mode: SelectionMode) => void;
  onSelectResidue?: (request: ResidueSelectionRequest) => void;
  onVisibility: (entry: Entry, key: VisibilityKey) => void;
  onFocusFallback?: () => void;
  onMinimumHeight?: (height: number) => void;
}
const CATEGORIES: CategoryDefinition[] = [
  { category: "protein", label: "Protein", visibility: "protein" },
  { category: "dna", label: "DNA" }, { category: "rna", label: "RNA" },
  { category: "other_polymer", label: "Other polymer" },
  { category: "ligand", label: "Ligands / cofactors", visibility: "ligands" },
  { category: "water", label: "Water", visibility: "solvent" },
  { category: "solvent", label: "Other solvent / additives", visibility: "solvent" },
  { category: "ion", label: "Ions / metals", visibility: "ions" },
  { category: "other_heterogen", label: "Other heterogens" },
  { category: "unclassified", label: "Unclassified" },
];
const visibilityScope = (key: VisibilityKey) => key === "solvent"
  ? "all solvent, including water and additives" : key === "ligands" ? "all ligands / cofactors" : key === "ions" ? "all ions / metals" : "all protein";

function VirtualHierarchy({ projectId, entry, selection, onSelect, onSelectResidue, onVisibility, onFocusFallback, onMinimumHeight, projection }: StructureHierarchyProps & { projection: StructureProjection }) {
  const browsing = useNavigationStore(state => state.projectId === projectId ? state.entries[entry.id] ?? emptyBrowsingState : emptyBrowsingState);
  const projectEpoch = useSelectionStore(state => state.projectEpoch);
  const coarse = useMediaQuery("(any-pointer: coarse), (max-width: 840px)");
  const rowHeight = coarse ? 44 : 32;
  const scroller = useRef<HTMLDivElement>(null);
  const labelNodes = useRef(new Map<string, HTMLButtonElement>());
  const detailsNodes = useRef(new Map<string, HTMLButtonElement>());
  const ownsFocus = useRef(false);
  const focusedParent = useRef<string | null>(null);
  const focusedCategory = useRef<ComponentCategory | null>(null);
  const lastDetailsKey = useRef<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<string | null>(null);
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const index = useMemo(() => buildComponentMembership(projection.structure, projection.hierarchy), [projection]);
  const selectedIds = useMemo(() => new Set(selection.atoms.filter(atom => atom.structure_id === entry.id).map(atom => atom.atom_id)), [selection.atoms, entry.id]);
  const categories = useMemo(() => CATEGORIES.map(definition => ({ definition,
    components: projection.hierarchy.components.filter(component => component.category === definition.category),
  })).filter(category => category.components.length), [projection.hierarchy]);
  const rows = useMemo(() => hierarchyRows({ entryId: entry.id, normalized: projection.structure, hierarchy: projection.hierarchy },
    index, categories, browsing.categories, browsing.proteins), [entry.id, projection, index, categories, browsing.categories, browsing.proteins]);
  const positions = useMemo(() => new Map(rows.map((row, position) => [row.key, position])), [rows]);
  const activeKey = focusedKey && positions.has(focusedKey) ? focusedKey : rows[0]?.key;
  const getItemKey = useCallback((position: number) => rows[position].key, [rows]);
  const pinned = useMemo(() => new Set([activeKey, detailsKey].flatMap(key => key && positions.has(key) ? [positions.get(key)!] : [])), [activeKey, detailsKey, positions]);
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) =>
    [...new Set([...defaultRangeExtractor(range), ...pinned])].sort((a, b) => a - b), [pinned]);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight, getItemKey, overscan: 8, rangeExtractor,
    initialOffset: () => useNavigationStore.getState().entries[entry.id]?.scrollTop ?? 0,
  });
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const present = new Set(categories.map(category => category.definition.category));
    const next = browsing.categories.filter(category => present.has(category));
    const proteinIds = new Set(projection.hierarchy.components.filter(c => c.category === "protein" && c.classification_status === "assigned").map(c => c.id));
    const proteins = browsing.proteins.filter(id => proteinIds.has(id));
    if (next.length !== browsing.categories.length || proteins.length !== browsing.proteins.length)
      useNavigationStore.getState().updateEntry(projectId, entry.id, { categories: next, proteins });
  }, [categories, browsing.categories, browsing.proteins, projection.hierarchy, entry.id, projectId]);
  useLayoutEffect(() => {
    // Reconcile a removed focused row against its surviving category or the first row.
    if (focusedKey && !positions.has(focusedKey)) {
      const parent = focusedParent.current && positions.has(focusedParent.current) ? focusedParent.current : `category:${focusedCategory.current}`;
      const fallback = positions.has(parent) ? parent : rows[0]?.key ?? null;
      setFocusedKey(fallback);
      if (ownsFocus.current && document.hasFocus()) {
        if (positions.has(parent)) setFocusRequest(parent);
        else onFocusFallback?.();
      }
    }
    if (detailsKey && detailsKey !== "warnings" && !positions.has(detailsKey)) setDetailsKey(null);
  }, [focusedKey, positions, rows, detailsKey, onFocusFallback]);
  useLayoutEffect(() => {
    if (focusRequest && labelNodes.current.has(focusRequest)) {
      labelNodes.current.get(focusRequest)?.focus(); setFocusRequest(null);
    }
  }, [focusRequest, virtualItems]);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const saved = useNavigationStore.getState().entries[entry.id]?.scrollTop ?? 0;
    const bounded = Math.min(saved, Math.max(0, rows.length * rowHeight - element.clientHeight));
    element.scrollTop = bounded;
  }, [entry.id, rows.length, rowHeight]);
  useLayoutEffect(() => { if (detailsKey) lastDetailsKey.current = detailsKey; }, [detailsKey]);
  useLayoutEffect(() => { virtualizer.measure(); }, [rowHeight, virtualizer]);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element?.parentElement) onMinimumHeight?.(2 * rowHeight + element.parentElement.clientHeight - element.clientHeight);
  }, [rowHeight, projection.hierarchy.warnings.length, onMinimumHeight]);
  const focusRow = (row: HierarchyRow) => { focusedCategory.current = row.definition.category; focusedParent.current = row.parentKey; setFocusedKey(row.key); };
  const openRow = (row: HierarchyRow) => row.kind === "category" ? browsing.categories.includes(row.definition.category)
    : row.kind === "component" && browsing.proteins.includes(row.component.id);
  const toggle = (row: HierarchyRow) => {
    if (!row.expandable) return;
    const current = useNavigationStore.getState().entries[entry.id] ?? emptyBrowsingState;
    focusRow(row);
    if (row.kind === "category") {
      const next = new Set(current.categories);
      if (next.has(row.definition.category)) next.delete(row.definition.category); else next.add(row.definition.category);
      useNavigationStore.getState().updateEntry(projectId, entry.id, { categories: [...next] });
    } else if (row.kind === "component") {
      const next = new Set(current.proteins);
      if (next.has(row.component.id)) next.delete(row.component.id); else next.add(row.component.id);
      useNavigationStore.getState().updateEntry(projectId, entry.id, { proteins: [...next] });
    }
  };
  const requestFocus = (position: number) => {
    const row = rows[position];
    if (!row) return;
    focusRow(row); setFocusRequest(row.key); virtualizer.scrollToIndex(position, { align: "auto" });
  };
  const moveFocus = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const position = positions.get(activeKey ?? "") ?? 0;
    const row = rows[position];
    if (event.key === "ArrowRight" && row) {
      event.preventDefault();
      if (row.expandable && !openRow(row)) toggle(row);
      else if (rows[position + 1]?.parentKey === row.key) requestFocus(position + 1);
      return;
    }
    if (event.key === "ArrowLeft" && row) {
      event.preventDefault();
      if (row.expandable && openRow(row)) toggle(row);
      else if (row.parentKey) requestFocus(positions.get(row.parentKey) ?? 0);
      return;
    }
    const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1
      : event.key === "ArrowDown" ? Math.min(position + 1, rows.length - 1)
        : event.key === "ArrowUp" ? Math.max(position - 1, 0) : null;
    if (next === null) return;
    event.preventDefault(); requestFocus(next);
  };
  const details = useMemo<ComponentDetailsContent | null>(() => {
    if (!detailsKey) return null;
    if (detailsKey === "warnings") return { title: "Hierarchy warnings", parent: entry.name,
      atomCount: projection.structure.atoms.length, components: projection.hierarchy.components,
      warnings: projection.hierarchy.warnings };
    const row = rows.find(row => row.key === detailsKey);
    if (!row || row.kind === "residue") return null;
    const components = row.kind === "category" ? row.components : [row.component];
    return { title: row.kind === "category" ? row.definition.label : row.component.display_label,
      parent: entry.name, atomCount: row.members.length, components,
      warnings: components.flatMap(component => component.warnings),
      visibility: row.definition.visibility ? `The visibility control affects ${visibilityScope(row.definition.visibility)} in this entry. Parent visibility remains independent.` : "No separate visibility group is defined for this category.",
    };
  }, [detailsKey, entry.name, projection, rows]);
  const warningsLauncher = useRef<HTMLButtonElement>(null);
  const returnDetailsFocus = () => {
    if (useNavigationStore.getState().projectId !== projectId || useNavigationStore.getState().inspectedEntryId !== entry.id) return;
    const node = lastDetailsKey.current === "warnings" ? warningsLauncher.current : detailsNodes.current.get(lastDetailsKey.current ?? "");
    if (node?.isConnected) node.focus();
    else {
      const parent = `category:${focusedCategory.current}`;
      if (positions.has(parent)) { setFocusedKey(parent); setFocusRequest(parent); virtualizer.scrollToIndex(positions.get(parent)!); }
      else onFocusFallback?.();
    }
  };
  return <>
    {projection.hierarchy.warnings.length ? <button ref={warningsLauncher} type="button" className="hierarchy-warning-summary"
      onClick={() => setDetailsKey("warnings")}><AlertTriangle size={14} aria-hidden="true" /> {projection.hierarchy.warnings.length} hierarchy warnings · Details</button> : null}
    <span id={`hierarchy-help-${entry.id}`} className="sr-only">Use Up and Down, Home and End to navigate all expanded rows. Right expands or enters children; Left collapses or returns to the parent. Labels select. Disclosure arrows expand. Details shows provenance and warnings.</span>
    <div className="component-scroll panel-scroll" ref={scroller} tabIndex={-1} aria-label={`Components in ${entry.name}`} aria-describedby={`hierarchy-help-${entry.id}`}
      onKeyDown={moveFocus} onScroll={event => useNavigationStore.getState().updateEntry(projectId, entry.id, { scrollTop: event.currentTarget.scrollTop })}
      onFocusCapture={() => { ownsFocus.current = true; }}
      onBlurCapture={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) ownsFocus.current = false; }}>
      <div role="list" aria-label={`Component rows in ${entry.name}`} className="hierarchy-virtual-list" style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map(item => {
          const row = rows[item.index];
          const isCategory = row.kind === "category";
          const label = row.label;
          const residueContext = row.kind === "residue" ? ` · ${rows[positions.get(row.parentKey!)!]?.label ?? row.component.display_label}` : "";
          const active = row.key === activeKey;
          const open = openRow(row);
          const visibility = row.definition.visibility;
          const visible = visibility ? entry.viewer_settings.components[visibility] : undefined;
          const warningCount = isCategory ? row.components.reduce((sum, component) => sum + component.warnings.length, 0) : row.kind === "residue" ? 0 : row.component.warnings.length;
          return <div key={row.key} role="listitem" aria-posinset={item.index + 1} aria-setsize={rows.length}
            data-row-key={row.key} data-component-category={row.definition.category}
            data-residue-id={row.kind === "residue" ? row.residue.id : undefined}
            className={`hierarchy-row ${isCategory ? "hierarchy-category" : row.kind === "residue" ? "hierarchy-residue-row" : "hierarchy-component-row"}`}
            style={{ paddingLeft: row.depth * 8, height: rowHeight, transform: `translateY(${item.start}px)` }}>
            {row.expandable ? <button type="button" className="hierarchy-disclosure" tabIndex={active ? 0 : -1}
              aria-label={`${open ? "Collapse" : "Expand"} ${label} in ${entry.name}`} aria-expanded={open}
              onFocus={() => focusRow(row)} onClick={() => toggle(row)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="hierarchy-indent" aria-hidden="true" />}
            <button ref={node => { if (node) labelNodes.current.set(row.key, node); else labelNodes.current.delete(row.key); }}
              type="button" className={isCategory ? "hierarchy-select" : "hierarchy-component"} tabIndex={active ? 0 : -1}
              aria-label={`Select ${label}${residueContext} in ${entry.name}`} title={row.kind === "residue" ? `${label}${residueContext} in ${entry.name}` : undefined} aria-describedby={warningCount ? `${entry.id}-${row.key}-warnings` : undefined} aria-pressed={membershipSelectedState(row.members, selectedIds)}
              onFocus={() => focusRow(row)} onClick={event => {
                const mode = selectionMode(event.nativeEvent);
                if (row.kind === "residue") {
                  if (entry.current_artifact_id) onSelectResidue?.({ projectId, projectEpoch, entryId: entry.id,
                    artifactId: entry.current_artifact_id, residueId: row.residue.id, source: "project", mode, shift: event.shiftKey });
                } else onSelect(isCategory ? indexedCategorySelection(entry.id, row.members) : indexedComponentSelection(entry.id, row.component, row.members), mode);
              }}>
              <span>{label}</span>{isCategory ? <small aria-label={`${row.components.length} components`}>{row.components.length}</small> : null}
              {warningCount ? <AlertTriangle size={13} className="entry-warning" aria-hidden="true" /> : null}
            </button>
            {warningCount ? <span className="sr-only" id={`${entry.id}-${row.key}-warnings`}>{warningCount} {warningCount === 1 ? "warning" : "warnings"}. Open Details for complete messages.</span> : null}
            {isCategory && visibility ? <IconButton tabIndex={active ? 0 : -1} label={`${visible ? "Hide" : "Show"} ${visibilityScope(visibility)} in ${entry.name}`}
              onFocus={() => focusRow(row)} onClick={() => onVisibility(entry, visibility)}>{visible ? <Eye size={14} /> : <EyeOff size={14} />}</IconButton> : null}
            {row.kind !== "residue" ? <IconButton ref={node => { if (node) detailsNodes.current.set(row.key, node); else detailsNodes.current.delete(row.key); }} tabIndex={active ? 0 : -1}
              label={`Details for ${label} in ${entry.name}`} onFocus={() => focusRow(row)} onClick={() => setDetailsKey(row.key)}><Info size={14} /></IconButton> : null}
          </div>;
        })}
      </div>
    </div>
    <ComponentDetails details={details} onClose={() => setDetailsKey(null)} onReturnFocus={returnDetailsFocus} />
  </>;
}

export function StructureHierarchy(props: StructureHierarchyProps) {
  const { projectId, entry, onFocusFallback } = props;
  const ownsFocus = useRef(false);
  const artifact = useRef(entry.current_artifact_id);
  const query = useQuery({ queryKey: ["structure", projectId, entry.id, entry.current_artifact_id],
    queryFn: () => molecularApi.structure(projectId, entry.id), retry: false, staleTime: Number.POSITIVE_INFINITY });
  useLayoutEffect(() => {
    if (artifact.current !== entry.current_artifact_id && ownsFocus.current && document.hasFocus()) onFocusFallback?.();
    artifact.current = entry.current_artifact_id;
  }, [entry.current_artifact_id, onFocusFallback]);
  return <div className="hierarchy-shell" onFocusCapture={() => { ownsFocus.current = true; }}
    onBlurCapture={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) ownsFocus.current = false; }}>
    {query.isPending ? <div className="hierarchy-loading" role="status"><LoaderCircle size={14} /> Loading components</div>
      : query.isError || !query.data ? <div className="hierarchy-error" role="alert">Component hierarchy unavailable
        <button type="button" onClick={() => void query.refetch()}>Retry components</button></div>
        : <VirtualHierarchy key={`${projectId}:${entry.id}`} {...props} projection={query.data} />}
  </div>;
}
