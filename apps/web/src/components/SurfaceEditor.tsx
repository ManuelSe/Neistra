import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent } from "react";
import type { AtomReference, Entry, StructureProjection, SurfaceAppearance, SurfaceChange, SurfaceObject } from "../api/types";
import type { SurfaceIdentity } from "../viewer/surface/objects";
import { capturedFragmentSource, surfaceSourceAtoms } from "../selection/surfaceSources";
import { draftSource, previewDisposition, sameAppearance, sourceDraftProblem, sourceFingerprint, surfaceObjectKey, type SurfaceManagerSession } from "../surfaces/surfaceManagerSession";

interface Props {
  projectId: string;
  session: SurfaceManagerSession;
  entries: readonly Entry[];
  entry: Entry;
  surface: SurfaceObject;
  selection: AtomReference[];
  busy: boolean;
  onSave: (change: SurfaceChange) => Promise<void>;
  onSelect?: (atoms: AtomReference[]) => void;
  load?: (entryId: string) => Promise<StructureProjection>;
  refresh?: () => Promise<readonly Entry[]>;
  onPreviewAppearance?: (identity: SurfaceIdentity, appearance: SurfaceAppearance | null) => void | Promise<void>;
}
const themes: [SurfaceAppearance["color_by"], string][] = [
  ["element", "Element"], ["chain", "Chain"], ["residue", "Residue"],
  ["secondary-structure", "Secondary structure"], ["structure", "Structure"], ["custom", "Uniform"],
];
const appearanceKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

