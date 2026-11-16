import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownUp, ChevronLeft, ChevronRight, Info, ListOrdered, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AtomReference, Entry, MeasurementKind, NormalizedStructure, Selection } from "../api/types";
import { formatMeasurement } from "../measurements/geometry";
import { atomInspection, inspectMeasurementDraft, inspectSelectionGeometry } from "../selection/inspection";
import "./viewer-information.css";

export interface ViewerInformationStripProps {
  measurementBasis?: { kind: MeasurementKind; slots: readonly (AtomReference | null)[]; structures?: ReadonlyMap<string, NormalizedStructure> };
  selection: Selection;
  order: AtomReference[] | null;
  structures: ReadonlyMap<string, NormalizedStructure>;
  entries: readonly Entry[];
  hover: AtomReference | null;
  paused: boolean;
  onOrder: (targets: AtomReference[]) => void;
  onLoadEntry?: (entryId: string) => Promise<void>;
  onInspectEntry?: (entryId: string | null) => void;
}

const referenceKey = (reference: AtomReference) => JSON.stringify([reference.structure_id, reference.atom_id]);
const pageSize = 50;

function targetLabel(reference: AtomReference, structures: ReadonlyMap<string, NormalizedStructure>, entryNames: ReadonlyMap<string, string>) {
  const info = atomInspection(reference, structures, entryNames);
  return info ? `${info.label}${info.alternateLocation ? ` · alternate ${info.alternateLocation}` : ""} · atom ${reference.atom_id}`
    : `${entryNames.get(reference.structure_id) ?? reference.structure_id} / atom ${reference.atom_id} · unavailable`;
}

