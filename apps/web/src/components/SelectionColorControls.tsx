import { useState } from "react";
import type { ChangeSelectionAppearance, Entry, Selection } from "../api/types";

export function SelectionColorControls({ selection, entries, busy, onChange }: {
  selection: Selection;
  entries: Entry[];
  busy: boolean;
  onChange: ChangeSelectionAppearance;
}) {
  const [color, setColor] = useState("#3b82f6");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const byEntry = new Map(entries.map((entry) => [entry.id, entry]));
  const colors = new Set(selection.atoms.map((atom) => byEntry.get(atom.structure_id)
    ?.viewer_settings.selection_colors.find((item) => item.atom_ids.includes(atom.atom_id))
    ?.color ?? "Inherited"));
  const state = colors.size > 1 ? "Mixed" : [...colors][0] ?? "No selection";
  const run = async (reset: boolean) => {
    setPending(true);
    setMessage(null);
    setFailed(false);
    try {
      await onChange(reset ? { property: "color", action: "reset" }
        : { property: "color", action: "set", color });
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
        <label>Custom selection color<input type="color" value={color}
          disabled={unavailable} onChange={(event) => setColor(event.target.value)} /></label>
        <button className="secondary-button" type="submit" disabled={unavailable}>
          Apply color
        </button>
        <button className="secondary-button" type="button" disabled={unavailable}
          onClick={() => void run(true)}>Reset color</button>
      </form>
      {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
    </fieldset>
  );
}
