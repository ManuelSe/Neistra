import { useMemo, useState } from "react";
import type { ChangeSelectionAppearance, Entry, Selection } from "../api/types";

export function SelectionColorControls({ selection, entries, busy, onChange }: {
  selection: Selection;
  entries: Entry[];
  busy: boolean;
  onChange: ChangeSelectionAppearance;
}) {
  const [mode, setMode] = useState<"all" | "carbon">("all");
  const [color, setColor] = useState("#3b82f6");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const byEntry = useMemo(() => new Map(entries.map((entry) => [entry.id,
    new Map(entry.viewer_settings.selection_colors.flatMap((item) =>
      item.atom_ids.map((id) => [id, item.color === "element" ? "Element colors" : item.color] as const))),
  ])), [entries]);
  const colors = new Set(selection.atoms.map((atom) =>
    byEntry.get(atom.structure_id)?.get(atom.atom_id) ?? "Inherited"));
  const state = colors.size > 1 ? "Mixed" : [...colors][0] ?? "No selection";
  const run = async (reset: boolean) => {
    setPending(true);
    setMessage(null);
    setFailed(false);
    try {
      await onChange(reset ? { property: "color", action: "reset" }
        : { property: "color", action: "set", color, ...(mode === "carbon" ? { color_mode: mode } : {}) });
      setMessage(reset ? "Selection color reset." : "Selection color applied.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Selection color could not be changed.");
    } finally { setPending(false); }
  };
  const unavailable = busy || pending || !selection.atoms.length;
  return (
    <fieldset className="selection-style-group">
      <legend>Selection color</legend>
      <p>Current color: <span>{state}</span></p>
      <form className="selection-expansion-form" onSubmit={(event) => {
        event.preventDefault();
        void run(false);
      }}>
        <label>Coloring mode<select value={mode} disabled={unavailable}
          onChange={(event) => setMode(event.target.value as "all" | "carbon")}>
          <option value="all">All selected atoms</option>
          <option value="carbon">Carbon atoms only</option>
        </select></label>
        <label>Custom selection color<input type="color" value={color}
          disabled={unavailable} onChange={(event) => setColor(event.target.value)} /></label>
        <button className="secondary-button" type="submit" disabled={unavailable}>
          Apply color
        </button>
        <button className="secondary-button" type="button" disabled={unavailable}
          onClick={() => void run(true)}>Reset color</button>
      </form>
      {mode === "carbon" ? <p>Color selected carbon atoms; other selected atoms use element colors.
        Atoms outside the selection are unchanged.</p> : null}
      {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
    </fieldset>
  );
}