/** Passive viewer feedback; the disclosures never change molecular selection. */
export function ViewerInformationStrip({ selection, order, structures, entries, hover, paused, onOrder, onLoadEntry, onInspectEntry, measurementBasis }: ViewerInformationStripProps) {
  const targetNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
    return new Map(entries.map(entry => [entry.id, counts.get(entry.name)! > 1 ? `${entry.name} (${entry.id})` : entry.name]));
  }, [entries]);
  const entryArtifacts = useMemo(() => new Map(entries.map(entry => [entry.id, entry.current_artifact_id])), [entries]);
  const geometry = useMemo(() => measurementBasis
    ? inspectMeasurementDraft(measurementBasis.kind, measurementBasis.slots, measurementBasis.structures ?? structures, paused)
    : inspectSelectionGeometry(selection.atoms, order, structures, paused), [selection.atoms, order, structures, paused, measurementBasis]);
  const subjectKey = useMemo(() => JSON.stringify(selection.atoms.map(reference => [reference.structure_id, reference.atom_id, entryArtifacts.get(reference.structure_id)])), [selection.atoms, entryArtifacts]);
  const contextKey = `${subjectKey}:${paused}:${JSON.stringify(measurementBasis ? [measurementBasis.kind, measurementBasis.slots] : null)}`;
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  const [dialog, setDialog] = useState<{ kind: "details" | "order"; context: string } | null>(null);
  const open = dialog !== null && dialog.context === contextKey;
  const detailsOpen = open && dialog?.kind === "details";
  useEffect(() => {
    if (!detailsOpen) onInspectEntry?.(null);
  }, [detailsOpen, onInspectEntry]);
  const openContext = useRef(contextKey);
  const content = useRef<HTMLDivElement>(null);
  const detailsTrigger = useRef<HTMLButtonElement>(null);
  const orderTrigger = useRef<HTMLButtonElement>(null);
  const returnTarget = useRef<HTMLButtonElement | null>(null);
  const outsideInteraction = useRef(false);
  const hoverInfo = hover ? atomInspection(hover, structures, targetNames) : null;
  const selectedInfo = selection.atoms.length === 1 ? atomInspection(selection.atoms[0], structures, targetNames) : null;
  const shownInfo = hoverInfo ?? selectedInfo;
  const readout = geometry.status === "ready" && geometry.kind && geometry.value !== undefined
    ? `${geometry.kind === "dihedral" ? "Torsion" : geometry.kind === "angle" ? "Angle" : "Distance"} ${formatMeasurement(geometry.kind, geometry.value)}`
    : geometry.status === "ordering_required" ? "Order targets"
      : geometry.status === "unavailable" ? geometry.reason ?? "Geometry unavailable"
        : `${selection.atoms.length} ${selection.atoms.length === 1 ? "atom" : "atoms"} selected`;

  const position = useCallback(() => {
    const panel = content.current;
    const anchor = returnTarget.current;
    if (!panel || !anchor) return;
    const box = anchor.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    panel.style.setProperty("--viewer-info-left", `${Math.max(8, Math.min(box.left, window.innerWidth - bounds.width - 8))}px`);
    // Anchor the lower edge, not the initial content height. Selecting an atom
    // can grow the panel before a ResizeObserver callback has a chance to run.
    panel.style.setProperty("--viewer-info-bottom", `${Math.max(8, Math.min(window.innerHeight - box.top + 8, window.innerHeight - 16))}px`);
  }, []);
  const attachContent = useCallback((node: HTMLDivElement | null) => {
    content.current = node;
    if (node) position();
  }, [position]);

  useLayoutEffect(() => {
    if (dialog && dialog.context !== contextKey) setDialog(null);
  }, [dialog, contextKey]);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    const observer = new ResizeObserver(position);
    if (content.current) observer.observe(content.current);
    if (returnTarget.current) observer.observe(returnTarget.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, position]);

  const show = (kind: "details" | "order") => {
    returnTarget.current = kind === "details" ? detailsTrigger.current : orderTrigger.current;
    outsideInteraction.current = false;
    openContext.current = contextKey;
    setDialog({ kind, context: contextKey });
  };

  return <div className={`viewer-information-strip${measurementBasis ? " has-measurement-basis" : ""}`} role="region" aria-label="Viewer information">
    <div className="viewer-info-body">
      <div className="viewer-info-identity">
        <span className="viewer-info-text" title={shownInfo?.label} data-testid="viewer-atom-information">
          {shownInfo?.label ?? (selection.atoms.length > 1 ? "Selected atoms" : "Hover or select an atom")}
        </span>
        <button ref={detailsTrigger} type="button" className="viewer-info-action" aria-label="Atom details" title="Inspect selected atom details"
          aria-haspopup="dialog" aria-expanded={open && dialog.kind === "details"} disabled={!selection.atoms.length}
          onClick={() => show("details")}><Info size={16} aria-hidden="true" /></button>
      </div>
      <div className="viewer-info-geometry" data-geometry-status={geometry.status}>
        {measurementBasis ? <span className="viewer-info-basis">Measurement targets</span> : null}
        <span className="viewer-info-text" title={readout} data-testid="viewer-selection-geometry">{readout}</span>
        {!measurementBasis && selection.atoms.length >= 2 && selection.atoms.length <= 4 ? <button ref={orderTrigger} type="button" className="viewer-info-action"
          aria-label={geometry.status === "ordering_required" ? "Order measurement targets" : "Inspect measurement targets"}
          title={geometry.status === "ordering_required" ? "Choose measurement target order" : "Inspect or change target order"}
          aria-haspopup="dialog" aria-expanded={open && dialog.kind === "order"} onClick={() => show("order")}>
          <ListOrdered size={16} aria-hidden="true" />
          {geometry.status === "ordering_required" ? <span>Order</span> : null}
        </button> : null}
      </div>
    </div>
    <Dialog.Root open={open} onOpenChange={value => { if (!value) setDialog(null); }} modal={false}>
      <Dialog.Portal><Dialog.Content ref={attachContent} className="dialog-content viewer-info-dialog"
        onOpenAutoFocus={event => { event.preventDefault(); position(); content.current?.focus(); }}
        onInteractOutside={() => { outsideInteraction.current = true; }}
        onEscapeKeyDown={event => { if (!content.current?.contains(document.activeElement)) event.preventDefault(); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (!outsideInteraction.current && openContext.current === currentContext.current && returnTarget.current?.isConnected) returnTarget.current.focus({ preventScroll: true });
        }}>
        <div className="viewer-info-dialog-heading">
          <Dialog.Title>{dialog?.kind === "order" ? "Measurement targets" : "Atom details"}</Dialog.Title>
          <Dialog.Close asChild><button type="button" className="viewer-info-action" aria-label="Close viewer information"><X size={17} aria-hidden="true" /></button></Dialog.Close>
        </div>
        {dialog?.kind === "order" ? <TargetOrder key={contextKey} atoms={selection.atoms} order={order} structures={structures} entryNames={targetNames} paused={paused}
          onUse={targets => {
            if (currentContext.current !== contextKey) return;
            onOrder(targets);
            setDialog(null);
          }} /> : <AtomDetails key={subjectKey} atoms={selection.atoms} structures={structures} entryNames={targetNames} paused={paused} active={open && dialog?.kind === "details"} onLoadEntry={onLoadEntry} onInspectEntry={onInspectEntry} />}
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div>;
}

