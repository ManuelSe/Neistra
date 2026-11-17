import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronLeft, ChevronRight, CircleStop, Eye, EyeOff, Focus, ListOrdered, MousePointer2, RotateCcw, Ruler, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { AtomReference, Entry, Measurement, MeasurementKind, NormalizedStructure, Selection } from "../api/types";
import { formatMeasurement } from "../measurements/geometry";
import { atomInspection, inspectionOrderMatches, type SelectionGeometry } from "../selection/inspection";
import "./measurement-tool.css";

export interface MeasurementToolDraft {
  session: number;
  open: boolean;
  minimized?: boolean;
  kind: MeasurementKind;
  slots: readonly (AtomReference | null)[];
  activeSlot: number | null;
  name: string;
  saving: boolean;
  acquiring: boolean;
  notice: string | null;
}

export interface MeasurementToolProps {
  draft: MeasurementToolDraft;
  entries: readonly Entry[];
  structures: ReadonlyMap<string, NormalizedStructure>;
  selection: Selection;
  inspectionOrder: readonly AtomReference[] | null;
  paused: boolean;
  busy: boolean;
  value: number | null;
  unavailableReason: string | null;
  onClose: () => void;
  onCancelAcquisition: () => void;
  onKind: (kind: MeasurementKind) => void;
  onActiveSlot: (index: number) => void;
  onRemove: (index: number) => void;
  onChooseTarget: (reference: AtomReference) => boolean | void;
  onUseSelection: (references: AtomReference[]) => void;
  onName: (name: string) => void;
  onReset: () => void;
  onSave: () => void;
  onPickInViewer?: () => void;
  onReviewTargets?: () => void;
  measurements: readonly Measurement[];
  savedValues: ReadonlyMap<string, number | null>;
  expandedInspection: SelectionGeometry | null;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onUpdate: (measurement: Measurement, name: string, visible: boolean) => void;
  onDelete: (measurement: Measurement) => void;
  onSelectParticipants: (measurement: Measurement) => void;
  onFocusParticipants: (measurement: Measurement) => void;
  canFocus: (measurement: Measurement) => boolean;
  onLoadEntry: (entryId: string) => Promise<void>;
  onChooserEntryChange?: (entryId: string | null) => void;
  contactsOpen: boolean;
  onContactsOpenChange: (open: boolean) => void;
  contactsContent: ReactNode;
  onReturnFocus?: () => void;
}

const PAGE_SIZE = 50;
const KINDS: { kind: MeasurementKind; label: string; count: number }[] = [
  { kind: "distance", label: "Distance", count: 2 },
  { kind: "angle", label: "Angle", count: 3 },
  { kind: "dihedral", label: "Torsion", count: 4 },
];
const referenceKey = (reference: AtomReference) => JSON.stringify([reference.structure_id, reference.atom_id]);

function entryNames(entries: readonly Entry[]): ReadonlyMap<string, string> {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  return new Map(entries.map(entry => [entry.id, counts.get(entry.name)! > 1 ? `${entry.name} (${entry.id})` : entry.name]));
}

function targetLabel(reference: AtomReference, structures: ReadonlyMap<string, NormalizedStructure>, names: ReadonlyMap<string, string>) {
  const info = atomInspection(reference, structures, names);
  return info ? `${info.label}${info.alternateLocation ? ` · alternate ${info.alternateLocation}` : ""} · atom ${reference.atom_id}`
    : `${names.get(reference.structure_id) ?? reference.structure_id} · atom ${reference.atom_id} · unavailable`;
}

/** Controlled presentation. The application owns drafts, source validity and commands. */
export function MeasurementTool(props: MeasurementToolProps) {
  return <Dialog.Root open={props.draft.open} modal={false} onOpenChange={open => { if (!open) props.onClose(); }}>
    <Dialog.Portal>
      <ToolContent key={props.draft.session} {...props} />
    </Dialog.Portal>
  </Dialog.Root>;
}

