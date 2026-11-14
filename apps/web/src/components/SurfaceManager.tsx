import * as Dialog from "@radix-ui/react-dialog";
import { Check, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AtomReference, Entry, StructureProjection, SurfaceActions, SurfaceAppearance, SurfaceObject } from "../api/types";
import type { SurfaceIdentity } from "../viewer/surface/objects";
import type { SurfaceStatus } from "../viewer/surface/runtime";
import { SurfaceEditor } from "./SurfaceEditor";
import { SurfaceCreateForm } from "./SurfaceCreateForm";
import { SurfaceHelp } from "./SurfaceHelp";
import { IconButton } from "./IconButton";
import { previewDisposition, surfaceObjectKey, type SurfaceCreationRequest, type SurfaceManagerSession } from "../surfaces/surfaceManagerSession";

interface Props {
  projectId: string;
  session: SurfaceManagerSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: Entry[];
  active: SurfaceIdentity | null;
  onActivate: (identity: SurfaceIdentity) => void;
  actions: SurfaceActions;
  statuses: SurfaceStatus[];
  selection?: AtomReference[];
  creationRequest?: SurfaceCreationRequest;
  onSelectAtoms?: (atoms: AtomReference[]) => void;
  loadSource?: (entryId: string) => Promise<StructureProjection>;
  loadPocketStructures?: () => Promise<Map<string, StructureProjection>>;
  onPreviewAppearance?: (identity: SurfaceIdentity, appearance: SurfaceAppearance | null) => void | Promise<void>;
  busy: boolean;
  autoFocus: boolean;
  onReturnFocus?: () => void;
  onCancel: (entryId: string, surface: SurfaceObject) => void;
  onRetry: (entryId: string, surface: SurfaceObject) => void;
}

