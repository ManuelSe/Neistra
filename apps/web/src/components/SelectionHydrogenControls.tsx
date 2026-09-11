import { useMemo, useState } from "react";
import type {
  ChangeSelectionAppearance, Entry, Selection, StructureProjection,
} from "../api/types";

export function SelectionHydrogenControls({ selection, entries, structures, loading = false, busy, onChange }: {
  selection: Selection;
  entries: Entry[];
  structures: ReadonlyMap<string, StructureProjection>;
  busy: boolean;
  loading?: boolean;
  onChange: ChangeSelectionAppearance;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const hydrogenIds = new Map([...structures].map(([id, projection]) => [id,
    new Set(projection.structure.atoms.filter((atom) => atom.element.trim().toUpperCase() === "H")
      .map((atom) => atom.id)),
  ]));
  const hydrogens = selection.atoms.filter((atom) => hydrogenIds.get(atom.structure_id)?.has(atom.atom_id));
  const byEntry = new Map(entries.map((entry) => [entry.id, entry]));
  const preferences = useMemo(() => new Map(entries.map((entry) => [entry.id,
    new Map(entry.viewer_settings.selection_nonpolar_hydrogens.flatMap((item) =>
      item.atom_ids.map((id) => [id, item.show] as const))),
  ])), [entries]);
  const states = new Set(hydrogens.map((atom) => {
    const show = preferences.get(atom.structure_id)?.get(atom.atom_id);
    return show === undefined ? "inherit" : show ? "show" : "hide";
  }));
  const state = states.size > 1 ? "mixed" : [...states][0] ?? "inherit";
  const hiddenByMaster = hydrogens.some((atom) => !byEntry.get(atom.structure_id)?.viewer_settings.components.hydrogens);
  const change = async (value: string) => {
    setPending(true);
    setMessage(null);
    setFailed(false);
    try {
      await onChange(value === "inherit" ? { property: "nonpolar_hydrogens", action: "reset" }
        : { property: "nonpolar_hydrogens", action: "set", show: value === "show" });
      setMessage("Selection hydrogen visibility stored.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Hydrogen visibility could not be changed.");
    } finally { setPending(false); }
  };
  return (
    <fieldset className="selection-style-group">
      <legend>Selection hydrogens</legend>
      <p className="selection-style-help" id="selection-hydrogen-help">
        {loading ? "Checking explicit hydrogen targets…" : `${hydrogens.length} explicit hydrogens selected.`} Only non-polar hydrogen visibility
        changes; selecting a heavy atom does not include its attached hydrogens.
        Entry visibility, Show hydrogens, components, and isolation still apply.
      </p>
      {!loading && !hydrogens.length ? <p>Select explicit hydrogen atoms, or a complete residue containing them.</p> : null}
      {hiddenByMaster ? <p>Show hydrogens is off for at least one selected entry. Local preferences are retained.</p> : null}
      <label>Selected non-polar hydrogens
        <select value={state} aria-describedby="selection-hydrogen-help"
          disabled={busy || pending || !hydrogens.length}
          onChange={(event) => void change(event.target.value)}>
          {state === "mixed" ? <option value="mixed" disabled>Mixed</option> : null}
          <option value="inherit">Use entry setting</option>
          <option value="show">Show</option>
          <option value="hide">Hide</option>
        </select>
      </label>
      {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
    </fieldset>
  );
}