function AtomDetails({ atoms, structures, entryNames, paused, active, onLoadEntry, onInspectEntry }: {
  atoms: readonly AtomReference[];
  structures: ReadonlyMap<string, NormalizedStructure>;
  entryNames: ReadonlyMap<string, string>;
  paused: boolean;
  active: boolean;
  onLoadEntry?: (entryId: string) => Promise<void>;
  onInspectEntry?: (entryId: string | null) => void;
}) {
  const [chosen, setChosen] = useState(atoms.length === 1 ? referenceKey(atoms[0]) : "");
  const [page, setPage] = useState(0);
  const reference = useMemo(() => atoms.find(atom => referenceKey(atom) === chosen), [atoms, chosen]);
  const info = reference ? atomInspection(reference, structures, entryNames) : null;
  const [loads, setLoads] = useState<Record<string, { status: "loading" | "finished" | "failed"; error?: string }>>({});
  const startedLoads = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const loadEntry = useCallback((entryId: string) => {
    if (!onLoadEntry || startedLoads.current.has(entryId)) return;
    startedLoads.current.add(entryId);
    setLoads(previous => ({ ...previous, [entryId]: { status: "loading" } }));
    void Promise.resolve().then(() => onLoadEntry(entryId)).then(() => {
      if (mounted.current) setLoads(previous => ({ ...previous, [entryId]: { status: "finished" } }));
    }).catch((error: unknown) => {
      if (mounted.current) setLoads(previous => ({ ...previous, [entryId]: {
        status: "failed", error: error instanceof Error ? error.message : "Atom information could not be loaded.",
      } }));
    });
  }, [onLoadEntry]);
  const entryId = reference?.structure_id;
  useEffect(() => {
    onInspectEntry?.(active ? entryId ?? null : null);
    return () => onInspectEntry?.(null);
  }, [entryId, active, onInspectEntry]);
  useEffect(() => {
    if (active && entryId && !structures.has(entryId)) loadEntry(entryId);
  }, [entryId, active, structures, loadEntry]);
  const load = entryId ? loads[entryId] : undefined;
  const pages = Math.ceil(atoms.length / pageSize);
  const label = (atom: AtomReference) => targetLabel(atom, structures, entryNames);
  const pageAtoms = useMemo(() => atoms.slice(page * pageSize, (page + 1) * pageSize), [atoms, page]);
  return <>
    <Dialog.Description className="viewer-info-secondary">{paused ? "Details describe the committed selected atom. Preview values are unavailable." : "Details describe a selected atom. Hover does not change this target."}</Dialog.Description>
    {atoms.length > 1 ? <>
      <label className="viewer-info-atom-chooser">Selected atom<select value={chosen} onChange={event => setChosen(event.target.value)}>
        <option value="">Choose an atom</option>
        {reference && !pageAtoms.some(atom => referenceKey(atom) === chosen) ? <option value={chosen}>{label(reference)}</option> : null}
        {pageAtoms.map(atom => <option key={referenceKey(atom)} value={referenceKey(atom)}>{label(atom)}</option>)}
      </select></label>
      {pages > 1 ? <div className="viewer-info-pagination">
        <button type="button" className="viewer-info-action" aria-label="Previous selected atom page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
        <span>Page {page + 1} of {pages}</span>
        <button type="button" className="viewer-info-action" aria-label="Next selected atom page" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
      </div> : null}
    </> : null}
    {info ? <dl className="viewer-info-properties">
      <div><dt>Entry</dt><dd>{info.entryName}</dd></div>
      <div><dt>Atom</dt><dd>{info.name || "Unknown"}</dd></div>
      <div><dt>Element</dt><dd>{info.element || "Unknown"}</dd></div>
      <div><dt>Coordinates (Å)</dt><dd>{paused ? "Unavailable during preview" : info.coordinates ? info.coordinates.map(value => value.toFixed(3)).join(", ") : "Unavailable"}</dd></div>
      <div><dt>Formal charge</dt><dd>{info.formalCharge ?? "Unknown"}</dd></div>
      <div><dt>Atom ID</dt><dd>{info.reference.atom_id}</dd></div>
      <div><dt>Source index</dt><dd>{info.sourceIndex}</dd></div>
      <div><dt>Residue</dt><dd>{info.residueName ?? "Unavailable"}</dd></div>
      <div><dt>Residue type</dt><dd>{info.residueType ?? "Unavailable"}</dd></div>
      <div><dt>Residue number</dt><dd>{info.residueNumber === null ? "Unavailable" : `${info.residueNumber}${info.insertionCode ?? ""}`}</dd></div>
      <div><dt>Chain</dt><dd>{info.chain ?? "Unavailable"}</dd></div>
      {info.alternateLocation ? <div><dt>Alternate location</dt><dd>{info.alternateLocation}</dd></div> : null}
      {info.inferredFields.length ? <div><dt>Inferred fields</dt><dd>{info.inferredFields.join(", ")}</dd></div> : null}
    </dl> : reference ? <div>
      <p className="viewer-info-secondary" role={load?.status === "failed" ? "alert" : "status"}>
        {load?.status === "failed" ? load.error : onLoadEntry && (!load || load.status === "loading") ? "Loading atom information…" : "Atom information is unavailable for the current structure."}
      </p>
      {load?.status === "failed" && entryId ? <button type="button" className="viewer-info-use-order" onClick={() => { startedLoads.current.delete(entryId); loadEntry(entryId); }}>Retry atom information</button> : null}
    </div> : <p className="viewer-info-secondary">Choose a selected atom to inspect.</p>}
  </>;
}