function ToolContent(props: MeasurementToolProps) {
  const { draft } = props;
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const useSelection = useRef<HTMLButtonElement>(null);
  const reviewTargets = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const targetButtons = useRef(new Map<number, HTMLButtonElement>());
  const latestProps = useRef(props);
  latestProps.current = props;
  const minimized = Boolean(draft.minimized);
  const chooseTriggers = useRef(new Map<number, HTMLButtonElement>());
  const explicitClose = useRef(false);
  const [chooser, setChooser] = useState<number | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const names = entryNames(props.entries);
  const kind = KINDS.find(item => item.kind === draft.kind)!;
  const slots = Array.from({ length: kind.count }, (_, index) => draft.slots[index] ?? null);
  const filled = slots.filter((reference): reference is AtomReference => reference !== null);
  const exactTargets = filled.length === kind.count && new Set(filled.map(referenceKey)).size === kind.count;
  const disabled = props.busy || draft.saving || props.paused;
  const ready = exactTargets && !props.paused && props.value !== null && Number.isFinite(props.value);
  const chooserOpen = chooser !== null && chooser === draft.activeSlot;
  const selectionAvailable = props.selection.atoms.length === kind.count
    && new Set(props.selection.atoms.map(referenceKey)).size === kind.count;
  const selectionIdentity = selectionAvailable ? JSON.stringify(props.selection.atoms.map(referenceKey).sort()) : "";
  useLayoutEffect(() => { setOrdering(false); }, [selectionIdentity]);
  const nextSlot = draft.activeSlot ?? slots.findIndex(reference => reference === null);
  const progress = exactTargets ? "Targets ready" : draft.acquiring && nextSlot >= 0
    ? `Target ${nextSlot + 1} of ${kind.count}` : `Picking stopped · ${filled.length} of ${kind.count} targets`;
  const notice = [draft.notice ?? (props.paused ? "Measurements paused during preview." : ""), draft.saving ? "Save may finish after closing." : ""].filter(Boolean).join(" ");
  const readout = ready ? `${kind.label} ${formatMeasurement(draft.kind, props.value)}`
    : filled.length !== kind.count ? `${kind.label} · ${filled.length} of ${kind.count} targets`
      : `${kind.label} · Unavailable`;

  const position = useCallback(() => {
    const panel = content.current;
    if (!panel) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
    const dockAtBottom = minimized && (width <= 840 || height <= 600);
    const normalTop = Math.min(72, Math.max(8, height - 180));
    panel.style.setProperty("--measurement-left", `${left + Math.max(8, width - Math.min(380, width - 16) - 12)}px`);
    panel.style.setProperty("--measurement-width", `${Math.max(1, Math.min(380, width - 16))}px`);
    panel.style.setProperty("--measurement-height", `${Math.max(1, minimized ? height - 16 : height - normalTop - 8)}px`);
    panel.style.setProperty("--measurement-top", `${top + (dockAtBottom ? Math.max(8, height - panel.offsetHeight - 8) : normalTop)}px`);
  }, [minimized]);
  useLayoutEffect(() => {
    if (!draft.open) return;
    position();
    const observer = new ResizeObserver(position);
    if (content.current) observer.observe(content.current);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [draft.open, position]);

  const previousMinimized = useRef(minimized);
  useLayoutEffect(() => {
    if (minimized) {
      setChooser(null); setOrdering(false); setSavedOpen(false);
      latestProps.current.onChooserEntryChange?.(null);
      latestProps.current.onExpand(null);
      if (latestProps.current.contactsOpen) latestProps.current.onContactsOpenChange(false);
      (latestProps.current.onReviewTargets ? reviewTargets.current : heading.current)?.focus({ preventScroll: true });
    } else if (previousMinimized.current) {
      const current = latestProps.current;
      const focusTarget = current.busy || current.draft.saving || current.paused ? heading.current
        : current.draft.activeSlot !== null ? targetButtons.current.get(current.draft.activeSlot) ?? heading.current : nameInput.current ?? heading.current;
      if (content.current) content.current.scrollTop = 0;
      focusTarget?.focus({ preventScroll: true });
      focusTarget?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
    previousMinimized.current = minimized;
  }, [minimized]);

  const stopPicking = () => {
    setChooser(null); setOrdering(false); props.onChooserEntryChange?.(null);
    props.onCancelAcquisition();
    if (minimized) reviewTargets.current?.focus({ preventScroll: true });
  };

  const closeChooser = () => {
    const trigger = chooser === null ? null : chooseTriggers.current.get(chooser);
    setChooser(null);
    trigger?.focus({ preventScroll: true });
  };
  const close = () => { explicitClose.current = true; props.onClose(); };
  const useCurrentSelection = () => {
    if (disabled || !selectionAvailable) return;
    setChooser(null);
    if (draft.kind === "distance") props.onUseSelection(props.selection.atoms.map(reference => ({ ...reference })));
    else if (inspectionOrderMatches(props.selection.atoms, props.inspectionOrder)) {
      props.onUseSelection(props.inspectionOrder.map(reference => ({ ...reference })));
    } else setOrdering(true);
  };

  return <Dialog.Content ref={content} className={`dialog-content measurement-tool${minimized ? " measurement-tool-minimized" : ""}`}
    onOpenAutoFocus={event => { event.preventDefault(); position(); (minimized && props.onReviewTargets ? reviewTargets.current : heading.current)?.focus({ preventScroll: true }); }}
    onInteractOutside={event => { event.preventDefault(); }}
    onEscapeKeyDown={event => {
      event.preventDefault();
      if (chooserOpen) closeChooser();
      else if (ordering) { setOrdering(false); props.onChooserEntryChange?.(null); useSelection.current?.focus({ preventScroll: true }); }
      else if (draft.acquiring) stopPicking();
      else close();
    }}
    onCloseAutoFocus={event => {
      event.preventDefault();
      if (explicitClose.current) props.onReturnFocus?.();
    }}>
    <div className="measurement-tool-heading">
      <Dialog.Title ref={heading} tabIndex={-1}><Ruler size={17} aria-hidden="true" />Measurements</Dialog.Title>
      <div className="measurement-heading-actions">
        {minimized && draft.acquiring ? <button type="button" className="measurement-icon" aria-label="Stop picking" title="Stop picking" onClick={stopPicking}><CircleStop size={18} aria-hidden="true" /></button> : null}
        <button type="button" className="measurement-icon" aria-label="Close measurements" title="Close measurements" onClick={close}><X size={18} aria-hidden="true" /></button>
      </div>
    </div>
    {minimized ? <>
      <Dialog.Description className="measurement-compact-progress"><strong>{kind.label}</strong><span>{progress}</span></Dialog.Description>
      <button ref={reviewTargets} type="button" className="measurement-review-targets" disabled={!props.onReviewTargets} onClick={props.onReviewTargets}><ListOrdered size={16} aria-hidden="true" />Review targets</button>
    </> : <>
    <Dialog.Description className="measurement-secondary">Choose targets in the viewer or by name, then save.</Dialog.Description>
    <div className="measurement-kind-control" role="group" aria-label="Measurement kind">
      {KINDS.map(item => <button type="button" key={item.kind} aria-pressed={draft.kind === item.kind} disabled={disabled}
        onClick={() => { if (draft.kind !== item.kind) { setChooser(null); setOrdering(false); props.onKind(item.kind); } }}>{item.label}</button>)}
    </div>
    <p className="measurement-order-hint">{draft.kind === "angle" ? "Target 2 is the angle vertex." : draft.kind === "dihedral" ? "Signed torsion follows 1 → 2 → 3 → 4." : "Distance is independent of target order."}</p>
    {props.onPickInViewer ? <button type="button" className="measurement-pick-start" disabled={disabled} title="Keep this draft and pick atoms in the viewer" onClick={() => { setChooser(null); setOrdering(false); props.onPickInViewer?.(); }}><MousePointer2 size={15} aria-hidden="true" />Pick in viewer</button> : null}
    <ol className="measurement-targets" aria-label="Measurement targets">
      {slots.map((reference, index) => <li key={index} data-active={draft.acquiring && draft.activeSlot === index ? "true" : undefined}>
        <button type="button" className="measurement-target" aria-label={`Pick target ${index + 1}${draft.kind === "angle" && index === 1 ? ", angle vertex" : ""}`}
          ref={node => { if (node) targetButtons.current.set(index, node); else targetButtons.current.delete(index); }}
          aria-pressed={draft.acquiring && draft.activeSlot === index} aria-description={reference ? targetLabel(reference, props.structures, names) : "Choose an atom for this numbered target."} disabled={disabled} onClick={() => { setChooser(null); setOrdering(false); props.onActiveSlot(index); }}>
          <span className="measurement-target-number" aria-hidden="true">{index + 1}</span>
          <span><strong>Target {index + 1}{draft.kind === "angle" && index === 1 ? " · vertex" : ""}</strong>
            <span>{reference ? targetLabel(reference, props.structures, names) : "Pick an atom"}</span></span>
        </button>
        <button type="button" className="measurement-icon" aria-label={`Choose atom for target ${index + 1}`} title={`Choose atom for target ${index + 1}`} aria-expanded={chooserOpen && chooser === index}
          disabled={disabled} onClick={() => { props.onActiveSlot(index); setOrdering(false); setChooser(index); }}
          ref={node => { if (node) chooseTriggers.current.set(index, node); else chooseTriggers.current.delete(index); }}><ListOrdered size={17} aria-hidden="true" /></button>
        <button type="button" className="measurement-icon" aria-label={`Remove target ${index + 1}`} title={`Remove target ${index + 1}`} disabled={disabled || reference === null}
          onClick={() => { setChooser(null); props.onRemove(index); }}><X size={16} aria-hidden="true" /></button>
      </li>)}
    </ol>
    {chooserOpen ? <TargetChooser key={`${draft.session}:${chooser}`} entries={props.entries} structures={props.structures} names={names}
      initialEntry={slots[chooser]?.structure_id ?? ""} disabled={disabled} onLoadEntry={props.onLoadEntry} onEntryChange={props.onChooserEntryChange} onClose={closeChooser}
      onChoose={reference => { if (!disabled && chooser === draft.activeSlot) { if (props.onChooseTarget(reference) !== false) closeChooser(); } }} /> : null}
    <div className="measurement-draft-actions">
      <button ref={useSelection} type="button" disabled={disabled || !selectionAvailable} onClick={useCurrentSelection}><MousePointer2 size={15} aria-hidden="true" />Use selection</button>
      <button type="button" disabled={disabled} onClick={() => { setChooser(null); setOrdering(false); props.onReset(); }}><RotateCcw size={15} aria-hidden="true" />Reset</button>
      {draft.acquiring ? <button type="button" onClick={stopPicking}>Stop picking</button> : null}
    </div>
    {ordering && selectionAvailable ? <SelectionOrder key={`${draft.session}:${draft.kind}:${selectionIdentity}`} atoms={props.selection.atoms} structures={props.structures} names={names}
      kind={draft.kind} disabled={disabled || !selectionAvailable} onCancel={() => { setOrdering(false); props.onChooserEntryChange?.(null); useSelection.current?.focus({ preventScroll: true }); }}
      onUse={targets => { if (!disabled && selectionAvailable) { props.onUseSelection(targets); setOrdering(false); props.onChooserEntryChange?.(null); useSelection.current?.focus({ preventScroll: true }); } }} /> : null}
    <div className="measurement-readout" data-ready={ready ? "true" : "false"}>
      <span>{readout}</span>
      {!ready && props.unavailableReason ? <small>{props.unavailableReason}</small> : null}
    </div>
    <label className="measurement-name">Name<input ref={nameInput} aria-label="Measurement name" placeholder="Measurement name" maxLength={120} value={draft.name}
      disabled={disabled} onChange={event => props.onName(event.target.value)} /></label>
    <button type="button" className="measurement-save" disabled={disabled || !ready || !draft.name.trim()}
      onClick={props.onSave}><Save size={16} aria-hidden="true" />{draft.saving ? "Saving…" : "Save measurement"}</button>
    </>}
    <p className="measurement-notice" role="status" aria-live="polite" aria-atomic="true">{notice}</p>
    {!minimized ? <>
    <section className="measurement-disclosure">
      <button type="button" className="measurement-disclosure-trigger" aria-expanded={savedOpen} onClick={() => {
        setSavedOpen(!savedOpen); if (savedOpen) props.onExpand(null);
      }}>Saved measurements <span>{props.measurements.length}</span></button>
      {savedOpen ? <SavedMeasurements {...props} /> : null}
    </section>
    <section className="measurement-disclosure">
      <button type="button" className="measurement-disclosure-trigger" aria-expanded={props.contactsOpen}
        onClick={() => props.onContactsOpenChange(!props.contactsOpen)}>Close contacts</button>
      {props.contactsOpen ? <div className="measurement-contact-content">{props.contactsContent}</div> : null}
    </section>
    </> : null}
  </Dialog.Content>;
}

function Pagination({ page, total, label, onPage }: { page: number; total: number; label: string; onPage: (page: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  return pages > 1 ? <div className="measurement-pagination">
    <button type="button" className="measurement-icon" aria-label={`Previous ${label} page`} title={`Previous ${label} page`} disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={17} aria-hidden="true" /></button>
    <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
    <button type="button" className="measurement-icon" aria-label={`Next ${label} page`} title={`Next ${label} page`} disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={17} aria-hidden="true" /></button>
  </div> : null;
}

function TargetChooser({ entries, structures, names, initialEntry, disabled, onLoadEntry, onEntryChange, onChoose, onClose }: {
  entries: readonly Entry[]; structures: ReadonlyMap<string, NormalizedStructure>; names: ReadonlyMap<string, string>;
  initialEntry: string; disabled: boolean; onLoadEntry: (id: string) => Promise<void>; onEntryChange?: (id: string | null) => void; onChoose: (reference: AtomReference) => void; onClose: () => void;
}) {
  const [entryId, setEntryId] = useState(initialEntry);
  const [entrySearch, setEntrySearch] = useState("");
  const [atomSearch, setAtomSearch] = useState("");
  const [entryPage, setEntryPage] = useState(0), [atomPage, setAtomPage] = useState(0);
  const [load, setLoad] = useState<{ entry: string; phase: "loading" | "failed"; message?: string } | null>(null);
  const owner = useRef(0), mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const startLoad = (id: string) => {
    const requestOwner = ++owner.current;
    setLoad({ entry: id, phase: "loading" });
    void Promise.resolve().then(() => onLoadEntry(id)).then(() => {
      if (mounted.current && owner.current === requestOwner) setLoad(null);
    }).catch((error: unknown) => {
      if (mounted.current && owner.current === requestOwner) setLoad({ entry: id, phase: "failed", message: error instanceof Error ? error.message : "Atom information could not be loaded." });
    });
  };
  const chooseEntry = (id: string) => {
    owner.current++;
    setEntryId(id); setAtomSearch(""); setAtomPage(0); setLoad(null);
    if (!structures.has(id)) startLoad(id);
  };
  const currentEntry = entries.find(entry => entry.id === entryId && entry.current_artifact_id);
  const currentStructure = currentEntry ? structures.get(currentEntry.id) : undefined;
  const notifyEntry = useRef(onEntryChange);
  notifyEntry.current = onEntryChange;
  const currentEntryId = currentEntry?.id ?? null;
  useLayoutEffect(() => {
    notifyEntry.current?.(currentEntryId);
    return () => { notifyEntry.current?.(null); };
  }, [currentEntryId]);
  const search = entrySearch.trim().toLowerCase();
  const eligible = entries.filter(entry => entry.current_artifact_id && (!search || `${entry.name} ${entry.id}`.toLowerCase().includes(search)));
  const shownEntryPage = Math.min(entryPage, Math.max(0, Math.ceil(eligible.length / PAGE_SIZE) - 1));
  const atoms = currentStructure?.atoms ?? [];
  const atomQuery = atomSearch.trim().toLowerCase();
  const filteredAtoms = atomQuery ? atoms.filter(atom => `${atom.id} ${atom.name} ${atom.element}`.toLowerCase().includes(atomQuery)) : atoms;
  const shownAtomPage = Math.min(atomPage, Math.max(0, Math.ceil(filteredAtoms.length / PAGE_SIZE) - 1));
  return <section className="measurement-chooser" aria-label="Choose measurement atom">
    <div className="measurement-section-heading"><h3 ref={heading} tabIndex={-1}>Choose an atom</h3><button type="button" className="measurement-icon" aria-label="Close atom chooser" title="Close atom chooser" onClick={onClose}><X size={17} aria-hidden="true" /></button></div>
    {currentEntry ? <>
      <button type="button" className="measurement-chooser-back" onClick={() => { owner.current++; setEntryId(""); setLoad(null); }}>Choose another structure</button>
      <p className="measurement-secondary">{names.get(currentEntry.id)}</p>
      {currentStructure ? <>
        <label>Find atom<input aria-label="Find measurement atom" value={atomSearch} onChange={event => { setAtomSearch(event.target.value); setAtomPage(0); }} /></label>
        <ul className="measurement-choice-list" aria-label="Available measurement atoms">{filteredAtoms.slice(shownAtomPage * PAGE_SIZE, (shownAtomPage + 1) * PAGE_SIZE).map(atom => {
          const reference = { structure_id: currentEntry.id, atom_id: atom.id };
          return <li key={atom.id}><button type="button" disabled={disabled} onClick={() => onChoose(reference)}>{targetLabel(reference, structures, names)}</button></li>;
        })}</ul>
        {!filteredAtoms.length ? <p className="measurement-secondary">No matching atoms.</p> : null}
        <Pagination page={shownAtomPage} total={filteredAtoms.length} label="atom" onPage={setAtomPage} />
      </> : <div className="measurement-secondary">
        <p>{load?.entry === entryId ? load.phase === "loading" ? "Loading atoms…" : load.message : "Current atom information is not loaded."}</p>
        {load?.phase !== "loading" ? <button type="button" disabled={disabled} onClick={() => startLoad(entryId)}>{load?.phase === "failed" ? "Retry atom information" : "Load atoms"}</button> : null}
      </div>}
    </> : <>
      <label>Find structure<input aria-label="Find measurement structure" value={entrySearch} onChange={event => { setEntrySearch(event.target.value); setEntryPage(0); }} /></label>
      <ul className="measurement-choice-list" aria-label="Available measurement structures">{eligible.slice(shownEntryPage * PAGE_SIZE, (shownEntryPage + 1) * PAGE_SIZE).map(entry => <li key={entry.id}>
        <button type="button" disabled={disabled} onClick={() => chooseEntry(entry.id)}>{names.get(entry.id)}<small>{entry.visible ? "" : "Hidden"}{!entry.visible && entry.locked ? " · " : ""}{entry.locked ? "Locked" : ""}</small></button>
      </li>)}</ul>
      {!eligible.length ? <p className="measurement-secondary">No matching structures with a current artifact.</p> : null}
      <Pagination page={shownEntryPage} total={eligible.length} label="structure" onPage={setEntryPage} />
    </>}
  </section>;
}

function SelectionOrder({ atoms, structures, names, kind, disabled, onUse, onCancel }: {
  atoms: readonly AtomReference[]; structures: ReadonlyMap<string, NormalizedStructure>; names: ReadonlyMap<string, string>;
  kind: MeasurementKind; disabled: boolean; onUse: (targets: AtomReference[]) => void; onCancel: () => void;
}) {
  const [choices, setChoices] = useState<string[]>(() => atoms.map(() => ""));
  const firstSelect = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => { firstSelect.current?.focus({ preventScroll: true }); }, []);
  const targets = choices.map(key => atoms.find(reference => referenceKey(reference) === key));
  const valid = !disabled && choices.length === atoms.length && choices.every(Boolean)
    && new Set(choices).size === atoms.length && targets.every(reference => reference !== undefined);
  return <section className="measurement-chooser" aria-label="Confirm measurement order">
    <div className="measurement-section-heading"><h3>Order selected atoms</h3><button type="button" className="measurement-icon" aria-label="Cancel measurement order" title="Cancel measurement order" onClick={onCancel}><X size={17} aria-hidden="true" /></button></div>
    {atoms.map((_, index) => <label key={index}>Target {index + 1}{kind === "angle" && index === 1 ? " · vertex" : ""}
      <select ref={index === 0 ? firstSelect : undefined} aria-label={`Ordered target ${index + 1}${kind === "angle" && index === 1 ? ", angle vertex" : ""}`} value={choices[index]} disabled={disabled}
        onChange={event => setChoices(previous => previous.map((value, slot) => slot === index ? event.target.value : value))}>
        <option value="">Choose a selected atom</option>
        {atoms.map(reference => <option key={referenceKey(reference)} value={referenceKey(reference)}>{targetLabel(reference, structures, names)}</option>)}
      </select>
    </label>)}
    <button type="button" disabled={!valid} onClick={() => { if (valid) onUse(targets.map(reference => ({ ...reference }))); }}><Check size={16} aria-hidden="true" />Use target order</button>
  </section>;
}

function SavedMeasurements(props: MeasurementToolProps) {
  const [requestedPage, setPage] = useState(0);
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(props.measurements.length / PAGE_SIZE) - 1));
  const counts = new Map<string, number>();
  for (const measurement of props.measurements) counts.set(measurement.name, (counts.get(measurement.name) ?? 0) + 1);
  return <div className="measurement-saved">
    <ul aria-label="Saved measurements" className="measurement-saved-list">{props.measurements.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(measurement => {
      const label = counts.get(measurement.name)! > 1 ? `${measurement.name} (${measurement.id})` : measurement.name;
      const expanded = props.expandedId === measurement.id;
      return <li key={measurement.id} className="measurement-saved-row">
        <div className="measurement-saved-summary">
          <button type="button" aria-label={`Inspect measurement ${label}`} aria-expanded={expanded} onClick={() => props.onExpand(expanded ? null : measurement.id)}>
            <strong>{measurement.name}</strong><small>{KINDS.find(item => item.kind === measurement.kind)?.label} · {formatMeasurement(measurement.kind, props.paused ? null : props.savedValues.get(measurement.id) ?? null)}</small>
          </button>
          <button type="button" className="measurement-icon" aria-label={`${measurement.visible ? "Hide" : "Show"} ${label}`} title={`${measurement.visible ? "Hide" : "Show"} ${label}`} disabled={props.busy || props.draft.saving || props.paused}
            onClick={() => props.onUpdate(measurement, measurement.name, !measurement.visible)}>{measurement.visible ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}</button>
        </div>
        {expanded ? <SavedMeasurementActions key={measurement.id} {...props} measurement={measurement} label={label} /> : null}
      </li>;
    })}</ul>
    {!props.measurements.length ? <p className="measurement-secondary">No saved measurements.</p> : null}
    <Pagination page={page} total={props.measurements.length} label="saved measurement" onPage={next => { props.onExpand(null); setPage(next); }} />
  </div>;
}

function SavedMeasurementActions(props: MeasurementToolProps & { measurement: Measurement; label: string }) {
  const { measurement, label } = props;
  const [draft, setDraft] = useState({ baseline: measurement.name, name: measurement.name });
  const name = draft.baseline === measurement.name ? draft.name : measurement.name;
  const inspection = props.expandedInspection;
  const unavailableReason = props.paused ? "Geometry unavailable during preview."
    : inspection && inspection.status !== "ready" ? inspection.reason : undefined;
  return <div className="measurement-saved-actions" role="group" aria-label={`Actions for ${label}`}>
    {unavailableReason ? <p className="measurement-secondary">{unavailableReason}</p> : null}
    <label>Name<input aria-label={`Name for ${label}`} value={name} maxLength={120} disabled={props.busy || props.draft.saving || props.paused}
      onChange={event => setDraft({ baseline: measurement.name, name: event.target.value })} /></label>
    <button type="button" disabled={props.busy || props.draft.saving || props.paused || !name.trim() || name.trim() === measurement.name}
      onClick={() => props.onUpdate(measurement, name.trim(), measurement.visible)}><Save size={15} aria-hidden="true" />Save name</button>
    <div className="measurement-saved-secondary-actions">
      <button type="button" disabled={props.busy || props.draft.saving || props.paused} onClick={() => props.onSelectParticipants(measurement)}><MousePointer2 size={15} aria-hidden="true" />Select participants</button>
      <button type="button" disabled={props.paused || !props.canFocus(measurement)} onClick={() => props.onFocusParticipants(measurement)}><Focus size={15} aria-hidden="true" />Focus</button>
      <button type="button" className="measurement-icon" aria-label={`Delete measurement ${label}`} title={`Delete measurement ${label}`} disabled={props.busy || props.draft.saving || props.paused} onClick={() => props.onDelete(measurement)}><Trash2 size={17} aria-hidden="true" /></button>
    </div>
  </div>;
}
