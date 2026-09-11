import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChangeSelectionAppearance, Entry, Selection } from "../api/types";

const SWATCHES = [
  ["Blue", "#3b82f6"], ["Cyan", "#06b6d4"], ["Green", "#22c55e"], ["Yellow", "#eab308"],
  ["Orange", "#f97316"], ["Red", "#ef4444"], ["Purple", "#a855f7"], ["Gray", "#94a3b8"],
] as const;

export function SelectionColorControls({ selection, entries, busy, onChange }: {
  selection: Selection; entries: Entry[]; busy: boolean; onChange: ChangeSelectionAppearance;
}) {
  const [mode, setMode] = useState<"all" | "carbon">("all");
  const [color, setColor] = useState("#3b82f6");
  const byEntry = useMemo(() => new Map(entries.map((entry) => [entry.id,
    new Map(entry.viewer_settings.selection_colors.flatMap((item) =>
      item.atom_ids.map((id) => [id, item.color === "element" ? "Element colors" : item.color] as const))),
  ])), [entries]);
  const colors = new Set(selection.atoms.map((atom) => byEntry.get(atom.structure_id)?.get(atom.atom_id) ?? "Inherited"));
  const state = colors.size > 1 ? "Mixed" : [...colors][0] ?? "No selection";
  const unavailable = busy || !selection.atoms.length;
  const apply = (value: string) => { void onChange({ property: "color", action: "set", color: value,
    ...(mode === "carbon" ? { color_mode: mode } : {}) }); };
  return <fieldset className="selection-style-group selection-colors"><legend>Color</legend>
    <div className="selection-section-heading"><span className="selection-color-state" aria-label={`Current color: ${state}`}>{state}</span>
      <button type="button" className="selection-reset" aria-label="Reset color" disabled={unavailable}
        onClick={() => void onChange({ property: "color", action: "reset" })}><RotateCcw size={13} aria-hidden="true" /> Reset</button>
    </div>
    <div role="group" aria-label="Coloring mode" className="selection-color-mode">
      <button type="button" aria-pressed={mode === "all"} disabled={unavailable} onClick={() => setMode("all")}>All atoms</button>
      <button type="button" aria-pressed={mode === "carbon"} disabled={unavailable} onClick={() => setMode("carbon")}>Carbon only</button>
    </div>
    <div className="selection-swatches" role="group" aria-label="Quick colors">
      {SWATCHES.map(([name, value]) => <button key={name} type="button" aria-label={`Apply ${name.toLowerCase()} color`}
        title={name} disabled={unavailable} onClick={() => apply(value)}>
        <span style={{ backgroundColor: value }} aria-hidden="true" />
      </button>)}
    </div>
    {mode === "carbon" ? <p className="selection-style-help">Other selected atoms use element colors.</p> : null}
    <details className="selection-help"><summary>Custom…</summary>
      <form className="selection-custom-color" onSubmit={(event) => { event.preventDefault(); apply(color); }}>
        <label>Custom selection color<input type="color" value={color} disabled={unavailable}
          onChange={(event) => setColor(event.target.value)} /></label>
        <button className="secondary-button" type="submit" disabled={unavailable}>Apply color</button>
      </form>
    </details>
  </fieldset>;
}