export function SurfaceEditor(props: Props) {
  const { entry, surface, session } = props;
  const identity = useMemo(() => ({ entryId: entry.id, surfaceId: surface.id }), [entry.id, surface.id]);
  const key = surfaceObjectKey(identity);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const preview = snapshot.previews[key], draft = snapshot.drafts[key];
  const appearance = preview && previewDisposition(preview, entry, surface) === "retain" ? preview.appearance : surface.appearance;
  const blocked = props.busy || preview?.phase === "saving" || preview?.phase === "uncertain";
  const [opacityText, setOpacityText] = useState(String(appearance.opacity));
  const [inputError, setInputError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(Boolean(draft));
  const [loaded, setLoaded] = useState<{ artifact: string | null; projection: StructureProjection }>();
  const [retry, setRetry] = useState(0);
  const color = useRef<HTMLInputElement>(null);
  const opacityInput = useRef<HTMLInputElement>(null);
  const gesture = useRef<{ token: number; baseline: SurfaceAppearance; value: SurfaceAppearance } | null>(null);
  const retiredGesture = useRef(false);
  const latest = useRef(props); latest.current = props;
  const blockedRef = useRef(blocked); blockedRef.current = blocked;
  const commitRef = useRef<() => void>(() => {});
  const beginRef = useRef<(explicit?: boolean) => boolean>(() => false);
  const pocket = surface.source.kind === "pocket";
  const projection = loaded?.artifact === entry.current_artifact_id ? loaded.projection : undefined;
  const radiusText = draft?.radiusText ?? (surface.source.kind === "pocket" ? String(surface.source.radius) : "5");
  const sourceAtoms = surfaceSourceAtoms(entry, surface, projection);
  const sourceProblem = draft ? sourceDraftProblem(draft, props.entries) : null;
  const parsedDraft = draft ? draftSource(draft) : null;
  const draftCount = draft?.source.kind === "fragment" ? draft.source.atom_ids.length : draft?.source.kind === "pocket" ? draft.source.seed_atom_references.length : 0;
  const proteinAvailable = pocket && Boolean(sourceAtoms?.length);
  useEffect(() => {
    if (preview && (props.projectId !== session.projectId || previewDisposition(preview, entry, surface) !== "retain") && session.clearPreview(identity, preview.token)) {
      try { void Promise.resolve(latest.current.onPreviewAppearance?.(identity, null)).catch(() => {}); } catch { /* The viewer may already be retired. */ }
    }
    if (gesture.current && session.getSnapshot().previews[key]?.token !== gesture.current.token) {
      gesture.current = null; retiredGesture.current = true; setOpacityText(String(surface.appearance.opacity)); setInputError(null);
    }
  }, [session, identity, key, preview, entry, surface, props.projectId]);
  useEffect(() => { if (!gesture.current) setOpacityText(String(appearance.opacity)); }, [appearance.opacity]);
  useEffect(() => {
    if (!pocket || !sourceOpen || !latest.current.load) return;
    let current = true; setLoaded(undefined); setInputError(null);
    const load = latest.current.load;
    void load(entry.id).then(value => { if (current) setLoaded({ artifact: entry.current_artifact_id, projection: value }); })
      .catch(error => { if (current) setInputError(error instanceof Error ? error.message : "Protein context could not load."); });
    return () => { current = false; };
  }, [entry.id, entry.current_artifact_id, pocket, sourceOpen, retry]);
  const showPreview = (value: SurfaceAppearance | null, callback = latest.current.onPreviewAppearance) => {
    try {
      void Promise.resolve(callback?.(identity, value)).catch(error => session.setFeedback({ text: `Appearance preview: ${error instanceof Error ? error.message : "Preview unavailable."}`, failed: true }));
    } catch (error) { session.setFeedback({ text: `Appearance preview: ${error instanceof Error ? error.message : "Preview unavailable."}`, failed: true }); }
  };
  useEffect(() => () => {
    const current = gesture.current;
    if (current && session.clearPreview(identity, current.token)) {
      try { void Promise.resolve(latest.current.onPreviewAppearance?.(identity, null)).catch(() => {}); } catch { /* The viewer may already be retired. */ }
    }
  }, [session, identity]);

  const begin = (explicit = false) => {
    if (blockedRef.current || session.projectId !== props.projectId) return false;
    const pending = session.getSnapshot();
    if (pending.working || pending.previews[key] && pending.previews[key].phase !== "gesture") return false;
    if (explicit) retiredGesture.current = false;
    if (retiredGesture.current) return false;
    if (gesture.current) {
      const owner = session.getSnapshot().previews[key];
      if (!owner || owner.token !== gesture.current.token || previewDisposition(owner, latest.current.entry, latest.current.surface) !== "retain") { cancel(); return false; }
    }
    if (!gesture.current) {
      const baseline = { ...latest.current.surface.appearance };
      const token = session.beginPreview(identity, latest.current.entry, latest.current.surface);
      gesture.current = { token, baseline, value: baseline };
    }
    return true;
  };
  beginRef.current = begin;
  useEffect(() => {
    const node = opacityInput.current;
    if (!node) return;
    const beforeInput = (event: Event) => {
      const input = event as InputEvent;
      // Text insertion may have no keydown (paste, assistive input, browser fill).
      // A trailing range/spinner input alone cannot revive a retired gesture.
      if (input.inputType === "insertFromPaste" || input.inputType === "insertFromDrop"
        || input.data !== null && ["insertText", "insertReplacementText"].includes(input.inputType)) beginRef.current(true);
    };
    node.addEventListener("beforeinput", beforeInput);
    return () => node.removeEventListener("beforeinput", beforeInput);
  }, [identity]);
  const update = (change: Partial<SurfaceAppearance>) => {
    if (!begin()) return;
    const current = gesture.current!;
    current.value = { ...current.value, ...change };
    session.preview(identity, current.value, "gesture", current.token); showPreview(current.value);
  };
  const cancel = () => {
    const current = gesture.current; if (!current) return;
    gesture.current = null; retiredGesture.current = true;
    if (session.clearPreview(identity, current.token)) showPreview(null);
    setOpacityText(String(latest.current.surface.appearance.opacity)); setInputError(null);
  };
  const commit = async () => {
    const current = gesture.current;
    if (!current || blockedRef.current) return;
    const owner = session.getSnapshot().previews[key];
    if (!owner || owner.token !== current.token || previewDisposition(owner, latest.current.entry, latest.current.surface) !== "retain") { cancel(); return; }
    gesture.current = null;
    const { token, value, baseline } = current;
    if (sameAppearance(value, baseline)) { if (session.clearPreview(identity, token)) showPreview(null); return; }
    const { onSave, refresh, onPreviewAppearance } = latest.current;
    session.preview(identity, value, "saving", token);
    try { await onSave({ appearance: value }); }
    catch (failure) {
      const message = failure instanceof Error ? failure.message : "Appearance change failed.";
      try {
        if (!refresh) throw failure;
        const entries = await refresh();
        if (session.getSnapshot().previews[key]?.token !== token) return;
        const confirmed = entries.find(item => item.id === identity.entryId)?.viewer_settings.surface_objects.find(item => item.id === identity.surfaceId);
        if (session.clearPreview(identity, token)) showPreview(null, onPreviewAppearance);
        session.setFeedback({ text: confirmed && sameAppearance(confirmed.appearance, value)
          ? `${surface.name}: current appearance confirmed after refreshing.`
          : `${surface.name}: ${message} Current settings refreshed; check the appearance before retrying.`, failed: !confirmed || !sameAppearance(confirmed.appearance, value) });
      } catch {
        if (session.getSnapshot().previews[key]?.token === token) session.preview(identity, value, "uncertain", token);
        if (session.getSnapshot().previews[key]?.token === token) session.setFeedback({ text: `${surface.name}: ${message} Could not confirm whether the change saved. Check again before editing.`, failed: true, recheck: true });
      }
    }
  };
  commitRef.current = () => { void commit(); };
  useEffect(() => {
    const node = color.current;
    if (!node) return;
    // React normalizes color input events to onChange; native change identifies completion.
    const completed = () => commitRef.current();
    node.addEventListener("change", completed);
    return () => node.removeEventListener("change", completed);
  }, [appearance.color_by]);
  const immediate = (change: Partial<SurfaceAppearance>) => { if (blocked) return; if (!begin(true)) return; update(change); void commit(); };
  const applySource = async () => {
    if (blocked || !draft || !parsedDraft || sourceProblem || pocket && !proteinAvailable) return;
    const { onSave, refresh } = latest.current;
    try { await onSave({ source: parsedDraft }); session.acceptSource(identity, draft); }
    catch (failure) {
      const message = failure instanceof Error ? failure.message : "Source change failed.";
      try {
        if (!refresh) throw failure;
        const fresh = await refresh();
        const source = fresh.find(item => item.id === identity.entryId)?.viewer_settings.surface_objects.find(item => item.id === identity.surfaceId)?.source;
        if (source && sourceFingerprint(source) === sourceFingerprint(parsedDraft)) session.acceptSource(identity, draft);
        session.setFeedback({ text: `${surface.name}: ${message} Current sources refreshed; check the draft before retrying.`, failed: true });
      } catch { session.setFeedback({ text: `${surface.name}: ${message} Source publication is unconfirmed. Check again before retrying.`, failed: true, recheck: true }); }
    }
  };
  const recapture = () => {
    if (blocked) return;
    try {
      setInputError(null);
      if (surface.source.kind === "fragment") {
        session.stageSource(identity, surface.source, capturedFragmentSource(entry, props.selection), undefined, true);
      } else if (surface.source.kind === "pocket") {
        const available = new Map(props.entries.map(item => [item.id, new Set(item.atom_ids)]));
        if (!props.selection.length || props.selection.some(atom => !available.get(atom.structure_id)?.has(atom.atom_id))) throw new Error("Capture a valid, nonempty selection.");
        session.stageSource(identity, surface.source, { ...surface.source, seed_atom_references: [...props.selection]
          .sort((a, b) => a.structure_id.localeCompare(b.structure_id) || a.atom_id - b.atom_id) }, radiusText, true);
      }
    } catch (error) { setInputError(error instanceof Error ? error.message : "Invalid captured selection."); }
  };
  const escapeGesture = (event: KeyboardEvent) => {
    if (event.key === "Escape" && gesture.current) { event.preventDefault(); event.stopPropagation(); cancel(); }
  };
  const finishOnBlur = (event: FocusEvent, invalid = false) => {
    const target = event.relatedTarget;
    if (invalid || target instanceof Element && target.closest('.surface-object-label, [aria-label="Close surfaces"], [aria-label="Create surface"]')) cancel();
    else void commit();
  };
  return <div className="surface-object-editor surface-details-editor">
    <fieldset aria-disabled={blocked}><legend>Appearance</legend>
      <label>Color scheme<select aria-label="Surface color scheme" value={appearance.color_by} aria-disabled={blocked}
        onChange={event => immediate({ color_by: event.target.value as SurfaceAppearance["color_by"], inherit_atom_colors: false })}>
        {themes.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select></label>
      {appearance.color_by === "custom" ? <label>Uniform color<input ref={color} aria-label="Surface uniform color" type="color" value={appearance.custom_color} aria-disabled={blocked}
        onPointerDown={() => begin(true)}
        onChange={() => {}} onInput={event => update({ custom_color: event.currentTarget.value, inherit_atom_colors: false })}
        onBlur={event => finishOnBlur(event)} onKeyDown={event => { escapeGesture(event); if (event.key !== "Escape") begin(true); }} /></label> : null}
      <label>Opacity<span className="surface-opacity-controls">
        <input aria-label="Surface opacity slider" type="range" min={0} max={1} step={0.05} value={appearance.opacity} aria-disabled={blocked}
          onPointerDown={() => begin(true)} onChange={event => { update({ opacity: Number(event.target.value) }); if (!retiredGesture.current) setOpacityText(event.target.value); }}
          onPointerUp={() => { void commit(); }} onPointerCancel={cancel}
          onKeyDown={event => { escapeGesture(event); if (appearanceKeys.has(event.key)) begin(true); }}
          onKeyUp={event => { if (appearanceKeys.has(event.key)) void commit(); }} onBlur={event => finishOnBlur(event)} />
        <input ref={opacityInput} aria-label="Surface opacity" type="number" min={0} max={1} step={0.05} value={opacityText} readOnly={blocked}
          onFocus={() => begin(true)} onPointerDown={() => begin(true)} onPaste={() => begin(true)}
          onPointerUp={() => { void commit(); }} onPointerCancel={cancel}
          onChange={event => {
            if (blocked) return;
            if (retiredGesture.current) { setOpacityText(String(latest.current.surface.appearance.opacity)); return; }
            const text = event.target.value; setOpacityText(text);
            const value = Number(text);
            if (text.trim() && Number.isFinite(value) && value >= 0 && value <= 1) { setInputError(null); update({ opacity: value }); }
            else setInputError("Opacity must be between 0 and 1.");
          }}
          onKeyDown={event => { escapeGesture(event); if (event.key === "Enter") { event.preventDefault(); if (!inputError) void commit(); } else if (event.key !== "Escape") begin(true); }}
          onKeyUp={event => { if (appearanceKeys.has(event.key)) void commit(); }}
          onBlur={event => finishOnBlur(event, Boolean(inputError))} />
      </span></label>
      <label>Display<select aria-label="Surface display" value={appearance.mode} aria-disabled={blocked}
        onChange={event => immediate({ mode: event.target.value as SurfaceAppearance["mode"] })}>
        <option value="solid">Solid</option><option value="mesh">Mesh</option>
      </select></label>
      <details className="selection-help"><summary>Advanced appearance</summary>
        <label className="checkbox-row"><input type="checkbox" checked={appearance.inherit_atom_colors} aria-disabled={blocked}
          onChange={event => immediate({ inherit_atom_colors: event.target.checked })} />Inherit atom colors</label>
        <p>Choosing a theme uses independent surface colors. Inheritance applies saved atom color overrides.</p>
      </details>
    </fieldset>
    <details className="surface-source-details" open={sourceOpen} onToggle={event => setSourceOpen(event.currentTarget.open)}>
      <summary>Source{draft ? <span className="surface-unapplied"> · Unapplied changes</span> : null}</summary>
      <fieldset aria-disabled={blocked}><legend>{pocket ? "Protein context" : surface.source.kind === "fragment" ? "Captured fragment" : "Current entry"}</legend>
        <p>{sourceAtoms ? sourceAtoms.length.toLocaleString() : "Loading"} atoms · {pocket ? "complete protein calculation context" : surface.source.kind === "fragment" ? "captured fragment" : "current entry"}</p>
        <button type="button" disabled={!props.onSelect || !sourceAtoms?.length} onClick={() => sourceAtoms && props.onSelect?.(sourceAtoms)}>{pocket ? "Select protein context" : "Select source atoms"}</button>
        {surface.source.kind === "pocket" ? <>
          <p>{surface.source.seed_atom_references.length} saved seed{surface.source.seed_atom_references.length === 1 ? "" : "s"} · receptor {entry.name}</p>
          <button type="button" disabled={!props.onSelect} onClick={() => surface.source.kind === "pocket" && props.onSelect?.(surface.source.seed_atom_references)}>Select seeds</button>
          <label>Radius (Å)<input aria-label="Surface pocket radius" type="number" min={2} max={12} step={0.5} value={radiusText} readOnly={blocked}
            onChange={event => { if (!blocked) session.stageSource(identity, surface.source, draft?.source ?? surface.source, event.target.value); }} /></label>
          {!proteinAvailable ? <p role="status">{!projection && !inputError && props.load ? "Loading protein context…" : "Protein context is unavailable. The saved definition can still be hidden or removed."}</p> : null}
          {inputError && props.load ? <button type="button" aria-disabled={blocked} onClick={() => { if (!blocked) setRetry(value => value + 1); }}>Retry source context</button> : null}
        </> : null}
        {surface.source.kind !== "entry" ? <>
          <button type="button" disabled={!props.selection.length} aria-disabled={blocked} onClick={recapture}>{surface.source.kind === "pocket" ? "Capture seeds from selection" : "Capture fragment from selection"}</button>
          {draft ? <p>{draftCount} captured {surface.source.kind === "pocket" ? "seed" : "atom"}{draftCount === 1 ? "" : "s"} in draft</p> : null}
          <div className="surface-source-actions"><button type="button" aria-disabled={blocked || !draft || Boolean(sourceProblem) || pocket && !proteinAvailable} onClick={() => { void applySource(); }}>Apply source</button>
            <button type="button" aria-disabled={blocked || !draft} onClick={() => { if (!blocked && draft) { session.revertSource(identity); setInputError(null); } }}>Revert</button></div>
        </> : null}
        {sourceProblem ? <p role="alert">{sourceProblem}</p> : null}
      </fieldset>
    </details>
    {inputError ? <p role="alert">{inputError}</p> : null}
  </div>;
}
