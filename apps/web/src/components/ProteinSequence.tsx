import * as Tooltip from "@radix-ui/react-tooltip";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Selection } from "../api/types";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { membershipSelectedState } from "../selection/componentMembership";
import { residueLabel, residuePosition, type ResidueSelectionRequest } from "../selection/gestures";
import { selectionMode } from "../selection/selection";
import { residueCode, type ProteinSequenceRow } from "../selection/sequence";
import { useSelectionStore } from "../store/selection";
import { sequenceScroll, useSequenceNavigationStore, type SequenceFocus } from "../store/sequenceNavigation";

export interface SequenceRow extends ProteinSequenceRow {
  entryId: string;
  entryName: string;
  artifactId: string;
  current: boolean;
}
interface ProteinSequenceProps {
  projectId: string;
  rows: SequenceRow[];
  selection: Selection;
  onSelectResidue?: (request: ResidueSelectionRequest) => void;
  onFocusFallback: () => void;
}
const EMPTY_IDS = new Set<number>();

function ResidueRow({ row, projectId, selected, active, request, coarse, onFocus, onNavigate, onSelectResidue }: {
  row: SequenceRow; projectId: string; selected: Set<number>; active: SequenceFocus | null;
  request: SequenceFocus | null; coarse: boolean;
  onFocus: (focus: SequenceFocus) => void;
  onNavigate: (rowKey: string, residueIndex: number, direction: number) => void;
  onSelectResidue?: (request: ResidueSelectionRequest) => void;
}) {
  const projectEpoch = useSelectionStore(state => state.projectEpoch);
  const scroller = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<number, HTMLButtonElement>());
  const stride = 52;
  const activeIndex = active?.rowKey === row.key ? row.residues.findIndex(residue => residue.id === active.residueId) : -1;
  const requestIndex = request?.rowKey === row.key ? row.residues.findIndex(residue => residue.id === request.residueId) : -1;
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) =>
    [...new Set([...defaultRangeExtractor(range), ...(activeIndex >= 0 ? [activeIndex] : [])])].sort((a, b) => a - b), [activeIndex]);
  const getItemKey = useCallback((index: number) => row.residues[index].id, [row.residues]);
  const virtualizer = useVirtualizer({ horizontal: true, count: row.residues.length,
    getScrollElement: () => scroller.current, estimateSize: () => stride, getItemKey,
    overscan: 8, rangeExtractor, initialRect: { width: 320, height: coarse ? 64 : 52 },
    initialOffset: () => sequenceScroll(projectId, row.key),
  });
  const items = virtualizer.getVirtualItems();
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = Math.min(sequenceScroll(projectId, row.key),
      Math.max(0, row.residues.length * stride - element.clientWidth));
  }, [projectId, row.key, row.residues.length]);
  useLayoutEffect(() => {
    if (requestIndex < 0) return;
    virtualizer.scrollToIndex(requestIndex, { align: "auto" });
    nodes.current.get(row.residues[requestIndex].id)?.focus({ preventScroll: true });
  }, [requestIndex, row.residues, virtualizer, items]);
  const move = (event: KeyboardEvent, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let target = index;
    if (event.key === "ArrowRight") target++;
    else if (event.key === "ArrowLeft") target--;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = row.residues.length - 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault(); onNavigate(row.key, index, event.key === "ArrowUp" ? -1 : 1); return;
    } else return;
    event.preventDefault();
    const residue = row.residues[Math.max(0, Math.min(row.residues.length - 1, target))];
    onNavigate(row.key, row.residues.indexOf(residue), 0);
  };
  const context = `chain ${row.chainName} in ${row.entryName}${row.qualifier}`;
  return <div className="sequence-chain-row" data-sequence-row={row.key} aria-busy={!row.current}>
    <div className="sequence-chain-name" title={`${row.entryName} · chain ${row.chainName}${row.qualifier}`}>
      <span>{row.entryName}</span><small>Chain {row.chainName}{row.qualifier}</small>
    </div>
    <div className="sequence-residue-scroll" ref={scroller} onScroll={event =>
      useSequenceNavigationStore.getState().rememberRowScroll(projectId, row.key, event.currentTarget.scrollLeft)}>
      <div className="sequence-residues" role="list" aria-label={`Residues · ${context}`} style={{ width: virtualizer.getTotalSize() }}>
        {items.map(item => {
          const residue = row.residues[item.index];
          const coverage = membershipSelectedState(row.residueAtoms.get(residue.id) ?? [], selected);
          const label = `${residueLabel(residue)} · ${context}`;
          return <div role="listitem" key={residue.id} aria-posinset={item.index + 1} aria-setsize={row.residues.length}
            className="sequence-residue-item" style={{ width: stride, transform: `translateX(${item.start}px)` }}>
            <Tooltip.Root><Tooltip.Trigger asChild>
              <button ref={node => { if (node) nodes.current.set(residue.id, node); else nodes.current.delete(residue.id); }}
                type="button" className="sequence-residue" data-residue-id={residue.id}
                tabIndex={item.index === activeIndex ? 0 : -1} aria-pressed={coverage}
                aria-label={label} aria-disabled={!row.current || !onSelectResidue}
                onFocus={() => onFocus({ rowKey: row.key, residueId: residue.id })}
                onKeyDown={event => move(event, item.index)} onClick={event => {
                  if (!row.current) return;
                  onSelectResidue?.({ projectId, projectEpoch, entryId: row.entryId, artifactId: row.artifactId,
                    residueId: residue.id, source: "sequence", mode: selectionMode(event.nativeEvent), shift: event.shiftKey });
                }}><span>{residueCode(residue)}</span><small>{residuePosition(residue)}</small></button>
            </Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip viewer-toolbar-tooltip" sideOffset={5}>
              {label}{!row.current ? " · updating sequence" : ""}<Tooltip.Arrow className="tooltip-arrow" />
            </Tooltip.Content></Tooltip.Portal></Tooltip.Root>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

export function ProteinSequence({ projectId, rows, selection, onSelectResidue, onFocusFallback }: ProteinSequenceProps) {
  const coarse = useMediaQuery("(any-pointer: coarse), (max-width: 840px)");
  const rowHeight = coarse ? 64 : 52;
  const scroller = useRef<HTMLDivElement>(null);
  const ownsFocus = useRef(false);
  const lastOwnedFocus = useRef<SequenceFocus | null>(null);
  const focus = useSequenceNavigationStore(state => state.projectId === projectId ? state.focus : null);
  const [request, setRequest] = useState<SequenceFocus | null>(null);
  const active = useMemo(() => focus && rows.some(row => row.key === focus.rowKey && row.residues.some(r => r.id === focus.residueId))
    ? focus : rows[0]?.residues[0] ? { rowKey: rows[0].key, residueId: rows[0].residues[0].id } : null, [focus, rows]);
  const activeIndex = rows.findIndex(row => row.key === active?.rowKey);
  const getItemKey = useCallback((index: number) => rows[index].key, [rows]);
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) =>
    [...new Set([...defaultRangeExtractor(range), ...(activeIndex >= 0 ? [activeIndex] : [])])].sort((a, b) => a - b), [activeIndex]);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight, getItemKey, overscan: 4, rangeExtractor,
    initialRect: { width: 640, height: rowHeight * 3 },
    initialOffset: () => sequenceScroll(projectId),
  });
  const selected = useMemo(() => {
    const result = new Map<string, Set<number>>();
    for (const atom of selection.atoms) {
      const ids = result.get(atom.structure_id) ?? new Set<number>();
      ids.add(atom.atom_id); result.set(atom.structure_id, ids);
    }
    return result;
  }, [selection.atoms]);
  useLayoutEffect(() => { virtualizer.measure(); }, [rowHeight, virtualizer]);
  useLayoutEffect(() => {
    const element = scroller.current;
    const navigation = useSequenceNavigationStore.getState();
    if (navigation.projectId === projectId && navigation.restoreFocus) {
      navigation.setRestoreFocus(projectId, false);
      if (document.hasFocus() && document.activeElement === document.body && navigation.focus) {
        setRequest(navigation.focus);
      }
    }
    return () => {
      if (element?.contains(document.activeElement)) {
        useSequenceNavigationStore.getState().setRestoreFocus(projectId, true);
      }
    };
  }, [projectId]);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = Math.min(sequenceScroll(projectId),
      Math.max(0, rows.length * rowHeight - element.clientHeight));
  }, [projectId, rows.length, rowHeight]);
  useEffect(() => { useSequenceNavigationStore.getState().reconcile(projectId, rows.map(row => row.key)); }, [projectId, rows]);
  useLayoutEffect(() => {
    const previous = lastOwnedFocus.current;
    const removed = previous && !rows.some(row => row.key === previous.rowKey && row.residues.some(r => r.id === previous.residueId));
    if (!removed) return;
    lastOwnedFocus.current = null;
    useSequenceNavigationStore.getState().rememberFocus(projectId, active);
    if (ownsFocus.current && document.hasFocus()) {
      if (active) { setRequest(active); virtualizer.scrollToIndex(Math.max(0, activeIndex), { align: "auto" }); }
      else onFocusFallback();
    }
  }, [rows, projectId, active, activeIndex, virtualizer, onFocusFallback]);
  const focusResidue = (target: SequenceFocus) => {
    lastOwnedFocus.current = target;
    useSequenceNavigationStore.getState().rememberFocus(projectId, target);
  };
  const navigate = (rowKey: string, residueIndex: number, direction: number) => {
    const index = Math.max(0, Math.min(rows.length - 1, rows.findIndex(row => row.key === rowKey) + direction));
    const row = rows[index];
    const residue = row?.residues[Math.min(residueIndex, row.residues.length - 1)];
    if (!residue) return;
    const target = { rowKey: row.key, residueId: residue.id };
    focusResidue(target); setRequest(target); virtualizer.scrollToIndex(index, { align: "auto" });
  };
  return <div ref={scroller} className="sequence-chain-scroll" role="list" aria-label="Displayed protein chains"
    style={{ height: Math.min(3, rows.length) * rowHeight }}
    onFocusCapture={() => { ownsFocus.current = true; }} onBlurCapture={event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
        ownsFocus.current = false; setRequest(null);
      }
    }} onScroll={event => useSequenceNavigationStore.getState().rememberScroll(projectId, event.currentTarget.scrollTop)}>
    <div className="sequence-chain-window" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(item => {
        const row = rows[item.index];
        return <div key={row.key} role="listitem" aria-posinset={item.index + 1} aria-setsize={rows.length}
          className="sequence-chain-item" style={{ height: rowHeight, transform: `translateY(${item.start}px)` }}>
          <ResidueRow row={row} projectId={projectId} selected={selected.get(row.entryId) ?? EMPTY_IDS}
            active={active} request={request} coarse={coarse} onFocus={target => { focusResidue(target); setRequest(null); }} onNavigate={navigate} onSelectResidue={onSelectResidue} />
        </div>;
      })}
    </div>
  </div>;
}
