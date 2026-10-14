import { useEffect, useRef, useState } from "react";
import type { AtomReference, Entry, StructureProjection, SurfaceAppearance, SurfaceChange, SurfaceObject } from "../api/types";
import { capturedFragmentSource, surfaceSourceAtoms } from "../selection/surfaceSources";

interface Props {
  entry: Entry;
  surface: SurfaceObject;
  selection: AtomReference[];
  busy: boolean;
  onSave: (change: SurfaceChange) => Promise<void>;
  onSelect?: (atoms: AtomReference[]) => void;
  load?: (entryId: string) => Promise<StructureProjection>;
}
const themes: [SurfaceAppearance["color_by"], string][] = [
  ["element", "Element"], ["chain", "Chain"], ["residue", "Residue"],
  ["secondary-structure", "Secondary structure"], ["structure", "Structure"], ["custom", "Uniform"],
];

export function SurfaceEditor({ entry, surface, selection, busy, onSave, onSelect, load }: Props) {
  const [appearance, setAppearance] = useState(surface.appearance);
  const [opacity, setOpacity] = useState(String(surface.appearance.opacity));
  const [radius, setRadius] = useState(surface.source.kind === "pocket" ? String(surface.source.radius) : "5");
  const [loaded, setLoaded] = useState<{ artifact: string | null; projection: StructureProjection }>();
  const [retry, setRetry] = useState(0);
  const projection = loaded?.artifact === entry.current_artifact_id ? loaded?.projection : undefined;
  const [inputError, setInputError] = useState<string | null>(null);
  const loader = useRef(load); loader.current = load;
  const pocket = surface.source.kind === "pocket";
  useEffect(() => { setAppearance(surface.appearance); setOpacity(String(surface.appearance.opacity)); }, [surface.appearance]);
  useEffect(() => { if (surface.source.kind === "pocket") setRadius(String(surface.source.radius)); }, [surface.source]);
  useEffect(() => {
    if (!pocket || !loader.current) return;
    let current = true; setLoaded(undefined); setInputError(null);
    void loader.current(entry.id).then(value => { if (current) setLoaded({ artifact: entry.current_artifact_id, projection: value }); })
      .catch(error => { if (current) setInputError(error instanceof Error ? error.message : "Protein context could not load."); });
    return () => { current = false; };
  }, [entry.id, entry.current_artifact_id, pocket, retry]);
  const sourceAtoms = surfaceSourceAtoms(entry, surface, projection);
  const count = sourceAtoms?.length;
  const scope = pocket ? "complete protein calculation context" : surface.source.kind === "fragment" ? "captured fragment" : "current entry";
  const validRadius = radius.trim() !== "" && Number.isFinite(Number(radius)) && Number(radius) >= 2 && Number(radius) <= 12 && Number.isInteger(Number(radius) * 2);
  const proteinAvailable = pocket && Boolean(count);
  const updateAppearance = (change: Partial<SurfaceAppearance>) => setAppearance(current => ({ ...current, ...change }));
  const saveFragment = () => {
    try { setInputError(null); void onSave({ source: capturedFragmentSource(entry, selection) }); }
    catch (error) { setInputError(error instanceof Error ? error.message : "Invalid captured fragment."); }
  };
  const replaceSeeds = () => {
    if (surface.source.kind !== "pocket" || !selection.length || !proteinAvailable || !validRadius) return;
    void onSave({ source: { ...surface.source, radius: Number(radius), seed_atom_references: [...selection].sort((a, b) => a.structure_id.localeCompare(b.structure_id) || a.atom_id - b.atom_id) } });
  };
  return <div className="surface-object-editor surface-details-editor">
    <form onSubmit={event => { event.preventDefault(); void onSave({ appearance: { ...appearance, opacity: Number(opacity) } }); }}>
      <fieldset disabled={busy}><legend>Surface appearance</legend>
        <label>Color scheme<select aria-label="Surface color scheme" value={appearance.color_by}
          onChange={event => updateAppearance({ color_by: event.target.value as SurfaceAppearance["color_by"], inherit_atom_colors: false })}>
          {themes.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>
        {appearance.color_by === "custom" ? <label>Uniform color<input aria-label="Surface uniform color" type="color" value={appearance.custom_color}
          onChange={event => updateAppearance({ custom_color: event.target.value, inherit_atom_colors: false })} /></label> : null}
        <label>Opacity<input aria-label="Surface opacity" type="number" min={0} max={1} step={0.05} value={opacity}
          onChange={event => setOpacity(event.target.value)} /></label>
        <label>Display<select aria-label="Surface display" value={appearance.mode}
          onChange={event => updateAppearance({ mode: event.target.value as SurfaceAppearance["mode"] })}>
          <option value="solid">Solid</option><option value="mesh">Mesh</option>
        </select></label>
        <label className="checkbox-row"><input type="checkbox" checked={appearance.inherit_atom_colors}
          onChange={event => updateAppearance({ inherit_atom_colors: event.target.checked })} />Inherit atom colors</label>
        <p className="surface-object-status">Choosing a theme uses independent surface colors. Inheritance applies saved atom color overrides.</p>
        <button type="submit" disabled={!opacity.trim() || !Number.isFinite(Number(opacity)) || Number(opacity) < 0 || Number(opacity) > 1 || JSON.stringify({ ...appearance, opacity: Number(opacity) }) === JSON.stringify(surface.appearance)}>Apply appearance</button>
      </fieldset>
    </form>
    <fieldset disabled={busy}><legend>Source</legend>
      <p>{count === undefined ? "Loading" : count.toLocaleString()} atoms · {scope}</p>
      <button type="button" disabled={!onSelect || !sourceAtoms?.length} onClick={() => sourceAtoms && onSelect?.(sourceAtoms)}>Select source atoms</button>
      {surface.source.kind === "fragment" ? <>
        <p>Replace this captured fragment with the current selection from {entry.name}. Other objects keep their sources.</p>
        <button type="button" disabled={!selection.length} onClick={saveFragment}>Replace fragment source</button>
      </> : null}
      {surface.source.kind === "pocket" ? <>
        <p>Receptor: {entry.name}. {surface.source.seed_atom_references.length.toLocaleString()} captured seeds. Seeds locate the crop; they are not surface membership.</p>
        <label>Radius (Å)<input aria-label="Surface pocket radius" type="number" min={2} max={12} step={0.5} value={radius} onChange={event => setRadius(event.target.value)} /></label>
        <button type="button" disabled={!proteinAvailable || !validRadius || Number(radius) === surface.source.radius}
          onClick={() => surface.source.kind === "pocket" && void onSave({ source: { ...surface.source, radius: Number(radius) } })}>Apply radius</button>
        <button type="button" disabled={!proteinAvailable || !validRadius || !selection.length} onClick={replaceSeeds}>Replace seeds from selection</button>
        {!proteinAvailable ? <p role="status">{!projection && !inputError && load ? "Loading protein context…" : "Protein context is unavailable. The saved definition can still be hidden or removed."}</p> : null}
        {inputError && load ? <button type="button" onClick={() => setRetry(value => value + 1)}>Retry source context</button> : null}
      </> : null}
    </fieldset>
    {inputError ? <p role="alert">{inputError}</p> : null}
  </div>;
}