function TargetOrder({ atoms, order, structures, entryNames, paused, onUse }: {
  atoms: readonly AtomReference[];
  order: readonly AtomReference[] | null;
  structures: ReadonlyMap<string, NormalizedStructure>;
  entryNames: ReadonlyMap<string, string>;
  paused: boolean;
  onUse: (targets: AtomReference[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(() => atoms.map(() => ""));
  const labels = new Map(atoms.map(atom => [referenceKey(atom), targetLabel(atom, structures, entryNames)]));
  const targets = draft.map(key => atoms.find(atom => referenceKey(atom) === key));
  const valid = !paused && draft.length === atoms.length && draft.every(key => key !== "") && new Set(draft).size === atoms.length
    && targets.every(target => target !== undefined && atomInspection(target, structures, entryNames) !== null);
  const exactOrder = order?.length === atoms.length && new Set(order.map(referenceKey)).size === atoms.length
    && order.every(atom => labels.has(referenceKey(atom))) ? order : null;
  return <>
    <Dialog.Description className="viewer-info-secondary">{atoms.length === 3 ? "Target 2 is the angle vertex." : atoms.length === 4 ? "Signed torsion follows targets 1 → 2 → 3 → 4." : "Distance is independent of target order."} Ordering leaves your selection unchanged.</Dialog.Description>
    {exactOrder ? <ol className="viewer-info-current-targets" aria-label="Current measurement target order">
      {exactOrder.map(atom => <li key={referenceKey(atom)}>{labels.get(referenceKey(atom))}</li>)}
    </ol> : atoms.length === 2 ? <ul className="viewer-info-current-targets" aria-label="Distance participants">
      {atoms.map(atom => <li key={referenceKey(atom)}>{labels.get(referenceKey(atom))}</li>)}
    </ul> : null}
    <div className="viewer-info-order-controls">
      {atoms.map((_, index) => <label key={index}>Target {index + 1}{atoms.length === 3 && index === 1 ? " · vertex" : ""}
        <select value={draft[index]} aria-label={`Measurement target ${index + 1}${atoms.length === 3 && index === 1 ? ", angle vertex" : ""}`} disabled={paused}
          onChange={event => setDraft(previous => previous.map((value, slot) => slot === index ? event.target.value : value))}>
          <option value="">Choose an atom</option>
          {atoms.map(atom => <option key={referenceKey(atom)} value={referenceKey(atom)}>{labels.get(referenceKey(atom))}</option>)}
        </select>
      </label>)}
    </div>
    {paused ? <p className="viewer-info-secondary">Geometry is unavailable during preview.</p> : <p className="viewer-info-secondary">Choose each selected atom once.</p>}
    <button type="button" className="viewer-info-use-order" disabled={!valid} onClick={() => { if (valid) onUse(targets as AtomReference[]); }}><ArrowDownUp size={15} aria-hidden="true" />Use order</button>
  </>;
}
