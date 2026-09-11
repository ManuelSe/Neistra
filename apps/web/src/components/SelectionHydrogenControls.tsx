import { useMemo } from "react";
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
  const change = (value: string) => void onChange(value === "inherit"
    ? { property: "nonpolar_hydrogens", action: "reset" }
    : { property: "nonpolar_hydrogens", action: "set", show: value === "show" });
  return (
    <fieldset className="selection-style-group selection-hydrogens">
      <legend>Hydrogens</legend>
      <label className="selection-hydrogen-row"><span>Non-polar H</span>
        <select value={state} aria-label="Selected non-polar hydrogens" aria-describedby="selection-hydrogen-help"
          disabled={busy || loading || !hydrogens.length}
          onChange={(event) => change(event.target.value)}>
          {state === "mixed" ? <option value="mixed" disabled>Mixed</option> : null}
          <option value="inherit">Use entry setting</option>
          <option value="show">Show</option>
          <option value="hide">Hide</option>
        </select>
      </label>
      {loading ? <p className="selection-style-help">Checking explicit hydrogen targets…</p> : null}
      {hiddenByMaster ? <p className="selection-style-help">Show hydrogens is off; local preferences are retained.</p> : null}
      <details className="selection-help"><summary>{!loading && !hydrogens.length ? "No selected hydrogens" : "Hydrogen help"}</summary>
        <p id="selection-hydrogen-help">{hydrogens.length} explicit hydrogens selected.
          Only non-polar hydrogen visibility changes; selecting a heavy atom does not include its attached hydrogens.
          Entry visibility, Show hydrogens, components, and isolation still apply.
          {!loading && !hydrogens.length ? " Select explicit hydrogen atoms, or a complete residue containing them." : ""}
        </p>
      </details>
    </fieldset>
  );
}
