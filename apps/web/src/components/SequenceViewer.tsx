import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import type { Selection } from "../api/types";
import type { ResidueSelectionRequest } from "../selection/gestures";
import { useWorkspaceStore } from "../store/workspace";
import { useSequenceNavigationStore } from "../store/sequenceNavigation";
import { IconButton } from "./IconButton";
import { ProteinSequence, type SequenceRow } from "./ProteinSequence";

export function SequenceViewer({ projectId, rows, selection, loading, failed, onSelectResidue, onHide }: {
  projectId: string; rows: SequenceRow[]; selection: Selection; loading: boolean; failed: boolean;
  onSelectResidue?: (request: ResidueSelectionRequest) => void;
  onHide: () => void;
}) {
  const display = useWorkspaceStore(state => state.sequenceDisplay);
  const setDisplay = useWorkspaceStore(state => state.setSequenceDisplay);
  const toggle = useRef<HTMLButtonElement>(null);
  const contentId = useId();
  useLayoutEffect(() => {
    const navigation = useSequenceNavigationStore.getState();
    if (navigation.projectId !== projectId) return;
    const restore = navigation.restoreFocus;
    if (!rows.length) {
      navigation.rememberFocus(projectId, null);
      navigation.reconcile(projectId, []);
    }
    if (display === "expanded" && rows.length || !restore) return;
    navigation.setRestoreFocus(projectId, false);
    // Child unmount retains owned responsive focus. If no list remains, the
    // surviving header owns that fallback, without reclaiming outside focus.
    if (document.hasFocus() && document.activeElement === document.body) {
      toggle.current?.focus({ preventScroll: true });
    }
  }, [display, projectId, rows.length]);
  if (display === "hidden") return null;
  const expanded = display === "expanded";
  return <Tooltip.Provider delayDuration={350}>
    <section className="sequence-viewer" aria-label="Protein sequence viewer" data-display={display}>
      <div className="sequence-header">
        <IconButton ref={toggle} label={expanded ? "Collapse sequences" : "Expand sequences"}
          aria-expanded={expanded} aria-controls={contentId} tooltipClassName="viewer-toolbar-tooltip"
          onClick={() => setDisplay(expanded ? "collapsed" : "expanded")}>
          {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </IconButton>
        <span className="sequence-heading">Sequence</span>
        <small>{rows.length ? `${rows.length} ${rows.length === 1 ? "chain" : "chains"}`
          : loading ? "Loading sequences…" : failed ? "Sequence unavailable · see viewer" : "No displayed protein chains"}</small>
        {rows.length && (loading || failed) ? <small role="status">{failed ? "Some sequences unavailable · see viewer" : "Updating…"}</small> : null}
        <IconButton label="Hide sequences" tooltipClassName="viewer-toolbar-tooltip" onClick={onHide}><X size={15} /></IconButton>
      </div>
      <div id={contentId} className="sequence-content" hidden={!expanded}>
        {expanded && rows.length ? <ProteinSequence projectId={projectId} rows={rows} selection={selection}
          onSelectResidue={onSelectResidue} onFocusFallback={() => toggle.current?.focus({ preventScroll: true })} /> : null}
      </div>
    </section>
  </Tooltip.Provider>;
}
