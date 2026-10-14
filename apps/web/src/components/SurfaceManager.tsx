import * as Dialog from "@radix-ui/react-dialog";
import { Eye, EyeOff, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AtomReference, Entry, StructureProjection, SurfaceActions, SurfaceObject } from "../api/types";
import type { SurfaceIdentity } from "../viewer/surface/objects";
import type { SurfaceStatus } from "../viewer/surface/runtime";
import { SurfaceEditor } from "./SurfaceEditor";
import { IconButton } from "./IconButton";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: Entry[];
  active: SurfaceIdentity | null;
  onActivate: (identity: SurfaceIdentity) => void;
  actions: SurfaceActions;
  statuses: SurfaceStatus[];
  selection?: AtomReference[];
  onSelectAtoms?: (atoms: AtomReference[]) => void;
  loadSource?: (entryId: string) => Promise<StructureProjection>;
  busy: boolean;
  autoFocus: boolean;
  onReturnFocus?: () => void;
  onCancel: (entryId: string, surface: SurfaceObject) => void;
  onRetry: (entryId: string, surface: SurfaceObject) => void;
}

export function SurfaceManager(props: Props) {
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const closingWithFocus = useRef(false);
  const pending = useRef(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = props.busy || working;
  const perform = async (operation: () => Promise<void>, name: string) => {
    if (disabled || pending.current) return;
    pending.current = true; setWorking(true); setError(null);
    if (content.current?.contains(document.activeElement)) content.current.focus();
    try { await operation(); }
    catch (failure) { setError(`${name}: ${failure instanceof Error ? failure.message : "Surface change failed."}`); }
    finally { pending.current = false; setWorking(false); }
  };
  return <Dialog.Root modal={false} open={props.open} onOpenChange={open => {
    closingWithFocus.current = !open && Boolean(content.current?.contains(document.activeElement));
    props.onOpenChange(open);
  }}>
    <Dialog.Portal><Dialog.Content ref={content} className="dialog-content surface-manager" aria-describedby={undefined}
      onInteractOutside={event => event.preventDefault()}
      onEscapeKeyDown={event => {
        if (!content.current?.contains(document.activeElement)) event.preventDefault();
        else restoreFocus.current = true;
      }}
      onOpenAutoFocus={event => {
        event.preventDefault();
        closingWithFocus.current = false;
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        restoreFocus.current = props.autoFocus;
        if (props.autoFocus) content.current?.focus();
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
      <div className="dialog-heading"><Dialog.Title>Surfaces</Dialog.Title>
        <Dialog.Close asChild><IconButton label="Close surfaces"><X size={18} /></IconButton></Dialog.Close>
      </div>
      <div className="surface-object-list" aria-label="Saved surface objects" aria-busy={disabled}>
        {props.entries.filter(entry => entry.viewer_settings.surface_objects.length).map(entry => <section key={entry.id} aria-label={`Surfaces for ${entry.name}`}>
          <h3 className="surface-parent-name">{entry.name}{!entry.visible ? <span> · parent hidden</span> : null}</h3>
          {entry.viewer_settings.surface_objects.map(surface => {
            const active = props.active?.entryId === entry.id && props.active.surfaceId === surface.id;
            const status = props.statuses.find(item => item.entryId === entry.id && item.surfaceId === surface.id);
            const text = !entry.visible ? "Parent hidden" : !surface.visible ? "Hidden" : surface.appearance.opacity === 0 ? "Opacity is zero" : status?.message ?? "Waiting for current structure";
            return <div key={surface.id} className="surface-object" data-active={active || undefined}>
              <div className="surface-object-row">
                <button type="button" className="surface-object-label" aria-pressed={active} disabled={disabled}
                  onClick={() => props.onActivate({ entryId: entry.id, surfaceId: surface.id })}>
                  <span>{surface.name}</span><small>{surface.source.kind === "entry" ? "Whole entry" : surface.source.kind === "pocket" ? "Protein pocket" : "Captured fragment"}</small>
                </button>
                <IconButton label={`${surface.visible ? "Hide" : "Show"} surface ${surface.name}`} disabled={disabled}
                  onClick={() => void perform(() => props.actions.update(entry.id, surface.id, { visible: !surface.visible }), surface.name)}>
                  {surface.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </IconButton>
                <IconButton label={`Remove surface ${surface.name}`} disabled={disabled}
                  onClick={() => void perform(() => props.actions.remove(entry.id, surface.id), surface.name)}><Trash2 size={16} /></IconButton>
              </div>
              <p className="surface-object-status" role="status">{text}</p>
              {status && ["queued", "rendering"].includes(status.state) && status.channel !== "entry" ? <button type="button" disabled={disabled}
                onClick={() => props.onCancel(entry.id, surface)}>Cancel calculation</button> : null}
              {status && ["cancelled", "fallback"].includes(status.state) ? <button type="button" disabled={disabled}
                onClick={() => props.onRetry(entry.id, surface)}>Retry surface</button> : null}
              {active ? <div key={`${entry.id}:${surface.id}`}>
                <SurfaceName surface={surface} busy={disabled}
                  onSave={name => perform(() => props.actions.update(entry.id, surface.id, { name }), surface.name)} />
                <SurfaceEditor entry={entry} surface={surface} busy={disabled} selection={props.selection ?? []}
                  load={props.loadSource} onSelect={props.onSelectAtoms}
                  onSave={change => perform(() => props.actions.update(entry.id, surface.id, change), surface.name)} />
              </div> : null}
            </div>;
          })}
        </section>)}
        {!props.entries.some(entry => entry.viewer_settings.surface_objects.length) ? <p>No saved surfaces. Create a fragment or protein pocket from Style selection, or add a whole-entry surface in Display.</p> : null}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <details className="selection-help"><summary>Surface help</summary>
        <p>Each object belongs to its named entry. Hide preserves its definition; Remove is undoable.
          Object selection leaves molecular atom selection and the camera unchanged.</p>
        <p>Fragments use only captured atoms and may have artificial cut faces. Protein pockets crop complete protein-context surfaces near captured seeds.
          These views do not measure cavities or establish binding significance.</p>
      </details>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

function SurfaceName({ surface, busy, onSave }: { surface: SurfaceObject; busy: boolean; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(surface.name);
  useEffect(() => { setName(surface.name); }, [surface.name]);
  return <form className="surface-object-editor" onSubmit={event => { event.preventDefault(); void onSave(name); }}>
    <label>Name<input aria-label="Surface name" value={name} maxLength={120} disabled={busy} onChange={event => setName(event.target.value)} /></label>
    <button type="submit" disabled={busy || !name.trim() || name.trim() === surface.name}>Rename</button>
  </form>;
}
