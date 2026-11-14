import { useEffect, useRef, useState } from "react";
import type { AtomReference, Entry, StructureProjection, SurfaceCreateItem, SurfaceSource } from "../api/types";
import type { SurfaceCreationRequest } from "../surfaces/surfaceManagerSession";

interface Props {
  request: SurfaceCreationRequest;
  entries: readonly Entry[];
  selection: AtomReference[];
  busy: boolean;
  loadPocketStructures?: () => Promise<Map<string, StructureProjection>>;
  onCreate: (items: SurfaceCreateItem[]) => Promise<void>;
  onCancel: () => void;
}

export function SurfaceCreateForm({ request, entries, selection, busy, loadPocketStructures, onCreate, onCancel }: Props) {
  const [kind, setKind] = useState<SurfaceSource["kind"]>(request.kind ?? "fragment");
  const [entryId, setEntryId] = useState(request.entryId ?? (entries.length === 1 ? entries[0].id : ""));
  const [captured, setCaptured] = useState(() => [...request.selection]);
  const [radius, setRadius] = useState("5");
  const [projections, setProjections] = useState<Map<string, StructureProjection> | null>(null);
  const [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const unconfirmed = publicationError !== null;
  const form = useRef<HTMLFormElement>(null);
  const loader = useRef(loadPocketStructures); loader.current = loadPocketStructures;
  const latest = useRef(entries); latest.current = entries;
  const alive = useRef(true), pending = useRef(false);
  const context = JSON.stringify(entries.map(entry => [entry.id, entry.current_artifact_id]));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { form.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus(); }, []);
  useEffect(() => {
    if (kind !== "pocket") return;
    let current = true; setProjections(null); setError(null);
    if (!loader.current) { setError("Protein context is unavailable."); return; }
    void loader.current().then(value => {
      if (!current) return;
      setProjections(value);
      const eligible = latest.current.filter(entry => value.get(entry.id)?.hierarchy.components.some(component => component.category === "protein"));
      setEntryId(previous => eligible.some(entry => entry.id === previous) ? previous : eligible.length === 1 ? eligible[0].id : "");
    }).catch(failure => { if (current) setError(failure instanceof Error ? failure.message : "Protein context could not load."); });
    return () => { current = false; };
  }, [kind, context, retry]);
  const available = new Map(entries.map(entry => [entry.id, new Set(entry.atom_ids)]));
  const validCapture = captured.length > 0 && captured.every(atom => available.get(atom.structure_id)?.has(atom.atom_id));
  const eligible = kind === "pocket" ? entries.filter(entry => projections?.get(entry.id)?.hierarchy.components.some(component => component.category === "protein")) : entries;
  const owner = eligible.find(entry => entry.id === entryId);
  const validRadius = radius.trim() !== "" && Number.isFinite(Number(radius)) && Number(radius) >= 2 && Number(radius) <= 12 && Number.isInteger(Number(radius) * 2);
  const grouped = new Map<string, number[]>();
  for (const atom of captured) {
    const ids = grouped.get(atom.structure_id) ?? []; ids.push(atom.atom_id); grouped.set(atom.structure_id, ids);
  }
  let reason: string | null = null;
  if (!entries.length) reason = "Import a structure before creating a surface.";
  else if (kind === "pocket" && !projections) reason = error ?? "Loading protein context…";
  else if (kind === "pocket" && !eligible.length) reason = "No entry contains protein context.";
  else if (kind !== "fragment" && !owner) reason = kind === "pocket" ? "Choose a receptor." : "Choose an entry.";
  else if (kind !== "entry" && !validCapture) reason = "Capture a valid, nonempty selection.";
  else if (kind === "pocket" && !validRadius) reason = "Use a radius from 2 to 12 Å in 0.5 Å steps.";
  else if ((kind === "fragment" ? [...grouped.keys()] : [entryId]).some(id => (entries.find(entry => entry.id === id)?.viewer_settings.surface_objects.length ?? 0) >= 16)) reason = "An entry already has 16 surfaces. Remove one before creating another.";
  const submit = async () => {
    if (busy || pending.current || reason || unconfirmed) return;
    pending.current = true; setError(null);
    const items: SurfaceCreateItem[] = kind === "fragment" ? [...grouped].map(([entry_id, ids]) => ({ entry_id,
      source: { kind: "fragment", profile: "molecular-v1", atom_ids: [...new Set(ids)].sort((a, b) => a - b) } }))
      : [{ entry_id: entryId, source: kind === "entry" ? { kind: "entry" }
        : { kind: "pocket", profile: "pocket-v1", radius: Number(radius), seed_atom_references: [...captured] } }];
    try { await onCreate(items); }
    catch (failure) { if (alive.current) setPublicationError(failure instanceof Error ? failure.message : "Surface creation could not be confirmed. Check saved surfaces before retrying."); }
    finally { pending.current = false; }
  };
  return <form ref={form} className="surface-create-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h3>Create surface</h3>
    <div className="surface-source-choices" role="group" aria-label="Surface source">
      {([['fragment', 'Selected atoms'], ['pocket', 'Around selection'], ['entry', 'Whole entry']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={kind === value} aria-disabled={busy} onClick={() => { if (!busy) { setKind(value); setError(null); } }}>{label}</button>)}
    </div>
    <p className="surface-source-summary">{kind === "fragment" ? "A separate captured fragment for each selected entry." : kind === "pocket" ? "A complete protein-context patch around captured seeds." : "All current atoms in the chosen entry, subject to display filters."}</p>
    {kind !== "fragment" ? <label>{kind === "pocket" ? "Receptor" : "Entry"}<select aria-label={kind === "pocket" ? "Surface receptor" : "Surface entry"} value={entryId} aria-disabled={busy}
      onChange={event => { if (!busy) { setEntryId(event.target.value); setError(null); } }}>
      <option value="">{kind === "pocket" ? "Choose receptor" : "Choose entry"}</option>
      {eligible.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select></label> : null}
    {kind !== "entry" ? <div className="surface-captured-selection"><span>{captured.length.toLocaleString()} captured {kind === "pocket" ? "seed" : "atom"}{captured.length === 1 ? "" : "s"}{kind === "fragment" ? ` · ${grouped.size} ${grouped.size === 1 ? "entry" : "entries"}` : ""}</span>
      <button type="button" disabled={!selection.length} aria-disabled={busy} onClick={() => { if (!busy) { setCaptured([...selection]); setError(null); } }}>Use current selection</button>
    </div> : null}
    {kind === "pocket" ? <label>Radius (Å)<input aria-label="Surface creation radius" type="number" min={2} max={12} step={0.5} value={radius} readOnly={busy}
      onChange={event => setRadius(event.target.value)} /></label> : null}
    <div className="surface-create-actions"><button type="submit" disabled={reason !== null} aria-disabled={busy || unconfirmed}>Create {kind === "pocket" ? "pocket" : kind === "entry" ? "entry surface" : "fragment"}</button>
      <button type="button" aria-disabled={busy} onClick={() => { if (!busy) onCancel(); }}>Cancel creation</button></div>
    {reason ? <p role="status">{reason}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {publicationError ? <div className="surface-creation-uncertain"><p role="alert">{publicationError}</p>
      <p>Inspect saved surfaces before starting another creation.</p>
      <button type="button" aria-disabled={busy} onClick={() => { if (!busy) onCancel(); }}>Inspect saved surfaces</button>
    </div> : null}
    {kind === "pocket" && error && loadPocketStructures ? <button type="button" aria-disabled={busy} onClick={() => { if (!busy) setRetry(value => value + 1); }}>Retry protein context</button> : null}
  </form>;
}