export function SurfaceManager(props: Props) {
  const { entries, session, onPreviewAppearance } = props;
  const content = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false), closingWithFocus = useRef(false);
  const [creation, setCreation] = useState<SurfaceCreationRequest | null>(null);
  const [created, setCreated] = useState<SurfaceIdentity[]>([]);
  const alive = useRef(true);
  const focusCreated = useRef(false);
  const snapshot = useSyncExternalStore(props.session.subscribe, props.session.getSnapshot);
  const operationBusy = props.busy || snapshot.working;
  const busy = operationBusy || Object.values(snapshot.previews).some(preview => preview.phase !== "gesture");
  const current = useRef(props); current.current = props;
  const creationRef = useRef(creation); creationRef.current = creation;
  const activeKey = props.active ? surfaceObjectKey(props.active) : null;
  const entry = props.entries.find(item => item.id === props.active?.entryId);
  const surface = entry?.viewer_settings.surface_objects.find(item => item.id === props.active?.surfaceId);
  const createdKeys = new Set(created.map(surfaceObjectKey));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    for (const preview of session.reconcile(entries)) {
      try { void Promise.resolve(onPreviewAppearance?.(preview.identity, null)).catch(() => {}); } catch { /* The viewer may already be retired. */ }
    }
  }, [entries, session, onPreviewAppearance, snapshot.previews]);
  useEffect(() => { setCreation(null); }, [activeKey]);
  useEffect(() => { setCreation(props.creationRequest ?? null); }, [props.creationRequest]);
  useEffect(() => {
    if (!props.open || !created.length) return;
    for (const node of list.current?.querySelectorAll<HTMLElement>("[data-surface-key]") ?? []) {
      if (node.dataset.surfaceKey === surfaceObjectKey(created[0])) {
        node.scrollIntoView?.({ block: "nearest" });
        if (focusCreated.current) { node.querySelector<HTMLButtonElement>(".surface-object-label")?.focus(); focusCreated.current = false; }
        break;
      }
    }
  }, [created, props.entries, props.open]);
  const perform = async (operation: () => Promise<unknown>) => {
    if (props.session.projectId !== props.projectId || props.busy || props.session.getSnapshot().working) throw new Error("Finish the current surface change first.");
    props.session.setWorking(true); props.session.setFeedback(null);
    try { await operation(); } finally { props.session.setWorking(false); }
  };
  const reportChange = async (operation: () => Promise<unknown>, name: string) => {
    try { await perform(operation); return true; }
    catch (error) {
      const message = error instanceof Error ? error.message : "Surface change failed.";
      try {
        if (!props.actions.refresh) throw error;
        await props.actions.refresh();
        props.session.setFeedback({ text: `${name}: ${message} Current settings refreshed; check the object before retrying.`, failed: true });
      } catch {
        props.session.setFeedback({ text: `${name}: ${message} Could not confirm current settings. Check again before making another change.`, failed: true, recheck: true });
      }
      return false;
    }
  };
  const beginCreation = () => setCreation({ id: crypto.randomUUID(), selection: [...(props.selection ?? [])] });
  const activate = (identity: SurfaceIdentity) => { setCreation(null); props.onActivate(identity); };
  return <Dialog.Root modal={false} open={props.open} onOpenChange={open => {
    closingWithFocus.current = !open && Boolean(content.current?.contains(document.activeElement));
    if (!open) setCreation(null);
    props.onOpenChange(open);
  }}>
    <Dialog.Portal><Dialog.Content ref={content} className="dialog-content surface-manager" aria-describedby={undefined}
      onInteractOutside={event => event.preventDefault()}
      onEscapeKeyDown={event => {
        if (!content.current?.contains(document.activeElement)) event.preventDefault();
        else if (activeKey && session.getSnapshot().previews[activeKey]?.phase === "gesture") event.preventDefault();
        else restoreFocus.current = true;
      }}
      onOpenAutoFocus={event => {
        event.preventDefault(); closingWithFocus.current = false;
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        restoreFocus.current = props.autoFocus; if (props.autoFocus) content.current?.focus();
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (restoreFocus.current || closingWithFocus.current) {
          if (returnFocus.current?.isConnected && returnFocus.current !== document.body && !returnFocus.current.matches(":disabled")) returnFocus.current.focus();
          else props.onReturnFocus?.();
        }
      }}
      onFocusCapture={() => { restoreFocus.current = true; }}
      onBlurCapture={event => {
        if (event.relatedTarget instanceof HTMLElement && !content.current?.contains(event.relatedTarget)) restoreFocus.current = false;
      }}>
      <div className="dialog-heading surface-manager-header"><Dialog.Title>Surfaces</Dialog.Title>
        <div><IconButton label="Create surface" aria-disabled={busy} onClick={() => { if (!busy) beginCreation(); }}><Plus size={18} /></IconButton>
          <Dialog.Close asChild><IconButton label="Close surfaces"><X size={18} /></IconButton></Dialog.Close></div>
      </div>
      <div ref={list} className="surface-object-list" aria-label="Saved surface objects" aria-busy={busy}>
        {props.entries.filter(item => item.viewer_settings.surface_objects.length).map(owner => <section key={owner.id} aria-label={`Surfaces for ${owner.name}`}>
          <h3 className="surface-parent-name">{owner.name}{!owner.visible ? <span> · parent hidden</span> : null}</h3>
          {owner.viewer_settings.surface_objects.map(object => {
            const identity = { entryId: owner.id, surfaceId: object.id }, key = surfaceObjectKey(identity);
            const active = key === activeKey && !creation;
            const status = props.statuses.find(item => item.entryId === owner.id && item.surfaceId === object.id);
            const preview = snapshot.previews[key];
            const displayedAppearance = preview && previewDisposition(preview, owner, object) === "retain" ? preview.appearance : object.appearance;
            const text = !owner.visible ? "Parent hidden" : !object.visible ? "Hidden" : displayedAppearance.opacity === 0 ? "Opacity is zero" : status?.message ?? "Waiting for current structure";
            return <div key={object.id} className="surface-object" data-active={active || undefined} data-created={createdKeys.has(key) || undefined} data-surface-key={key}>
              <div className="surface-object-row">
                <button type="button" className="surface-object-label" aria-pressed={active} onClick={() => activate(identity)}>
                  <span className="surface-row-name">{active ? <Check size={14} aria-hidden="true" /> : null}<span>{object.name}</span></span>
                  <small>{object.source.kind === "entry" ? "Whole entry" : object.source.kind === "pocket" ? "Protein pocket" : "Captured fragment"}{snapshot.drafts[key] ? " · unapplied" : ""}</small>
                </button>
                <IconButton label={`${object.visible ? "Hide" : "Show"} surface ${object.name}`} aria-disabled={busy}
                  onClick={() => { if (!busy) void reportChange(() => props.actions.update(owner.id, object.id, { visible: !object.visible }), object.name); }}>
                  {object.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </IconButton>
                <IconButton label={`Remove surface ${object.name}`} aria-disabled={busy}
                  onClick={() => { if (!busy) void reportChange(() => props.actions.remove(owner.id, object.id), object.name); }}><Trash2 size={16} /></IconButton>
              </div>
              <p className="surface-object-status" data-state={status?.state} role="status">{text}</p>
              {status && ["queued", "rendering"].includes(status.state) ? <button type="button" aria-disabled={busy}
                onClick={() => { if (!busy) props.onCancel(owner.id, object); }}>Cancel calculation</button> : null}
              {status && ["cancelled", "fallback"].includes(status.state) ? <button type="button" aria-disabled={busy}
                onClick={() => { if (!busy) props.onRetry(owner.id, object); }}>Retry surface</button> : null}
            </div>;
          })}
        </section>)}
        {!props.entries.some(item => item.viewer_settings.surface_objects.length) ? <p>No saved surfaces. Choose Create surface to add one.</p> : null}
      </div>
      <div className="surface-manager-details" aria-label={creation ? "Create surface" : "Surface details"}>
        {creation ? <SurfaceCreateForm key={creation.id} request={creation} entries={props.entries} selection={props.selection ?? []}
          busy={busy} loadPocketStructures={props.loadPocketStructures} onCancel={() => setCreation(null)}
          onCreate={async items => {
            const origin = props.projectId, requestId = creation.id;
            const { create, refresh } = props.actions;
            let identities: SurfaceIdentity[] = [];
            try { await perform(async () => { identities = await create(items); }); }
            catch (failure) {
              const message = failure instanceof Error ? failure.message : "Surface creation could not be confirmed.";
              let refreshed = false;
              try { if (refresh) { await refresh(); refreshed = true; } } catch { /* Keep uncertainty visible without replaying creation. */ }
              const text = `${message} ${refreshed ? "Current surfaces refreshed." : "Current surfaces could not be confirmed."} Inspect saved surfaces before creating again.`;
              props.session.setFeedback({ text, failed: true, recheck: !refreshed });
              throw new Error(text);
            }
            if (!alive.current || current.current.projectId !== origin) return;
            focusCreated.current = creationRef.current?.id === requestId && Boolean(content.current?.querySelector(".surface-create-form")?.contains(document.activeElement));
            setCreated(identities);
            if (identities[0] && creationRef.current?.id === requestId) props.onActivate(identities[0]);
            setCreation(previous => previous?.id === requestId ? null : previous);
            props.session.setFeedback({ text: `${identities.length} ${identities.length === 1 ? "surface" : "surfaces"} created.`, failed: false });
          }} /> : entry && surface ? <div key={activeKey}>
          <SurfaceName surface={surface} busy={busy} onSave={name => reportChange(() => props.actions.update(entry.id, surface.id, { name }), surface.name)} />
          <SurfaceEditor projectId={props.projectId} session={props.session} entries={props.entries} entry={entry} surface={surface}
            busy={busy} selection={props.selection ?? []} load={props.loadSource} onSelect={props.onSelectAtoms}
            onPreviewAppearance={props.onPreviewAppearance} refresh={props.actions.refresh}
            onSave={change => perform(() => props.actions.update(entry.id, surface.id, change))} />
        </div> : <p>Select a surface to edit its appearance and source, or create a new surface.</p>}
        {snapshot.working ? <p className="surface-manager-feedback" role="status">Saving…</p> : null}
        {snapshot.feedback ? <div className="surface-manager-feedback">{!creation || !snapshot.feedback.failed ? <p role={snapshot.feedback.failed ? "alert" : "status"}>{snapshot.feedback.text}</p> : null}
          {snapshot.feedback.recheck && props.actions.refresh ? <button type="button" aria-disabled={operationBusy} onClick={() => {
            if (operationBusy) return;
            const refresh = props.actions.refresh!, previewCallback = props.onPreviewAppearance;
            void refresh().then(() => {
              for (const preview of Object.values(props.session.getSnapshot().previews)) {
                if (preview.phase === "uncertain" && props.session.clearPreview(preview.identity, preview.token)) {
                  try { void Promise.resolve(previewCallback?.(preview.identity, null)).catch(() => {}); } catch { /* Viewer may have been retired. */ }
                }
              }
              props.session.setFeedback({ text: "Current settings refreshed. Check the surface before retrying.", failed: false });
            }, () => props.session.setFeedback({ text: "Current settings are still unavailable. Check again when the connection recovers.", failed: true, recheck: true }));
          }}>Check again</button> : null}
        </div> : null}
        <details className="selection-help"><summary>Surface help</summary><SurfaceHelp /></details>
      </div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

function SurfaceName({ surface, busy, onSave }: { surface: SurfaceObject; busy: boolean; onSave: (name: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false), [name, setName] = useState(surface.name);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null), returnFocus = useRef(false);
  useEffect(() => { setName(surface.name); }, [surface.name]);
  useEffect(() => { if (editing) input.current?.focus(); else if (returnFocus.current) { trigger.current?.focus(); returnFocus.current = false; } }, [editing]);
  if (!editing) return <div className="surface-details-heading"><h3>{surface.name}</h3><IconButton ref={trigger} label={`Rename surface ${surface.name}`} aria-disabled={busy}
    onClick={() => { if (!busy) setEditing(true); }}><Pencil size={15} /></IconButton></div>;
  return <form className="surface-object-editor surface-name-form" onSubmit={event => {
    event.preventDefault(); if (busy || !name.trim() || name.trim() === surface.name) return;
    void onSave(name.trim()).then(saved => { if (saved) { returnFocus.current = true; setEditing(false); } });
  }}>
    <label>Name<input ref={input} aria-label="Surface name" value={name} maxLength={120} readOnly={busy} onChange={event => setName(event.target.value)} /></label>
    <button type="submit" aria-disabled={busy || !name.trim() || name.trim() === surface.name}>Save name</button>
    <button type="button" aria-disabled={busy} onClick={() => { if (!busy) { setName(surface.name); returnFocus.current = true; setEditing(false); } }}>Cancel rename</button>
  </form>;
}
